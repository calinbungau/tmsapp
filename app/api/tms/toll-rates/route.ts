import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET: Fetch all toll data (countries, rates, vignettes, special charges, categories)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const countryId = searchParams.get("country_id");
  const dataType = searchParams.get("type") || "overview"; // overview | rates | vignettes | sections | special | categories | history

  try {
    if (dataType === "categories") {
      const { data, error } = await supabase
        .from("toll_vehicle_categories")
        .select("*")
        .eq("is_active", true)
        .order("category_type")
        .order("sort_order");
      if (error) throw error;
      return NextResponse.json({ categories: data });
    }

    if (dataType === "overview") {
      // Fetch all countries with counts
      const { data: countries, error: cErr } = await supabase
        .from("toll_countries")
        .select("*")
        .order("country_name");
      if (cErr) throw cErr;

      // Fetch rate counts per country
      const { data: rateCounts, error: rcErr } = await supabase
        .from("toll_rates")
        .select("toll_country_id, id")
        .eq("is_active", true);
      if (rcErr) throw rcErr;

      // Fetch vignette counts per country
      const { data: vignetteCounts, error: vcErr } = await supabase
        .from("toll_vignettes")
        .select("toll_country_id, id")
        .eq("is_active", true);
      if (vcErr) throw vcErr;

      // Fetch special charge counts per country
      const { data: specialCounts, error: scErr } = await supabase
        .from("toll_special_charges")
        .select("toll_country_id, id")
        .eq("is_active", true);
      if (scErr) throw scErr;

      const countryData = countries?.map(c => ({
        ...c,
        rate_count: rateCounts?.filter(r => r.toll_country_id === c.id).length || 0,
        vignette_count: vignetteCounts?.filter(v => v.toll_country_id === c.id).length || 0,
        special_count: specialCounts?.filter(s => s.toll_country_id === c.id).length || 0,
      }));

      // Also include vehicle categories for the calculator
      const { data: cats } = await supabase
        .from("toll_vehicle_categories")
        .select("*")
        .eq("is_active", true)
        .order("category_type")
        .order("sort_order");

      return NextResponse.json({ countries: countryData, categories: cats || [] });
    }

    if (!countryId) {
      return NextResponse.json({ error: "country_id required for detail views" }, { status: 400 });
    }

    if (dataType === "rates") {
      const { data: rates, error } = await supabase
        .from("toll_rates")
        .select(`
          *,
          emission_class:toll_vehicle_categories!toll_rates_emission_class_id_fkey(id, name, code, category_type),
          axle_category:toll_vehicle_categories!toll_rates_axle_category_id_fkey(id, name, code, category_type),
          weight_class:toll_vehicle_categories!toll_rates_weight_class_id_fkey(id, name, code, category_type),
          co2_class:toll_vehicle_categories!toll_rates_co2_class_id_fkey(id, name, code, category_type),
          road_segment:toll_road_segments(id, segment_code, segment_name, segment_type)
        `)
        .eq("toll_country_id", countryId)
        .eq("is_active", true)
        .order("valid_from", { ascending: false });
      if (error) throw error;

      const { data: segments, error: segErr } = await supabase
        .from("toll_road_segments")
        .select("*")
        .eq("toll_country_id", countryId)
        .eq("is_active", true)
        .order("segment_code");
      if (segErr) throw segErr;

      return NextResponse.json({ rates, segments });
    }

    if (dataType === "vignettes") {
      const { data, error } = await supabase
        .from("toll_vignettes")
        .select(`
          *,
          emission_class:toll_vehicle_categories!toll_vignettes_emission_class_id_fkey(id, name, code),
          axle_category:toll_vehicle_categories!toll_vignettes_axle_category_id_fkey(id, name, code),
          weight_class:toll_vehicle_categories!toll_vignettes_weight_class_id_fkey(id, name, code)
        `)
        .eq("toll_country_id", countryId)
        .eq("is_active", true)
        .order("vignette_type")
        .order("price");
      if (error) throw error;
      return NextResponse.json({ vignettes: data });
    }

    if (dataType === "sections") {
      const { data, error } = await supabase
        .from("toll_section_rates")
        .select(`
          *,
          axle_category:toll_vehicle_categories!toll_section_rates_axle_category_id_fkey(id, name, code)
        `)
        .eq("toll_country_id", countryId)
        .eq("is_active", true)
        .order("road_number")
        .order("from_location");
      if (error) throw error;
      return NextResponse.json({ sections: data });
    }

    if (dataType === "special") {
      const { data, error } = await supabase
        .from("toll_special_charges")
        .select(`
          *,
          axle_category:toll_vehicle_categories!toll_special_charges_axle_category_id_fkey(id, name, code),
          weight_class:toll_vehicle_categories!toll_special_charges_weight_class_id_fkey(id, name, code)
        `)
        .eq("toll_country_id", countryId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return NextResponse.json({ special_charges: data });
    }

    if (dataType === "history") {
      const { data, error } = await supabase
        .from("toll_rate_history")
        .select("*")
        .eq("toll_country_id", countryId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return NextResponse.json({ history: data });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err: any) {
    console.error("[toll-rates] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Create or update toll rates, vignettes, special charges
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json();
  const { action, data } = body;

  try {
    if (action === "upsert_rate") {
      // Calculate total_per_km from breakdown
      const totalPerKm = (
        (Number(data.infrastructure_rate) || 0) +
        (Number(data.air_pollution_rate) || 0) +
        (Number(data.noise_rate) || 0) +
        (Number(data.co2_surcharge) || 0)
      );
      const rateData = {
        ...data,
        rate_per_km: data.infrastructure_rate || 0,
        surcharge_per_km: (Number(data.air_pollution_rate) || 0) + (Number(data.noise_rate) || 0) + (Number(data.co2_surcharge) || 0),
        total_per_km: totalPerKm,
      };

      if (data.id) {
        // Update existing
        const { data: updated, error } = await supabase
          .from("toll_rates")
          .update(rateData)
          .eq("id", data.id)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ rate: updated });
      } else {
        const { data: created, error } = await supabase
          .from("toll_rates")
          .insert(rateData)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ rate: created });
      }
    }

    if (action === "upsert_vignette") {
      if (data.id) {
        const { data: updated, error } = await supabase
          .from("toll_vignettes")
          .update(data)
          .eq("id", data.id)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ vignette: updated });
      } else {
        const { data: created, error } = await supabase
          .from("toll_vignettes")
          .insert(data)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ vignette: created });
      }
    }

    if (action === "upsert_special_charge") {
      if (data.id) {
        const { data: updated, error } = await supabase
          .from("toll_special_charges")
          .update(data)
          .eq("id", data.id)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ special_charge: updated });
      } else {
        const { data: created, error } = await supabase
          .from("toll_special_charges")
          .insert(data)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ special_charge: created });
      }
    }

    if (action === "update_country") {
      const { data: updated, error } = await supabase
        .from("toll_countries")
        .update(data)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ country: updated });
    }

    if (action === "delete_rate") {
      const { error } = await supabase
        .from("toll_rates")
        .update({ is_active: false })
        .eq("id", data.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "delete_vignette") {
      const { error } = await supabase
        .from("toll_vignettes")
        .update({ is_active: false })
        .eq("id", data.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "delete_special_charge") {
      const { error } = await supabase
        .from("toll_special_charges")
        .update({ is_active: false })
        .eq("id", data.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // ─── Calculate Tolls for a Route ───────────────────
    if (action === "calculate_tolls") {
      const { country_codes, distances, road_types, vehicle_profile } = data;
      // road_types: Record<string, { motorway_km: number; main_road_km: number }> -- from Valhalla

      // Fetch countries
      const { data: countries, error: cErr } = await supabase
        .from("toll_countries")
        .select("*")
        .in("country_code", country_codes);
      if (cErr) throw cErr;

      // Resolve ALL vehicle category codes to UUIDs in one query
      const allCodes = new Set<string>();
      if (vehicle_profile.emission_class) allCodes.add(vehicle_profile.emission_class);
      if (vehicle_profile.axle_category) allCodes.add(vehicle_profile.axle_category);
      if (vehicle_profile.weight_class) allCodes.add(vehicle_profile.weight_class);
      if (vehicle_profile.co2_class) allCodes.add(vehicle_profile.co2_class);
      // Always include AXLE_4 for countries where AXLE_5_PLUS maps to Cat4+
      allCodes.add("AXLE_4");

      const categoryMap: Record<string, string> = {};
      if (allCodes.size > 0) {
        const { data: cats } = await supabase
          .from("toll_vehicle_categories")
          .select("id, code, admin_id")
          .in("code", Array.from(allCodes));
        if (cats) {
          for (const c of cats) {
            if (!categoryMap[c.code]) categoryMap[c.code] = c.id;
          }
        }
      }

      const emissionId = vehicle_profile.emission_class ? categoryMap[vehicle_profile.emission_class] : null;
      const axleId = vehicle_profile.axle_category ? categoryMap[vehicle_profile.axle_category] : null;
      const co2Id = vehicle_profile.co2_class ? categoryMap[vehicle_profile.co2_class] : null;
      const weightId = vehicle_profile.weight_class ? categoryMap[vehicle_profile.weight_class] : null;
      const axle4Id = categoryMap["AXLE_4"] || null;

      // ─── Country-specific rate finders ───────────────
      // Each returns a single best-match rate row or null

      // AUSTRIA: emission_class + axle (Cat2/3/4+) + co2_class, road_segment=motorway
      // AXLE_5_PLUS maps to AXLE_4 (Cat4+ covers all 4+ axles)
      async function findRateAT(countryId: string, log: string[]) {
        const effectiveAxle = (vehicle_profile.axle_category === "AXLE_5_PLUS" && axle4Id) ? axle4Id : axleId;
        if (vehicle_profile.axle_category === "AXLE_5_PLUS" && axle4Id) {
          log.push(`AT axle mapping: AXLE_5_PLUS -> AXLE_4 (Cat4+ covers 4+ axles)`);
        }

        // Get motorway segment
        const { data: segs } = await supabase.from("toll_road_segments").select("id").eq("toll_country_id", countryId).eq("segment_code", "motorway").limit(1);
        const mwId = segs?.[0]?.id;

        // Try: emission + axle + co2 + segment (exact)
        let q = supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true);
        if (emissionId) q = q.eq("emission_class_id", emissionId);
        if (effectiveAxle) q = q.eq("axle_category_id", effectiveAxle);
        if (co2Id) q = q.eq("co2_class_id", co2Id);
        if (mwId) q = q.eq("road_segment_id", mwId);
        let { data: r } = await q.order("valid_from", { ascending: false }).limit(1);
        if (r?.[0]) { log.push(`Matched: emission + axle + co2 + motorway`); return r[0]; }

        // Drop co2
        q = supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true);
        if (emissionId) q = q.eq("emission_class_id", emissionId);
        if (effectiveAxle) q = q.eq("axle_category_id", effectiveAxle);
        if (mwId) q = q.eq("road_segment_id", mwId);
        ({ data: r } = await q.order("valid_from", { ascending: false }).limit(1));
        if (r?.[0]) { log.push(`Matched: emission + axle + motorway (no co2)`); return r[0]; }

        // Drop segment too
        q = supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true);
        if (emissionId) q = q.eq("emission_class_id", emissionId);
        if (effectiveAxle) q = q.eq("axle_category_id", effectiveAxle);
        ({ data: r } = await q.order("valid_from", { ascending: false }).limit(1));
        if (r?.[0]) { log.push(`Matched: emission + axle only`); return r[0]; }

        // Last resort: any rate
        ({ data: r } = await supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true).order("valid_from", { ascending: false }).limit(1));
        if (r?.[0]) { log.push(`Fallback: any AT rate`); return r[0]; }
        return null;
      }

      // GERMANY: emission + axle + weight + co2 (no road_segment used)
      // For >18t trucks, axle determines the rate. For lighter, weight_class matters.
      async function findRateDE(countryId: string, log: string[]) {
        // Try exact: emission + axle + weight + co2
        let q = supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true);
        if (emissionId) q = q.eq("emission_class_id", emissionId);
        if (axleId) q = q.eq("axle_category_id", axleId);
        if (weightId) q = q.eq("weight_class_id", weightId);
        if (co2Id) q = q.eq("co2_class_id", co2Id);
        let { data: r } = await q.order("valid_from", { ascending: false }).limit(1);
        if (r?.[0]) { log.push(`Matched: emission + axle + weight + co2`); return r[0]; }

        // Drop weight (most >18t rates don't use weight_class, only axle)
        q = supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true);
        if (emissionId) q = q.eq("emission_class_id", emissionId);
        if (axleId) q = q.eq("axle_category_id", axleId);
        if (co2Id) q = q.eq("co2_class_id", co2Id);
        ({ data: r } = await q.order("valid_from", { ascending: false }).limit(1));
        if (r?.[0]) { log.push(`Matched: emission + axle + co2 (no weight)`); return r[0]; }

        // Drop co2
        q = supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true);
        if (emissionId) q = q.eq("emission_class_id", emissionId);
        if (axleId) q = q.eq("axle_category_id", axleId);
        ({ data: r } = await q.order("valid_from", { ascending: false }).limit(1));
        if (r?.[0]) { log.push(`Matched: emission + axle only`); return r[0]; }

        // Emission only
        q = supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true);
        if (emissionId) q = q.eq("emission_class_id", emissionId);
        ({ data: r } = await q.order("valid_from", { ascending: false }).limit(1));
        if (r?.[0]) { log.push(`Matched: emission only`); return r[0]; }

        // Last resort
        ({ data: r } = await supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true).order("valid_from", { ascending: false }).limit(1));
        if (r?.[0]) { log.push(`Fallback: any DE rate`); return r[0]; }
        return null;
      }

      // HUNGARY: emission + axle (J-category) + road_type
      // Returns { motorway: rate, main_road: rate } for split calculation
      async function findRatesHU(countryId: string, log: string[]): Promise<{ motorway: any; main_road: any }> {
        const result: { motorway: any; main_road: any } = { motorway: null, main_road: null };

        for (const roadType of ["motorway", "main_road"] as const) {
          let q = supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true).eq("road_type", roadType);
          if (emissionId) q = q.eq("emission_class_id", emissionId);
          if (axleId) q = q.eq("axle_category_id", axleId);
          const { data: r } = await q.order("valid_from", { ascending: false }).limit(1);
          if (r?.[0]) {
            result[roadType] = r[0];
            log.push(`HU ${roadType}: matched emission + axle -> ${Number(r[0].total_per_km || r[0].rate_per_km).toFixed(2)} HUF/km ("${r[0].notes}")`);
          } else {
            log.push(`HU ${roadType}: no exact match, trying axle only`);
            let q2 = supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true).eq("road_type", roadType);
            if (axleId) q2 = q2.eq("axle_category_id", axleId);
            const { data: r2 } = await q2.order("valid_from", { ascending: false }).limit(1);
            if (r2?.[0]) {
              result[roadType] = r2[0];
              log.push(`HU ${roadType}: fallback axle only -> ${Number(r2[0].total_per_km || r2[0].rate_per_km).toFixed(2)} HUF/km`);
            }
          }
        }

        // If we still have nothing, get any HU rate as last resort
        if (!result.motorway && !result.main_road) {
          const { data: r } = await supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true).order("valid_from", { ascending: false }).limit(1);
          if (r?.[0]) {
            result.motorway = r[0];
            result.main_road = r[0];
            log.push(`HU fallback: any rate -> ${Number(r[0].total_per_km || r[0].rate_per_km).toFixed(2)} HUF/km`);
          }
        }
        // If only one type found, use it for both
        if (result.motorway && !result.main_road) result.main_road = result.motorway;
        if (result.main_road && !result.motorway) result.motorway = result.main_road;

        return result;
      }

      // Legacy single-rate wrapper for HU (used when no road_types breakdown available)
      async function findRateHU(countryId: string, log: string[]) {
        const rates = await findRatesHU(countryId, log);
        return rates.motorway; // Default to motorway rate
      }

      // SIMPLE countries (BE, CZ, PL, SK, CH, etc.): emission + optional axle/weight
      async function findRateSimple(countryId: string, log: string[]) {
        // Try emission + axle
        let q = supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true);
        if (emissionId) q = q.eq("emission_class_id", emissionId);
        if (axleId) q = q.eq("axle_category_id", axleId);
        let { data: r } = await q.order("valid_from", { ascending: false }).limit(1);
        if (r?.[0]) { log.push(`Matched: emission + axle`); return r[0]; }

        // Emission only
        q = supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true);
        if (emissionId) q = q.eq("emission_class_id", emissionId);
        ({ data: r } = await q.order("valid_from", { ascending: false }).limit(1));
        if (r?.[0]) { log.push(`Matched: emission only`); return r[0]; }

        // Any rate
        ({ data: r } = await supabase.from("toll_rates").select("*").eq("toll_country_id", countryId).eq("is_active", true).order("valid_from", { ascending: false }).limit(1));
        if (r?.[0]) { log.push(`Fallback: any rate`); return r[0]; }
        return null;
      }

      // ─── Dispatcher: pick the right finder per country ───
      function getRateFinder(countryCode: string) {
        switch (countryCode) {
          case "AT": return findRateAT;
          case "DE": return findRateDE;
          case "HU": return findRateHU;
          default: return findRateSimple;
        }
      }

      // ─── Process each country ───────────────────────────
      const tolls: Record<string, any> = {};

      for (const code of country_codes) {
        const country = countries?.find(c => c.country_code === code);
        const distanceKm = distances[code] || 0;

        if (!country) {
          tolls[code] = { toll_type: "none", rate_per_km: 0, distance_cost: 0, vignette_cost: 0, special_charges: 0, currency: "EUR", infrastructure: 0, air_pollution: 0, noise: 0, co2_surcharge: 0 };
          continue;
        }

        let distanceCost = 0;
        let vignetteCost = 0;
        let ratePerKm = 0;
        let infrastructure = 0;
        let airPollution = 0;
        let noise = 0;
        let co2Surcharge = 0;
        const calcLog: string[] = [];

        calcLog.push(`--- ${code} (${country.country_name}) ---`);
        calcLog.push(`Distance: ${distanceKm} km`);
        calcLog.push(`Vehicle: emission=${vehicle_profile.emission_class || "any"}, axle=${vehicle_profile.axle_category || "any"}, co2=${vehicle_profile.co2_class || "any"}, weight=${vehicle_profile.weight_class || "any"}`);
        calcLog.push(`Toll system: distance=${country.has_distance_based}, vignette=${country.has_vignette}, section=${country.has_section_based}`);

        // Distance-based tolls
        if (country.has_distance_based && distanceKm > 0) {
          calcLog.push(`\n[Distance-based: ${code}-specific lookup]`);
          const countryRoadInfo = road_types?.[code];

          // For Hungary: split motorway and main_road if we have road type data
          if (code === "HU" && countryRoadInfo && (countryRoadInfo.motorway_km > 0 || countryRoadInfo.main_road_km > 0)) {
            const mwKm = countryRoadInfo.motorway_km || 0;
            const mrKm = countryRoadInfo.main_road_km || 0;
            calcLog.push(`Road split: motorway=${mwKm}km, main_road=${mrKm}km`);

            const huRates = await findRatesHU(country.id, calcLog);

            const applyHuRate = (rate: any, km: number, label: string) => {
              if (!rate || km <= 0) return { cost: 0, infra: 0, air: 0, noise: 0, co2: 0, ratePerKm: 0 };
              const rpk = Number(rate.total_per_km) || Number(rate.rate_per_km) || 0;
              const i = (Number(rate.infrastructure_rate) || 0) * km;
              const a = (Number(rate.air_pollution_rate) || 0) * km;
              const n = (Number(rate.noise_rate) || 0) * km;
              const c = (Number(rate.co2_surcharge) || 0) * km;
              calcLog.push(`${label}: ${rpk.toFixed(2)} HUF/km x ${km}km = ${(rpk * km).toFixed(0)} HUF`);
              return { cost: rpk * km, infra: i, air: a, noise: n, co2: c, ratePerKm: rpk };
            };

            const mwResult = applyHuRate(huRates.motorway, mwKm, "Motorway");
            const mrResult = applyHuRate(huRates.main_road, mrKm, "Main road");

            distanceCost = mwResult.cost + mrResult.cost;
            infrastructure = mwResult.infra + mrResult.infra;
            airPollution = mwResult.air + mrResult.air;
            noise = mwResult.noise + mrResult.noise;
            co2Surcharge = mwResult.co2 + mrResult.co2;
            ratePerKm = distanceKm > 0 ? distanceCost / distanceKm : 0; // Weighted average
            calcLog.push(`Total HU: ${distanceCost.toFixed(0)} HUF (avg ${ratePerKm.toFixed(2)} HUF/km)`);

          } else {
            // Standard path: single rate per country
            const finder = getRateFinder(code);
            const rate = await finder(country.id, calcLog);

            if (rate) {
              const infra = Number(rate.infrastructure_rate) || 0;
              const air = Number(rate.air_pollution_rate) || 0;
              const noiseR = Number(rate.noise_rate) || 0;
              const co2 = Number(rate.co2_surcharge) || 0;
              ratePerKm = Number(rate.total_per_km) || Number(rate.rate_per_km) || (infra + air + noiseR + co2);
              distanceCost = ratePerKm * distanceKm;
              infrastructure = infra * distanceKm;
              airPollution = air * distanceKm;
              noise = noiseR * distanceKm;
              co2Surcharge = co2 * distanceKm;

              calcLog.push(`Rate: "${rate.notes || "n/a"}" (valid_from: ${rate.valid_from})`);
              calcLog.push(`Per-km (net): total=${ratePerKm.toFixed(4)} ${country.currency}/km`);
              calcLog.push(`Net cost = ${ratePerKm.toFixed(4)} x ${distanceKm} = ${distanceCost.toFixed(2)} ${country.currency}`);
            } else {
              calcLog.push(`WARNING: No rate found for ${code}!`);
            }
          }

          // Apply country-specific VAT where tolls are charged gross (incl. VAT)
          // AT: 20% VAT on ASFINAG toll. DE: no VAT (government fee). HU: rates already include 27% VAT.
          const VAT_RATES: Record<string, number> = { "AT": 0.20 };
          const vatRate = VAT_RATES[code] || 0;
          if (vatRate > 0 && distanceCost > 0) {
            const netCost = distanceCost;
            distanceCost = distanceCost * (1 + vatRate);
            ratePerKm = ratePerKm * (1 + vatRate);
            infrastructure = infrastructure * (1 + vatRate);
            airPollution = airPollution * (1 + vatRate);
            noise = noise * (1 + vatRate);
            co2Surcharge = co2Surcharge * (1 + vatRate);
            calcLog.push(`VAT ${(vatRate * 100).toFixed(0)}%: ${netCost.toFixed(2)} -> ${distanceCost.toFixed(2)} ${country.currency} (gross per-km: ${ratePerKm.toFixed(4)})`);
          }
        }

        // Vignette costs
        if (country.has_vignette) {
          calcLog.push(`\n[Vignette lookup]`);
          const { data: vignettes } = await supabase
            .from("toll_vignettes")
            .select("*")
            .eq("toll_country_id", country.id)
            .eq("is_active", true)
            .eq("vehicle_type", "truck")
            .order("duration_days", { ascending: true })
            .limit(1);

          if (vignettes?.[0]) {
            vignetteCost = Number(vignettes[0].price) || 0;
            calcLog.push(`Vignette: ${vignettes[0].name || vignettes[0].vehicle_type} - ${vignetteCost} ${country.currency} (${vignettes[0].duration_days} days)`);
          } else {
            calcLog.push(`No truck vignette found for ${code}`);
          }
        }

        const tollType = country.has_distance_based ? "distance_based" : country.has_vignette ? "vignette" : country.has_section_based ? "section_based" : "none";

        calcLog.push(`\n[Summary] type=${tollType}, distance=${Math.round(distanceCost)} ${country.currency}, vignette=${Math.round(vignetteCost)} ${country.currency}, TOTAL=${Math.round(distanceCost + vignetteCost)} ${country.currency}`);

        tolls[code] = {
          toll_type: tollType,
          rate_per_km: Math.round(ratePerKm * 100) / 100,
          distance_cost: Math.round(distanceCost),
          vignette_cost: Math.round(vignetteCost),
          special_charges: 0,
          currency: country.currency || "EUR",
          infrastructure: Math.round(infrastructure),
          air_pollution: Math.round(airPollution),
          noise: Math.round(noise),
          co2_surcharge: Math.round(co2Surcharge),
          calc_log: calcLog,
        };
      }

      return NextResponse.json({ tolls });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("[toll-rates] POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
