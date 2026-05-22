import { NextResponse } from "next/server";

/**
 * BNR (Banca Națională a României) reference rates proxy.
 *
 * The BNR publishes its official reference exchange rates once per
 * business day at ~13:00 Bucharest time at
 *   https://www.bnr.ro/nbrfxrates.xml
 *
 * Rates are quoted as **RON per 1 unit of the foreign currency** (with
 * a few exceptions like JPY and HUF that use a multiplier of 100, which
 * we normalise away so callers can always use the rate as
 * `RON_amount = foreign_amount * rate`).
 *
 * Why proxy through our own server instead of hitting BNR directly
 * from the browser:
 *   1. BNR's XML endpoint does not enable CORS, so a browser fetch
 *      would be blocked.
 *   2. We can cache aggressively — the published value doesn't change
 *      intra-day — and avoid hammering BNR's public XML.
 *   3. We can sanitise the data into a clean JSON shape that the
 *      client-side conversion logic can use without re-parsing XML.
 */

const BNR_URL = "https://www.bnr.ro/nbrfxrates.xml";

export const revalidate = 3600; // 1 hour — well under daily refresh

interface BnrRatesResponse {
  /** Publication date of these rates, ISO YYYY-MM-DD as reported by BNR. */
  date: string;
  /**
   * Map of ISO currency code → number of RON per 1 unit of that
   * currency. Always contains `RON: 1` for ergonomic round-tripping.
   * Multipliers (e.g. JPY=100) have already been normalised: the
   * returned value is the cost of ONE unit in RON.
   */
  rates: Record<string, number>;
  source: "BNR";
  /** When this response was generated server-side — useful for diagnosing
   *  cache freshness. */
  fetched_at: string;
}

export async function GET() {
  try {
    const res = await fetch(BNR_URL, {
      // Next.js fetch cache — same value as `revalidate` above so the
      // freshness contract is single-sourced.
      next: { revalidate: 3600 },
      headers: {
        // Some upstreams reject empty UA strings. Identify the app so
        // the BNR ops team can see who's polling if they ever look.
        "User-Agent": "vimarek-tms/1.0 (+https://bngtracking.ro)",
        Accept: "application/xml, text/xml",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `BNR returned HTTP ${res.status}` },
        { status: 502 },
      );
    }

    const xml = await res.text();

    // Extract the <Cube date="YYYY-MM-DD"> wrapper date. This is the
    // publishing date of the rate set — the most relevant date for
    // displaying "curs BNR DD.MM.YYYY" on an invoice.
    const dateMatch = xml.match(/<Cube\s+date="([^"]+)"/i);
    const publishingDate = dateMatch?.[1] || new Date().toISOString().split("T")[0];

    // Extract every <Rate currency="..." multiplier="..."?>value</Rate>.
    // The multiplier attribute is optional and defaults to 1; when
    // present (e.g. 100 for JPY/HUF), the rate value applies to that
    // many units of the foreign currency, so we divide it out.
    const rates: Record<string, number> = { RON: 1 };
    const rateRegex = /<Rate\s+currency="([^"]+)"(?:\s+multiplier="(\d+)")?\s*>\s*([\d.]+)\s*<\/Rate>/g;
    let m: RegExpExecArray | null;
    while ((m = rateRegex.exec(xml)) !== null) {
      const code = m[1];
      const multiplier = m[2] ? parseInt(m[2], 10) : 1;
      const value = parseFloat(m[3]);
      if (Number.isFinite(value) && multiplier > 0) {
        rates[code] = value / multiplier;
      }
    }

    if (Object.keys(rates).length <= 1) {
      // Only `RON: 1` made it in — XML format must have shifted. Fail
      // loudly so the client falls back gracefully.
      return NextResponse.json(
        { error: "Failed to parse any BNR rates from XML response" },
        { status: 502 },
      );
    }

    const payload: BnrRatesResponse = {
      date: publishingDate,
      rates,
      source: "BNR",
      fetched_at: new Date().toISOString(),
    };

    return NextResponse.json(payload, {
      headers: {
        // Hint downstream caches (CDN/browser) — fresh for 1h, but
        // serve stale for up to a day while we revalidate in the
        // background. This keeps the form snappy even right around
        // BNR's daily 13:00 refresh.
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch BNR rates: ${message}` },
      { status: 500 },
    );
  }
}
