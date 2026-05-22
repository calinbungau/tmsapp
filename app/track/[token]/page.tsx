"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Loader2, MapPin, Truck, User, AlertTriangle, Clock,
  CheckCircle2, Circle, Navigation,
} from "lucide-react";

/**
 * Public customer-facing tracking page — /track/[token]
 *
 * This page is unauthenticated. It pulls everything it needs from
 * `/api/track/[token]`, which validates the token, checks expiry/revoked
 * state, and returns the chosen GPS resource's current position plus the
 * optional stop timeline and order status. The page polls every 30s so
 * the customer always sees a fresh dot without having to refresh.
 *
 * Visual style is intentionally light/neutral — the customer is not a
 * v0 admin and shouldn't land on our dark dashboard chrome. We keep
 * branding minimal so the page works as a generic embedded link.
 */

interface Stop {
  id: string;
  stop_type: string;
  sequence_order: number;
  company_name: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  address: string | null;
  planned_date: string | null;
  planned_time_from: string | null;
  planned_time_to: string | null;
  actual_arrival: string | null;
  actual_departure: string | null;
  execution_status: string | null;
  lat: number | null;
  lng: number | null;
}

interface BrandingParty {
  name: string | null;
  logo_url: string | null;
}

interface TrackData {
  starts_at: string;
  expires_at: string;
  show_status: boolean;
  show_stops: boolean;
  show_eta: boolean;
  resource_label: string;
  resource_sub_label: string | null;
  gps_source: "vehicle" | "trailer" | "driver";
  position: {
    lat: number;
    lng: number;
    speed_kmh: number | null;
    course: number | null;
    last_update: string | null;
    address: string | null;
  } | null;
  order: { reference: string | null; status: string | null } | null;
  stops: Stop[];
  provider: BrandingParty | null;
}

const POLL_INTERVAL_MS = 30_000;

// BNG Tracking brand palette. Kept as module-scope constants so every
// surface that needs the navy chip or the amber accent renders the
// same hex value — no drift between header, marker, badges, and pills.
const BNG_NAVY = "#131526";
const BNG_AMBER = "#f5b301";

