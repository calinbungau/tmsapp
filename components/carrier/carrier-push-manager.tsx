"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  requestCarrierWebPushToken,
  onCarrierForegroundMessage,
} from "@/lib/firebase/messaging-client";
import { playNotificationChime, primeNotificationSound } from "@/lib/notification-sound";

// Map a push payload to the in-app destination (mirrors the service worker).
function targetForPayload(data?: Record<string, string>): string {
  if (!data) return "/carrier-dashboard";
  if (data.token) return `/carrier-dashboard/offers/${data.token}`;
  if (data.type === "chat_message") return "/carrier-dashboard/chat";
  if (data.type?.startsWith("freight_offer")) return "/carrier-dashboard/responses";
  return "/carrier-dashboard";
}

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
  const router = useRouter();
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

  // Foreground messages: ring a chime + show a rich, tappable toast. When the
  // tab is hidden, also raise an OS notification via the service worker.
  useEffect(() => {
    let unsub = () => {};
    void onCarrierForegroundMessage((payload) => {
      if (!payload.title) return;

      // Acoustic cue.
      playNotificationChime();

      const href = targetForPayload(payload.data);

      // Modern in-app toast with a bell icon and a quick "View" action.
      toast(payload.title, {
        description: payload.body,
        icon: <Bell className="h-4 w-4 text-primary" />,
        duration: 8000,
        action: {
          label: "View",
          onClick: () => router.push(href),
        },
      });

      // If the carrier isn't looking at the tab, also show a system notification.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        void navigator.serviceWorker?.ready
          .then((reg) =>
            reg.showNotification(payload.title!, {
              body: payload.body,
              icon: "/images/logo-full-bng.png",
              badge: "/images/logo-full-bng.png",
              tag: payload.data?.offer_id,
              data: payload.data,
            })
          )
          .catch(() => {});
      }
    }).then((fn) => {
      unsub = fn;
    });
    return () => unsub();
  }, [router]);

  const enable = async () => {
    // Unlock audio within this user gesture, then confirm with the chime.
    primeNotificationSound();
    setShowBanner(false);
    const token = await requestCarrierWebPushToken();
    if (token) {
      await registerToken(token);
      playNotificationChime();
      toast.success("Notifications enabled", {
        description: "You'll be notified about new offers, decisions, and messages.",
        icon: <Bell className="h-4 w-4 text-primary" />,
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
