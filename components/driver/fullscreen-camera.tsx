"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RefObject } from "react";

interface FullscreenCameraProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onCapture: () => void;
  onCancel: () => void;
}

export function FullscreenCamera({ videoRef, canvasRef, onCapture, onCancel }: FullscreenCameraProps) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {/* Camera feed -- fills the entire screen */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Top bar with cancel */}
      <div className="relative z-10 flex items-center justify-between p-4 pt-[env(safe-area-inset-top,16px)]">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-white bg-black/30 backdrop-blur-md border border-white/20 hover:bg-black/50 hover:text-white"
          onClick={onCancel}
        >
          <X className="h-5 w-5 mr-1" />
          Cancel
        </Button>
      </div>

      {/* Spacer to push controls to bottom */}
      <div className="flex-1" />

      {/* Bottom controls */}
      <div className="relative z-10 flex items-center justify-center pb-[max(env(safe-area-inset-bottom,24px),24px)] pt-6 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
        <button
          type="button"
          onClick={onCapture}
          className="w-[72px] h-[72px] rounded-full border-[5px] border-white bg-white/20 backdrop-blur-sm active:bg-white/50 active:scale-95 transition-all"
          aria-label="Capture photo"
        >
          <span className="block w-full h-full rounded-full border-2 border-white/60" />
        </button>
      </div>
    </div>
  );
}
