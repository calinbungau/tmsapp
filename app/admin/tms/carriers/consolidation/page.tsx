"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Building2, Calendar, ArrowRight, MapPin, FileText,
  Sparkles, Search, CheckCircle2, Loader2, Layers,
  ListChecks, Route, Ban,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Country flag ──────────────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  hungary: "HU", germany: "DE", romania: "RO", poland: "PL", czechia: "CZ",
  "czech republic": "CZ", slovakia: "SK", austria: "AT", france: "FR",
  italy: "IT", spain: "ES", netherlands: "NL", belgium: "BE", croatia: "HR",
  slovenia: "SI", serbia: "RS", bulgaria: "BG", greece: "GR", turkey: "TR",
  ukraine: "UA", moldova: "MD", "united kingdom": "GB", uk: "GB",
  ireland: "IE", portugal: "PT", sweden: "SE", norway: "NO", denmark: "DK",
  finland: "FI", switzerland: "CH", luxembourg: "LU",
};
function getCountryCode(c: string | null | undefined) {
  if (!c) return "";
  const t = c.trim();
  const u = t.toUpperCase();
  if (u.length === 2 && /^[A-Z]{2}$/.test(u)) return u;
  return COUNTRY_CODES[t.toLowerCase()] || "";
}
function CountryFlag({ country, className = "w-3.5 h-2.5" }: { country: string | null | undefined; className?: string }) {
  const code = getCountryCode(country);
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w20/${code.toLowerCase()}.png`}
      alt={country || ""}
      className={`${className} rounded-[2px] object-cover shrink-0`}
      crossOrigin="anonymous"
    />
  );
}

// ─── Types ─────────────────────────────────────────────────
interface Carrier {
  id: string;
  name: string;
}

interface StopRef {
  id: string;
  sequence_order: number | null;
  stop_type: string | null;
  company_name: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  planned_date: string | null;
  planned_time_from: string | null;
  planned_time_to: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  reference_number: string | null;
  notes: string | null;
  order_id: string | null;
}

interface EligibleLeg {
  id: string;
  trip_id: string | null;
  leg_number: number | null;
  carrier_cost: number | null;
  carrier_currency: string | null;
  planned_departure: string | null;
  planned_arrival: string | null;
  origin_stop_id: string | null;
  destination_stop_id: string | null;
  origin_address: string | null;
  destination_address: string | null;
  from_stop_index: number | null;
  to_stop_index: number | null;
  status: string | null;
  trip: { id: string; reference_number: string | null; status: string } | null;
  origin_stop: StopRef | null;
  destination_stop: StopRef | null;
  intermediate_stops?: StopRef[];
}

// ─── Helpers ───────────────────────────────────────────────
function fmtCurrency(amount: number | null | undefined, currency = "EUR") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function todayMinusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function todayPlusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function legPlannedDateISO(leg: EligibleLeg): string | null {
  // Best-effort chronological key for the leg
  if (leg.planned_departure) return leg.planned_departure;
  if (leg.origin_stop?.planned_date && leg.origin_stop?.planned_time_from) {
    return `${leg.origin_stop.planned_date}T${leg.origin_stop.planned_time_from}`;
  }
  if (leg.origin_stop?.planned_date) return leg.origin_stop.planned_date + "T00:00:00";
  return null;
}

// ─── Page ──────────────────────────────────────────────────
export default function CarrierConsolidationPage() {
  const { session: adminSession } = useAdminSession();
  const { toast } = useToast();
  const router = useRouter();

  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>(todayMinusDays(7));
  const [toDate, setToDate] = useState<string>(todayPlusDays(14));
  const [legs, setLegs] = useState<EligibleLeg[]>([]);
  const [selectedLegIds, setSelectedLegIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  // ─── Load carriers ─────────────────────────────────────────
  useEffect(() => {
    if (!adminSession?.id) return;
    const s = createClient();
    (async () => {
      const { data, error } = await s
        .from("business_partners")
        .select("id, name, types")
        .eq("admin_id", adminSession.id)
        .eq("is_active", true)
        .order("name");
      if (error) {
        console.log("[v0] carriers fetch error:", error);
        return;
      }
      // Filter to those that can act as a carrier/subcontractor
      const list = (data || []).filter((p: any) => {
        const types = Array.isArray(p.types) ? p.types : [];
        return types.includes("carrier") || types.includes("subcontractor") || types.length === 0;
      });
      setCarriers(list);
    })();
  }, [adminSession?.id]);

  // ─── Load eligible legs ────────────────────────────────────
  const fetchLegs = useCallback(async () => {
    if (!selectedCarrierId || !adminSession?.id) {
      setLegs([]);
      setSelectedLegIds(new Set());
      return;
    }
    setLoading(true);
    const s = createClient();

    // Fetch all forwarding-style legs assigned to this carrier and not yet consolidated.
    const { data, error } = await s
      .from("trip_legs")
      .select(`
        id, trip_id, leg_number, carrier_cost, carrier_currency,
        planned_departure, planned_arrival, status,
        origin_stop_id, destination_stop_id,
        origin_address, destination_address,
        from_stop_index, to_stop_index,
        forwarding_order_id, assignment_type, carrier_id,
        trip:trips!trip_legs_trip_id_fkey(id, reference_number, status, admin_id)
      `)
      .eq("carrier_id", selectedCarrierId)
      .is("forwarding_order_id", null)
      .order("planned_departure", { ascending: true, nullsFirst: false });

    if (error) {
      console.log("[v0] legs fetch error:", error);
      toast({ title: "Failed to load legs", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Filter to this admin's trips and the assignment_type = forwarding
    const adminLegs = (data || []).filter((l: any) => {
      const trip = Array.isArray(l.trip) ? l.trip[0] : l.trip;
      if (!trip || trip.admin_id !== adminSession.id) return false;
      // Only forwarding-eligible (carrier-assigned) legs
      if (l.assignment_type && l.assignment_type !== "forwarding") return false;
      return true;
    });

    // Fetch ALL trip_stops for the trips referenced by these legs.
    // Many legs use from_stop_index/to_stop_index (not origin_stop_id) so we
    // need to map indices to actual stops via sequence_order.
    const tripIds = Array.from(new Set(adminLegs.map((l: any) => l.trip_id).filter(Boolean) as string[]));
    const stopsByTrip = new Map<string, StopRef[]>();
    const stopMap = new Map<string, StopRef>();
    if (tripIds.length > 0) {
      const { data: stops } = await s
        .from("trip_stops")
        .select(`
          id, trip_id, sequence_order, stop_type, company_name, address, city, country, postal_code,
          lat, lng, planned_date, planned_time_from, planned_time_to,
          contact_name, contact_phone, reference_number, notes, order_id
        `)
        .in("trip_id", tripIds);
      (stops || []).forEach((st: any) => {
        stopMap.set(st.id, st);
        const arr = stopsByTrip.get(st.trip_id) || [];
        arr.push(st);
        stopsByTrip.set(st.trip_id, arr);
      });
      // Sort each trip's stops by sequence_order
      stopsByTrip.forEach((arr) => arr.sort((a: any, b: any) => (a.sequence_order || 0) - (b.sequence_order || 0)));
    }

    const enriched: EligibleLeg[] = adminLegs.map((l: any) => {
      const trip = Array.isArray(l.trip) ? l.trip[0] : l.trip;
      const tripStops = (l.trip_id && stopsByTrip.get(l.trip_id)) || [];
      // Resolve origin/destination: prefer explicit IDs, else use from/to_stop_index
      let originStop: StopRef | null = l.origin_stop_id ? stopMap.get(l.origin_stop_id) || null : null;
      let destStop: StopRef | null = l.destination_stop_id ? stopMap.get(l.destination_stop_id) || null : null;
      if (!originStop && typeof l.from_stop_index === "number" && tripStops[l.from_stop_index]) {
        originStop = tripStops[l.from_stop_index];
      }
      if (!destStop && typeof l.to_stop_index === "number" && tripStops[l.to_stop_index]) {
        destStop = tripStops[l.to_stop_index];
      }
      // Intermediate stops between from_stop_index and to_stop_index (exclusive)
      const fromIdx = typeof l.from_stop_index === "number" ? l.from_stop_index : -1;
      const toIdx = typeof l.to_stop_index === "number" ? l.to_stop_index : -1;
      const intermediate: StopRef[] = (fromIdx >= 0 && toIdx > fromIdx + 1)
        ? tripStops.slice(fromIdx + 1, toIdx)
        : [];
      return {
        ...l,
        trip: trip || null,
        origin_stop: originStop,
        destination_stop: destStop,
        intermediate_stops: intermediate,
      };
    });

    // Filter by date range using the best-effort planned date of the origin
    const fromTs = fromDate ? new Date(fromDate + "T00:00:00").getTime() : -Infinity;
    const toTs = toDate ? new Date(toDate + "T23:59:59").getTime() : Infinity;
    const inRange = enriched.filter((leg) => {
      const ts = legPlannedDateISO(leg);
      if (!ts) return true; // include undated legs so they don't disappear
      const t = new Date(ts).getTime();
      return t >= fromTs && t <= toTs;
    });

    setLegs(inRange);
    setSelectedLegIds(new Set());
    setLoading(false);
  }, [selectedCarrierId, fromDate, toDate, adminSession?.id, toast]);

  useEffect(() => {
    fetchLegs();
  }, [fetchLegs]);

  // ─── Display filter (search) ───────────────────────────────
  const visibleLegs = useMemo(() => {
    if (!search.trim()) return legs;
    const q = search.toLowerCase();
    return legs.filter((l) => {
      if (l.trip?.reference_number?.toLowerCase().includes(q)) return true;
      if (l.origin_stop?.city?.toLowerCase().includes(q)) return true;
      if (l.destination_stop?.city?.toLowerCase().includes(q)) return true;
      if (l.origin_stop?.company_name?.toLowerCase().includes(q)) return true;
      if (l.destination_stop?.company_name?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [legs, search]);

  const allVisibleSelected = visibleLegs.length > 0 && visibleLegs.every((l) => selectedLegIds.has(l.id));
  const toggleAllVisible = () => {
    setSelectedLegIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleLegs.forEach((l) => next.delete(l.id));
      } else {
        visibleLegs.forEach((l) => next.add(l.id));
      }
      return next;
    });
  };
  const toggleLeg = (id: string) => {
    setSelectedLegIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ─── Selection summary ─────────────────────────────────────
  const selected = useMemo(
    () => legs.filter((l) => selectedLegIds.has(l.id)),
    [legs, selectedLegIds],
  );
  const summary = useMemo(() => {
    const count = selected.length;
    let totalCost = 0;
    let currency = "EUR";
    const stops = new Set<string>();
    let earliest: string | null = null;
    let latest: string | null = null;
    selected.forEach((l) => {
      totalCost += Number(l.carrier_cost || 0);
      currency = l.carrier_currency || currency;
      if (l.origin_stop?.id) stops.add(l.origin_stop.id);
      if (l.destination_stop?.id) stops.add(l.destination_stop.id);
      const ts = legPlannedDateISO(l);
      if (ts) {
        if (!earliest || ts < earliest) earliest = ts;
        if (!latest || ts > latest) latest = ts;
      }
    });
    return { count, totalCost, currency, uniqueStops: stops.size, earliest, latest };
  }, [selected]);

  // ─── Create consolidated FWD ───────────────────────────────
  const createConsolidatedOrder = async () => {
    if (!selectedCarrierId || selected.length === 0 || !adminSession?.id) return;
    setCreating(true);
    const s = createClient();
    try {
      // 1) Generate FWD reference
      let fwdRef = "";
      try {
        const res = await fetch("/api/series/next-number", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_type: "forwarding_order", admin_id: adminSession.id }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        fwdRef = data.number;
      } catch {
        // Fallback: deterministic local fallback
        const datePart = new Date().toISOString().split("T")[0].replace(/-/g, "");
        fwdRef = `FWD-CONS-${datePart}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
      }

      // 2) Build chronologically ordered, deduped stop list across all selected legs
      const orderedLegs = [...selected].sort((a, b) => {
        const ax = legPlannedDateISO(a) || "";
        const bx = legPlannedDateISO(b) || "";
        return ax.localeCompare(bx);
      });

      const stopList: StopRef[] = [];
      const seenStopIds = new Set<string>();
      orderedLegs.forEach((l) => {
        if (l.origin_stop && !seenStopIds.has(l.origin_stop.id)) {
          stopList.push(l.origin_stop);
          seenStopIds.add(l.origin_stop.id);
        }
        if (l.destination_stop && !seenStopIds.has(l.destination_stop.id)) {
          stopList.push(l.destination_stop);
          seenStopIds.add(l.destination_stop.id);
        }
      });
      if (stopList.length === 0) {
        toast({
          title: "No usable stops",
          description: "The selected legs do not have linked trip stops to copy onto the consolidated order.",
          variant: "destructive",
        });
        setCreating(false);
        return;
      }

      // 3) Compute totals + dates from legs
      let totalCost = 0;
      let currency = "EUR";
      orderedLegs.forEach((l) => {
        totalCost += Number(l.carrier_cost || 0);
        currency = l.carrier_currency || currency;
      });

      // 4) Insert the consolidated forwarding order
      const { data: fwdOrder, error: fwdErr } = await s
        .from("orders")
        .insert({
          admin_id: adminSession.id,
          reference_number: fwdRef,
          order_type: "forwarding",
          status: "fwd_assigned",
          is_draft: false,
          carrier_id: selectedCarrierId,
          carrier_cost: totalCost,
          carrier_currency: currency,
          customer_currency: currency,
          commercial_role: "carrier_subcontract",
          internal_notes: `Consolidated FWD covering ${orderedLegs.length} trip legs from ${fmtDate(summary.earliest)} to ${fmtDate(summary.latest)}.`,
          forwarding_checklist: {
            documents_pending: { checked: false, date: null, note: "" },
            documents_received: { checked: false, date: null, note: "" },
            client_invoiced: { checked: false, date: null, note: "" },
            docs_sent_to_client: { checked: false, date: null, note: "" },
            carrier_payment_due: { checked: false, date: null, note: "" },
            carrier_paid: { checked: false, date: null, note: "" },
            client_payment_received: { checked: false, date: null, note: "" },
          },
        })
        .select("id, reference_number")
        .single();

      if (fwdErr || !fwdOrder) throw fwdErr || new Error("FWD order insert failed");

      // 5) Insert stops in chronological order. order_stops only allows pickup|delivery for stop_type
      // (db check). Use pickup for origin-side, delivery for destination-side, and infer by index.
      const orderStops = stopList.map((st, idx) => ({
        order_id: fwdOrder.id,
        sequence_order: idx + 1,
        stop_type: idx === 0
          ? "pickup"
          : idx === stopList.length - 1
            ? "delivery"
            : (st.stop_type === "pickup" ? "pickup" : "delivery"),
        company_name: st.company_name || "",
        address: st.address || "",
        city: st.city || "",
        country: st.country || "",
        postal_code: st.postal_code || "",
        lat: st.lat ?? null,
        lng: st.lng ?? null,
        planned_date: st.planned_date || null,
        planned_time_from: st.planned_time_from || null,
        planned_time_to: st.planned_time_to || null,
        contact_name: st.contact_name || "",
        contact_phone: st.contact_phone || "",
        reference_number: st.reference_number || "",
        notes: st.notes || "",
        status: "pending",
      }));
      const { error: stopsErr } = await s.from("order_stops").insert(orderStops);
      if (stopsErr) throw stopsErr;

      // 6) Link the FWD order to every selected trip_leg via the existing
      // trip_legs.forwarding_order_id column (no separate junction table).
      const legIds = orderedLegs.map((l) => l.id);
      const { error: linkErr } = await s
        .from("trip_legs")
        .update({ forwarding_order_id: fwdOrder.id })
        .in("id", legIds);
      if (linkErr) throw linkErr;

      toast({
        title: `Consolidated FWD ${fwdRef} created`,
        description: `${orderedLegs.length} legs, ${stopList.length} stops, ${fmtCurrency(totalCost, currency)}`,
      });

      router.push(`/admin/tms/orders/${fwdOrder.id}`);
    } catch (err: any) {
      console.log("[v0] consolidation error:", err);
      toast({
        title: "Consolidation failed",
        description: err.message || "Could not create the consolidated forwarding order.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-4 md:px-6 py-3 md:py-4 border-b border-border/50">
        <div>
          <h1 className="text-lg md:text-xl font-semibold tracking-tight flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Carrier Consolidation
          </h1>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">
            Bundle every trip leg currently assigned to a subcontractor into a single forwarding order with one route, one cost and one document.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/tms/trips">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              <Route className="h-3.5 w-3.5" />
              Round Trips
            </Button>
          </Link>
          <Link href="/admin/tms/forwarding">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Forwarding Orders</span>
              <span className="sm:hidden">FWD</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 px-4 md:px-6 py-3 border-b border-border/50 bg-muted/20">
        <div className="md:col-span-4 flex flex-col gap-1.5">
          <Label htmlFor="carrier" className="text-[10px] uppercase tracking-wider text-muted-foreground">Subcontractor</Label>
          <Select value={selectedCarrierId} onValueChange={setSelectedCarrierId}>
            <SelectTrigger id="carrier" className="h-9 text-sm">
              <SelectValue placeholder="Select a carrier…" />
            </SelectTrigger>
            <SelectContent>
              {carriers.length === 0 ? (
                <div className="px-2 py-2 text-xs text-muted-foreground">No carriers in your address book yet.</div>
              ) : (
                carriers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="from" className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
          <Input id="from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="to" className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
          <Input id="to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="md:col-span-4 flex flex-col gap-1.5">
          <Label htmlFor="search" className="text-[10px] uppercase tracking-wider text-muted-foreground">Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              id="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Trip ref, city, company…"
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* Eligible legs list */}
        <div className="flex-1 overflow-y-auto">
          {!selectedCarrierId ? (
            <PromptPick />
          ) : loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 text-muted-foreground animate-spin mr-2" />
              <p className="text-muted-foreground text-sm">Loading legs…</p>
            </div>
          ) : visibleLegs.length === 0 ? (
            <NoLegs />
          ) : (
            <>
              {/* Toolbar */}
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur flex items-center justify-between px-4 md:px-6 py-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="toggle-all"
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAllVisible}
                    aria-label="Select all visible legs"
                  />
                  <Label htmlFor="toggle-all" className="text-xs text-muted-foreground cursor-pointer">
                    {allVisibleSelected ? "Deselect all visible" : "Select all visible"} · {visibleLegs.length} legs
                  </Label>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {selectedLegIds.size} selected
                </p>
              </div>

              <ul className="divide-y divide-border/30">
                {visibleLegs.map((l) => (
                  <LegRow key={l.id} leg={l} selected={selectedLegIds.has(l.id)} onToggle={() => toggleLeg(l.id)} />
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Summary panel */}
        <aside className="lg:w-[340px] lg:border-l border-t lg:border-t-0 border-border/50 bg-muted/10 flex flex-col">
          <div className="px-4 py-3 border-b border-border/50">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              Consolidation summary
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <SummaryRow label="Selected legs" value={String(summary.count)} icon={<Layers className="h-3.5 w-3.5 text-muted-foreground" />} />
            <SummaryRow label="Unique stops" value={String(summary.uniqueStops)} icon={<MapPin className="h-3.5 w-3.5 text-muted-foreground" />} />
            <SummaryRow label="Window" value={summary.earliest ? `${fmtDate(summary.earliest)} → ${fmtDate(summary.latest)}` : "—"} icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />} />
            <SummaryRow label="Total carrier cost" value={fmtCurrency(summary.totalCost, summary.currency)} icon={<Sparkles className="h-3.5 w-3.5 text-emerald-400" />} highlight />

            {summary.count > 0 && (
              <div className="mt-4 rounded-md border border-border/50 bg-background/40 p-3 text-[11px] text-muted-foreground space-y-1.5">
                <p className="text-foreground font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  What happens on confirm
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>One forwarding order is created with the carrier and the union of all stops, ordered chronologically.</li>
                  <li>Each selected trip leg is linked to that forwarding order — they will no longer appear here.</li>
                  <li>You will be redirected to the new FWD order to review, attach docs, and send instructions to the carrier.</li>
                </ul>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-border/50">
            <Button
              className="w-full gap-2"
              disabled={selected.length === 0 || creating}
              onClick={createConsolidatedOrder}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {creating
                ? "Creating…"
                : selected.length === 0
                  ? "Select legs to consolidate"
                  : `Create consolidated FWD (${selected.length})`}
            </Button>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              You can edit, price and send the FWD order on the next screen.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────
function PromptPick() {
  return (
    <div className="text-center py-16 px-6">
      <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-foreground font-medium">Pick a subcontractor to begin</p>
      <p className="text-xs text-muted-foreground mt-1">
        Choose any carrier from the address book. Every trip leg currently assigned to them
        and not yet on a forwarding order will appear here.
      </p>
    </div>
  );
}

function NoLegs() {
  return (
    <div className="text-center py-16 px-6">
      <Ban className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-foreground font-medium">Nothing to consolidate</p>
      <p className="text-xs text-muted-foreground mt-1">
        This carrier has no open trip legs in the selected window. Try widening the date range
        or assign more legs to them on the Dispatch Board.
      </p>
    </div>
  );
}

function LegRow({ leg, selected, onToggle }: { leg: EligibleLeg; selected: boolean; onToggle: () => void }) {
  const cost = Number(leg.carrier_cost || 0);
  const currency = leg.carrier_currency || "EUR";
  // Detect single-point legs (origin == destination), e.g. forwarding-only stubs
  // that only carry one stop. We render them as a labelled single location instead
  // of a misleading "City → City" arrow.
  const isSinglePoint = !!(
    leg.origin_stop &&
    leg.destination_stop &&
    leg.origin_stop.id === leg.destination_stop.id
  );
  const singleStop = isSinglePoint ? leg.origin_stop : null;
  const singleLabel =
    singleStop?.stop_type === "pickup"
      ? "Pickup only"
      : singleStop?.stop_type === "delivery"
      ? "Delivery only"
      : "Single stop";
  return (
    <li className={`flex items-start gap-3 px-4 md:px-6 py-3 transition-colors ${selected ? "bg-primary/5" : "hover:bg-muted/30"}`}>
      <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-0.5" aria-label="Select leg" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <Route className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium truncate">
              {leg.trip?.reference_number || `Trip ${leg.trip_id?.slice(0, 8) || ""}`}
              {leg.leg_number != null && (
                <span className="text-muted-foreground ml-1">· leg {leg.leg_number}</span>
              )}
            </span>
            {leg.trip?.status && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 border-border/50 text-muted-foreground">
                {leg.trip.status}
              </Badge>
            )}
          </div>
          <span className="text-xs font-semibold tabular-nums text-emerald-400 shrink-0">
            {fmtCurrency(cost, currency)}
          </span>
        </div>

        {isSinglePoint && singleStop ? (
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-500/30 text-amber-400 bg-amber-500/5 shrink-0">
              {singleLabel}
            </Badge>
            <CountryFlag country={singleStop.country} />
            <span className="font-medium truncate max-w-[180px]">
              {singleStop.city || singleStop.address || "—"}
            </span>
            <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">
              {singleStop.company_name || ""}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <CountryFlag country={leg.origin_stop?.country} />
            <span className="font-medium truncate max-w-[140px]">
              {leg.origin_stop?.city || leg.origin_address || "—"}
            </span>
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
              {leg.origin_stop?.company_name || ""}
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <CountryFlag country={leg.destination_stop?.country} />
            <span className="font-medium truncate max-w-[140px]">
              {leg.destination_stop?.city || leg.destination_address || "—"}
            </span>
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
              {leg.destination_stop?.company_name || ""}
            </span>
          </div>
        )}

        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1">
          <span className="flex items-center gap-1">
            <Calendar className="h-2.5 w-2.5" />
            {fmtDateTime(legPlannedDateISO(leg))}
          </span>
          {leg.planned_arrival && (
            <span className="flex items-center gap-1">
              <ArrowRight className="h-2.5 w-2.5" />
              {fmtDateTime(leg.planned_arrival)}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function SummaryRow({
  label, value, icon, highlight,
}: { label: string; value: string; icon?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={`tabular-nums ${highlight ? "text-emerald-400 font-semibold" : "text-foreground font-medium"}`}>{value}</span>
    </div>
  );
}
