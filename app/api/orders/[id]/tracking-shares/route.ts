import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import { randomBytes } from "crypto";
import nodemailer from "nodemailer";
import { getUserEmailSettingsRow } from "@/lib/user-email-settings";

/**
 * Admin-side API for managing customer-facing tracking-link shares.
 *
 *   GET    /api/orders/[id]/tracking-shares
 *     → list all shares for an order (active + revoked + expired), plus
 *       the catalog of GPS-bearing resources the operator can choose
 *       from (vehicles+trailers with traccar_device_id, drivers with
 *       last_lat/last_lng) drawn from the parent order, its subcontract
 *       children, and any trip_legs that reference them.
 *
 *   POST   /api/orders/[id]/tracking-shares
 *     → create a new share. body: { gps_source, vehicle_id?, trailer_id?,
 *       driver_id?, expires_at, show_status, show_stops, show_eta,
 *       recipient_email?, custom_message?, base_url }.
 *       If recipient_email is provided, also email the link via the
 *       admin's user_email_settings SMTP. Returns the full share row +
 *       generated public URL.
 *
 *   PATCH  /api/orders/[id]/tracking-shares/[shareId]  → handled via ?id=
 *     → update expiry / GPS source / display flags / revoked_at / resend.
 *       body: { share_id, ...partialFields, resend?: boolean,
 *       recipient_email?: string }
 *
 *   DELETE /api/orders/[id]/tracking-shares?id=...
 *     → hard delete (rare; revoke is the soft-delete path).
 *
 * Tenant isolation: every read/write filters by admin_id, sourced from
 * the x-admin-id header that the calling client supplies (same pattern
 * as send-docs-to-customer).
 */

function getSupabase() { return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
); }

function getAdminId(req: NextRequest): string | null {
  return req.headers.get("x-admin-id");
}

function getUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

/**
 * Generate a URL-safe random token. 24 bytes → 32 base64url chars,
 * giving us 192 bits of entropy. That's well above the threshold
 * where token guessing is feasible even with adversarial collision
 * probing.
 */
function mintToken(): string {
  return randomBytes(24).toString("base64url");
}

