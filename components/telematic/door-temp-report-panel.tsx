"use client";

// Advanced Reports → Door/Temp by Virtual Sensor
//
// Self-contained component that fills the right side of the Telematic →
// Reports page when the "Advanced Reports" module is active in Panel 1.
// It renders its own internal Panel-2 (list of advanced report types)
// and Panel-3 (configuration form OR editable preview), so the parent
// page does not need to manage any of its state.
//
// Workflows
// ─────────
// (a) Plain temperature report (Door Sensor disabled):
//       Form → buildRows() → openPrintWindow() → save as PDF
// (b) Door + temperature report (Door Sensor enabled):
//       Form → buildRows() → in-panel Editable Preview (where the user
//       marks transition rows for the door state) → openPrintWindow()
//
// Sensor toggles
// ──────────────
// Either temperature sensor can be individually included or excluded.
// The user must enable at least one sensor or the door sensor before
// generation is allowed.
//
// Date format
// ───────────
// All timestamps in the printed PDF and in the in-panel preview are
// rendered in the standardized `dd.mm.yyyy - HH:MM:SS` form, matching
// the agreed-on operations format.

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Thermometer, Truck, Calendar, ChevronLeft, Loader2,
  CircleAlert, Printer, MapPin, Wand2, Search, DoorOpen, DoorClosed,
  RotateCcw, Eye, Mail,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SendByEmailDialog } from "@/components/email/send-by-email-dialog";
import { buildDoorTempPdf } from "@/lib/telematic/door-temp-pdf";

interface AdminSession { id: string }

interface AssetOption {
  id: string;
  plate: string;
  kind: "vehicle" | "trailer";
  label?: string | null; // brand/model or trailer type
}

interface CompanyProfile {
  company_name: string | null;
  logo_url: string | null;
  stamp_url: string | null;
}

interface PositionRow {
  time: string;
  lat: number;
  lng: number;
  speed: number;
  address: string | null;
}

// One row of the synthesised report. `t1` / `t2` may be undefined when
// the corresponding sensor is excluded by the user.
interface ReportRow {
  ts: Date;
  t1: number | undefined;
  t2: number | undefined;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

// Snapshot of all the data needed to render either the editable preview
// or the final print HTML. Captured at "Generate" time so the user can
// keep tweaking the door states without re-fetching GPS.
interface PreviewSnapshot {
  rows: ReportRow[];
  sensor1Enabled: boolean;
  sensor2Enabled: boolean;
  doorSensor: boolean;
  includeLocation: boolean;
  assetPlate: string;
  companyName: string;
  logoUrl: string;
  // The reporting window the user selected on the form. Stored as Date
  // objects rather than strings so the print step can format them in the
  // same dd.mm.yyyy hh:mm:ss style as every other timestamp in the
  // document and so the filename generator can format them more compactly
  // (date-only) without re-parsing.
  dateFrom: Date;
  dateTo: Date;
}

// The report catalog. Today there is exactly one available report; the
// shape supports adding more later without changing the surrounding UI.
const ADVANCED_REPORTS = [
  {
    id: "door_temp_virtual",
    label: "Door/Temp by Virtual Sensor",
    description: "Simulated temperature readings with optional GPS location at each step",
    icon: Thermometer,
    available: true,
  },
] as const;

type AdvancedReportId = (typeof ADVANCED_REPORTS)[number]["id"];

// Step interval choices (in minutes). 15 min mirrors the mock-up default.
const STEP_OPTIONS = [5, 10, 15, 30, 60] as const;

// Layout choices. "simple" = timestamp + temps only (legacy mock-up).
// "with_location" = adds an Address column using the asset's GPS trail.
const LAYOUT_OPTIONS = [
  { id: "simple", label: "Simple" },
  { id: "with_location", label: "With Location" },
] as const;

type LayoutId = (typeof LAYOUT_OPTIONS)[number]["id"];

// Helper: format a Date for a <input type="datetime-local">. Keeps the
// value in the user's local timezone (which is what Traccar expects for
// display, and the report itself prints in local time).
function fmtDTLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Canonical operations date/time format used everywhere on this report:
// dd.mm.yyyy - HH:MM:SS in the user's local timezone.
function fmtPdfDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Generate a single random temperature in the [down, up] range, applying
// the sign flag. Rounded to 1 decimal place to match the mock-up.
function randTemp(down: number, up: number, isMinus: boolean): number {
  const lo = Math.min(down, up);
  const hi = Math.max(down, up);
  const v = lo + Math.random() * (hi - lo);
  const signed = isMinus ? -v : v;
  return Math.round(signed * 10) / 10;
}

// Find the index of the position closest to a given timestamp using a
// binary search. The position list is already sorted chronologically by
// the API. O(log n) per row → fine even for week-long reports.
function nearestPositionIndex(positions: PositionRow[], targetMs: number): number {
  if (positions.length === 0) return -1;
  let lo = 0, hi = positions.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midMs = new Date(positions[mid].time).getTime();
    if (midMs < targetMs) lo = mid + 1; else hi = mid;
  }
  // Compare lo and lo-1 to find the truly closest one.
  if (lo > 0) {
    const a = Math.abs(new Date(positions[lo].time).getTime() - targetMs);
    const b = Math.abs(new Date(positions[lo - 1].time).getTime() - targetMs);
    return b < a ? lo - 1 : lo;
  }
  return lo;
}

// Escape strings for safe HTML embedding in the print window.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Door state model: starts Closed. Each entry in `transitions` is the
// index of a row where the state FLIPS. State at row i is therefore
// "Open" if the number of transition indices <= i is odd, "Closed" if
// even. Stored as a sorted array of unique indices.
function computeDoorState(rowIndex: number, transitions: number[]): "Open" | "Closed" {
  let flips = 0;
  for (const t of transitions) {
    if (t <= rowIndex) flips++;
    else break;
  }
  return flips % 2 === 1 ? "Open" : "Closed";
}

