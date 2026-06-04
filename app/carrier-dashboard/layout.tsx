"use client";

import type React from "react";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Truck, Package, MessageSquare, User, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCarrierSession } from "@/hooks/use-carrier-session";
import { CarrierPushManager } from "@/components/carrier/carrier-push-manager";

declare global {
  interface Window {
    updateNotificationToken?: (token: string) => void;
  }
}

const navItems = [
  { href: "/carrier-dashboard", label: "Offers", icon: Package, exact: true },
  { href: "/carrier-dashboard/responses", label: "Responses", icon: Truck },
  { href: "/carrier-dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/carrier-dashboard/account", label: "Account", icon: User },
];

export default function CarrierDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { session, loading, logout } = useCarrierSession();

  // Bridge for the native BNG Tracking carrier app: it calls
  // window.updateNotificationToken(token) with the device FCM token. The native
  // shell may fire this *before* the carrier session has loaded, so we install
  // the handler immediately and always stash the latest token in localStorage.
  // A second effect (below) registers the stored token against the logged-in
  // carrier account as soon as the session is available — this avoids a startup
  // race where an early token would otherwise be dropped.
  useEffect(() => {
    window.updateNotificationToken = (token: string) => {
      if (!token) return;
      try {
        localStorage.setItem("carrier_fcm_token", token);
      } catch {
        /* ignore storage errors */
      }
      // Fire a custom event so the registration effect can react in real time
      // even if the session was already loaded when the token arrives.
      window.dispatchEvent(new CustomEvent("carrierTokenUpdated", { detail: token }));
    };
    return () => {
      delete window.updateNotificationToken;
    };
  }, []);

  // Register the captured FCM token against the carrier account. Runs when the
  // session becomes available and whenever the native app delivers a new token.
  useEffect(() => {
    if (!session?.id) return;
    const accountId = session.id;

    const register = async (token: string) => {
      if (!token) return;
      try {
        await fetch("/api/carrier/register-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            carrier_account_id: accountId,
            fcm_token: token,
            platform: navigator.userAgent,
          }),
        });
      } catch (err) {
        console.error("[carrier] failed to register device token", err);
      }
    };

    // Register any token captured before the session was ready.
    const existing = localStorage.getItem("carrier_fcm_token");
    if (existing) void register(existing);

    // Register fresh tokens delivered while the dashboard is open.
    const onToken = (e: Event) => {
      const token = (e as CustomEvent<string>).detail;
      if (token) void register(token);
    };
    window.addEventListener("carrierTokenUpdated", onToken);

    return () => {
      window.removeEventListener("carrierTokenUpdated", onToken);
    };
  }, [session?.id]);

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="sticky top-0 z-40 bg-card border-b">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Truck className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">
                {session.company_name || "Carrier"}
              </p>
              <p className="text-xs text-muted-foreground leading-tight truncate">
                {session.email}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-20">
        <div className="px-4 pt-4">
          <CarrierPushManager carrierAccountId={session.id} />
        </div>
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t z-50">
        <div className="flex items-center justify-around py-2 max-w-md mx-auto">
          {navItems.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/") || pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
