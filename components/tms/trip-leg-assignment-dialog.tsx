"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Truck, Building2, HelpCircle, User, Check, ChevronsUpDown, Phone, Container, Loader2, FileText, Plus, Link2, UserPlus, Trash2 } from "lucide-react";
import { QuickCreatePartnerDialog, type CreatedPartner } from "@/components/tms/quick-create-partner-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAdminSession } from "@/hooks/use-admin-session";
import { deriveLegStatus, canAutoRollLegStatus } from "@/lib/tms/status/derive-leg-status";
import { recomputeParentStatus } from "@/lib/tms/status/recompute-parent";
import { createForwardingOrderForLeg } from "@/lib/tms/forwarding/create-forwarding-order-for-leg";

interface TripLegAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripLeg: {
    id: string;
    leg_number: number;
    assignment_type: "own_fleet" | "forwarding" | "undecided" | null;
    driver_id?: string | null;
    vehicle_id?: string | null;
    trailer_id?: string | null;
    carrier_id?: string | null;
    forwarding_order_id?: string | null;
    subcontractor_vehicle_plate?: string | null;
    subcontractor_driver_name?: string | null;
    subcontractor_driver_phone?: string | null;
    from_city?: string;
    to_city?: string;
    from_stop_index?: number;
    to_stop_index?: number;
  };
  adminId: string;
  parentOrderId?: string;
  onSave: (updatedLeg: any) => void;
}

  export function TripLegAssignmentDialog({ open, onOpenChange, tripLeg, adminId, parentOrderId, onSave }: TripLegAssignmentDialogProps) {
  // Resolve the logged-in user's id so created_by on any FWD orders /
  // trips we create here points at users.id (which links to an Employee
  // record) rather than the tenant id (which collapses to the owner).
  const { session: adminSession } = useAdminSession();
  const creatorId = adminSession?.user_id ?? adminId;
  const supabase = createClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  // Separate flag for the "Remove linked FWD order" action. We can't reuse
  // `saving` because the Save Assignment button also reads it — a single
  // flag would make BOTH buttons spin during a remove, which would be
  // misleading. A dedicated `removingFwd` cleanly scopes the loading state
  // to just the destructive action.
  const [removingFwd, setRemovingFwd] = useState(false);
  const [assignmentType, setAssignmentType] = useState<"own_fleet" | "forwarding" | "undecided">(tripLeg.assignment_type || "undecided");
  
  // Own Fleet State
  const [driverId, setDriverId] = useState<string | null>(tripLeg.driver_id || null);
  const [vehicleId, setVehicleId] = useState<string | null>(tripLeg.vehicle_id || null);
  const [trailerId, setTrailerId] = useState<string | null>(tripLeg.trailer_id || null);
  const [driverName, setDriverName] = useState<string>("");
  const [vehiclePlate, setVehiclePlate] = useState<string>("");
  const [trailerPlate, setTrailerPlate] = useState<string>("");
  
  // Subcontractor State
  const [carrierId, setCarrierId] = useState<string | null>(tripLeg.carrier_id || null);
  const [carrierName, setCarrierName] = useState<string>("");
  const [subVehiclePlate, setSubVehiclePlate] = useState<string>(tripLeg.subcontractor_vehicle_plate ?? "");
  const [subTrailerPlate, setSubTrailerPlate] = useState<string>((tripLeg as any).subcontractor_trailer_plate ?? "");
  const [subDriverName, setSubDriverName] = useState<string>(tripLeg.subcontractor_driver_name ?? "");
  const [subDriverPhone, setSubDriverPhone] = useState<string>(tripLeg.subcontractor_driver_phone ?? "");
  
  // FWD Order State
  const [fwdOrderId, setFwdOrderId] = useState<string | null>(tripLeg.forwarding_order_id || null);
  const [fwdOrderRef, setFwdOrderRef] = useState<string>("");
  const [fwdOrderMode, setFwdOrderMode] = useState<"existing" | "new" | "none">(tripLeg.forwarding_order_id ? "existing" : "none");
  const [existingFwdOrders, setExistingFwdOrders] = useState<{ id: string; reference_number: string; carrier_name?: string }[]>([]);
  const [linkedFwdOrderExists, setLinkedFwdOrderExists] = useState<boolean>(!!tripLeg.forwarding_order_id);
  
  // Lists
  const [drivers, setDrivers] = useState<{ id: string; name: string; phone?: string }[]>([]);
  const [vehicles, setVehicles] = useState<{ id: string; plate_number: string }[]>([]);
  const [trailers, setTrailers] = useState<{ id: string; plate_number: string }[]>([]);
  const [carriers, setCarriers] = useState<{ id: string; name: string }[]>([]);
  
  // Carrier resources (subcontractor's fleet)
  const [carrierDrivers, setCarrierDrivers] = useState<{ id: string; name: string; phone?: string }[]>([]);
  const [carrierVehicles, setCarrierVehicles] = useState<{ id: string; plate_number: string }[]>([]);
  const [carrierTrailers, setCarrierTrailers] = useState<{ id: string; plate_number: string }[]>([]);
  
  // Search states
  const [driverSearch, setDriverSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [trailerSearch, setTrailerSearch] = useState("");
  const [carrierSearch, setCarrierSearch] = useState("");
  const [subVehicleSearch, setSubVehicleSearch] = useState("");
  const [subTrailerSearch, setSubTrailerSearch] = useState("");
  const [subDriverSearch, setSubDriverSearch] = useState("");
  
  // Popover open states
  const [driverOpen, setDriverOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [carrierOpen, setCarrierOpen] = useState(false);
  const [fwdOrderOpen, setFwdOrderOpen] = useState(false);
  const [subVehicleOpen, setSubVehicleOpen] = useState(false);
  const [subTrailerOpen, setSubTrailerOpen] = useState(false);
  const [subDriverOpen, setSubDriverOpen] = useState(false);

  // Quick Create Carrier dialog state. We pass `carrierSearch` as the
  // suggested name so when the operator types a new carrier name in the
  // popover search and the list is empty, clicking "Create new" pre-fills
  // the company name field — same UX as the orders/new page.
  const [showCreateCarrier, setShowCreateCarrier] = useState(false);

  // Called by QuickCreatePartnerDialog after the partner is inserted.
  // We optimistically append the new carrier to the dropdown list and
  // select it as the active carrier so the operator can immediately
  // proceed to fill the rest of the form without re-opening the popover.
  // No grace-window / preventDefault hacks needed here because the
  // inner dialog is nested INSIDE the outer DialogContent (see the
  // comment near its render site), so Radix's DismissableLayer handles
  // the stacking correctly and the parent doesn't auto-close.
  const handleCarrierCreated = (partner: CreatedPartner) => {
    setCarriers(prev => {
      // De-dupe in case another path already inserted this id (e.g. a
      // background refresh triggered between insert and onCreated).
      if (prev.some(c => c.id === partner.id)) return prev;
      return [...prev, { id: partner.id, name: partner.name }].sort((a, b) => a.name.localeCompare(b.name));
    });
    setCarrierId(partner.id);
    setCarrierName(partner.name);
    setCarrierOpen(false);
    setCarrierSearch("");
  };

  // Remove the linked FWD order from this leg. Two scenarios:
  //
  //   (a) The FWD order is shared across multiple legs (e.g. one carrier
  //       handles legs 2 and 3): we ONLY delete the junction row for THIS
  //       leg. The FWD order keeps existing for the other legs.
  //
  //   (b) This leg is the only one linked to the FWD order: we HARD-DELETE
  //       the FWD order so it disappears from the Subcontracts list and
  //       any other "child orders" views (the operator clicked Remove —
  //       they expect it gone, not a ghost row marked Cancelled). To stay
  //       safe against accidental data loss for FWDs that have already
  //       accumulated audit-relevant artefacts (invoices, expenses, signed
  //       PDFs, attachments, status history), we delete known scrap rows
  //       first (order_stops, status_history, the junction row) then
  //       attempt the orders DELETE. If the database refuses on a foreign
  //       key (i.e. there ARE invoices/expenses tied to the FWD), we
  //       fall back to soft-cancel so the operator doesn't lose data
  //       silently — and surface a toast explaining why.
  //
  // After removal we also flip the leg back to "undecided" so the operator
  // can re-pick Own Fleet, Subcontract (with a different carrier), or
  // leave it as Undecided. We do NOT auto-close the dialog — the operator
  // commonly wants to chain "remove → re-assign → save" in one session.
  const handleRemoveLinkedFwdOrder = async () => {
    if (!fwdOrderId) return;
    const refLabel = fwdOrderRef || "this forwarding order";
    if (!confirm(
      `Remove the link to ${refLabel}?\n\n` +
      `• The order will be unlinked from Leg ${tripLeg.leg_number}.\n` +
      `• If no other legs reference it, the forwarding order will be deleted entirely (only kept as Cancelled if it has invoices / expenses tied to it).\n` +
      `• You can then switch this leg to Own Fleet or leave it as Undecided.`
    )) return;

    setRemovingFwd(true);
    // Track what actually happened so the toast/copy reflects reality.
    let fwdOrderOutcome: "shared" | "deleted" | "cancelled" = "shared";
    try {
      // Step 1: drop the junction row for THIS leg only.
      const { error: junctionErr } = await supabase
        .from("forwarding_order_legs")
        .delete()
        .eq("trip_leg_id", tripLeg.id)
        .eq("forwarding_order_id", fwdOrderId);
      if (junctionErr) throw junctionErr;

      // Step 2: are there any OTHER legs still pointing at this FWD order?
      // We check the junction table (post-delete) and we ALSO check the
      // legacy `trip_legs.forwarding_order_id` column, because some legs
      // may still rely on the pre-migration FK direct link.
      const [{ count: junctionCount }, { count: legacyCount }] = await Promise.all([
        supabase
          .from("forwarding_order_legs")
          .select("id", { count: "exact", head: true })
          .eq("forwarding_order_id", fwdOrderId),
        supabase
          .from("trip_legs")
          .select("id", { count: "exact", head: true })
          .eq("forwarding_order_id", fwdOrderId)
          .neq("id", tripLeg.id), // don't count THIS leg — it's about to be cleared
      ]);

      const remainingRefs = (junctionCount ?? 0) + (legacyCount ?? 0);

      // Step 3: if this leg was the only consumer, try to HARD-DELETE the
      // FWD order. Cancel is only kept as a fallback when delete is
      // blocked by remaining FK references (invoices, expenses, etc.).
      if (remainingRefs === 0) {
        // First delete the scrap rows that don't carry business meaning
        // on their own. We don't rely on ON DELETE CASCADE because the
        // schema isn't guaranteed to have it on every dependent table.
        await supabase.from("order_stops").delete().eq("order_id", fwdOrderId);
        await supabase.from("order_status_history").delete().eq("order_id", fwdOrderId);

        const { error: deleteErr } = await supabase
          .from("orders")
          .delete()
          .eq("id", fwdOrderId);

        if (deleteErr) {
          // FK violation → there's something we don't want to silently
          // delete (invoices, expenses, attachments…). Fall back to the
          // soft-cancel behaviour and let the operator know.
          console.log("[v0] handleRemoveLinkedFwdOrder: hard delete blocked, falling back to cancel:", deleteErr);
          const { error: cancelErr } = await supabase
            .from("orders")
            .update({ status: "cancelled" })
            .eq("id", fwdOrderId);
          if (cancelErr) throw cancelErr;
          fwdOrderOutcome = "cancelled";
        } else {
          fwdOrderOutcome = "deleted";
        }
      }

      // Step 4: clear the leg's direct FK to the FWD order AND reset its
      // assignment to undecided so the operator can pick a new path.
      const { error: legErr } = await supabase
        .from("trip_legs")
        .update({
          forwarding_order_id: null,
          carrier_id: null,
          assignment_type: "undecided",
          subcontractor_vehicle_plate: null,
          subcontractor_trailer_plate: null,
          subcontractor_driver_name: null,
          subcontractor_driver_phone: null,
        })
        .eq("id", tripLeg.id);
      if (legErr) throw legErr;

      // Step 5: update local state so the dialog reflects the new reality
      // without needing a remount.
      setFwdOrderId(null);
      setFwdOrderRef("");
      setFwdOrderMode("none");
      setLinkedFwdOrderExists(false);
      setCarrierId(null);
      setCarrierName("");
      setSubVehiclePlate("");
      setSubTrailerPlate("");
      setSubDriverName("");
      setSubDriverPhone("");
      setAssignmentType("undecided");

      const titleByOutcome: Record<typeof fwdOrderOutcome, string> = {
        shared: `${refLabel} unlinked from this leg`,
        deleted: `${refLabel} deleted`,
        cancelled: `${refLabel} cancelled (kept for audit)`,
      };
      const descByOutcome: Record<typeof fwdOrderOutcome, string> = {
        shared: `Leg ${tripLeg.leg_number} no longer references the order, but other legs still do.`,
        deleted: `The forwarding order was removed entirely because no other legs referenced it. You can now reassign Leg ${tripLeg.leg_number}.`,
        cancelled: `Could not delete because the forwarding order has linked invoices, expenses or attachments. It was marked Cancelled instead so the audit trail is preserved.`,
      };
      toast({
        title: titleByOutcome[fwdOrderOutcome],
        description: descByOutcome[fwdOrderOutcome],
      });

      // Notify parent so the order/trip-legs list refreshes its data and
      // the leg row's badge flips from "Subcontract" back to "Undecided".
      onSave({ id: tripLeg.id, assignment_type: "undecided", carrier_id: null, forwarding_order_id: null });
    } catch (err: any) {
      console.log("[v0] handleRemoveLinkedFwdOrder: failed", err);
      toast({ title: "Failed to remove link", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setRemovingFwd(false);
    }
  };

  useEffect(() => {
    const fetchLists = async () => {
      const queries: Promise<any>[] = [
        supabase.from("drivers").select("id, name, phone").eq("admin_id", adminId).order("name"),
        supabase.from("vehicles").select("id, plate_number").eq("admin_id", adminId).order("plate_number"),
        supabase.from("trailers").select("id, plate_number").eq("admin_id", adminId).order("plate_number"),
        supabase.from("business_partners").select("id, name").eq("admin_id", adminId).contains("types", ["carrier"]).order("name"),
      ];
      
      // Fetch existing FWD orders for this parent order
      if (parentOrderId) {
        queries.push(
          supabase
            .from("orders")
            .select("id, reference_number, carrier:carrier_id(name)")
            .eq("parent_order_id", parentOrderId)
            .eq("order_type", "forwarding")
            .order("created_at", { ascending: false })
        );
      }
      
      const results = await Promise.all(queries);
      const [driversRes, vehiclesRes, trailersRes, carriersRes, fwdOrdersRes] = results;
      
      setDrivers(driversRes.data || []);
      setVehicles(vehiclesRes.data || []);
      setTrailers(trailersRes.data || []);
      setCarriers(carriersRes.data || []);
      
      if (fwdOrdersRes?.data) {
        setExistingFwdOrders(fwdOrdersRes.data.map((o: any) => ({
          id: o.id,
          reference_number: o.reference_number,
          carrier_name: o.carrier?.name || o.carrier?.[0]?.name,
        })));
      }
      
      // Check if this leg already has a FWD order linked via junction table
      const { data: linkedFwd } = await supabase
        .from("forwarding_order_legs")
        .select("forwarding_order_id, forwarding_order:orders(id, reference_number)")
        .eq("trip_leg_id", tripLeg.id)
        .maybeSingle();
      
      if (linkedFwd?.forwarding_order_id) {
        setLinkedFwdOrderExists(true);
        setFwdOrderId(linkedFwd.forwarding_order_id);
        setFwdOrderRef((linkedFwd.forwarding_order as any)?.reference_number || "");
        setFwdOrderMode("existing");
      }
      
      // Set initial names
      if (tripLeg.driver_id) {
        const d = driversRes.data?.find(x => x.id === tripLeg.driver_id);
        if (d) setDriverName(d.name);
      }
      if (tripLeg.vehicle_id) {
        const v = vehiclesRes.data?.find(x => x.id === tripLeg.vehicle_id);
        if (v) setVehiclePlate(v.plate_number);
      }
      if (tripLeg.trailer_id) {
        const t = trailersRes.data?.find(x => x.id === tripLeg.trailer_id);
        if (t) setTrailerPlate(t.plate_number);
      }
      if (tripLeg.carrier_id) {
        const c = carriersRes.data?.find(x => x.id === tripLeg.carrier_id);
        if (c) setCarrierName(c.name);
      }
    };
    if (open) fetchLists();
  }, [open, adminId, tripLeg]);

  // Fetch carrier's resources when carrier is selected
  useEffect(() => {
    const fetchCarrierResources = async () => {
      if (!carrierId) {
        setCarrierDrivers([]);
        setCarrierVehicles([]);
        setCarrierTrailers([]);
        return;
      }
      
      const [driversRes, vehiclesRes, trailersRes] = await Promise.all([
        supabase.from("drivers").select("id, name, phone").eq("business_partner_id", carrierId).order("name"),
        supabase.from("vehicles").select("id, plate_number").eq("business_partner_id", carrierId).order("plate_number"),
        supabase.from("trailers").select("id, plate_number").eq("business_partner_id", carrierId).order("plate_number"),
      ]);
      
      setCarrierDrivers(driversRes.data || []);
      setCarrierVehicles(vehiclesRes.data || []);
      setCarrierTrailers(trailersRes.data || []);
    };
    
    fetchCarrierResources();
  }, [carrierId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updateData: any = {
        assignment_type: assignmentType,
      };
      
      let linkedFwdOrderId: string | null = null;
      let linkedFwdOrderRef: string | null = null;
      
      if (assignmentType === "own_fleet") {
        updateData.driver_id = driverId;
        updateData.vehicle_id = vehicleId;
        updateData.trailer_id = trailerId;
        updateData.carrier_id = null;
        updateData.subcontractor_vehicle_plate = null;
        updateData.subcontractor_driver_name = null;
        updateData.subcontractor_driver_phone = null;
        
        // Remove from any FWD order junction
        await supabase.from("forwarding_order_legs").delete().eq("trip_leg_id", tripLeg.id);
      } else if (assignmentType === "forwarding") {
        updateData.driver_id = null;
        updateData.vehicle_id = null;
        updateData.trailer_id = null;
        updateData.carrier_id = carrierId;
        updateData.subcontractor_vehicle_plate = subVehiclePlate || null;
        updateData.subcontractor_trailer_plate = subTrailerPlate || null;
        updateData.subcontractor_driver_name = subDriverName || null;
        updateData.subcontractor_driver_phone = subDriverPhone || null;
        
        // Handle FWD order linking
        if (fwdOrderMode === "existing" && fwdOrderId) {
          linkedFwdOrderId = fwdOrderId;
          linkedFwdOrderRef = fwdOrderRef;
          // Remove old junction entries for this leg, then add new one
          await supabase.from("forwarding_order_legs").delete().eq("trip_leg_id", tripLeg.id);
          await supabase.from("forwarding_order_legs").insert({
            forwarding_order_id: fwdOrderId,
            trip_leg_id: tripLeg.id,
          });
        } else if (fwdOrderMode === "new" && parentOrderId && carrierId) {
          // Delegate to the shared helper so the exact same FWD-creation
          // logic is used here and in the Freight Exchange award flow.
          const fwdResult = await createForwardingOrderForLeg(supabase, {
            adminId,
            creatorId,
            parentOrderId,
            carrierId,
            tripLeg: {
              id: tripLeg.id,
              leg_number: tripLeg.leg_number,
              from_city: tripLeg.from_city,
              to_city: tripLeg.to_city,
              from_stop_index: tripLeg.from_stop_index,
              to_stop_index: tripLeg.to_stop_index,
              trip_id: (tripLeg as any).trip_id,
            },
            subVehiclePlate,
            subTrailerPlate,
            subDriverName,
            subDriverPhone,
          });
          linkedFwdOrderId = fwdResult.forwardingOrderId;
          linkedFwdOrderRef = fwdResult.forwardingOrderRef;
        } else {
          // No FWD order - just remove junction
          await supabase.from("forwarding_order_legs").delete().eq("trip_leg_id", tripLeg.id);
        }
      } else {
        // undecided - clear all
        updateData.driver_id = null;
        updateData.vehicle_id = null;
        updateData.trailer_id = null;
        updateData.carrier_id = null;
        updateData.subcontractor_vehicle_plate = null;
        updateData.subcontractor_trailer_plate = null;
        updateData.subcontractor_driver_name = null;
        updateData.subcontractor_driver_phone = null;
        
        // Remove from any FWD order junction
        await supabase.from("forwarding_order_legs").delete().eq("trip_leg_id", tripLeg.id);
      }
      
      // ─── Auto-roll the leg status ──────────────────────────────
      // The leg's `status` (rank 4 → "unassigned", rank 5 → "assigned",
      // rank 6 → "planned") should reflect the resource shape after this
      // save. We only overwrite when the current status is still in the
      // "resource-fullness" band — once the operator has clicked the chip
      // and moved the leg to "dispatched_to_driver" / "in_progress" /
      // "delivered" / etc., changing assignments must NOT silently roll
      // the leg back to "planned".
      try {
        const { data: existing } = await supabase
          .from("trip_legs")
          .select("status")
          .eq("id", tripLeg.id)
          .single();
        const currentStatus = existing?.status as string | null | undefined;
        if (canAutoRollLegStatus(currentStatus)) {
          const derived = deriveLegStatus({
            assignment_type: assignmentType,
            driver_id: assignmentType === "own_fleet" ? driverId : null,
            vehicle_id: assignmentType === "own_fleet" ? vehicleId : null,
            trailer_id: assignmentType === "own_fleet" ? trailerId : null,
            carrier_id: assignmentType === "forwarding" ? carrierId : null,
          });
          if (derived !== currentStatus) {
            updateData.status = derived;
          }
        }
      } catch (e) {
        console.log("[v0] TripLegAssignmentDialog: leg status auto-roll skipped:", e);
      }

      await supabase.from("trip_legs").update(updateData).eq("id", tripLeg.id);
      
      // ─── Sync assignment to trips and orders ───────────────────
      // Get the trip_id from this leg
      const { data: legData } = await supabase
        .from("trip_legs")
        .select("trip_id")
        .eq("id", tripLeg.id)
        .single();
      
      if (legData?.trip_id) {
        const tripId = legData.trip_id;
        
        // Update the trips table with the new assignment
        const tripUpdate: any = {
          assignment_type: assignmentType === "forwarding" ? "forwarding" : "own_fleet",
        };
        
        if (assignmentType === "own_fleet") {
          tripUpdate.vehicle_id = vehicleId;
          tripUpdate.driver_id = driverId;
          tripUpdate.trailer_id = trailerId;
          tripUpdate.carrier_id = null;
        } else if (assignmentType === "forwarding") {
          tripUpdate.vehicle_id = null;
          tripUpdate.driver_id = null;
          tripUpdate.trailer_id = null;
          tripUpdate.carrier_id = carrierId;
        } else {
          tripUpdate.vehicle_id = null;
          tripUpdate.driver_id = null;
          tripUpdate.trailer_id = null;
          tripUpdate.carrier_id = null;
        }
        
        await supabase.from("trips").update(tripUpdate).eq("id", tripId);
        
        // Get linked orders and update their assignment fields
        const { data: linkedOrders } = await supabase
          .from("trip_orders")
          .select("order_id")
          .eq("trip_id", tripId);
        
        if (linkedOrders && linkedOrders.length > 0) {
          const orderIds = linkedOrders.map(l => l.order_id);
          
          const orderUpdate: any = {};
          if (assignmentType === "own_fleet") {
            orderUpdate.vehicle_id = vehicleId;
            orderUpdate.driver_id = driverId;
            orderUpdate.carrier_id = null;
          } else if (assignmentType === "forwarding") {
            orderUpdate.vehicle_id = null;
            orderUpdate.driver_id = null;
            orderUpdate.carrier_id = carrierId;
          } else {
            orderUpdate.vehicle_id = null;
            orderUpdate.driver_id = null;
            orderUpdate.carrier_id = null;
          }
          
          await supabase.from("orders").update(orderUpdate).in("id", orderIds);

          // Bubble the leg's new resource shape up to the parent. When
          // the leg flips from "unassigned" → "planned" because the
          // operator just picked a driver/vehicle/carrier, the parent
          // should follow Confirmed → In Execution. We run the same
          // derivation the SQL trigger uses, so the two paths agree.
          await Promise.all(
            orderIds.map((id) => recomputeParentStatus(supabase, id, tripId)),
          );
        }
      }
      
      onSave({
        ...tripLeg,
        ...updateData,
        driver_name: driverName,
        vehicle_plate: vehiclePlate,
        trailer_plate: trailerPlate,
        carrier_name: carrierName,
        subcontractor_trailer_plate: subTrailerPlate || null,
        forwarding_order_id: linkedFwdOrderId,
        forwarding_order_ref: linkedFwdOrderRef,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Leg {tripLeg.leg_number} Assignment
            {tripLeg.from_city && tripLeg.to_city && (
              <Badge variant="outline" className="text-xs font-normal">
                {tripLeg.from_city} → {tripLeg.to_city}
              </Badge>
            )}
          </DialogTitle>
          {/* Screen-reader-only description satisfies Radix's aria-describedby
              requirement (silences the "Missing Description" console warning)
              without adding visual chrome above the tab strip. */}
          <DialogDescription className="sr-only">
            Assign a leg of this trip to your own fleet or to a subcontract carrier.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={assignmentType} onValueChange={(v) => setAssignmentType(v as any)} className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="own_fleet" className="text-xs gap-1.5">
              <Truck className="h-3.5 w-3.5" /> Own Fleet
            </TabsTrigger>
            <TabsTrigger value="forwarding" className="text-xs gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Subcontract
            </TabsTrigger>
            <TabsTrigger value="undecided" className="text-xs gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" /> Undecided
            </TabsTrigger>
          </TabsList>

          <TabsContent value="own_fleet" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">Execute this leg with your own fleet resources.</p>
            
            {/* Driver */}
            <div>
              <Label className="text-xs">Driver</Label>
              <Popover open={driverOpen} onOpenChange={setDriverOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-9 justify-between text-sm font-normal mt-1.5">
                    {driverName || <span className="text-muted-foreground">Select driver...</span>}
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Search driver..." className="h-9" value={driverSearch} onValueChange={setDriverSearch} />
                    <CommandList>
                      <CommandEmpty>No driver found</CommandEmpty>
                      <CommandGroup>
                        <div 
                          className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                          onClick={() => { setDriverId(null); setDriverName(""); setDriverOpen(false); }}
                        >
                          <span className="text-muted-foreground">Unassigned</span>
                        </div>
                        {drivers.filter(d => d.name.toLowerCase().includes(driverSearch.toLowerCase())).map(d => (
                          <div 
                            key={d.id} 
                            className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                            onClick={() => { setDriverId(d.id); setDriverName(d.name); setDriverOpen(false); }}
                          >
                            <User className="h-3 w-3 text-muted-foreground" />
                            {d.name}
                            {driverId === d.id && <Check className="h-3 w-3 ml-auto" />}
                          </div>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Vehicle */}
            <div>
              <Label className="text-xs">Vehicle</Label>
              <Popover open={vehicleOpen} onOpenChange={setVehicleOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-9 justify-between text-sm font-normal mt-1.5">
                    {vehiclePlate || <span className="text-muted-foreground">Select vehicle...</span>}
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Search vehicle..." className="h-9" value={vehicleSearch} onValueChange={setVehicleSearch} />
                    <CommandList>
                      <CommandEmpty>No vehicle found</CommandEmpty>
                      <CommandGroup>
                        <div 
                          className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                          onClick={() => { setVehicleId(null); setVehiclePlate(""); setVehicleOpen(false); }}
                        >
                          <span className="text-muted-foreground">Unassigned</span>
                        </div>
                        {vehicles.filter(v => v.plate_number.toLowerCase().includes(vehicleSearch.toLowerCase())).map(v => (
                          <div 
                            key={v.id} 
                            className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                            onClick={() => { setVehicleId(v.id); setVehiclePlate(v.plate_number); setVehicleOpen(false); }}
                          >
                            <Truck className="h-3 w-3 text-muted-foreground" />
                            {v.plate_number}
                            {vehicleId === v.id && <Check className="h-3 w-3 ml-auto" />}
                          </div>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Trailer */}
            <div>
              <Label className="text-xs">Trailer</Label>
              <Popover open={trailerOpen} onOpenChange={setTrailerOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-9 justify-between text-sm font-normal mt-1.5">
                    {trailerPlate || <span className="text-muted-foreground">Select trailer...</span>}
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Search trailer..." className="h-9" value={trailerSearch} onValueChange={setTrailerSearch} />
                    <CommandList>
                      <CommandEmpty>No trailer found</CommandEmpty>
                      <CommandGroup>
                        <div 
                          className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                          onClick={() => { setTrailerId(null); setTrailerPlate(""); setTrailerOpen(false); }}
                        >
                          <span className="text-muted-foreground">Unassigned</span>
                        </div>
                        {trailers.filter(t => t.plate_number.toLowerCase().includes(trailerSearch.toLowerCase())).map(t => (
                          <div 
                            key={t.id} 
                            className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                            onClick={() => { setTrailerId(t.id); setTrailerPlate(t.plate_number); setTrailerOpen(false); }}
                          >
                            <Container className="h-3 w-3 text-muted-foreground" />
                            {t.plate_number}
                            {trailerId === t.id && <Check className="h-3 w-3 ml-auto" />}
                          </div>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </TabsContent>

          <TabsContent value="forwarding" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">Subcontract this leg to a carrier partner.</p>
            
            {/* FWD Order Mode */}
            {parentOrderId && (
              <div className="rounded-lg border border-border/50 p-3 space-y-3">
                <Label className="text-xs font-medium">Forwarding Order</Label>
                <RadioGroup value={fwdOrderMode} onValueChange={(v) => setFwdOrderMode(v as any)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="none" id="fwd-none" />
                    <Label htmlFor="fwd-none" className="text-xs font-normal cursor-pointer">No FWD Order</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="existing" id="fwd-existing" />
                    <Label htmlFor="fwd-existing" className="text-xs font-normal cursor-pointer flex items-center gap-1">
                      <Link2 className="h-3 w-3" /> Link Existing
                    </Label>
                  </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="new" id="fwd-new" disabled={linkedFwdOrderExists} />
                  <Label htmlFor="fwd-new" className={`text-xs font-normal flex items-center gap-1 ${linkedFwdOrderExists ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                    <Plus className="h-3 w-3" /> Create New
                    {linkedFwdOrderExists && <span className="text-[10px] text-muted-foreground ml-1">(exists)</span>}
                  </Label>
                </div>
                </RadioGroup>
                
                {fwdOrderMode === "existing" && existingFwdOrders.length > 0 && (
                  <Popover open={fwdOrderOpen} onOpenChange={setFwdOrderOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-9 justify-between text-sm font-normal">
                        {fwdOrderRef ? (
                          <span className="flex items-center gap-2">
                            <FileText className="h-3 w-3 text-indigo-400" />
                            {fwdOrderRef}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Select FWD order...</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                      <Command shouldFilter={false}>
                        <CommandInput placeholder="Search FWD orders..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No FWD orders found</CommandEmpty>
                          <CommandGroup>
                            {existingFwdOrders.map(fo => (
                              <div 
                                key={fo.id} 
                                className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                                onClick={() => { setFwdOrderId(fo.id); setFwdOrderRef(fo.reference_number); setFwdOrderOpen(false); }}
                              >
                                <FileText className="h-3 w-3 text-indigo-400" />
                                <span>{fo.reference_number}</span>
                                {fo.carrier_name && <span className="ml-2 text-muted-foreground">({fo.carrier_name})</span>}
                                {fwdOrderId === fo.id && <Check className="h-3 w-3 ml-auto" />}
                              </div>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
                
                {fwdOrderMode === "existing" && existingFwdOrders.length === 0 && !linkedFwdOrderExists && (
                  <p className="text-xs text-muted-foreground italic">No existing FWD orders for this order. Create a new one instead.</p>
                )}
                
                {fwdOrderMode === "existing" && linkedFwdOrderExists && fwdOrderRef && (
                  // Linked-FWD info line + escape hatch. The "Remove" button
                  // covers the "subcontractor changed their mind" scenario:
                  // the operator can drop the FWD order link, which either
                  // cancels the FWD order (if only this leg referenced it)
                  // or just unlinks it (if shared across legs). The leg is
                  // then reset to Undecided so they can switch to Own Fleet
                  // without manually rebuilding the carrier/vehicle state.
                  <div className="flex items-start justify-between gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-2">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      This leg is linked to FWD order{" "}
                      <span className="font-medium text-primary">{fwdOrderRef}</span>.
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 gap-1 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10 -my-1 shrink-0"
                      onClick={handleRemoveLinkedFwdOrder}
                      disabled={removingFwd || saving}
                      title="Unlink this FWD order from the leg. If no other legs reference it, it will be marked as Cancelled."
                    >
                      {removingFwd ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      Remove
                    </Button>
                  </div>
                )}
                
                {fwdOrderMode === "new" && !linkedFwdOrderExists && (
                  <p className="text-xs text-muted-foreground">A new FWD order will be created with the carrier you select below.</p>
                )}
                
                {fwdOrderMode === "new" && linkedFwdOrderExists && (
                  <p className="text-xs text-amber-500">This leg already has a FWD order linked. Use &quot;Link Existing&quot; to view or change it.</p>
                )}
              </div>
            )}
            
            {/* Carrier */}
            <div>
              <Label className="text-xs">Carrier</Label>
<Popover open={carrierOpen} onOpenChange={setCarrierOpen} modal={true}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-9 justify-between text-sm font-normal mt-1.5">
                      {carrierName || <span className="text-muted-foreground">Select carrier...</span>}
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Search carrier..." className="h-9" value={carrierSearch} onValueChange={setCarrierSearch} />
                    <CommandList>
                      {/* No-match state: show a "Create new" CTA pre-filled
                          with whatever the operator just typed, instead of
                          a dead end. Mirrors the same flow used on
                          tms/orders/new where partners can be created
                          inline without leaving the order form. */}
                      <CommandEmpty>
                        <div className="px-2 py-3 flex flex-col items-center gap-2">
                          <span className="text-xs text-muted-foreground">No carrier found</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            className="h-7 text-xs"
                            onClick={() => { setCarrierOpen(false); setShowCreateCarrier(true); }}
                          >
                            <UserPlus className="h-3 w-3 mr-1" />
                            Create &quot;{carrierSearch.trim() || "new carrier"}&quot;
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {carriers.filter(c => c.name.toLowerCase().includes(carrierSearch.toLowerCase())).map(c => (
                          <div 
                            key={c.id} 
                            className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                            onClick={() => { setCarrierId(c.id); setCarrierName(c.name); setCarrierOpen(false); }}
                          >
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {c.name}
                            {carrierId === c.id && <Check className="h-3 w-3 ml-auto" />}
                          </div>
                        ))}
                      </CommandGroup>
                      {/* Footer CTA visible even when results exist — so
                          the operator never has to clear the search input
                          to access partner creation. Border-top separates
                          it visually from the result list above. */}
                      <div className="border-t border-border/60 p-1">
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm text-primary hover:bg-accent hover:text-accent-foreground transition-colors"
                          onClick={() => { setCarrierOpen(false); setShowCreateCarrier(true); }}
                        >
                          <UserPlus className="h-3 w-3" />
                          Quick Create Carrier
                        </button>
                      </div>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="border-t border-border/50 pt-4">
              <p className="text-xs text-muted-foreground mb-3">Subcontractor Vehicle/Trailer/Driver (optional)</p>
              
              <div className="grid grid-cols-3 gap-2">
                {/* Vehicle Plate - Smart selector */}
                <div>
                  <Label className="text-xs">Vehicle Plate</Label>
                  <Popover open={subVehicleOpen} onOpenChange={setSubVehicleOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-9 justify-between text-sm font-normal mt-1.5">
                        {subVehiclePlate || <span className="text-muted-foreground">Select or type...</span>}
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                      <Command shouldFilter={false}>
                        <CommandInput 
                          placeholder="Search or type plate..." 
                          className="h-9" 
                          value={subVehicleSearch} 
                          onValueChange={setSubVehicleSearch} 
                        />
                        <CommandList>
                          {/* Manual entry option */}
                          {subVehicleSearch && (
                            <CommandGroup heading="Manual Entry">
                              <div 
                                className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                                onClick={() => { setSubVehiclePlate(subVehicleSearch); setSubVehicleOpen(false); setSubVehicleSearch(""); }}
                              >
                                <span className="text-muted-foreground">Use:</span> <span className="font-medium">{subVehicleSearch}</span>
                              </div>
                            </CommandGroup>
                          )}
                          
                          {/* Carrier's vehicles */}
                          {carrierVehicles.length > 0 && (
                            <CommandGroup heading={`${carrierName || "Carrier"}'s Vehicles`}>
                              {carrierVehicles.filter(v => v.plate_number.toLowerCase().includes(subVehicleSearch.toLowerCase())).map(v => (
                                <div 
                                  key={v.id} 
                                  className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                                  onClick={() => { setSubVehiclePlate(v.plate_number); setSubVehicleOpen(false); setSubVehicleSearch(""); }}
                                >
                                  <Truck className="h-3 w-3 text-indigo-400" />
                                  {v.plate_number}
                                  {subVehiclePlate === v.plate_number && <Check className="h-3 w-3 ml-auto" />}
                                </div>
                              ))}
                            </CommandGroup>
                          )}
                          
                          {/* Internal fleet vehicles */}
                          <CommandGroup heading="Internal Fleet">
                            {vehicles.filter(v => v.plate_number.toLowerCase().includes(subVehicleSearch.toLowerCase())).slice(0, 5).map(v => (
                              <div 
                                key={v.id} 
                                className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                                onClick={() => { setSubVehiclePlate(v.plate_number); setSubVehicleOpen(false); setSubVehicleSearch(""); }}
                              >
                                <Truck className="h-3 w-3 text-muted-foreground" />
                                {v.plate_number}
                                {subVehiclePlate === v.plate_number && <Check className="h-3 w-3 ml-auto" />}
                              </div>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                
                {/* Trailer Plate - Smart selector */}
                <div>
                  <Label className="text-xs">Trailer Plate</Label>
                  <Popover open={subTrailerOpen} onOpenChange={setSubTrailerOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-9 justify-between text-sm font-normal mt-1.5">
                        {subTrailerPlate || <span className="text-muted-foreground">Select...</span>}
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[240px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                      <Command shouldFilter={false}>
                        <CommandInput placeholder="Search or type..." className="h-9" value={subTrailerSearch} onValueChange={setSubTrailerSearch} />
                        <CommandList>
                          {subTrailerSearch && (
                            <CommandGroup heading="Manual Entry">
                              <div className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent" onClick={() => { setSubTrailerPlate(subTrailerSearch); setSubTrailerOpen(false); setSubTrailerSearch(""); }}>
                                <span className="text-muted-foreground">Use:</span> <span className="font-medium">{subTrailerSearch}</span>
                              </div>
                            </CommandGroup>
                          )}
                          {carrierTrailers.length > 0 && (
                            <CommandGroup heading={`${carrierName || "Carrier"}'s Trailers`}>
                              {carrierTrailers.filter(t => t.plate_number.toLowerCase().includes(subTrailerSearch.toLowerCase())).map(t => (
                                <div key={t.id} className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent" onClick={() => { setSubTrailerPlate(t.plate_number); setSubTrailerOpen(false); setSubTrailerSearch(""); }}>
                                  <Container className="h-3 w-3 text-indigo-400" />
                                  {t.plate_number}
                                  {subTrailerPlate === t.plate_number && <Check className="h-3 w-3 ml-auto" />}
                                </div>
                              ))}
                            </CommandGroup>
                          )}
                          <CommandGroup heading="Internal Fleet">
                            {trailers.filter(t => t.plate_number.toLowerCase().includes(subTrailerSearch.toLowerCase())).slice(0, 5).map(t => (
                              <div key={t.id} className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent" onClick={() => { setSubTrailerPlate(t.plate_number); setSubTrailerOpen(false); setSubTrailerSearch(""); }}>
                                <Container className="h-3 w-3 text-muted-foreground" />
                                {t.plate_number}
                                {subTrailerPlate === t.plate_number && <Check className="h-3 w-3 ml-auto" />}
                              </div>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                
                {/* Driver Name - Smart selector */}
                <div>
                  <Label className="text-xs">Driver Name</Label>
                  <Popover open={subDriverOpen} onOpenChange={setSubDriverOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-9 justify-between text-sm font-normal mt-1.5">
                        {subDriverName || <span className="text-muted-foreground">Select or type...</span>}
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                      <Command shouldFilter={false}>
                        <CommandInput 
                          placeholder="Search or type name..." 
                          className="h-9" 
                          value={subDriverSearch} 
                          onValueChange={setSubDriverSearch} 
                        />
                        <CommandList>
                          {/* Manual entry option */}
                          {subDriverSearch && (
                            <CommandGroup heading="Manual Entry">
                              <div 
                                className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                                onClick={() => { setSubDriverName(subDriverSearch); setSubDriverOpen(false); setSubDriverSearch(""); }}
                              >
                                <span className="text-muted-foreground">Use:</span> <span className="font-medium">{subDriverSearch}</span>
                              </div>
                            </CommandGroup>
                          )}
                          
                          {/* Carrier's drivers */}
                          {carrierDrivers.length > 0 && (
                            <CommandGroup heading={`${carrierName || "Carrier"}'s Drivers`}>
                              {carrierDrivers.filter(d => d.name.toLowerCase().includes(subDriverSearch.toLowerCase())).map(d => (
                                <div 
                                  key={d.id} 
                                  className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                                  onClick={() => { 
                                    setSubDriverName(d.name); 
                                    if (d.phone) setSubDriverPhone(d.phone);
                                    setSubDriverOpen(false); 
                                    setSubDriverSearch(""); 
                                  }}
                                >
                                  <User className="h-3 w-3 text-indigo-400" />
                                  <span>{d.name}</span>
                                  {d.phone && <span className="text-muted-foreground text-[10px] ml-auto">{d.phone}</span>}
                                  {subDriverName === d.name && <Check className="h-3 w-3 ml-1" />}
                                </div>
                              ))}
                            </CommandGroup>
                          )}
                          
                          {/* Internal fleet drivers */}
                          <CommandGroup heading="Internal Fleet">
                            {drivers.filter(d => d.name.toLowerCase().includes(subDriverSearch.toLowerCase())).slice(0, 5).map(d => (
                              <div 
                                key={d.id} 
                                className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                                onClick={() => { 
                                  setSubDriverName(d.name); 
                                  if (d.phone) setSubDriverPhone(d.phone);
                                  setSubDriverOpen(false); 
                                  setSubDriverSearch(""); 
                                }}
                              >
                                <User className="h-3 w-3 text-muted-foreground" />
                                <span>{d.name}</span>
                                {d.phone && <span className="text-muted-foreground text-[10px] ml-auto">{d.phone}</span>}
                                {subDriverName === d.name && <Check className="h-3 w-3 ml-1" />}
                              </div>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              
              <div className="mt-3">
                <Label className="text-xs">Driver Phone</Label>
                <div className="relative mt-1.5">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input 
                    className="h-9 pl-9 text-sm" 
                    placeholder="+40 7XX XXX XXX" 
                    value={subDriverPhone} 
                    onChange={(e) => setSubDriverPhone(e.target.value)} 
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="undecided" className="mt-4">
            <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 p-6 text-center">
              <HelpCircle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-amber-400">Execution Undecided</p>
              <p className="text-xs text-muted-foreground mt-1">
                This leg will be marked as pending decision. You can assign execution later.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Assignment
          </Button>
        </DialogFooter>

        {/*
          IMPORTANT: the QuickCreatePartnerDialog MUST be rendered inside
          the parent DialogContent (not as a sibling of <Dialog>). Radix
          UI's DismissableLayer detects nested dialogs via the React tree,
          not the DOM portal layout — when the inner dialog is a sibling,
          Radix treats it as an independent layer at the SAME level as
          the parent, so:
            • Clicks inside the inner dialog look like "click outside" to
              the parent, dismissing both.
            • The parent's FocusScope competes with the inner's, leaving
              the inner dialog's inputs unfocusable (the "I cannot type
              anything" bug).
          By nesting it here, Radix sees the inner as a child layer and:
            • Properly stacks DismissableLayers (inner blocks outer's
              outside-click detection).
            • Hands off focus trapping to the topmost FocusScope.
          Both portals still render to document.body, so visual stacking
          is unaffected.
        */}
        <QuickCreatePartnerDialog
          open={showCreateCarrier}
          onOpenChange={setShowCreateCarrier}
          adminId={adminId}
          suggestedName={carrierSearch}
          defaultType="carrier"
          onCreated={handleCarrierCreated}
        />
      </DialogContent>
    </Dialog>
  );
}
