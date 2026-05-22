import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// SSE proxy: authenticates with Traccar, connects to their WebSocket,
// and streams position/device updates back to the browser as Server-Sent Events.
// Uses the same approach as the working reference Node.js program:
//   1. POST /api/session with form data + Basic Auth to get JSESSIONID
//   2. Connect WebSocket with Cookie header containing JSESSIONID
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Keep the serverless function alive for up to 300s (Pro) or 60s (Hobby)
// This prevents Vercel from killing the streaming SSE + WebSocket connection early
export const maxDuration = 300;

// Rate limit: track last connection attempt per admin to prevent reconnect storms
const lastConnectAttempt = new Map<string, number>();
const MIN_CONNECT_INTERVAL = 5_000; // Minimum 5s between connection attempts per admin

async function getTraccarSession(serverUrl: string, email: string, password: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${serverUrl}/api/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`,
      },
      body: new URLSearchParams({ email, password }).toString(),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Traccar auth failed: ${res.status} ${res.statusText}`);
    const cookies = res.headers.getSetCookie?.() || [];
    const session = cookies.find((c: string) => c.startsWith("JSESSIONID"));
    if (!session) throw new Error("No JSESSIONID cookie");
    return session.split(";")[0]; // "JSESSIONID=xxx"
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const adminId = request.nextUrl.searchParams.get("adminId");
  if (!adminId) return new Response("Missing adminId", { status: 400 });

  // Rate limit: prevent reconnect storms from overwhelming Traccar
  const now = Date.now();
  const lastAttempt = lastConnectAttempt.get(adminId) || 0;
  const timeSinceLast = now - lastAttempt;

  if (timeSinceLast < MIN_CONNECT_INTERVAL) {
    const retryAfter = MIN_CONNECT_INTERVAL - timeSinceLast + 1000;
    const encoder = new TextEncoder();
    const waitStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "rate_limited", retryAfter })}\n\n`));
        // Keep the stream open briefly, then close so browser doesn't auto-retry instantly
        setTimeout(() => { try { controller.close(); } catch {} }, retryAfter);
      },
    });
    return new Response(waitStream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive" },
    });
  }
  lastConnectAttempt.set(adminId, now);

  const supabase = await createClient();
  const { data: admin } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  if (!admin?.traccar_server_url || !admin?.traccar_email || !admin?.traccar_password) {
    return new Response("Traccar not configured", { status: 404 });
  }

  // Get Traccar vehicle mapping (traccar_device_id -> vehicle DB id + plate)
  const { data: vehicleRows } = await supabase
    .from("vehicles")
    .select("id, plate_number, traccar_device_id")
    .eq("admin_id", adminId)
    .eq("is_active", true)
    .not("traccar_device_id", "is", null);

  const deviceToVehicle = new Map<number, { id: string; plate: string }>();
  (vehicleRows || []).forEach((v: any) => {
    if (v.traccar_device_id) deviceToVehicle.set(Number(v.traccar_device_id), { id: v.id, plate: v.plate_number });
  });

  let sessionCookie: string;
  try {
    sessionCookie = await getTraccarSession(admin.traccar_server_url, admin.traccar_email, admin.traccar_password);
  } catch (e: any) {
    // If Traccar is down (503), return SSE with a ws_error so the client falls back to polling
    const encoder = new TextEncoder();
    const errStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ws_error", reason: e.message })}\n\n`));
        controller.close();
      },
    });
    return new Response(errStream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
    });
  }

  // Create SSE stream using the `websocket` npm package (w3cwebsocket)
  // This matches the exact working reference program pattern
  const encoder = new TextEncoder();
  let W3CWebSocket: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const websocketModule = require("websocket");
    W3CWebSocket = websocketModule.w3cwebsocket;
  } catch (requireErr: any) {
    // Fallback: return error SSE so client knows
    const errStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ws_error", reason: "websocket package not available" })}\n\n`));
        controller.close();
      },
    });
    return new Response(errStream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
    });
  }
  let wsInstance: any = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connected event
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`));

      // Connect to Traccar WebSocket -- exact same pattern as the reference program:
      // new W3CWebSocket(wsUrl, null, null, { Cookie: sessionCookie })
      const wsUrl = admin.traccar_server_url!.replace(/^http/, "ws") + "/api/socket";
      const ws = new W3CWebSocket(wsUrl, null, null, { Cookie: sessionCookie });
      wsInstance = ws;

      ws.onopen = () => {
        if (!closed) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ws_open" })}\n\n`));
        }
      };

      ws.onmessage = (event: any) => {
        if (closed) return;
        try {
          const msg = JSON.parse(String(event.data));

          if (msg.positions) {
            const enriched = msg.positions.map((p: any) => {
              const veh = deviceToVehicle.get(p.deviceId);
              const attrs = p.attributes || {};
              return {
                deviceId: p.deviceId,
                vehicleId: veh?.id || null,
                vehiclePlate: veh?.plate || null,
                latitude: p.latitude,
                longitude: p.longitude,
                speed: Math.round((p.speed || 0) * 1.852),
                course: p.course || 0,
                altitude: p.altitude || 0,
                address: p.address || null,
  ignition: attrs.ignition === true,
  motion: attrs.motion === true,
                fuel: attrs.fuel != null ? Number(attrs.fuel) : null,
                totalDistance: attrs.totalDistance ? Math.round(Number(attrs.totalDistance) / 1000) : null,
                engineHours: attrs.hours ? Math.round(Number(attrs.hours) / (1000 * 60 * 60)) : null,
                battery: attrs.battery != null ? Number(attrs.battery) : null,
                power: attrs.power != null ? Number(attrs.power) : null,
                satellites: attrs.sat != null ? Number(attrs.sat) : null,
                driverUniqueId: attrs.driverUniqueId ? String(attrs.driverUniqueId) : null,
                driverWorkingState: attrs.driverWorkingState ? String(attrs.driverWorkingState) : null,
                driver2WorkingState: attrs.driver2WorkingState ? String(attrs.driver2WorkingState) : null,
                lastParked: attrs.lastParked ? String(attrs.lastParked) : null,
                lastUpdate: p.deviceTime || p.serverTime,
              };
            });
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "positions", positions: enriched })}\n\n`));
          }

          if (msg.devices) {
            const enriched = msg.devices.map((d: any) => {
              const veh = deviceToVehicle.get(d.id);
              return {
                deviceId: d.id,
                vehicleId: veh?.id || null,
                vehiclePlate: veh?.plate || null,
                status: d.status,
                lastUpdate: d.lastUpdate,
                name: d.name,
              };
            });
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "devices", devices: enriched })}\n\n`));
          }

          if (msg.events) {
            const enrichedEvents = msg.events.map((e: any) => {
              const veh = deviceToVehicle.get(e.deviceId);
              return {
                id: e.id,
                deviceId: e.deviceId,
                vehicleId: veh?.id || null,
                vehiclePlate: veh?.plate || null,
                type: e.type,
                eventTime: e.eventTime,
                positionId: e.positionId,
                geofenceId: e.geofenceId,
                maintenanceId: e.maintenanceId,
                attributes: e.attributes || {},
              };
            });
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "events", events: enrichedEvents })}\n\n`));
          }
        } catch { /* parse error */ }
      };

      ws.onclose = () => {
        if (!closed) {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ws_closed" })}\n\n`)); } catch { /* */ }
          try { controller.close(); } catch { /* */ }
        }
        closed = true;
      };

      ws.onerror = () => {
        if (!closed) {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ws_error" })}\n\n`)); } catch { /* */ }
          try { controller.close(); } catch { /* */ }
        }
        closed = true;
      };

      // SSE heartbeat every 25s to keep the HTTP connection alive
      const heartbeat = setInterval(() => {
        if (closed) { clearInterval(heartbeat); return; }
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "heartbeat", ts: Date.now() })}\n\n`)); } catch { clearInterval(heartbeat); }
      }, 25_000);
    },
    cancel() {
      closed = true;
      if (wsInstance) {
        try { wsInstance.close(); } catch { /* */ }
        wsInstance = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
