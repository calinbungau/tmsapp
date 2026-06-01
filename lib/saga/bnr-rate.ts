// Fetches the official BNR (Banca Nationala a Romaniei) reference exchange
// rate for a given currency and date. BNR publishes daily rates as XML at
// https://www.bnr.ro/files/xml/years/nbrfxrates<YYYY>.xml (per-year archive)
// and https://www.bnr.ro/nbrfxrates.xml (latest day).
//
// Rates are expressed as RON per 1 unit of the currency (with a multiplier
// for some currencies, e.g. HUF is per 100). We return RON-per-unit.

type BnrRate = { rate: number; date: string } | null;

// Simple in-memory cache (per server instance) keyed by currency+date.
const cache = new Map<string, BnrRate>();

function parseRateFromXml(xml: string, currency: string): { rate: number; date: string } | null {
  // Find the <Cube date="YYYY-MM-DD"> ... </Cube> block(s). The yearly file has
  // many Cubes; the daily file has one. We take the LAST matching rate at or
  // before the requested date when scanning the yearly archive.
  const code = currency.toUpperCase();
  // Match each Cube block with its date.
  const cubeRegex = /<Cube\s+date="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Cube>/g;
  let match: RegExpExecArray | null;
  let best: { rate: number; date: string } | null = null;

  while ((match = cubeRegex.exec(xml)) !== null) {
    const date = match[1];
    const body = match[2];
    const rateRegex = new RegExp(`<Rate\\s+currency="${code}"(?:\\s+multiplier="(\\d+)")?>([\\d.]+)</Rate>`);
    const rm = rateRegex.exec(body);
    if (rm) {
      const multiplier = rm[1] ? Number(rm[1]) : 1;
      const value = Number(rm[2]);
      if (Number.isFinite(value) && multiplier > 0) {
        // Keep the latest available date (Cubes are chronological).
        best = { rate: value / multiplier, date };
      }
    }
  }
  return best;
}

/**
 * Get the BNR reference rate (RON per 1 unit of `currency`) for `dateStr`
 * (YYYY-MM-DD). Falls back to the latest published rate if the exact date
 * isn't found. Returns null on failure.
 */
export async function getBnrRate(currency: string, dateStr?: string | null): Promise<BnrRate> {
  const code = (currency || "").toUpperCase();
  if (!code || code === "RON" || code === "LEI") return { rate: 1, date: dateStr || "" };

  const date = (dateStr || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const cacheKey = `${code}:${date}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  const year = date.slice(0, 4);
  const currentYear = new Date().getFullYear().toString();

  // Choose source: yearly archive for past years, latest daily file otherwise.
  const urls =
    year === currentYear
      ? [
          `https://www.bnr.ro/files/xml/years/nbrfxrates${year}.xml`,
          "https://www.bnr.ro/nbrfxrates.xml",
        ]
      : [`https://www.bnr.ro/files/xml/years/nbrfxrates${year}.xml`];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/xml" } });
      if (!res.ok) continue;
      const xml = await res.text();

      // From the yearly archive, restrict to Cubes on or before the target date
      // so we get the rate valid for that invoice date (or the most recent prior).
      let scopedXml = xml;
      if (url.includes("/years/")) {
        const cutoff = date;
        const cubes = xml.match(/<Cube\s+date="\d{4}-\d{2}-\d{2}">[\s\S]*?<\/Cube>/g) || [];
        const eligible = cubes.filter((c) => {
          const m = c.match(/date="(\d{4}-\d{2}-\d{2})"/);
          return m ? m[1] <= cutoff : false;
        });
        if (eligible.length > 0) scopedXml = eligible.join("\n");
      }

      const parsed = parseRateFromXml(scopedXml, code);
      if (parsed) {
        const result = { rate: Math.round(parsed.rate * 10000) / 10000, date: parsed.date };
        cache.set(cacheKey, result);
        return result;
      }
    } catch {
      // try next url
    }
  }

  cache.set(cacheKey, null);
  return null;
}
