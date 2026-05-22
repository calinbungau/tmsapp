import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getDevicePosition, type TraccarCredentials } from "@/lib/traccar";

/**
 * Public, unauthenticated read endpoint for a tracking share.
 *
 *   GET /api/track/[token]
 *
 * Returns:
 *   - share metadata (expiry, gps_source, display flags)
 *   - resource label (vehicle plate / trailer plate / driver name)
 *   - current live position (lat/lng + speed/heading/last_update)
 *   - order stops (if show_stops) and status (if show_status)
 *
 * Errors:
 *   404 → unknown token
 *   410 → revoked or expired
 *
 * The route uses the service-role client to bypass RLS because the
 * customer has no Supabase session, but it intentionally only joins
 * tables required to render the public map — invoices, costs, etc.
 * are never exposed. It also bumps view_count/last_viewed_at so the
 * operator can verify the customer actually opened the link.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data: share } = await supabase
    .from("order_tracking_shares")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!share) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
  if (share.revoked_at) {
    return NextResponse.json({ error: "This tracking link has been revoked." }, { status: 410 });
  }
  // Pending-window check: starts_at can be scheduled in the future
  // (e.g. for a load that hasn't shipped yet). We return 425 Too Early
  // with the activation time so the public page can render a friendly
  // "Available from …" state rather than just a hard error.
  if (share.starts_at && new Date(share.starts_at).getTime() > Date.now()) {
    return NextResponse.json(
      {
        error: "This tracking link is not active yet.",
        starts_at: share.starts_at,
        expires_at: share.expires_at,
      },
      { status: 425 }
    );
  }
  if (new Date(share.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This tracking link has expired." }, { status: 410 });
  }

  // Fetch the chosen GPS resource label + traccar device id (for vehicles/trailers).
  let resourceLabel = "Shipment";
  let resourceSubLabel: string | null = null;
  let traccarDeviceId: string | null = null;
  let driverPosition: { lat: number; lng: number; last_seen_at: string | null } | null = null;

  if (share.gps_source === "vehicle" && share.vehicle_id) {
    const { data: v } = await supabase
      .from("vehicles")
      .select("plate_number, model, traccar_device_id")
      .eq("id", share.vehicle_id)
      .maybeSingle();
    resourceLabel = v?.plate_number || "Vehicle";
    resourceSubLabel = v?.model || null;
    traccarDeviceId = v?.traccar_device_id || null;
  } else if (share.gps_source === "trailer" && share.trailer_id) {
    const { data: t } = await supabase
      .from("trailers")
      .select("plate_number, trailer_type, traccar_device_id")
      .eq("id", share.trailer_id)
      .maybeSingle();
    resourceLabel = t?.plate_number || "Trailer";
    resourceSubLabel = t?.trailer_type || null;
    traccarDeviceId = t?.traccar_device_id || null;
  } else if (share.gps_source === "driver" && share.driver_id) {
    const { data: d } = await supabase
      .from("drivers")
      .select("name, last_lat, last_lng, last_seen_at")
      .eq("id", share.driver_id)
      .maybeSingle();
    resourceLabel = d?.name || "Driver";
    if (d?.last_lat != null && d?.last_lng != null) {
      driverPosition = {
        lat: d.last_lat,
        lng: d.last_lng,
        last_seen_at: d.last_seen_at || null,
      };
    }
  }

  // Fetch live GPS position from Traccar for vehicle/trailer.
  // Driver positions come from drivers.last_lat/last_lng (mobile app).
  let position: {
    lat: number;
    lng: number;
    speed_kmh: number | null;
    course: number | null;
    last_update: string | null;
    address: string | null;
  } | null = null;

  if (driverPosition) {
    position = {
      lat: driverPosition.lat,
      lng: driverPosition.lng,
      speed_kmh: null,
      course: null,
      last_update: driverPosition.last_seen_at,
      address: null,
    };
  } else if (traccarDeviceId) {
    const { data: admin } = await supabase
      .from("admins")
      .select("traccar_server_url, traccar_email, traccar_password")
      .eq("id", share.admin_id)
      .maybeSingle();

    if (admin?.traccar_server_url && admin?.traccar_email && admin?.traccar_password) {
      const credentials: TraccarCredentials = {
        serverUrl: admin.traccar_server_url,
        email: admin.traccar_email,
        password: admin.traccar_password,
      };
      try {
        const pos = await getDevicePosition(credentials, Number(traccarDeviceId));
        if (pos) {
          position = {
            lat: pos.latitude,
            lng: pos.longitude,
            speed_kmh: Math.round(pos.speed * 1.852),
            course: pos.course || 0,
            last_update: pos.deviceTime,
            address: pos.address,
          };
        }
      } catch (err) {
        // Traccar momentarily unreachable — let the page render with
        // no position. The page polls again every 30s so this self-heals.
        console.warn("[track] traccar fetch failed", err);
      }
    }
  }

  // Order metadata for the customer-facing card. We only need the
  // reference + status here — the business partner (customer record)
  // is intentionally NOT exposed on the public page. The only
  // brand-bearing entity shown is the carrier itself (the app user)
  // via their company_profiles row.
  const { data: order } = await supabase
    .from("orders")
    .select("reference_number, customer_reference, status")
    .eq("id", share.order_id)
    .maybeSingle();

  const { data: companyProfile } = await supabase
    .from("company_profiles")
    .select("company_name, logo_url")
    .eq("admin_id", share.admin_id)
    .maybeSingle();

  // Optional stops list.
  let stops: any[] = [];
  if (share.show_stops) {
    const { data } = await supabase
      .from("order_stops")
      .select(
        "id, stop_type, sequence_order, company_name, city, country, postal_code, address, planned_date, planned_time_from, planned_time_to, actual_arrival, actual_departure, execution_status, lat, lng"
      )
      .eq("order_id", share.order_id)
      .order("sequence_order", { ascending: true });
    stops = data || [];
  }

  // Bump usage stats fire-and-forget. We don't await because the
  // customer's page load should not block on this.
  supabase
    .from("order_tracking_shares")
    .update({
      view_count: (share.view_count || 0) + 1,
      last_viewed_at: new Date().toISOString(),
    })
    .eq("id", share.id)
    .then(() => {});

  return NextResponse.json({
    starts_at: share.starts_at,
    expires_at: share.expires_at,
    show_status: share.show_status,
    show_stops: share.show_stops,
    show_eta: share.show_eta,
    resource_label: resourceLabel,
    resource_sub_label: resourceSubLabel,
    gps_source: share.gps_source,
    position,
    order: order
      ? {
          reference: order.customer_reference || order.reference_number,
          status: share.show_status ? order.status : null,
        }
      : null,
    stops,
    // Branding: only the carrier's own Company Profile logo is shown
    // on the public page. The BNG Tracking app brand is hard-coded
    // client-side, so it doesn't need to come from the server.
    provider: companyProfile
      ? {
          name: companyProfile.company_name || null,
          logo_url: companyProfile.logo_url || null,
        }
      : null,
  });
}
