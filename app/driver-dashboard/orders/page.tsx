"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, Clock, MapPin, Navigation, AlertCircle, PlayCircle,
  XCircle, Truck, Phone, Camera, PenTool, ArrowLeft, Map as MapIcon, List,
  ThumbsDown, SkipForward, FileText, MessageSquare, Package,
  ChevronRight, Crosshair, Route, Receipt,
} from "lucide-react";
import dynamic from "next/dynamic";
import { TripChat } from "@/components/chat/trip-chat";
import { SignaturePad } from "@/components/driver/signature-pad";
import { PhotoCapture } from "@/components/driver/photo-capture";
import { ExpenseCaptureDialog } from "@/components/driver/expense-capture-dialog";
import { DriverDocsUploadDialog } from "@/components/driver/driver-docs-upload-dialog";

const RouteMap = dynamic(
  () => import("@/components/driver/route-map").then(m => ({ default: m.RouteMap })),
  { ssr: false, loading: () => <div className="h-[250px] bg-muted animate-pulse rounded-lg" /> }
);

// ── Types ──
interface DriverSession { id: string; name: string; pin_code: string; admin_id: string; }

interface TripStop {
  id: string;
  trip_id: string;
  order_stop_id: string | null;
  order_id: string | null;
  leg_id: string | null;
  sequence_order: number;
  stop_type: string;
  action_type_id: string | null;
  action_type_code: string | null;
  action_type_name: string | null;
  company_name: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  planned_date: string | null;
  planned_time_from: string | null;
  planned_time_to: string | null;
  notes: string | null;
  status: string;
  actual_arrival: string | null;
  actual_departure: string | null;
  auto_checkin: boolean;
  auto_checkout: boolean;
  geofence_radius: number;
  form_id: string | null;
  distance_to_km: number | null;
  duration_to_minutes: number | null;
  // From joined order_stop for contact info
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  reference_number: string | null;
  // Order reference for display
  order_reference: string | null;
}

interface DriverTrip {
  id: string;
  status: string;
  // The driver's active leg id for this trip, when v3 leg-based dispatch
  // is in use. All status transitions ("Accept Trip", "Start Route") must
  // be written to this leg row — updating trips.status is a no-op for the
  // driver UI because fetchTrips overlays the leg status back on top.
  leg_id: string | null;
  vehicle_plate: string | null;
  trailer_plate: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  route_geometry: [number, number][] | null;
  stops: TripStop[];
  // Linked orders (for display)
  orders: { id: string; reference_number: string; customer_name: string | null; cargo_description: string | null; weight_kg: number | null; pallet_count: number | null; special_instructions: string | null; }[];
}

interface FormField {
  id: string; field_type: string; label: string; placeholder: string | null;
  help_text: string | null; is_required: boolean; is_visible_to_driver: boolean;
  is_editable_by_driver: boolean; options: any; default_value: string | null; sort_order: number;
}

