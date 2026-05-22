import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

/**
 * Persists the user-chosen Planned-vs-Actual inspection window on the
 * trip. PATCH with `{ from, to }` (ISO timestamps, both required) saves
 * a custom range; PATCH with `{ reset: true }` clears the saved range
 * so the trip falls back to the "first stop → last stop" default.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await context.params
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const supabase = await createClient()

  if (body?.reset === true) {
    const { error } = await supabase
      .from("trips")
      .update({
        analysis_window_from: null,
        analysis_window_to: null,
      })
      .eq("id", tripId)
    if (error) {
      console.error("[v0] analysis-window reset error:", error)
      return NextResponse.json(
        { error: "Failed to reset window", detail: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: true, reset: true })
  }

  const from = typeof body?.from === "string" ? new Date(body.from) : null
  const to = typeof body?.to === "string" ? new Date(body.to) : null
  if (!from || isNaN(from.getTime()) || !to || isNaN(to.getTime())) {
    return NextResponse.json(
      { error: "Both `from` and `to` must be valid ISO timestamps" },
      { status: 400 }
    )
  }
  if (to.getTime() <= from.getTime()) {
    return NextResponse.json(
      { error: "`to` must be after `from`" },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from("trips")
    .update({
      analysis_window_from: from.toISOString(),
      analysis_window_to: to.toISOString(),
    })
    .eq("id", tripId)
  if (error) {
    console.error("[v0] analysis-window save error:", error)
    return NextResponse.json(
      { error: "Failed to save window", detail: error.message },
      { status: 500 }
    )
  }
  return NextResponse.json({
    ok: true,
    from: from.toISOString(),
    to: to.toISOString(),
  })
}
