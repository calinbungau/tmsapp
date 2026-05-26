/**
 * Lists past imports for the audit/history view in Finance/Review.
 *
 *   GET /api/admin/finance/cost-imports?admin_id=...&limit=20
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const adminId = req.nextUrl.searchParams.get("admin_id")
  const limit = Math.min(100, Number(req.nextUrl.searchParams.get("limit") ?? 20))
  if (!adminId) return NextResponse.json({ imports: [] })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data, error } = await supabase
    .from("cost_provider_imports")
    .select(
      `
      id, admin_id, provider_id, file_name, file_size_bytes,
      total_rows, imported_count, duplicate_count, error_count, skipped_count,
      total_amount, total_amount_eur, period_from, period_to,
      status, started_at, completed_at, created_at,
      provider:provider_id ( id, name, code )
      `,
    )
    .eq("admin_id", adminId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imports: data ?? [] })
}