// ── Status configs ──
const TRIP_STATUS: Record<string, { label: string; color: string }> = {
  dispatched: { label: "New Trip", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  accepted: { label: "Accepted", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

const STOP_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-muted text-muted-foreground" },
  en_route: { label: "En Route", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  arrived: { label: "Arrived", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  in_action: { label: "Working", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  completed: { label: "Done", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  skipped: { label: "Skipped", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
};

const STOP_TYPE_ICON: Record<string, { label: string; color: string }> = {
  pickup: { label: "Pickup", color: "text-blue-500" },
  delivery: { label: "Delivery", color: "text-emerald-500" },
  customs: { label: "Customs", color: "text-amber-500" },
  transit: { label: "Transit", color: "text-violet-500" },
  rest: { label: "Rest", color: "text-cyan-500" },
  swap: { label: "Swap", color: "text-rose-500" },
};

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DriverOrdersPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [trips, setTrips] = useState<DriverTrip[]>([]);
  const [completedTrips, setCompletedTrips] = useState<DriverTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [listTab, setListTab] = useState<"active" | "completed">("active");
  const [activeTrip, setActiveTrip] = useState<DriverTrip | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "list" | "chat">("map");
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);
  // Expense capture dialog (manual + scan-and-confirm). Lives at the page
  // level so it can sit above the trip detail and survive view-mode changes.
  const [expenseOpen, setExpenseOpen] = useState(false);
  // CMR/POD upload dialog state. Lives at the page level (sibling of
  // expenseOpen) so the driver can attach documents from the trip
  // header at any time, even after every stop is completed. Acts as a
  // safety net on top of the per-stop required-form flow.
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsDefaultOrderId, setDocsDefaultOrderId] = useState<string | null>(null);
  const posRef = useRef<NodeJS.Timeout | null>(null);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formContext, setFormContext] = useState<{ formId: string; stopId: string; orderId: string | null } | null>(null);
  const [submittingForm, setSubmittingForm] = useState(false);
  // Set of trip_stop_ids that already have at least one submission for
  // their assigned form. Used to gate the "Complete" button: when a
  // stop has a `form_id` (e.g. CMR/POD upload) the driver MUST fill the
  // form before they can mark the stop done. Refreshed alongside trips.
  const [submittedStopIds, setSubmittedStopIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = localStorage.getItem("driver_session");
    if (!stored) { router.push("/driver"); return; }
    setDriver(JSON.parse(stored));
  }, [router]);

  // ── Fetch TRIPS assigned to this driver (with trip_stops) ──
  //
  // Status v3 moved dispatch + vehicle/trailer/driver assignment from the
  // trip down to the leg. trips.status now usually stays at "planned" while
  // each trip_leg moves through dispatched_to_driver → accepted_by_driver →
  // waiting_to_start → in_progress → delivered → documents_* → completed.
  // We therefore:
  //   1) find the leg(s) assigned to this driver in any active leg state,
  //   2) hydrate their parent trip rows (with stops + orders),
  //   3) overlay the leg's status / vehicle / trailer onto the trip object,
  //   4) normalize the leg status to the legacy v2 vocabulary
  //      (dispatched / accepted / in_progress / completed) so the rest of
  //      this page — UI badges, sort priority, transition buttons — keeps
  //      working without a wider rewrite.
  const fetchTrips = useCallback(async () => {
    if (!driver?.id) return;
    setLoading(true);
    const s = createClient();

    // Active leg statuses that should make a trip visible to the driver.
    const ACTIVE_LEG_STATUSES = [
      "dispatched_to_driver",
      "accepted_by_driver",
      "waiting_to_start",
      "in_progress",
      "delivered",
      "documents_pending",
      "documents_received",
      "completed",
    ];

    // 1) Legs for this driver in an active state. We pull plate numbers here
    //    because the leg now owns the vehicle/trailer assignment — the trip
    //    itself can be unassigned.
    const { data: legRows } = await s
      .from("trip_legs")
      .select(`
        id, trip_id, status,
        vehicle:vehicles(plate_number),
        trailer:trailers(plate_number)
      `)
      .eq("driver_id", driver.id)
      .in("status", ACTIVE_LEG_STATUSES);

    // Backward-compat: legacy data still puts driver_id directly on the
    // trip. Don't drop those rows just because no leg is assigned yet.
    const legTripIds = (legRows || []).map((l: any) => l.trip_id).filter(Boolean);
    const tripIdSet = new Set<string>(legTripIds);

    // Map: trip_id -> the most-advanced active leg for this driver. We pick
    // the one with the highest priority because a driver can in theory be
    // on multiple legs of the same trip; the "current" one wins.
    const LEG_PRIORITY: Record<string, number> = {
      in_progress: 0,
      waiting_to_start: 1,
      accepted_by_driver: 2,
      dispatched_to_driver: 3,
      delivered: 4,
      documents_pending: 5,
      documents_received: 6,
      completed: 7,
    };
    const legByTrip = new Map<string, any>();
    (legRows || []).forEach((l: any) => {
      const cur = legByTrip.get(l.trip_id);
      if (!cur || (LEG_PRIORITY[l.status] ?? 99) < (LEG_PRIORITY[cur.status] ?? 99)) {
        legByTrip.set(l.trip_id, l);
      }
    });

    // 2) Hydrate the trips. We OR two filters so that legacy trip-level
    //    assignment (driver on trips.driver_id) keeps showing up.
    const tripIds = Array.from(tripIdSet);
    const orFilter = tripIds.length
      ? `id.in.(${tripIds.join(",")}),driver_id.eq.${driver.id}`
      : `driver_id.eq.${driver.id}`;

    const { data: tripData } = await s
      .from("trips")
      .select(`
        id, status, driver_id, distance_km, duration_minutes, route_geometry,
        vehicle:vehicles(plate_number),
        trailer:trailers(plate_number),
        trip_stops(
          id, trip_id, order_stop_id, order_id, leg_id,
          sequence_order, stop_type, action_type_id,
          company_name, address, city, country, lat, lng,
          planned_date, planned_time_from, planned_time_to, notes,
          status, actual_arrival, actual_departure,
          auto_checkin, auto_checkout, geofence_radius,
          form_id, distance_to_km, duration_to_minutes
        ),
        trip_orders(
          order:orders(
            id, reference_number, status, cargo_description,
            weight_kg, pallet_count, special_instructions,
            customer:business_partners!orders_customer_id_fkey(name)
          )
        )
      `)
      .or(orFilter)
      .order("created_at", { ascending: false });

    if (!tripData) { setLoading(false); return; }

    // Normalize the new leg status vocabulary down to the legacy v2 values
    // the rest of this page consumes. Map is intentionally lossy: the UI
    // does not yet distinguish e.g. "delivered" vs "documents_received".
    const normalizeLegStatus = (legStatus: string | null | undefined): string => {
      switch (legStatus) {
        case "dispatched_to_driver": return "dispatched";
        case "accepted_by_driver":
        case "waiting_to_start":     return "accepted";
        case "in_progress":          return "in_progress";
        case "delivered":
        case "documents_pending":
        case "documents_received":
        case "completed":            return "completed";
        default:                     return legStatus || "dispatched";
      }
    };

    // Load stop action types for display names
    const { data: actionTypes } = await s.from("stop_action_types").select("id, code, name").eq("is_active", true);
    const actionMap = new Map((actionTypes || []).map(a => [a.id, a]));

    // Also fetch contact info from order_stops for each trip_stop
    const allOrderStopIds = (tripData || []).flatMap(t =>
      (t.trip_stops || []).filter((ts: any) => ts.order_stop_id).map((ts: any) => ts.order_stop_id)
    );
    const { data: orderStopsData } = allOrderStopIds.length > 0
      ? await s.from("order_stops").select("id, contact_name, contact_phone, contact_email, reference_number").in("id", allOrderStopIds)
      : { data: [] };
    const orderStopMap = new Map((orderStopsData || []).map(os => [os.id, os]));

    // Map to DriverTrip
    const mapped: DriverTrip[] = tripData.map((t: any) => {
      // Pick the leg assignment for this driver, if any. When present it
      // wins over trip-level fields because v3 dispatch lives on the leg.
      const leg = legByTrip.get(t.id);
      const effectiveStatus = leg
        ? normalizeLegStatus(leg.status)
        : t.status;
      const effectiveVehiclePlate =
        leg?.vehicle?.plate_number ?? t.vehicle?.plate_number ?? null;
      const effectiveTrailerPlate =
        leg?.trailer?.plate_number ?? t.trailer?.plate_number ?? null;

      const orderRefs = new Map<string, string>();
      (t.trip_orders || []).forEach((to: any) => {
        if (to.order) orderRefs.set(to.order.id, to.order.reference_number);
      });

      const stops: TripStop[] = ((t.trip_stops || []) as any[])
        .sort((a, b) => a.sequence_order - b.sequence_order)
        .map(ts => {
          const actionType = ts.action_type_id ? actionMap.get(ts.action_type_id) : null;
          const orderStop = ts.order_stop_id ? orderStopMap.get(ts.order_stop_id) : null;
          return {
            ...ts,
            action_type_code: actionType?.code || null,
            action_type_name: actionType?.name || null,
            contact_name: orderStop?.contact_name || null,
            contact_phone: orderStop?.contact_phone || null,
            contact_email: orderStop?.contact_email || null,
            reference_number: orderStop?.reference_number || null,
            order_reference: ts.order_id ? (orderRefs.get(ts.order_id) || null) : null,
          };
        });

      return {
        id: t.id,
        status: effectiveStatus,
        leg_id: leg?.id ?? null,
        vehicle_plate: effectiveVehiclePlate,
        trailer_plate: effectiveTrailerPlate,
        distance_km: t.distance_km,
        duration_minutes: t.duration_minutes,
        route_geometry: t.route_geometry || null,
        stops,
        orders: (t.trip_orders || []).map((to: any) => ({
          id: to.order?.id,
          reference_number: to.order?.reference_number,
          customer_name: to.order?.customer?.name || null,
          cargo_description: to.order?.cargo_description,
          weight_kg: to.order?.weight_kg,
          pallet_count: to.order?.pallet_count,
          special_instructions: to.order?.special_instructions,
        })).filter((o: any) => o.id),
      };
    });

    const active: DriverTrip[] = [];
    const done: DriverTrip[] = [];
    mapped.forEach(t => {
      if (["completed", "cancelled"].includes(t.status)) done.push(t);
      else active.push(t);
    });

    // Sort: in_progress first, then accepted, then dispatched
    const priority: Record<string, number> = { in_progress: 0, accepted: 1, dispatched: 2 };
    active.sort((a, b) => (priority[a.status] ?? 4) - (priority[b.status] ?? 4));
    setTrips(active);
    setCompletedTrips(done);
    setLoading(false);
  }, [driver?.id]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  // Listen for realtime trip updates from layout
  useEffect(() => {
    const handler = () => { fetchTrips(); };
    window.addEventListener("tripsUpdated", handler);
    return () => window.removeEventListener("tripsUpdated", handler);
  }, [fetchTrips]);

  // ── Sync activeTrip when trips list refreshes ──
  useEffect(() => {
    if (!activeTrip) return;
    const fresh = [...trips, ...completedTrips].find(t => t.id === activeTrip.id);
    if (fresh && fresh !== activeTrip) setActiveTrip(fresh);  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, completedTrips]);

  // Track which stops already have a submitted form so the UI can gate
  // "Complete" and visually mark the form as done. We only fetch the
  // ids relevant to the currently visible trips to keep the payload
  // small even on busy days.
  useEffect(() => {
    const stopIds = [...trips, ...completedTrips]
      .flatMap(t => t.stops.map(s => s.id))
      .filter(Boolean);
    if (stopIds.length === 0) {
      setSubmittedStopIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const s = createClient();
      const { data } = await s
        .from("trip_stop_form_submissions")
        .select("trip_stop_id")
        .in("trip_stop_id", stopIds);
      if (cancelled) return;
      setSubmittedStopIds(new Set(((data as any[]) || []).map(r => r.trip_stop_id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [trips, completedTrips]);

  // ── GPS tracking ──
  useEffect(() => {
    const poll = () => {
      try {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(p => {
            setDriverLat(p.coords.latitude); setDriverLng(p.coords.longitude);
          }, () => {}, { enableHighAccuracy: true });
        }
      } catch {}
    };
    poll();
    posRef.current = setInterval(poll, 15000);
    return () => { if (posRef.current) clearInterval(posRef.current); };
  }, []);

  // ── Trip status transitions ──
  const updateTripStatus = async (tripId: string, newStatus: string) => {
    const s = createClient();

    // V3 leg-based dispatch: the driver-facing status lives on the
    // driver's trip_leg, not the trip. fetchTrips overlays the leg
    // status onto the trip object, so writing to trips.status alone is
    // a no-op for the UI (the next refetch reverts it to the leg
    // status). Resolve the leg id and translate the legacy v2 status
    // value into the v3 leg vocabulary before writing.
    const trip = trips.find(t => t.id === tripId) || (activeTrip?.id === tripId ? activeTrip : null);
    const legId = trip?.leg_id ?? null;

    const legStatusMap: Record<string, string> = {
      accepted: "accepted_by_driver",
      in_progress: "in_progress",
      completed: "completed",
      cancelled: "cancelled",
    };

    if (legId) {
      const legStatus = legStatusMap[newStatus] ?? newStatus;
      const { error } = await s.from("trip_legs").update({ status: legStatus }).eq("id", legId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    } else {
      // Legacy v2 fallback — trip-level driver assignment with no leg.
      const { error } = await s.from("trips").update({ status: newStatus }).eq("id", tripId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }

    // Order status is auto-synced via DB trigger (sync_order_status_on_trip_change)

    if (activeTrip?.id === tripId) {
      setActiveTrip(prev => prev ? { ...prev, status: newStatus } : prev);
    }
    toast({ title: "Trip Updated", description: `Trip moved to ${newStatus.replace(/_/g, " ")}` });
    fetchTrips();
  };

  // ── Trip stop status transitions ──
  const updateTripStopStatus = async (stopId: string, newStatus: string) => {
    const s = createClient();
    const now = new Date().toISOString();
    const updates: Record<string, any> = { status: newStatus };
    if (newStatus === "arrived") updates.actual_arrival = now;
    if (newStatus === "completed") updates.actual_departure = now;
    const { error } = await s.from("trip_stops").update(updates).eq("id", stopId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

    // Find the stop to sync order_stop
    const stop = activeTrip?.stops.find(st => st.id === stopId);
    if (stop?.order_stop_id) {
      // Sync order_stop status: only pending -> completed (order_stops are simple)
      if (newStatus === "completed") {
        await s.from("order_stops").update({ status: "completed", actual_departure: now }).eq("id", stop.order_stop_id);
      } else if (newStatus === "arrived") {
        await s.from("order_stops").update({ actual_arrival: now }).eq("id", stop.order_stop_id);
      }
    }

    // Log activity for the order
    if (stop?.order_id) {
      await s.from("order_activity_log").insert({
        order_id: stop.order_id,
        action: "trip_stop_status_change",
        details: { trip_stop_id: stopId, new_status: newStatus, trip_id: activeTrip?.id, driver_name: driver?.name },
        performed_by_type: "driver",
        performed_by_id: driver?.id,
      });
    }

    // Update activeTrip immediately
    setActiveTrip(prev => {
      if (!prev) return prev;
      const newStops = prev.stops.map(st => st.id === stopId ? { ...st, ...updates } : st);

      // If completing a stop, auto-advance next pending to en_route
      if (newStatus === "completed") {
        const nextPending = newStops.find(st => st.status === "pending");
        if (nextPending) {
          nextPending.status = "en_route";
          s.from("trip_stops").update({ status: "en_route" }).eq("id", nextPending.id).then(() => {});
        }
      }

      return { ...prev, stops: newStops };
    });

    // Check if all stops done -> auto-complete trip
    if (newStatus === "completed" && activeTrip) {
      const allDone = activeTrip.stops.every(st =>
        st.id === stopId ? true : ["completed", "skipped"].includes(st.status)
      );
      if (allDone) {
        // Mark the leg as completed in v3 mode (trips.status stays at
        // 'planned'). The leg-status trigger on the DB side propagates
        // the completion down to trip-level / order-level wherever it
        // is supposed to.
        if (activeTrip.leg_id) {
          await s.from("trip_legs").update({ status: "completed" }).eq("id", activeTrip.leg_id);
        } else {
          await s.from("trips").update({ status: "completed" }).eq("id", activeTrip.id);
        }
        // Auto-derive order delivered status
        for (const ord of activeTrip.orders) {
          // Check if ALL order_stops for this order are completed
          const { data: pendingStops } = await s.from("order_stops")
            .select("id").eq("order_id", ord.id)
            .neq("status", "completed").neq("status", "cancelled");
          if (!pendingStops?.length) {
            await s.from("orders").update({ status: "delivered" }).eq("id", ord.id);
            await s.from("order_status_history").insert({ order_id: ord.id, from_status: "in_transit", to_status: "delivered", changed_by_type: "system", notes: "All stops completed" });
          }
        }
        setActiveTrip(prev => prev ? { ...prev, status: "completed" } : prev);
        toast({ title: "Trip Completed", description: "All stops done!" });
      }
    }

    toast({ title: "Stop Updated" });
    fetchTrips();
  };

  // ── Form handling ──
  const openStopForm = async (formId: string, stopId: string, orderId: string | null) => {
    const s = createClient();
    const { data } = await s.from("task_form_fields").select("*").eq("form_id", formId).eq("is_visible_to_driver", true).order("sort_order");
    if (!data?.length) { toast({ title: "No Fields", description: "This form has no visible fields.", variant: "destructive" }); return; }
    const vals: Record<string, any> = {};
    data.forEach(f => { vals[f.id] = f.default_value || ""; });
    setFormFields(data);
    setFormValues(vals);
    setFormContext({ formId, stopId, orderId });
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!formContext || !activeTrip || !driver) return;
    setSubmittingForm(true);
    const s = createClient();
    try {
      // Persist into the new TMS-side submission table created in
      // migration 171. The legacy `order_stop_form_submissions` table
      // never existed in the schema; we write against the actual
      // `trip_stop_form_submissions` table so the dispatcher panels
      // (and the email-to-carrier archive) can read it back. The
      // `trip_id` column lets us index by trip without an extra join.
      await s.from("trip_stop_form_submissions").insert({
        trip_stop_id: formContext.stopId,
        trip_id: activeTrip.id,
        form_id: formContext.formId,
        submitted_by: driver.id,
        submitted_by_type: "driver",
        data: formValues,
        submitted_at: new Date().toISOString(),
      });
      toast({ title: "Form Submitted" });
      // Optimistically mark this stop as submitted so the Complete
      // button immediately unlocks without waiting for the next
      // trips refresh.
      setSubmittedStopIds(prev => {
        const next = new Set(prev);
        next.add(formContext.stopId);
        return next;
      });
      setFormOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSubmittingForm(false); }
  };

  // ── Next action for a trip ──
  const getNextAction = (trip: DriverTrip) => {
    if (trip.status === "dispatched") {
      return {
        label: "Accept Trip", icon: <CheckCircle className="h-4 w-4 mr-2" />,
        action: () => updateTripStatus(trip.id, "accepted"),
      };
    }
    if (trip.status === "accepted") {
      return {
        label: "Start Route", icon: <PlayCircle className="h-4 w-4 mr-2" />,
        action: async () => {
          const s = createClient();
          // Mirror updateTripStatus: write to the leg in v3 mode, fall
          // back to trip-level for legacy data. Without this, hitting
          // "Start Route" only flips trips.status (which the UI ignores)
          // and the page still shows "Accept Trip / Start Route" buttons.
          if (trip.leg_id) {
            await s.from("trip_legs").update({ status: "in_progress" }).eq("id", trip.leg_id);
          } else {
            await s.from("trips").update({ status: "in_progress" }).eq("id", trip.id);
          }
          // Set first stop to en_route
          const firstStop = trip.stops.find(st => st.status === "pending");
          if (firstStop) await s.from("trip_stops").update({ status: "en_route" }).eq("id", firstStop.id);
          // Auto-derive order statuses
          for (const ord of trip.orders) {
            await s.from("orders").update({ status: "in_transit" }).eq("id", ord.id).in("status", ["accepted", "dispatched"]);
            await s.from("order_status_history").insert({ order_id: ord.id, from_status: "accepted", to_status: "in_transit", changed_by_type: "driver", changed_by: driver?.id });
          }
          setActiveTrip(prev => {
            if (!prev || prev.id !== trip.id) return prev;
            return {
              ...prev, status: "in_progress",
              stops: prev.stops.map((st, i) => i === 0 && st.status === "pending" ? { ...st, status: "en_route" } : st),
            };
          });
          toast({ title: "Route Started", description: "Navigating to first stop" });
          fetchTrips();
        },
      };
    }
    return null;
  };

  // ── Current stop ──
  const getCurrentStop = (trip: DriverTrip) =>
    trip.stops.find(s => !["completed", "skipped"].includes(s.status));

  // ── Auto-checkin via GPS geofence ──
  useEffect(() => {
    if (!activeTrip || activeTrip.status !== "in_progress" || driverLat == null || driverLng == null) return;
    const currentStop = activeTrip.stops.find(s => s.status === "en_route" && s.auto_checkin);
    if (!currentStop || !currentStop.lat || !currentStop.lng) return;
    const radius = currentStop.geofence_radius || 200;
    const dist = distanceMeters(driverLat, driverLng, currentStop.lat, currentStop.lng);
    if (dist <= radius) {
      updateTripStopStatus(currentStop.id, "arrived");
      toast({ title: "Auto Check-in", description: `Arrived at ${currentStop.company_name || currentStop.city || "stop"}` });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLat, driverLng, activeTrip]);

  // ── ETA estimation ──
  const estimateEta = (stop: TripStop) => {
    if (!driverLat || !driverLng || !stop.lat || !stop.lng) return null;
    const dist = distanceMeters(driverLat, driverLng, stop.lat, stop.lng);
    const avgSpeedKmh = 65;
    const mins = Math.round((dist / 1000) / avgSpeedKmh * 60);
    if (mins < 1) return "< 1 min";
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    return `${h}h ${mins % 60}m`;
  };

  // ── Get action label for in_action status ──
  const getActionLabel = (stop: TripStop) => {
    if (stop.action_type_name) return stop.action_type_name;
    if (stop.stop_type === "pickup") return "Loading";
    if (stop.stop_type === "delivery") return "Unloading";
    return "Working";
  };

  // ── Render trip list ──
  if (!activeTrip) {
    return (
      <div className="p-4 space-y-4 pb-24">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">My Trips</h1>
          <Button variant="ghost" size="sm" onClick={fetchTrips} disabled={loading}>
            {loading ? <Clock className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setListTab("active")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${listTab === "active" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            Active ({trips.length})
          </button>
          <button onClick={() => setListTab("completed")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${listTab === "completed" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            Completed ({completedTrips.length})
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {(listTab === "active" ? trips : completedTrips).map(trip => {
              const currentStop = getCurrentStop(trip);
              const eta = currentStop ? estimateEta(currentStop) : null;
              const completedStops = trip.stops.filter(s => s.status === "completed").length;
              const totalStops = trip.stops.length;
              const progress = totalStops > 0 ? Math.round(completedStops / totalStops * 100) : 0;
              const sc = TRIP_STATUS[trip.status] || TRIP_STATUS.dispatched;
              const firstStop = trip.stops[0];
              const lastStop = trip.stops[trip.stops.length - 1];

              return (
                <Card key={trip.id} className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setActiveTrip(trip); setViewMode("map"); }}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge className={`${sc.color} text-[9px] border-0`}>{sc.label}</Badge>
                          {trip.vehicle_plate && <span className="text-[10px] text-muted-foreground"><Truck className="h-3 w-3 inline mr-0.5" />{trip.vehicle_plate}</span>}
                        </div>
                        {/* Order references */}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {trip.orders.map(o => (
                            <span key={o.id} className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">{o.reference_number}</span>
                          ))}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>

                    {/* Route summary */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                      <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
                      <span className="truncate">{firstStop?.city || "?"}</span>
                      {totalStops > 2 && <span className="text-muted-foreground/50">({totalStops - 2} stops)</span>}
                      <span className="text-muted-foreground/50">{"-->"}</span>
                      <MapPin className="h-3 w-3 text-emerald-500 shrink-0" />
                      <span className="truncate">{lastStop?.city || "?"}</span>
                    </div>

                    {/* Next stop + progress */}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1 min-w-0">
                        {currentStop && (
                          <>
                            <span className="font-semibold">Next:</span>
                            <span className="truncate">{currentStop.company_name || currentStop.city || "Stop"}</span>
                            {currentStop.order_reference && (
                              <span className="text-primary/60 font-mono">({currentStop.order_reference})</span>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {eta && <span className="text-amber-500 font-semibold">ETA {eta}</span>}
                        <span className="font-semibold">{completedStops}/{totalStops}</span>
                      </div>
                    </div>

                    <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {(listTab === "active" ? trips : completedTrips).length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Route className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No {listTab} trips</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Active trip detail ──
  const currentStop = getCurrentStop(activeTrip);
  const nextAction = getNextAction(activeTrip);
  const tripSc = TRIP_STATUS[activeTrip.status] || TRIP_STATUS.dispatched;
  const completedStops = activeTrip.stops.filter(s => s.status === "completed").length;
  const totalStops = activeTrip.stops.length;

  return (
    <div className="flex flex-col h-full pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setActiveTrip(null); fetchTrips(); }}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${tripSc.color} text-[9px] border-0`}>{tripSc.label}</Badge>
            {activeTrip.vehicle_plate && <span className="text-[10px] text-muted-foreground"><Truck className="h-3 w-3 inline mr-0.5" />{activeTrip.vehicle_plate}</span>}
            {activeTrip.distance_km && <span className="text-[10px] text-muted-foreground">{Math.round(activeTrip.distance_km)} km</span>}
          </div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {activeTrip.orders.map(o => (
              <span key={o.id} className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">{o.reference_number}{o.customer_name ? ` - ${o.customer_name}` : ""}</span>
            ))}
          </div>
        </div>
        {/* Trip-level action buttons. We keep them visually grouped so
            the driver always has the same chrome regardless of stop
            status: scan an expense, or attach a CMR/POD scan to one of
            the trip's orders. The CMR/POD button is the safety net for
            when the driver completes a stop without filling the
            attached form. */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => {
              setDocsDefaultOrderId(null);
              setDocsOpen(true);
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="text-xs hidden sm:inline">CMR / POD</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setExpenseOpen(true)}
          >
            <Receipt className="h-3.5 w-3.5" />
            <span className="text-xs hidden sm:inline">Expense</span>
          </Button>
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b shrink-0">
        {(["map", "list", "chat"] as const).map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
            {mode === "map" && <MapIcon className="h-3 w-3" />}
            {mode === "list" && <List className="h-3 w-3" />}
            {mode === "chat" && <MessageSquare className="h-3 w-3" />}
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Map View */}
        {viewMode === "map" && (
          <div className="space-y-3 p-4">
            <RouteMap
              stops={activeTrip.stops.filter(s => s.lat && s.lng).map((s, i) => ({
                id: s.id,
                sequence_order: s.sequence_order,
                name: s.company_name || s.city || `Stop ${i + 1}`,
                lat: s.lat!, lng: s.lng!,
                status: s.status,
              }))}
              initialRouteGeometry={activeTrip.route_geometry}
              driverLat={driverLat}
              driverLng={driverLng}
              hideBottomPanels
              skipInitialRouteFetch
            />

            {/* Current Stop Card */}
            {currentStop && (
              <Card className="overflow-hidden border-primary/30">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={`${(STOP_TYPE_ICON[currentStop.stop_type] || STOP_TYPE_ICON.delivery).color} bg-transparent text-[9px]`}>
                      {(STOP_TYPE_ICON[currentStop.stop_type] || STOP_TYPE_ICON.delivery).label}
                    </Badge>
                    <span className="text-xs font-semibold">{currentStop.company_name || currentStop.city || "Stop"}</span>
                    {currentStop.order_reference && (
                      <span className="text-[9px] text-primary/60 font-mono bg-primary/5 px-1 rounded">{currentStop.order_reference}</span>
                    )}
                    {estimateEta(currentStop) && (
                      <span className="ml-auto text-[10px] text-amber-500 font-bold flex items-center gap-1">
                        <Clock className="h-3 w-3" />ETA {estimateEta(currentStop)}
                      </span>
                    )}
                  </div>

                  {currentStop.address && <p className="text-xs text-muted-foreground mb-1">{currentStop.address}, {currentStop.city}</p>}

                  {currentStop.planned_time_from && (
                    <p className="text-[10px] text-muted-foreground mb-2">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {currentStop.planned_date} {currentStop.planned_time_from}{currentStop.planned_time_to ? ` - ${currentStop.planned_time_to}` : ""}
                    </p>
                  )}

                  {currentStop.contact_name && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                      <span>{currentStop.contact_name}</span>
                      {currentStop.contact_phone && (
                        <a href={`tel:${currentStop.contact_phone}`} className="flex items-center gap-1 text-primary">
                          <Phone className="h-3 w-3" />{currentStop.contact_phone}
                        </a>
                      )}
                    </div>
                  )}

                  {currentStop.notes && (
                    <p className="text-[10px] text-muted-foreground mb-2 bg-muted/50 p-1.5 rounded">{currentStop.notes}</p>
                  )}

                  {/* Stop actions: en_route -> arrived -> in_action -> completed */}
                  <div className="flex gap-2 flex-wrap">
                    {currentStop.status === "en_route" && (
                      <>
                        <Button size="sm" className="flex-1 h-9" onClick={() => updateTripStopStatus(currentStop.id, "arrived")}>
                          <MapPin className="h-3.5 w-3.5 mr-1.5" /> I Arrived
                        </Button>
                        {currentStop.lat && currentStop.lng && (
                          <Button size="sm" variant="outline" className="h-9" onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${currentStop.lat},${currentStop.lng}`, "_blank")}>
                            <Navigation className="h-3.5 w-3.5 mr-1" /> Navigate
                          </Button>
                        )}
                      </>
                    )}
                    {currentStop.status === "arrived" && (
                      <Button size="sm" className="flex-1 h-9" onClick={() => updateTripStopStatus(currentStop.id, "in_action")}>
                        <PlayCircle className="h-3.5 w-3.5 mr-1.5" /> Start {getActionLabel(currentStop)}
                      </Button>
                    )}
                    {currentStop.status === "in_action" && (() => {
                      // CMR/POD gating: when a stop has a form attached,
                      // the driver must submit it before they can mark
                      // the stop completed. The form button itself
                      // changes to a primary "Upload CMR/POD" call to
                      // action when it's still required.
                      const formRequired = !!currentStop.form_id;
                      const formDone = formRequired && submittedStopIds.has(currentStop.id);
                      const completeBlocked = formRequired && !formDone;
                      return (
                        <>
                          {currentStop.form_id && (
                            <Button
                              size="sm"
                              variant={formDone ? "outline" : "default"}
                              className="h-9 flex-1"
                              onClick={() => openStopForm(currentStop.form_id!, currentStop.id, currentStop.order_id)}
                            >
                              <FileText className="h-3.5 w-3.5 mr-1.5" />
                              {formDone ? "Form submitted" : "Upload CMR/POD"}
                            </Button>
                          )}
                          {/* Quick CMR/POD photo upload, available even
                              when no form is configured. Pre-fills the
                              dialog with the stop's order so the driver
                              just opens the camera and shoots. This is
                              the primary "happy path" for paper CMR. */}
                          {!currentStop.form_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 flex-1"
                              onClick={() => {
                                setDocsDefaultOrderId(currentStop.order_id || null);
                                setDocsOpen(true);
                              }}
                            >
                              <FileText className="h-3.5 w-3.5 mr-1.5" />
                              CMR / POD
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="flex-1 h-9"
                            disabled={completeBlocked}
                            title={completeBlocked ? "Submit the required form first" : undefined}
                            onClick={() => updateTripStopStatus(currentStop.id, "completed")}
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Complete {getActionLabel(currentStop)}
                          </Button>
                        </>
                      );
                    })()}
                  </div>
                  {currentStop.status === "en_route" && currentStop.auto_checkin && (
                    <p className="text-[9px] text-muted-foreground mt-1.5 flex items-center gap-1">
                      <Crosshair className="h-3 w-3" /> Auto check-in enabled ({currentStop.geofence_radius}m radius)
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Special instructions from all orders */}
            {activeTrip.orders.filter(o => o.special_instructions).map(o => (
              <Card key={o.id}>
                <CardContent className="p-3">
                  <p className="text-xs font-semibold mb-1">Instructions <span className="font-mono text-muted-foreground">({o.reference_number})</span></p>
                  <p className="text-xs text-muted-foreground">{o.special_instructions}</p>
                </CardContent>
              </Card>
            ))}

            {/* Main action */}
            {nextAction && (
              <Button className="w-full h-12 text-sm font-bold" onClick={nextAction.action}>
                {nextAction.icon}{nextAction.label}
              </Button>
            )}
          </div>
        )}

        {/* List View -- Stop Timeline */}
        {viewMode === "list" && (
          <div className="space-y-2 p-4">
            {/* Cargo summary from all orders */}
            <Card>
              <CardContent className="p-3 text-xs space-y-1.5">
                {activeTrip.orders.map(o => (
                  <div key={o.id} className="flex items-center gap-2">
                    <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded shrink-0">{o.reference_number}</span>
                    <span className="text-muted-foreground truncate">
                      {o.cargo_description || ""}
                      {o.weight_kg ? ` | ${o.weight_kg}kg` : ""}
                      {o.pallet_count ? ` | ${o.pallet_count}p` : ""}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Timeline */}
            <div className="space-y-0">
              {activeTrip.stops.map((stop, idx) => {
                const stCfg = STOP_STATUS[stop.status] || STOP_STATUS.pending;
                const tCfg = STOP_TYPE_ICON[stop.stop_type] || STOP_TYPE_ICON.delivery;
                const isActive = stop.id === currentStop?.id;
                const eta = estimateEta(stop);

                return (
                  <div key={stop.id} className={`relative pl-7 pb-4 ${isActive ? "bg-primary/5 -mx-4 px-4 pl-11 py-3 rounded-lg" : ""}`}>
                    {idx < activeTrip.stops.length - 1 && (
                      <div className={`absolute left-3 top-6 w-px h-[calc(100%-12px)] ${stop.status === "completed" ? "bg-green-500" : "bg-border"}`} />
                    )}
                    <div className={`absolute left-1.5 top-1 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      stop.status === "completed" ? "bg-green-500 border-green-500" :
                      stop.status === "en_route" ? "bg-blue-500 border-blue-500 animate-pulse" :
                      (stop.status === "arrived" || stop.status === "in_action") ? "bg-amber-500 border-amber-500" :
                      "bg-background border-border"
                    }`}>
                      {stop.status === "completed" && <CheckCircle className="h-2.5 w-2.5 text-white" />}
                      {stop.status === "en_route" && <Navigation className="h-2 w-2 text-white" />}
                    </div>

                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <span className={`text-[10px] font-bold ${tCfg.color}`}>
                            {stop.action_type_name || tCfg.label}
                          </span>
                          <Badge className={`${stCfg.color} text-[8px] px-1.5 border-0`}>{stCfg.label}</Badge>
                          {stop.order_reference && (
                            <span className="text-[8px] font-mono text-primary/60 bg-primary/5 px-1 rounded">{stop.order_reference}</span>
                          )}
                        </div>
                        <p className="text-xs font-medium">{stop.company_name || stop.city || `Stop ${idx + 1}`}</p>
                        {stop.address && <p className="text-[10px] text-muted-foreground">{stop.address}</p>}
                        {stop.planned_time_from && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {stop.planned_date} {stop.planned_time_from}{stop.planned_time_to ? `-${stop.planned_time_to}` : ""}
                          </p>
                        )}
                        {stop.distance_to_km && stop.status !== "completed" && (
                          <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                            {Math.round(stop.distance_to_km)} km{stop.duration_to_minutes ? ` | ~${Math.round(stop.duration_to_minutes)} min` : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {eta && !["completed", "skipped"].includes(stop.status) && (
                          <span className="text-[9px] text-amber-500 font-semibold">{eta}</span>
                        )}
                        {/* Inline stop actions */}
                        {stop.status === "en_route" && isActive && (
                          <Button size="sm" className="h-7 text-[10px]" onClick={() => updateTripStopStatus(stop.id, "arrived")}>
                            Arrived
                          </Button>
                        )}
                        {stop.status === "arrived" && (
                          <Button size="sm" className="h-7 text-[10px]" onClick={() => updateTripStopStatus(stop.id, "in_action")}>
                            Start
                          </Button>
                        )}
                        {stop.status === "in_action" && (() => {
                          const formRequired = !!stop.form_id;
                          const formDone = formRequired && submittedStopIds.has(stop.id);
                          const completeBlocked = formRequired && !formDone;
                          return (
                            <div className="flex gap-1">
                              {stop.form_id && (
                                <Button
                                  size="sm"
                                  variant={formDone ? "outline" : "default"}
                                  className="h-7 text-[10px]"
                                  onClick={() => openStopForm(stop.form_id!, stop.id, stop.order_id)}
                                >
                                  <FileText className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                className="h-7 text-[10px]"
                                disabled={completeBlocked}
                                title={completeBlocked ? "Submit the required form first" : undefined}
                                onClick={() => updateTripStopStatus(stop.id, "completed")}
                              >
                                Done
                              </Button>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {stop.contact_phone && isActive && (
                      <a href={`tel:${stop.contact_phone}`} className="inline-flex items-center gap-1 text-[10px] text-primary mt-1">
                        <Phone className="h-3 w-3" />{stop.contact_name || stop.contact_phone}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="text-center text-xs text-muted-foreground">
              {completedStops} / {totalStops} stops completed
            </div>
            {nextAction && (
              <Button className="w-full h-10 text-sm font-bold" onClick={nextAction.action}>
                {nextAction.icon}{nextAction.label}
              </Button>
            )}
          </div>
        )}

        {/* Chat View -- uses trip-level conversation so driver can communicate with dispatcher */}
        {viewMode === "chat" && driver && (
          <div className="h-full">
            <TripChat
              tripId={activeTrip.id}
              tripReference={`Trip ${activeTrip.id.slice(0, 8)}`}
              currentUserId={driver.id}
              currentUserType="driver"
              currentUserName={driver.name}
            />
          </div>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete Form</DialogTitle>
            <DialogDescription>Fill in the required fields for this stop.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {formFields.map(field => (
              <div key={field.id} className="space-y-1.5">
                <Label className="text-sm">{field.label}{field.is_required && <span className="text-destructive ml-0.5">*</span>}</Label>
                {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
                {field.field_type === "text" && (
                  <Input value={formValues[field.id] || ""} onChange={e => setFormValues(p => ({ ...p, [field.id]: e.target.value }))} placeholder={field.placeholder || ""} disabled={!field.is_editable_by_driver} />
                )}
                {field.field_type === "textarea" && (
                  <Textarea value={formValues[field.id] || ""} onChange={e => setFormValues(p => ({ ...p, [field.id]: e.target.value }))} placeholder={field.placeholder || ""} disabled={!field.is_editable_by_driver} rows={3} />
                )}
                {field.field_type === "number" && (
                  <Input type="number" value={formValues[field.id] || ""} onChange={e => setFormValues(p => ({ ...p, [field.id]: e.target.value }))} placeholder={field.placeholder || ""} disabled={!field.is_editable_by_driver} />
                )}
                {field.field_type === "select" && (
                  <Select value={formValues[field.id] || ""} onValueChange={v => setFormValues(p => ({ ...p, [field.id]: v }))} disabled={!field.is_editable_by_driver}>
                    <SelectTrigger><SelectValue placeholder={field.placeholder || "Select..."} /></SelectTrigger>
                    <SelectContent>
                      {(field.options || []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {field.field_type === "checkbox" && (
                  <div className="flex items-center gap-2">
                    <Switch checked={formValues[field.id] === "true" || formValues[field.id] === true} onCheckedChange={v => setFormValues(p => ({ ...p, [field.id]: v }))} disabled={!field.is_editable_by_driver} />
                    <span className="text-sm text-muted-foreground">{field.placeholder || ""}</span>
                  </div>
                )}
                {field.field_type === "signature" && (
                  <SignaturePad onChange={(data: string) => setFormValues(p => ({ ...p, [field.id]: data }))} />
                )}
                {field.field_type === "photo" && (
                  <PhotoCapture onCapture={(data: string) => setFormValues(p => ({ ...p, [field.id]: data }))} />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submitForm} disabled={submittingForm}>
              {submittingForm ? <Clock className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expense capture dialog — only mounted when a trip is active so the
          tripId / driverId props are guaranteed to be defined. */}
      {driver && (
        <ExpenseCaptureDialog
          open={expenseOpen}
          onOpenChange={setExpenseOpen}
          tripId={activeTrip.id}
          driverId={driver.id}
        />
      )}

      {/* Driver-side CMR/POD upload dialog. We feed it the trip's
          linked orders so the driver picks one (auto-selected when the
          trip carries a single order) and uploads photos / a PDF scan
          straight into `order_documents`. The same files surface in
          the admin order detail panel without any reader-side change. */}
      {driver && (
        <DriverDocsUploadDialog
          open={docsOpen}
          onOpenChange={setDocsOpen}
          orders={activeTrip.orders.map(o => ({
            id: o.id,
            reference_number: o.reference_number,
            customer_name: o.customer_name,
            // Drivers belong to a single admin tenant, so all orders
            // they touch share that admin_id. Passing it explicitly
            // saves a DB round-trip in the dialog.
            admin_id: driver.admin_id,
          }))}
          defaultOrderId={docsDefaultOrderId}
          driverId={driver.id}
          driverName={driver.name}
        />
      )}
    </div>
  );
}