// ─────────────────────────────────────────────────────────────────────────
// Resource discovery — what GPS-bearing assets can the operator pick?
//
// We return EVERY GPS-capable asset in the admin's master data, but
// tag each one with `in_order: true` when it's referenced by the
// order itself or any of its subcontract children (directly on the
// order row OR via trip_legs). The dialog uses that flag to group
// the dropdown — "On this order" first, then "Other assets" — so the
// operator can also pick an asset that was never formally assigned
// (e.g. a last-minute swap that hasn't been entered yet).
// ─────────────────────────────────────────────────────────────────────────
async function collectGpsResources(
  supabase: ReturnType<typeof getSupabase>,
  orderId: string,
  adminId: string
) {
  // 1. Find the parent + all subcontract children so we know which
  //    assets are "on" the order.
  const { data: childOrders } = await supabase
    .from("orders")
    .select("id")
    .eq("parent_order_id", orderId);
  const orderIds = [orderId, ...(childOrders?.map((o) => o.id) || [])];

  // 2. Pull direct resource refs from the orders themselves
  const { data: orderRows } = await supabase
    .from("orders")
    .select("id, vehicle_id, trailer_id, driver_id")
    .in("id", orderIds);

  // 3. And from any trip_legs referencing these orders (subcontract
  //    children may have their assignments stored on trip_legs rather
  //    than the order itself).
  const { data: legs } = await supabase
    .from("trip_legs")
    .select("vehicle_id, trailer_id, driver_id, forwarding_order_id")
    .in("forwarding_order_id", orderIds);

  // Compute the in-order ID sets — used only as a lookup, not as a
  // filter, since we now return all admin assets.
  const inOrderVehicleIds = new Set<string>();
  const inOrderTrailerIds = new Set<string>();
  const inOrderDriverIds = new Set<string>();
  for (const o of orderRows || []) {
    if (o.vehicle_id) inOrderVehicleIds.add(o.vehicle_id);
    if (o.trailer_id) inOrderTrailerIds.add(o.trailer_id);
    if (o.driver_id) inOrderDriverIds.add(o.driver_id);
  }
  for (const l of legs || []) {
    if (l.vehicle_id) inOrderVehicleIds.add(l.vehicle_id);
    if (l.trailer_id) inOrderTrailerIds.add(l.trailer_id);
    if (l.driver_id) inOrderDriverIds.add(l.driver_id);
  }

  // 4. Pull EVERY GPS-capable resource for this admin from master data.
  //    GPS-capable means:
  //      - vehicle / trailer: a non-null traccar_device_id
  //      - driver: last_lat AND last_lng populated (set by mobile app
  //        heartbeats) — without coordinates we have nothing to plot
  //    We still return order-referenced assets that lack GPS, since
  //    the operator may want to see why their preferred asset isn't
  //    selectable and the dialog renders a "No GPS" badge for them.
  const [allVehiclesRes, allTrailersRes, allDriversRes] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, plate_number, model, traccar_device_id")
      .eq("admin_id", adminId)
      .not("traccar_device_id", "is", null)
      .order("plate_number", { ascending: true }),
    supabase
      .from("trailers")
      .select("id, plate_number, trailer_type, traccar_device_id")
      .eq("admin_id", adminId)
      .not("traccar_device_id", "is", null)
      .order("plate_number", { ascending: true }),
    supabase
      .from("drivers")
      .select("id, name, last_lat, last_lng, last_seen_at, phone")
      .eq("admin_id", adminId)
      .not("last_lat", "is", null)
      .not("last_lng", "is", null)
      .order("name", { ascending: true }),
  ]);

  // Also fetch order-referenced assets that may NOT pass the GPS
  // filter — we want them visible (greyed out / "No GPS" badge) so
  // the operator knows why they can't pick them. We dedupe against
  // the all-list via the id set below.
  const allVehicleIds = new Set((allVehiclesRes.data || []).map((v: any) => v.id));
  const allTrailerIds = new Set((allTrailersRes.data || []).map((t: any) => t.id));
  const allDriverIds = new Set((allDriversRes.data || []).map((d: any) => d.id));

  const missingVehicleIds = [...inOrderVehicleIds].filter((id) => !allVehicleIds.has(id));
  const missingTrailerIds = [...inOrderTrailerIds].filter((id) => !allTrailerIds.has(id));
  const missingDriverIds = [...inOrderDriverIds].filter((id) => !allDriverIds.has(id));

  const [extraVehiclesRes, extraTrailersRes, extraDriversRes] = await Promise.all([
    missingVehicleIds.length > 0
      ? supabase
          .from("vehicles")
          .select("id, plate_number, model, traccar_device_id")
          .in("id", missingVehicleIds)
          .eq("admin_id", adminId)
      : Promise.resolve({ data: [] as any[] }),
    missingTrailerIds.length > 0
      ? supabase
          .from("trailers")
          .select("id, plate_number, trailer_type, traccar_device_id")
          .in("id", missingTrailerIds)
          .eq("admin_id", adminId)
      : Promise.resolve({ data: [] as any[] }),
    missingDriverIds.length > 0
      ? supabase
          .from("drivers")
          .select("id, name, last_lat, last_lng, last_seen_at, phone")
          .in("id", missingDriverIds)
          .eq("admin_id", adminId)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const mapVehicle = (v: any) => ({
    id: v.id,
    label: v.plate_number || v.model || "Vehicle",
    sub: v.model || null,
    has_gps: !!v.traccar_device_id,
    in_order: inOrderVehicleIds.has(v.id),
  });
  const mapTrailer = (t: any) => ({
    id: t.id,
    label: t.plate_number || t.trailer_type || "Trailer",
    sub: t.trailer_type || null,
    has_gps: !!t.traccar_device_id,
    in_order: inOrderTrailerIds.has(t.id),
  });
  const mapDriver = (d: any) => ({
    id: d.id,
    label: d.name,
    sub: d.phone || null,
    has_gps: d.last_lat != null && d.last_lng != null,
    last_seen_at: d.last_seen_at,
    in_order: inOrderDriverIds.has(d.id),
  });

  // Combine, then sort: in_order first, then alphabetically by label.
  const sortInOrderFirst = (a: any, b: any) =>
    Number(b.in_order) - Number(a.in_order) || a.label.localeCompare(b.label);

  return {
    vehicles: [
      ...(allVehiclesRes.data || []).map(mapVehicle),
      ...(extraVehiclesRes.data || []).map(mapVehicle),
    ].sort(sortInOrderFirst),
    trailers: [
      ...(allTrailersRes.data || []).map(mapTrailer),
      ...(extraTrailersRes.data || []).map(mapTrailer),
    ].sort(sortInOrderFirst),
    drivers: [
      ...(allDriversRes.data || []).map(mapDriver),
      ...(extraDriversRes.data || []).map(mapDriver),
    ].sort(sortInOrderFirst),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// GET — list shares + GPS resources
// ─────────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();
  const adminId = getAdminId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Missing admin context" }, { status: 401 });
  }
  const { id: orderId } = await params;

  const [sharesRes, resources, orderRes] = await Promise.all([
    supabase
      .from("order_tracking_shares")
      .select("*")
      .eq("order_id", orderId)
      .eq("admin_id", adminId)
      .order("created_at", { ascending: false }),
    collectGpsResources(supabase, orderId, adminId),
    supabase
      .from("orders")
      .select("reference_number, customer_reference, customer:business_partners!customer_id(name, email)")
      .eq("id", orderId)
      .single(),
  ]);

  return NextResponse.json({
    shares: sharesRes.data || [],
    resources,
    order: orderRes.data || null,
  });
}

// ─────────────────────────────────────────────────────────────────────��───
// POST — create a new share
// ─────────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();
  const adminId = getAdminId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Missing admin context" }, { status: 401 });
  }
  const { id: orderId } = await params;

  const body = await req.json();
  const {
    gps_source,
    vehicle_id,
    trailer_id,
    driver_id,
    starts_at,
    expires_at,
    show_status,
    show_stops,
    show_eta,
    recipient_email,
    custom_message,
    base_url,
  } = body || {};

  // ── Validation ──
  if (!["vehicle", "trailer", "driver"].includes(gps_source)) {
    return NextResponse.json({ error: "Invalid gps_source" }, { status: 400 });
  }
  if (gps_source === "vehicle" && !vehicle_id) {
    return NextResponse.json({ error: "vehicle_id is required" }, { status: 400 });
  }
  if (gps_source === "trailer" && !trailer_id) {
    return NextResponse.json({ error: "trailer_id is required" }, { status: 400 });
  }
  if (gps_source === "driver" && !driver_id) {
    return NextResponse.json({ error: "driver_id is required" }, { status: 400 });
  }
  if (!expires_at) {
    return NextResponse.json({ error: "expires_at is required" }, { status: 400 });
  }
  // starts_at defaults to "now" on the DB side, but if the caller
  // supplies one we validate it's before the expiry — otherwise the
  // share would be permanently in a pending state and never become
  // viewable.
  if (starts_at && new Date(starts_at) >= new Date(expires_at)) {
    return NextResponse.json(
      { error: "starts_at must be before expires_at" },
      { status: 400 }
    );
  }

  const token = mintToken();
  const now = new Date().toISOString();

  const { data: created, error: insertErr } = await supabase
    .from("order_tracking_shares")
    .insert({
      admin_id: adminId,
      order_id: orderId,
      token,
      starts_at: starts_at || now,
      expires_at,
      gps_source,
      vehicle_id: gps_source === "vehicle" ? vehicle_id : null,
      trailer_id: gps_source === "trailer" ? trailer_id : null,
      driver_id: gps_source === "driver" ? driver_id : null,
      show_status: show_status !== false,
      show_stops: show_stops !== false,
      show_eta: !!show_eta,
      recipient_email: recipient_email || null,
      created_by: adminId,
    })
    .select()
    .single();

  if (insertErr) {
    console.error("[tracking-shares] insert failed", insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Build the public URL using the base_url the client sent (so we
  // mirror what the customer will actually see — prod, preview, etc.).
  const publicUrl = `${(base_url || "").replace(/\/$/, "")}/track/${token}`;

  // Optionally email the link.
  if (recipient_email) {
    const sent = await sendTrackingEmail({
      supabase,
      adminId,
      userId: getUserId(req),
      orderId,
      recipientEmail: recipient_email,
      customMessage: custom_message,
      publicUrl,
    });
    if (sent.ok) {
      await supabase
        .from("order_tracking_shares")
        .update({ last_sent_at: now })
        .eq("id", created.id);
      created.last_sent_at = now;
    }
    // Note: we don't fail the whole request if email fails — the
    // share is still created and the operator can resend or copy
    // the link manually. The email error surfaces in the response.
    if (!sent.ok) {
      return NextResponse.json({
        share: created,
        public_url: publicUrl,
        email_error: sent.error,
      });
    }
  }

  return NextResponse.json({ share: created, public_url: publicUrl });
}

// ─────────────────────────────────────────────────────────────────────────
// PATCH — update / revoke / resend
// ─────────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();
  const adminId = getAdminId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Missing admin context" }, { status: 401 });
  }
  const { id: orderId } = await params;

  const body = await req.json();
  const {
    share_id,
    starts_at,
    expires_at,
    gps_source,
    vehicle_id,
    trailer_id,
    driver_id,
    show_status,
    show_stops,
    show_eta,
    revoked_at,
    resend,
    recipient_email,
    custom_message,
    base_url,
  } = body || {};

  if (!share_id) {
    return NextResponse.json({ error: "share_id is required" }, { status: 400 });
  }

  // Load current row to ensure tenant ownership and to build the public URL for resend
  const { data: existing, error: loadErr } = await supabase
    .from("order_tracking_shares")
    .select("*")
    .eq("id", share_id)
    .eq("admin_id", adminId)
    .eq("order_id", orderId)
    .single();
  if (loadErr || !existing) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  // Build the partial update only with fields the caller actually set.
  // This avoids overwriting expires_at with undefined on a resend, etc.
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (starts_at !== undefined) patch.starts_at = starts_at;
  if (expires_at !== undefined) patch.expires_at = expires_at;
  // Cross-field validation: if either is being edited, ensure the
  // resulting starts_at < expires_at. We use the patched value if
  // present, otherwise the existing row's value.
  const effectiveStart = patch.starts_at ?? existing.starts_at;
  const effectiveExpiry = patch.expires_at ?? existing.expires_at;
  if (effectiveStart && effectiveExpiry && new Date(effectiveStart) >= new Date(effectiveExpiry)) {
    return NextResponse.json(
      { error: "starts_at must be before expires_at" },
      { status: 400 }
    );
  }
  if (gps_source !== undefined) {
    if (!["vehicle", "trailer", "driver"].includes(gps_source)) {
      return NextResponse.json({ error: "Invalid gps_source" }, { status: 400 });
    }
    patch.gps_source = gps_source;
    patch.vehicle_id = gps_source === "vehicle" ? vehicle_id : null;
    patch.trailer_id = gps_source === "trailer" ? trailer_id : null;
    patch.driver_id = gps_source === "driver" ? driver_id : null;
  }
  if (show_status !== undefined) patch.show_status = !!show_status;
  if (show_stops !== undefined) patch.show_stops = !!show_stops;
  if (show_eta !== undefined) patch.show_eta = !!show_eta;
  if (revoked_at !== undefined) patch.revoked_at = revoked_at;
  if (recipient_email !== undefined) patch.recipient_email = recipient_email || null;

  // ── Resend path ──
  // If resend=true the operator wants to re-send the link to the
  // current (or a new) recipient_email. We don't auto-extend the
  // expiry here — that's a separate, explicit choice in the UI.
  let emailError: string | null = null;
  if (resend) {
    const toEmail = recipient_email || existing.recipient_email;
    if (!toEmail) {
      return NextResponse.json(
        { error: "No recipient email — provide recipient_email to resend" },
        { status: 400 }
      );
    }
    const publicUrl = `${(base_url || "").replace(/\/$/, "")}/track/${existing.token}`;
    const sent = await sendTrackingEmail({
      supabase,
      adminId,
      userId: getUserId(req),
      orderId,
      recipientEmail: toEmail,
      customMessage: custom_message,
      publicUrl,
    });
    if (sent.ok) {
      patch.last_sent_at = new Date().toISOString();
    } else {
      emailError = sent.error || "Unknown email error";
    }
  }

  const { data: updated, error: updErr } = await supabase
    .from("order_tracking_shares")
    .update(patch)
    .eq("id", share_id)
    .select()
    .single();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ share: updated, email_error: emailError });
}

