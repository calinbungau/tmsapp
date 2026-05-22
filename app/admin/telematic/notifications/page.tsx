"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BellRing,
  Search,
  X,
  MapPin,
  ChevronLeft,
  CalendarDays,
  RefreshCw,
  Calendar,
  ChevronDown,
  Truck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { TraccarEvent } from "@/components/telematic/fleet-map";
import { getEventInfo, getEventLabel } from "@/components/telematic/fleet-map";

interface EventWithPosition extends TraccarEvent {
  latitude: number | null;
  longitude: number | null;
}

const EVENT_CATEGORIES: Record<string, { label: string; types: string[] }> = {
  all: { label: "All Events", types: [] },
  engine: { label: "Engine", types: ["ignitionOn", "ignitionOff"] },
  movement: { label: "Movement", types: ["deviceMoving", "deviceStopped", "deviceOverspeed"] },
  geofence: { label: "Geofence", types: ["geofenceEnter", "geofenceExit"] },
  fuel: { label: "Fuel", types: ["deviceFuelDrop", "deviceFuelIncrease"] },
  connectivity: { label: "Status", types: ["deviceOnline", "deviceOffline", "deviceUnknown", "deviceInactive"] },
  alarm: { label: "Alarm", types: ["alarm"] },
  maintenance: { label: "Maintenance", types: ["maintenance"] },
};

// Date range presets
const DATE_PRESETS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 2 Days", value: "2days" },
  { label: "Last 3 Days", value: "3days" },
  { label: "Last 7 Days", value: "7days" },
] as const;

function getDateRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "yesterday": {
      const from = new Date(todayStart.getTime() - 86400000);
      return { from: from.toISOString(), to: todayStart.toISOString() };
    }
    case "2days": {
      const from = new Date(todayStart.getTime() - 2 * 86400000);
      return { from: from.toISOString(), to: now.toISOString() };
    }
    case "3days": {
      const from = new Date(todayStart.getTime() - 3 * 86400000);
      return { from: from.toISOString(), to: now.toISOString() };
    }
    case "7days": {
      const from = new Date(todayStart.getTime() - 7 * 86400000);
      return { from: from.toISOString(), to: now.toISOString() };
    }
    case "today":
    default:
      return { from: todayStart.toISOString(), to: now.toISOString() };
  }
}

