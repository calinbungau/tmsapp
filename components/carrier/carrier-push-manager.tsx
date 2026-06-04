"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  requestCarrierWebPushToken,
  onCarrierForegroundMessage,
} from "@/lib/firebase/messaging-client";

/**
 * Manages browser push notifications for a logged-in carrier.
 *
 * Two registration paths feed the same `carrier_devices` table:
 *   1. Native BNG Tracking app  -> window.updateNotificationToken (handled in
 *      the dashboard layout).
 *   2. Web browser              -> Firebase JS SDK (this component).
 *
 * On web we never auto-prompt for permission (bad UX + browsers ignore it
 * without a gesture). If permission is already granted we silently refresh the
 * token; otherwise we show a dismissible banner that requests permission on tap.
 */
export function CarrierPushManager({ carrierAccountId }: { carrierAccountId: string }) {
  const [showBanner, setShowBanner] = useState(false);

  const registerToken = useCallback(
    async (token: string | null) => {
      if (!token || !carrierAccountId) return;
      try {
        localStorage.setItem("carrier_fcm_token", token);
        await fetch("/api/carrier/register-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            carrier_account_id: carrierAccountId,
            fcm_token: token,
            platform: navigator.userAgent,
          }),
        });
      } catch (err) {
        console.error("[carrier-push] failed to register web token", err);
      }
    },
    [carrierAccountId]
  );

  // Decide whether to silently register or show the opt-in banner.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Inside the native app the token arrives via updateNotificationToken, so
    // skip the web flow entirely.
    if (window.updateNotificationToken && localStorage.getItem("carrier_fcm_token")) return;
    if (typeof Notification === "undefined") return;

    if (Notification.permission === "granted") {
      void requestCarrierWebPushToken().then(registerToken);
    } else if (Notification.permission === "default") {
      const dismissed = sessionStorage.getItem("carrier_push_banner_dismissed");
      if (!dismissed) setShowBanner(true);
    }
  }, [registerToken]);

  // Foreground messages: show a toast while the carrier has the tab focused.
  useEffect(() => {
    let unsub = () => {};
    void onCarrierForegroundMessage((payload) => {
      if (payload.title) {
        toast(payload.title, { description: payload.body });
      }
    }).then((fn) => {
      unsub = fn;
    });
    return () => unsub();
  }, []);

  const enable = async () => {
    setShowBanner(false);
    const token = await requestCarrierWebPushToken();
    if (token) {
      await registerToken(token);
      toast.success("Notifications enabled", {
        description: "You'll be notified about new offers, decisions, and messages.",
      });
    } else {
      toast.error("Notifications blocked", {
        description: "Enable notifications in your browser settings to receive offer alerts.",
      });
    }
  };

  const dismiss = () => {
    setShowBanner(false);
    try {
      sessionStorage.setItem("carrier_push_banner_dismissed", "1");
    } catch {
      /* ignore */
    }
  };

  if (!showBanner) return null;

  return (
    <div className="mx-auto mb-4 flex max-w-3xl items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
        <Bell className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Turn on notifications</p>
        <p className="text-xs text-muted-foreground">
          Get alerted instantly about new freight offers, awarded loads, and dispatcher messages.
        </p>
      </div>
      <Button size="sm" onClick={enable} className="shrink-0">
        Enable
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
