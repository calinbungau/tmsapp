/**
 * Lightweight country-based toll cost forecast.
 *
 * Real-world tolls depend on truck class, axles, emission class, route
 * specifics — this utility returns a *first-pass estimate* good enough for
 * dispatcher pricing decisions. Numbers reflect ~12t+ HGV averages on
 * highways/express roads in EUR/km, sourced from public 2024-2025 tariffs.
 *
 * Replace with provider integrations (ASFINAG, ToollCollect, HU-GO, ro-vignette,
 * VinciAutoroutes, etc.) for billable accuracy.
 */
export const TOLL_RATES_EUR_PER_KM: Record<string, number> = {
  AT: 0.42, // Austria — ASFINAG (Go-Box)
  BE: 0.18, // Belgium — Viapass
  BG: 0.12, // Bulgaria — vignette+toll mixed
  CH: 0.45, // Switzerland — LSVA, very expensive
  CZ: 0.21, // Czech Republic — MyToll
  DE: 0.35, // Germany — ToollCollect
  DK: 0.16, // Denmark — Eurovignette
  ES: 0.18, // Spain — partial network
  FR: 0.28, // France — concessions
  GR: 0.15,
  HR: 0.20,
  HU: 0.34, // Hungary — HU-GO
  IT: 0.25,
  LT: 0.06, // vignette only
  LU: 0.15,
  NL: 0.18, // Eurovignette
  PL: 0.18, // viaTOLL/e-TOLL
  PT: 0.20,
  RO: 0.07, // ro-vignette only (no per-km tolls)
  SE: 0.10,
  SI: 0.30, // DarsGo
  SK: 0.21, // SkyToll
  UK: 0.04,
  GB: 0.04,
  IE: 0.04,
  NO: 0.10,
  FI: 0.05,
  EE: 0.05,
  LV: 0.06,
};

export interface CountryDistance {
  country: string;
  km: number;
}

export interface TollForecast {
  totalEur: number;
  byCountry: Array<{
    country: string;
    km: number;
    ratePerKm: number;
    eur: number;
    unknown: boolean;
  }>;
}

export function forecastTolls(distances: CountryDistance[]): TollForecast {
  const byCountry = distances.map((d) => {
    const code = (d.country || "").toUpperCase();
    const rate = TOLL_RATES_EUR_PER_KM[code];
    const known = rate !== undefined;
    const eur = known ? d.km * rate : 0;
    return {
      country: code || "??",
      km: Math.round(d.km),
      ratePerKm: rate ?? 0,
      eur: Math.round(eur * 100) / 100,
      unknown: !known,
    };
  });
  const totalEur = byCountry.reduce((s, c) => s + c.eur, 0);
  return { totalEur: Math.round(totalEur * 100) / 100, byCountry };
}

/**
 * Quick distance attribution from stops.
 */
export function distancesByStopCountry(
  stops: Array<{ country?: string | null; distance_to_km?: number | null }>
): CountryDistance[] {
  const totals: Record<string, number> = {};
  for (const s of stops) {
    const c = (s.country || "").toUpperCase();
    const km = Number(s.distance_to_km || 0);
    if (km <= 0 || !c) continue;
    totals[c] = (totals[c] ?? 0) + km;
  }
  return Object.entries(totals).map(([country, km]) => ({ country, km }));
}
