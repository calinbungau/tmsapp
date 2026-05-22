/**
 * Utility functions for handling Trip Legs (Execution Layer)
 * 
 * Terminology:
 * - Round Trip: A container for execution that groups orders/stops together
 * - Leg: A segment of a Round Trip handled by a specific resource (own fleet) or carrier (subcontract)
 * - Trip Stop: An execution stop that belongs to a Round Trip
 * - from_stop_index / to_stop_index: The boundaries of a leg within the trip_stops sequence
 */

export interface TripLegBounds {
  from_stop_index: number;
  to_stop_index: number;
}

export interface TripLeg extends TripLegBounds {
  id: string;
  trip_id: string;
  leg_number: number;
  assignment_type: "own_fleet" | "forwarding" | "undecided";
  driver_id?: string | null;
  vehicle_id?: string | null;
  trailer_id?: string | null;
  carrier_id?: string | null;
  swap_type?: "truck_swap" | "driver_swap" | "trailer_swap" | null;
  route_geometry?: [number, number][] | null;
  distance_km?: number | null;
  duration_minutes?: number | null;
}

export interface TripStopWithSequence {
  sequence_order: number;
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
  country_code?: string | null;
  [key: string]: unknown;
}

/**
 * Filter trip stops to only include stops within a specific leg's boundaries
 * 
 * @param stops - All trip stops in sequence order
 * @param leg - The leg boundaries (from_stop_index to to_stop_index inclusive)
 * @returns Filtered stops within the leg boundaries
 */
export function filterStopsByLeg<T extends { sequence_order: number }>(
  stops: T[],
  leg: TripLegBounds | null | undefined
): T[] {
  if (!leg) return stops;
  return stops.filter(
    (s) => s.sequence_order >= leg.from_stop_index && s.sequence_order <= leg.to_stop_index
  );
}

/**
 * Find which leg a specific vehicle is assigned to within a trip
 * 
 * @param legs - All legs for a trip
 * @param vehicleId - The vehicle ID to find
 * @returns The leg assigned to this vehicle, or undefined if not found
 */
export function findLegByVehicle(
  legs: TripLeg[],
  vehicleId: string | null | undefined
): TripLeg | undefined {
  if (!vehicleId) return undefined;
  return legs.find((l) => l.vehicle_id === vehicleId);
}

/**
 * Find which leg a specific driver is assigned to within a trip
 * 
 * @param legs - All legs for a trip
 * @param driverId - The driver ID to find
 * @returns The leg assigned to this driver, or undefined if not found
 */
export function findLegByDriver(
  legs: TripLeg[],
  driverId: string | null | undefined
): TripLeg | undefined {
  if (!driverId) return undefined;
  return legs.find((l) => l.driver_id === driverId);
}

/**
 * Find which leg a specific carrier is assigned to within a trip
 * 
 * @param legs - All legs for a trip
 * @param carrierId - The carrier ID to find
 * @returns The leg assigned to this carrier, or undefined if not found
 */
export function findLegByCarrier(
  legs: TripLeg[],
  carrierId: string | null | undefined
): TripLeg | undefined {
  if (!carrierId) return undefined;
  return legs.find((l) => l.carrier_id === carrierId);
}

/**
 * Get origin and destination cities for a specific leg
 * 
 * @param stops - All trip stops
 * @param leg - The leg to get cities for
 * @returns Object with origin and destination city names
 */
export function getLegCities(
  stops: TripStopWithSequence[],
  leg: TripLegBounds
): { origin: string; destination: string } {
  const legStops = filterStopsByLeg(stops, leg);
  const sortedStops = [...legStops].sort((a, b) => a.sequence_order - b.sequence_order);
  
  const origin = sortedStops[0]?.city || "Unknown";
  const destination = sortedStops[sortedStops.length - 1]?.city || "Unknown";
  
  return { origin, destination };
}

/**
 * Slice route geometry to only include the portion between two stop indices
 * 
 * This finds the geometry points closest to the leg's start and end stops,
 * then returns only the portion between them.
 * 
 * @param geometry - Full route geometry as [lng, lat] pairs
 * @param stops - All trip stops with lat/lng coordinates
 * @param fromIndex - Starting stop index (inclusive)
 * @param toIndex - Ending stop index (inclusive)
 * @returns Sliced geometry for the leg, or null if cannot be determined
 */
export function sliceRouteGeometry(
  geometry: [number, number][] | null | undefined,
  stops: TripStopWithSequence[],
  fromIndex: number,
  toIndex: number
): [number, number][] | null {
  if (!geometry || geometry.length < 2) return null;
  
  // Get the stops at the boundaries
  const startStop = stops.find((s) => s.sequence_order === fromIndex);
  const endStop = stops.find((s) => s.sequence_order === toIndex);
  
  if (!startStop?.lat || !startStop?.lng || !endStop?.lat || !endStop?.lng) {
    return null;
  }
  
  // Find the geometry point closest to each stop
  const findClosestGeometryIndex = (lat: number, lng: number): number => {
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    geometry.forEach((point, index) => {
      const [pLng, pLat] = point;
      // Simple Euclidean distance (good enough for finding closest point)
      const distance = Math.sqrt(Math.pow(pLat - lat, 2) + Math.pow(pLng - lng, 2));
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    
    return closestIndex;
  };
  
  const startGeomIndex = findClosestGeometryIndex(startStop.lat, startStop.lng);
  const endGeomIndex = findClosestGeometryIndex(endStop.lat, endStop.lng);
  
  // Ensure we slice in the correct direction
  const from = Math.min(startGeomIndex, endGeomIndex);
  const to = Math.max(startGeomIndex, endGeomIndex);
  
  return geometry.slice(from, to + 1);
}

/**
 * Get the stop count for a specific leg
 */
export function getLegStopCount(leg: TripLegBounds): number {
  return leg.to_stop_index - leg.from_stop_index + 1;
}

/**
 * Check if a leg has resources assigned (driver, vehicle, or carrier)
 */
export function isLegAssigned(leg: TripLeg): boolean {
  return !!(
    (leg.assignment_type === "own_fleet" && (leg.driver_id || leg.vehicle_id)) ||
    (leg.assignment_type === "forwarding" && leg.carrier_id)
  );
}

/**
 * Get a display label for a leg's assignment
 */
export function getLegAssignmentLabel(leg: TripLeg): string {
  if (leg.assignment_type === "own_fleet") {
    return "Own Fleet";
  } else if (leg.assignment_type === "forwarding") {
    return "Subcontract";
  }
  return "Pending";
}

/**
 * Canonical execution bucket for an assignment_type string.
 *
 * Historically the codebase grew two equivalent labels for "we run it
 * ourselves" — `own_fleet` (Dispatch Board / trip_legs) and `internal`
 * (Order workflow / orders.order_type). Likewise `forwarding` and
 * `subcontracted` are used interchangeably for outsourced execution.
 *
 * Anywhere we *compare* two trips (eligibility checks, merge guards,
 * filtering by execution mode), we should bucket through this helper so
 * the comparison is robust to the legacy split.
 *
 *   "own_fleet" | "internal"       → "own"
 *   "forwarding" | "subcontracted" → "external"
 *   anything else (incl. null)     → "undecided"
 */
export function assignmentBucket(
  raw: string | null | undefined,
): "own" | "external" | "undecided" {
  const v = (raw ?? "").toLowerCase();
  if (v === "own_fleet" || v === "internal") return "own";
  if (v === "forwarding" || v === "subcontracted") return "external";
  return "undecided";
}
