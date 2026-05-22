import { NextRequest, NextResponse } from "next/server";

// Stadia Maps hosted Valhalla API (swap to self-hosted later by changing this URL)
const VALHALLA_BASE = "https://api.stadiamaps.com";

// Simple in-memory route cache to minimize API calls
const routeCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 200;

// Circuit breaker: once 429 quota exceeded, stop all calls for 10 minutes
let quotaExceededUntil = 0;
const QUOTA_COOLDOWN_MS = 10 * 60 * 1000;

interface ValhallaLocation {
  lat: number;
  lon: number;
  type?: "break" | "through" | "via";
}

interface TruckCostingOptions {
  height?: number;      // meters (default 4.11)
  width?: number;       // meters (default 2.6)
  length?: number;      // meters (default 21.64)
  weight?: number;      // metric tons (default 21.77)
  axle_load?: number;   // metric tons per axle
  axle_count?: number;  // number of axles
  use_tolls?: number;   // 0.0 = avoid, 0.5 = neutral, 1.0 = prefer
  use_highways?: number; // 0.0 = avoid, 1.0 = prefer
  hazmat?: boolean;
  shortest?: boolean;
}

interface RouteRequest {
  locations: ValhallaLocation[];
  costing?: "truck" | "auto";
  costing_options?: {
    truck?: TruckCostingOptions;
  };
  units?: "kilometers" | "miles";
  directions_type?: "none" | "maneuvers" | "instructions";
}

