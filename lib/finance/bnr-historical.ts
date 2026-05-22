/**
 * BNR historical rates loader.
 *
 * BNR publishes a yearly archive XML at:
 *   https://www.bnr.ro/files/xml/years/nbrfxrates{YYYY}.xml
 *
 * Each file contains every business-day rate set for that calendar year.
 * Same shape as the daily XML — a <Cube date="YYYY-MM-DD"> per day, each
 * containing <Rate currency="..." multiplier="..."?>value</Rate> children.
 *
 * Multipliers (JPY/HUF use 100) are normalised so the returned rate is
 * always "RON per 1 unit of the foreign currency".
 */

export interface BnrDayRates {
  date: string; // YYYY-MM-DD
  rates: Record<string, number>; // ISO currency -> RON per 1 unit
}

const BASE = "https://www.bnr.ro/files/xml/years";

/**
 * Fetches and parses the entire BNR rate archive for one calendar year.
 * The yearly file is small (a few hundred KB at most) so we cache it
 * for 24h; historical days never change.
 */
export async function fetchBnrYear(year: number): Promise<BnrDayRates[]> {
  const url = `${BASE}/nbrfxrates${year}.xml`;
  const res = await fetch(url, {
    next: { revalidate: 86400 },
    headers: {
      "User-Agent": "vimarek-tms/1.0 (+https://bngtracking.ro)",
      Accept: "application/xml, text/xml",
    },
  });
  if (!res.ok) throw new Error(`BNR ${year} archive HTTP ${res.status}`);
  const xml = await res.text();

  // Parse every <Cube date="...">...</Cube> block. Greedy-but-bounded
  // regex avoids pulling in a full XML parser dependency.
  const days: BnrDayRates[] = [];
  const cubeRegex = /<Cube\s+date="([^"]+)"\s*>([\s\S]*?)<\/Cube>/g;
  const rateRegex = /<Rate\s+currency="([^"]+)"(?:\s+multiplier="(\d+)")?\s*>\s*([\d.]+)\s*<\/Rate>/g;

  let cube: RegExpExecArray | null;
  while ((cube = cubeRegex.exec(xml)) !== null) {
    const date = cube[1];
    const inner = cube[2];
    const rates: Record<string, number> = { RON: 1 };
    rateRegex.lastIndex = 0;
    let r: RegExpExecArray | null;
    while ((r = rateRegex.exec(inner)) !== null) {
      const code = r[1];
      const multiplier = r[2] ? parseInt(r[2], 10) : 1;
      const value = parseFloat(r[3]);
      if (Number.isFinite(value) && multiplier > 0) {
        rates[code] = value / multiplier;
      }
    }
    if (Object.keys(rates).length > 1) days.push({ date, rates });
  }

  return days;
}

/**
 * Returns the BNR rate set for a specific date — fetching the yearly
 * archive and selecting the most recent <= the requested date (BNR
 * doesn't publish on weekends/holidays, so callers must accept the
 * "previous business day" rate, which is the convention every Romanian
 * accountant uses).
 */
export async function fetchBnrForDate(date: string): Promise<BnrDayRates | null> {
  const year = parseInt(date.slice(0, 4), 10);
  if (!Number.isFinite(year)) return null;
  const days = await fetchBnrYear(year);
  const onOrBefore = days
    .filter((d) => d.date <= date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (onOrBefore[0]) return onOrBefore[0];

  // Fall through to previous year's last day if asked for very early Jan
  if (year > 2000) {
    const prev = await fetchBnrYear(year - 1);
    const sorted = prev.sort((a, b) => (a.date < b.date ? 1 : -1));
    return sorted[0] ?? null;
  }
  return null;
}