export default function PublicTrackingPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [data, setData] = useState<TrackData | null>(null);
  const [error, setError] = useState<{
    status: number;
    message: string;
    starts_at?: string;
    expires_at?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Leaflet refs. The map lives across renders and the marker is
  // re-created on each position update so we can smoothly rotate
  // it via the divIcon's transform.
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const stopMarkersRef = useRef<L.Marker[]>([]);

  // ── Fetch + poll ──
  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/track/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError({
          status: res.status,
          message: body.error || "Could not load tracking link.",
          starts_at: body.starts_at,
          expires_at: body.expires_at,
        });
        setData(null);
        return;
      }
      const json: TrackData = await res.json();
      setError(null);
      setData(json);
    } catch (err) {
      setError({ status: 0, message: "Network error — please try again." });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  // ── Initialise the Leaflet map once we have data ──
  useEffect(() => {
    if (!mapElRef.current || mapRef.current || !data?.position) return;
    const map = L.map(mapElRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([data.position.lat, data.position.lng], 9);

    // Light tile layer — Carto Voyager keeps the page neutral and
    // doesn't clash with the rest of the customer-facing UI.
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    mapRef.current = map;

    // Slight delay so the container has its final size before we
    // hand the map back to Leaflet — avoids the grey-tile bug.
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // We intentionally only depend on whether we have data; the first
    // call initialises the map, subsequent position updates flow to
    // the marker-update effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data?.position]);

  // ── Vehicle marker — re-create whenever the position changes ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data?.position) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([data.position.lat, data.position.lng]);
    } else {
      const heading = data.position.course || 0;
      // BNG-branded marker: navy core with amber arrow + amber pulse
      // halo. Keeps the dot visually distinct against the (mostly
      // green/grey) Carto Voyager basemap while staying on-brand.
      const icon = L.divIcon({
        className: "track-marker",
        html: `
          <div style="
            position: relative;
            width: 44px; height: 44px;
            display: flex; align-items: center; justify-content: center;
          ">
            <div style="
              position: absolute; inset: 0;
              border-radius: 50%;
              background: rgba(245,179,1,0.28);
              animation: trackPulse 2s ease-out infinite;
            "></div>
            <div style="
              position: relative;
              width: 30px; height: 30px;
              border-radius: 50%;
              background: ${BNG_NAVY};
              border: 3px solid #fff;
              box-shadow: 0 2px 6px rgba(0,0,0,0.35);
              display: flex; align-items: center; justify-content: center;
              transform: rotate(${heading}deg);
            ">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${BNG_AMBER}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      markerRef.current = L.marker([data.position.lat, data.position.lng], { icon }).addTo(map);
    }
    // Recenter on first paint only — don't fight the customer's panning.
    if (markerRef.current && !markerRef.current.getElement()?.dataset.centered) {
      map.setView([data.position.lat, data.position.lng], 9);
      if (markerRef.current.getElement()) {
        markerRef.current.getElement()!.dataset.centered = "1";
      }
    }
  }, [data?.position?.lat, data?.position?.lng, data?.position?.course]);

  // ── Stop markers ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    if (!data.show_stops) return;
    const geoStops = data.stops.filter((s) => s.lat != null && s.lng != null);
    geoStops.forEach((s) => {
      const isPickup = s.stop_type === "pickup" || s.stop_type === "loading";
      const color = isPickup ? "#16a34a" : "#dc2626";
      const icon = L.divIcon({
        className: "track-stop-marker",
        html: `
          <div style="
            width: 22px; height: 22px;
            border-radius: 50%;
            background: ${color};
            border: 3px solid #fff;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            color: #fff;
            font-size: 11px; font-weight: 700;
            display: flex; align-items: center; justify-content: center;
          ">${s.sequence_order + 1}</div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marker = L.marker([s.lat!, s.lng!], { icon })
        .addTo(map)
        .bindTooltip(
          `<b>${isPickup ? "Pickup" : "Delivery"} ${s.sequence_order + 1}</b><br>${
            s.company_name || s.city || ""
          }`,
          { direction: "top", offset: [0, -8] }
        );
      stopMarkersRef.current.push(marker);
    });
  }, [data?.show_stops, data?.stops]);

  // ── Render ──
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: BNG_AMBER }} />
      </main>
    );
  }
  if (error) {
    return (
      <ErrorState
        status={error.status}
        message={error.message}
        startsAt={error.starts_at}
      />
    );
  }
  if (!data) {
    return <ErrorState status={500} message="Unexpected error" />;
  }

  return (
    <>
      <style>{`
        @keyframes trackPulse {
          0% { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
      <main className="min-h-screen bg-slate-50 flex flex-col">
        {/* ── Header ───────────────────────────────────────────────────────
            Three-zone layout:
              left   = BNG Tracking app brand (the platform — hard-coded)
              middle = the carrier's own Company Profile logo + name
              right  = link validity window
            The business partner is intentionally NOT shown — this page
            is a co-branded surface between the BNG Tracking platform
            and the carrier (the app user), nothing else.
        */}
        <header className="bg-white border-b border-slate-200">
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              <BngTrackingBrand />
              <div className="hidden sm:block h-8 w-px bg-slate-200 shrink-0" />
              <CarrierBrand party={data.provider} />
            </div>
            <AvailabilityBadge
              startsAt={data.starts_at}
              expiresAt={data.expires_at}
            />
          </div>
          {/* Bottom row: shipment + asset summary, on its own line so the
              logos stay visually crisp on the top row */}
          <div className="px-4 sm:px-6 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center gap-3">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: BNG_NAVY, color: BNG_AMBER }}
            >
              {data.gps_source === "driver" ? (
                <User className="h-4 w-4" />
              ) : (
                <Truck className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold text-slate-900 leading-tight truncate">
                Live tracking
                {data.order?.reference ? (
                  <span className="text-slate-500 font-normal"> · {data.order.reference}</span>
                ) : null}
              </h1>
              <p className="text-[11px] text-slate-500 truncate">
                {data.resource_label}
                {data.resource_sub_label ? ` · ${data.resource_sub_label}` : ""}
              </p>
            </div>
          </div>
        </header>

        {/* ── Main split: map + side panel ────────────────────────────── */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          <div className="flex-1 relative min-h-[55vh] lg:min-h-0">
            {data.position ? (
              <div ref={mapElRef} className="absolute inset-0" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2 px-4 text-center">
                <MapPin className="h-10 w-10 text-slate-300" />
                <p className="text-sm font-medium">No live position available right now</p>
                <p className="text-xs">
                  The GPS device hasn&apos;t reported recently. This page refreshes automatically every 30 seconds.
                </p>
              </div>
            )}
            {data.position && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-md px-4 py-2 flex items-center gap-3 text-xs z-[1000] border border-slate-200">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-medium text-slate-700">Live</span>
                </div>
                {data.position.speed_kmh != null && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-600">
                      <Navigation className="h-3 w-3 inline -mt-0.5 mr-1" />
                      {data.position.speed_kmh} km/h
                    </span>
                  </>
                )}
                {data.position.last_update && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500">
                      <Clock className="h-3 w-3 inline -mt-0.5 mr-1" />
                      {relativeTime(data.position.last_update)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          <aside className="w-full lg:w-96 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 overflow-y-auto">
            {data.show_status && data.order?.status && (
              <div className="p-4 border-b border-slate-100">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Status</p>
                <p className="text-sm font-semibold text-slate-900 mt-1 capitalize">
                  {data.order.status.replace(/_/g, " ")}
                </p>
              </div>
            )}
            {data.position?.address && (
              <div className="p-4 border-b border-slate-100">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                  Current location
                </p>
                <p className="text-sm text-slate-700 mt-1 leading-snug">{data.position.address}</p>
              </div>
            )}
            {data.show_stops && data.stops.length > 0 && (
              <div className="p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-3">
                  Stops
                </p>
                <ol className="space-y-3">
                  {data.stops.map((s) => (
                    <StopRow key={s.id} stop={s} />
                  ))}
                </ol>
              </div>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────��─────────────────

/**
 * BNG Tracking brand mark — the app/platform's own brand, hard-coded
 * so every public tracking page carries it regardless of which
 * carrier is using us.
 *
 * We render the real owl mark on the BNG navy chip (#131526) so the
 * logo reads exactly the same here as it does on the admin login
 * screen. On mobile we drop the wordmark and keep only the chip, so
 * the carrier's own logo dominates the small-screen header.
 */
function BngTrackingBrand() {
  return (
    <div className="flex items-center gap-2.5 min-w-0 shrink-0">
      <div
        className="h-10 w-10 sm:h-11 sm:w-11 rounded-lg shadow-sm ring-1 ring-black/5 flex items-center justify-center shrink-0"
        style={{ backgroundColor: BNG_NAVY }}
      >
        {/* Real BNG owl mark. Plain <img> avoids next/image
            optimisation overhead on this public route — the SVG is
            tiny and ships from /public directly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/bng-owl.svg"
          alt=""
          aria-hidden="true"
          className="h-6 w-6 sm:h-7 sm:w-7"
        />
      </div>
      <div className="hidden sm:block leading-tight">
        <p className="text-[9px] uppercase tracking-[0.14em] text-slate-400 leading-none">
          Powered by
        </p>
        <p className="text-sm font-bold mt-0.5" style={{ color: BNG_NAVY }}>
          BNG <span style={{ color: BNG_AMBER }}>Tracking</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Carrier brand — pulled from the app user's company_profiles row.
 * If the carrier has uploaded a logo we render it; otherwise we fall
 * back to a soft monogram derived from the company name so the slot
 * always feels intentional rather than empty. This block is the
 * dominant brand on the page — the customer is meant to recognise
 * the carrier first, with BNG Tracking as the platform credit.
 */
function CarrierBrand({ party }: { party: BrandingParty | null }) {
  const name = party?.name || "Carrier";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {party?.logo_url ? (
        // Plain <img> on purpose — public route, no next/image
        // optimisation needed and we can't assume the bucket allows
        // the optimiser to fetch with arbitrary headers.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={party.logo_url}
          alt={`${name} logo`}
          className="h-9 sm:h-11 w-auto max-w-[140px] sm:max-w-[200px] object-contain"
        />
      ) : (
        <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-bold shrink-0">
          {initials || "C"}
        </div>
      )}
      <div className="min-w-0 hidden sm:block leading-tight">
        <p className="text-[9px] uppercase tracking-[0.14em] text-slate-400 leading-none">
          Tracked by
        </p>
        <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">{name}</p>
      </div>
    </div>
  );
}

/**
 * Header badge that shows the validity window of the link. Until the
 * activation date we show a soft amber tone with the future start
 * date; while active we show a neutral slate tone with "until X";
 * close to expiry we shift the bottom text to amber as an early
 * warning. The component keeps both dates on the same compact
 * footprint to preserve header rhythm.
 */
function AvailabilityBadge({
  startsAt,
  expiresAt,
}: {
  startsAt: string;
  expiresAt: string;
}) {
  const now = Date.now();
  const start = new Date(startsAt);
  const exp = new Date(expiresAt);
  const notYetActive = start.getTime() > now;
  const daysToExpiry = Math.ceil((exp.getTime() - now) / (24 * 3600 * 1000));
  const sameYear = start.getFullYear() === exp.getFullYear();
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
    });

  return (
    <div className="text-right shrink-0">
      <p className="text-[9px] uppercase tracking-wider text-slate-400 leading-none">
        Link valid
      </p>
      <p className="text-xs font-semibold text-slate-700 mt-1 leading-tight whitespace-nowrap">
        {fmt(start, !sameYear)}
        <span className="text-slate-300 mx-1">→</span>
        {fmt(exp, true)}
      </p>
      {notYetActive ? (
        <p className="text-[10px] text-amber-600 mt-0.5 leading-tight">
          Active from {fmt(start, false)}
        </p>
      ) : daysToExpiry <= 3 && daysToExpiry >= 0 ? (
        <p className="text-[10px] text-amber-600 mt-0.5 leading-tight">
          {daysToExpiry === 0 ? "Expires today" : `${daysToExpiry} day${daysToExpiry === 1 ? "" : "s"} left`}
        </p>
      ) : null}
    </div>
  );
}

function StopRow({ stop }: { stop: Stop }) {
  const isDone = !!stop.actual_departure;
  const isActive = !!stop.actual_arrival && !stop.actual_departure;
  const isPickup = stop.stop_type === "pickup" || stop.stop_type === "loading";

  const Icon = isDone ? CheckCircle2 : Circle;
  const iconClass = isDone
    ? "text-emerald-500"
    : isActive
    ? "text-sky-500"
    : "text-slate-300";

  return (
    <li className="flex gap-3">
      <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconClass}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`font-medium ${
              isPickup ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {isPickup ? "Pickup" : "Delivery"} {stop.sequence_order + 1}
          </span>
          {isActive && (
            <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">
              On site
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-slate-900 mt-0.5">
          {stop.company_name || stop.city || "Stop"}
        </p>
        {(stop.city || stop.country) && (
          <p className="text-xs text-slate-500">
            {[stop.postal_code, stop.city, stop.country].filter(Boolean).join(", ")}
          </p>
        )}
        {stop.planned_date && (
          <p className="text-[11px] text-slate-500 mt-1">
            {new Date(stop.planned_date).toLocaleDateString(undefined, {
              day: "2-digit",
              month: "short",
            })}
            {stop.planned_time_from
              ? ` · ${stop.planned_time_from.slice(0, 5)}${
                  stop.planned_time_to ? `–${stop.planned_time_to.slice(0, 5)}` : ""
                }`
              : ""}
          </p>
        )}
      </div>
    </li>
  );
}

function ErrorState({
  status,
  message,
  startsAt,
}: {
  status: number;
  message: string;
  startsAt?: string;
}) {
  const isExpired = status === 410;
  const isPending = status === 425;
  // For the pending state we frame the message positively — the link
  // isn't broken, it just hasn't started yet, and we show the customer
  // when they should come back.
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 max-w-md w-full p-8 text-center">
        <div
          className="h-12 w-12 rounded-full flex items-center justify-center mx-auto"
          style={
            isPending
              ? { backgroundColor: `${BNG_NAVY}14`, color: BNG_NAVY }
              : { backgroundColor: "#fef3c7", color: "#d97706" }
          }
        >
          {isPending ? <Clock className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
        </div>
        <h1 className="text-lg font-semibold text-slate-900 mt-4">
          {isPending
            ? "This tracking link is not active yet"
            : isExpired
            ? "Tracking link is no longer available"
            : "Tracking unavailable"}
        </h1>
        <p className="text-sm text-slate-600 mt-2">{message}</p>
        {isPending && startsAt && (
          <div
            className="mt-4 inline-flex items-center gap-2 text-sm border px-3 py-2 rounded-md"
            style={{
              backgroundColor: `${BNG_NAVY}08`,
              color: BNG_NAVY,
              borderColor: `${BNG_NAVY}1a`,
            }}
          >
            <Clock className="h-4 w-4" />
            Available from{" "}
            <span className="font-semibold">
              {new Date(startsAt).toLocaleString(undefined, {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-6">
          {isPending
            ? "Bookmark this page — you can come back later to see the live map."
            : "Please contact your shipper to request a new link."}
        </p>
      </div>
    </main>
  );
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
