"use client";

import React from "react"

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Camera,
  X,
  AlertTriangle,
  Clock,
  CheckCircle,
  Wrench,
  ArrowLeft,
  Calendar,
  MapPin,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { useAndroidCamera } from "@/hooks/use-android-camera";
import { FullscreenCamera } from "@/components/driver/fullscreen-camera";

interface DriverSession {
  id: string;
  name: string;
  pin_code: string;
  admin_id: string;
}

interface Vehicle {
  id: string;
  plate_number: string;
  model?: string;
}

interface MaintenanceRequest {
  id: string;
  vehicle_id: string;
  request_description: string;
  request_photos: string[] | null;
  status: string;
  created_at: string;
  scheduled_start_time: string | null;
  appointment_location: string | null;
  vehicle?: Vehicle;
  maintenance_type?: { name: string } | null;
}

export default function DriverMaintenancePage() {
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const session = localStorage.getItem("driver_session");
    if (!session) {
      router.push("/driver");
      return;
    }
    const driverData = JSON.parse(session);
    setDriver(driverData);
    fetchData(driverData);
  }, [router]);

  const fetchData = async (driverData: DriverSession) => {
    const supabase = createClient();
    
    // Fetch vehicles
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select("id, plate_number, model")
      .eq("admin_id", driverData.admin_id);

    if (vehiclesData) {
      setVehicles(vehiclesData);
    }

    // Fetch all maintenance requests from this driver
    const { data: requestsData } = await supabase
      .from("maintenance_records")
      .select(`
        id,
        vehicle_id,
        request_description,
        request_photos,
        status,
        created_at,
        scheduled_start_time,
        appointment_location,
        vehicle:vehicles(id, plate_number, model),
        maintenance_type:maintenance_types(name)
      `)
      .eq("requested_by_driver_id", driverData.id)
      .order("created_at", { ascending: false });

    if (requestsData) {
      setRequests(requestsData as any);
    }

    setLoading(false);
  };

  // Process a File directly (from Android camera hook)
  const processMaintenanceFile = (file: File) => {
    if (file.type.startsWith("image/")) {
      const preview = URL.createObjectURL(file);
      setPhotos((prev) => [...prev, { file, preview }]);
    }
  };

  const androidCamera = useAndroidCamera(processMaintenanceFile);

  const handleAddPhoto = async () => {
    const handled = await androidCamera.openCamera();
    if (!handled) {
      fileInputRef.current?.click();
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newPhotos: { file: File; preview: string }[] = [];
    
    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        const preview = URL.createObjectURL(file);
        newPhotos.push({ file, preview });
      }
    });

    setPhotos((prev) => [...prev, ...newPhotos]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const newPhotos = [...prev];
      URL.revokeObjectURL(newPhotos[index].preview);
      newPhotos.splice(index, 1);
      return newPhotos;
    });
  };

  const uploadPhotos = async (): Promise<string[]> => {
    if (photos.length === 0) return [];
    
    setUploading(true);
    const supabase = createClient();
    const uploadedUrls: string[] = [];

    for (const photo of photos) {
      const fileName = `requests/${driver?.id}/${Date.now()}-${photo.file.name}`;
      const { data, error } = await supabase.storage
        .from("maintenance-photos")
        .upload(fileName, photo.file);
      
      if (data && !error) {
        const { data: urlData } = supabase.storage
          .from("maintenance-photos")
          .getPublicUrl(fileName);
        uploadedUrls.push(urlData.publicUrl);
      }
    }

    setUploading(false);
    return uploadedUrls;
  };

  const handleSubmit = async () => {
    if (!driver || !selectedVehicle || !description.trim()) return;

    setSubmitting(true);
    const supabase = createClient();

    // Upload photos first
    const photoUrls = await uploadPhotos();

    // Create maintenance request
    const { data: newRecord, error } = await supabase.from("maintenance_records").insert({
      admin_id: driver.admin_id,
      vehicle_id: selectedVehicle,
      status: "reported",
      request_description: description.trim(),
      request_photos: photoUrls.length > 0 ? photoUrls : null,
      requested_by_driver_id: driver.id,
    }).select().single();

    if (!error && newRecord) {
      // Log the activity
      await supabase.from("maintenance_activity_log").insert({
        maintenance_record_id: newRecord.id,
        action: "created",
        details: { 
          reported_by: driver.name,
          description: description.trim(),
          photos_count: photoUrls.length,
        },
        performed_by_type: "driver",
        performed_by_driver_id: driver.id,
      });

      setShowForm(false);
      setSelectedVehicle("");
      setDescription("");
      setPhotos([]);
      fetchData(driver);
    } else {
      console.error("Error submitting request:", error);
      alert("Failed to submit request. Please try again.");
    }

    setSubmitting(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "reported":
        return "bg-orange-500/20 text-orange-400";
      case "diagnose":
        return "bg-purple-500/20 text-purple-400";
      case "scheduled":
        return "bg-blue-500/20 text-blue-400";
      case "due":
        return "bg-yellow-500/20 text-yellow-400";
      case "expired":
        return "bg-red-500/20 text-red-400";
      case "completed":
        return "bg-green-500/20 text-green-400";
      default:
        return "bg-gray-500/20 text-gray-400";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "reported":
        return <AlertTriangle className="h-4 w-4" />;
      case "diagnose":
        return <Wrench className="h-4 w-4" />;
      case "scheduled":
        return <Calendar className="h-4 w-4" />;
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "reported":
        return "Pending Review";
      case "diagnose":
        return "Under Diagnosis";
      case "scheduled":
        return "Appointment Scheduled";
      case "due":
        return "Due for Service";
      case "expired":
        return "Overdue";
      case "completed":
        return "Completed";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Show form view
  if (showForm) {
    return (
      <div className="p-4 pb-24 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Report Vehicle Issue</h1>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <Label>Select Vehicle *</Label>
              <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.plate_number}
                      {vehicle.model && ` - ${vehicle.model}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Describe the Issue *</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the problem you noticed (e.g., Check engine light is on, strange noise when braking, air conditioning not working...)"
                rows={5}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label>Add Photos (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Take or upload photos of the issue to help with diagnosis
              </p>
              
              <div className="grid grid-cols-4 gap-2">
                {photos.map((photo, index) => (
                  <div
                    key={index}
                    className="relative aspect-square rounded-lg overflow-hidden bg-muted"
                  >
                    <img
                      src={photo.preview || "/placeholder.svg"}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white hover:bg-black/70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                
                  {photos.length < 4 && (
                  <button
                  type="button"
                  onClick={handleAddPhoto}
                  className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 flex flex-col items-center justify-center gap-1 transition-colors"
                  >
                  <Camera className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Add</span>
                  </button>
                  )}
              </div>
              
                  {/* Android fullscreen camera */}
                  {androidCamera.cameraActive && (
                    <FullscreenCamera
                      videoRef={androidCamera.videoRef}
                      canvasRef={androidCamera.canvasRef}
                      onCapture={androidCamera.capturePhoto}
                      onCancel={androidCamera.stopCamera}
                    />
                  )}

                  <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  onChange={handlePhotoSelect}
                  className="hidden"
                  />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!selectedVehicle || !description.trim() || submitting}
              className="w-full"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  {uploading ? "Uploading Photos..." : "Submitting..."}
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main list view
  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Reported Issues</h1>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Report Issue
        </Button>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Wrench className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No reported issues yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Report any vehicle issues using the button above
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${getStatusColor(request.status).split(" ")[0]}`}>
                    {getStatusIcon(request.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {request.vehicle?.plate_number}
                        {request.vehicle?.model && ` - ${request.vehicle.model}`}
                      </span>
                      <Badge className={getStatusColor(request.status)}>
                        {getStatusLabel(request.status)}
                      </Badge>
                    </div>
                    
                    {request.maintenance_type && (
                      <p className="text-sm text-primary mt-1 font-medium">
                        {request.maintenance_type.name}
                      </p>
                    )}
                    
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {request.request_description}
                    </p>
                    
                    {/* Show appointment info if scheduled */}
                    {request.scheduled_start_time && (
                      <div className="mt-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <div className="flex items-center gap-2 text-sm text-blue-400">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>
                            {new Date(request.scheduled_start_time).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })} at {new Date(request.scheduled_start_time).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {request.appointment_location && (
                          <div className="flex items-center gap-2 text-sm mt-1">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">{request.appointment_location}</span>
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(request.appointment_location)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary text-xs hover:underline"
                            >
                              Get Directions
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Show photos */}
                    {request.request_photos && request.request_photos.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {request.request_photos.slice(0, 3).map((photo, i) => (
                          <div
                            key={i}
                            className="w-14 h-14 rounded-lg overflow-hidden bg-muted"
                          >
                            <img
                              src={photo || "/placeholder.svg"}
                              alt={`Photo ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                        {request.request_photos.length > 3 && (
                          <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center text-sm text-muted-foreground">
                            +{request.request_photos.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground mt-2">
                      Reported {new Date(request.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