// Normalize Valhalla road class to our categories
function normalizeRoadClass(roadClass: string): "motorway" | "trunk" | "primary" | "secondary" | "other" {
  switch (roadClass) {
    case "motorway": return "motorway";
    case "trunk": return "trunk";
    case "primary": return "primary";
    case "secondary": return "secondary";
    default: return "other";
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.STADIA_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "STADIA_MAPS_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body: RouteRequest = await request.json();
    const {
      locations,
      costing = "truck",
      costing_options = {},
      units = "kilometers",
      directions_type = "maneuvers",
    } = body;

    if (!locations || locations.length < 2) {
      return NextResponse.json(
        { error: "At least 2 locations required" },
        { status: 400 }
      );
    }

    // Build cache key from locations + options
    const cacheKey = JSON.stringify({ locations, costing, costing_options, units });
    const cached = routeCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    // Build Valhalla request
    const valhallaBody: Record<string, unknown> = {
      locations: locations.map((loc) => ({
        lat: loc.lat,
        lon: loc.lon,
        type: loc.type || "break",
      })),
      costing,
      costing_options: costing_options,
      units,
      directions_type,
      // Get the shape (polyline) for map rendering
      shape_match: "map_snap",
    };

    // Handle shortest option - Valhalla uses a separate costing modifier
    if (costing_options?.truck?.shortest) {
      valhallaBody.costing = "truck";
      valhallaBody.costing_options = {
        truck: {
          ...costing_options.truck,
          shortest: true,
        },
      };
    }

    const valhallaUrl = `${VALHALLA_BASE}/route/v1?api_key=${apiKey}`;

    // Global circuit breaker: if quota was exceeded recently, don't even try
    const now = Date.now();
    if (quotaExceededUntil > now) {
      return NextResponse.json(
        { error: "Routing API quota exceeded. Routes will show as straight lines.", quota_exceeded: true },
        { status: 429 }
      );
    }

    const res = await fetch(valhallaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valhallaBody),
    });

    if (!res || !res.ok) {
      const errorText = res ? await res.text() : "No response";
      let errorDetail = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.error || errorJson.status_message || errorText;
      } catch { /* use raw text */ }

      // Quota exceeded -- trip the circuit breaker so we stop hammering the API
      if (res?.status === 429) {
        quotaExceededUntil = Date.now() + QUOTA_COOLDOWN_MS;
        return NextResponse.json(
          { error: "Routing API quota exceeded. Routes will show as straight lines.", quota_exceeded: true },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: `Valhalla routing error: ${errorDetail}` },
        { status: res?.status || 500 }
      );
    }

    const data = await res.json();

    if (!data.trip) {
      return NextResponse.json(
        { error: "No route found" },
        { status: 404 }
      );
    }

    const trip = data.trip;

    // Extract total distance and duration
    const totalDistanceKm = trip.summary?.length || 0;
    const totalDurationMin = trip.summary?.time ? trip.summary.time / 60 : 0;
    const hasToll = trip.summary?.has_toll || false;
    const hasHighway = trip.summary?.has_highway || false;

    // Build decoded geometry from all legs
    const allCoords: [number, number][] = [];
    const legs: Array<{
      distance_km: number;
      duration_min: number;
      geometry: [number, number][];
      maneuvers: Array<{
        instruction: string;
        distance_km: number;
        duration_min: number;
        road_class: string;
        toll: boolean;
        highway: boolean;
        begin_shape_index: number;
        end_shape_index: number;
      }>;
    }> = [];
    const legGeometries: [number, number][][] = [];

    // Extract admin (country) info from Valhalla (available when self-hosting, not on Stadia Maps)
    // trip.admins is an array like [{ country_code: "RO", country_text: "Romania" }, { country_code: "HU", ... }]
    const admins: Array<{ country_code: string; country_text: string; state_code?: string; state_text?: string }> =
      (trip.admins || []).map((a: any) => ({
        country_code: (a.country_code || "").toUpperCase(),
        country_text: a.country_text || "",
        state_code: a.state_code || "",
        state_text: a.state_text || "",
      }));

    // Country-level road class breakdown for toll calculations
    const countryRoadBreakdown: Record<string, {
      country_code: string;
      country_name: string;
      motorway_km: number;
      trunk_km: number;
      primary_km: number;
      other_km: number;
      total_km: number;
    }> = {};

    for (const leg of trip.legs || []) {
      // Decode polyline6 shape (Valhalla uses precision 6)
      let legCoords: [number, number][] = [];
      if (leg.shape) {
        const decoded = decodePolyline6(leg.shape);
        legCoords = decoded;
        if (allCoords.length === 0) {
          allCoords.push(...decoded);
        } else {
          allCoords.push(...decoded.slice(1));
        }
      }
      legGeometries.push(legCoords);

      const legManeuvers: typeof legs[0]["maneuvers"] = [];

      for (const m of leg.maneuvers || []) {
        const roadClass = normalizeRoadClass(m.road_class || "other");
        const isToll = m.toll || false;
        const isHighway = roadClass === "motorway" || roadClass === "trunk";
        const distanceKm = m.length || 0;

        // Resolve country from admin_index
        const adminIdx = m.admin_index ?? 0;
        const admin = admins[adminIdx];
        const countryCode = admin?.country_code || "XX";
        const countryName = admin?.country_text || "Unknown";

        legManeuvers.push({
          instruction: m.instruction || "",
          distance_km: distanceKm,
          duration_min: m.time ? m.time / 60 : 0,
          road_class: roadClass,
          toll: isToll,
          highway: isHighway,
          country_code: countryCode,
          begin_shape_index: m.begin_shape_index || 0,
          end_shape_index: m.end_shape_index || 0,
        });

        // Accumulate per-country road class breakdown
        if (!countryRoadBreakdown[countryCode]) {
          countryRoadBreakdown[countryCode] = {
            country_code: countryCode,
            country_name: countryName,
            motorway_km: 0,
            trunk_km: 0,
            primary_km: 0,
            other_km: 0,
            total_km: 0,
          };
        }
        const entry = countryRoadBreakdown[countryCode];
        entry.total_km += distanceKm;
        if (roadClass === "motorway") entry.motorway_km += distanceKm;
        else if (roadClass === "trunk") entry.trunk_km += distanceKm;
        else if (roadClass === "primary") entry.primary_km += distanceKm;
        else entry.other_km += distanceKm;
      }

      legs.push({
        distance_km: leg.summary?.length || 0,
        duration_min: leg.summary?.time ? leg.summary.time / 60 : 0,
        geometry: legCoords,
        maneuvers: legManeuvers,
      });
    }

    // Round the breakdown values
    for (const entry of Object.values(countryRoadBreakdown)) {
      entry.motorway_km = Math.round(entry.motorway_km * 10) / 10;
      entry.trunk_km = Math.round(entry.trunk_km * 10) / 10;
      entry.primary_km = Math.round(entry.primary_km * 10) / 10;
      entry.other_km = Math.round(entry.other_km * 10) / 10;
      entry.total_km = Math.round(entry.total_km * 10) / 10;
    }

    // Build GeoJSON-compatible geometry (same format as OSRM for easy migration)
    const geometry = {
      type: "LineString" as const,
      coordinates: allCoords.map(([lat, lng]) => [lng, lat]), // GeoJSON is [lng, lat]
    };

    // Also provide flat array for Leaflet (which uses [lat, lng])
    const latlngs = allCoords;

    const responseData = {
      distance_km: Math.round(totalDistanceKm * 10) / 10,
      duration_minutes: Math.round(totalDurationMin),
      has_toll: hasToll,
      has_highway: hasHighway,
      geometry,
      latlngs,
      legs,
      admins,
      country_road_breakdown: countryRoadBreakdown,
      // Preserve raw summary for debugging
      summary: {
        length: totalDistanceKm,
        time: trip.summary?.time,
        has_toll: hasToll,
        has_highway: hasHighway,
        min_lat: trip.summary?.min_lat,
        min_lon: trip.summary?.min_lon,
        max_lat: trip.summary?.max_lat,
      max_lon: trip.summary?.max_lon,
    },
    };

    // Cache the result
    if (routeCache.size >= MAX_CACHE_SIZE) {
      const oldest = routeCache.keys().next().value;
      if (oldest) routeCache.delete(oldest);
    }
    routeCache.set(cacheKey, { data: responseData, ts: Date.now() });

    return NextResponse.json(responseData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Decode a Valhalla polyline6 encoded string.
 * Valhalla uses precision 6 (unlike Google's precision 5).
 * Returns array of [lat, lng] pairs.
 */
function decodePolyline6(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e6, lng / 1e6]); // precision 6
  }

  return points;
}
