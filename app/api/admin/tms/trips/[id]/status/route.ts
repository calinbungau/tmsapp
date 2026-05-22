import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const STATUS_ORDER = [
  "draft",
  "planned",
  "dispatched",
  "in_progress",
  "completed",
  "cancelled",
] as const
type TripStatus = (typeof STATUS_ORDER)[number]

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await context.params
  const supabase = await createClient()
  const body = await req.json()
  const { data: { user } } = await supabase.auth.getUser()

  const newStatus = body.status as TripStatus
  if (!STATUS_ORDER.includes(newStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  const { data: current, error: currentErr } = await supabase
    .from("trips")
    .select("id, status, planned_start, actual_start, actual_end")
    .eq("id", tripId)
    .single()
  if (currentErr || !current) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 })
  }

  const update: Record<string, unknown> = { status: newStatus }
  if (newStatus === "in_progress" && !current.actual_start) {
    update.actual_start = new Date().toISOString()
  }
  if (newStatus === "completed" && !current.actual_end) {
    update.actual_end = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from("trips")
    .update(update)
    .eq("id", tripId)
    .select()
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await supabase.from("trip_events").insert({
    trip_id: tripId,
    event_type: "status_change",
    severity: newStatus === "cancelled" ? "warning" : "success",
    title: `Status: ${current.status ?? "—"} → ${newStatus}`,
    description: body.note ?? null,
    metadata: { from: current.status, to: newStatus },
    actor_type: "admin",
    actor_id: user?.id ?? null,
  })

  return NextResponse.json({ trip: data })
}
