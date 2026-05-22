import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/**
 * Service-role client. Same convention as the parent /expenses route — RLS on
 * trip_expenses is `authenticated/true/true` but cookie propagation to nested
 * dynamic routes was unreliable, so we use the service-role for admin writes.
 */
function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** Whitelisted fields that may be patched by an admin. */
const PATCHABLE_FIELDS = [
  "category",
  "cost_catalog_id",
  "description",
  "amount",
  "currency",
  // amount_eur intentionally omitted: trip_expenses' BEFORE FX trigger owns it.
  // Sending a stale amount_eur here would just be overwritten anyway.
  "tax_rate",
  "tax_amount",
  "amount_excl_vat",
  "amount_incl_vat",
  "occurred_at",
  "country",
  "vendor",
  "receipt_url",
  "latitude",
  "longitude",
  "location_label",
  "quantity",
  "unit",
  "status",
  "notes",
  "rejected_reason",
] as const

const ALLOWED_STATUSES = new Set(["recorded", "pending_review", "approved", "rejected"])

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; expenseId: string }> }
) {
  const { id: tripId, expenseId } = await context.params
  const body = await req.json().catch(() => ({}))

  console.log("[v0] /expenses PATCH:", {
    tripId,
    expenseId,
    fields: Object.keys(body),
    status: body.status,
  })

  if (body.status && !ALLOWED_STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: `Invalid status '${body.status}'` },
      { status: 400 }
    )
  }

  // Cookie client is used ONLY to identify the actor (for approved_by / actor_id).
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  const supabase = serviceClient()

  // Whitelist + audit stamps
  const update: Record<string, unknown> = {}
  for (const f of PATCHABLE_FIELDS) {
    if (f in body) update[f] = body[f]
  }
  if (body.status === "approved" || body.status === "rejected") {
    update.approved_by = user?.id ?? null
    update.approved_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from("trip_expenses")
    .update(update)
    .eq("id", expenseId)
    .eq("trip_id", tripId) // tenant-safety
    .select()
    .single()

  if (error) {
    console.log("[v0] /expenses PATCH failed:", error.message, error.code)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Audit event — best-effort, never blocks
  if (body.status === "approved" || body.status === "rejected") {
    await supabase.from("trip_events").insert({
      trip_id: tripId,
      leg_id: data.leg_id,
      event_type: body.status === "approved" ? "expense_approved" : "expense_rejected",
      severity: body.status === "approved" ? "success" : "warning",
      title: `${data.category} ${data.amount} ${data.currency} ${body.status}`,
      description: body.rejected_reason ?? null,
      metadata: { expense_id: data.id, vendor: data.vendor },
      actor_type: "admin",
      actor_id: user?.id ?? null,
    })
  }

  return NextResponse.json({ expense: data })
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; expenseId: string }> }
) {
  const { id: tripId, expenseId } = await context.params

  console.log("[v0] /expenses DELETE:", { tripId, expenseId })

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  const supabase = serviceClient()

  // Read first so the audit event can carry context after the row is gone
  const { data: expense, error: readErr } = await supabase
    .from("trip_expenses")
    .select("id, leg_id, category, amount, currency, vendor, receipt_url")
    .eq("id", expenseId)
    .eq("trip_id", tripId)
    .single()

  if (readErr || !expense) {
    console.log("[v0] /expenses DELETE: row not found", readErr?.message)
    return NextResponse.json({ error: "Expense not found" }, { status: 404 })
  }

  const { error } = await supabase
    .from("trip_expenses")
    .delete()
    .eq("id", expenseId)
    .eq("trip_id", tripId)

  if (error) {
    console.log("[v0] /expenses DELETE failed:", error.message, error.code)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await supabase.from("trip_events").insert({
    trip_id: tripId,
    leg_id: expense.leg_id,
    event_type: "expense_deleted",
    severity: "info",
    title: `${expense.category} ${expense.amount} ${expense.currency} deleted`,
    metadata: {
      expense_id: expense.id,
      vendor: expense.vendor,
      receipt_url: expense.receipt_url,
    },
    actor_type: "admin",
    actor_id: user?.id ?? null,
  })

  return NextResponse.json({ ok: true })
}
