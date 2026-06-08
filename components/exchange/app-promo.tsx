"use client";

import { useEffect, useState } from "react";
import { APP_LINKS, APP_NAME } from "@/lib/exchange/app-links";

/**
 * Promotes the BNG Tracking mobile app with App Store / Google Play buttons.
 * Store URLs live in lib/exchange/app-links.ts.
 *
 * Only renders in a plain browser. When the Flutter bridge is present
 * (window.appInterface.postMessage), the user is already inside the native
 * app, so the promo is hidden.
 */
export function AppPromo({
  compact = false,
  subtitle,
}: {
  compact?: boolean;
  subtitle?: string;
}) {
  const [showPromo, setShowPromo] = useState(false);

  useEffect(() => {
    const w = window as any;
    const bridgePresent =
      typeof w?.appInterface?.postMessage === "function" ||
      typeof w?.webkit?.messageHandlers?.appInterface?.postMessage === "function";
    setShowPromo(!bridgePresent);
  }, []);

  if (!showPromo) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {!compact && (
        <>
          <p className="text-sm font-semibold text-foreground">Get the {APP_NAME} app</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {subtitle ||
              "Manage every offer, respond faster, and chat with dispatchers on the go. Create your free carrier account in the app."}
          </p>
        </>
      )}
      <div className={`flex flex-col sm:flex-row gap-2 ${compact ? "" : "mt-3"}`}>
        <a
          href={APP_LINKS.appStore}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-background transition-opacity hover:opacity-90"
        >
          <img src="/icons/app-store.svg" alt="" aria-hidden="true" className="h-5 w-5" />
          <span className="text-left leading-tight">
            <span className="block text-[10px] opacity-80">Download on the</span>
            <span className="block text-sm font-semibold">App Store</span>
          </span>
        </a>
        <a
          href={APP_LINKS.googlePlay}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-background transition-opacity hover:opacity-90"
        >
          <img src="/icons/google-play.svg" alt="" aria-hidden="true" className="h-5 w-5" />
          <span className="text-left leading-tight">
            <span className="block text-[10px] opacity-80">Get it on</span>
            <span className="block text-sm font-semibold">Google Play</span>
          </span>
        </a>
      </div>
    </div>
  );
}
