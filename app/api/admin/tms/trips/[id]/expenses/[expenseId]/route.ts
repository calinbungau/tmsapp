import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/**
 * Per-expense PATCH / DELETE — now operates on cost_entries (the legacy
 * trip_expenses table is being retired). Provider-imported rows
 * (provider_id IS NOT NULL) are rejected because their source of truth is
 * the supplier file; the UI already hides edit/delete on those.
 */
function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** Whitelisted fields an admin can patch on a cost_entries row. */
const PATCH_MAP: Record<string, string> = {
  category: "category",
  cost_catalog_id: "cost_catalog_id",
  description: "description",
  amount: "amount",
  currency: "currency",
  tax_rate: "tax_rate",
  tax_amount: "tax_amount",
  amount_excl_vat: "amount_excl_vat",
  amount_incl_vat: "amount_incl_vat",
  occurred_at: "occurred_at",
  // Legacy field names from the trip_expenses-era UI → cost_entries column names.
  country: "country_code",
  vendor: "vendor_name",
  receipt_url: "receipt_url",
  latitude: "latitude",
  longitude: "longitude",
  location_label: "location_label",
  unit: null as unknown as string, // handled below (quantity+unit → liters/units)
  status: "status",
  notes: "notes",
  rejected_reason: "dispute_reason",
}

const ALLOWED_STATUSES = new Set(["draft", "pending_review", "approved", "rejected", "posted", "paid"])

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; expenseId: string }> },
) {
  const { id: tripId, expenseId } = await context.params
  const body = await req.json().catch(() => ({}))

  console.log("[v0] /expenses PATCH:", { tripId, expenseId, fields: Object.keys(body), status: body.status })

  if (body.status && !ALLOWED_STATUSES.has(body.status)) {
    return NextResponse.json({ error: `Invalid status '${body.status}'` }, { status: 400 })
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  const supabase = serviceClient()

  // Reject edits on provider-imported rows.
  const { data: existing, error: readErr } = await supabase
    .from("cost_entries")
    .select("id, trip_id, trip_leg_id, provider_id, category, amount, currency, vendor_name")
    .eq("id", expenseId)
    .eq("trip_id", tripId)
    .maybeSingle()
  if (readErr || !existing) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 })
  }
  if (existing.provider_id) {
    return NextResponse.json({ error: "Provider-imported costs are read-only" }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  for (const [k, col] of Object.entries(PATCH_MAP)) {
    if (k in body && col) update[col] = body[k]
  }
  // Quantity + unit → liters_qty / units_qty
  if ("quantity" in body) {
    const q = body.quantity == null ? null : Number(body.quantity)
    const isLiters = (body.unit ?? "").toString().toLowerCase().startsWith("l")
    const isFuelish = (body.category ?? existing.category) === "fuel" || (body.category ?? existing.category) === "ad_blue"
    if (isLiters || isFuelish) {
      update.liters_qty = q
      update.units_qty = null
    } else {
      update.units_qty = q
      update.liters_qty = null
    }
  }
  // Stamp approver fields on approve/reject.
  if (body.status === "approved" || body.status === "rejected") {
    update.approved_by = user?.id ?? null
    update.approved_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from("cost_entries")
    .update(update)
    .eq("id", expenseId)
    .eq("trip_id", tripId)
    .select("id, trip_id, trip_leg_id, category, amount, currency, vendor_name")
    .single()

  if (error) {
    console.log("[v0] /expenses PATCH failed:", error.message, error.code)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (body.status === "approved" || body.status === "rejected") {
    await supabase.from("trip_events").insert({
      trip_id: tripId,
      leg_id: data.trip_leg_id,
      event_type: body.status === "approved" ? "expense_approved" : "expense_rejected",
      severity: body.status === "approved" ? "success" : "warning",
      title: `${data.category ?? "expense"} ${data.amount} ${data.currency} ${body.status}`,
      description: body.rejected_reason ?? null,
      metadata: { expense_id: data.id, vendor: data.vendor_name },
      actor_type: "admin",
      actor_id: user?.id ?? null,
    })
  }

  return NextResponse.json({ expense: data })
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; expenseId: string }> },
) {
  const { id: tripId, expenseId } = await context.params
  console.log("[v0] /expenses DELETE:", { tripId, expenseId })

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  const supabase = serviceClient()

  const { data: expense, error: readErr } = await supabase
    .from("cost_entries")
    .select("id, trip_leg_id, category, amount, currency, vendor_name, receipt_url, provider_id")
    .eq("id", expenseId)
    .eq("trip_id", tripId)
    .maybeSingle()
  if (readErr || !expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 })
  }
  if (expense.provider_id) {
    return NextResponse.json({ error: "Provider-imported costs cannot be deleted from the trip; detach them instead" }, { status: 400 })
  }

  const { error } = await supabase
    .from("cost_entries")
    .delete()
    .eq("id", expenseId)
    .eq("trip_id", tripId)

  if (error) {
    console.log("[v0] /expenses DELETE failed:", error.message, error.code)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await supabase.from("trip_events").insert({
    trip_id: tripId,
    leg_id: expense.trip_leg_id,
    event_type: "expense_deleted",
    severity: "info",
    title: `${expense.category ?? "expense"} ${expense.amount} ${expense.currency} deleted`,
    metadata: {
      expense_id: expense.id,
      vendor: expense.vendor_name,
      receipt_url: expense.receipt_url,
    },
    actor_type: "admin",
    actor_id: user?.id ?? null,
  })

  return NextResponse.json({ ok: true })
}
