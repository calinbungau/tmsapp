"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MapPin, Plus, Pencil, Trash2, Loader2, Save, X, Search, Circle, Pentagon,
  Eye, EyeOff, Palette, ChevronDown,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";

// ── Types ──
interface TraccarGeofence {
  id: number;
  name: string;
  description: string;
  area: string; // WKT: "CIRCLE (lat lon, radius)" or "POLYGON ((lat lon, ...))"
  calendarId: number;
  attributes: { color?: string; [key: string]: unknown };
}

type GeofenceType = "circle" | "polygon";

// ── WKT helpers ──
function parseArea(area: string): { type: GeofenceType; center?: [number, number]; radius?: number; points?: [number, number][] } | null {
  if (!area) return null;
  const circleMatch = area.match(/CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i);
  if (circleMatch) {
    return {
      type: "circle",
      center: [parseFloat(circleMatch[1]), parseFloat(circleMatch[2])],
      radius: parseFloat(circleMatch[3]),
    };
  }
  const polyMatch = area.match(/POLYGON\s*\(\(([^)]+)\)\)/i);
  if (polyMatch) {
    const points = polyMatch[1].split(",").map((pair) => {
      const [lat, lon] = pair.trim().split(/\s+/).map(Number);
      return [lat, lon] as [number, number];
    });
    return { type: "polygon", points };
  }
  return null;
}

function buildCircleWKT(lat: number, lon: number, radius: number): string {
  return `CIRCLE (${lat} ${lon}, ${radius})`;
}

function buildPolygonWKT(points: [number, number][]): string {
  const closed = [...points];
  if (closed.length > 0 && (closed[0][0] !== closed[closed.length - 1][0] || closed[0][1] !== closed[closed.length - 1][1])) {
    closed.push(closed[0]);
  }
  const coords = closed.map(([lat, lon]) => `${lat} ${lon}`).join(", ");
  return `POLYGON ((${coords}))`;
}

const DEFAULT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
];

