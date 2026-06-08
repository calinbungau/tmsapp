import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared "create a forwarding (FWD) subcontract order for one trip leg" routine.
 *
 * This is the single source of truth for turning a trip leg into a carrier-facing
 * forwarding order. It was originally embedded in
 * `components/tms/trip-leg-assignment-dialog.tsx` (the `fwdOrderMode === "new"`
 * branch). It is now shared so the Freight Exchange award flow can create the
 * FWD order automatically once a carrier wins a leg-scoped offer — using exactly
 * the same battle-tested stop-building / swap-point logic.
 *
 * Behaviour:
 *  - Idempotent: if the leg already has a FWD order via the
 *    `forwarding_order_legs` junction, that order is returned and nothing new is
 *    created.
 *  - Copies parent cargo / customer / pricing / payment terms onto the FWD order.
 *  - Builds leg-specific stops (handles swap points and several fallbacks).
 *  - Persists per-leg route geometry + distance + duration when available.
 *  - Creates an execution trip + trip_stops + a single trip_leg for the FWD order.
 *  - Links the parent leg to the FWD order via the junction table.
 *
 * It deliberately does NOT touch the parent leg's `assignment_type`,
 * `carrier_id`, `subcontractor_*` fields or status — the caller owns those
 * (the dialog writes them via its own `updateData`, and the award flow writes
 * them server-side in the decision route).
 */
export interface CreateForwardingOrderForLegInput {
  adminId: string;
  /** users.id of the acting user (stamped as created_by). Falls back to adminId. */
  creatorId?: string | null;
  parentOrderId: string;
  carrierId: string;
  tripLeg: {
    id: string;
    leg_number: number;
    from_city?: string | null;
    to_city?: string | null;
    from_stop_index?: number | null;
    to_stop_index?: number | null;
    trip_id?: string | null;
  };
  subVehiclePlate?: string | null;
  subTrailerPlate?: string | null;
  subDriverName?: string | null;
  subDriverPhone?: string | null;
}

export interface CreateForwardingOrderForLegResult {
  forwardingOrderId: string | null;
  forwardingOrderRef: string | null;
  /** true when an existing FWD order was reused instead of creating a new one. */
  reused: boolean;
}

