/**
 * Nominatim-backed geocoding with database cache.
 *
 * Uses the INTERNAL self-hosted Nominatim instance at rvs.bngtracking.ro
 * (no rate limit, no public-use policy restrictions). Falls back to
 * env NOMINATIM_URL if set.
 *
 * - Results are cached in `geocoded_locations` keyed by a normalized
 *   "country|label" hash. Cache hits cost zero HTTP traffic, so importing
 *   the same supplier file twice is essentially free.
 * - Failures are cached too (status='not_found' or 'error') so we don't
 *   re-hammer Nominatim with addresses that don't resolve.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export interface GeocodeResult {
  latitude: number | null
  longitude: number | null
  display_name: string | null
  status: "ok" | "not_found" | "error"
}

// Use the internal self-hosted Nominatim by default (no rate limit).
const NOMINATIM_BASE =
  process.env.NOMINATIM_URL || "https://rvs.bngtracking.ro"
const USER_AGENT = "BNG-TMS/1.0"

function normalizeKey(country: string | null, label: string): string {
  return `${(country || "").toUpperCase().trim()}|${label.toLowerCase().replace(/\s+/g, " ").trim()}`
}

/**
 * Look up a single (country, label) pair. Hits the cache first, then
 * Nominatim. Always writes the outcome (ok / not_found / error) back to
 * the cache so subsequent calls are instant.
 */
export async function geocodeWithCache(
  supabase: SupabaseClient,
  label: string,
  country: string | null,
): Promise<GeocodeResult> {
  const cleanLabel = (label || "").trim()
  if (!cleanLabel) return { latitude: null, longitude: null, display_name: null, status: "not_found" }

  const key = normalizeKey(country, cleanLabel)

  // 1. Cache lookup.
  const { data: cached } = await supabase
    .from("geocoded_locations")
    .select("latitude, longitude, display_name, status")
    .eq("query_key", key)
    .maybeSingle()
  if (cached) {
    // Refresh last_used_at (best-effort, fire and forget).
    supabase
      .from("geocoded_locations")
      .update({ last_used_at: new Date().toISOString() })
      .eq("query_key", key)
      .then(() => {})
    return {
      latitude: cached.latitude,
      longitude: cached.longitude,
      display_name: cached.display_name,
      status: (cached.status as GeocodeResult["status"]) || "ok",
    }
  }

  // 2. Hit Nominatim.
  const result = await callNominatim(cleanLabel, country)

  // 3. Persist (best-effort).
  await supabase.from("geocoded_locations").upsert(
    {
      query_key: key,
      raw_query: cleanLabel,
      country_code: country || null,
      latitude: result.latitude,
      longitude: result.longitude,
      display_name: result.display_name,
      status: result.status,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "query_key" },
  )

  return result
}

async function callNominatim(label: string, country: string | null): Promise<GeocodeResult> {
  try {
    const params = new URLSearchParams({
      q: label,
      format: "json",
      addressdetails: "1",
      limit: "1",
    })
    if (country && /^[A-Z]{2}$/i.test(country)) {
      params.set("countrycodes", country.toLowerCase())
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    const res = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "en" },
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!res.ok) return { latitude: null, longitude: null, display_name: null, status: "error" }
    const json = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
    if (!json.length) return { latitude: null, longitude: null, display_name: null, status: "not_found" }
    const hit = json[0]
    return {
      latitude: Number(hit.lat),
      longitude: Number(hit.lon),
      display_name: hit.display_name,
      status: "ok",
    }
  } catch {
    return { latitude: null, longitude: null, display_name: null, status: "error" }
  }
}

/**
 * Resolve an array of (label, country) pairs. De-duplicates first, hits
 * cache, and rate-limits live Nominatim calls to ~1.1 req/s to honor the
 * public endpoint's policy. Returns a Map keyed by `country|label` so
 * callers can map results back onto their rows.
 */
export async function geocodeBatch(
  supabase: SupabaseClient,
  pairs: Array<{ label: string; country: string | null }>,
): Promise<Map<string, GeocodeResult>> {
  const out = new Map<string, GeocodeResult>()
  // De-dupe.
  const unique = new Map<string, { label: string; country: string | null }>()
  for (const p of pairs) {
    if (!p.label) continue
    const k = normalizeKey(p.country, p.label)
    if (!unique.has(k)) unique.set(k, p)
  }

  // Read all cache hits up front.
  const keys = [...unique.keys()]
  if (keys.length === 0) return out
  const { data: cached } = await supabase
    .from("geocoded_locations")
    .select("query_key, latitude, longitude, display_name, status")
    .in("query_key", keys)
  const cachedMap = new Map<string, GeocodeResult>()
  for (const c of cached ?? []) {
    cachedMap.set(c.query_key, {
      latitude: c.latitude,
      longitude: c.longitude,
      display_name: c.display_name,
      status: (c.status as GeocodeResult["status"]) || "ok",
    })
  }

  // Resolve each unique pair. Cache hit = instant; miss = parallel fetch
  // (internal Nominatim has no rate limit, so no need to throttle).
  const uncached: Array<[string, { label: string; country: string | null }]> = []
  for (const [k, p] of unique) {
    const hit = cachedMap.get(k)
    if (hit) {
      out.set(k, hit)
    } else {
      uncached.push([k, p])
    }
  }

  // Fetch uncached in parallel (internal instance; no rate limit).
  await Promise.all(
    uncached.map(async ([k, p]) => {
      const r = await callNominatim(p.label, p.country)
      out.set(k, r)
      await supabase.from("geocoded_locations").upsert(
        {
          query_key: k,
          raw_query: p.label,
          country_code: p.country || null,
          latitude: r.latitude,
          longitude: r.longitude,
          display_name: r.display_name,
          status: r.status,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "query_key" },
      )
    }),
  )

  return out
}

export function makeGeocodeKey(country: string | null, label: string): string {
  return normalizeKey(country, label)
}

/** Lightweight service-role client factory (when not passed in). */
export function geocodingServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
