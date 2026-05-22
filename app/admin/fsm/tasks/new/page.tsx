"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, X, GripVertical, Trash2, MapPin, Clock, User,
  Send, Building2, FileText, Navigation,
  Check, Loader2, Cloud, CloudOff, Search,
  Route, ChevronDown, ChevronUp, Phone, Truck, Users,
  Target, ArrowLeft, Shapes, Bell, BellOff, Mail, Settings2,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface AdminSession { id: string; email: string; company_name: string | null; }

interface DraftTab {
  id: string;
  dbId: string | null;
  referenceNumber: string | null;
  title: string;
  description: string;
  priority: string;
  driver_ids: string[];
  vehicle_ids: string[];
  customer_id: string;
  task_form_id: string;
  dispatch_form_id: string;
  dispatch_form_values: Record<string, any>;
  notes: string;
  stops: StopData[];
  saveStatus: "idle" | "saving" | "saved" | "error";
  lastSavedAt: string | null;
  // Notification config
  notifyEnabled: boolean;
  notifySubscriberIds: string[];
  notifyOnStatusChange: boolean;
  notifyOnCompletion: boolean;
  notifyOnDelay: boolean;
  notifyOnDriverAction: boolean;
  notifyChannels: string[];
  driverReminderHours: number | null;
  driverReminderRepeatMin: number | null;
}

interface AdminUser { id: string; name: string; email: string; }

interface StopData {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  geofence_radius: number;
  auto_checkin: boolean;
  auto_checkout: boolean;
  planned_arrival: string;
  planned_departure: string;
  time_window_start: string;
  time_window_end: string;
  estimated_duration_minutes: string;
  stop_form_id: string;
  dispatch_stop_form_id: string;
  dispatch_stop_form_values: Record<string, any>;
  contact_name: string;
  contact_phone: string;
  notes: string;
}

interface Driver { id: string; name: string; }
interface Vehicle { id: string; plate_number: string; make?: string; model?: string; }
interface Partner { id: string; name: string; }
interface TaskForm { id: string; name: string; scope: string; filled_by: string; }
interface TaskFormField { id: string; form_id: string; field_type: string; label: string; placeholder: string | null; help_text: string | null; is_required: boolean; is_visible_to_driver: boolean; options: any; default_value: string | null; sort_order: number; }
interface AddressSuggestion { display_name: string; lat: string; lon: string; }

function formatLocalDatetime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyStop(durationMinutes = 30): StopData {
  const now = new Date();
  const end = new Date(now.getTime() + durationMinutes * 60 * 1000);
  return {
    id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "", address: "", lat: null, lng: null, geofence_radius: 150,
    auto_checkin: false, auto_checkout: false,
    planned_arrival: "", planned_departure: "",
    time_window_start: formatLocalDatetime(now),
    time_window_end: formatLocalDatetime(end),
    estimated_duration_minutes: durationMinutes.toString(),
    stop_form_id: "",
    dispatch_stop_form_id: "",
    dispatch_stop_form_values: {},
    contact_name: "", contact_phone: "", notes: "",
  };
}

function DispatchFormField({ field, value, onChange }: { field: TaskFormField; value: any; onChange: (val: any) => void }) {
  switch (field.field_type) {
    case "text":
      return (
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground/70">{field.label}{field.is_required && <span className="text-destructive ml-0.5">*</span>}</Label>
          <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ""} className="h-7 text-[11px] bg-background/60" />
          {field.help_text && <p className="text-[9px] text-muted-foreground/50">{field.help_text}</p>}
        </div>
      );
    case "textarea":
      return (
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground/70">{field.label}{field.is_required && <span className="text-destructive ml-0.5">*</span>}</Label>
          <Textarea value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ""} rows={2} className="text-[11px] resize-none bg-background/60" />
          {field.help_text && <p className="text-[9px] text-muted-foreground/50">{field.help_text}</p>}
        </div>
      );
    case "number":
      return (
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground/70">{field.label}{field.is_required && <span className="text-destructive ml-0.5">*</span>}</Label>
          <Input type="number" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ""} className="h-7 text-[11px] bg-background/60" />
        </div>
      );
    case "select":
      const options = Array.isArray(field.options) ? field.options : [];
      return (
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground/70">{field.label}{field.is_required && <span className="text-destructive ml-0.5">*</span>}</Label>
          <Select value={value || ""} onValueChange={onChange}>
            <SelectTrigger className="h-7 text-[11px] bg-background/60"><SelectValue placeholder={field.placeholder || "Select..."} /></SelectTrigger>
            <SelectContent className="z-[9999]">
              {options.map((opt: string, i: number) => <SelectItem key={i} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    case "checkbox":
    case "toggle":
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch checked={!!value} onCheckedChange={onChange} className="scale-[0.65] origin-left" />
          <span className="text-[11px]">{field.label}</span>
        </label>
      );
    case "date":
      return (
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground/70">{field.label}</Label>
          <Input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} className="h-7 text-[11px] bg-background/60" />
        </div>
      );
    case "time":
      return (
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground/70">{field.label}</Label>
          <Input type="time" value={value || ""} onChange={(e) => onChange(e.target.value)} className="h-7 text-[11px] bg-background/60" />
        </div>
      );
    default:
      return (
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground/70">{field.label}</Label>
          <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ""} className="h-7 text-[11px] bg-background/60" />
        </div>
      );
  }
}

