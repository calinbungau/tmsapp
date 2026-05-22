/**
 * Stop-order optimizer (2-opt local search) for the Trip Editor.
 * Re-orders the middle of a stop list to minimise total Haversine distance,
 * subject to pickup-before-delivery (per-order) constraint.
 *
 * Origin and destination are pinned by default — most trips start and end
 * at known endpoints. Pass pinFirst=false / pinLast=false to free them.
 */
export interface OptimizableStop {
  id: string;
  lat: number | null;
  lng: number | null;
  stop_type: string;
  order_id: string | null;
}

const R_EARTH_KM = 6371;
function toRad(d: number) {
  return (d * Math.PI) / 180;
}
function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(sa));
}

function totalDistance(stops: OptimizableStop[]): number {
  let d = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null)
      continue;
    d += haversine({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
  }
  return d;
}

function isFeasible(stops: OptimizableStop[]): boolean {
  const pickedUp: Record<string, true> = {};
  for (const s of stops) {
    if (!s.order_id) continue;
    if (s.stop_type === "pickup") pickedUp[s.order_id] = true;
    else if (s.stop_type === "delivery" && !pickedUp[s.order_id]) return false;
  }
  return true;
}

export interface OptimizeResult {
  order: OptimizableStop[];
  distanceBeforeKm: number;
  distanceAfterKm: number;
  swaps: number;
}

export function optimizeStopOrder(
  stops: OptimizableStop[],
  opts: { pinFirst?: boolean; pinLast?: boolean } = {}
): OptimizeResult {
  const pinFirst = opts.pinFirst ?? true;
  const pinLast = opts.pinLast ?? true;
  const distanceBeforeKm = totalDistance(stops);
  if (stops.length < 4) {
    return {
      order: stops,
      distanceBeforeKm,
      distanceAfterKm: distanceBeforeKm,
      swaps: 0,
    };
  }
  const ordered = [...stops];
  const startI = pinFirst ? 1 : 0;
  const endI = pinLast ? ordered.length - 1 : ordered.length;
  let swaps = 0;
  let improved = true;
  let iter = 0;
  while (improved && iter < 200) {
    improved = false;
    iter++;
    for (let i = startI; i < endI - 1; i++) {
      for (let k = i + 1; k < endI; k++) {
        const candidate = [
          ...ordered.slice(0, i),
          ...ordered.slice(i, k + 1).reverse(),
          ...ordered.slice(k + 1),
        ];
        if (!isFeasible(candidate)) continue;
        const d = totalDistance(candidate);
        if (d + 0.01 < totalDistance(ordered)) {
          ordered.splice(0, ordered.length, ...candidate);
          improved = true;
          swaps++;
        }
      }
    }
  }
  const distanceAfterKm = totalDistance(ordered);
  return { order: ordered, distanceBeforeKm, distanceAfterKm, swaps };
}
