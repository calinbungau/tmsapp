"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, X, ChevronLeft, ChevronRight, Calendar, Car, User, MapPin, Clock } from "lucide-react";
import type { Inspection, Vehicle, Driver } from "@/lib/types";

interface InspectionWithDetails extends Inspection {
  vehicle?: Vehicle;
  driver?: Driver;
}

const PHOTO_LABELS = [
  { key: "photo_front_right_url", label: "Front Right" },
  { key: "photo_front_left_url", label: "Front Left" },
  { key: "photo_back_right_url", label: "Back Right" },
  { key: "photo_back_left_url", label: "Back Left" },
  { key: "photo_interior_url", label: "Interior" },
  { key: "photo_license_front_url", label: "License (Front)" },
  { key: "photo_license_back_url", label: "License (Back)" },
  { key: "photo_gisa_url", label: "GISA License" },
  { key: "signature_url", label: "Signature" },
];

export default function InspectionDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  const [inspection, setInspection] = useState<InspectionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{ url: string; label: string; index: number } | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Get all photos for navigation
  const allPhotos = PHOTO_LABELS.map((p) => ({
    url: inspection?.[p.key as keyof Inspection] as string | null,
    label: p.label,
  })).filter((p) => p.url);

  useEffect(() => {
    fetchInspection();
  }, [id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!fullscreenPhoto) return;
      if (e.key === "Escape") setFullscreenPhoto(null);
      if (e.key === "ArrowLeft") navigatePhoto(-1);
      if (e.key === "ArrowRight") navigatePhoto(1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullscreenPhoto, allPhotos]);

  const navigatePhoto = (direction: number) => {
    if (!fullscreenPhoto) return;
    const newIndex = fullscreenPhoto.index + direction;
    if (newIndex >= 0 && newIndex < allPhotos.length) {
      setFullscreenPhoto({
        ...allPhotos[newIndex],
        index: newIndex,
      });
    }
  };

  async function fetchInspection() {
    // Fetch inspection
    const { data: inspectionData, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", id)
      .single();

    if (inspectionError || !inspectionData) {
      console.error("Error fetching inspection:", inspectionError);
      router.push("/admin/drivers");
      return;
    }

    // Fetch vehicle and driver separately
    const [vehicleResult, driverResult] = await Promise.all([
      supabase.from("vehicles").select("*").eq("id", inspectionData.vehicle_id).single(),
      supabase.from("drivers").select("*").eq("id", inspectionData.driver_id).single(),
    ]);

    setInspection({
      ...inspectionData,
      vehicle: vehicleResult.data || null,
      driver: driverResult.data || null,
    });
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading inspection...</p>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Inspection not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Inspection Details</h1>
          <p className="text-muted-foreground">
            {new Date(inspection.created_at).toLocaleDateString()} at{" "}
            {new Date(inspection.created_at).toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Driver</p>
              <p className="font-medium">{inspection.driver?.name || "Unknown"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <Car className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Vehicle</p>
              <p className="font-medium">{inspection.vehicle?.plate_number || "Unknown"}</p>
              {inspection.vehicle?.make && (
                <p className="text-xs text-muted-foreground">
                  {inspection.vehicle.make} {inspection.vehicle.model}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className={`font-medium ${inspection.status === "completed" ? "text-green-600" : "text-yellow-600"}`}>
                {inspection.status === "completed" ? "Completed" : "In Progress"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Location</p>
              {inspection.latitude && inspection.longitude ? (
                <>
                  <a 
                    href={`https://maps.google.com/?q=${inspection.latitude},${inspection.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    View on Map
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {inspection.location_accuracy ? `Accuracy: ${Math.round(inspection.location_accuracy)}m` : ""}
                  </p>
                </>
              ) : (
                <p className="font-medium text-muted-foreground">Not available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Location timestamp if available */}
      {inspection.location_timestamp && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          Location captured: {new Date(inspection.location_timestamp).toLocaleString()}
        </div>
      )}

      {/* Photos Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Inspection Photos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {PHOTO_LABELS.map((photo, index) => {
              const url = inspection[photo.key as keyof Inspection] as string | null;
              const photoIndex = allPhotos.findIndex((p) => p.url === url);
              return (
                <div key={photo.key} className="space-y-2">
                  <p className="text-sm font-medium text-center">{photo.label}</p>
                  {url ? (
                    <div
                      className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity border"
                      onClick={() => setFullscreenPhoto({ url, label: photo.label, index: photoIndex })}
                    >
                      <img
                        src={url || "/placeholder.svg"}
                        alt={photo.label}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="aspect-square rounded-lg bg-muted flex items-center justify-center border">
                      <p className="text-xs text-muted-foreground">No photo</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Fullscreen Photo Viewer */}
      {fullscreenPhoto && (
        <div
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          onClick={() => setFullscreenPhoto(null)}
        >
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenPhoto(null);
            }}
          >
            <X className="h-6 w-6" />
          </Button>

          {/* Navigation buttons */}
          {fullscreenPhoto.index > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                navigatePhoto(-1);
              }}
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
          )}
          {fullscreenPhoto.index < allPhotos.length - 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                navigatePhoto(1);
              }}
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          )}

          {/* Photo */}
          <div className="text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-white text-lg mb-4">
              {fullscreenPhoto.label} ({fullscreenPhoto.index + 1}/{allPhotos.length})
            </p>
            <img
              src={fullscreenPhoto.url || "/placeholder.svg"}
              alt={fullscreenPhoto.label}
              className="max-h-[85vh] max-w-[95vw] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