function emptyDraft(): DraftTab {
  return {
    id: `draft-${Date.now()}`,
    dbId: null,
    referenceNumber: null,
    title: "", description: "", priority: "normal",
    driver_ids: [], vehicle_ids: [], customer_id: "",
    task_form_id: "", dispatch_form_id: "", dispatch_form_values: {}, notes: "",
    stops: [emptyStop()],
    saveStatus: "idle",
    lastSavedAt: null,
    // Notification defaults
    notifyEnabled: true,
    notifySubscriberIds: [],
    notifyOnStatusChange: true,
    notifyOnCompletion: true,
    notifyOnDelay: true,
    notifyOnDriverAction: true,
    notifyChannels: ["in_app", "push"],
    driverReminderHours: 1,
    driverReminderRepeatMin: 30,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Geocoding & Address Suggestions
// ═══════════════════════════════════════════════════════════════════════════

async function searchAddress(query: string): Promise<AddressSuggestion[]> {
  if (!query || query.length < 3) return [];
  try {
    const res = await fetch(
      `https://rvs.bngtracking.ro/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
      { headers: { "User-Agent": "BNG-TMS/1.0" } }
    );
    return await res.json();
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════
// Valhalla Truck Routing (via /api/tms/route)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchDrivingRoute(stops: StopData[]): Promise<{ geometry: [number, number][]; distance: number; duration: number } | null> {
  const valid = stops.filter(s => s.lat !== null && s.lng !== null);
  if (valid.length < 2) return null;
  try {
    const res = await fetch("/api/tms/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: valid.map(s => ({ lat: s.lat, lon: s.lng, type: "break" })),
        costing: "truck",
        costing_options: { truck: { height: 4.0, width: 2.55, length: 16.5, weight: 40.0, axle_load: 8.0, use_tolls: 0.5 } },
        units: "kilometers",
      }),
    });
    const data = await res.json();
    if (res.ok && data.latlngs) {
      return {
        geometry: data.latlngs,
        distance: data.distance_km * 1000, // Convert back to meters for compatibility
        duration: data.duration_minutes * 60, // Convert back to seconds for compatibility
      };
    }
  } catch { /* skip */ }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Multi-Select Chip Component
// ═══════════════════════════════════════════════════════════════════════════

function ChipSelect<T extends { id: string }>({
  label, icon: Icon, items, selectedIds, onChange, renderLabel,
}: {
  label: string;
  icon: React.ElementType;
  items: T[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  renderLabel: (item: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const available = items.filter(i => !selectedIds.includes(i.id));

  useEffect(() => {
    if (!open) return;
    // Delay adding the listener to avoid the opening click immediately closing it
    const timeout = setTimeout(() => {
      const handler = (e: MouseEvent) => {
        const target = e.target as Node;
        const inTrigger = triggerRef.current?.contains(target);
        const inDropdown = dropdownRef.current?.contains(target);
        if (!inTrigger && !inDropdown) setOpen(false);
      };
      document.addEventListener("mousedown", handler);
      // Store cleanup in ref
      cleanupRef.current = () => document.removeEventListener("mousedown", handler);
    }, 50);
    return () => {
      clearTimeout(timeout);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [open]);

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setOpen(!open);
  };

  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </Label>
      <div ref={triggerRef}>
        <div
          className="min-h-[32px] flex flex-wrap items-center gap-1 px-2 py-1 border rounded-md bg-background/60 cursor-pointer hover:bg-background/80 transition-colors"
          onClick={handleOpen}
        >
          {selectedIds.length === 0 && (
            <span className="text-[11px] text-muted-foreground/50 py-0.5">Click to assign...</span>
          )}
          {selectedIds.map(id => {
            const item = items.find(i => i.id === id);
            if (!item) return null;
            return (
              <Badge key={id} variant="secondary" className="gap-1 pr-0.5 text-[10px] h-5 bg-primary/10 text-primary border-primary/20">
                {renderLabel(item)}
                <button
                  onClick={(e) => { e.stopPropagation(); onChange(selectedIds.filter(x => x !== id)); }}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            );
          })}
          {available.length > 0 && <Plus className="h-3 w-3 text-muted-foreground/40 ml-auto" />}
        </div>
      </div>
      {open && available.length > 0 && createPortal(
        <div
          ref={dropdownRef}
          className="fixed bg-popover border rounded-md shadow-xl max-h-[160px] overflow-y-auto py-1"
          style={{ zIndex: 9999, top: pos.top, left: pos.left, width: pos.width }}
        >
          {available.map(item => (
            <button
              key={item.id}
              className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-muted transition-colors flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                onChange([...selectedIds, item.id]);
                if (available.length === 1) setOpen(false);
              }}
            >
              <Icon className="h-3 w-3 text-muted-foreground" />
              {renderLabel(item)}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Address Input with Autocomplete
// ═══════════════════════════════════════════════════════════════════════════

function AddressInput({ value, onSelect, onChange }: {
  value: string;
  onSelect: (address: string, lat: number, lng: number) => void;
  onChange: (address: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (val: string) => {
    onChange(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (val.length >= 3) {
      setSearching(true);
      timerRef.current = setTimeout(async () => {
        const results = await searchAddress(val);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        setSearching(false);
      }, 400);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setSearching(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
      {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />}
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        placeholder="Search address..."
        className="h-8 text-[11px] pl-8 bg-background/60"
      />
      {showSuggestions && (
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-xl max-h-[200px] overflow-y-auto py-1">
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted transition-colors flex items-start gap-2"
              onClick={() => {
                onSelect(s.display_name, parseFloat(s.lat), parseFloat(s.lon));
                setShowSuggestions(false);
              }}
            >
              <MapPin className="h-3 w-3 text-primary mt-0.5 shrink-0" />
              <span className="line-clamp-2 leading-tight">{s.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Map Component - Full screen with interactive geofences
// ═══════════════════════════════════════════════════════════════════════════

function TaskMap({ stops, selectedStopIndex, onStopPositionChange, onRadiusChange, routeGeometry }: {
  stops: StopData[];
  selectedStopIndex: number | null;
  onStopPositionChange: (index: number, lat: number, lng: number) => void;
  onRadiusChange: (index: number, radius: number) => void;
  routeGeometry: [number, number][] | null;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const isDraggingRef = useRef(false);
  const [L, setL] = useState<any>(null);

  useEffect(() => {
    import("leaflet").then(mod => setL(mod.default || mod));
  }, []);

  useEffect(() => {
    if (!L || !mapRef.current || mapInstanceRef.current) return;
    const linkEl = document.createElement("link");
    linkEl.rel = "stylesheet";
    linkEl.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(linkEl);

    const map = L.map(mapRef.current, {
      center: [48.8566, 2.3522],
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, [L]);

  useEffect(() => {
    if (!L || !mapInstanceRef.current) return;
    if (isDraggingRef.current) return;
    const map = mapInstanceRef.current;

    layersRef.current.forEach(l => { try { map.removeLayer(l); } catch { /* skip */ } });
    layersRef.current = [];

    const validStops = stops.filter(s => s.lat !== null && s.lng !== null);
    const bounds: [number, number][] = [];

    // Route polyline
    if (routeGeometry && routeGeometry.length > 1) {
      const shadow = L.polyline(routeGeometry, {
        color: "#1d4ed8", weight: 8, opacity: 0.12, smoothFactor: 1, lineCap: "round", lineJoin: "round",
      }).addTo(map);
      layersRef.current.push(shadow);

      const line = L.polyline(routeGeometry, {
        color: "#3b82f6", weight: 4, opacity: 0.9, smoothFactor: 1, lineCap: "round", lineJoin: "round",
      }).addTo(map);
      layersRef.current.push(line);
    }

    // Stops
    validStops.forEach(stop => {
      const idx = stops.indexOf(stop);
      const isSelected = idx === selectedStopIndex;
      const pos: [number, number] = [stop.lat!, stop.lng!];
      bounds.push(pos);

      // Geofence circle
      if (stop.geofence_radius > 0) {
        const circle = L.circle(pos, {
          radius: stop.geofence_radius,
          color: isSelected ? "#3b82f6" : "#8b5cf6",
          fillColor: isSelected ? "#3b82f6" : "#8b5cf6",
          fillOpacity: isSelected ? 0.10 : 0.05,
          weight: isSelected ? 2.5 : 1.5,
          dashArray: isSelected ? "" : "5 5",
        }).addTo(map);
        layersRef.current.push(circle);

        // Radius label on circle
        if (isSelected) {
          const labelLat = stop.lat! + (stop.geofence_radius / 111320) * 0.7;
          const labelIcon = L.divIcon({
            className: "",
            html: `<div style="
              background:white;color:#3b82f6;font-size:10px;font-weight:700;
              padding:2px 6px;border-radius:10px;border:1.5px solid #3b82f6;
              white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.15);
            ">${stop.geofence_radius}m</div>`,
            iconSize: [0, 0],
          });
          const labelMarker = L.marker([labelLat, stop.lng!], { icon: labelIcon, interactive: false }).addTo(map);
          layersRef.current.push(labelMarker);
        }

        // Draggable resize handles at 4 cardinal directions (selected only)
        if (isSelected) {
          const directions = [
            { dlat: 0, dlng: 1, cursor: "ew-resize" },   // east
            { dlat: 0, dlng: -1, cursor: "ew-resize" },  // west
            { dlat: 1, dlng: 0, cursor: "ns-resize" },   // north
            { dlat: -1, dlng: 0, cursor: "ns-resize" },  // south
          ];

          for (const dir of directions) {
            const hLat = stop.lat! + dir.dlat * (stop.geofence_radius / 111320);
            const hLng = stop.lng! + dir.dlng * (stop.geofence_radius / 111320) / Math.cos(stop.lat! * Math.PI / 180);
            
            const handleIcon = L.divIcon({
              className: "",
              html: `<div style="
                width:14px;height:14px;background:white;border:2.5px solid #3b82f6;
                border-radius:50%;cursor:${dir.cursor};
                box-shadow:0 1px 6px rgba(59,130,246,0.35);
              "></div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            });

            const handle = L.marker([hLat, hLng], {
              icon: handleIcon,
              draggable: true,
              zIndexOffset: 3000,
            }).addTo(map);

            handle.on("dragstart", () => { isDraggingRef.current = true; });

            handle.on("drag", () => {
              const hPos = handle.getLatLng();
              const center = L.latLng(stop.lat!, stop.lng!);
              const newR = Math.max(25, Math.min(2000, Math.round(center.distanceTo(hPos))));
              circle.setRadius(newR);
            });

            handle.on("dragend", () => {
              const hPos = handle.getLatLng();
              const center = L.latLng(stop.lat!, stop.lng!);
              const newR = Math.max(25, Math.min(2000, Math.round(center.distanceTo(hPos))));
              isDraggingRef.current = false;
              onRadiusChange(idx, newR);
            });

            layersRef.current.push(handle);
          }
        }
      }

      // Numbered marker
      const sz = isSelected ? 34 : 28;
      const icon = L.divIcon({
        className: "",
        html: `<div style="
          background:${isSelected ? "#3b82f6" : "#6366f1"};
          color:#fff;width:${sz}px;height:${sz}px;
          border-radius:50%;display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:${isSelected ? 14 : 12}px;font-family:system-ui;
          border:3px solid white;
          box-shadow:0 2px 12px ${isSelected ? "rgba(59,130,246,0.5)" : "rgba(0,0,0,0.2)"};
        ">${idx + 1}</div>`,
        iconSize: [sz, sz],
        iconAnchor: [sz / 2, sz / 2],
      });

      const marker = L.marker(pos, { icon, draggable: true, zIndexOffset: isSelected ? 2000 : 1000 }).addTo(map);
      marker.bindTooltip(
        `<b style="font-size:12px">${stop.name || `Stop ${idx + 1}`}</b>
         ${stop.address ? `<br><span style="font-size:10px;color:#888">${stop.address.substring(0, 50)}...</span>` : ""}`,
        { direction: "top", offset: [0, -sz / 2 - 4] }
      );
      marker.on("dragstart", () => { isDraggingRef.current = true; });
      marker.on("dragend", (e: any) => {
        const ll = e.target.getLatLng();
        isDraggingRef.current = false;
        onStopPositionChange(idx, ll.lat, ll.lng);
      });
      layersRef.current.push(marker);
    });

    if (bounds.length > 0) {
      if (bounds.length === 1) map.setView(bounds[0], 15);
      else map.fitBounds(bounds, { padding: [80, 80], maxZoom: 15 });
    }
  }, [L, stops, selectedStopIndex, routeGeometry, onStopPositionChange, onRadiusChange]);

  return <div ref={mapRef} className="absolute inset-0" />;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════

