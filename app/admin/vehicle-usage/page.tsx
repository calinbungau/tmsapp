"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAdminSession } from "@/hooks/use-admin-session";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Dynamic import for map component (requires window)
const VehicleUsageMap = dynamic(
  () => import("@/components/admin/vehicle-usage-map").then((mod) => mod.VehicleUsageMap),
  { ssr: false, loading: () => <div className="w-full h-[400px] rounded-lg border bg-muted animate-pulse" /> }
);
import type { VehicleLocation } from "@/components/admin/vehicle-usage-map";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Car,
  User,
  Clock,
  Gauge,
  MapPin,
  Search,
  Calendar,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Download,
  Filter,
  RefreshCw,
} from "lucide-react";
import type { Vehicle, Driver } from "@/lib/types";

interface VehicleUsageSession {
  id: string;
  driver_id: string;
  vehicle_id: string;
  driver?: Driver;
  vehicle?: Vehicle;
  check_in_time: string;
  check_out_time: string | null;
  check_in_odometer: number | null;
  check_out_odometer: number | null;
  check_in_location: string | null;
  check_out_location: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  last_latitude: number | null;
  last_longitude: number | null;
  last_location_time: string | null;
  check_in_notes: string | null;
  check_out_notes: string | null;
  status: "active" | "completed";
  created_at: string;
}

