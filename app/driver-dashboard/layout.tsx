"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Bell, ClipboardList, FileText, User, Wrench, FolderOpen, Car, LogIn, CalendarDays, Route, Radio, Package } from "lucide-react";
import { DriverChatFab } from "@/components/chat/driver-chat-fab";
import { isModuleEnabled } from "@/lib/modules";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { VehicleSessionPrompt } from "@/components/driver/vehicle-session-prompt";

// Extend window for native app bridge (Flutter shell)
declare global {
  interface Window {
    updateNotificationToken?: (token: string) => void;
    isNativeApp?: boolean;
    nativePlatform?: string;
    nativeAppVersion?: string;
    nativeGps?: {
      startTracking: (
        traccarUrl: string,
        deviceId: string,
        options?: {
          mode?: "distance" | "time" | "highest";
          distanceFilter?: number;
          intervalSeconds?: number;
          heartbeatSeconds?: number;
        }
      ) => Promise<{ status: string } | { error: string }>;
      stopTracking: () => Promise<{ status: string }>;
      isTracking: () => Promise<boolean>;
      getCurrentPosition: () => Promise<{
        latitude: number;
        longitude: number;
        speed: number;
        heading: number;
        accuracy: number;
        altitude: number;
        battery: number;
        isMoving: boolean;
      } | null>;
      updateConfig: (options: {
        mode?: "distance" | "time" | "highest";
        distanceFilter?: number;
        intervalSeconds?: number;
        heartbeatSeconds?: number;
      }) => Promise<{ status: string }>;
      getStats: () => Promise<{
        enabled: boolean;
        isMoving: boolean;
        trackingMode: number;
        odometer: number;
        pendingLocations: number;
      }>;
      forceSync: () => Promise<{ status: string }>;
    };
  }
}

interface DriverSession {
  id: string;
  name: string;
  pin_code: string;
  admin_id: string;
}

interface VehicleSession {
  id: string;
  vehicle_id: string;
  check_in_time: string;
  vehicle?: {
    plate_number: string;
    model: string | null;
  };
}

interface Vehicle {
  id: string;
  plate_number: string;
  model: string | null;
}

