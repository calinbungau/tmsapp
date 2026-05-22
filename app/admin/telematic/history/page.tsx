"use client";

import { History, Construction } from "lucide-react";

export default function TelematicHistoryPage() {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-120px)]">
      <div className="text-center space-y-4 max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <History className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-semibold">Route History</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Replay historical routes, view trip playback with speed profiles, 
          and analyze stop durations for any vehicle in your fleet.
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
          <Construction className="h-4 w-4" />
          <span>Coming soon</span>
        </div>
      </div>
    </div>
  );
}
