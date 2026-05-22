import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await context.params
  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("trip_events")
    .select("*")
    .eq("trip_id", tripId)
    .order("occurred_at", { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ events: data ?? [] })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await context.params
  const supabase = await createClient()
  const body = await req.json()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("trip_events")
    .insert({
      trip_id: tripId,
      leg_id: body.leg_id ?? null,
      stop_id: body.stop_id ?? null,
      event_type: body.event_type ?? "manual_note",
      severity: body.severity ?? "info",
      title: body.title,
      description: body.description ?? null,
      metadata: body.metadata ?? {},
      actor_type: body.actor_type ?? "admin",
      actor_id: user?.id ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ event: data })
}
