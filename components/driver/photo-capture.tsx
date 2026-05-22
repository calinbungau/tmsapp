"use client";

import React from "react"

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X, Loader2 } from "lucide-react";
import { FullscreenCamera } from "@/components/driver/fullscreen-camera";

interface PhotoCaptureProps {
  onUpload: (url: string) => void;
  value?: string;
  folder?: string;
  disabled?: boolean;
  accept?: string;
  label?: string;
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export function PhotoCapture({ onUpload, value, folder = "photos", disabled, accept = "image/*", label = "photo" }: PhotoCaptureProps) {
  const [uploading, setUploading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);

      const res = await fetch("/api/upload/form-attachment", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("Upload error:", res.status, text);
        return;
      }
      const data = await res.json();
      if (data.url) {
        onUpload(data.url);
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const openAndroidCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      // Wait for next render to attach stream to video
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (err: any) {
      console.error("Camera access error:", err);
      // Fallback to file input if getUserMedia fails
      cameraInputRef.current?.click();
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    stopCamera();
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: "image/jpeg" });
        handleFile(file);
      }
    }, "image/jpeg", 0.85);
  }, [stopCamera]);

  const handleCameraClick = useCallback(() => {
    if (isAndroid() && navigator.mediaDevices?.getUserMedia) {
      openAndroidCamera();
    } else {
      // iOS and desktop: use native input with capture attribute
      cameraInputRef.current?.click();
    }
  }, [openAndroidCamera]);

  if (value) {
    return (
      <div className="space-y-2">
        <div className="border rounded-lg overflow-hidden bg-muted relative group">
          <img src={value || "/placeholder.svg"} alt="Uploaded" className="w-full h-40 object-cover" />
          {!disabled && (
            <button
              type="button"
              onClick={() => onUpload("")}
              className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Android fullscreen camera viewfinder
  if (cameraActive) {
    return (
      <>
        <FullscreenCamera
          videoRef={videoRef}
          canvasRef={canvasRef}
          onCapture={capturePhoto}
          onCancel={stopCamera}
        />
      </>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={cameraInputRef}
        type="file"
        accept={accept}
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleInputChange}
      />

      {uploading ? (
        <div className="border-2 border-dashed rounded-lg h-32 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Uploading...</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-20 flex-col gap-1 bg-transparent"
            onClick={handleCameraClick}
            disabled={disabled}
          >
            <Camera className="h-5 w-5" />
            <span className="text-xs">Take {label}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-20 flex-col gap-1 bg-transparent"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <Upload className="h-5 w-5" />
            <span className="text-xs">Upload {label}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
