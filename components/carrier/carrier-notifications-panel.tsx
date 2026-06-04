"use client";

import useSWR from "swr";
import { useState } from "react";
import { Bell, Smartphone, Monitor, HelpCircle, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { playNotificationChime, primeNotificationSound } from "@/lib/notification-sound";

interface DeviceRow {
  id: string;
  kind: "mobile" | "browser" | "unknown";
  platform: string | null;
  last_seen_at: string | null;
  created_at: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const kindMeta = {
  mobile: { icon: Smartphone, label: "Mobile app" },
  browser: { icon: Monitor, label: "Web browser" },
  unknown: { icon: HelpCircle, label: "Device" },
} as const;

export function CarrierNotificationsPanel({ carrierAccountId }: { carrierAccountId: string }) {
  const { data, isLoading, mutate } = useSWR<{ devices: DeviceRow[]; hasMobile: boolean }>(
    `/api/carrier/devices?carrier_account_id=${carrierAccountId}`,
    fetcher,
    { revalidateOnFocus: true }
  );
  const [sending, setSending] = useState(false);

  const devices = data?.devices || [];
  const hasMobile = data?.hasMobile || false;

  const sendTest = async () => {
    primeNotificationSound();
    setSending(true);
    try {
      const res = await fetch("/api/carrier/test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier_account_id: carrierAccountId }),
      });
      const result = await res.json();
      if (result.success) {
        playNotificationChime();
        toast.success("Test notification sent", {
          description: result.message,
          icon: <CheckCircle2 className="h-4 w-4 text-primary" />,
        });
      } else {
        toast.warning("Could not deliver", {
          description: result.message || "No device received the notification.",
          icon: <AlertCircle className="h-4 w-4" />,
        });
      }
      void mutate();
    } catch {
      toast.error("Failed to send test notification");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
          <Bell className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">Notifications</p>
          <p className="text-xs text-muted-foreground leading-tight">
            Get alerted about new offers, decisions, and messages
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">No devices registered</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Open this carrier portal inside the BNG Tracking mobile app to receive
            push notifications on your phone, or enable browser notifications from
            the offers screen.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {devices.map((d) => {
            const meta = kindMeta[d.kind];
            const Icon = meta.icon;
            return (
              <div key={d.id} className="flex items-center gap-3 rounded-lg border p-3">
                <Icon className="h-4.5 w-4.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{meta.label}</p>
                    {d.kind === "mobile" && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Push
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {timeAgo(d.last_seen_at) || "registered"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && devices.length > 0 && !hasMobile && (
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Only a web browser is registered. To receive push on your phone, open
            this carrier portal inside the BNG Tracking mobile app.
          </p>
        </div>
      )}

      <Button onClick={sendTest} disabled={sending} variant="outline" className="w-full">
        {sending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        Send test notification
      </Button>
    </Card>
  );
}
