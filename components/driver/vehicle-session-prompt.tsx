"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Car, CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { Vehicle } from "@/lib/types";

interface VehicleUsageSession {
  id: string;
  driver_id: string;
  vehicle_id: string;
  vehicle?: Vehicle;
  check_in_time: string;
  status: "active" | "completed";
}

interface VehicleSessionPromptProps {
  driverId: string;
  adminId: string;
}

export function VehicleSessionPrompt({ driverId, adminId }: VehicleSessionPromptProps) {
  const [open, setOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<VehicleUsageSession | null>(null);
  const [showEndSession, setShowEndSession] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    checkForActiveSession();
  }, [driverId]);

  const checkForActiveSession = async () => {
    const supabase = createClient();
    
    // Check if there's an active session from a previous day
    const { data: session } = await supabase
      .from("vehicle_usage_sessions")
      .select("*, vehicle:vehicles(*)")
      .eq("driver_id", driverId)
      .eq("status", "active")
      .maybeSingle();

    if (session) {
      const checkInDate = new Date(session.check_in_time).toDateString();
      const today = new Date().toDateString();
      
      // Check if we already prompted today (use localStorage)
      const lastPromptDate = localStorage.getItem(`vehicle_prompt_${driverId}`);
      
      if (checkInDate !== today && lastPromptDate !== today) {
        // Session from previous day, show prompt
        setActiveSession(session as VehicleUsageSession);
        setOpen(true);
        // Mark that we prompted today
        localStorage.setItem(`vehicle_prompt_${driverId}`, today);
      }
    }
  };

  const handleContinueSession = async () => {
    if (!activeSession) return;
    setSubmitting(true);

    const supabase = createClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // End yesterday's session at midnight
    await supabase
      .from("vehicle_usage_sessions")
      .update({
        check_out_time: new Date(today.getTime() - 1).toISOString(), // 23:59:59 previous day
        status: "completed",
      })
      .eq("id", activeSession.id);

    // Create new session starting today at 00:00
    await supabase
      .from("vehicle_usage_sessions")
      .insert({
        admin_id: adminId,
        driver_id: driverId,
        vehicle_id: activeSession.vehicle_id,
        check_in_time: today.toISOString(),
        check_in_odometer: null,
        check_in_location: null,
        check_in_notes: "Continued from previous day",
        status: "active",
      });

    setSubmitting(false);
    setOpen(false);
  };

  const handleEndSession = async () => {
    if (!activeSession || !endDate) return;
    setSubmitting(true);

    const supabase = createClient();
    
    // Combine date and time
    let endDateTime = new Date(endDate);
    if (endTime) {
      const [hours, minutes] = endTime.split(":");
      endDateTime.setHours(parseInt(hours), parseInt(minutes));
    } else {
      endDateTime.setHours(23, 59, 59);
    }

    await supabase
      .from("vehicle_usage_sessions")
      .update({
        check_out_time: endDateTime.toISOString(),
        status: "completed",
      })
      .eq("id", activeSession.id);

    setSubmitting(false);
    setOpen(false);
  };

  if (!open || !activeSession) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Vehicle Check-in Status
          </DialogTitle>
          <DialogDescription>
            You have an active vehicle session from a previous day
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-muted">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Car className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">{activeSession.vehicle?.plate_number}</p>
                <p className="text-sm text-muted-foreground">
                  {activeSession.vehicle?.make} {activeSession.vehicle?.model}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Checked in: {new Date(activeSession.check_in_time).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {!showEndSession ? (
            <div className="space-y-3">
              <p className="text-sm text-center text-muted-foreground">
                Are you still using this vehicle today?
              </p>
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={handleContinueSession}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Yes, Continue
                </Button>
                <Button
                  className="flex-1 bg-transparent"
                  variant="outline"
                  onClick={() => setShowEndSession(true)}
                  disabled={submitting}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  No, I Left It
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                When did you leave the vehicle?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setShowEndSession(false)}
                  disabled={submitting}
                >
                  Back
                </Button>
                <Button
                  onClick={handleEndSession}
                  disabled={!endDate || submitting}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  End Session
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