export default function DoorTempReportPanel({ adminSession }: { adminSession: AdminSession }) {
  // ── Panel 2 state: which report type is open ──
  const [selectedReport, setSelectedReport] = useState<AdvancedReportId | null>(null);

  // ── Loaded data ──
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");

  // ── Form state ──
  const [selectedAssetKey, setSelectedAssetKey] = useState<string>(""); // `${kind}:${id}`
  const [sensor1Enabled, setSensor1Enabled] = useState(true);
  const [sensor2Enabled, setSensor2Enabled] = useState(true);
  const [temp1Down, setTemp1Down] = useState<string>("1");
  const [temp1Up, setTemp1Up] = useState<string>("3");
  const [temp2Down, setTemp2Down] = useState<string>("1");
  const [temp2Up, setTemp2Up] = useState<string>("5");
  const [temp1Minus, setTemp1Minus] = useState(true); // matches mock-up output
  const [temp2Minus, setTemp2Minus] = useState(false);
  const [doorSensor, setDoorSensor] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [layout, setLayout] = useState<LayoutId>("simple");
  const [stepMinutes, setStepMinutes] = useState<number>(15);
  const [generating, setGenerating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Editable preview state (only used when doorSensor is enabled) ──
  // When `previewData` is non-null the panel swaps from the form view to
  // the in-panel preview where the user marks door transitions.
  const [previewData, setPreviewData] = useState<PreviewSnapshot | null>(null);
  const [doorTransitions, setDoorTransitions] = useState<number[]>([]);

  // ── Send-by-email state ─────────────────────────────────────────────
  // We capture the operator's user id (from the same `admin_session`
  // localStorage slot used everywhere else in the app) so the email
  // recipient input can surface a per-user history.
  // `emailSnap` holds the snapshot the dialog will attach when the user
  // clicks Send — populated from either the form path (build a fresh
  // snapshot when the Send-by-Email button is clicked) or the preview
  // path (re-use the same snapshot the user is editing right now).
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem("admin_session") : null;
      if (stored) setUserId(JSON.parse(stored)?.id || null);
    } catch { /* localStorage may be unavailable in SSR/iframe contexts */ }
  }, []);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailSnap, setEmailSnap] = useState<PreviewSnapshot | null>(null);
  const [emailTransitions, setEmailTransitions] = useState<number[]>([]);

  // ── Default dates: previous calendar week ──
  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 9, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 17, 0);
    setDateFrom(fmtDTLocal(start));
    setDateTo(fmtDTLocal(end));
  }, []);

  // ── Load company profile (logo + name) ──
  // Mirrors the same direct-from-supabase pattern used in
  // /admin/settings/company/page.tsx. We pull `logo_url` (preferred) and
  // fall back to `stamp_url` if the customer never uploaded a logo —
  // older accounts only have a stamp.
  useEffect(() => {
    if (!adminSession?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("company_profiles")
          .select("company_name, logo_url, stamp_url")
          .eq("admin_id", adminSession.id)
          .maybeSingle();
        if (!cancelled) {
          setCompany({
            company_name: data?.company_name ?? null,
            logo_url: data?.logo_url ?? null,
            stamp_url: data?.stamp_url ?? null,
          });
        }
      } catch (e) {
        console.error("[v0] advanced-reports: company profile load", e);
        // Silent fail — the form still works without a logo; the PDF
        // simply renders the text header on its own.
      }
    })();
    return () => { cancelled = true; };
  }, [adminSession?.id]);

  // ── Load vehicles + trailers that have GPS ──
  // Vehicles come from the existing /api/traccar/vehicles endpoint which
  // already filters to traccar_device_id IS NOT NULL and joins device
  // group info. Trailers are queried directly from Supabase — same
  // filter (traccar_device_id IS NOT NULL) — to avoid creating a brand
  // new endpoint just for one read on this page.
  useEffect(() => {
    if (!adminSession?.id) return;
    let cancelled = false;
    setAssetsLoading(true);

    (async () => {
      try {
        const supabase = createClient();
        const [vRes, trailerQuery] = await Promise.all([
          fetch(`/api/traccar/vehicles?adminId=${adminSession.id}`),
          supabase
            .from("trailers")
            .select("id, plate_number, trailer_type")
            .eq("admin_id", adminSession.id)
            .not("traccar_device_id", "is", null)
            .order("plate_number", { ascending: true }),
        ]);

        const vehicles: AssetOption[] = [];
        const trailers: AssetOption[] = [];

        if (vRes.ok) {
          const d = await vRes.json();
          for (const v of d.vehicles || []) {
            vehicles.push({
              id: v.id,
              plate: v.plate,
              kind: "vehicle",
              label: [v.brand, v.model].filter(Boolean).join(" ") || null,
            });
          }
        }

        if (!trailerQuery.error && trailerQuery.data) {
          for (const t of trailerQuery.data) {
            trailers.push({
              id: t.id as string,
              plate: t.plate_number as string,
              kind: "trailer",
              label: (t.trailer_type as string | null) || null,
            });
          }
        }

        if (!cancelled) {
          setAssets([...vehicles, ...trailers].sort((a, b) => a.plate.localeCompare(b.plate)));
        }
      } catch (e) {
        console.error("[v0] advanced-reports: asset load failed", e);
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [adminSession?.id]);

  const filteredAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter(
      (a) => a.plate.toLowerCase().includes(q) || (a.label || "").toLowerCase().includes(q),
    );
  }, [assets, assetSearch]);

  const selectedAsset = useMemo(
    () => assets.find((a) => `${a.kind}:${a.id}` === selectedAssetKey) || null,
    [assets, selectedAssetKey],
  );

  // Validation helper used in multiple places.
  const validateForm = useCallback((): string | null => {
    if (!selectedAsset) return "Please select a vehicle or trailer with GPS.";
    if (!sensor1Enabled && !sensor2Enabled && !doorSensor) {
      return "Enable at least one sensor (Temp1, Temp2 or Door).";
    }
    if (!dateFrom || !dateTo) return "Please pick a start and end date.";

    if (sensor1Enabled) {
      const t1d = parseFloat(temp1Down);
      const t1u = parseFloat(temp1Up);
      if (!Number.isFinite(t1d) || !Number.isFinite(t1u)) {
        return "Temperature 1 fields must be numbers.";
      }
    }
    if (sensor2Enabled) {
      const t2d = parseFloat(temp2Down);
      const t2u = parseFloat(temp2Up);
      if (!Number.isFinite(t2d) || !Number.isFinite(t2u)) {
        return "Temperature 2 fields must be numbers.";
      }
    }

    const startMs = new Date(dateFrom).getTime();
    const endMs = new Date(dateTo).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return "End date must be after start date.";
    }
    return null;
  }, [selectedAsset, sensor1Enabled, sensor2Enabled, doorSensor, dateFrom, dateTo, temp1Down, temp1Up, temp2Down, temp2Up]);

  // Build the simulated rows + (optionally) the GPS positions. Pure data
  // builder — does not touch the DOM. Used by both workflows.
  const buildSnapshot = useCallback(async (): Promise<PreviewSnapshot> => {
    const t1d = parseFloat(temp1Down);
    const t1u = parseFloat(temp1Up);
    const t2d = parseFloat(temp2Down);
    const t2u = parseFloat(temp2Up);

    const startMs = new Date(dateFrom).getTime();
    const endMs = new Date(dateTo).getTime();

    const includeLocation = layout === "with_location";
    let positions: PositionRow[] = [];
    if (includeLocation && selectedAsset) {
      const qs = new URLSearchParams({
        adminId: adminSession.id,
        from: new Date(dateFrom).toISOString(),
        to: new Date(dateTo).toISOString(),
      });
      qs.set(selectedAsset.kind === "vehicle" ? "vehicleId" : "trailerId", selectedAsset.id);
      const res = await fetch(`/api/traccar/asset-history?${qs.toString()}`);
      if (res.ok) {
        const d = await res.json();
        positions = d.positions || [];
      }
    }

    const stepMs = stepMinutes * 60 * 1000;
    const rows: ReportRow[] = [];
    for (let t = startMs; t <= endMs; t += stepMs) {
      const ts = new Date(t);
      const t1 = sensor1Enabled ? randTemp(t1d, t1u, temp1Minus) : undefined;
      const t2 = sensor2Enabled ? randTemp(t2d, t2u, temp2Minus) : undefined;
      let address: string | null = null;
      let lat: number | null = null;
      let lng: number | null = null;
      if (includeLocation && positions.length > 0) {
        const idx = nearestPositionIndex(positions, t);
        if (idx >= 0) {
          const p = positions[idx];
          address = p.address;
          lat = p.lat;
          lng = p.lng;
        }
      }
      rows.push({ ts, t1, t2, address, lat, lng });
    }

    return {
      rows,
      sensor1Enabled,
      sensor2Enabled,
      doorSensor,
      includeLocation,
      assetPlate: selectedAsset!.plate,
      companyName: company?.company_name || "",
      logoUrl: company?.logo_url || company?.stamp_url || "",
      dateFrom: new Date(dateFrom),
      dateTo: new Date(dateTo),
    };
  }, [
    adminSession.id, company, selectedAsset, dateFrom, dateTo,
    sensor1Enabled, sensor2Enabled, doorSensor, layout, stepMinutes,
    temp1Down, temp1Up, temp2Down, temp2Up, temp1Minus, temp2Minus,
  ]);

  // Open the print window with the final HTML. Shared by both workflows.
  // When called from the form (door sensor off) we pass an empty
  // transitions array. When called from the preview we pass the user's
  // selected transitions.
  const openPrintWindow = useCallback((snap: PreviewSnapshot, transitions: number[]) => {
    const win = window.open("", "_blank", "width=900,height=1100");
    if (!win) {
      setFormError("Pop-up blocked. Please allow pop-ups for this site and try again.");
      return;
    }

    const generatedAt = fmtPdfDate(new Date());

    // Full timestamped range label for the page header. Uses the same
    // dd.mm.yyyy hh:mm:ss formatter as every other timestamp in the
    // document for visual consistency.
    const rangeLabel = `${fmtPdfDate(snap.dateFrom)}  →  ${fmtPdfDate(snap.dateTo)}`;

    // Compact date-only range used in the file name. The browser's
    // "Save as PDF" dialog seeds the file name from document.title, so
    // setting that to a meaningful slug is the most reliable way to
    // ship a sensible default download name across Chrome/Edge/Safari/
    // Firefox without a backend round-trip.
    const fmtDateShort = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    };
    const sensorsLabel = [
      snap.sensor1Enabled ? "SensorTemp1" : null,
      snap.sensor2Enabled ? "SensorTemp2" : null,
    ].filter(Boolean).join("+") || "NoSensors";
    // Strip characters that are illegal in Windows / macOS file names
    // (/ \ : * ? " < > |) and collapse whitespace. Spaces are replaced
    // with underscores so the filename round-trips cleanly through
    // command-line tools and email attachments.
    const sanitizeForFilename = (s: string) =>
      s.replace(/[\\/:*?"<>|]+/g, "")  // drop forbidden chars
       .replace(/\s+/g, "_")            // spaces → underscores
       .replace(/_+/g, "_")             // collapse repeats
       .trim();
    const plateSlug = sanitizeForFilename(snap.assetPlate || "Vehicle");
    const rangeSlug = `${fmtDateShort(snap.dateFrom)}-${fmtDateShort(snap.dateTo)}`;
    const documentFilename = `${plateSlug}_${rangeSlug}_${sensorsLabel}`;

    // Header cell HTML — built dynamically so excluded sensors don't
    // leave empty columns.
    const headerCells: string[] = [`<th style="text-align:left">Timestamp</th>`];
    if (snap.includeLocation) headerCells.push(`<th style="text-align:left">Location</th>`);
    if (snap.doorSensor) headerCells.push(`<th style="text-align:center">Door</th>`);
    if (snap.sensor1Enabled) headerCells.push(`<th style="text-align:right">SensorTemp1</th>`);
    if (snap.sensor2Enabled) headerCells.push(`<th style="text-align:right">SensorTemp2</th>`);

    // Brand colour. The deep navy is intentionally used for BOTH the
    // page-header band and the table column-header row so the document
    // reads as one cohesive piece rather than two competing strips.
    const BRAND_BLUE = "#111222";

    // Build a Google Maps link for a row's location. We prefer the
    // lat/lng pair (deterministic, no geocoding lookup needed) and fall
    // back to a text query when only an address is available. The
    // `?api=1&query=` syntax is Google Maps' documented universal URL
    // contract — works on desktop and mobile, opens the maps app on
    // mobile devices when installed.
    const mapsHrefFor = (r: { lat: number | null; lng: number | null; address: string | null }): string | null => {
      if (r.lat != null && r.lng != null) {
        return `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`;
      }
      if (r.address) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`;
      }
      return null;
    };

    const bodyRows = snap.rows.map((r, i) => {
      const cells: string[] = [];
      cells.push(`<td>${escapeHtml(fmtPdfDate(r.ts))}</td>`);
      if (snap.includeLocation) {
        const display = r.address
          ? escapeHtml(r.address)
          : r.lat != null && r.lng != null
            ? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`
            : null;
        const href = mapsHrefFor(r);
        if (display && href) {
          // The colour stays a normal text tone but we keep the
          // hand-cursor + subtle underline-on-hover so the user gets
          // the affordance without the PDF looking like a hyperlink
          // soup. Clicks open in a new tab; long-press on mobile gives
          // "Copy link" as a bonus.
          cells.push(`<td><a class="loc-link" href="${href}" target="_blank" rel="noopener noreferrer">${display}</a></td>`);
        } else {
          cells.push(`<td>${display || "&mdash;"}</td>`);
        }
      }
      if (snap.doorSensor) {
        const state = computeDoorState(i, transitions);
        const color = state === "Open" ? "#b91c1c" : "#15803d";
        cells.push(`<td style="text-align:center;color:${color};font-weight:600">${state}</td>`);
      }
      if (snap.sensor1Enabled) cells.push(`<td style="text-align:right">${r.t1?.toFixed(1) ?? "&mdash;"}</td>`);
      if (snap.sensor2Enabled) cells.push(`<td style="text-align:right">${r.t2?.toFixed(1) ?? "&mdash;"}</td>`);
      const tone = i % 2 === 0 ? "#ffffff" : "#f7f8fa";
      return `<tr style="background:${tone}">${cells.join("")}</tr>`;
    }).join("");

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(documentFilename)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    color: #1a1a1a;
    line-height: 1.4;
  }

  /* ── Brand-blue page header band ──
     Lives inside the table's <thead> as a colspan'd row. Because
     browsers natively repeat <thead> content on every page break in
     print AND account for its height when paginating, this approach is
     both reliable across Chrome/Edge/Safari/Firefox AND immune to the
     overlap-eats-rows bug that plagues position:fixed print headers. */
  .brand-header-cell {
    background: ${BRAND_BLUE};
    color: #ffffff;
    padding: 18px 32px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .brand-header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .brand-header-inner .title { font-size: 22px; margin: 0; font-weight: 700; letter-spacing: -0.01em; }
  .brand-header-inner .meta { font-size: 12px; opacity: 0.96; margin-top: 6px; }
  .brand-header-inner .meta div { margin: 1px 0; }
  .brand-header-inner .logo {
    max-width: 200px; max-height: 70px; object-fit: contain;
    background: #ffffff;
    padding: 6px 10px;
    border-radius: 6px;
  }

  /* The body content sits below the header with comfortable side
     padding. */
  .content { padding: 24px 32px 24px; }

  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead { display: table-header-group; }
  thead tr.column-header-row { background: ${BRAND_BLUE}; color: #ffffff; }
  thead tr.column-header-row th { padding: 9px 10px; font-weight: 600; }
  tbody td { padding: 8px 10px; border-bottom: 1px solid #ececec; vertical-align: top; }
  tbody tr:hover { background: #eef3fa; }
  .loc-link { color: inherit; text-decoration: none; }
  .loc-link:hover { text-decoration: underline; }

  /* "Generated by bngtracking.ro" — appears once, after the last
     table row. Because it's inline (not position-fixed) it naturally
     lands on the last page only. page-break-before: avoid keeps it
     tucked at the end of the table rather than floating onto a fresh
     page if the last rows barely fit. */
  .last-page-footer {
    margin-top: 28px;
    padding-top: 14px;
    border-top: 1px solid #e5e7eb;
    font-size: 11px;
    color: #6b7280;
    text-align: center;
    page-break-before: avoid;
    break-before: avoid;
  }
  .last-page-footer strong { color: ${BRAND_BLUE}; }

  @media print {
    /* Normal page margins. No fixed positioning trickery — both the
       brand header band and the column-header row live inside <thead>
       and repeat natively on every page break. */
    @page { margin: 18mm 0 14mm 0; }

    html, body { background: #ffffff; }

    /* Slightly tighter brand band in print to maximise data density. */
    .brand-header-cell { padding: 14px 28px; }
    .brand-header-inner .title { font-size: 18px; }
    .brand-header-inner .meta { font-size: 10.5px; margin-top: 4px; }
    .brand-header-inner .logo { max-height: 60px; padding: 4px 8px; }

    .content { padding: 0 28px; }

    /* Force backgrounds (brand colour) to print even when the user has
       "Background graphics" disabled. */
    thead tr.column-header-row,
    .brand-header-cell {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Row-level page break avoidance keeps individual data rows from
       being split between pages. */
    tbody tr { page-break-inside: avoid; }

    .no-print { display: none; }
    .loc-link { color: ${BRAND_BLUE}; text-decoration: underline; }
  }
</style>
</head>
<body>
  <div class="content">
    <table>
      <thead>
        <!-- Brand header band, repeated automatically on every page. -->
        <tr class="brand-header-row">
          <td class="brand-header-cell" colspan="${headerCells.length}">
            <div class="brand-header-inner">
              <div>
                <h1 class="title">Temperature Report</h1>
                <div class="meta">
                  ${snap.companyName ? `<div><strong>${escapeHtml(snap.companyName)}</strong></div>` : ""}
                  <div>${escapeHtml(snap.assetPlate)}</div>
                  <div><span style="opacity:0.85">Range:</span> ${escapeHtml(rangeLabel)}</div>
                  <div><span style="opacity:0.85">Generated:</span> ${escapeHtml(generatedAt)}</div>
                </div>
              </div>
              ${snap.logoUrl ? `<img class="logo" src="${escapeHtml(snap.logoUrl)}" alt="${escapeHtml(snap.companyName || "Logo")}" crossorigin="anonymous" />` : ""}
            </div>
          </td>
        </tr>
        <!-- Column header row, also repeated. -->
        <tr class="column-header-row">${headerCells.join("")}</tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>

    <div class="last-page-footer">
      Generated by <strong>bngtracking.ro</strong>
    </div>
  </div>

  <script>
    (function () {
      // Wait for the logo image (if any) to settle before printing so the
      // preview always shows the artwork. We use Promise.all of load
      // events with a hard 1500ms cap, then call print().
      var imgs = Array.prototype.slice.call(document.images || []);
      var done = false;
      function go() {
        if (done) return; done = true;
        setTimeout(function () { window.focus(); window.print(); }, 50);
      }
      if (imgs.length === 0) { go(); return; }
      var pending = imgs.length;
      imgs.forEach(function (img) {
        if (img.complete) { if (--pending === 0) go(); return; }
        img.addEventListener("load", function () { if (--pending === 0) go(); });
        img.addEventListener("error", function () { if (--pending === 0) go(); });
      });
      setTimeout(go, 1500);
    })();
  </script>
</body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
  }, []);

  // ── Main "Generate" handler from the form ──
  // Behaviour depends on whether the door sensor was requested:
  //  - off → straight to print window (legacy flow)
  //  - on  → build the snapshot and open the editable preview, where
  //          the operator marks open/close transitions; only after they
  //          click "Print PDF" in the preview do we open the print
  //          window.
  const handleGenerate = useCallback(async () => {
    setFormError(null);
    const err = validateForm();
    if (err) { setFormError(err); return; }
    setGenerating(true);
    try {
      const snap = await buildSnapshot();
      if (snap.doorSensor) {
        setPreviewData(snap);
        setDoorTransitions([]);
      } else {
        openPrintWindow(snap, []);
      }
    } catch (e) {
      console.error("[v0] advanced-reports: build failed", e);
      setFormError(e instanceof Error ? e.message : "Failed to build the report.");
    } finally {
      setGenerating(false);
    }
  }, [validateForm, buildSnapshot, openPrintWindow]);

  // ── Send by Email (from the form view) ─────────────────────────────
  // Mirrors handleGenerate but instead of opening a print window we
  // stash the snapshot and let SendByEmailDialog build the PDF
  // attachment lazily. We require the same validation as the print
  // path AND we refuse to email a door-sensor report from the form
  // because the operator hasn't had a chance to mark transitions yet;
  // they must use the Send-by-Email button inside the preview view.
  const handleSendByEmailFromForm = useCallback(async () => {
    setFormError(null);
    const err = validateForm();
    if (err) { setFormError(err); return; }
    if (doorSensor) {
      setFormError("Open the door preview first to mark door states, then send by email from there.");
      return;
    }
    setGenerating(true);
    try {
      const snap = await buildSnapshot();
      setEmailSnap(snap);
      setEmailTransitions([]);
      setEmailDialogOpen(true);
    } catch (e) {
      console.error("[v0] advanced-reports: build for email failed", e);
      setFormError(e instanceof Error ? e.message : "Failed to build the report.");
    } finally {
      setGenerating(false);
    }
  }, [validateForm, doorSensor, buildSnapshot]);

  // ── Send by Email (from the door-preview view) ─────────────────────
  // Re-uses whatever snapshot + transitions the operator is staring
  // at right now. No new data fetch.
  const handleSendByEmailFromPreview = useCallback(() => {
    if (!previewData) return;
    setEmailSnap(previewData);
    setEmailTransitions(doorTransitions);
    setEmailDialogOpen(true);
  }, [previewData, doorTransitions]);

  // Toggle a row index in the door-transitions list.
  const toggleTransition = useCallback((rowIndex: number) => {
    setDoorTransitions((prev) => {
      const set = new Set(prev);
      if (set.has(rowIndex)) set.delete(rowIndex);
      else set.add(rowIndex);
      return Array.from(set).sort((a, b) => a - b);
    });
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <>
      {/* Panel 2: list of advanced report types */}
      <div className="w-[320px] border-r border-border/40 flex flex-col bg-card/30 shrink-0">
        <div className="p-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <Wand2 className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
              Advanced Reports
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
            Custom reports.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {ADVANCED_REPORTS.map((r) => {
            const Icon = r.icon;
            const isSel = selectedReport === r.id;
            return (
              <button
                key={r.id}
                onClick={() => r.available && setSelectedReport(r.id)}
                disabled={!r.available}
                className={`w-full text-left px-3 py-2.5 flex items-start gap-3 border-b border-border/10 transition-colors
                  ${isSel ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/20 border-l-2 border-l-transparent"}
                  ${!r.available ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isSel ? "bg-primary/20" : "bg-muted/40"}`}>
                  <Icon className={`h-3.5 w-3.5 ${isSel ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="min-w-0">
                  <div className={`text-xs font-semibold ${isSel ? "text-primary" : "text-foreground"}`}>{r.label}</div>
                  <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">{r.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel 3: Empty state OR the configuration form OR the editable preview */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {!selectedReport ? (
          <EmptyState />
        ) : previewData ? (
          <DoorPreview
            snapshot={previewData}
            transitions={doorTransitions}
            onToggleRow={toggleTransition}
            onReset={() => setDoorTransitions([])}
            onBack={() => { setPreviewData(null); setDoorTransitions([]); }}
            onPrint={() => openPrintWindow(previewData, doorTransitions)}
            onSendEmail={handleSendByEmailFromPreview}
          />
        ) : (
          <ReportForm
            company={company}
            assetsLoading={assetsLoading}
            filteredAssets={filteredAssets}
            assetSearch={assetSearch}
            setAssetSearch={setAssetSearch}
            selectedAssetKey={selectedAssetKey}
            setSelectedAssetKey={setSelectedAssetKey}
            selectedAsset={selectedAsset}
            sensor1Enabled={sensor1Enabled}
            setSensor1Enabled={setSensor1Enabled}
            sensor2Enabled={sensor2Enabled}
            setSensor2Enabled={setSensor2Enabled}
            temp1Down={temp1Down}
            setTemp1Down={setTemp1Down}
            temp1Up={temp1Up}
            setTemp1Up={setTemp1Up}
            temp2Down={temp2Down}
            setTemp2Down={setTemp2Down}
            temp2Up={temp2Up}
            setTemp2Up={setTemp2Up}
            temp1Minus={temp1Minus}
            setTemp1Minus={setTemp1Minus}
            temp2Minus={temp2Minus}
            setTemp2Minus={setTemp2Minus}
            doorSensor={doorSensor}
            setDoorSensor={setDoorSensor}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
            layout={layout}
            setLayout={setLayout}
            stepMinutes={stepMinutes}
            setStepMinutes={setStepMinutes}
            formError={formError}
            generating={generating}
            onBack={() => setSelectedReport(null)}
            onGenerate={handleGenerate}
            onSendEmail={handleSendByEmailFromForm}
          />
        )}
      </div>

      {/* Send-by-email dialog. Mounted once for both flows (form + preview)
         and driven entirely by `emailSnap` + `emailTransitions`. The
         attachment is built lazily inside `buildAttachment`, so even if
         the user changes their mind we never spend cycles rendering a
         PDF nobody will read. */}
      {emailSnap && (
        <SendByEmailDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          adminId={adminSession.id}
          userId={userId}
          historyContext="telematic_door_temp_report"
          defaultSubject={`Temperature Report — ${emailSnap.assetPlate}`}
          defaultBody={
            `Hi,\n\nPlease find attached the temperature report for ${emailSnap.assetPlate}.\n\n` +
            `Range: ${fmtPdfDate(emailSnap.dateFrom)} -> ${fmtPdfDate(emailSnap.dateTo)}\n\n` +
            `Best regards${emailSnap.companyName ? `,\n${emailSnap.companyName}` : ""}`
          }
          buildAttachment={async () => {
            const pdf = await buildDoorTempPdf(emailSnap, emailTransitions);
            return {
              filename: `${pdf.filename}.pdf`,
              base64: pdf.base64,
              contentType: "application/pdf",
            };
          }}
        />
      )}
    </>
  );
}

// ─── Empty state (no report selected) ─────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3 max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Thermometer className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-base font-semibold text-foreground">Pick an Advanced Report</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Select a report type from the list. Each report has its own form and produces a print-ready PDF.
        </p>
      </div>
    </div>
  );
}

// ─── Configuration form ──────────────────────────────────────────���────

interface ReportFormProps {
  company: CompanyProfile | null;
  assetsLoading: boolean;
  filteredAssets: AssetOption[];
  assetSearch: string;
  setAssetSearch: (s: string) => void;
  selectedAssetKey: string;
  setSelectedAssetKey: (s: string) => void;
  selectedAsset: AssetOption | null;
  sensor1Enabled: boolean;
  setSensor1Enabled: (b: boolean) => void;
  sensor2Enabled: boolean;
  setSensor2Enabled: (b: boolean) => void;
  temp1Down: string;
  setTemp1Down: (s: string) => void;
  temp1Up: string;
  setTemp1Up: (s: string) => void;
  temp2Down: string;
  setTemp2Down: (s: string) => void;
  temp2Up: string;
  setTemp2Up: (s: string) => void;
  temp1Minus: boolean;
  setTemp1Minus: (b: boolean) => void;
  temp2Minus: boolean;
  setTemp2Minus: (b: boolean) => void;
  doorSensor: boolean;
  setDoorSensor: (b: boolean) => void;
  dateFrom: string;
  setDateFrom: (s: string) => void;
  dateTo: string;
  setDateTo: (s: string) => void;
  layout: LayoutId;
  setLayout: (l: LayoutId) => void;
  stepMinutes: number;
  setStepMinutes: (n: number) => void;
  formError: string | null;
  generating: boolean;
  onBack: () => void;
  onGenerate: () => void;
  onSendEmail: () => void;
}

function ReportForm(p: ReportFormProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-2xl">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={p.onBack}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ChevronLeft className="h-3 w-3" /> Back to Advanced Reports
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Thermometer className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Door/Temp by Virtual Sensor</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generate a temperature report with simulated SensorTemp1 / SensorTemp2 values and the asset&apos;s GPS location at each step.
              </p>
            </div>
          </div>
        </div>

        {/* Company (read-only auto from profile) */}
        <Field label="Company Name">
          <input
            type="text"
            value={p.company?.company_name || ""}
            readOnly
            placeholder="Will be loaded from Company Profile"
            className="w-full px-3 py-2 rounded-lg bg-muted/30 border border-border/30 text-sm text-foreground placeholder:text-muted-foreground/50 cursor-not-allowed"
          />
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            Loaded from Settings &rarr; Company Profile (logo is also pulled from there).
          </p>
        </Field>

        {/* Asset picker */}
        <Field label="Vehicle / Trailer (GPS required)">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              type="text"
              value={p.assetSearch}
              onChange={(e) => p.setAssetSearch(e.target.value)}
              placeholder="Search by plate or brand..."
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-muted/40 border border-border/40 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div className="max-h-[180px] overflow-y-auto rounded-lg border border-border/40 bg-muted/20">
            {p.assetsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-xs text-muted-foreground">Loading assets...</span>
              </div>
            ) : p.filteredAssets.length === 0 ? (
              <div className="py-6 text-center">
                <Truck className="h-5 w-5 text-muted-foreground/30 mx-auto mb-1.5" />
                <p className="text-xs text-muted-foreground">No GPS-equipped assets found</p>
              </div>
            ) : (
              p.filteredAssets.map((a) => {
                const key = `${a.kind}:${a.id}`;
                const isSel = p.selectedAssetKey === key;
                return (
                  <button
                    key={key}
                    onClick={() => p.setSelectedAssetKey(key)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-3 border-b border-border/10 last:border-b-0 transition-colors ${isSel ? "bg-primary/10" : "hover:bg-muted/30"}`}
                  >
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${a.kind === "vehicle" ? "bg-primary/15 text-primary" : "bg-accent/20 text-accent-foreground"}`}>
                      {a.kind === "vehicle" ? "Veh" : "Trl"}
                    </span>
                    <span className="font-mono text-xs text-foreground">{a.plate}</span>
                    {a.label && (
                      <span className="text-[10px] text-muted-foreground/70 ml-auto truncate max-w-[160px]">{a.label}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </Field>

        {/* Sensors — each block has its own master include toggle */}
        <SensorBlock
          title="Temperature 1 (SensorTemp1)"
          enabled={p.sensor1Enabled}
          onEnabledChange={p.setSensor1Enabled}
          down={p.temp1Down}
          up={p.temp1Up}
          onDownChange={p.setTemp1Down}
          onUpChange={p.setTemp1Up}
          downLabel="Temp Down 1"
          upLabel="Temp Up 1"
          minus={p.temp1Minus}
          onMinusChange={p.setTemp1Minus}
          minusLabel="Negative values (Temp cu minus 1)"
        />

        <SensorBlock
          title="Temperature 2 (SensorTemp2)"
          enabled={p.sensor2Enabled}
          onEnabledChange={p.setSensor2Enabled}
          down={p.temp2Down}
          up={p.temp2Up}
          onDownChange={p.setTemp2Down}
          onUpChange={p.setTemp2Up}
          downLabel="Temp Down 2"
          upLabel="Temp Up 2"
          minus={p.temp2Minus}
          onMinusChange={p.setTemp2Minus}
          minusLabel="Negative values (Temp cu minus 2)"
        />

        {/* Door sensor toggle — its own labelled card so it stands apart
            from the two temperature blocks. */}
        <Field label="Door Sensor">
          <label
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${p.doorSensor ? "border-primary/40 bg-primary/5" : "border-border/40 bg-muted/20 hover:border-border/60"}`}
          >
            <input
              type="checkbox"
              checked={p.doorSensor}
              onChange={(e) => p.setDoorSensor(e.target.checked)}
              className="mt-0.5 rounded border-border/60"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DoorOpen className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Include door open/closed column</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                When enabled, &quot;Generate PDF&quot; opens an editable preview where you can click rows
                to mark exactly when the door opens and closes. The door starts as <strong>Closed</strong>
                and each click flips the state from that row onward.
              </p>
            </div>
          </label>
        </Field>

        {/* Date range */}
        <Field label="Date Range">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground/80 mb-1 block">Start</label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
                <input
                  type="datetime-local"
                  value={p.dateFrom}
                  onChange={(e) => p.setDateFrom(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-muted/40 border border-border/40 text-xs text-foreground outline-none focus:border-primary/50 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground/80 mb-1 block">End</label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
                <input
                  type="datetime-local"
                  value={p.dateTo}
                  onChange={(e) => p.setDateTo(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-muted/40 border border-border/40 text-xs text-foreground outline-none focus:border-primary/50 transition-colors"
                />
              </div>
            </div>
          </div>
        </Field>

        {/* Layout + Step */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <Field label="Layout" noMargin>
            <select
              value={p.layout}
              onChange={(e) => p.setLayout(e.target.value as LayoutId)}
              className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border/40 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
            >
              {LAYOUT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            {p.layout === "with_location" && (
              <p className="text-[10px] text-muted-foreground/70 mt-1 flex items-start gap-1">
                <MapPin className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                Adds the nearest GPS address to each row.
              </p>
            )}
          </Field>
          <Field label="Step Time" noMargin>
            <select
              value={p.stepMinutes}
              onChange={(e) => p.setStepMinutes(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border/40 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
            >
              {STEP_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Error */}
        {p.formError && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-2">
            <CircleAlert className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <span className="text-xs text-destructive">{p.formError}</span>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-between border-t border-border/30 pt-5 gap-4">
          <p className="text-[11px] text-muted-foreground flex-1 min-w-0">
            {p.doorSensor
              ? "An editable preview will open. You'll mark when the door opens / closes, then print or send by email."
              : "Generate the PDF in a new tab, or send it directly by email as an attachment."}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {/* Send-by-email — disabled for the door-sensor flow because
                the operator needs to mark door transitions in the preview
                view before the report makes sense to email. */}
            <button
              onClick={p.onSendEmail}
              disabled={p.generating || p.doorSensor}
              title={p.doorSensor ? "Use Preview & Print first, then send from the preview." : "Send the report as a PDF email attachment."}
              className="px-4 py-2 rounded-lg bg-muted/40 border border-border/40 text-foreground text-xs font-semibold hover:bg-muted/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Mail className="h-3.5 w-3.5" /> Send by Email
            </button>
            <button
              onClick={p.onGenerate}
              disabled={p.generating}
              className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {p.generating ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
              ) : p.doorSensor ? (
                <><Eye className="h-3.5 w-3.5" /> Preview &amp; Print</>
              ) : (
                <><Printer className="h-3.5 w-3.5" /> Generate PDF</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sensor block (collapses inputs when sensor is disabled) ─────────

function SensorBlock({
  title, enabled, onEnabledChange,
  down, up, onDownChange, onUpChange, downLabel, upLabel,
  minus, onMinusChange, minusLabel,
}: {
  title: string;
  enabled: boolean;
  onEnabledChange: (b: boolean) => void;
  down: string; up: string;
  onDownChange: (s: string) => void;
  onUpChange: (s: string) => void;
  downLabel: string; upLabel: string;
  minus: boolean;
  onMinusChange: (b: boolean) => void;
  minusLabel: string;
}) {
  return (
    <div className="mb-5">
      <label className="flex items-center gap-2 text-xs font-medium text-foreground mb-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="rounded border-border/60"
        />
        <span>{title}</span>
        {!enabled && (
          <span className="text-[10px] text-muted-foreground/70 font-normal ml-1">(excluded from report)</span>
        )}
      </label>
      <div className={enabled ? "" : "opacity-40 pointer-events-none"}>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput value={down} onChange={onDownChange} label={downLabel} placeholder="e.g. 1" />
          <NumberInput value={up} onChange={onUpChange} label={upLabel} placeholder="e.g. 3" />
        </div>
        <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={minus}
            onChange={(e) => onMinusChange(e.target.checked)}
            className="rounded border-border/60"
          />
          <span className="text-xs text-foreground">{minusLabel}</span>
        </label>
      </div>
    </div>
  );
}

// ─── Editable door preview (only shown when Door Sensor is enabled) ─

function DoorPreview({
  snapshot, transitions, onToggleRow, onReset, onBack, onPrint, onSendEmail,
}: {
  snapshot: PreviewSnapshot;
  transitions: number[];
  onToggleRow: (i: number) => void;
  onReset: () => void;
  onBack: () => void;
  onPrint: () => void;
  onSendEmail: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-border/40 bg-card/40 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to form
        </button>
        <div className="h-4 w-px bg-border/40" />
        <div className="flex items-center gap-2">
          <DoorOpen className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Editable Door Preview</span>
        </div>
        <span className="text-[10px] text-muted-foreground hidden md:inline">
          Click any row in the Door column to mark a state change.
          {transitions.length > 0 && (
            <span className="ml-2 text-foreground">
              {transitions.length} transition{transitions.length === 1 ? "" : "s"} set
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onReset}
            disabled={transitions.length === 0}
            className="px-3 py-1.5 rounded-md bg-muted/40 border border-border/40 text-xs text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
          <button
            onClick={onSendEmail}
            className="px-3 py-1.5 rounded-md bg-muted/40 border border-border/40 text-foreground text-xs font-semibold hover:bg-muted/60 transition-colors flex items-center gap-1.5"
            title="Send the report as a PDF email attachment, including the door states you marked."
          >
            <Mail className="h-3.5 w-3.5" /> Send by Email
          </button>
          <button
            onClick={onPrint}
            className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5"
          >
            <Printer className="h-3.5 w-3.5" /> Print PDF
          </button>
        </div>
      </div>

      {/* Snapshot summary header */}
      <div className="px-5 py-3 border-b border-border/30 bg-card/20 flex items-center gap-4 flex-wrap">
        {snapshot.companyName && (
          <div className="text-xs">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Company</div>
            <div className="font-semibold text-foreground">{snapshot.companyName}</div>
          </div>
        )}
        <div className="text-xs">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Asset</div>
          <div className="font-mono font-semibold text-foreground">{snapshot.assetPlate}</div>
        </div>
        <div className="text-xs">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Rows</div>
          <div className="font-semibold text-foreground">{snapshot.rows.length}</div>
        </div>
      </div>

      {/* Editable table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card border-b border-border/40 z-10">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-foreground text-[11px] uppercase tracking-wider">Timestamp</th>
              {snapshot.includeLocation && (
                <th className="text-left px-4 py-2 font-semibold text-foreground text-[11px] uppercase tracking-wider">Location</th>
              )}
              <th className="text-center px-4 py-2 font-semibold text-foreground text-[11px] uppercase tracking-wider">
                Door <span className="text-muted-foreground/60 font-normal normal-case">(click to change)</span>
              </th>
              {snapshot.sensor1Enabled && (
                <th className="text-right px-4 py-2 font-semibold text-foreground text-[11px] uppercase tracking-wider">SensorTemp1</th>
              )}
              {snapshot.sensor2Enabled && (
                <th className="text-right px-4 py-2 font-semibold text-foreground text-[11px] uppercase tracking-wider">SensorTemp2</th>
              )}
            </tr>
          </thead>
          <tbody>
            {snapshot.rows.map((r, i) => {
              const state = computeDoorState(i, transitions);
              const isTransition = transitions.includes(i);
              const rowTint = i % 2 === 0 ? "bg-transparent" : "bg-muted/10";
              return (
                <tr key={i} className={`border-b border-border/15 ${rowTint} ${isTransition ? "outline outline-1 outline-primary/30" : ""}`}>
                  <td className="px-4 py-2 font-mono text-foreground whitespace-nowrap">{fmtPdfDate(r.ts)}</td>
                  {snapshot.includeLocation && (
                    <td className="px-4 py-2 text-foreground/80 max-w-[300px] truncate">
                      {r.address ||
                        (r.lat != null && r.lng != null
                          ? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`
                          : "—")}
                    </td>
                  )}
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => onToggleRow(i)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all
                        ${state === "Open"
                          ? "bg-red-500/15 text-red-600 hover:bg-red-500/25 ring-1 ring-inset ring-red-500/20"
                          : "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 ring-1 ring-inset ring-emerald-500/20"}
                        ${isTransition ? "shadow-[0_0_0_2px_var(--primary,#3b82f6)]" : ""}`}
                      title={isTransition ? "Transition point — click again to remove" : "Click to flip door state from this row"}
                    >
                      {state === "Open" ? <DoorOpen className="h-3 w-3" /> : <DoorClosed className="h-3 w-3" />}
                      {state}
                    </button>
                  </td>
                  {snapshot.sensor1Enabled && (
                    <td className="px-4 py-2 text-right tabular-nums text-foreground">{r.t1?.toFixed(1) ?? "—"}</td>
                  )}
                  {snapshot.sensor2Enabled && (
                    <td className="px-4 py-2 text-right tabular-nums text-foreground">{r.t2?.toFixed(1) ?? "—"}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Small presentational helpers ───────────────────────────────────

function Field({ label, children, noMargin }: { label: string; children: React.ReactNode; noMargin?: boolean }) {
  return (
    <div className={noMargin ? "" : "mb-5"}>
      <label className="text-xs font-medium text-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function NumberInput({
  value, onChange, label, placeholder,
}: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground/80 mb-1 block">{label}</label>
      <input
        type="number"
        step="0.1"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border/40 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors"
      />
    </div>
  );
}
