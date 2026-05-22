"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Radio,
  Search,
  RefreshCw,
  Clock,
  MapPin,
  Truck,
  User,
  Navigation,
  Wifi,
  WifiOff,
  ChevronRight,
  Route,
} from "lucide-react";
import dynamic from "next/dynamic";

const LiveMapView = dynamic(() => import("@/components/admin/live-map-view"), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-muted animate-pulse rounded-lg flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Loading map...</p>
    </div>
  ),
});

interface AdminSession {
  id: string;
  user_id?: string;
  email: string;
  company_name: string | null;
}

interface OnlineDriver {
  id: string;
  name: string;
  phone: string | null;
  is_online: boolean;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
  status: string | null;
  active_task?: {
    id: string;
    title: string;
    reference_number: string;
    status: string;
    stops_total: number;
    stops_completed: number;
  } | null;
  vehicle?: {
    plate_number: string;
  } | null;
}

export default function LiveMapPage() {
  const router = useRouter();
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [drivers, setDrivers] = useState<OnlineDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (!stored) {
      router.push("/admin/login");
      return;
    }
    setAdminSession(JSON.parse(stored));
  }, [router]);

  const fetchDrivers = useCallback(async () => {
    if (!adminSession?.id) return;
    const supabase = createClient();

    // Fetch all drivers with their online status
    const { data: driversData } = await supabase
      .from("drivers")
      .select("id, name, phone, is_online, last_lat, last_lng, last_seen_at, status")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("is_online", { ascending: false })
      .order("name");

    if (!driversData) {
      setDrivers([]);
      setLoading(false);
      return;
    }

    // Fetch active tasks for online drivers
    const onlineDriverIds = driversData
      .filter((d) => d.is_online && d.last_lat && d.last_lng)
      .map((d) => d.id);

    let tasksByDriver: Record<string, any> = {};
    let vehiclesByDriver: Record<string, any> = {};

    if (onlineDriverIds.length > 0) {
      const { data: activeTasks } = await supabase
        .from("tasks")
        .select("id, title, reference_number, status, driver_id, vehicle_id, stops:task_stops(id, status)")
        .in("driver_id", onlineDriverIds)
        .in("status", ["in_progress", "confirmed", "dispatched"]);

      if (activeTasks) {
        for (const task of activeTasks) {
          if (task.driver_id) {
            const stops = (task.stops as any[]) || [];
            tasksByDriver[task.driver_id] = {
              id: task.id,
              title: task.title,
              reference_number: task.reference_number,
              status: task.status,
              stops_total: stops.length,
              stops_completed: stops.filter((s: any) => s.status === "completed").length,
            };
          }
        }
      }

      // Fetch active vehicle sessions
      const { data: sessions } = await supabase
        .from("vehicle_usage_sessions")
        .select("driver_id, vehicle:vehicles(plate_number)")
        .in("driver_id", onlineDriverIds)
        .eq("status", "active");

      if (sessions) {
        for (const s of sessions) {
          if (s.driver_id) {
            vehiclesByDriver[s.driver_id] = s.vehicle;
          }
        }
      }
    }

    const enrichedDrivers: OnlineDriver[] = driversData.map((d) => ({
      ...d,
      active_task: tasksByDriver[d.id] || null,
      vehicle: vehiclesByDriver[d.id] || null,
    }));

    setDrivers(enrichedDrivers);
    setLoading(false);
  }, [adminSession?.id]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!autoRefresh) {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      return;
    }

    refreshIntervalRef.current = setInterval(fetchDrivers, 15000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [autoRefresh, fetchDrivers]);

  const onlineDrivers = drivers.filter(
    (d) => d.is_online && d.last_lat && d.last_lng
  );
  const offlineDrivers = drivers.filter(
    (d) => !d.is_online || !d.last_lat || !d.last_lng
  );

  const filteredOnline = searchQuery
    ? onlineDrivers.filter(
        (d) =>
          d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.phone?.includes(searchQuery)
      )
    : onlineDrivers;

  const filteredOffline = searchQuery
    ? offlineDrivers.filter(
        (d) =>
          d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.phone?.includes(searchQuery)
      )
    : offlineDrivers;

  const formatLastSeen = (date: string | null) => {
    if (!date) return "Never";
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      {/* Sidebar - Driver List */}
      <div className="w-80 flex flex-col border rounded-lg overflow-hidden bg-card shrink-0">
        {/* Header */}
        <div className="p-3 border-b space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-green-500" />
              <h1 className="font-semibold">Live Map</h1>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={fetchDrivers}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="font-medium">{onlineDrivers.length}</span> online
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-muted-foreground" />
              <span className="font-medium">{offlineDrivers.length}</span> offline
            </span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search drivers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Driver List */}
        <div className="flex-1 overflow-y-auto">
          {/* Online Drivers */}
          {filteredOnline.length > 0 && (
            <div>
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50 sticky top-0">
                Online Drivers
              </div>
              {filteredOnline.map((driver) => (
                <button
                  key={driver.id}
                  type="button"
                  onClick={() =>
                    setSelectedDriverId(
                      selectedDriverId === driver.id ? null : driver.id
                    )
                  }
                  className={`w-full text-left px-3 py-2.5 border-b hover:bg-muted/50 transition-colors ${
                    selectedDriverId === driver.id ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-card" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {driver.name}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {driver.vehicle && (
                          <span className="flex items-center gap-0.5">
                            <Truck className="h-3 w-3" />
                            {driver.vehicle.plate_number}
                          </span>
                        )}
                        <span>{formatLastSeen(driver.last_seen_at)}</span>
                      </div>
                    </div>
                    {driver.active_task && (
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0"
                      >
                        <Route className="h-3 w-3 mr-0.5" />
                        {driver.active_task.stops_completed}/
                        {driver.active_task.stops_total}
                      </Badge>
                    )}
                  </div>
                  {driver.active_task && selectedDriverId === driver.id && (
                    <div className="mt-2 ml-10 p-2 bg-muted/50 rounded text-xs space-y-1">
                      <p className="font-medium">
                        {driver.active_task.title}
                      </p>
                      <p className="text-muted-foreground font-mono">
                        {driver.active_task.reference_number}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {driver.active_task.status.replace("_", " ")}
                      </Badge>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Offline Drivers */}
          {filteredOffline.length > 0 && (
            <div>
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50 sticky top-0">
                Offline Drivers
              </div>
              {filteredOffline.map((driver) => (
                <div
                  key={driver.id}
                  className="px-3 py-2.5 border-b opacity-60"
                >
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {driver.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {driver.last_seen_at
                          ? `Last seen ${formatLastSeen(driver.last_seen_at)}`
                          : "Never connected"}
                      </p>
                    </div>
                    <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredOnline.length === 0 && filteredOffline.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No drivers found
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 rounded-lg overflow-hidden border">
        <LiveMapView
          drivers={onlineDrivers}
          selectedDriverId={selectedDriverId}
          onSelectDriver={setSelectedDriverId}
        />
      </div>
    </div>
  );
}