export default function TaskCreatePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [tabs, setTabs] = useState<DraftTab[]>([emptyDraft()]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(0);
  const [notifySettingsOpen, setNotifySettingsOpen] = useState(false);
  const [routeData, setRouteData] = useState<{ geometry: [number, number][]; distance: number; duration: number } | null>(null);
  const [showDetails, setShowDetails] = useState(true);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Partner[]>([]);
  const [taskDriverForms, setTaskDriverForms] = useState<TaskForm[]>([]);
  const [stopDriverForms, setStopDriverForms] = useState<TaskForm[]>([]);
  const [taskDispatchForms, setTaskDispatchForms] = useState<TaskForm[]>([]);
  const [stopDispatchForms, setStopDispatchForms] = useState<TaskForm[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [formFieldsCache, setFormFieldsCache] = useState<Record<string, TaskFormField[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (!stored) { router.push("/admin/login"); return; }
    const session = JSON.parse(stored);
    setAdminSession(session);
    // Auto-add creator as notification subscriber on all drafts
    setTabs(prev => prev.map(t =>
      t.notifySubscriberIds.length === 0
        ? { ...t, notifySubscriberIds: [session.id] }
        : t
    ));
  }, [router]);

  const fetchRefData = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const supabase = createClient();
    const [driversRes, vehiclesRes, customersRes, formsRes, usersRes] = await Promise.all([
      supabase.from("drivers").select("id, name").eq("admin_id", adminSession.id).eq("is_active", true).order("name"),
      supabase.from("vehicles").select("id, plate_number, make, model").eq("admin_id", adminSession.id).eq("is_active", true).order("plate_number"),
      supabase.from("business_partners").select("id, name").eq("admin_id", adminSession.id).eq("is_active", true).order("name"),
      supabase.from("task_forms").select("id, name, scope, filled_by").eq("admin_id", adminSession.id).eq("is_active", true).order("name"),
      supabase.from("users").select("id, name, email").eq("admin_id", adminSession.id).eq("status", "active").order("name"),
    ]);
    setDrivers(driversRes.data || []);
    setVehicles(vehiclesRes.data || []);
    setCustomers(customersRes.data || []);
    // Include the admin themselves + all sub-users in the notify list
    const subUsers: AdminUser[] = usersRes.data || [];
    const adminSelf: AdminUser = { id: adminSession.id, name: adminSession.name || "Me", email: adminSession.email || "" };
    const allNotifyUsers = [adminSelf, ...subUsers.filter(u => u.id !== adminSession.id)];
    setAdminUsers(allNotifyUsers);
    const allForms = formsRes.data || [];
    setTaskDriverForms(allForms.filter((f: TaskForm) => f.scope === "task" && f.filled_by !== "dispatcher"));
    setStopDriverForms(allForms.filter((f: TaskForm) => f.scope === "stop" && f.filled_by !== "dispatcher"));
    setTaskDispatchForms(allForms.filter((f: TaskForm) => f.scope === "task" && f.filled_by === "dispatcher"));
    setStopDispatchForms(allForms.filter((f: TaskForm) => f.scope === "stop" && f.filled_by === "dispatcher"));
    setLoading(false);
  }, [adminSession?.id]);

  // Load existing drafts from DB on mount, and handle ?edit=<taskId> for editing
  const loadDrafts = useCallback(async () => {
    if (!adminSession?.id) return;
    const supabase = createClient();

    // Check for edit parameter - load a specific task for editing
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get("edit");

    let query = supabase.from("tasks").select("*").eq("admin_id", adminSession.id);

    if (editId) {
      // Load the specific task to edit (regardless of status)
      query = query.eq("id", editId);
    } else {
      // Normal mode: load drafts only
      query = query.eq("status", "draft");
    }

    const { data: drafts, error: draftsErr } = await query.order("updated_at", { ascending: false });


    if (!drafts || drafts.length === 0) return;

    // Load stops for each draft
    const draftIds = drafts.map(d => d.id);
    const { data: allStops, error: stopsErr } = await supabase
      .from("task_stops")
      .select("*")
      .in("task_id", draftIds)
      .order("sequence_order");

    // Load assignments for each draft
    const { data: allAssignments, error: assignErr } = await supabase
      .from("task_assignments")
      .select("*")
      .in("task_id", draftIds);



    const loadedTabs: DraftTab[] = drafts.map(draft => {
      const draftStops = (allStops || []).filter(s => s.task_id === draft.id);
      const draftAssignments = (allAssignments || []).filter(a => a.task_id === draft.id);

      // Build driver/vehicle ids from assignments, with fallback to legacy fields on tasks table
      const assignedDriverIds = draftAssignments.filter(a => a.driver_id).map(a => a.driver_id);
      const assignedVehicleIds = draftAssignments.filter(a => a.vehicle_id).map(a => a.vehicle_id);
      const driverIds = assignedDriverIds.length > 0 ? assignedDriverIds : (draft.driver_id ? [draft.driver_id] : []);
      const vehicleIds = assignedVehicleIds.length > 0 ? assignedVehicleIds : (draft.vehicle_id ? [draft.vehicle_id] : []);

      return {
        id: `draft-${draft.id}`,
        dbId: draft.id,
        referenceNumber: draft.reference_number || null,
        title: draft.title || "",
        description: draft.description || "",
        priority: draft.priority || "normal",
        driver_ids: driverIds,
        vehicle_ids: vehicleIds,
        customer_id: draft.customer_id || "",
        task_form_id: draft.task_form_id || "",
        dispatch_form_id: draft.dispatch_form_id || "",
        dispatch_form_values: draft.dispatch_form_values || {},
        notes: draft.notes || "",
        stops: draftStops.length > 0
          ? draftStops.map(s => ({
              id: `stop-${s.id}`,
              name: s.name || "",
              address: s.address || "",
              lat: s.lat,
              lng: s.lng,
              geofence_radius: s.geofence_radius || 150,
              auto_checkin: s.auto_checkin || false,
              auto_checkout: s.auto_checkout || false,
              planned_arrival: s.planned_arrival ? new Date(s.planned_arrival).toISOString().slice(0, 16) : "",
              planned_departure: s.planned_departure ? new Date(s.planned_departure).toISOString().slice(0, 16) : "",
              time_window_start: s.time_window_start ? new Date(s.time_window_start).toISOString().slice(0, 16) : "",
              time_window_end: s.time_window_end ? new Date(s.time_window_end).toISOString().slice(0, 16) : "",
              estimated_duration_minutes: s.estimated_duration_minutes?.toString() || "",
              stop_form_id: s.stop_form_id || "",
              dispatch_stop_form_id: s.dispatch_stop_form_id || "",
              dispatch_stop_form_values: s.dispatch_stop_form_values || {},
              contact_name: s.contact_name || "",
              contact_phone: s.contact_phone || "",
              notes: s.notes || "",
            }))
          : [emptyStop()],
        saveStatus: "saved" as const,
        lastSavedAt: draft.updated_at,
      };
    });

    setTabs(loadedTabs);
    setActiveTabIndex(0);
    setSelectedStopIndex(0);
  }, [adminSession?.id]);

  const loadFormFields = useCallback(async (formId: string) => {
    if (formFieldsCache[formId]) return formFieldsCache[formId];
    const supabase = createClient();
    const { data } = await supabase.from("task_form_fields").select("*").eq("form_id", formId).order("sort_order");
    const fields = data || [];
    setFormFieldsCache(prev => ({ ...prev, [formId]: fields }));
    return fields;
  }, [formFieldsCache]);

  useEffect(() => { fetchRefData(); loadDrafts(); }, [fetchRefData, loadDrafts]);

  const activeTab = tabs[activeTabIndex];

  // Tab / Stop helpers
  const updateTab = useCallback((updates: Partial<DraftTab>) => {
    setTabs(prev => prev.map((t, i) =>
      i === activeTabIndex ? { ...t, ...updates, saveStatus: "idle" as const } : t
    ));
  }, [activeTabIndex]);

  const updateStop = useCallback((stopIndex: number, updates: Partial<StopData>) => {
    setTabs(prev => prev.map((t, i) => {
      if (i !== activeTabIndex) return t;
      const newStops = [...t.stops];
      newStops[stopIndex] = { ...newStops[stopIndex], ...updates };
      return { ...t, stops: newStops, saveStatus: "idle" as const };
    }));
  }, [activeTabIndex]);

  const addStop = () => {
    const lastStop = activeTab.stops[activeTab.stops.length - 1];
    // Chain time windows: new stop starts when previous ends
    const newStop = emptyStop();
    if (lastStop?.time_window_end) {
      const prevEnd = new Date(lastStop.time_window_end);
      if (!isNaN(prevEnd.getTime())) {
        const dur = parseInt(newStop.estimated_duration_minutes) || 30;
        newStop.time_window_start = formatLocalDatetime(prevEnd);
        newStop.time_window_end = formatLocalDatetime(new Date(prevEnd.getTime() + dur * 60 * 1000));
      }
    }
    updateTab({ stops: [...activeTab.stops, newStop] });
    setSelectedStopIndex(activeTab.stops.length);
  };

  const removeStop = (index: number) => {
    if (activeTab.stops.length <= 1) return;
    const newStops = activeTab.stops.filter((_, i) => i !== index);
    updateTab({ stops: newStops });
    if (selectedStopIndex === index) setSelectedStopIndex(Math.max(0, index - 1));
    else if (selectedStopIndex !== null && selectedStopIndex > index) setSelectedStopIndex(selectedStopIndex - 1);
  };

  // Drag reorder
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleStopDrop = (toIndex: number) => {
    if (dragIdx === null || dragIdx === toIndex) return;
    const newStops = [...activeTab.stops];
    const [removed] = newStops.splice(dragIdx, 1);
    newStops.splice(toIndex, 0, removed);
    updateTab({ stops: newStops });
    setSelectedStopIndex(toIndex);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const addNewTab = () => {
    setTabs(prev => [...prev, emptyDraft()]);
    setActiveTabIndex(tabs.length);
    setSelectedStopIndex(0);
    setRouteData(null);
  };

  const closeTab = async (index: number) => {
    if (tabs.length <= 1) return;
    const closingTab = tabs[index];
    // Delete draft from DB if it was saved
    if (closingTab.dbId) {
      const supabase = createClient();
      await supabase.from("task_assignments").delete().eq("task_id", closingTab.dbId);
      await supabase.from("task_stops").delete().eq("task_id", closingTab.dbId);
      await supabase.from("tasks").delete().eq("id", closingTab.dbId);
    }
    const newTabs = tabs.filter((_, i) => i !== index);
    setTabs(newTabs);
    if (activeTabIndex >= newTabs.length) setActiveTabIndex(newTabs.length - 1);
    else if (activeTabIndex > index) setActiveTabIndex(activeTabIndex - 1);
  };

  // Map callbacks
  const handleStopPositionChange = useCallback((index: number, lat: number, lng: number) => {
    updateStop(index, { lat, lng });
  }, [updateStop]);

  const handleRadiusChange = useCallback((index: number, radius: number) => {
    updateStop(index, { geofence_radius: radius });
  }, [updateStop]);

  // Fetch driving route
  useEffect(() => {
    if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
    routeTimerRef.current = setTimeout(async () => {
      const data = await fetchDrivingRoute(activeTab.stops);
      setRouteData(data);
    }, 600);
    return () => { if (routeTimerRef.current) clearTimeout(routeTimerRef.current); };
  }, [activeTab.stops]);

  // Auto Save
  const autoSave = useCallback(async () => {
    if (!adminSession?.id) return;
    const tab = tabs[activeTabIndex];
    if (!tab || tab.saveStatus === "saving" || !tab.title.trim()) return;

    setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, saveStatus: "saving" as const } : t));
    const supabase = createClient();

    try {
      const taskData = {
        admin_id: adminSession.id,
        title: tab.title.trim(),
        description: tab.description || null,
        priority: tab.priority,
        status: "draft",
        driver_id: tab.driver_ids[0] || null,
        vehicle_id: tab.vehicle_ids[0] || null,
        customer_id: tab.customer_id || null,
        task_form_id: tab.task_form_id || null,
        dispatch_form_id: tab.dispatch_form_id || null,
        dispatch_form_values: tab.dispatch_form_values && Object.keys(tab.dispatch_form_values).length > 0 ? tab.dispatch_form_values : null,
        notes: tab.notes || null,
        is_draft: true,
        created_by: adminSession.id,
        driver_reminder_hours: tab.driverReminderHours,
        driver_reminder_repeat_min: tab.driverReminderRepeatMin,
      };

      let taskId = tab.dbId;
      let refNumber = tab.referenceNumber;

      if (taskId) {
        await supabase.from("tasks").update(taskData).eq("id", taskId);
        await supabase.from("task_stops").delete().eq("task_id", taskId);
      } else {
        const { data: newTask } = await supabase.from("tasks").insert(taskData).select("id, reference_number").single();
        if (newTask) { taskId = newTask.id; refNumber = newTask.reference_number; }
      }

      if (taskId) {
        const stopsToInsert = tab.stops
          .filter(s => s.name.trim() || s.address.trim())
          .map((s, i) => ({
            task_id: taskId,
            sequence_order: i,
            name: s.name.trim() || `Stop ${i + 1}`,
            address: s.address || null,
            lat: s.lat, lng: s.lng,
            geofence_radius: s.geofence_radius,
            auto_checkin: s.auto_checkin, auto_checkout: s.auto_checkout,
            planned_arrival: s.planned_arrival || null,
            planned_departure: s.planned_departure || null,
            time_window_start: s.time_window_start || null,
            time_window_end: s.time_window_end || null,
            estimated_duration_minutes: s.estimated_duration_minutes ? parseInt(s.estimated_duration_minutes) : null,
            stop_form_id: s.stop_form_id || null,
            dispatch_stop_form_id: s.dispatch_stop_form_id || null,
            dispatch_stop_form_values: s.dispatch_stop_form_values && Object.keys(s.dispatch_stop_form_values).length > 0 ? s.dispatch_stop_form_values : null,
            contact_name: s.contact_name || null,
            contact_phone: s.contact_phone || null,
            notes: s.notes || null,
          }));
        if (stopsToInsert.length > 0) {
          await supabase.from("task_stops").insert(stopsToInsert);
        }

        await supabase.from("task_assignments").delete().eq("task_id", taskId);
        const assignments: any[] = [];
        for (const did of tab.driver_ids) assignments.push({ task_id: taskId, driver_id: did, vehicle_id: null, admin_id: adminSession.id });
        for (const vid of tab.vehicle_ids) assignments.push({ task_id: taskId, driver_id: null, vehicle_id: vid, admin_id: adminSession.id });
        if (assignments.length > 0) await supabase.from("task_assignments").insert(assignments);
      }

      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setTabs(prev => prev.map((t, i) =>
        i === activeTabIndex ? { ...t, dbId: taskId, referenceNumber: refNumber || t.referenceNumber, saveStatus: "saved" as const, lastSavedAt: now } : t
      ));
    } catch {
      setTabs(prev => prev.map((t, i) =>
        i === activeTabIndex ? { ...t, saveStatus: "error" as const } : t
      ));
    }
  }, [adminSession?.id, tabs, activeTabIndex]);

  useEffect(() => {
    if (activeTab.saveStatus === "idle" && activeTab.title.trim()) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(autoSave, 2000);
    }
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [activeTab.saveStatus, activeTab.title, activeTab, autoSave]);

  // Dispatch
  const handleSubmit = async () => {
    if (!adminSession?.id || !activeTab.title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const status = activeTab.driver_ids.length > 0 ? "scheduled" : "not_assigned";

    try {
      if (!activeTab.dbId) await autoSave();
      const taskId = activeTab.dbId || tabs[activeTabIndex].dbId;

      if (taskId) {
        for (const stop of activeTab.stops) {
          if (stop.lat && stop.lng && stop.geofence_radius > 0 && (stop.auto_checkin || stop.auto_checkout)) {
            await supabase.from("geofences").insert({
              admin_id: adminSession.id,
              name: stop.name || stop.address,
              type: "circle",
              center_lat: stop.lat, center_lng: stop.lng,
              radius_meters: stop.geofence_radius,
              address: stop.address || null,
              is_reusable: false, is_active: true,
            });
          }
        }

        await supabase.from("tasks").update({
          status,
          is_draft: false,
          driver_reminder_hours: activeTab.driverReminderHours,
          driver_reminder_repeat_min: activeTab.driverReminderRepeatMin,
        }).eq("id", taskId);
        await supabase.from("task_status_history").insert({
          task_id: taskId, from_status: "draft", to_status: status,
          changed_by: adminSession.id, changed_by_type: "admin",
          notes: "Task dispatched",
        });

        // Save notification subscribers
        if (activeTab.notifyEnabled && activeTab.notifySubscriberIds.length > 0) {
          const subscribers = activeTab.notifySubscriberIds.map(uid => ({
            task_id: taskId,
            user_id: uid,
            notify_on_status_change: activeTab.notifyOnStatusChange,
            notify_on_completion: activeTab.notifyOnCompletion,
            notify_on_delay: activeTab.notifyOnDelay,
            notify_on_driver_action: activeTab.notifyOnDriverAction,
            channels: activeTab.notifyChannels,
          }));
          await supabase.from("task_notification_subscribers").upsert(subscribers, {
            onConflict: "task_id,user_id",
          });
        }

        // Dispatch notifications via the engine
        try {
          const refNumber = activeTab.referenceNumber || tabs[activeTabIndex].referenceNumber || "";
          await fetch("/api/notifications/dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "task.dispatched",
              title: "New Task Assigned",
              body: `Task ${refNumber}: ${activeTab.title.trim()} - ${activeTab.stops.length} stop(s)`,
              icon: "route",
              actionUrl: "/admin/fsm/tasks",
              data: { type: "task_dispatched", task_id: taskId },
              adminId: adminSession.id,
              module: "fsm",
              entityType: "task",
              entityId: taskId,
              triggeredBy: adminSession.id,
              recipientDriverIds: activeTab.driver_ids,
              recipientUserIds: activeTab.notifyEnabled ? activeTab.notifySubscriberIds.filter(id => id !== adminSession.id) : [],
              priority: activeTab.priority === "urgent" ? "urgent" : activeTab.priority === "high" ? "high" : "normal",
            }),
          });
        } catch { /* non-blocking */ }
      }

      toast({ title: "Task dispatched successfully" });
      if (tabs.length > 1) closeTab(activeTabIndex);
      else { setTabs([emptyDraft()]); setActiveTabIndex(0); }
    } catch { /* skip */ }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedStop = selectedStopIndex !== null ? activeTab.stops[selectedStopIndex] : null;
  const totalDistKm = routeData ? (routeData.distance / 1000).toFixed(1) : null;
  const totalDurMin = routeData ? Math.round(routeData.duration / 60) : null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* ─── Full-Screen Map Background ─── */}
      <TaskMap
        stops={activeTab.stops}
        selectedStopIndex={selectedStopIndex}
        onStopPositionChange={handleStopPositionChange}
        onRadiusChange={handleRadiusChange}
        routeGeometry={routeData?.geometry || null}
      />

      {/* ─── Tab Bar (top floating) ─── */}
      <div className="absolute top-3 left-3 right-3 z-[500] flex items-center gap-2">
        <Button
          variant="outline" size="icon"
          className="h-8 w-8 bg-background/90 backdrop-blur-md shadow-lg border-border/50 shrink-0"
          onClick={() => router.push("/admin/fsm/tasks")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center bg-background/90 backdrop-blur-md rounded-lg shadow-lg border border-border/50 overflow-hidden">
          <div className="flex items-center overflow-x-auto">
            {tabs.map((tab, i) => (
              <button
                key={tab.id}
                className={`group flex items-center gap-1.5 px-3 py-2 text-xs transition-all whitespace-nowrap relative ${
                  i === activeTabIndex
                    ? "text-primary font-semibold bg-primary/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                onClick={() => { setActiveTabIndex(i); setSelectedStopIndex(0); setRouteData(null); }}
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="max-w-[120px] truncate">{tab.referenceNumber ? `${tab.referenceNumber}` : tab.title.trim() || `Draft ${i + 1}`}</span>
                {tab.saveStatus === "saving" && <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />}
                {tab.saveStatus === "saved" && <Cloud className="h-2.5 w-2.5 text-green-500 shrink-0" />}
                {tab.saveStatus === "idle" && tab.title.trim() && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                {tab.saveStatus === "error" && <CloudOff className="h-2.5 w-2.5 text-destructive shrink-0" />}
                {tabs.length > 1 && (
                  <span
                    className="opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); closeTab(i); }}
                  >
                    <X className="h-2.5 w-2.5 hover:text-destructive" />
                  </span>
                )}
                {i === activeTabIndex && <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-primary rounded-t" />}
              </button>
            ))}
          </div>
          <button onClick={addNewTab} className="px-2.5 py-2 text-muted-foreground hover:text-foreground border-l">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {activeTab.lastSavedAt && (
            <span className="text-[10px] text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md">
              Saved {activeTab.lastSavedAt}
            </span>
          )}
          <Button
            size="sm" className="h-8 text-xs gap-1.5 shadow-lg"
            onClick={handleSubmit} disabled={submitting || !activeTab.title.trim()}
          >
            <Send className="h-3 w-3" />
            {submitting ? "Dispatching..." : "Dispatch"}
          </Button>
        </div>
      </div>

      {/* ─── Left Panel: Stops List ─── */}
      <div className="absolute top-14 left-3 bottom-3 w-[300px] z-[500] flex flex-col bg-background/95 backdrop-blur-md rounded-xl shadow-2xl border border-border/50 overflow-hidden">
        {/* Task Title + Reference */}
        <div className="p-3 border-b border-border/50">
          {activeTab.referenceNumber && (
            <span className="text-[10px] font-mono text-primary/70 tracking-wide">{activeTab.referenceNumber}</span>
          )}
          {!activeTab.referenceNumber && activeTab.dbId === null && (
            <span className="text-[10px] font-mono text-muted-foreground/50 tracking-wide">New Draft</span>
          )}
          <Input
            value={activeTab.title}
            onChange={(e) => updateTab({ title: e.target.value })}
            placeholder="Task title..."
            className="text-sm font-semibold h-9 border-0 bg-transparent px-0 focus-visible:ring-0 placeholder:text-muted-foreground/40"
          />

          {/* Assignment chips */}
          <div className="mt-2 space-y-1.5">
            <ChipSelect label="Drivers" icon={Users} items={drivers}
              selectedIds={activeTab.driver_ids}
              onChange={(ids) => updateTab({ driver_ids: ids })}
              renderLabel={(d) => d.name}
            />
            <ChipSelect label="Vehicles" icon={Truck} items={vehicles}
              selectedIds={activeTab.vehicle_ids}
              onChange={(ids) => updateTab({ vehicle_ids: ids })}
              renderLabel={(v) => `${v.plate_number}`}
            />
          </div>

          {/* Task-level fields */}
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <Select value={activeTab.customer_id} onValueChange={(v) => updateTab({ customer_id: v })}>
              <SelectTrigger className="h-7 text-[10px] bg-background/60"><SelectValue placeholder="Customer" /></SelectTrigger>
              <SelectContent className="z-[9999]">
                {customers.map(c => <SelectItem key={c.id} value={c.id}><span className="flex items-center gap-1.5"><Building2 className="h-3 w-3" />{c.name}</span></SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={activeTab.priority} onValueChange={(v) => updateTab({ priority: v })}>
              <SelectTrigger className="h-7 text-[10px] bg-background/60"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="urgent"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Urgent</span></SelectItem>
                <SelectItem value="high"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" />High</span></SelectItem>
                <SelectItem value="normal"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />Normal</span></SelectItem>
                <SelectItem value="low"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400" />Low</span></SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Select value={activeTab.task_form_id} onValueChange={(v) => updateTab({ task_form_id: v })}>
              <SelectTrigger className="h-7 text-[10px] bg-background/60"><SelectValue placeholder="Driver Form" /></SelectTrigger>
              <SelectContent className="z-[9999]">
                {taskDriverForms.length === 0
                  ? <div className="px-3 py-2 text-[10px] text-muted-foreground">No task driver forms</div>
                  : taskDriverForms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={activeTab.dispatch_form_id} onValueChange={(v) => {
              updateTab({ dispatch_form_id: v, dispatch_form_values: {} });
              loadFormFields(v);
            }}>
              <SelectTrigger className="h-7 text-[10px] bg-background/60"><SelectValue placeholder="Dispatch Form" /></SelectTrigger>
              <SelectContent className="z-[9999]">
                {taskDispatchForms.length === 0
                  ? <div className="px-3 py-2 text-[10px] text-muted-foreground">No task dispatch forms</div>
                  : taskDispatchForms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Inline Dispatcher Form Fields */}
          {activeTab.dispatch_form_id && formFieldsCache[activeTab.dispatch_form_id] && (
            <div className="mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 space-y-2">
              <Label className="text-[10px] font-semibold text-primary/80 flex items-center gap-1"><FileText className="h-3 w-3" />Dispatch Form</Label>
              {formFieldsCache[activeTab.dispatch_form_id].map(field => (
                <DispatchFormField key={field.id} field={field} value={activeTab.dispatch_form_values[field.id] ?? field.default_value ?? ""} onChange={(val) => {
                  updateTab({ dispatch_form_values: { ...activeTab.dispatch_form_values, [field.id]: val } });
                }} />
              ))}
            </div>
          )}

          {/* ── Notification Config (compact inline) ── */}
          <div className="mt-3 flex items-center gap-1.5">
            {/* Bell toggle */}
            <button
              type="button"
              onClick={() => updateTab({ notifyEnabled: !activeTab.notifyEnabled })}
              className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${
                activeTab.notifyEnabled
                  ? "bg-primary/15 text-primary shadow-sm shadow-primary/10"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
              title={activeTab.notifyEnabled ? "Notifications on" : "Notifications off"}
            >
              {activeTab.notifyEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            </button>

            {/* Subscriber chips (only when enabled) */}
            {activeTab.notifyEnabled && (
              <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {activeTab.notifySubscriberIds.map(id => {
                  const user = adminUsers.find(u => u.id === id);
                  if (!user) return null;
                  const isCreator = id === adminSession?.id;
                  return (
                    <span
                      key={id}
                      className={`inline-flex items-center gap-1 text-[9px] font-medium pl-1 pr-0.5 py-0.5 rounded-full flex-shrink-0 ${
                        isCreator ? "bg-primary/10 text-primary" : "bg-muted text-foreground/70"
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[8px] font-bold">
                        {(user.name?.[0] || user.email?.[0] || "?").toUpperCase()}
                      </span>
                      <span className="max-w-[60px] truncate">{user.name || user.email}</span>
                      <button
                        type="button"
                        onClick={() => updateTab({ notifySubscriberIds: activeTab.notifySubscriberIds.filter(s => s !== id) })}
                        className="h-3.5 w-3.5 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <X className="h-2 w-2" />
                      </button>
                    </span>
                  );
                })}
                {/* Add user "+" */}
                {adminUsers.filter(u => !activeTab.notifySubscriberIds.includes(u.id)).length > 0 && (
                  <Select
                    value=""
                    onValueChange={(uid) => {
                      if (uid) updateTab({ notifySubscriberIds: [...activeTab.notifySubscriberIds, uid] });
                    }}
                  >
                    <SelectTrigger className="h-5 w-5 p-0 border-dashed border rounded-full flex items-center justify-center bg-transparent hover:bg-muted transition-colors flex-shrink-0 [&>svg:last-child]:hidden">
                      <Plus className="h-2.5 w-2.5 text-muted-foreground" />
                    </SelectTrigger>
                    <SelectContent className="z-[9999] min-w-[180px]">
                      {adminUsers.filter(u => !activeTab.notifySubscriberIds.includes(u.id)).map(u => (
                        <SelectItem key={u.id} value={u.id} className="text-[11px]">
                          {u.name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Settings gear (only when notifications enabled) */}
            {activeTab.notifyEnabled && (
              <button
                type="button"
                onClick={() => setNotifySettingsOpen(!notifySettingsOpen)}
                className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${
                  notifySettingsOpen
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                title="Notification settings"
              >
                <Settings2 className={`h-3.5 w-3.5 transition-transform duration-200 ${notifySettingsOpen ? "rotate-90" : ""}`} />
              </button>
            )}
          </div>

          {/* ── Expanded settings panel ── */}
          {activeTab.notifyEnabled && notifySettingsOpen && (
            <div className="mt-1.5 rounded-lg border border-border/40 bg-muted/10 p-2.5 space-y-2.5 animate-in slide-in-from-top-1 duration-150">
              <div className="grid grid-cols-2 gap-2">
                {/* Events */}
                <div className="space-y-1">
                  <span className="text-[8px] text-muted-foreground/60 uppercase tracking-wider font-semibold">Events</span>
                  {[
                    { key: "notifyOnStatusChange", label: "Status changes" },
                    { key: "notifyOnCompletion", label: "Completion" },
                    { key: "notifyOnDelay", label: "If late" },
                    { key: "notifyOnDriverAction", label: "Driver actions" },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-1.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={(activeTab as any)[key]}
                        onChange={(e) => updateTab({ [key]: e.target.checked })}
                        className="h-2.5 w-2.5 rounded border-border accent-primary"
                      />
                      <span className="text-[9px] text-foreground/60 group-hover:text-foreground transition-colors">{label}</span>
                    </label>
                  ))}
                </div>
                {/* Channels */}
                <div className="space-y-1">
                  <span className="text-[8px] text-muted-foreground/60 uppercase tracking-wider font-semibold">Channels</span>
                  {[
                    { id: "in_app", label: "Web" },
                    { id: "push", label: "Push" },
                    { id: "email", label: "Email" },
                  ].map(({ id, label }) => (
                    <label key={id} className="flex items-center gap-1.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={activeTab.notifyChannels.includes(id)}
                        onChange={(e) => {
                          const ch = e.target.checked
                            ? [...activeTab.notifyChannels, id]
                            : activeTab.notifyChannels.filter(c => c !== id);
                          updateTab({ notifyChannels: ch });
                        }}
                        className="h-2.5 w-2.5 rounded border-border accent-primary"
                      />
                      <span className="text-[9px] text-foreground/60 group-hover:text-foreground transition-colors">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Driver Reminder */}
              <div className="pt-1.5 border-t border-border/30">
                <span className="text-[8px] text-muted-foreground/60 uppercase tracking-wider font-semibold flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  Driver Reminder
                </span>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Select
                    value={activeTab.driverReminderHours?.toString() || "none"}
                    onValueChange={(v) => updateTab({ driverReminderHours: v === "none" ? null : Number.parseFloat(v) })}
                  >
                    <SelectTrigger className="h-5 text-[9px] bg-background/60 w-auto min-w-[75px]"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[9999]">
                      <SelectItem value="none">Off</SelectItem>
                      <SelectItem value="1">1h before</SelectItem>
                      <SelectItem value="2">2h before</SelectItem>
                      <SelectItem value="3">3h before</SelectItem>
                      <SelectItem value="5">5h before</SelectItem>
                      <SelectItem value="12">12h before</SelectItem>
                      <SelectItem value="24">1 day before</SelectItem>
                    </SelectContent>
                  </Select>
                  {activeTab.driverReminderHours && (
                    <>
                      <span className="text-[8px] text-muted-foreground">every</span>
                      <Select
                        value={activeTab.driverReminderRepeatMin?.toString() || "none"}
                        onValueChange={(v) => updateTab({ driverReminderRepeatMin: v === "none" ? null : Number.parseInt(v) })}
                      >
                        <SelectTrigger className="h-5 text-[9px] bg-background/60 w-auto min-w-[65px]"><SelectValue /></SelectTrigger>
                        <SelectContent className="z-[9999]">
                          <SelectItem value="none">Once</SelectItem>
                          <SelectItem value="15">15 min</SelectItem>
                          <SelectItem value="30">30 min</SelectItem>
                          <SelectItem value="60">1 hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>
                {activeTab.driverReminderHours && (
                  <p className="text-[8px] text-muted-foreground/50 mt-1 leading-relaxed">
                    {`Remind ${activeTab.driverReminderHours}h before`}
                    {activeTab.driverReminderRepeatMin
                      ? `, repeat every ${activeTab.driverReminderRepeatMin}min`
                      : ""}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Route stats */}
        {(totalDistKm || activeTab.stops.filter(s => s.lat).length > 0) && (
          <div className="px-3 py-2 border-b border-border/50 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{activeTab.stops.length} stops</span>
            {totalDistKm && <span className="flex items-center gap-1"><Route className="h-3 w-3" />{totalDistKm} km</span>}
            {totalDurMin !== null && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{totalDurMin} min</span>}
          </div>
        )}

        {/* Stops List */}
        <div
          className="flex-1 overflow-y-auto py-1"
          style={{ scrollbarWidth: "none" }}
        >
          {activeTab.stops.map((stop, si) => (
            <div
              key={stop.id}
              draggable
              onDragStart={() => setDragIdx(si)}
              onDragOver={(e) => { e.preventDefault(); setDragOverIdx(si); }}
              onDrop={() => handleStopDrop(si)}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
              onClick={() => setSelectedStopIndex(si)}
              className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all border-l-[3px] ${
                selectedStopIndex === si
                  ? "border-l-primary bg-primary/5"
                  : "border-l-transparent hover:bg-muted/50"
              } ${dragOverIdx === si ? "bg-primary/10" : ""} ${dragIdx === si ? "opacity-30" : ""}`}
            >
              <GripVertical className="h-3 w-3 text-muted-foreground/30 cursor-grab shrink-0" />
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ backgroundColor: selectedStopIndex === si ? "#3b82f6" : "#6366f1" }}
              >
                {si + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{stop.name || `Stop ${si + 1}`}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {stop.address ? stop.address.substring(0, 40) + "..." : "No address set"}
                </p>
              </div>
              {stop.lat !== null && <MapPin className="h-3 w-3 text-green-500 shrink-0" />}
              {stop.auto_checkin && <Target className="h-3 w-3 text-blue-400 shrink-0" />}
            </div>
          ))}

          <button
            onClick={addStop}
            className="w-full flex items-center gap-2 px-3 py-3 text-xs text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add new stop
          </button>
        </div>
      </div>

      {/* ─── Center Panel: Selected Stop Details ─── */}
      {showDetails && selectedStop && (
        <div
          className="absolute top-14 left-[320px] bottom-3 w-[340px] z-[500] flex flex-col bg-background/95 backdrop-blur-md rounded-xl shadow-2xl border border-border/50 overflow-hidden"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              Stop {(selectedStopIndex ?? 0) + 1}
            </span>
            <button onClick={() => setShowDetails(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: "none" }}>
              <>
                {/* Stop Name */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/70">Stop Name</Label>
                  <Input
                    value={selectedStop.name}
                    onChange={(e) => updateStop(selectedStopIndex!, { name: e.target.value })}
                    placeholder={`Stop ${(selectedStopIndex ?? 0) + 1}`}
                    className="h-8 text-xs font-medium bg-background/60"
                  />
                </div>

                {/* Address with autocomplete */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/70">Address</Label>
                  <AddressInput
                    value={selectedStop.address}
                    onChange={(address) => updateStop(selectedStopIndex!, { address })}
                    onSelect={(address, lat, lng) => {
                      updateStop(selectedStopIndex!, { address, lat, lng });
                    }}
                  />
                  {selectedStop.lat !== null && (
                    <div className="text-[10px] text-green-600/80 flex items-center gap-1">
                      <Check className="h-2.5 w-2.5" />
                      {selectedStop.lat.toFixed(5)}, {selectedStop.lng?.toFixed(5)}
                    </div>
                  )}
                </div>

                {/* Geofence */}
                <div className="p-2.5 rounded-lg bg-muted/30 border border-dashed border-border/50 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-primary/70" />
                      <span className="text-[11px] font-semibold">Geofence</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] h-5 font-mono">{selectedStop.geofence_radius}m</Badge>
                  </div>
                  <input
                    type="range"
                    min={25} max={2000} step={25}
                    value={selectedStop.geofence_radius}
                    onChange={(e) => updateStop(selectedStopIndex!, { geofence_radius: parseInt(e.target.value) })}
                    className="w-full h-1.5 accent-primary cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
                    <span>25m</span><span>2000m</span>
                  </div>
                  {selectedStop.lat !== null && (
                    <p className="text-[10px] text-primary/60 flex items-center gap-1">
                      <Navigation className="h-2.5 w-2.5" />
                      Drag the white handles on the map to resize
                    </p>
                  )}
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                      <Switch checked={selectedStop.auto_checkin} onCheckedChange={(c) => updateStop(selectedStopIndex!, { auto_checkin: c })} className="scale-[0.65] origin-left" />
                      Auto check-in
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                      <Switch checked={selectedStop.auto_checkout} onCheckedChange={(c) => updateStop(selectedStopIndex!, { auto_checkout: c })} className="scale-[0.65] origin-left" />
                      Auto check-out
                    </label>
                  </div>
                </div>

                {/* Time Window */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><Clock className="h-3 w-3" />Time Window</Label>
                  <div className="space-y-1">
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">From</span>
                      <div className="grid grid-cols-2 gap-1">
                        <Input type="date" value={selectedStop.time_window_start?.split("T")[0] || ""} onChange={(e) => {
                          const timePart = selectedStop.time_window_start?.split("T")[1] || "00:00";
                          updateStop(selectedStopIndex!, { time_window_start: `${e.target.value}T${timePart}` });
                        }} className="h-7 text-[11px] bg-background/60" />
                        <Input type="time" value={selectedStop.time_window_start?.split("T")[1] || ""} onChange={(e) => {
                          const datePart = selectedStop.time_window_start?.split("T")[0] || new Date().toISOString().split("T")[0];
                          updateStop(selectedStopIndex!, { time_window_start: `${datePart}T${e.target.value}` });
                        }} className="h-7 text-[11px] bg-background/60" />
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">To</span>
                      <div className="grid grid-cols-2 gap-1">
                        <Input type="date" value={selectedStop.time_window_end?.split("T")[0] || ""} onChange={(e) => {
                          const timePart = selectedStop.time_window_end?.split("T")[1] || "23:59";
                          updateStop(selectedStopIndex!, { time_window_end: `${e.target.value}T${timePart}` });
                        }} className="h-7 text-[11px] bg-background/60" />
                        <Input type="time" value={selectedStop.time_window_end?.split("T")[1] || ""} onChange={(e) => {
                          const datePart = selectedStop.time_window_end?.split("T")[0] || new Date().toISOString().split("T")[0];
                          updateStop(selectedStopIndex!, { time_window_end: `${datePart}T${e.target.value}` });
                        }} className="h-7 text-[11px] bg-background/60" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/70">Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={selectedStop.estimated_duration_minutes}
                    onChange={(e) => {
                      const dur = parseInt(e.target.value) || 0;
                      const updates: Partial<StopData> = { estimated_duration_minutes: e.target.value };
                      if (selectedStop.time_window_start && dur > 0) {
                        const start = new Date(selectedStop.time_window_start);
                        if (!isNaN(start.getTime())) {
                          updates.time_window_end = formatLocalDatetime(new Date(start.getTime() + dur * 60 * 1000));
                        }
                      }
                      updateStop(selectedStopIndex!, updates);
                    }}
                    className="h-7 text-[11px] bg-background/60" placeholder="30"
                  />
                </div>

                {/* Contact */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><User className="h-2.5 w-2.5" />Contact</Label>
                    <Input value={selectedStop.contact_name} onChange={(e) => updateStop(selectedStopIndex!, { contact_name: e.target.value })} className="h-7 text-[11px] bg-background/60" placeholder="Name" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><Phone className="h-2.5 w-2.5" />Phone</Label>
                    <Input value={selectedStop.contact_phone} onChange={(e) => updateStop(selectedStopIndex!, { contact_phone: e.target.value })} className="h-7 text-[11px] bg-background/60" placeholder="+1..." />
                  </div>
                </div>

                {/* Stop Forms */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><Shapes className="h-3 w-3" />Driver Form</Label>
                  <Select value={selectedStop.stop_form_id} onValueChange={(v) => updateStop(selectedStopIndex!, { stop_form_id: v })}>
                    <SelectTrigger className="h-7 text-[11px] bg-background/60"><SelectValue placeholder="No driver form" /></SelectTrigger>
                    <SelectContent className="z-[9999]">
                      {stopDriverForms.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-muted-foreground">No stop driver forms</div>
                      ) : (
                        stopDriverForms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)
                      )}
                    </SelectContent>
                  </Select>
                  <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1 mt-1"><FileText className="h-3 w-3" />Dispatch Form</Label>
                  <Select value={selectedStop.dispatch_stop_form_id} onValueChange={(v) => {
                    updateStop(selectedStopIndex!, { dispatch_stop_form_id: v, dispatch_stop_form_values: {} });
                    loadFormFields(v);
                  }}>
                    <SelectTrigger className="h-7 text-[11px] bg-background/60"><SelectValue placeholder="No dispatch form" /></SelectTrigger>
                    <SelectContent className="z-[9999]">
                      {stopDispatchForms.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-muted-foreground">No stop dispatch forms</div>
                      ) : (
                        stopDispatchForms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {/* Inline Dispatch Stop Form Fields */}
                {selectedStop.dispatch_stop_form_id && formFieldsCache[selectedStop.dispatch_stop_form_id] && (
                  <div className="p-2 rounded-lg bg-primary/5 border border-primary/10 space-y-2">
                    <Label className="text-[10px] font-semibold text-primary/80">Dispatch Fields</Label>
                    {formFieldsCache[selectedStop.dispatch_stop_form_id].map(field => (
                      <DispatchFormField key={field.id} field={field} value={selectedStop.dispatch_stop_form_values[field.id] ?? field.default_value ?? ""} onChange={(val) => {
                        updateStop(selectedStopIndex!, { dispatch_stop_form_values: { ...selectedStop.dispatch_stop_form_values, [field.id]: val } });
                      }} />
                    ))}
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/70">Notes</Label>
                  <Textarea
                    value={selectedStop.notes}
                    onChange={(e) => updateStop(selectedStopIndex!, { notes: e.target.value })}
                    placeholder="Stop instructions..."
                    rows={2}
                    className="text-[11px] resize-none bg-background/60"
                  />
                </div>

                {/* Delete */}
                {activeTab.stops.length > 1 && (
                  <Button
                    variant="ghost" size="sm"
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 text-[11px] h-7"
                    onClick={() => removeStop(selectedStopIndex!)}
                  >
                    <Trash2 className="h-3 w-3 mr-1.5" />
                    Remove Stop
                  </Button>
                )}
              </>
          </div>
        </div>
      )}

      {/* ─── Reopen details button ─── */}
      {!showDetails && selectedStop && (
        <button
          onClick={() => setShowDetails(true)}
          className="absolute top-14 left-[320px] z-[500] bg-background/90 backdrop-blur-md border rounded-lg shadow-lg px-3 py-2 text-xs flex items-center gap-1.5 hover:bg-background transition-colors"
        >
          <ChevronDown className="h-3 w-3" />
          Show Details
        </button>
      )}

      {/* ─── Route Info Overlay (bottom right) ─── */}
      {routeData && (
        <div className="absolute bottom-4 right-4 z-[500] bg-background/90 backdrop-blur-md border border-border/50 rounded-lg px-4 py-2.5 shadow-lg">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-primary">
              <Route className="h-3.5 w-3.5" />
              <span className="font-semibold">{totalDistKm} km</span>
            </div>
            <Separator orientation="vertical" className="h-4 opacity-30" />
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{totalDurMin && totalDurMin >= 60 ? `${Math.floor(totalDurMin / 60)}h ${totalDurMin % 60}m` : `${totalDurMin} min`}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
