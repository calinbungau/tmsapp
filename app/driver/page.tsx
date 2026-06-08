"use client";

import React from "react"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Truck, MapPin } from "lucide-react";

// Extend window to include updateNotificationToken
declare global {
  interface Window {
    updateNotificationToken?: (token: string) => void;
  }
}

export default function DriverLoginPage() {
  const [pinCode, setPinCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();

  // Check for existing session and setup FCM token listener
  useEffect(() => {
    // Check if driver is already logged in (persistent session)
    const session = localStorage.getItem("driver_session");
    if (session) {
      // Validate session is still valid by checking if driver exists and is active
      const driverData = JSON.parse(session);
      const supabase = createClient();
      supabase
        .from("drivers")
        .select("id, is_active")
        .eq("id", driverData.id)
        .eq("is_active", true)
        .single()
        .then(({ data }) => {
          if (data) {
            // Session is valid, redirect to dashboard
            router.push("/driver-dashboard");
          } else {
            // Session is invalid (driver deleted or deactivated), clear it
            localStorage.removeItem("driver_session");
            setCheckingSession(false);
          }
        })
        .catch(() => {
          setCheckingSession(false);
        });
    } else {
      setCheckingSession(false);
    }

    // Setup global function for Traccar app to pass FCM token
    window.updateNotificationToken = (token: string) => {
      if (token) {
        localStorage.setItem("fcm_token", token);
        
        // If driver is already logged in, register the token immediately
        const existingSession = localStorage.getItem("driver_session");
        if (existingSession) {
          const driverData = JSON.parse(existingSession);
          fetch("/api/drivers/register-device", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pin_code: driverData.pin_code,
              fcm_token: token,
              device_info: {
                platform: navigator.platform,
                userAgent: navigator.userAgent,
                language: navigator.language,
              },
            }),
          }).catch(console.error);
        }
      }
    };

    // Tell Traccar app we're ready and trigger login flow to get FCM token
    const appInterface = (window as any).appInterface;
    if (appInterface?.postMessage) {
      appInterface.postMessage('authentication');
      setTimeout(() => {
        appInterface.postMessage('login');
      }, 500);
    }

    return () => {
      delete window.updateNotificationToken;
    };
  }, [router]);

  const handleAltLogin = (url: string) => {
    const w = window as any;
    if (w.webkit?.messageHandlers?.appInterface) {
      w.webkit.messageHandlers.appInterface.postMessage(`server|${url}`);
    } else if (w.appInterface) {
      w.appInterface.postMessage(`server|${url}`);
    } else {
      window.location.replace(url);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: driver, error: dbError } = await supabase
        .from("drivers")
        .select("*")
        .eq("pin_code", pinCode)
        .eq("is_active", true)
        .single();

      if (dbError || !driver) {
        setError("Invalid PIN code. Please try again.");
        setLoading(false);
        return;
      }

      // Store driver info in localStorage for session (include admin_id for multi-tenant filtering)
      localStorage.setItem("driver_session", JSON.stringify({
        id: driver.id,
        name: driver.name,
        pin_code: driver.pin_code,
        admin_id: driver.admin_id,
      }));
      // Store driver's preferred language
      localStorage.setItem("driver_language", driver.language || "en");

      // Register FCM token if available (from Traccar mobile app localStorage)
      const tokenToRegister = localStorage.getItem("fcm_token");
      if (tokenToRegister) {
        try {
          await fetch("/api/drivers/register-device", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pin_code: pinCode,
              fcm_token: tokenToRegister,
              device_info: {
                platform: navigator.platform,
                userAgent: navigator.userAgent,
                language: navigator.language,
              },
            }),
          });
        } catch (fcmError) {
          console.error("Failed to register FCM token:", fcmError);
          // Don't block login if FCM registration fails
        }
      }

      router.push("/driver-dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking session
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 animate-pulse">
            <Truck className="h-8 w-8 text-primary" />
          </div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Truck className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Driver App</CardTitle>
          <CardDescription>Enter your PIN code to access your dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin">PIN Code</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Enter your PIN"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                className="text-center text-2xl tracking-widest"
                maxLength={6}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading || pinCode.length < 4}>
              {loading ? "Verifying..." : "Login"}
            </Button>
          </form>
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => handleAltLogin("https://gps.bngtracking.ro/")}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <MapPin className="h-4 w-4" />
              Telematic
            </button>
            <span className="text-muted-foreground/30">|</span>
            <button
              type="button"
              onClick={() => handleAltLogin(`${window.location.origin}/admin`)}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Admin Panel
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