// ─────────────────────────────────────────────────────────────────────────
// DELETE — hard delete (used rarely; prefer revoked_at on PATCH)
// ─────────────────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();
  const adminId = getAdminId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Missing admin context" }, { status: 401 });
  }
  const { id: orderId } = await params;
  const shareId = req.nextUrl.searchParams.get("id");
  if (!shareId) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }
  const { error } = await supabase
    .from("order_tracking_shares")
    .delete()
    .eq("id", shareId)
    .eq("order_id", orderId)
    .eq("admin_id", adminId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

// ─────────────────────────────────────────────────────────────────────────
// Email helper — separated so POST + PATCH (resend) share one path
// ─────────────────────────────────────────────────────────────────────────
async function sendTrackingEmail(args: {
  supabase: ReturnType<typeof getSupabase>;
  adminId: string;
  userId: string | null;
  orderId: string;
  recipientEmail: string;
  customMessage?: string;
  publicUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, adminId, userId, orderId, recipientEmail, customMessage, publicUrl } = args;

  const settings = await getUserEmailSettingsRow(supabase, adminId, userId);
  if (!settings) {
    return {
      ok: false,
      error: "Email settings not configured — set up SMTP in Email > Settings before sending tracking links.",
    };
  }

  // Fetch order ref so the subject can include it. Failures here are
  // not fatal — we just fall back to a generic subject.
  const { data: order } = await supabase
    .from("orders")
    .select("reference_number, customer_reference")
    .eq("id", orderId)
    .single();
  const ref = order?.reference_number || "";
  const custRef = order?.customer_reference || "";
  const subjectRef = custRef
    ? `${custRef}${ref ? ` (our ref: ${ref})` : ""}`
    : ref || "your shipment";

  try {
    const smtpPassword = decrypt(settings.smtp_password_encrypted);
    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_secure,
      auth: { user: settings.smtp_user, pass: smtpPassword },
    });
    const fromAddress = settings.display_name
      ? `"${settings.display_name}" <${settings.email_address}>`
      : settings.email_address;

    const html = `
      <div style="font-family: Arial, sans-serif; color: #1a1a1a; max-width: 600px;">
        <h2 style="margin: 0 0 16px;">Live Tracking — ${subjectRef}</h2>
        ${
          customMessage
            ? `<p style="white-space:pre-wrap">${customMessage}</p>`
            : `<p>Hello,</p>
               <p>You can follow the live location of your shipment ${subjectRef} using the secure link below. The map updates automatically.</p>`
        }
        <p style="margin: 24px 0;">
          <a href="${publicUrl}"
             style="display:inline-block; padding:12px 24px; background:#0284c7; color:#fff; text-decoration:none; border-radius:6px; font-weight:600;">
            Open live tracking
          </a>
        </p>
        <p style="font-size:12px; color:#666;">Or copy this link into your browser:<br>${publicUrl}</p>
      </div>
      ${settings.signature_html ? `<br>${settings.signature_html}` : ""}
    `;

    await transporter.sendMail({
      from: fromAddress,
      to: recipientEmail,
      subject: `Live tracking link — ${subjectRef}`,
      html,
    });

    await supabase.from("order_activity_log").insert({
      order_id: orderId,
      action: "tracking_link_sent_to_customer",
      details: {
        recipient_email: recipientEmail,
        public_url: publicUrl,
        sent_at: new Date().toISOString(),
      },
      performed_by_type: "admin",
      performed_by_id: adminId,
    });

    return { ok: true };
  } catch (err: any) {
    console.error("[tracking-shares] email failed", err);
    return { ok: false, error: err?.message || "SMTP send failed" };
  }
}
