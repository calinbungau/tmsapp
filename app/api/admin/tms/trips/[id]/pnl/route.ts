import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await context.params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("trip_pnl")
    .select("*")
    .eq("trip_id", tripId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ pnl: data })
}
