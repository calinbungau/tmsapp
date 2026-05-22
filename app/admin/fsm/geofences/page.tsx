"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, MapPin, Circle, Pentagon, Trash2, Edit2, Eye, ToggleLeft,
} from "lucide-react";

interface AdminSession {
  id: string;
  email: string;
  company_name: string | null;
}

interface Geofence {
  id: string;
  name: string;
  type: "circle" | "polygon";
  center_lat: number | null;
  center_lng: number | null;
  radius_meters: number | null;
  polygon_coordinates: Array<{ lat: number; lng: number }> | null;
  address: string | null;
  color: string;
  is_active: boolean;
  created_at: string;
}

const COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

export default function GeofencesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGeofence, setEditingGeofence] = useState<Geofence | null>(null);
  const [saving, setSaving] = useState(false);
  const [mapPreviewId, setMapPreviewId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    type: "circle" as "circle" | "polygon",
    center_lat: "",
    center_lng: "",
    radius_meters: "200",
    polygon_coordinates: "[]",
    address: "",
    color: "#3b82f6",
    is_active: true,
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const polygonRef = useRef<any>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const stored = localStorage.getItem("admin_session");
      if (!stored) { router.push("/admin/login"); return; }
      const session = JSON.parse(stored);
      setAdminSession(session);
    };
    checkAuth();
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("geofences")
      .select("*")
      .eq("admin_id", adminSession.id)
      .order("created_at", { ascending: false });
    setGeofences(data || []);
    setLoading(false);
  }, [adminSession?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setFormData({
      name: "", type: "circle", center_lat: "", center_lng: "",
      radius_meters: "200", polygon_coordinates: "[]", address: "",
      color: "#3b82f6", is_active: true,
    });
    setEditingGeofence(null);
  };

  const handleOpenDialog = (geofence?: Geofence) => {
    if (geofence) {
      setEditingGeofence(geofence);
      setFormData({
        name: geofence.name,
        type: geofence.type,
        center_lat: geofence.center_lat?.toString() || "",
        center_lng: geofence.center_lng?.toString() || "",
        radius_meters: geofence.radius_meters?.toString() || "200",
        polygon_coordinates: JSON.stringify(geofence.polygon_coordinates || []),
        address: geofence.address || "",
        color: geofence.color,
        is_active: geofence.is_active,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  // Initialize map when dialog opens
  useEffect(() => {
    if (!dialogOpen || !mapContainerRef.current) return;

    const loadMap = async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      const lat = formData.center_lat ? parseFloat(formData.center_lat) : 48.8566;
      const lng = formData.center_lng ? parseFloat(formData.center_lng) : 2.3522;

      const map = L.map(mapContainerRef.current!, {
        center: [lat, lng],
        zoom: 15,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      mapInstanceRef.current = map;

      // Add marker for center
      const customIcon = L.divIcon({
        className: "custom-marker",
        html: `<div style="width:24px;height:24px;background:${formData.color};border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      if (formData.center_lat && formData.center_lng) {
        const marker = L.marker([lat, lng], { draggable: true, icon: customIcon }).addTo(map);
        markerRef.current = marker;

        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          setFormData(prev => ({
            ...prev,
            center_lat: pos.lat.toFixed(6),
            center_lng: pos.lng.toFixed(6),
          }));
        });

        if (formData.type === "circle") {
          const circle = L.circle([lat, lng], {
            radius: parseInt(formData.radius_meters) || 200,
            color: formData.color,
            fillColor: formData.color,
            fillOpacity: 0.2,
          }).addTo(map);
          circleRef.current = circle;
          map.fitBounds(circle.getBounds());
        }
      }

      // Click on map to set center
      map.on("click", (e: any) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        setFormData(prev => ({
          ...prev,
          center_lat: clickLat.toFixed(6),
          center_lng: clickLng.toFixed(6),
        }));

        if (markerRef.current) {
          markerRef.current.setLatLng([clickLat, clickLng]);
        } else {
          const marker = L.marker([clickLat, clickLng], { draggable: true, icon: customIcon }).addTo(map);
          markerRef.current = marker;
          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            setFormData(prev => ({
              ...prev,
              center_lat: pos.lat.toFixed(6),
              center_lng: pos.lng.toFixed(6),
            }));
          });
        }

        if (formData.type === "circle") {
          if (circleRef.current) {
            circleRef.current.setLatLng([clickLat, clickLng]);
          } else {
            const circle = L.circle([clickLat, clickLng], {
              radius: parseInt(formData.radius_meters) || 200,
              color: formData.color,
              fillColor: formData.color,
              fillOpacity: 0.2,
            }).addTo(map);
            circleRef.current = circle;
          }
        }
      });

      // Fix map rendering issue
      setTimeout(() => map.invalidateSize(), 100);
    };

    const timer = setTimeout(loadMap, 100);
    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
        polygonRef.current = null;
      }
    };
  }, [dialogOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update circle radius when changed
  useEffect(() => {
    if (circleRef.current && formData.type === "circle") {
      circleRef.current.setRadius(parseInt(formData.radius_meters) || 200);
    }
  }, [formData.radius_meters, formData.type]);

  // Geocode address
  const geocodeAddress = async () => {
    if (!formData.address) return;
    try {
      const response = await fetch(
        `https://rvs.bngtracking.ro/search?format=json&q=${encodeURIComponent(formData.address)}&limit=1`
      );
      const results = await response.json();
      if (results.length > 0) {
        const { lat, lon } = results[0];
        setFormData(prev => ({
          ...prev,
          center_lat: parseFloat(lat).toFixed(6),
          center_lng: parseFloat(lon).toFixed(6),
        }));

        if (mapInstanceRef.current) {
          const L = (await import("leaflet")).default;
          mapInstanceRef.current.setView([parseFloat(lat), parseFloat(lon)], 16);

          const customIcon = L.divIcon({
            className: "custom-marker",
            html: `<div style="width:24px;height:24px;background:${formData.color};border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });

          if (markerRef.current) {
            markerRef.current.setLatLng([parseFloat(lat), parseFloat(lon)]);
          } else {
            const marker = L.marker([parseFloat(lat), parseFloat(lon)], {
              draggable: true,
              icon: customIcon,
            }).addTo(mapInstanceRef.current);
            markerRef.current = marker;
          }

          if (formData.type === "circle") {
            if (circleRef.current) {
              circleRef.current.setLatLng([parseFloat(lat), parseFloat(lon)]);
            } else {
              const circle = L.circle([parseFloat(lat), parseFloat(lon)], {
                radius: parseInt(formData.radius_meters) || 200,
                color: formData.color,
                fillColor: formData.color,
                fillOpacity: 0.2,
              }).addTo(mapInstanceRef.current);
              circleRef.current = circle;
            }
            mapInstanceRef.current.fitBounds(circleRef.current.getBounds());
          }
        }

        toast({ title: "Address found", description: `Located: ${results[0].display_name}` });
      } else {
        toast({ title: "Address not found", description: "Try a more specific address", variant: "destructive" });
      }
    } catch {
      toast({ title: "Geocoding error", variant: "destructive" });
    }
  };

  const handleSave = async () => {
    if (!adminSession?.id || !formData.name.trim()) return;
    setSaving(true);
    const supabase = createClient();

    const geoData = {
      admin_id: adminSession.id,
      name: formData.name.trim(),
      type: formData.type,
      center_lat: formData.center_lat ? parseFloat(formData.center_lat) : null,
      center_lng: formData.center_lng ? parseFloat(formData.center_lng) : null,
      radius_meters: formData.type === "circle" ? parseInt(formData.radius_meters) || 200 : null,
      polygon_coordinates: formData.type === "polygon" ? JSON.parse(formData.polygon_coordinates || "[]") : null,
      address: formData.address || null,
      color: formData.color,
      is_active: formData.is_active,
    };

    if (editingGeofence) {
      const { error } = await supabase
        .from("geofences")
        .update(geoData)
        .eq("id", editingGeofence.id);
      if (error) {
        toast({ title: "Error updating geofence", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Geofence updated" });
      }
    } else {
      const { error } = await supabase.from("geofences").insert(geoData);
      if (error) {
        toast({ title: "Error creating geofence", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Geofence created" });
      }
    }

    setSaving(false);
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this geofence? It may be linked to task stops.")) return;
    const supabase = createClient();
    await supabase.from("geofences").delete().eq("id", id);
    toast({ title: "Geofence deleted" });
    fetchData();
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    const supabase = createClient();
    await supabase.from("geofences").update({ is_active: !isActive }).eq("id", id);
    fetchData();
  };

  const filtered = geofences.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.address?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Geofences</h1>
          <p className="text-muted-foreground">
            Create location boundaries for auto check-in/check-out at task stops
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Geofence
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search geofences..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="font-medium mb-1">No geofences yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create geofences to enable auto check-in/check-out at task stops.
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Geofence
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((geo) => (
            <Card key={geo.id} className={`relative ${!geo.is_active ? "opacity-60" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full border-2 border-background shadow-sm"
                      style={{ backgroundColor: geo.color }}
                    />
                    <CardTitle className="text-base">{geo.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={geo.type === "circle" ? "default" : "secondary"} className="text-xs">
                      {geo.type === "circle" ? (
                        <><Circle className="h-3 w-3 mr-1" />{geo.radius_meters}m</>
                      ) : (
                        <><Pentagon className="h-3 w-3 mr-1" />Polygon</>
                      )}
                    </Badge>
                    {!geo.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                {geo.address && (
                  <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{geo.address}</p>
                )}
                {geo.center_lat && geo.center_lng && (
                  <p className="text-xs font-mono text-muted-foreground mb-3">
                    {Number(geo.center_lat).toFixed(4)}, {Number(geo.center_lng).toFixed(4)}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleOpenDialog(geo)}>
                    <Edit2 className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleActive(geo.id, geo.is_active)}
                  >
                    <ToggleLeft className="h-3 w-3 mr-1" />
                    {geo.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive bg-transparent"
                    onClick={() => handleDelete(geo.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingGeofence ? "Edit Geofence" : "Create Geofence"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name & Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Warehouse Berlin"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData(p => ({ ...p, type: v as "circle" | "polygon" }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="circle">
                      <span className="flex items-center gap-2"><Circle className="h-4 w-4" />Circle</span>
                    </SelectItem>
                    <SelectItem value="polygon">
                      <span className="flex items-center gap-2"><Pentagon className="h-4 w-4" />Polygon</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Address with Geocode */}
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <div className="flex gap-2">
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))}
                  placeholder="Enter address to geocode..."
                  className="flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); geocodeAddress(); } }}
                />
                <Button type="button" variant="secondary" onClick={geocodeAddress}>
                  <MapPin className="h-4 w-4 mr-1" />
                  Locate
                </Button>
              </div>
            </div>

            {/* Map */}
            <div className="space-y-2">
              <Label>Location (click map to set center)</Label>
              <div
                ref={mapContainerRef}
                className="w-full h-[300px] rounded-lg border bg-muted"
                style={{ zIndex: 0 }}
              />
            </div>

            {/* Coordinates & Radius */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lat">Latitude</Label>
                <Input
                  id="lat"
                  value={formData.center_lat}
                  onChange={(e) => setFormData(p => ({ ...p, center_lat: e.target.value }))}
                  placeholder="48.8566"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lng">Longitude</Label>
                <Input
                  id="lng"
                  value={formData.center_lng}
                  onChange={(e) => setFormData(p => ({ ...p, center_lng: e.target.value }))}
                  placeholder="2.3522"
                />
              </div>
              {formData.type === "circle" && (
                <div className="space-y-2">
                  <Label htmlFor="radius">Radius (meters)</Label>
                  <Input
                    id="radius"
                    type="number"
                    value={formData.radius_meters}
                    onChange={(e) => setFormData(p => ({ ...p, radius_meters: e.target.value }))}
                    min="10"
                    max="50000"
                  />
                </div>
              )}
            </div>

            {/* Color Picker */}
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${formData.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setFormData(p => ({ ...p, color: c }))}
                  />
                ))}
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(p => ({ ...p, is_active: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.name.trim()}>
              {saving ? "Saving..." : editingGeofence ? "Update Geofence" : "Create Geofence"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
