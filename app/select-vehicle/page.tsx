"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Car, LogOut, ChevronRight, Search, ArrowLeft, AlertTriangle } from "lucide-react";
import type { Vehicle } from "@/lib/types";

interface DriverSession {
  id: string;
  name: string;
  pin_code: string;
  admin_id: string;
}

interface SelectedForm {
  id: string;
  name: string;
  frequency: string;
}

interface VehicleWithUsage extends Vehicle {
  usedByOtherDriver?: boolean;
  otherDriverName?: string;
}

export default function SelectVehiclePage() {
  const [vehicles, setVehicles] = useState<VehicleWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [selectedForm, setSelectedForm] = useState<SelectedForm | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showWarning, setShowWarning] = useState(false);
  const [warningDriverName, setWarningDriverName] = useState("");
  const router = useRouter();

  // Filter vehicles based on search query
  const filteredVehicles = vehicles.filter((vehicle) => {
    const query = searchQuery.toLowerCase();
    return (
      vehicle.plate_number.toLowerCase().includes(query) ||
      (vehicle.make && vehicle.make.toLowerCase().includes(query)) ||
      (vehicle.model && vehicle.model.toLowerCase().includes(query)) ||
      (vehicle.color && vehicle.color.toLowerCase().includes(query))
    );
  });

  useEffect(() => {
    // Check if driver is logged in
    const session = localStorage.getItem("driver_session");
    if (!session) {
      router.push("/driver");
      return;
    }
    const driverData = JSON.parse(session);
    setDriver(driverData);

    // Check if a form is selected
    const formSession = localStorage.getItem("selected_form");
    if (!formSession) {
      router.push("/driver-dashboard");
      return;
    }
    setSelectedForm(JSON.parse(formSession));

    // Fetch vehicles with today's usage info
    fetchVehiclesWithUsage(driverData);
  }, [router]);

  const fetchVehiclesWithUsage = async (driverData: DriverSession) => {
    const supabase = createClient();
    
    // Fetch vehicles
    const { data: vehiclesData, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("admin_id", driverData.admin_id)
      .eq("is_active", true)
      .order("plate_number");

    if (error || !vehiclesData) {
      setLoading(false);
      return;
    }

    // Fetch today's submissions to check vehicle usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: submissions } = await supabase
      .from("form_submissions")
      .select(`
        vehicle_id,
        driver_id,
        drivers:driver_id(name)
      `)
      .eq("admin_id", driverData.admin_id)
      .eq("status", "completed")
      .gte("created_at", today.toISOString())
      .neq("driver_id", driverData.id);

    // Map vehicles with usage info
    const vehiclesWithUsage: VehicleWithUsage[] = vehiclesData.map((vehicle) => {
      const otherDriverSubmission = submissions?.find((s) => s.vehicle_id === vehicle.id);
      return {
        ...vehicle,
        usedByOtherDriver: !!otherDriverSubmission,
        otherDriverName: otherDriverSubmission?.drivers?.name,
      };
    });

    setVehicles(vehiclesWithUsage);
    setLoading(false);
  };

  const handleSelectVehicle = (vehicle: VehicleWithUsage) => {
    setSelectedVehicle(vehicle.id);
    if (vehicle.usedByOtherDriver) {
      setShowWarning(true);
      setWarningDriverName(vehicle.otherDriverName || "Another driver");
    } else {
      setShowWarning(false);
      setWarningDriverName("");
    }
  };

  const handleStartForm = async () => {
    if (!selectedVehicle || !driver || !selectedForm) return;
    
    setStarting(true);
    
    try {
      const supabase = createClient();
      
      // Create a new form submission
      const { data: submission, error } = await supabase
        .from("form_submissions")
        .insert({
          form_template_id: selectedForm.id,
          driver_id: driver.id,
          vehicle_id: selectedVehicle,
          admin_id: driver.admin_id,
          status: "in_progress"
        })
        .select()
        .single();

      if (error) throw error;

      // Store submission info for the form flow
      localStorage.setItem("current_submission", JSON.stringify({
        id: submission.id,
        form_id: selectedForm.id,
        vehicle_id: selectedVehicle,
        admin_id: driver.admin_id,
      }));

      // Navigate to form submission page
      router.push(`/forms/${selectedForm.id}`);
    } catch (err) {
      console.error("Failed to start form:", err);
      alert("Failed to start form. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  const handleBack = () => {
    localStorage.removeItem("selected_form");
    router.push("/driver-dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("driver_session");
    localStorage.removeItem("current_inspection");
    localStorage.removeItem("selected_form");
    localStorage.removeItem("current_submission");
    router.push("/driver");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="h-dvh bg-background flex flex-col">
      <div className="max-w-md mx-auto w-full flex flex-col flex-1 min-h-0">
        {/* Header - fixed top */}
        <div className="flex items-center justify-between p-4 pb-2 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">{selectedForm?.name}</h1>
              <p className="text-sm text-muted-foreground">Select a vehicle</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>

        {/* Search - fixed below header */}
        <div className="px-4 pb-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by plate, make, model, or color..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Warning for shared vehicle */}
          {showWarning && (
            <div className="mt-3 p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-400">Vehicle already used today</p>
                <p className="text-xs text-yellow-400/80">
                  {warningDriverName} has already completed a form for this vehicle today.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Vehicle List - scrollable area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4">
          <div className="space-y-2 pb-2">
            {filteredVehicles.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">
                    {searchQuery ? "No vehicles match your search" : "No vehicles available"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredVehicles.map((vehicle) => (
                <Card
                  key={vehicle.id}
                  className={`cursor-pointer transition-all ${
                    selectedVehicle === vehicle.id
                      ? "ring-2 ring-primary"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => handleSelectVehicle(vehicle)}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
                      vehicle.usedByOtherDriver ? "bg-yellow-500/20" : "bg-primary/10"
                    }`}>
                      <Car className={`h-6 w-6 ${vehicle.usedByOtherDriver ? "text-yellow-400" : "text-primary"}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{vehicle.plate_number}</p>
                        {vehicle.usedByOtherDriver && (
                          <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                            Used today
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {vehicle.make} {vehicle.model} {vehicle.year && `(${vehicle.year})`}
                      </p>
                      {vehicle.usedByOtherDriver && (
                        <p className="text-xs text-yellow-400">by {vehicle.otherDriverName}</p>
                      )}
                    </div>
                    {selectedVehicle === vehicle.id && (
                      <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                        <ChevronRight className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Sticky Continue Button */}
        <div className="shrink-0 p-4 border-t border-border/50 bg-background">
          <Button
            className="w-full"
            size="lg"
            disabled={!selectedVehicle || starting}
            onClick={handleStartForm}
          >
            {starting ? "Starting..." : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
