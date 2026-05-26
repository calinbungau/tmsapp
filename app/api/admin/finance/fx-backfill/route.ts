import { NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { fetchBnrYear } from "@/lib/finance/bnr-historical"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Phase 3 FX backfill.
 *
 * Walks all dates that appear in trip_expenses + cost_entries + maintenance_records
 * (where we currently store amounts in non-EUR currency), pulls the BNR yearly
 * archive(s) covering those dates, and inserts the relevant rates into fx_rates.
 *
 * After the rates table is populated, the BEFORE triggers we installed in the
 * phase3_fx_and_vat migration recompute amount_eur on every UPDATE, so we
 * touch the rows to fire those triggers.
 *
 * Idempotent. Safe to re-run. Uses ON CONFLICT DO NOTHING on (rate_date,
 * currency, source).
 */

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const TARGET_CCYS = ["EUR", "USD", "HUF", "PLN", "CZK", "GBP", "CHF", "BGN", "TRY"]

export async function POST() {
  const sb = svc()
  const log: string[] = []
  const t0 = Date.now()

  // 1) Collect every distinct date we have a non-EUR amount for.
  //    Post-consolidation, cost_entries is the single source of truth for
  //    trip/order/manual/AI receipts; trip_expenses is being retired.
  const { data: ceDates } = await sb
    .from("cost_entries")
    .select("occurred_at, currency")
    .not("currency", "is", null)
  const { data: mrDates } = await sb
    .from("maintenance_records")
    .select("completed_at, currency")
    .not("currency", "is", null)

  const dateSet = new Set<string>()
  for (const r of ceDates ?? []) {
    if (r.occurred_at) dateSet.add(String(r.occurred_at).slice(0, 10))
  }
  for (const r of mrDates ?? []) {
    if (r.completed_at) dateSet.add(String(r.completed_at).slice(0, 10))
  }

  const dates = Array.from(dateSet).sort()
  log.push(`distinct dates: ${dates.length}`)

  if (dates.length === 0) {
    return NextResponse.json({ ok: true, log, message: "no dates to backfill" })
  }

  // 2) Fetch BNR yearly archives covering all those dates (one fetch per year)
  const years = Array.from(new Set(dates.map((d) => parseInt(d.slice(0, 4), 10))))
  const archives: Record<number, Awaited<ReturnType<typeof fetchBnrYear>>> = {}
  for (const y of years) {
    try {
      archives[y] = await fetchBnrYear(y)
      log.push(`year ${y}: ${archives[y].length} business days`)
    } catch (e: any) {
      log.push(`year ${y}: FAILED — ${e?.message ?? e}`)
      archives[y] = []
    }
  }

  // 3) For each receipt date, find the BNR rate set (most recent <= date)
  //    and upsert one fx_rates row per target currency.
  type Row = { rate_date: string; currency: string; rate_to_ron: number; source: "BNR" }
  const upserts: Row[] = []
  for (const d of dates) {
    const yr = parseInt(d.slice(0, 4), 10)
    const days = archives[yr] ?? []
    const onOrBefore = days
      .filter((x) => x.date <= d)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
    let pick = onOrBefore[0]
    // Cross-year fallback (early January edge case)
    if (!pick && yr > 2000) {
      const prev = archives[yr - 1] ?? []
      pick = prev.sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    }
    if (!pick) continue
    for (const ccy of TARGET_CCYS) {
      const rate = pick.rates[ccy]
      if (!Number.isFinite(rate) || rate <= 0) continue
      upserts.push({ rate_date: d, currency: ccy, rate_to_ron: rate, source: "BNR" })
    }
  }
  log.push(`rate rows to upsert: ${upserts.length}`)

  // 4) Bulk upsert (chunk to stay under PostgREST limits)
  let inserted = 0
  for (let i = 0; i < upserts.length; i += 500) {
    const chunk = upserts.slice(i, i + 500)
    const { error, count } = await sb
      .from("fx_rates")
      .upsert(chunk, { onConflict: "rate_date,currency,source", ignoreDuplicates: true, count: "exact" })
    if (error) {
      log.push(`chunk ${i}: error ${error.message}`)
    } else {
      inserted += count ?? chunk.length
    }
  }
  log.push(`rate rows inserted/upserted: ${inserted}`)

  // 5) Touch cost_entries to refire the BEFORE trigger that recomputes amount_eur.
  //    The previous separate trip_expenses path is gone — its rows are now
  //    cost_entries with external_source='trip_expenses' and are covered here.
  const { error: ce } = await sb
    .from("cost_entries")
    .update({ updated_at: new Date().toISOString() })
    .not("currency", "is", null)
    .neq("currency", "EUR")
  if (ce) log.push(`cost_entries touch error: ${ce.message}`)

  log.push(`done in ${Date.now() - t0}ms`)
  return NextResponse.json({ ok: true, log })
}