export default function TelematicNotificationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightEventId = searchParams.get("eventId") ? parseInt(searchParams.get("eventId")!) : null;

  const [adminSession, setAdminSession] = useState<{ id: string } | null>(null);
  const [events, setEvents] = useState<EventWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<EventWithPosition | null>(null);

  // Date range / device filter
  const [datePreset, setDatePreset] = useState("today");
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState<string>("all");
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);
  const deviceDropdownRef = useRef<HTMLDivElement>(null);

  // Map
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const eventListRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (!stored) { router.push("/admin/login"); return; }
    setAdminSession(JSON.parse(stored));
  }, [router]);

  // Fetch events based on date preset
  const fetchEvents = useCallback(async (preset?: string) => {
    if (!adminSession?.id) return;
    setLoading(true);
    const p = preset || datePreset;
    const { from, to } = getDateRange(p);

    try {
      const res = await fetch(
        `/api/traccar/events?adminId=${adminSession.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setEvents(data);
          // If today has 0 events and preset is "today", auto-fallback to yesterday
          if (data.length === 0 && p === "today") {
            setDatePreset("yesterday");
            const yRange = getDateRange("yesterday");
            const res2 = await fetch(
              `/api/traccar/events?adminId=${adminSession.id}&from=${encodeURIComponent(yRange.from)}&to=${encodeURIComponent(yRange.to)}`
            );
            if (res2.ok) {
              const data2 = await res2.json();
              if (Array.isArray(data2)) setEvents(data2);
            }
          }
          if (highlightEventId) {
            const ev = data.find((e: EventWithPosition) => e.id === highlightEventId);
            if (ev) setSelectedEvent(ev);
          }
        }
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [adminSession?.id, highlightEventId, datePreset]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Auto-scroll to highlighted event
  useEffect(() => {
    if (highlightEventId && events.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`event-${highlightEventId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [highlightEventId, events]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target as Node)) setDateDropdownOpen(false);
      if (deviceDropdownRef.current && !deviceDropdownRef.current.contains(e.target as Node)) setDeviceDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Initialize map with CartoDB dark tiles (same as live map)
  useEffect(() => {
    if (mapInstanceRef.current) return;

    const timer = setTimeout(() => {
      const container = mapContainerRef.current;
      if (!container) return;

      const map = L.map(container, {
        center: [47.0, 24.0],
        zoom: 7,
        zoomControl: false,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
      setMapReady(true);

      requestAnimationFrame(() => { map.invalidateSize(); });
    }, 150);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [adminSession]);

  // Update map marker when event is selected
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }

    if (!selectedEvent || !selectedEvent.latitude || !selectedEvent.longitude) return;

    const evInfo = getEventInfo(selectedEvent.type);

    const icon = L.divIcon({
      className: "",
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      html: `
        <div style="width:40px;height:40px;position:relative">
          <div style="position:absolute;inset:0;border-radius:50%;background:${evInfo.bgColor};border:3px solid white;box-shadow:0 2px 12px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center">
            <span style="font-size:16px">${evInfo.icon}</span>
          </div>
          <div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid ${evInfo.bgColor};opacity:0.5;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite"></div>
        </div>
      `,
    });

    const marker = L.marker([selectedEvent.latitude, selectedEvent.longitude], { icon });
    marker.bindPopup(
      `<div style="min-width:160px;font-size:12px">
        <div style="font-weight:600;margin-bottom:4px">${evInfo.label}</div>
        <div style="color:#94a3b8">${selectedEvent.vehiclePlate || "Unknown"}</div>
        <div style="color:#64748b;font-size:10px;margin-top:2px">${new Date(selectedEvent.eventTime).toLocaleString()}</div>
        <div style="color:#475569;font-size:10px;margin-top:2px">${selectedEvent.latitude.toFixed(5)}, ${selectedEvent.longitude.toFixed(5)}</div>
      </div>`,
      { className: "route-tooltip" }
    );
    marker.addTo(map);
    marker.openPopup();
    markerRef.current = marker;

    map.flyTo([selectedEvent.latitude, selectedEvent.longitude], 15, { animate: true, duration: 0.8 });
  }, [selectedEvent, mapReady]);

  // Extract unique device plates for filter
  const devicePlates = useMemo(() => {
    const plates = new Map<string, number>();
    for (const ev of events) {
      const plate = ev.vehiclePlate || `Device ${ev.deviceId}`;
      plates.set(plate, (plates.get(plate) || 0) + 1);
    }
    return [...plates.entries()].sort((a, b) => b[1] - a[1]);
  }, [events]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (categoryFilter !== "all") {
        const cat = EVENT_CATEGORIES[categoryFilter];
        if (cat && !cat.types.includes(ev.type)) return false;
      }
      if (deviceFilter !== "all") {
        const plate = ev.vehiclePlate || `Device ${ev.deviceId}`;
        if (plate !== deviceFilter) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const label = getEventLabel(ev.type).toLowerCase();
        const plate = (ev.vehiclePlate || "").toLowerCase();
        if (!label.includes(q) && !plate.includes(q)) return false;
      }
      return true;
    });
  }, [events, categoryFilter, deviceFilter, searchQuery]);

  // Group events by date
  const groupedEvents = useMemo(() => {
    return filteredEvents.reduce<Record<string, EventWithPosition[]>>((acc, ev) => {
      const dateKey = new Date(ev.eventTime).toLocaleDateString(undefined, {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(ev);
      return acc;
    }, {});
  }, [filteredEvents]);

  if (!adminSession) return null;

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Left panel -- event list */}
      <div className="flex flex-col w-[400px] min-w-[400px] border-r border-border/40 bg-card/50">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border/30 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/admin/telematic/live")}
                className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Back to Live Map"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <BellRing className="w-4 h-4 text-primary" />
              <h1 className="text-sm font-semibold text-foreground">Notifications</h1>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                {filteredEvents.length}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => fetchEvents()}
              disabled={loading}
              title="Refresh events"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Date range + device filter row */}
          <div className="flex items-center gap-1.5">
            {/* Date range dropdown */}
            <div ref={dateDropdownRef} className="relative flex-1">
              <button
                type="button"
                onClick={() => { setDateDropdownOpen(!dateDropdownOpen); setDeviceDropdownOpen(false); }}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] bg-muted/40 border border-border/30 hover:bg-muted/60 transition-colors text-foreground"
              >
                <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="truncate">{DATE_PRESETS.find(p => p.value === datePreset)?.label || "Today"}</span>
                <ChevronDown className="w-3 h-3 ml-auto text-muted-foreground shrink-0" />
              </button>
              {dateDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-full bg-card border border-border/50 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                  {DATE_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => {
                        setDatePreset(p.value);
                        setDateDropdownOpen(false);
                        fetchEvents(p.value);
                      }}
                      className={`w-full text-left px-3 py-2 text-[11px] transition-colors ${
                        datePreset === p.value
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Device filter dropdown */}
            <div ref={deviceDropdownRef} className="relative flex-1">
              <button
                type="button"
                onClick={() => { setDeviceDropdownOpen(!deviceDropdownOpen); setDateDropdownOpen(false); }}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] bg-muted/40 border border-border/30 hover:bg-muted/60 transition-colors text-foreground"
              >
                <Truck className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="truncate">{deviceFilter === "all" ? "All Vehicles" : deviceFilter}</span>
                <ChevronDown className="w-3 h-3 ml-auto text-muted-foreground shrink-0" />
              </button>
              {deviceDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-full bg-card border border-border/50 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 max-h-[240px] overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => { setDeviceFilter("all"); setDeviceDropdownOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-[11px] transition-colors ${
                      deviceFilter === "all" ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted/50"
                    }`}
                  >
                    All Vehicles ({events.length})
                  </button>
                  {devicePlates.map(([plate, count]) => (
                    <button
                      key={plate}
                      type="button"
                      onClick={() => { setDeviceFilter(plate); setDeviceDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-[11px] flex items-center justify-between transition-colors ${
                        deviceFilter === plate ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <span className="truncate">{plate}</span>
                      <span className="text-[9px] text-muted-foreground ml-2 shrink-0">{count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events or vehicles..."
              className="pl-8 h-8 text-xs bg-muted/30 border-border/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Category filters */}
          <div className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5">
            {Object.entries(EVENT_CATEGORIES).map(([key, cat]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategoryFilter(key)}
                className={`whitespace-nowrap px-2 py-1 rounded-md text-[10px] font-medium transition-colors shrink-0 ${
                  categoryFilter === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Event list */}
        <div ref={eventListRef} className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="relative w-8 h-8">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
              </div>
              <p className="text-xs text-muted-foreground">Loading events...</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-4">
              <BellRing className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">No events found</p>
              <p className="text-[10px] text-muted-foreground/60 text-center">
                {datePreset === "today" ? "No events today. Try selecting a different date range." : "Try changing the filter or date range."}
              </p>
            </div>
          ) : (
            Object.entries(groupedEvents).map(([dateKey, dayEvents]) => (
              <div key={dateKey}>
                <div className="sticky top-0 z-10 px-3 py-1.5 bg-muted/60 backdrop-blur-sm border-b border-border/20">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-medium text-muted-foreground">{dateKey}</span>
                    <span className="text-[9px] text-muted-foreground/50 ml-auto">{dayEvents.length} events</span>
                  </div>
                </div>

                {dayEvents.map((ev) => {
                  const evInfo = getEventInfo(ev.type);
                  const isSelected = selectedEvent?.id === ev.id;
                  const isHighlighted = highlightEventId === ev.id;
                  const hasPosition = ev.latitude !== null && ev.longitude !== null;

                  return (
                    <button
                      key={ev.id}
                      id={`event-${ev.id}`}
                      type="button"
                      onClick={() => { if (hasPosition) setSelectedEvent(ev); }}
                      className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-all border-b border-border/10
                        ${isSelected
                          ? "bg-primary/10 border-l-2 border-l-primary"
                          : isHighlighted
                            ? "bg-primary/5 border-l-2 border-l-primary/50"
                            : "hover:bg-muted/40 border-l-2 border-l-transparent"
                        }
                        ${!hasPosition ? "opacity-60" : "cursor-pointer"}
                      `}
                    >
                      <div
                        className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm"
                        style={{ backgroundColor: evInfo.bgColor }}
                      >
                        <span className="text-xs">{evInfo.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-semibold text-foreground">{evInfo.label}</span>
                          {ev.vehiclePlate && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted/80 text-muted-foreground font-mono leading-none">
                              {ev.vehiclePlate}
                            </span>
                          )}
                        </div>
                        {evInfo.description && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{evInfo.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] text-muted-foreground/60">
                            {new Date(ev.eventTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                          {hasPosition && (
                            <span className="flex items-center gap-0.5 text-[9px] text-primary/60">
                              <MapPin className="w-2.5 h-2.5" />
                              <span>{ev.latitude!.toFixed(4)}, {ev.longitude!.toFixed(4)}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel -- map */}
      <div className="flex-1 relative min-h-0">
        <div ref={mapContainerRef} className="absolute inset-0 z-0" />

        {/* No event selected overlay */}
        {!selectedEvent && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
            <div className="bg-card/80 backdrop-blur-md border border-border/30 rounded-xl px-6 py-4 text-center shadow-2xl">
              <MapPin className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Select an event to see its location on the map</p>
            </div>
          </div>
        )}

        {/* Selected event info card */}
        {selectedEvent && selectedEvent.latitude && selectedEvent.longitude && (
          <div className="absolute top-3 left-3 z-[1000] bg-card/95 backdrop-blur-md border border-border/40 rounded-xl shadow-2xl w-[280px] overflow-hidden">
            <div className="px-3 pt-3 pb-2">
              <div className="flex items-start gap-2.5">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: getEventInfo(selectedEvent.type).bgColor }}
                >
                  <span className="text-base">{getEventInfo(selectedEvent.type).icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-foreground">{getEventInfo(selectedEvent.type).label}</span>
                  {selectedEvent.vehiclePlate && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono mt-1 inline-block">
                      {selectedEvent.vehiclePlate}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="px-3 pb-2.5 space-y-1">
              {getEventInfo(selectedEvent.type).description && (
                <p className="text-[10px] text-muted-foreground">{getEventInfo(selectedEvent.type).description}</p>
              )}
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                <CalendarDays className="w-3 h-3" />
                <span>{new Date(selectedEvent.eventTime).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                <MapPin className="w-3 h-3" />
                <span>{selectedEvent.latitude!.toFixed(5)}, {selectedEvent.longitude!.toFixed(5)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
