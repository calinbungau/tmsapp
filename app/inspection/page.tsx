"use client";

import React from "react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Check, ArrowRight, ArrowLeft, X, AlertCircle, MapPin } from "lucide-react";
import { PHOTO_POSITIONS, TRANSLATIONS, type PhotoPosition, type Language } from "@/lib/types";
import SignaturePad from "@/components/signature-pad";
import { useAndroidCamera } from "@/hooks/use-android-camera";
import { FullscreenCamera } from "@/components/driver/fullscreen-camera";

interface CurrentInspection {
  id: string;
  vehicle_id: string;
  admin_id: string;
}

type Photos = Record<PhotoPosition, string | null>;

export default function InspectionPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [photos, setPhotos] = useState<Photos>({
    front_right: null,
    front_left: null,
    back_right: null,
    back_left: null,
    interior: null,
    license_front: null,
    license_back: null,
    gisa: null,
  });
  const [signature, setSignature] = useState<string | null>(null);
  const [showSignature, setShowSignature] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [inspection, setInspection] = useState<CurrentInspection | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const session = localStorage.getItem("driver_session");
    const inspectionData = localStorage.getItem("current_inspection");
    const driverLanguage = localStorage.getItem("driver_language") as Language;

    if (!session || !inspectionData) {
      router.push("/driver");
      return;
    }

    setInspection(JSON.parse(inspectionData));
    if (driverLanguage && TRANSLATIONS[driverLanguage]) {
      setLanguage(driverLanguage);
    }

    // Request geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          });
          setLocationLoading(false);
        },
        (error) => {
          console.error("Geolocation error:", error);
          setLocationError(
            error.code === 1
              ? "Location access denied. Please enable location services."
              : "Unable to get location."
          );
          setLocationLoading(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      setLocationError("Geolocation is not supported by this device.");
      setLocationLoading(false);
    }
  }, [router]);

  const t = TRANSLATIONS[language];
  const currentPosition = PHOTO_POSITIONS[currentStep];

  const handleCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCameraError(null);

    // Check if the file was taken with camera (checking for recent timestamp)
    const fileDate = new Date(file.lastModified);
    const now = new Date();
    const diffMinutes = (now.getTime() - fileDate.getTime()) / (1000 * 60);
    
    // If the file is older than 5 minutes, it's likely from gallery
    if (diffMinutes > 5) {
      setCameraError(t.cameraOnly);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Check if file is from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fileDay = new Date(file.lastModified);
    fileDay.setHours(0, 0, 0, 0);
    
    if (fileDay.getTime() < today.getTime()) {
      setCameraError(t.cameraOnly);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotos((prev) => ({
        ...prev,
        [currentPosition]: reader.result as string,
      }));
    };
    reader.readAsDataURL(file);
  };

  // Process a File directly (from Android camera hook)
  const processInspectionFile = (file: File) => {
    setCameraError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setPhotos((prev) => ({ ...prev, [currentPosition]: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const androidCamera = useAndroidCamera(processInspectionFile);

  const handleOpenCamera = async () => {
    setCameraError(null);
    const handled = await androidCamera.openCamera();
    if (!handled) {
      fileInputRef.current?.click();
    }
  };

  const handleClearPhoto = () => {
    setPhotos((prev) => ({
      ...prev,
      [currentPosition]: null,
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleNext = () => {
    if (currentStep < PHOTO_POSITIONS.length - 1) {
      setCurrentStep((prev) => prev + 1);
      setCameraError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } else {
      // All photos done, show signature
      setShowSignature(true);
    }
  };

  const handleBack = () => {
    if (showSignature) {
      setShowSignature(false);
    } else if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      setCameraError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = async () => {
    if (!inspection || !signature) return;

    setUploading(true);

    try {
      const supabase = createClient();

      // Upload each photo to Supabase Storage and get URLs
      const photoUrls: Record<string, string | null> = {
        photo_front_right_url: null,
        photo_front_left_url: null,
        photo_back_right_url: null,
        photo_back_left_url: null,
        photo_interior_url: null,
        photo_license_front_url: null,
        photo_license_back_url: null,
        photo_gisa_url: null,
        signature_url: null,
      };

      // Upload photos
      for (const position of PHOTO_POSITIONS) {
        const photo = photos[position];
        if (photo) {
          const base64Data = photo.split(",")[1];
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: "image/jpeg" });

          const fileName = `${inspection.admin_id}/${inspection.id}/${position}_${Date.now()}.jpg`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("inspection-photos")
            .upload(fileName, blob, {
              contentType: "image/jpeg",
              upsert: true,
            });

          if (uploadError) {
            console.error(`[v0] Failed to upload ${position} photo:`, uploadError.message, uploadError);
            // Don't fallback to base64 - it's expensive. Throw error instead.
            throw new Error(`Failed to upload ${position} photo: ${uploadError.message}`);
          } else {
            const { data: urlData } = supabase.storage
              .from("inspection-photos")
              .getPublicUrl(uploadData.path);
            photoUrls[`photo_${position}_url`] = urlData.publicUrl;
          }
        }
      }

      // Upload signature
      if (signature) {
        const base64Data = signature.split(",")[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "image/png" });

        const fileName = `${inspection.admin_id}/${inspection.id}/signature_${Date.now()}.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("inspection-photos")
          .upload(fileName, blob, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          console.error("[v0] Failed to upload signature:", uploadError.message, uploadError);
          throw new Error(`Failed to upload signature: ${uploadError.message}`);
        } else {
          console.log("[v0] Successfully uploaded signature");
          const { data: urlData } = supabase.storage
            .from("inspection-photos")
            .getPublicUrl(uploadData.path);
          photoUrls.signature_url = urlData.publicUrl;
        }
      }

      // Update inspection record with photos and location
      const { error: updateError } = await supabase
        .from("inspections")
        .update({
          ...photoUrls,
          status: "completed",
          completed_at: new Date().toISOString(),
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          location_accuracy: location?.accuracy || null,
          location_timestamp: location?.timestamp ? new Date(location.timestamp).toISOString() : null,
        })
        .eq("id", inspection.id);

      if (updateError) throw updateError;

      // Clear session and redirect
      localStorage.removeItem("current_inspection");
      router.push("/inspection/complete");
    } catch (err) {
      console.error("Failed to submit inspection:", err);
      alert("Failed to submit inspection. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const currentPhoto = photos[currentPosition];
  const allPhotosComplete = Object.values(photos).every((p) => p !== null);
  const isLastStep = currentStep === PHOTO_POSITIONS.length - 1;
  const photoInfo = t.photos[currentPosition];

  // Signature step
  if (showSignature) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto space-y-4">
          <div className="text-center mb-2">
            <h1 className="text-lg font-semibold">{t.signature.title}</h1>
            <p className="text-xs text-muted-foreground">{t.signature.instruction}</p>
          </div>

          {/* Progress indicator - all complete */}
          <div className="flex items-center justify-between mb-6">
            {PHOTO_POSITIONS.map((_, index) => (
              <div
                key={index}
                className="flex-1 h-2 mx-0.5 rounded-full bg-primary"
              />
            ))}
          </div>

          {/* Photo summary */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {PHOTO_POSITIONS.map((pos) => (
              <div key={pos} className="aspect-square rounded overflow-hidden">
                <img
                  src={photos[pos] || "/placeholder.svg"}
                  alt={t.photos[pos].label}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>

          {/* Signature pad */}
          <Card>
            <CardContent className="p-4">
              <SignaturePad
                onSignatureChange={setSignature}
                clearText={t.signature.clear}
              />
            </CardContent>
          </Card>

          <p className="text-xs text-center text-muted-foreground">
            {t.signature.confirm}
          </p>

          {/* Navigation buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 bg-transparent"
              onClick={handleBack}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t.back}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={!signature || uploading}
            >
              {uploading ? t.submitting : t.submit}
            </Button>
          </div>

          {/* Cancel option */}
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => {
              if (confirm(t.cancelConfirm)) {
                localStorage.removeItem("current_inspection");
                router.push("/select-vehicle");
              }
            }}
          >
            {t.cancel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Title */}
        <div className="text-center mb-2">
          <h1 className="text-lg font-semibold">{t.title}</h1>
          <p className="text-xs text-muted-foreground">{t.subtitle}</p>
        </div>

        {/* Location status */}
        <div className={`flex items-center justify-center gap-2 text-xs py-1 px-3 rounded-full mx-auto w-fit ${
          locationLoading 
            ? "bg-primary/20 text-primary" 
            : location 
              ? "bg-green-500/20 text-green-400" 
              : "bg-yellow-500/20 text-yellow-400"
        }`}>
          <MapPin className="h-3 w-3" />
          {locationLoading 
            ? "Getting location..." 
            : location 
              ? `Location acquired (${location.accuracy.toFixed(0)}m accuracy)`
              : locationError || "Location unavailable"}
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-6">
          {PHOTO_POSITIONS.map((pos, index) => (
            <div
              key={pos}
              className={`flex-1 h-2 mx-0.5 rounded-full transition-colors ${
                index < currentStep
                  ? "bg-primary"
                  : index === currentStep
                    ? "bg-primary/50"
                    : "bg-border"
              }`}
            />
          ))}
        </div>

        {/* Step info */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {t.step} {currentStep + 1} {t.of} {PHOTO_POSITIONS.length}
          </p>
          <h2 className="text-xl font-semibold">{photoInfo?.label}</h2>
          <p className="text-sm text-muted-foreground">{photoInfo?.instruction}</p>
        </div>

        {/* Camera input - with capture attribute to force camera */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCapture}
          className="hidden"
        />

                  {/* Camera error message */}
                  {cameraError && (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <p className="text-sm">{cameraError}</p>
                  </div>
                  )}

                  {/* Android fullscreen camera */}
                  {androidCamera.cameraActive && (
                    <FullscreenCamera
                      videoRef={androidCamera.videoRef}
                      canvasRef={androidCamera.canvasRef}
                      onCapture={androidCamera.capturePhoto}
                      onCancel={androidCamera.stopCamera}
                    />
                  )}
                  
                  {/* Photo preview/capture area */}
        <Card>
          <CardContent className="p-4">
            {currentPhoto ? (
              <div className="relative">
                <img
                  src={currentPhoto || "/placeholder.svg"}
                  alt={photoInfo?.label}
                  className="w-full rounded-lg object-cover aspect-[4/3]"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={handleClearPhoto}
                >
                  <X className="h-4 w-4" />
                </Button>
                <div className="absolute bottom-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded text-sm flex items-center gap-1">
                  <Check className="h-4 w-4" />
                  {t.captured}
                </div>
              </div>
            ) : (
              <div
                onClick={handleOpenCamera}
                className="border-2 border-dashed border-primary/30 rounded-lg aspect-[4/3] flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/60 transition-colors bg-card"
              >
                <Camera className="h-12 w-12 text-primary" />
                <p className="text-sm text-foreground/70">{t.tapToTake}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Thumbnail gallery */}
        <div className="flex justify-center gap-1 flex-wrap">
          {PHOTO_POSITIONS.map((pos, index) => (
            <button
              key={pos}
              onClick={() => {
                setCurrentStep(index);
                setCameraError(null);
              }}
              className={`w-10 h-8 rounded border-2 overflow-hidden transition-all ${
                index === currentStep
                  ? "border-primary"
                  : photos[pos]
                    ? "border-primary/50"
                    : "border-border"
              }`}
            >
              {photos[pos] ? (
                <img
                  src={photos[pos]! || "/placeholder.svg"}
                  alt={t.photos[pos].label}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-card flex items-center justify-center">
                  <span className="text-[8px] text-foreground/50">{index + 1}</span>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 bg-transparent"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t.back}
          </Button>

          {isLastStep ? (
            <Button className="flex-1" onClick={handleNext} disabled={!currentPhoto}>
              {t.next}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button className="flex-1" onClick={handleNext} disabled={!currentPhoto}>
              {t.next}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>

        {/* Cancel option */}
        <Button
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={() => {
            if (confirm(t.cancelConfirm)) {
              localStorage.removeItem("current_inspection");
              router.push("/select-vehicle");
            }
          }}
        >
          {t.cancel}
        </Button>
      </div>
    </div>
  );
}
