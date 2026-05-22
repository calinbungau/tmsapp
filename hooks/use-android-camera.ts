"use client";

import { useRef, useState, useCallback } from "react";

/**
 * Hook to handle camera access on Android WebView (Flutter/Traccar PWA).
 * 
 * On Android, `<input capture="environment">` doesn't trigger the camera permission
 * prompt inside Flutter WebView. Instead, we use `navigator.mediaDevices.getUserMedia()`
 * which DOES trigger the native permission dialog.
 * 
 * On iOS/desktop, we fall back to the standard <input capture> behavior.
 */
function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export function useAndroidCamera(onFile: (file: File) => void) {
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const capturePhoto = useCallback(() => {
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
        onFile(file);
      }
    }, "image/jpeg", 0.85);
  }, [stopCamera, onFile]);

  const openCamera = useCallback(async () => {
    // On Android: use getUserMedia to trigger native permission prompt
    if (isAndroid() && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        streamRef.current = stream;
        setCameraActive(true);
        requestAnimationFrame(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
        });
        return true; // handled
      } catch {
        // Fallback to input
        fallbackInputRef.current?.click();
        return false;
      }
    }
    // iOS/desktop: let caller use the normal <input capture> click
    return false;
  }, []);

  return {
    /** Whether the live camera viewfinder is active (Android only) */
    cameraActive,
    /** Ref for the <video> element (used when cameraActive is true) */
    videoRef,
    /** Ref for a hidden <canvas> used to capture the frame */
    canvasRef,
    /** Ref for a fallback <input type="file" capture> in case getUserMedia fails */
    fallbackInputRef,
    /** Call this when user taps "Take Photo". Returns true if Android handled it. */
    openCamera,
    /** Capture the current frame from the viewfinder */
    capturePhoto,
    /** Close the viewfinder and stop the stream */
    stopCamera,
    /** Whether the current device is Android */
    isAndroid: isAndroid(),
  };
}