export default function VehicleUsagePage() {
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<VehicleUsageSession[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState("all");
  const [selectedDriver, setSelectedDriver] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // GPS live positions
  const [gpsVehicles, setGpsVehicles] = useState<VehicleLocation[]>([]);
  const [gpsConfigured, setGpsConfigured] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    if (adminSession?.id) {
      fetchData();
      fetchGpsPositions();
      
      // Auto-refresh GPS positions every 60 seconds
      const interval = setInterval(() => {
        fetchGpsPositions();
      }, 60000);
      
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [sessionLoading, adminSession?.id]);

  const fetchGpsPositions = async () => {
    if (!adminSession?.id) return;
    
    try {
      const response = await fetch(`/api/traccar/positions?adminId=${adminSession.id}`);
      const data = await response.json();
      
      if (data.configured !== undefined) {
        setGpsConfigured(data.configured);
      }
      
      if (data.vehicles) {
        setGpsVehicles(data.vehicles);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch GPS positions:", error);
    }
  };

  const fetchData = async () => {
    const supabase = createClient();

    // Fetch all sessions with related data
    const { data: sessionsData } = await supabase
      .from("vehicle_usage_sessions")
      .select("*, driver:drivers(*), vehicle:vehicles(*)")
      .eq("admin_id", adminSession!.id)
      .order("check_in_time", { ascending: false });

    if (sessionsData) {
      setSessions(sessionsData as VehicleUsageSession[]);
    }

    // Fetch vehicles for filter
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select("*")
      .eq("admin_id", adminSession!.id)
      .order("plate_number");

    if (vehiclesData) {
      setVehicles(vehiclesData);
    }

    // Fetch drivers for filter
    const { data: driversData } = await supabase
      .from("drivers")
      .select("*")
      .eq("admin_id", adminSession!.id)
      .order("name");

    if (driversData) {
      setDrivers(driversData);
    }

    setLoading(false);
  };

  // Active sessions (currently checked in)
  const activeSessions = sessions.filter((s) => s.status === "active");

  // Filter sessions
  const filteredSessions = sessions.filter((session) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesDriver = session.driver?.name?.toLowerCase().includes(query);
      const matchesVehicle = session.vehicle?.plate_number?.toLowerCase().includes(query);
      const matchesLocation =
        session.check_in_location?.toLowerCase().includes(query) ||
        session.check_out_location?.toLowerCase().includes(query);
      if (!matchesDriver && !matchesVehicle && !matchesLocation) return false;
    }

    // Vehicle filter
    if (selectedVehicle !== "all" && session.vehicle_id !== selectedVehicle) return false;

    // Driver filter
    if (selectedDriver !== "all" && session.driver_id !== selectedDriver) return false;

    // Status filter
    if (selectedStatus !== "all" && session.status !== selectedStatus) return false;

    // Date range filter
    if (dateFrom) {
      const sessionDate = new Date(session.check_in_time).toISOString().split("T")[0];
      if (sessionDate < dateFrom) return false;
    }
    if (dateTo) {
      const sessionDate = new Date(session.check_in_time).toISOString().split("T")[0];
      if (sessionDate > dateTo) return false;
    }

    return true;
  });

  const formatDuration = (start: string, end?: string | null) => {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diff = endDate.getTime() - startDate.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const exportToCSV = () => {
    const escapeCSV = (str: string) => {
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    let csv = "Driver,Vehicle,Check In,Check Out,Duration,Start Odometer,End Odometer,Distance,Start Location,End Location,Status\n";

    filteredSessions.forEach((s) => {
      const distance =
        s.check_out_odometer && s.check_in_odometer
          ? s.check_out_odometer - s.check_in_odometer
          : "";
      csv += [
        escapeCSV(s.driver?.name || ""),
        escapeCSV(s.vehicle?.plate_number || ""),
        s.check_in_time ? new Date(s.check_in_time).toLocaleString() : "",
        s.check_out_time ? new Date(s.check_out_time).toLocaleString() : "",
        formatDuration(s.check_in_time, s.check_out_time),
        s.check_in_odometer || "",
        s.check_out_odometer || "",
        distance,
        escapeCSV(s.check_in_location || ""),
        escapeCSV(s.check_out_location || ""),
        s.status,
      ].join(",") + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vehicle-usage-${dateFrom || "all"}-to-${dateTo || "present"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading || sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/admin/vehicles">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Vehicle Usage</h1>
          </div>
          <p className="text-muted-foreground">Track driver vehicle assignments and usage history</p>
        </div>
        <Button onClick={exportToCSV} disabled={filteredSessions.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Active Sessions Summary */}
      {activeSessions.length > 0 && (
        <Card className="border-green-500/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Currently Active ({activeSessions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {activeSessions.map((session) => (
                <div
                  key={session.id}
                  className="p-3 rounded-lg bg-green-500/5 border border-green-500/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <Car className="h-5 w-5 text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{session.vehicle?.plate_number}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {session.driver?.name}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge className="bg-green-500/20 text-green-400">Active</Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDuration(session.check_in_time)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Map - Show real-time GPS positions */}
      {gpsConfigured && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Live Vehicle Locations ({gpsVehicles.length})
              </CardTitle>
              <div className="flex items-center gap-3">
                {lastUpdate && (
                  <span className="text-xs text-muted-foreground">
                    Updated: {lastUpdate.toLocaleTimeString()}
                  </span>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchGpsPositions}
                  className="bg-transparent"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {gpsVehicles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <MapPin className="h-12 w-12 mb-3 opacity-50" />
                <p className="font-medium">No vehicles with GPS data</p>
                <p className="text-sm">Vehicles will appear here when they have GPS devices configured</p>
              </div>
            ) : (
              <VehicleUsageMap vehicles={gpsVehicles} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search driver, vehicle, location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
              <SelectTrigger>
                <SelectValue placeholder="All Vehicles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicles</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.plate_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
              <SelectTrigger>
                <SelectValue placeholder="All Drivers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drivers</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="From"
            />

            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="To"
            />
          </div>

          <div className="flex gap-2 mt-4">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setSelectedVehicle("all");
                setSelectedDriver("all");
                setSelectedStatus("all");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Usage History ({filteredSessions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredSessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No vehicle usage records found</p>
              <p className="text-sm">Sessions will appear here when drivers check in/out</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Distance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSessions.map((session) => {
                    const distance =
                      session.check_out_odometer && session.check_in_odometer
                        ? session.check_out_odometer - session.check_in_odometer
                        : null;

                    return (
                      <TableRow key={session.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <Link
                              href={`/admin/drivers/${session.driver_id}`}
                              className="hover:underline"
                            >
                              {session.driver?.name}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Car className="h-4 w-4 text-muted-foreground" />
                            <Link
                              href={`/admin/vehicles/${session.vehicle_id}`}
                              className="hover:underline"
                            >
                              {session.vehicle?.plate_number}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{formatDateTime(session.check_in_time)}</p>
                            {session.check_in_latitude && session.check_in_longitude && (
                              <a 
                                href={`https://www.google.com/maps?q=${session.check_in_latitude},${session.check_in_longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                <MapPin className="h-3 w-3" />
                                View location
                              </a>
                            )}
                            {session.check_in_odometer && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Gauge className="h-3 w-3" />
                                {session.check_in_odometer.toLocaleString()} km
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {session.check_out_time ? (
                            <div>
                              <p className="text-sm">{formatDateTime(session.check_out_time)}</p>
                              {session.check_out_latitude && session.check_out_longitude && (
                                <a 
                                  href={`https://www.google.com/maps?q=${session.check_out_latitude},${session.check_out_longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline flex items-center gap-1"
                                >
                                  <MapPin className="h-3 w-3" />
                                  View location
                                </a>
                              )}
                              {session.check_out_odometer && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Gauge className="h-3 w-3" />
                                  {session.check_out_odometer.toLocaleString()} km
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {formatDuration(session.check_in_time, session.check_out_time)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {distance !== null ? (
                            <span>{distance.toLocaleString()} km</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {session.status === "active" ? (
                            <Badge className="bg-green-500/20 text-green-400">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Completed</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
