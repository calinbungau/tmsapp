"use client";

import { useEffect, useState } from "react";
import { useDriverSession } from "@/hooks/use-driver-session";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Car,
  LogIn,
  LogOut,
  Clock,
  Gauge,
  Calendar,
  MapPin,
  CheckCircle,
  AlertCircle,
  History,
  Loader2,
} from "lucide-react";
import type { Vehicle } from "@/lib/types";

interface VehicleUsageSession {
  id: string;
  driver_id: string;
  vehicle_id: string;
  vehicle?: Vehicle;
  check_in_time: string;
  check_out_time: string | null;
  check_in_odometer: number | null;
  check_out_odometer: number | null;
  check_in_location: string | null;
  check_out_location: string | null;
  check_in_notes: string | null;
  check_out_notes: string | null;
  status: "active" | "completed";
  created_at: string;
}

export default function DriverVehiclePage() {
  const { driver, loading: sessionLoading } = useDriverSession();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeSession, setActiveSession] = useState<VehicleUsageSession | null>(null);
  const [recentSessions, setRecentSessions] = useState<VehicleUsageSession[]>([]);
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [checkOutDialogOpen, setCheckOutDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [checkInData, setCheckInData] = useState({
    vehicle_id: "",
    odometer: "",
    location: "",
    notes: "",
  });

  const [checkOutData, setCheckOutData] = useState({
    odometer: "",
    location: "",
    notes: "",
  });

  useEffect(() => {
    if (sessionLoading) return;
    if (driver?.id) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [sessionLoading, driver?.id]);

  const fetchData = async () => {
    const supabase = createClient();

    // Fetch available vehicles for this admin
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select("*")
      .eq("admin_id", driver!.admin_id)
      .eq("is_active", true)
      .order("plate_number");

    if (vehiclesData) {
      setVehicles(vehiclesData);
    }

    // Fetch active session for this driver
    const { data: activeData } = await supabase
      .from("vehicle_usage_sessions")
      .select("*, vehicle:vehicles(*)")
      .eq("driver_id", driver!.id)
      .eq("status", "active")
      .single();

    if (activeData) {
      setActiveSession(activeData as VehicleUsageSession);
    }

    // Fetch recent sessions (last 10)
    const { data: recentData } = await supabase
      .from("vehicle_usage_sessions")
      .select("*, vehicle:vehicles(*)")
      .eq("driver_id", driver!.id)
      .eq("status", "completed")
      .order("check_out_time", { ascending: false })
      .limit(10);

    if (recentData) {
      setRecentSessions(recentData as VehicleUsageSession[]);
    }

    setLoading(false);
  };

  const handleCheckIn = async () => {
    if (!driver || !checkInData.vehicle_id) return;
    setSubmitting(true);

    const supabase = createClient();

    // Check if vehicle is already in use
    const { data: existingSession } = await supabase
      .from("vehicle_usage_sessions")
      .select("*, driver:drivers(name)")
      .eq("vehicle_id", checkInData.vehicle_id)
      .eq("status", "active")
      .single();

    if (existingSession) {
      alert(`This vehicle is currently in use by ${existingSession.driver?.name || "another driver"}. They must check out first.`);
      setSubmitting(false);
      return;
    }

    // Create new session
    const { data: newSession, error } = await supabase
      .from("vehicle_usage_sessions")
      .insert({
        admin_id: driver.admin_id,
        driver_id: driver.id,
        vehicle_id: checkInData.vehicle_id,
        check_in_time: new Date().toISOString(),
        check_in_odometer: checkInData.odometer ? parseInt(checkInData.odometer) : null,
        check_in_location: checkInData.location || null,
        check_in_notes: checkInData.notes || null,
        status: "active",
      })
      .select("*, vehicle:vehicles(*)")
      .single();

    if (!error && newSession) {
      setActiveSession(newSession as VehicleUsageSession);
      setCheckInDialogOpen(false);
      setCheckInData({ vehicle_id: "", odometer: "", location: "", notes: "" });
    }

    setSubmitting(false);
  };

  const handleCheckOut = async () => {
    if (!activeSession) return;
    setSubmitting(true);

    const supabase = createClient();

    const { error } = await supabase
      .from("vehicle_usage_sessions")
      .update({
        check_out_time: new Date().toISOString(),
        check_out_odometer: checkOutData.odometer ? parseInt(checkOutData.odometer) : null,
        check_out_location: checkOutData.location || null,
        check_out_notes: checkOutData.notes || null,
        status: "completed",
      })
      .eq("id", activeSession.id);

    if (!error) {
      setCheckOutDialogOpen(false);
      setCheckOutData({ odometer: "", location: "", notes: "" });
      fetchData();
    }

    setSubmitting(false);
  };

  const formatDuration = (start: string, end?: string | null) => {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diff = endDate.getTime() - startDate.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
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

  if (loading || sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold">Vehicle</h1>
        <p className="text-muted-foreground">Check in/out of vehicles</p>
      </div>

      {/* Current Status */}
      {activeSession ? (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Currently Checked In
              </CardTitle>
              <Badge className="bg-green-500/20 text-green-400">Active</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-500/10">
                <Car className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <p className="text-xl font-bold">{activeSession.vehicle?.plate_number}</p>
                <p className="text-sm text-muted-foreground">
                  {activeSession.vehicle?.make} {activeSession.vehicle?.model}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p className="font-medium">{formatDuration(activeSession.check_in_time)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Started</p>
                  <p className="font-medium">{formatDateTime(activeSession.check_in_time)}</p>
                </div>
              </div>
              {activeSession.check_in_odometer && (
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Start Odometer</p>
                    <p className="font-medium">{activeSession.check_in_odometer.toLocaleString()} km</p>
                  </div>
                </div>
              )}
              {activeSession.check_in_location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Location</p>
                    <p className="font-medium">{activeSession.check_in_location}</p>
                  </div>
                </div>
              )}
            </div>

            {activeSession.check_in_notes && (
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Notes: {activeSession.check_in_notes}</p>
              </div>
            )}

            <Button
              className="w-full"
              variant="destructive"
              onClick={() => setCheckOutDialogOpen(true)}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Check Out
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Car className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No Active Vehicle</p>
                <p className="text-sm text-muted-foreground">
                  Check in to a vehicle to start your shift
                </p>
              </div>
              <Button onClick={() => setCheckInDialogOpen(true)} className="w-full">
                <LogIn className="h-4 w-4 mr-2" />
                Check In to Vehicle
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Sessions */}
      {recentSessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <History className="h-5 w-5" />
            Recent History
          </h2>
          <div className="space-y-2">
            {recentSessions.map((session) => {
              const distance =
                session.check_out_odometer && session.check_in_odometer
                  ? session.check_out_odometer - session.check_in_odometer
                  : null;

              return (
                <Card key={session.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <Car className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">{session.vehicle?.plate_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(session.check_in_time)} - {formatDateTime(session.check_out_time!)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {formatDuration(session.check_in_time, session.check_out_time)}
                      </p>
                      {distance !== null && (
                        <p className="text-xs text-muted-foreground">{distance} km</p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Check In Dialog */}
      <Dialog open={checkInDialogOpen} onOpenChange={setCheckInDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check In to Vehicle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Vehicle *</Label>
              <Select
                value={checkInData.vehicle_id}
                onValueChange={(v) => setCheckInData({ ...checkInData, vehicle_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate_number} - {v.make} {v.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Odometer Reading (km)</Label>
              <Input
                type="number"
                placeholder="Current odometer"
                value={checkInData.odometer}
                onChange={(e) => setCheckInData({ ...checkInData, odometer: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                placeholder="Where are you picking up the vehicle?"
                value={checkInData.location}
                onChange={(e) => setCheckInData({ ...checkInData, location: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any observations about the vehicle condition..."
                value={checkInData.notes}
                onChange={(e) => setCheckInData({ ...checkInData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckInDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCheckIn}
              disabled={!checkInData.vehicle_id || submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <LogIn className="h-4 w-4 mr-2" />
              )}
              Check In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check Out Dialog */}
      <Dialog open={checkOutDialogOpen} onOpenChange={setCheckOutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check Out of Vehicle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {activeSession && (
              <div className="p-3 rounded-lg bg-muted">
                <p className="font-medium">{activeSession.vehicle?.plate_number}</p>
                <p className="text-sm text-muted-foreground">
                  Checked in {formatDuration(activeSession.check_in_time)} ago
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Odometer Reading (km)</Label>
              <Input
                type="number"
                placeholder="Current odometer"
                value={checkOutData.odometer}
                onChange={(e) => setCheckOutData({ ...checkOutData, odometer: e.target.value })}
              />
              {activeSession?.check_in_odometer && checkOutData.odometer && (
                <p className="text-xs text-muted-foreground">
                  Distance: {parseInt(checkOutData.odometer) - activeSession.check_in_odometer} km
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                placeholder="Where are you leaving the vehicle?"
                value={checkOutData.location}
                onChange={(e) => setCheckOutData({ ...checkOutData, location: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any issues or observations..."
                value={checkOutData.notes}
                onChange={(e) => setCheckOutData({ ...checkOutData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckOutDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCheckOut} disabled={submitting} variant="destructive">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <LogOut className="h-4 w-4 mr-2" />
              )}
              Check Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