export async function createForwardingOrderForLeg(
  supabase: SupabaseClient,
  input: CreateForwardingOrderForLegInput,
): Promise<CreateForwardingOrderForLegResult> {
  const {
    adminId,
    parentOrderId,
    carrierId,
    tripLeg,
    subVehiclePlate = null,
    subTrailerPlate = null,
    subDriverName = null,
    subDriverPhone = null,
  } = input;
  const creatorId = input.creatorId ?? adminId;

  // First, check if a FWD order already exists for this leg via junction table.
  const { data: existingLink } = await supabase
    .from("forwarding_order_legs")
    .select("forwarding_order_id, forwarding_order:orders(id, reference_number)")
    .eq("trip_leg_id", tripLeg.id)
    .maybeSingle();

  if (existingLink?.forwarding_order_id) {
    // FWD order already exists via junction - just use it, don't create new.
    console.log(
      "[v0] createForwardingOrderForLeg: FWD order already exists for this leg:",
      existingLink.forwarding_order_id,
    );
    return {
      forwardingOrderId: existingLink.forwarding_order_id,
      forwardingOrderRef:
        (existingLink.forwarding_order as any)?.reference_number || "",
      reused: true,
    };
  }

  // Create new FWD order with proper reference number and full details.
  // First, fetch parent order details with stops.
  console.log("[v0] createForwardingOrderForLeg: Fetching parent order:", parentOrderId);
  const { data: parentOrder, error: parentOrderErr } = await supabase
    .from("orders")
    .select("*, order_stops(*)")
    .eq("id", parentOrderId)
    .single();

  // Pull the company-level default payment terms so the carrier payment window
  // on the new FWD matches what the operator configured in Settings → Company
  // Profile → Defaults (e.g. 45) instead of falling back to a hardcoded 30.
  const { data: companyProfile } = await supabase
    .from("company_profiles")
    .select("default_payment_terms_days")
    .eq("admin_id", adminId)
    .maybeSingle();
  const defaultPaymentDays = (companyProfile as any)?.default_payment_terms_days ?? 30;
  const carrierPaymentDays =
    (parentOrder as any)?.payment_terms_carrier_days ?? defaultPaymentDays;
  const customerPaymentDays =
    (parentOrder as any)?.payment_terms_customer_days ?? defaultPaymentDays;
  console.log("[v0] createForwardingOrderForLeg: payment terms resolved", {
    defaultPaymentDays,
    carrierPaymentDays,
    customerPaymentDays,
  });

  console.log("[v0] createForwardingOrderForLeg: Parent order fetched:", {
    orderId: parentOrder?.id,
    stopsCount: parentOrder?.order_stops?.length,
    error: parentOrderErr?.message,
  });

  // Get next reference number from series API.
  let newRef = `VMK-${Date.now()}`;
  try {
    const seriesRes = await fetch("/api/series/next-number", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: "forwarding_order", admin_id: adminId }),
    });
    const seriesData = await seriesRes.json();
    if (seriesData.number) newRef = seriesData.number;
  } catch {
    /* Use fallback */
  }

  const { data: newFwdOrder, error: fwdInsertErr } = await supabase
    .from("orders")
    .insert({
      admin_id: adminId,
      // Stamp the actual logged-in user so the dispatcher resolves to their
      // linked employee on the Forwarder Board.
      created_by: creatorId,
      reference_number: newRef,
      order_type: "forwarding",
      commercial_role: "carrier_subcontract",
      parent_order_id: parentOrderId,
      carrier_id: carrierId,
      customer_id: parentOrder?.customer_id,
      customer_reference: parentOrder?.customer_reference,
      status: "fwd_assigned_to_carrier",
      is_draft: false,
      // Copy cargo details from parent (so the carrier sees what they're
      // hauling: ADR class, temperature window, stackability, volume, etc.).
      cargo_description: parentOrder?.cargo_description,
      weight_kg: parentOrder?.weight_kg,
      volume_m3: parentOrder?.volume_m3,
      pallet_count: parentOrder?.pallet_count,
      loading_meters: parentOrder?.loading_meters,
      goods_type: parentOrder?.goods_type,
      adr_class: parentOrder?.adr_class,
      temperature_min: parentOrder?.temperature_min,
      temperature_max: parentOrder?.temperature_max,
      stackable: parentOrder?.stackable,
      special_instructions: parentOrder?.special_instructions,
      internal_notes: parentOrder?.internal_notes,
      // Copy customer pricing from parent order.
      customer_price: parentOrder?.customer_price,
      customer_currency: parentOrder?.customer_currency,
      customer_vat_rate: parentOrder?.customer_vat_rate,
      customer_vat_type: parentOrder?.customer_vat_type,
      customer_vat_amount: parentOrder?.customer_vat_amount,
      customer_price_without_vat: parentOrder?.customer_price_without_vat,
      customer_price_with_vat: parentOrder?.customer_price_with_vat,
      // Payment terms — carrier window from company default, customer window
      // mirrors the parent order. Both still editable on the FWD order page.
      payment_terms_carrier_days: carrierPaymentDays,
      payment_terms_customer_days: customerPaymentDays,
    })
    .select()
    .single();

  console.log(
    "[v0] createForwardingOrderForLeg: FWD order created:",
    newFwdOrder?.id,
    "ref:",
    newFwdOrder?.reference_number,
    "error:",
    fwdInsertErr?.message,
  );

  if (!newFwdOrder) {
    return { forwardingOrderId: null, forwardingOrderRef: null, reused: false };
  }

  const linkedFwdOrderId = newFwdOrder.id as string;
  const linkedFwdOrderRef = newRef;

  // ---- BUILD LEG-SPECIFIC STOPS ---------------------------------
  //
  // CRITICAL: a leg's endpoints are NOT always parent order_stops. A leg often
  // starts/ends at a SWAP POINT, which lives in `trip_stops` but NOT in the
  // parent order's `order_stops`. See the original dialog implementation for
  // the full rationale; the algorithm is preserved verbatim here.
  const { data: legRow } = await supabase
    .from("trip_legs")
    .select(
      "origin_stop_id, destination_stop_id, origin_address, destination_address, trip_id, leg_number",
    )
    .eq("id", tripLeg.id)
    .single();

  let legStops: any[] = [];

  // Build a lookup of parent order_stops by id so we can enrich each trip_stop
  // with order-level metadata.
  const parentStopById = new Map<string, any>();
  for (const ps of parentOrder?.order_stops || []) {
    parentStopById.set(ps.id, ps);
  }

  // ── PRIORITY 0 — SEQUENCE-ORDER BASED LOOKUP (the primary path) ──
  const tripIdForLookup = (legRow as any)?.trip_id ?? (tripLeg as any).trip_id;
  const legNumberForLookup =
    typeof (legRow as any)?.leg_number === "number"
      ? ((legRow as any).leg_number as number)
      : typeof (tripLeg as any).leg_number === "number"
        ? ((tripLeg as any).leg_number as number)
        : null;

  if (tripIdForLookup && legNumberForLookup !== null) {
    const { data: tripAllStops } = await supabase
      .from("trip_stops")
      .select(
        "id, sequence_order, stop_type, city, country, postal_code, address, lat, lng, company_name, contact_name, contact_phone, contact_email, planned_date, planned_time_from, planned_time_to, notes, reference_number, order_stop_id, geofence_radius, auto_checkin, auto_checkout, form_id, action_type_id",
      )
      .eq("trip_id", tripIdForLookup)
      .order("sequence_order", { ascending: true });

    if (tripAllStops && tripAllStops.length >= 2) {
      const legNumber = legNumberForLookup;
      const originIdx = legNumber - 1;
      const destIdx = legNumber;
      const originTs = tripAllStops[originIdx];
      const destTs = tripAllStops[destIdx];

      if (originTs && destTs && originTs.id !== destTs.id) {
        const enrichWithParent = (ts: any) => {
          const parent = ts.order_stop_id ? parentStopById.get(ts.order_stop_id) : null;
          if (!parent) return ts;
          return {
            ...ts,
            company_name: ts.company_name || parent.company_name,
            address: ts.address || parent.address,
            city: ts.city || parent.city,
            country: ts.country || parent.country,
            postal_code: ts.postal_code || parent.postal_code,
            contact_name: ts.contact_name || parent.contact_name,
            contact_phone: ts.contact_phone || parent.contact_phone,
            contact_email: ts.contact_email || parent.contact_email,
            reference_number: ts.reference_number || parent.reference_number,
            notes: ts.notes || parent.notes,
            planned_date: ts.planned_date ?? parent.planned_date,
            planned_time_from: ts.planned_time_from ?? parent.planned_time_from,
            planned_time_to: ts.planned_time_to ?? parent.planned_time_to,
            geofence_radius: ts.geofence_radius ?? parent.geofence_radius,
            auto_checkin: ts.auto_checkin ?? parent.auto_checkin,
            auto_checkout: ts.auto_checkout ?? parent.auto_checkout,
            form_id: ts.form_id ?? parent.form_id,
          };
        };

        legStops = [
          { ...enrichWithParent(originTs), stop_type: "pickup" },
          { ...enrichWithParent(destTs), stop_type: "delivery" },
        ];
        console.log(
          "[v0] createForwardingOrderForLeg: Built leg stops via sequence_order lookup",
          { legNumber, originIdx, destIdx, totalTripStops: tripAllStops.length },
        );
      }
    }
  }

  // ── PRIORITY 1 — Legacy FK path ──
  if (legStops.length === 0 && legRow?.origin_stop_id && legRow?.destination_stop_id) {
    const { data: endpointStops } = await supabase
      .from("trip_stops")
      .select(
        "id, city, country, postal_code, address, lat, lng, company_name, contact_name, contact_phone, contact_email, planned_date, planned_time_from, planned_time_to, notes, reference_number, order_stop_id, geofence_radius, auto_checkin, auto_checkout, form_id, action_type_id",
      )
      .in("id", [legRow.origin_stop_id, legRow.destination_stop_id]);

    const originTs = endpointStops?.find((s: any) => s.id === legRow.origin_stop_id);
    const destTs = endpointStops?.find((s: any) => s.id === legRow.destination_stop_id);

    const matchParentByProximity = (ts: any, targetType: "pickup" | "delivery") => {
      if (typeof ts.lat !== "number" || typeof ts.lng !== "number") return null;
      const candidates = (parentOrder?.order_stops || []).filter((ps: any) => {
        const isCompatibleType =
          (targetType === "pickup" && (ps.stop_type === "pickup" || ps.stop_type === "loading")) ||
          (targetType === "delivery" && (ps.stop_type === "delivery" || ps.stop_type === "unloading"));
        if (!isCompatibleType) return false;
        if (typeof ps.lat !== "number" || typeof ps.lng !== "number") return false;
        const dLat = ps.lat - ts.lat;
        const dLng = ps.lng - ts.lng;
        return dLat * dLat + dLng * dLng < 0.01;
      });
      if (candidates.length === 0) return null;
      return candidates.sort((a: any, b: any) => {
        const da = (a.lat - ts.lat) ** 2 + (a.lng - ts.lng) ** 2;
        const db = (b.lat - ts.lat) ** 2 + (b.lng - ts.lng) ** 2;
        return da - db;
      })[0];
    };

    const mergeWithParent = (ts: any, targetType: "pickup" | "delivery") => {
      let parent = ts.order_stop_id ? parentStopById.get(ts.order_stop_id) : null;
      if (!parent) parent = matchParentByProximity(ts, targetType);
      if (!parent) return ts;
      return {
        ...ts,
        company_name: ts.company_name || parent.company_name,
        address: ts.address || parent.address,
        city: ts.city || parent.city,
        country: ts.country || parent.country,
        postal_code: ts.postal_code || parent.postal_code,
        contact_name: ts.contact_name || parent.contact_name,
        contact_phone: ts.contact_phone || parent.contact_phone,
        contact_email: ts.contact_email || parent.contact_email,
        planned_date: ts.planned_date ?? parent.planned_date,
        planned_time_from: ts.planned_time_from ?? parent.planned_time_from,
        planned_time_to: ts.planned_time_to ?? parent.planned_time_to,
        reference_number: ts.reference_number || parent.reference_number,
        geofence_radius: ts.geofence_radius ?? parent.geofence_radius,
        auto_checkin: ts.auto_checkin ?? parent.auto_checkin,
        auto_checkout: ts.auto_checkout ?? parent.auto_checkout,
        form_id: ts.form_id ?? parent.form_id,
        notes: ts.notes || parent.notes,
      };
    };

    if (originTs && destTs) {
      legStops = [
        { ...mergeWithParent(originTs, "pickup"), stop_type: "pickup" },
        { ...mergeWithParent(destTs, "delivery"), stop_type: "delivery" },
      ];
      console.log(
        "[v0] createForwardingOrderForLeg: Built leg stops from trip_stops endpoints (FK + proximity)",
      );
    }
  }

  // ── Fallback A-prime: TEXT-MATCH against parent order_stops ──
  if (legStops.length === 0 && parentOrder?.order_stops?.length) {
    const norm = (s: string | null | undefined) => (s || "").toString().toLowerCase().trim();
    const originText = `${norm(legRow?.origin_address)} ${norm((tripLeg as any).from_city)} ${norm((tripLeg as any).origin_city)}`.trim();
    const destText = `${norm(legRow?.destination_address)} ${norm((tripLeg as any).to_city)} ${norm((tripLeg as any).destination_city)}`.trim();

    const findParentByText = (text: string, role: "origin" | "destination") => {
      if (!text) return null;
      const acceptedTypes = role === "origin" ? ["pickup", "loading"] : ["delivery", "unloading"];
      const sorted = [...(parentOrder.order_stops || [])].sort(
        (a: any, b: any) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0),
      );
      const candidates = sorted.filter((ps: any) => {
        if (!acceptedTypes.includes(ps.stop_type)) return false;
        const psCity = norm(ps.city);
        const psAddr = norm(ps.address);
        if (psCity && text.includes(psCity)) return true;
        if (psAddr && text.includes(psAddr)) return true;
        return false;
      });
      if (candidates.length === 0) return null;
      return role === "origin" ? candidates[0] : candidates[candidates.length - 1];
    };

    const originParent = findParentByText(originText, "origin");
    const destParent = findParentByText(destText, "destination");

    if (originParent && destParent && originParent.id !== destParent.id) {
      legStops = [
        { ...originParent, stop_type: "pickup" },
        { ...destParent, stop_type: "delivery" },
      ];
      console.log(
        "[v0] createForwardingOrderForLeg: Built leg stops via text-match against parent order_stops",
      );
    }
  }

  // ── Fallback A: synthesize minimal stops from leg's address fields ──
  if (
    legStops.length === 0 &&
    (legRow?.origin_address || (tripLeg as any).from_city) &&
    (legRow?.destination_address || (tripLeg as any).to_city)
  ) {
    legStops = [
      {
        stop_type: "pickup",
        company_name: null,
        address: legRow?.origin_address || (tripLeg as any).from_city || "",
        city: (tripLeg as any).from_city || legRow?.origin_address || "",
        country: null,
        postal_code: null,
        lat: null,
        lng: null,
        planned_date: null,
        planned_time_from: null,
        planned_time_to: null,
        notes: null,
      },
      {
        stop_type: "delivery",
        company_name: null,
        address: legRow?.destination_address || (tripLeg as any).to_city || "",
        city: (tripLeg as any).to_city || legRow?.destination_address || "",
        country: null,
        postal_code: null,
        lat: null,
        lng: null,
        planned_date: null,
        planned_time_from: null,
        planned_time_to: null,
        notes: null,
      },
    ];
    console.log("[v0] createForwardingOrderForLeg: Built leg stops from address fields fallback");
  }

  // ── Fallback B (legacy): slice parent order_stops by indices ──
  if (legStops.length === 0 && parentOrder?.order_stops && parentOrder.order_stops.length > 0) {
    const sortedParentStops = [...parentOrder.order_stops].sort(
      (a: any, b: any) => a.sequence_order - b.sequence_order,
    );
    const fromIdx = tripLeg.from_stop_index ?? 0;
    const toIdx = tripLeg.to_stop_index ?? sortedParentStops.length - 1;
    legStops = sortedParentStops.slice(fromIdx, toIdx + 1);
    console.log(
      "[v0] createForwardingOrderForLeg: WARN - falling back to legacy parent-stop slice logic",
      { fromIdx, toIdx, count: legStops.length },
    );
  }

  console.log(
    "[v0] createForwardingOrderForLeg: Final legStops for FWD order:",
    legStops.length,
    "stops",
  );

  if (legStops.length > 0) {
    const fwdStops = legStops.map((s: any, idx: number) => ({
      order_id: newFwdOrder.id,
      sequence_order: idx + 1,
      stop_type: s.stop_type,
      company_name: s.company_name,
      address: s.address,
      city: s.city,
      country: s.country,
      postal_code: s.postal_code,
      lat: s.lat,
      lng: s.lng,
      contact_name: s.contact_name ?? null,
      contact_phone: s.contact_phone ?? null,
      contact_email: s.contact_email ?? null,
      reference_number: s.reference_number ?? null,
      planned_date: s.planned_date,
      planned_time_from: s.planned_time_from,
      planned_time_to: s.planned_time_to,
      notes: s.notes,
      geofence_radius: s.geofence_radius ?? null,
      auto_checkin: s.auto_checkin ?? null,
      auto_checkout: s.auto_checkout ?? null,
      form_id: s.form_id ?? null,
      status: "pending",
    }));
    const { data: insertedStops, error: fwdStopsErr } = await supabase
      .from("order_stops")
      .insert(fwdStops)
      .select();
    console.log(
      "[v0] createForwardingOrderForLeg: FWD order_stops insert result:",
      fwdStopsErr?.message,
      "inserted:",
      insertedStops?.length,
    );

    // ---- COMPUTE & PERSIST LEG ROUTE GEOMETRY ----
    try {
      const { data: legTripStops } = await supabase
        .from("trip_stops")
        .select("id, sequence_order, route_to_geometry, distance_to_km, duration_to_minutes")
        .eq("leg_id", tripLeg.id)
        .order("sequence_order", { ascending: true });

      if (legTripStops && legTripStops.length >= 2) {
        const concatenatedGeometry: [number, number][] = [];
        let totalDistanceKm = 0;
        let totalDurationMinutes = 0;
        for (let i = 1; i < legTripStops.length; i++) {
          const stop = legTripStops[i];
          const geom = stop.route_to_geometry as [number, number][] | null;
          if (Array.isArray(geom) && geom.length > 0) {
            if (concatenatedGeometry.length === 0) {
              concatenatedGeometry.push(...geom);
            } else {
              concatenatedGeometry.push(...geom.slice(1));
            }
          }
          if (typeof stop.distance_to_km === "number") totalDistanceKm += stop.distance_to_km;
          if (typeof stop.duration_to_minutes === "number")
            totalDurationMinutes += stop.duration_to_minutes;
        }

        if (concatenatedGeometry.length > 0 || totalDistanceKm > 0) {
          const updatePayload: any = {};
          if (concatenatedGeometry.length > 0) updatePayload.route_geometry = concatenatedGeometry;
          if (totalDistanceKm > 0)
            updatePayload.estimated_distance_km = Math.round(totalDistanceKm * 10) / 10;
          if (totalDurationMinutes > 0)
            updatePayload.estimated_duration_hours =
              Math.round((totalDurationMinutes / 60) * 100) / 100;
          await supabase.from("orders").update(updatePayload).eq("id", newFwdOrder.id);
          console.log("[v0] createForwardingOrderForLeg: FWD order route persisted", updatePayload);
        }
      }
    } catch (routeErr) {
      console.log(
        "[v0] createForwardingOrderForLeg: route geometry copy failed (non-fatal):",
        (routeErr as Error)?.message,
      );
    }

    // Create a trip for the FWD order with trip_stops so it can be viewed/executed.
    const { data: fwdTrip, error: tripErr } = await supabase
      .from("trips")
      .insert({
        admin_id: adminId,
        created_by: creatorId,
        reference_number: `TRIP-FWD-${Date.now()}`,
        assignment_type: "forwarding",
        status: "planned",
        carrier_id: carrierId,
      })
      .select()
      .single();

    console.log(
      "[v0] createForwardingOrderForLeg: FWD trip created:",
      fwdTrip?.id,
      "error:",
      tripErr?.message,
    );

    if (fwdTrip) {
      // Link trip to FWD order.
      await supabase.from("trip_orders").insert({ trip_id: fwdTrip.id, order_id: newFwdOrder.id });

      const tripStops = (insertedStops || fwdStops).map((s: any, idx: number) => ({
        trip_id: fwdTrip.id,
        order_stop_id: s.id || null,
        order_id: newFwdOrder.id,
        sequence_order: idx,
        stop_type: s.stop_type,
        company_name: s.company_name,
        address: s.address,
        city: s.city,
        country: s.country,
        postal_code: s.postal_code,
        lat: s.lat,
        lng: s.lng,
        contact_name: s.contact_name ?? null,
        contact_phone: s.contact_phone ?? null,
        contact_email: s.contact_email ?? null,
        reference_number: s.reference_number ?? null,
        planned_date: s.planned_date,
        planned_time_from: s.planned_time_from,
        planned_time_to: s.planned_time_to,
        notes: s.notes,
        geofence_radius: s.geofence_radius ?? null,
        auto_checkin: s.auto_checkin ?? null,
        auto_checkout: s.auto_checkout ?? null,
        form_id: s.form_id ?? null,
        status: "pending",
      }));
      const { error: tripStopsErr } = await supabase.from("trip_stops").insert(tripStops);
      console.log(
        "[v0] createForwardingOrderForLeg: FWD trip_stops inserted:",
        tripStops.length,
        "error:",
        tripStopsErr?.message,
      );

      const { error: legErr } = await supabase.from("trip_legs").insert({
        trip_id: fwdTrip.id,
        leg_number: 1,
        assignment_type: "forwarding",
        status: "assigned",
        carrier_id: carrierId,
        from_stop_index: 0,
        to_stop_index: tripStops.length - 1,
        subcontractor_vehicle_plate: subVehiclePlate || null,
        subcontractor_trailer_plate: subTrailerPlate || null,
        subcontractor_driver_name: subDriverName || null,
        subcontractor_driver_phone: subDriverPhone || null,
      });
      console.log("[v0] createForwardingOrderForLeg: FWD trip_leg created, error:", legErr?.message);

      // Link FWD order to its execution trip.
      await supabase.from("orders").update({ execution_trip_id: fwdTrip.id }).eq("id", newFwdOrder.id);
    }
  } else {
    console.log(
      "[v0] createForwardingOrderForLeg: ERROR - Could not build any stops for FWD order.",
    );
  }

  // Link parent order's leg to new FWD order via junction table.
  await supabase.from("forwarding_order_legs").delete().eq("trip_leg_id", tripLeg.id);
  await supabase.from("forwarding_order_legs").insert({
    forwarding_order_id: newFwdOrder.id,
    trip_leg_id: tripLeg.id,
  });

  return {
    forwardingOrderId: linkedFwdOrderId,
    forwardingOrderRef: linkedFwdOrderRef,
    reused: false,
  };
}