export default function DriverDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [expiringDocsCount, setExpiringDocsCount] = useState(0);
  const [newJobsCount, setNewJobsCount] = useState(0);
  const [activeTripsCount, setActiveTripsCount] = useState(0);
  const [activeSession, setActiveSession] = useState<VehicleSession | null>(null);
  const [availableVehicles, setAvailableVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const onlineIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const fetchUnreadCount = async (driverId: string) => {
    const supabase = createClient();
    const { count } = await supabase
      .from("driver_notifications")
      .select("*", { count: "exact", head: true })
      .eq("driver_id", driverId)
      .eq("read", false);
    
    setUnreadCount(count || 0);
  };

  const fetchNewJobsCount = async (driverId: string) => {
    const supabase = createClient();
    const { count } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("driver_id", driverId)
      .in("status", ["dispatched", "scheduled"]);
    
    setNewJobsCount(count || 0);
  };

  const fetchActiveTripsCount = async (driverId: string) => {
    const supabase = createClient();
    const { count } = await supabase
      .from("trips")
      .select("*", { count: "exact", head: true })
      .eq("driver_id", driverId)
      .in("status", ["dispatched", "accepted", "in_progress"]);
    setActiveTripsCount(count || 0);
  };

  const fetchExpiringDocsCount = async (driverId: string) => {
    const supabase = createClient();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const { data } = await supabase
      .from("documents")
      .select("id, expiry_date")
      .eq("driver_id", driverId)
      .not("expiry_date", "is", null)
      .lte("expiry_date", thirtyDaysFromNow.toISOString().split("T")[0]);
    
    setExpiringDocsCount(data?.length || 0);
  };

  const fetchActiveSession = async (driverId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("vehicle_usage_sessions")
      .select("id, vehicle_id, check_in_time, vehicle:vehicles(plate_number, model)")
      .eq("driver_id", driverId)
      .eq("status", "active")
      .order("check_in_time", { ascending: false })
      .limit(1)
      // maybeSingle() instead of single() because a driver with no
      // active vehicle session is the normal idle state. single()
      // makes PostgREST return HTTP 406 when zero rows match, which
      // shows up as a noisy red error in the browser console even
      // though the app handles `null` correctly. maybeSingle() returns
      // `data: null` with HTTP 200 in that case.
      .maybeSingle();
    
    setActiveSession(data as VehicleSession | null);
  };

  const fetchOnlineStatus = async (driverId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("drivers")
      .select("is_online")
      .eq("id", driverId)
      .single();
    if (data) setIsOnline(!!data.is_online);
  };

  const toggleOnline = async (online: boolean) => {
    if (!driver) return;
    setTogglingOnline(true);
    const supabase = createClient();
    
    await supabase
      .from("drivers")
      .update({
        is_online: online,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", driver.id);

    setIsOnline(online);
    setTogglingOnline(false);

    if (online) {
      // Start native background GPS if running in the Flutter app
      // Sends directly to our Supabase-backed API, not Traccar
      if (window.isNativeApp && window.nativeGps) {
        try {
          const appUrl = window.location.origin;
          await window.nativeGps.startTracking(appUrl, driver.id, {
            mode: "distance",
            distanceFilter: 50,
            heartbeatSeconds: 600,
          });
        } catch { /* non-blocking */ }
      }
      // Also keep web-based position sending as fallback
      sendPosition(driver.id);
      if (onlineIntervalRef.current) clearInterval(onlineIntervalRef.current);
      onlineIntervalRef.current = setInterval(() => sendPosition(driver.id), 30000);
    } else {
      // Stop native GPS tracking
      if (window.isNativeApp && window.nativeGps) {
        try { await window.nativeGps.stopTracking(); } catch { /* non-blocking */ }
      }
      if (onlineIntervalRef.current) {
        clearInterval(onlineIntervalRef.current);
        onlineIntervalRef.current = null;
      }
    }
  };

  const sendPosition = (driverId: string) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const supabase = createClient();
        await supabase
          .from("drivers")
          .update({
            last_lat: pos.coords.latitude,
            last_lng: pos.coords.longitude,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", driverId);
        // Also insert into driver_positions for history
        await supabase.from("driver_positions").insert({
          driver_id: driverId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
        });
      },
      undefined,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const fetchAvailableVehicles = async (adminId: string) => {
    const supabase = createClient();
    
    const { data: activeUsage } = await supabase
      .from("vehicle_usage_sessions")
      .select("vehicle_id")
      .eq("status", "active");
    
    const usedVehicleIds = activeUsage?.map(u => u.vehicle_id) || [];
    
    let query = supabase
      .from("vehicles")
      .select("id, plate_number, model")
      .eq("admin_id", adminId)
      .eq("is_active", true);
    
    if (usedVehicleIds.length > 0) {
      query = query.not("id", "in", `(${usedVehicleIds.join(",")})`);
    }
    
    const { data } = await query.order("plate_number");
    setAvailableVehicles(data || []);
  };

  const getDriverLocation = (): Promise<{ latitude: number; longitude: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => resolve(null),
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  };

  const handleCheckIn = async () => {
    if (!driver || !selectedVehicleId) return;
    setCheckingIn(true);
    
    // Get driver's phone location
    const location = await getDriverLocation();
    
    const supabase = createClient();
    await supabase.from("vehicle_usage_sessions").insert({
      admin_id: driver.admin_id,
      driver_id: driver.id,
      vehicle_id: selectedVehicleId,
      check_in_time: new Date().toISOString(),
      check_in_latitude: location?.latitude || null,
      check_in_longitude: location?.longitude || null,
      status: "active",
    });
    
    setShowCheckInDialog(false);
    setSelectedVehicleId("");
    setCheckingIn(false);
    fetchActiveSession(driver.id);
  };

  const handleCheckOut = async () => {
    if (!driver || !activeSession) return;
    
    // Get driver's phone location
    const location = await getDriverLocation();
    
    const supabase = createClient();
    await supabase
      .from("vehicle_usage_sessions")
      .update({
        check_out_time: new Date().toISOString(),
        check_out_latitude: location?.latitude || null,
        check_out_longitude: location?.longitude || null,
        status: "completed",
      })
      .eq("id", activeSession.id);
    
    setActiveSession(null);
  };

  const openCheckInDialog = () => {
    if (driver) {
      fetchAvailableVehicles(driver.admin_id);
    }
    setShowCheckInDialog(true);
  };

  useEffect(() => {
    const session = localStorage.getItem("driver_session");
    if (!session) {
      router.push("/driver");
      return;
    }
    const driverData = JSON.parse(session);
    setDriver(driverData);
    setLoading(false);
    fetchUnreadCount(driverData.id);
    fetchExpiringDocsCount(driverData.id);
    fetchNewJobsCount(driverData.id);
    fetchActiveTripsCount(driverData.id);
    // Fetch chat unread
    fetch(`/api/chat/unread?userId=${driverData.id}&userType=driver`)
      .then(r => r.json())
      .then(d => setChatUnreadCount(d.total_unread || 0))
      .catch(() => {});
    fetchActiveSession(driverData.id);
    fetchOnlineStatus(driverData.id);

    // Setup global function for Traccar app to pass FCM token
    window.updateNotificationToken = (token: string) => {
      if (token) {
        localStorage.setItem("fcm_token", token);
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
    };

    // Listen for notification updates from notifications page
    const handleNotificationUpdate = () => {
      fetchUnreadCount(driverData.id);
    };
    window.addEventListener("notificationsUpdated", handleNotificationUpdate);

    // Realtime subscription for driver_notifications
    const supabase = createClient();
    const notifChannel = supabase
      .channel('driver-notif-count')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'driver_notifications',
        filter: `driver_id=eq.${driverData.id}`,
      }, () => {
        fetchUnreadCount(driverData.id);
      })
      .subscribe();

    // Realtime subscription for tasks (new jobs assigned)
    const jobsChannel = supabase
      .channel('driver-jobs-count')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `driver_id=eq.${driverData.id}`,
      }, () => {
        fetchNewJobsCount(driverData.id);
        // Dispatch event so the jobs page can also refresh
        window.dispatchEvent(new CustomEvent("jobsUpdated"));
      })
      .subscribe();

    // Realtime subscription for trips (TMS orders dispatched to driver)
    const tripsChannel = supabase
      .channel('driver-trips-count')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trips',
        filter: `driver_id=eq.${driverData.id}`,
      }, () => {
        fetchActiveTripsCount(driverData.id);
        // Dispatch event so the orders page can also refresh
        window.dispatchEvent(new CustomEvent("tripsUpdated"));
      })
      .subscribe();

    // Realtime subscription for chat messages
    const chatChannel = supabase
      .channel("driver-chat-unread")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
      }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_id !== driverData.id || msg.sender_type !== "driver") {
          setChatUnreadCount(prev => prev + 1);
        }
      })
      .subscribe();

    // Poll for new notifications every 30 seconds
    const pollInterval = setInterval(() => {
      fetchUnreadCount(driverData.id);
      fetchNewJobsCount(driverData.id);
      fetchActiveTripsCount(driverData.id);
    }, 30000);

    // Tell Traccar app we're authenticated
    const appInterface = (window as any).appInterface;
    if (appInterface?.postMessage) {
      appInterface.postMessage('authenticated');
      setTimeout(() => {
        appInterface.postMessage('login');
      }, 500);
    }

    return () => {
      delete window.updateNotificationToken;
      window.removeEventListener("notificationsUpdated", handleNotificationUpdate);
      clearInterval(pollInterval);
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(jobsChannel);
      supabase.removeChannel(tripsChannel);
      supabase.removeChannel(chatChannel);
      if (onlineIntervalRef.current) clearInterval(onlineIntervalRef.current);
    };
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("driver_session");
    localStorage.removeItem("driver_language");
    router.push("/driver");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const allNavItems = [
  { href: "/driver-dashboard", label: "Tasks", icon: ClipboardList, module: "core" },
  { href: "/driver-dashboard/tasks", label: "Jobs", icon: Route, module: "fsm" },
  { href: "/driver-dashboard/orders", label: "Orders", icon: Package, module: "tms" },
  { href: "/driver-dashboard/forms", label: "Forms", icon: FileText, module: "forms" },
  { href: "/driver-dashboard/documents", label: "Docs", icon: FolderOpen, module: "documents" },
  { href: "/driver-dashboard/maintenance", label: "Issues", icon: Wrench, module: "maintenance" },
  ];
  const navItems = allNavItems.filter(
    (item) => item.module === "core" || isModuleEnabled(item.module)
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Welcome, {driver?.name}</p>
              {activeSession ? (
                <div className="flex items-center gap-2 mt-1">
                  <Car className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">{activeSession.vehicle?.plate_number}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={handleCheckOut}
                  >
                    Check Out
                  </Button>
                </div>
              ) : (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-xs mt-1 text-primary"
                  onClick={openCheckInDialog}
                >
                  <LogIn className="h-3 w-3 mr-1" />
                  Check in to vehicle
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Online Toggle */}
            <div className="flex items-center gap-1.5">
              <Radio className={`h-4 w-4 ${isOnline ? "text-green-500" : "text-muted-foreground"}`} />
              <Switch
                checked={isOnline}
                onCheckedChange={toggleOnline}
                disabled={togglingOnline}
                className="scale-90"
              />
            </div>
            <Link href="/driver-dashboard/notifications">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className={`h-5 w-5 ${unreadCount > 0 ? "text-red-500" : ""}`} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>

      {/* Floating Chat FAB */}
      {driver && (
        <DriverChatFab
          driverId={driver.id}
          driverName={driver.name}
          adminId={driver.admin_id}
          unreadCount={chatUnreadCount}
          onUnreadChange={setChatUnreadCount}
        />
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t z-50">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== "/driver-dashboard" && pathname.startsWith(item.href));
            const isTasksActive = item.href === "/driver-dashboard" && 
              (pathname === "/driver-dashboard" || pathname.startsWith("/driver-dashboard/inspection"));
            const active = isActive || isTasksActive;
            
            const showDocsBadge = item.href === "/driver-dashboard/documents" && expiringDocsCount > 0;
            const showJobsBadge = item.href === "/driver-dashboard/tasks" && newJobsCount > 0;
            const showTripsBadge = item.href === "/driver-dashboard/orders" && activeTripsCount > 0;
            const badgeCount = showDocsBadge ? expiringDocsCount : showJobsBadge ? newJobsCount : showTripsBadge ? activeTripsCount : 0;
            const badgeColor = showDocsBadge ? "bg-orange-500" : showJobsBadge ? "bg-red-500" : showTripsBadge ? "bg-blue-500" : "";
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors relative ${
                  active 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="relative">
                  <item.icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
                  {badgeCount > 0 && (
                    <span className={`absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full ${badgeColor} text-white text-[10px] font-bold flex items-center justify-center`}>
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Vehicle Session Prompt - checks for active sessions from previous days */}
      {driver && (
        <VehicleSessionPrompt driverId={driver.id} adminId={driver.admin_id} />
      )}

      {/* Check-in Dialog */}
      <Dialog open={showCheckInDialog} onOpenChange={setShowCheckInDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check In to Vehicle</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a vehicle" />
              </SelectTrigger>
              <SelectContent>
                {availableVehicles.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No vehicles available
                  </div>
                ) : (
                  availableVehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.plate_number} {vehicle.model && `- ${vehicle.model}`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckInDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCheckIn} 
              disabled={!selectedVehicleId || checkingIn}
            >
              {checkingIn ? "Checking in..." : "Check In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