// ── Leaflet Map Component for drawing ──
function GeofenceMapEditor({
  type,
  center,
  radius,
  points,
  onUpdate,
}: {
  type: GeofenceType;
  center: [number, number];
  radius: number;
  points: [number, number][];
  onUpdate: (data: { center?: [number, number]; radius?: number; points?: [number, number][] }) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const shapeRef = useRef<L.Circle | L.Polygon | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current || typeof window === "undefined") return;

    const initMap = async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      if (mapInstance.current) {
        mapInstance.current.remove();
      }

      const map = L.map(mapRef.current!, {
        center: [center[0], center[1]],
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      mapInstance.current = map;

      if (type === "circle") {
        const circle = L.circle([center[0], center[1]], {
          radius: radius,
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.15,
          weight: 2,
        }).addTo(map);
        shapeRef.current = circle;

        // Draggable center marker
        const centerMarker = L.marker([center[0], center[1]], {
          draggable: true,
          icon: L.divIcon({
            html: `<div style="width:12px;height:12px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,.3)"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
            className: "",
          }),
        }).addTo(map);

        centerMarker.on("dragend", () => {
          const pos = centerMarker.getLatLng();
          circle.setLatLng(pos);
          onUpdate({ center: [pos.lat, pos.lng] });
        });

        // Click on map to move center
        map.on("click", (e: L.LeafletMouseEvent) => {
          centerMarker.setLatLng(e.latlng);
          circle.setLatLng(e.latlng);
          onUpdate({ center: [e.latlng.lat, e.latlng.lng] });
        });

        map.fitBounds(circle.getBounds().pad(0.3));
      } else {
        // Polygon mode
        const latLngs = points.length > 0
          ? points.map(([lat, lon]) => L.latLng(lat, lon))
          : [];

        const polygon = L.polygon(latLngs, {
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.15,
          weight: 2,
        }).addTo(map);
        shapeRef.current = polygon;

        // Add vertex markers
        const addVertexMarkers = (pts: [number, number][]) => {
          markersRef.current.forEach((m) => m.remove());
          markersRef.current = [];
          pts.forEach((pt, idx) => {
            const marker = L.marker([pt[0], pt[1]], {
              draggable: true,
              icon: L.divIcon({
                html: `<div style="width:10px;height:10px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,.3);cursor:grab"></div>`,
                iconSize: [10, 10],
                iconAnchor: [5, 5],
                className: "",
              }),
            }).addTo(map);

            marker.on("dragend", () => {
              const pos = marker.getLatLng();
              const updated = [...pts];
              updated[idx] = [pos.lat, pos.lng];
              polygon.setLatLngs(updated.map(([lat, lon]) => L.latLng(lat, lon)));
              onUpdate({ points: updated });
              addVertexMarkers(updated);
            });

            markersRef.current.push(marker);
          });
        };

        if (points.length > 0) {
          addVertexMarkers(points);
          map.fitBounds(polygon.getBounds().pad(0.3));
        }

        // Click on map to add new point
        map.on("click", (e: L.LeafletMouseEvent) => {
          const currentPts = polygon.getLatLngs()[0] as L.LatLng[];
          const newPts: [number, number][] = currentPts.map((ll) => [ll.lat, ll.lng]);
          newPts.push([e.latlng.lat, e.latlng.lng]);
          polygon.setLatLngs(newPts.map(([lat, lon]) => L.latLng(lat, lon)));
          onUpdate({ points: newPts });
          addVertexMarkers(newPts);
        });
      }
    };

    initMap();

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  return <div ref={mapRef} className="w-full h-[300px] rounded-lg border border-border/30 overflow-hidden" />;
}

// ── Main Page ──
export default function TelematicGeofencesPage() {
  const router = useRouter();
  const [adminSession, setAdminSession] = useState<{ id: string } | null>(null);
  const [geofences, setGeofences] = useState<TraccarGeofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGeofence, setEditingGeofence] = useState<TraccarGeofence | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<GeofenceType>("circle");
  const [formColor, setFormColor] = useState("#3b82f6");
  const [formCenter, setFormCenter] = useState<[number, number]>([48.2, 16.3]);
  const [formRadius, setFormRadius] = useState(500);
  const [formPoints, setFormPoints] = useState<[number, number][]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (!stored) { router.push("/admin/login"); return; }
    setAdminSession(JSON.parse(stored));
  }, [router]);

  const fetchGeofences = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/traccar/geofences?adminId=${adminSession.id}`);
      const data = await res.json();
      if (data.geofences) setGeofences(data.geofences);
    } catch { /* silent */ }
    setLoading(false);
  }, [adminSession?.id]);

  useEffect(() => { fetchGeofences(); }, [fetchGeofences]);

  const openCreate = () => {
    setEditingGeofence(null);
    setFormName("");
    setFormDescription("");
    setFormType("circle");
    setFormColor("#3b82f6");
    setFormCenter([48.2, 16.3]);
    setFormRadius(500);
    setFormPoints([]);
    setDialogOpen(true);
  };

  const openEdit = (gf: TraccarGeofence) => {
    setEditingGeofence(gf);
    setFormName(gf.name);
    setFormDescription(gf.description || "");
    setFormColor(gf.attributes?.color || "#3b82f6");
    const parsed = parseArea(gf.area);
    if (parsed?.type === "circle") {
      setFormType("circle");
      setFormCenter(parsed.center!);
      setFormRadius(parsed.radius!);
      setFormPoints([]);
    } else if (parsed?.type === "polygon") {
      setFormType("polygon");
      setFormPoints(parsed.points!);
      if (parsed.points!.length > 0) {
        const avgLat = parsed.points!.reduce((s, p) => s + p[0], 0) / parsed.points!.length;
        const avgLon = parsed.points!.reduce((s, p) => s + p[1], 0) / parsed.points!.length;
        setFormCenter([avgLat, avgLon]);
      }
    } else {
      setFormType("circle");
      setFormCenter([48.2, 16.3]);
      setFormRadius(500);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!adminSession?.id || !formName.trim()) return;
    setSaving(true);

    const area = formType === "circle"
      ? buildCircleWKT(formCenter[0], formCenter[1], formRadius)
      : buildPolygonWKT(formPoints);

    const payload: Record<string, unknown> = {
      name: formName.trim(),
      description: formDescription.trim(),
      area,
      calendarId: 0,
      attributes: { color: formColor },
    };

    if (editingGeofence) {
      payload.id = editingGeofence.id;
    }

    try {
      const method = editingGeofence ? "PUT" : "POST";
      const res = await fetch(`/api/traccar/geofences?adminId=${adminSession.id}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setDialogOpen(false);
        fetchGeofences();
      }
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!adminSession?.id) return;
    if (!confirm("Delete this geofence?")) return;
    try {
      const res = await fetch(`/api/traccar/geofences?adminId=${adminSession.id}&geofenceId=${id}`, {
        method: "DELETE",
      });
      if (res.ok) fetchGeofences();
    } catch { /* silent */ }
  };

  const filtered = geofences.filter((gf) =>
    gf.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Geofences</h1>
              <p className="text-xs text-muted-foreground">
                {geofences.length} geofence{geofences.length !== 1 ? "s" : ""} configured
              </p>
            </div>
          </div>
          <Button onClick={openCreate} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> New Geofence
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto w-full px-6 py-6 flex-1">
        {/* Search */}
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            placeholder="Search geofences..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MapPin className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No geofences found</p>
            <p className="text-xs mt-1">Create your first geofence to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((gf) => {
              const parsed = parseArea(gf.area);
              const color = gf.attributes?.color || "#3b82f6";
              return (
                <Card
                  key={gf.id}
                  className="group relative overflow-hidden hover:shadow-lg transition-all duration-200 border-border/40"
                >
                  {/* Color accent bar */}
                  <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: color }} />

                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-offset-1 ring-offset-background"
                          style={{ backgroundColor: color, ringColor: `${color}40` }}
                        />
                        <CardTitle className="text-sm font-bold">{gf.name}</CardTitle>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => openEdit(gf)}
                          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(gf.id)}
                          className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pb-3">
                    {gf.description && (
                      <p className="text-[11px] text-muted-foreground mb-2 line-clamp-1">{gf.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                      {parsed?.type === "circle" ? (
                        <>
                          <Circle className="h-3 w-3" />
                          <span>Circle</span>
                          <span className="text-border">|</span>
                          <span className="font-mono tabular-nums">
                            r={parsed.radius!.toFixed(0)}m
                          </span>
                        </>
                      ) : parsed?.type === "polygon" ? (
                        <>
                          <Pentagon className="h-3 w-3" />
                          <span>Polygon</span>
                          <span className="text-border">|</span>
                          <span className="font-mono tabular-nums">
                            {(parsed.points?.length || 0)} vertices
                          </span>
                        </>
                      ) : (
                        <span>Unknown shape</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit dialog overlay */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border/40 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
            {/* Dialog header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
              <h2 className="text-base font-bold">
                {editingGeofence ? "Edit Geofence" : "New Geofence"}
              </h2>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Name & Description */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    Name
                  </label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Warehouse A"
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    Description
                  </label>
                  <Input
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Optional description"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {/* Type & Color */}
              <div className="flex items-center gap-4">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    Type
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setFormType("circle"); setFormPoints([]); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        formType === "circle"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Circle className="h-3 w-3" /> Circle
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormType("polygon")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        formType === "polygon"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Pentagon className="h-3 w-3" /> Polygon
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    Color
                  </label>
                  <div className="flex gap-1">
                    {DEFAULT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFormColor(c)}
                        className={`w-6 h-6 rounded-md transition-all ${
                          formColor === c ? "ring-2 ring-offset-1 ring-offset-background ring-foreground/50 scale-110" : "hover:scale-105"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Radius input for circle */}
              {formType === "circle" && (
                <div className="max-w-[200px]">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    Radius (meters)
                  </label>
                  <Input
                    type="number"
                    value={formRadius}
                    onChange={(e) => setFormRadius(Math.max(10, Number(e.target.value)))}
                    min={10}
                    className="h-9 text-sm font-mono"
                  />
                </div>
              )}

              {/* Map editor */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  {formType === "circle" ? "Click to place center" : "Click to add vertices"}
                </label>
                <GeofenceMapEditor
                  type={formType}
                  center={formCenter}
                  radius={formRadius}
                  points={formPoints}
                  onUpdate={(data) => {
                    if (data.center) setFormCenter(data.center);
                    if (data.radius !== undefined) setFormRadius(data.radius);
                    if (data.points) setFormPoints(data.points);
                  }}
                />
                {formType === "polygon" && formPoints.length > 0 && (
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-muted-foreground">
                      {formPoints.length} vertices added
                    </span>
                    <button
                      type="button"
                      onClick={() => setFormPoints([])}
                      className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                    >
                      Clear points
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Dialog footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/30 bg-muted/10">
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !formName.trim() || (formType === "polygon" && formPoints.length < 3)}
                className="gap-1.5"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {editingGeofence ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
