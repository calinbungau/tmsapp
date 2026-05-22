"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Package, Loader2, Calendar, MapPin, Plus, Filter, ArrowRight, Check } from "lucide-react";

interface AddOrderToTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  /** Order IDs already attached to this trip — used to filter them out of the picker */
  existingOrderIds: string[];
  /** Called after a successful link so the parent can re-fetch the trip */
  onLinked: () => void;
}

interface PickableOrder {
  id: string;
  reference_number: string;
  status: string;
  order_type: string | null;
  commercial_role: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_price: number | null;
  customer_currency: string | null;
  pallet_count: number | null;
  weight_kg: number | null;
  loading_meters: number | null;
  earliest_date: string | null;
  latest_date: string | null;
  origin_city: string | null;
  origin_country: string | null;
  destination_city: string | null;
  destination_country: string | null;
  stops_count: number;
  has_trip: boolean;
}

/**
 * Modal that lets a dispatcher add an *existing* customer order to a trip.
 *
 * It does three things on confirm:
 *   1. Inserts a row in `trip_orders` (the M:N junction).
 *   2. Copies every `order_stops` row of the order into `trip_stops`, appended
 *      at the end of the current sequence (the dispatcher can re-order
 *      afterwards in the trip editor).
  *   3. Stamps `orders.status = 'in_execution'` if it was still `confirmed_to_customer`.
 *
 * It does NOT create or delete an `orders` row — orders are commercial,
 * trips are operational. This keeps the model clean.
 */
