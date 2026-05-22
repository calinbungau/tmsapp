/**
 * Lightweight forward-geocoding helper backed by OpenStreetMap Nominatim.
 *
 * Used as a fallback when the AI receipt extractor returns a `location_label`
 * (street + city + country) but no `latitude/longitude`. Nominatim has no
 * API key and is free for low-volume use; we set a polite User-Agent and a
 * short timeout so we never block the receipt save path.
 *
 * If you ever exceed Nominatim's policy (~1 req/s) swap to MapTiler / Mapbox /
 * Photon by keeping the same `geocodeAddress(text, country?)` signature.
 */

export type GeocodeResult = {
  latitude: number
  longitude: number
  display_name: string
} | null

// ── Country name → ISO-3166 alpha-2 (countryHint is what Nominatim wants) ──
// Only the countries we currently see in receipt locations. Anything else
// falls through and Nominatim ranks all countries.
const COUNTRY_TO_ISO2: Record<string, string> = {
  romania: "ro",
  hungary: "hu",
  netherlands: "nl",
  belgium: "be",
  germany: "de",
  france: "fr",
  italy: "it",
  spain: "es",
  poland: "pl",
  austria: "at",
  czechia: "cz",
  "czech republic": "cz",
  slovakia: "sk",
  slovenia: "si",
  croatia: "hr",
  bulgaria: "bg",
  greece: "gr",
  switzerland: "ch",
  luxembourg: "lu",
  denmark: "dk",
  sweden: "se",
  finland: "fi",
  norway: "no",
  ireland: "ie",
  "united kingdom": "gb",
  uk: "gb",
  portugal: "pt",
}

/**
 * Best-effort smart geocoder. Tries progressively simpler queries derived from
 * the AI's free-form `location_label`, returning the first hit.
 *
 * Rationale: receipts come back as messy strings like
 *   "Nufarului, Nr. 87/A (Statia Oradea 2), Oradea, Bihor 410605, Romania"
 * Nominatim returns 0 results for the full string (parens + obscure street
 * numbers + administrative codes confuse it), but matches cleanly for
 *   - "Nufarului 87, Oradea, Romania"
 *   - "Oradea, Romania"
 * We try the fullest first (best precision), then drop noise, then fall back
 * to city + country, and finally country-only as a last resort. Each variant
 * is short-circuited as soon as one returns a hit.
 *
 * The `countryHint` parameter accepts either an ISO-2 code ("ro") or a country
 * name ("Romania") and is used for both the variant fallback and Nominatim's
 * `countrycodes` filter.
 */
export async function geocodeAddressSmart(
  rawLabel: string | null | undefined,
  countryHint?: string | null,
): Promise<GeocodeResult> {
  if (!rawLabel) return null
  const label = rawLabel.trim()
  if (label.length < 3) return null

  // Normalise countryHint to ISO2 if a name was passed
  let iso2: string | null = null
  if (countryHint) {
    const c = countryHint.trim().toLowerCase()
    iso2 = c.length === 2 ? c : COUNTRY_TO_ISO2[c] ?? null
  }

  // Sniff a country from the label tail if no hint was given
  if (!iso2) {
    const lastChunk = label.split(",").map(s => s.trim()).filter(Boolean).pop() ?? ""
    iso2 = COUNTRY_TO_ISO2[lastChunk.toLowerCase()] ?? null
  }

  // Strip parenthetical noise (e.g. "(Statia Oradea 2)")
  const stripped = label.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim()

  // Drop bare postal-code chunks like "Bihor 410605" — they often confuse Nominatim
  const noPostal = stripped
    .split(",")
    .map(s => s.trim())
    .filter(s => s && !/^\d{4,6}(\s|$)/.test(s) && !/^[A-Za-z][a-z]+\s+\d{4,6}$/.test(s))
    .join(", ")

  // Pull out city + country tail (last two non-empty comma chunks)
  const parts = noPostal.split(",").map(s => s.trim()).filter(Boolean)
  const cityCountry = parts.slice(-2).join(", ")
  const countryOnly = parts.slice(-1).join(", ")

  const variants = Array.from(
    new Set([label, stripped, noPostal, cityCountry, countryOnly].filter(v => v && v.length >= 3)),
  )

  for (const v of variants) {
    const hit = await geocodeAddress(v, iso2)
    if (hit) {
      console.log("[v0] geocodeSmart: matched", JSON.stringify(v), "→", hit.latitude, hit.longitude)
      return hit
    }
  }
  console.log("[v0] geocodeSmart: no match for any variant of", JSON.stringify(label))
  return null
}

/** Forward-geocode a free-form address. Returns null on any error or no match. */
export async function geocodeAddress(
  text: string,
  countryHint?: string | null,
  timeoutMs = 4000
): Promise<GeocodeResult> {
  if (!text || text.trim().length < 3) return null

  const params = new URLSearchParams({
    q: text.trim(),
    format: "jsonv2",
    limit: "1",
    addressdetails: "0",
  })
  if (countryHint) params.set("countrycodes", countryHint.toLowerCase())

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        // Nominatim usage policy requires identifying the application.
        "User-Agent": "v0-tms/1.0 (trip-expense-receipts)",
        "Accept-Language": "en",
      },
      signal: controller.signal,
      cache: "no-store",
    })
    if (!res.ok) {
      console.log("[v0] geocode: HTTP", res.status, "for", text)
      return null
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
    if (!data?.length) {
      console.log("[v0] geocode: no match for", text)
      return null
    }
    const lat = Number(data[0].lat)
    const lon = Number(data[0].lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    return { latitude: lat, longitude: lon, display_name: data[0].display_name }
  } catch (err: any) {
    console.log("[v0] geocode: error", err?.message ?? err)
    return null
  } finally {
    clearTimeout(t)
  }
}
