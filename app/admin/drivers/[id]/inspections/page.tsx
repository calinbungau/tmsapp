"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Eye, User, Calendar } from "lucide-react";
import type { Driver, Inspection } from "@/lib/types";
import { useTranslation } from "@/components/i18n/i18n-provider";

interface InspectionWithVehicle extends Inspection {
  vehicles: { plate_number: string; make: string | null; model: string | null } | null;
}

export default function DriverInspectionsPage() {
  const router = useRouter();
  const params = useParams();
  const driverId = params.id as string;
  const { t, locale } = useTranslation();
  
  const [driver, setDriver] = useState<Driver | null>(null);
  const [inspections, setInspections] = useState<InspectionWithVehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();
      
      // Fetch driver first
      const { data: driverData, error: driverError } = await supabase
        .from("drivers")
        .select("id, name, pin_code, email, phone, language, is_active")
        .eq("id", driverId)
        .single();
      
      if (driverError) {
        console.error("Error fetching driver:", driverError);
        setLoading(false);
        return;
      }

      if (driverData) {
        setDriver(driverData as Driver);
      }

      // Fetch inspections with limited columns and limit for performance
      const { data: inspectionsData, error: inspectionError } = await supabase
        .from("inspections")
        .select("id, driver_id, vehicle_id, status, created_at, completed_at")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (inspectionError) {
        console.error("Error fetching inspections:", inspectionError);
        setLoading(false);
        return;
      }

      if (inspectionsData && inspectionsData.length > 0) {
        // Get unique vehicle IDs
        const vehicleIds = [...new Set(inspectionsData.map(i => i.vehicle_id).filter(Boolean))];
        
        // Fetch vehicles if we have any
        let vehicleMap = new Map<string, { plate_number: string; make: string | null; model: string | null }>();
        
        if (vehicleIds.length > 0) {
          const { data: vehiclesData } = await supabase
            .from("vehicles")
            .select("id, plate_number, make, model")
            .in("id", vehicleIds);

          vehicleMap = new Map(
            (vehiclesData || []).map(v => [v.id, { plate_number: v.plate_number, make: v.make, model: v.model }])
          );
        }

        // Merge inspections with vehicles
        const inspectionsWithVehicles = inspectionsData.map(inspection => ({
          ...inspection,
          vehicles: vehicleMap.get(inspection.vehicle_id) || null,
        }));

        setInspections(inspectionsWithVehicles as InspectionWithVehicle[]);
      } else {
        setInspections([]);
      }

      setLoading(false);
    };

    fetchData();
  }, [driverId]);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(locale === "ro" ? "ro-RO" : "en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString(locale === "ro" ? "ro-RO" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isToday = (date: string) => {
    const today = new Date();
    const inspectionDate = new Date(date);
    return (
      today.getDate() === inspectionDate.getDate() &&
      today.getMonth() === inspectionDate.getMonth() &&
      today.getFullYear() === inspectionDate.getFullYear()
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t("driverInspections.loading")}</p>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="space-y-4">
        <Link href="/admin/drivers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("driverInspections.backToDrivers")}
          </Button>
        </Link>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("driverInspections.driverNotFound")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/drivers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("driverInspections.backToDrivers")}
          </Button>
        </Link>
      </div>

      {/* Driver Info */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{driver.name}</h1>
              <p className="text-muted-foreground">
                {(inspections.length === 1 ? t("driverInspections.inspectionTotal") : t("driverInspections.inspectionsTotal")).replace("{n}", String(inspections.length))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inspections List */}
      <div>
        <h2 className="text-lg font-medium mb-4">{t("driverInspections.inspectionHistory")}</h2>
        
        {inspections.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {t("driverInspections.noInspections")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {inspections.map((inspection) => (
              <Card 
                key={inspection.id} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/admin/inspections/${inspection.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        isToday(inspection.created_at) ? "bg-green-500/20" : "bg-primary/20"
                      }`}>
                        <Calendar className={`h-5 w-5 ${
                          isToday(inspection.created_at) ? "text-green-400" : "text-primary"
                        }`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {inspection.vehicles?.plate_number || t("driverInspections.unknownVehicle")}
                          </span>
                          <Badge variant={inspection.status === "completed" ? "default" : "secondary"}>
                            {inspection.status === "completed" ? t("driverInspections.statusCompleted") : t("driverInspections.statusInProgress")}
                          </Badge>
                          {isToday(inspection.created_at) && (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                              {t("driverInspections.today")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {inspection.vehicles?.make} {inspection.vehicles?.model}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(inspection.created_at)} {t("driverInspections.at")} {formatTime(inspection.created_at)}
                        </p>
                      </div>
                    </div>
                    {inspection.status === "completed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/inspections/${inspection.id}`);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        {t("driverInspections.viewPhotos")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