export function AddOrderToTripDialog({
  open,
  onOpenChange,
  tripId,
  existingOrderIds,
  onLinked,
}: AddOrderToTripDialogProps) {
  const supabase = createClient();
  const { session: adminSession } = useAdminSession();
  const { toast } = useToast();

  const [orders, setOrders] = useState<PickableOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  // Default to "all" so dispatchers see every confirmed/in-progress order. If they
  // pick one that's already attached to another trip we transparently invoke the
  // /api/admin/tms/trips/merge endpoint so stops, expenses, events and the source
  // trip itself flow over (full "merge with everything" semantics).
  const [filter, setFilter] = useState<"all" | "unassigned" | "confirmed">("all");
  const [linking, setLinking] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    try {
      // Pull confirmed customer orders for this admin
      let query = supabase
        .from("orders")
        .select(`
          id, reference_number, status, order_type, commercial_role, is_draft,
          customer_id, customer_price, customer_currency, pallet_count, weight_kg, loading_meters,
          partners:customer_id(id, name),
          order_stops(id, sequence_order, stop_type, city, country, planned_date, planned_time_from)
        `)
        .eq("admin_id", adminSession.id)
        .eq("is_draft", false)
        .eq("commercial_role", "customer_order")
        .in("status", ["confirmed", "dispatched", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(120);

      const { data, error } = await query;
      if (error) throw error;

      const orderIds = (data ?? []).map((o: any) => o.id);

      // Find which orders are already linked to ANY trip (so we can warn the user)
      let linkedOrderIds = new Set<string>();
      if (orderIds.length > 0) {
        const { data: links } = await supabase
          .from("trip_orders")
          .select("order_id")
          .in("order_id", orderIds);
        (links ?? []).forEach((l: any) => linkedOrderIds.add(l.order_id));
      }

      const mapped: PickableOrder[] = (data ?? [])
        .filter((o: any) => !existingOrderIds.includes(o.id))
        .map((o: any) => {
          const stops = (o.order_stops ?? []).slice().sort(
            (a: any, b: any) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0),
          );
          const pickup = stops.find((s: any) => s.stop_type === "pickup") ?? stops[0];
          const delivery = stops.findLast?.((s: any) => s.stop_type === "delivery") ?? stops[stops.length - 1];
          const dates = stops.map((s: any) => s.planned_date).filter(Boolean);
          return {
            id: o.id,
            reference_number: o.reference_number,
            status: o.status,
            order_type: o.order_type,
            commercial_role: o.commercial_role,
            customer_id: o.customer_id,
            customer_name: o.partners?.name ?? null,
            customer_price: o.customer_price,
            customer_currency: o.customer_currency,
            pallet_count: o.pallet_count,
            weight_kg: o.weight_kg,
            loading_meters: o.loading_meters,
            earliest_date: dates.length ? dates.reduce((a: string, b: string) => (a < b ? a : b)) : null,
            latest_date: dates.length ? dates.reduce((a: string, b: string) => (a > b ? a : b)) : null,
            origin_city: pickup?.city ?? null,
            origin_country: pickup?.country ?? null,
            destination_city: delivery?.city ?? null,
            destination_country: delivery?.country ?? null,
            stops_count: stops.length,
            has_trip: linkedOrderIds.has(o.id),
          };
        });

      setOrders(mapped);
    } catch (err: any) {
      console.log("[v0] AddOrderToTripDialog: fetchOrders failed", err);
      toast({ title: "Could not load orders", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [adminSession?.id, supabase, toast, existingOrderIds]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setFilter("all");
      fetchOrders();
    }
  }, [open, fetchOrders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === "unassigned" && o.has_trip) return false;
      if (filter === "confirmed" && o.status !== "confirmed") return false;
      if (!q) return true;
      return (
        o.reference_number?.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.origin_city?.toLowerCase().includes(q) ||
        o.destination_city?.toLowerCase().includes(q)
      );
    });
  }, [orders, search, filter]);

  const linkOrder = async (orderId: string, hasTrip: boolean) => {
    setLinking(orderId);
    try {
      console.log("[v0] AddOrderToTrip: linking", { tripId, orderId, hasTrip });

      // ── Path A: order already lives on another trip ────────────────────
      // Use the canonical merge endpoint so stops, expenses, events and
      // documents flow over and the source trip is cleaned up. This gives
      // dispatchers "merge with everything" semantics from a single click.
      if (hasTrip) {
        const { data: srcLinks, error: srcErr } = await supabase
          .from("trip_orders")
          .select("trip_id")
          .eq("order_id", orderId);
        if (srcErr) throw srcErr;

        const sourceIds = (srcLinks ?? [])
          .map((l: any) => l.trip_id)
          .filter((id: string) => id && id !== tripId);

        if (sourceIds.length > 0) {
          const res = await fetch("/api/admin/tms/trips/merge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ primaryId: tripId, sourceIds }),
          });
          const j = await res.json().catch(() => ({}));
          console.log("[v0] AddOrderToTrip: merge response", res.status, j);
          if (!res.ok) throw new Error(j.error || `Merge failed (${res.status})`);

          toast({ title: "Order merged into trip" });
          onLinked();
          onOpenChange(false);
          return;
        }
        // Fall through to Path B if no source trip remained
      }

      // ── Path B: truly unassigned order ─────────────────────────────────
      // Insert junction + copy order_stops at the end of the current sequence.
      const { error: linkErr } = await supabase
        .from("trip_orders")
        .upsert({ trip_id: tripId, order_id: orderId }, { onConflict: "trip_id,order_id" });
      if (linkErr) throw linkErr;

      const { data: orderStops } = await supabase
        .from("order_stops")
        .select(
          "id, sequence_order, stop_type, company_name, address, city, country, postal_code, " +
            "lat, lng, planned_date, planned_time_from, planned_time_to, contact_name, contact_phone, " +
            "reference_number, notes, action_type_id",
        )
        .eq("order_id", orderId)
        .order("sequence_order", { ascending: true });

      const { data: existingTripStops } = await supabase
        .from("trip_stops")
        .select("sequence_order")
        .eq("trip_id", tripId)
        .order("sequence_order", { ascending: false })
        .limit(1);

      const baseSeq = existingTripStops?.[0]?.sequence_order ?? 0;

      if (orderStops && orderStops.length > 0) {
        const newRows = orderStops.map((s: any, idx: number) => ({
          trip_id: tripId,
          order_id: orderId,
          order_stop_id: s.id,
          sequence_order: baseSeq + idx + 1,
          stop_type: s.stop_type ?? "pickup",
          company_name: s.company_name ?? null,
          address: s.address ?? null,
          city: s.city ?? null,
          country: s.country ?? null,
          postal_code: s.postal_code ?? null,
          lat: s.lat ?? null,
          lng: s.lng ?? null,
          planned_date: s.planned_date ?? null,
          planned_time_from: s.planned_time_from ?? null,
          planned_time_to: s.planned_time_to ?? null,
          contact_name: s.contact_name ?? null,
          contact_phone: s.contact_phone ?? null,
          reference_number: s.reference_number ?? null,
          notes: s.notes ?? null,
          status: "pending",
          action_type_id: s.action_type_id ?? null,
        }));
        const { error: stopsErr } = await supabase.from("trip_stops").insert(newRows);
        if (stopsErr) throw stopsErr;
      }

      // Promote to execution if the order was still at the customer-confirmed
      // stage. Uses v3 unified status names (orders_status_check constraint).
      await supabase
        .from("orders")
        .update({ status: "in_execution" })
        .eq("id", orderId)
        .eq("status", "confirmed_to_customer");

      toast({ title: "Order added to trip" });
      onLinked();
      onOpenChange(false);
    } catch (err: any) {
      console.log("[v0] AddOrderToTrip: link failed", err);
      toast({ title: "Could not add order", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLinking(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" />
            Add order to trip
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pick a confirmed customer order. Its stops will be appended to this trip and you can re-order them after.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ref, customer, city..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1 border border-border/50 rounded-md overflow-hidden">
            {(["unassigned", "confirmed", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  filter === f ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                {f === "unassigned" ? "Unassigned" : f === "confirmed" ? "Confirmed" : "All"}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchOrders} title="Refresh">
            <Filter className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <Package className="h-7 w-7 opacity-40" />
              <span className="text-xs">No matching orders</span>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {filtered.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  disabled={!!linking}
                  onClick={() => linkOrder(o.id, o.has_trip)}
                  className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors disabled:opacity-50"
                >
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <Badge variant="outline" className="font-mono text-[10px] px-1.5">
                      {o.reference_number}
                    </Badge>
                    {o.has_trip && (
                      <span className="text-[9px] text-amber-400">on another trip</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-medium truncate">
                      <span className="truncate">{o.customer_name ?? "—"}</span>
                      <span className="text-muted-foreground/60">·</span>
                      <span className="text-muted-foreground capitalize text-[11px]">{o.status}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {o.origin_city ?? "?"}{o.origin_country ? `, ${o.origin_country}` : ""}
                      </span>
                      <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">
                        {o.destination_city ?? "?"}{o.destination_country ? `, ${o.destination_country}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      {o.earliest_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-2.5 w-2.5" />
                          {o.earliest_date}
                          {o.latest_date && o.latest_date !== o.earliest_date ? ` → ${o.latest_date}` : ""}
                        </span>
                      )}
                      {o.pallet_count != null && (
                        <span className="flex items-center gap-1">
                          <Package className="h-2.5 w-2.5" />
                          {o.pallet_count} pal
                        </span>
                      )}
                      {o.weight_kg != null && <span>{o.weight_kg.toLocaleString()} kg</span>}
                      <span>{o.stops_count} stops</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs font-semibold tabular-nums">
                      {o.customer_price != null
                        ? `${o.customer_currency ?? "EUR"} ${o.customer_price.toLocaleString()}`
                        : "—"}
                    </span>
                    {linking === o.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-primary opacity-0 group-hover:opacity-100" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{filtered.length} order{filtered.length === 1 ? "" : "s"}</span>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="h-7 text-xs">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
