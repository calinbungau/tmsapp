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
          // First, check if a FWD order already exists for this leg via junction table
          const { data: existingLink } = await supabase
            .from("forwarding_order_legs")
            .select("forwarding_order_id, forwarding_order:orders(id, reference_number)")
            .eq("trip_leg_id", tripLeg.id)
            .maybeSingle();
          
          if (existingLink?.forwarding_order_id) {
            // FWD order already exists via junction - just use it, don't create new
            linkedFwdOrderId = existingLink.forwarding_order_id;
            linkedFwdOrderRef = (existingLink.forwarding_order as any)?.reference_number || "";
            console.log("[v0] TripLegAssignmentDialog: FWD order already exists for this leg:", linkedFwdOrderId);
          } else {
            // Create new FWD order with proper reference number and full details
            // First, fetch parent order details with stops
            console.log("[v0] TripLegAssignmentDialog: Fetching parent order:", parentOrderId);
            const { data: parentOrder, error: parentOrderErr } = await supabase
              .from("orders")
              .select("*, order_stops(*)")
              .eq("id", parentOrderId)
              .single();

            // Pull the company-level default payment terms so the carrier
            // payment window on the new FWD matches what the operator
            // configured in Settings → Company Profile → Defaults (e.g. 45)
            // instead of falling back to a hardcoded 30. Customer-side
            // terms are inherited from the parent order when available,
            // and default to the same company value otherwise so the two
            // never diverge silently.
            const { data: companyProfile } = await supabase
              .from("company_profiles")
              .select("default_payment_terms_days")
              .eq("admin_id", adminId)
              .maybeSingle();
            const defaultPaymentDays =
              (companyProfile as any)?.default_payment_terms_days ?? 30;
            const carrierPaymentDays =
              (parentOrder as any)?.payment_terms_carrier_days ?? defaultPaymentDays;
            const customerPaymentDays =
              (parentOrder as any)?.payment_terms_customer_days ?? defaultPaymentDays;
            console.log(
              "[v0] TripLegAssignmentDialog: payment terms resolved",
              { defaultPaymentDays, carrierPaymentDays, customerPaymentDays },
            );
            
            console.log("[v0] TripLegAssignmentDialog: Parent order fetched:", {
              orderId: parentOrder?.id,
              stopsCount: parentOrder?.order_stops?.length,
              stopsData: parentOrder?.order_stops?.map((s: any) => ({ city: s.city, seq: s.sequence_order })),
              error: parentOrderErr?.message
            });
            
            // Get next reference number from series API
            let newRef = `VMK-${Date.now()}`;
            try {
              const seriesRes = await fetch("/api/series/next-number", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entity_type: "forwarding_order", admin_id: adminId }),
              });
              const seriesData = await seriesRes.json();
              if (seriesData.number) newRef = seriesData.number;
            } catch { /* Use fallback */ }
            
            const { data: newFwdOrder, error: fwdInsertErr } = await supabase
              .from("orders")
              .insert({
                admin_id: adminId,
                // Stamp the actual logged-in user so the dispatcher
                // resolves to their linked employee on the Forwarder Board.
                created_by: creatorId,
                reference_number: newRef,
                order_type: "forwarding",
                commercial_role: "carrier_subcontract",
                parent_order_id: parentOrderId,
                carrier_id: carrierId,
                customer_id: parentOrder?.customer_id,
                customer_reference: parentOrder?.customer_reference,
                status: "fwd_assigned_to_carrier",
                is_draft: false,
                // Copy cargo details from parent (so the carrier sees what
                // they're hauling: ADR class, temperature window, stackability,
                // volume, etc. — same data block we send on the PDF).
                cargo_description: parentOrder?.cargo_description,
                weight_kg: parentOrder?.weight_kg,
                volume_m3: parentOrder?.volume_m3,
                pallet_count: parentOrder?.pallet_count,
                loading_meters: parentOrder?.loading_meters,
                goods_type: parentOrder?.goods_type,
                adr_class: parentOrder?.adr_class,
                temperature_min: parentOrder?.temperature_min,
                temperature_max: parentOrder?.temperature_max,
                stackable: parentOrder?.stackable,
                special_instructions: parentOrder?.special_instructions,
                internal_notes: parentOrder?.internal_notes,
                // Copy customer pricing from parent order
                customer_price: parentOrder?.customer_price,
                customer_currency: parentOrder?.customer_currency,
                customer_vat_rate: parentOrder?.customer_vat_rate,
                customer_vat_type: parentOrder?.customer_vat_type,
                customer_vat_amount: parentOrder?.customer_vat_amount,
                customer_price_without_vat: parentOrder?.customer_price_without_vat,
                customer_price_with_vat: parentOrder?.customer_price_with_vat,
                // Payment terms — carrier window is taken from the
                // company default (Settings → Company Profile), customer
                // window mirrors whatever the parent order already has
                // so the dispatcher doesn't have to retype it after
                // every leg split. Both are still editable on the
                // resulting FWD order page.
                payment_terms_carrier_days: carrierPaymentDays,
                payment_terms_customer_days: customerPaymentDays,
              })
              .select()
              .single();
            
            console.log("[v0] TripLegAssignmentDialog: FWD order created:", newFwdOrder?.id, "ref:", newFwdOrder?.reference_number, "error:", fwdInsertErr?.message);
          
            if (newFwdOrder) {
              linkedFwdOrderId = newFwdOrder.id;
              linkedFwdOrderRef = newRef;

              // ---- BUILD LEG-SPECIFIC STOPS ---------------------------------
              //
              // CRITICAL: a leg's endpoints are NOT always parent order_stops.
              // A leg often starts/ends at a SWAP POINT (e.g. Oradea), which
              // is a trip-leg-only concept that lives in `trip_stops` but
              // NOT in the parent order's `order_stops`. The previous logic
              // sliced `order_stops` by `from_stop_index`/`to_stop_index`,
              // which produced the wrong result whenever a swap point was
              // involved:
              //   • Leg 1 (Nyíregyháza→Oradea): sliced both Nyíregyháza
              //     AND Heerenberg from parent, so the FWD order ended at
              //     Heerenberg (wrong — should have ended at Oradea).
              //   • Leg 2 (Oradea→Heerenberg): sliced only Heerenberg, so
              //     the FWD order had no loading stop at all.
              //
              // Correct source of truth: `trip_legs.origin_stop_id` and
              // `destination_stop_id` (FKs to `trip_stops`). The two
              // trip_stops contain real lat/lng/city/address for both real
              // and swap-point stops.
              //
              // Algorithm:
              //   1. Fetch the leg row to get its origin_stop_id +
              //      destination_stop_id (these aren't passed into the
              //      dialog props).
              //   2. Fetch those two trip_stops.
              //   3. Map them to order_stops:
              //        origin → stop_type = "pickup"    (carrier loads here)
              //        destination → stop_type = "delivery" (carrier unloads here)
              //
              // Fallbacks (in priority order) if data is missing:
              //   - origin/destination_stop_id null → use leg's
              //     origin_address/destination_address + from_city/to_city
              //     to synthesize minimal stops.
              //   - that's also missing → fall back to the legacy slice
              //     logic (keeps the old behavior for pre-migration legs).
              const { data: legRow } = await supabase
                .from("trip_legs")
                .select("origin_stop_id, destination_stop_id, origin_address, destination_address, trip_id, leg_number")
                .eq("id", tripLeg.id)
                .single();
              console.log("[v0] TripLegAssignmentDialog: legRow fetched:", {
                trip_id: (legRow as any)?.trip_id,
                leg_number: (legRow as any)?.leg_number,
                origin_stop_id: legRow?.origin_stop_id,
                destination_stop_id: legRow?.destination_stop_id,
                origin_address: legRow?.origin_address,
                destination_address: legRow?.destination_address,
              });

              let legStops: any[] = [];

              // Build a lookup of parent order_stops by id so we can enrich
              // each trip_stop with order-level metadata (reference number,
              // notes, contact info, geofence settings, form id, etc).
              // The carrier expects the SAME information they would have
              // received on the original transport order — not just the
              // raw geographic point from the trip_stop row.
              const parentStopById = new Map<string, any>();
              for (const ps of (parentOrder?.order_stops || [])) {
                parentStopById.set(ps.id, ps);
              }

              // ─────────────────────────────────────────────────────────────
              // PRIORITY 0 — SEQUENCE-ORDER BASED LOOKUP (the real fix)
              // ─────────────────────────────────────────────────────────────
              //
              // Why this is the primary path:
              //
              // The DB reality (verified for INT-2026-502029 and others):
              //   • trip_legs.origin_stop_id and destination_stop_id are
              //     usually NULL — they were never backfilled by the
              //     dispatch dialog.
              //   • trip_stops.leg_id is also NULL — leg→stop linkage is
              //     NOT carried by an FK at all.
              //   • The TRUE linkage is implicit: trip_stops are ordered
              //     by sequence_order along the trip, and Leg N covers
              //     the segment from trip_stops[N-1] to trip_stops[N].
              //
              // For a 3-stop trip with a swap point:
              //   trip_stops[0] = pickup   (Nyíregyháza, has order_stop_id)
              //   trip_stops[1] = swap     (Oradea, NO order_stop_id, but
              //                             has full company/lat/lng/date
              //                             data the user entered)
              //   trip_stops[2] = delivery ('s Heerenberg, has order_stop_id)
              //
              //   Leg 1: origin = trip_stops[0], destination = trip_stops[1]
              //   Leg 2: origin = trip_stops[1], destination = trip_stops[2]
              //
              // This path handles swap points natively:
              //   • Customer pickup/delivery trip_stops are linked to
              //     parent order_stops via `order_stop_id` → we merge
              //     parent metadata into them (notes, references, contact,
              //     ADR remarks etc).
              //   • Swap trip_stops have no parent counterpart but they
              //     already carry full data (company "Swap - Oradea",
              //     address, lat/lng, date) entered by the dispatcher —
              //     so we use the trip_stop as-is.
              //
              // The legacy origin_stop_id FK path is kept below as a
              // safety net for any future flow that DOES populate those
              // FKs.
              // trip_id lives on the leg in the DB but isn't on the local
              // TripLeg type, so we read it via the freshly-fetched legRow
              // (which is the raw DB row) or fall back to a cast.
              const tripIdForLookup = (legRow as any)?.trip_id ?? (tripLeg as any).trip_id;
              const legNumberForLookup =
                typeof (legRow as any)?.leg_number === "number"
                  ? ((legRow as any).leg_number as number)
                  : typeof (tripLeg as any).leg_number === "number"
                    ? ((tripLeg as any).leg_number as number)
                    : null;
              console.log("[v0] TripLegAssignmentDialog: Priority 0 inputs:", { tripIdForLookup, legNumberForLookup });
              if (tripIdForLookup && legNumberForLookup !== null) {
                const { data: tripAllStops } = await supabase
                  .from("trip_stops")
                  .select("id, sequence_order, stop_type, city, country, postal_code, address, lat, lng, company_name, contact_name, contact_phone, contact_email, planned_date, planned_time_from, planned_time_to, notes, reference_number, order_stop_id, geofence_radius, auto_checkin, auto_checkout, form_id, action_type_id")
                  .eq("trip_id", tripIdForLookup)
                  .order("sequence_order", { ascending: true });

                console.log("[v0] TripLegAssignmentDialog: trip_stops fetched for Priority 0:", {
                  count: tripAllStops?.length ?? 0,
                  preview: (tripAllStops || []).map((ts: any) => ({ seq: ts.sequence_order, type: ts.stop_type, city: ts.city, hasOrderStopId: !!ts.order_stop_id })),
                });

                if (tripAllStops && tripAllStops.length >= 2) {
                  const legNumber = legNumberForLookup;
                  // Map leg_number (1-based) to trip_stops indices:
                  //   Leg 1 → indices [0, 1], Leg 2 → [1, 2], ...
                  const originIdx = legNumber - 1;
                  const destIdx = legNumber;
                  const originTs = tripAllStops[originIdx];
                  const destTs = tripAllStops[destIdx];

                  if (originTs && destTs && originTs.id !== destTs.id) {
                    // Helper: enrich a trip_stop with parent order_stop
                    // metadata. For non-swap stops this fills in notes,
                    // reference_number, contact, etc. that the trip_stop
                    // row may not carry. For swap stops there's no parent
                    // — we just keep the trip_stop data as-is.
                    const enrichWithParent = (ts: any) => {
                      const parent = ts.order_stop_id
                        ? parentStopById.get(ts.order_stop_id)
                        : null;
                      if (!parent) return ts;
                      return {
                        ...ts,
                        // String fields: trip_stop wins if non-empty,
                        // else fall back to parent.
                        company_name: ts.company_name || parent.company_name,
                        address: ts.address || parent.address,
                        city: ts.city || parent.city,
                        country: ts.country || parent.country,
                        postal_code: ts.postal_code || parent.postal_code,
                        contact_name: ts.contact_name || parent.contact_name,
                        contact_phone: ts.contact_phone || parent.contact_phone,
                        contact_email: ts.contact_email || parent.contact_email,
                        reference_number: ts.reference_number || parent.reference_number,
                        notes: ts.notes || parent.notes,
                        // Nullable date/time/numeric: keep trip_stop if
                        // non-null, else parent.
                        planned_date: ts.planned_date ?? parent.planned_date,
                        planned_time_from: ts.planned_time_from ?? parent.planned_time_from,
                        planned_time_to: ts.planned_time_to ?? parent.planned_time_to,
                        geofence_radius: ts.geofence_radius ?? parent.geofence_radius,
                        auto_checkin: ts.auto_checkin ?? parent.auto_checkin,
                        auto_checkout: ts.auto_checkout ?? parent.auto_checkout,
                        form_id: ts.form_id ?? parent.form_id,
                      };
                    };

                    legStops = [
                      { ...enrichWithParent(originTs), stop_type: "pickup" },
                      { ...enrichWithParent(destTs), stop_type: "delivery" },
                    ];
                    console.log("[v0] TripLegAssignmentDialog: Built leg stops via sequence_order lookup:", {
                      legNumber,
                      originIdx,
                      destIdx,
                      totalTripStops: tripAllStops.length,
                      origin: { city: originTs.city, company: originTs.company_name, plannedDate: originTs.planned_date, fromParent: !!originTs.order_stop_id },
                      dest: { city: destTs.city, company: destTs.company_name, plannedDate: destTs.planned_date, fromParent: !!destTs.order_stop_id },
                    });
                  } else {
                    console.log("[v0] TripLegAssignmentDialog: sequence_order lookup could not resolve endpoints", {
                      legNumber,
                      originIdx,
                      destIdx,
                      totalTripStops: tripAllStops.length,
                    });
                  }
                }
              }

              // ─────────────────────────────────────────────────────────────
              // PRIORITY 1 — Legacy FK path (only runs if Priority 0 found
              // nothing, e.g. for legs that DO have origin_stop_id set).
              // ─────────────────────────────────────────────────────────────
              if (legStops.length === 0 && legRow?.origin_stop_id && legRow?.destination_stop_id) {
                // Preferred path: read both endpoints from trip_stops, then
                // merge in metadata from the linked parent order_stop (if
                // any). For swap points there's no parent order_stop so the
                // trip_stop data is the only source — that's fine.
                const { data: endpointStops } = await supabase
                  .from("trip_stops")
                  .select("id, city, country, postal_code, address, lat, lng, company_name, contact_name, contact_phone, contact_email, planned_date, planned_time_from, planned_time_to, notes, reference_number, order_stop_id, geofence_radius, auto_checkin, auto_checkout, form_id, action_type_id")
                  .in("id", [legRow.origin_stop_id, legRow.destination_stop_id]);

                const originTs = endpointStops?.find((s: any) => s.id === legRow.origin_stop_id);
                const destTs = endpointStops?.find((s: any) => s.id === legRow.destination_stop_id);

                // Merge trip_stop + parent order_stop. trip_stop takes
                // precedence for the FIELDS THAT IT HAS POPULATED, the
                // parent order_stop fills in everything else.
                //
                // CRITICAL fix: the previous version only merged when
                // `trip_stops.order_stop_id` was non-null. But the swap-
                // point creation flow doesn't always set order_stop_id on
                // the materialized trip_stop, even for stops that
                // correspond 1:1 to a parent order_stop. As a result the
                // FWD order's stops appeared empty (only city/address
                // were carried over from the trip_stop, all other fields
                // were null because no parent merge ever happened).
                //
                // Smart fallback: when order_stop_id is null, try to
                // match a parent order_stop by:
                //   1. Geographic proximity (lat/lng within ~10km), AND
                //   2. Compatible stop_type alignment with the requested
                //      target type ("pickup" → match parent's pickups;
                //      "delivery" → match parent's deliveries; if the
                //      parent only has one of each, prefer that).
                //
                // Swap-point intermediate stops (e.g. Oradea between two
                // legs) intentionally have NO matching parent order_stop
                // and we leave them as the trip_stop data alone — those
                // points are operational handoffs, not customer pickups
                // or deliveries.
                const matchParentByProximity = (ts: any, targetType: "pickup" | "delivery") => {
                  if (typeof ts.lat !== "number" || typeof ts.lng !== "number") return null;
                  const candidates = (parentOrder?.order_stops || []).filter((ps: any) => {
                    // Only consider parent stops of the matching role.
                    // "pickup" matches "pickup"/"loading", "delivery" matches "delivery"/"unloading".
                    const isCompatibleType =
                      (targetType === "pickup" && (ps.stop_type === "pickup" || ps.stop_type === "loading")) ||
                      (targetType === "delivery" && (ps.stop_type === "delivery" || ps.stop_type === "unloading"));
                    if (!isCompatibleType) return false;
                    if (typeof ps.lat !== "number" || typeof ps.lng !== "number") return false;
                    // Haversine-lite: degree distance squared, < 0.1 ≈ ~11km
                    const dLat = ps.lat - ts.lat;
                    const dLng = ps.lng - ts.lng;
                    return dLat * dLat + dLng * dLng < 0.01;
                  });
                  if (candidates.length === 0) return null;
                  // Pick the closest one if multiple match.
                  return candidates.sort((a: any, b: any) => {
                    const da = (a.lat - ts.lat) ** 2 + (a.lng - ts.lng) ** 2;
                    const db = (b.lat - ts.lat) ** 2 + (b.lng - ts.lng) ** 2;
                    return da - db;
                  })[0];
                };

                const mergeWithParent = (ts: any, targetType: "pickup" | "delivery") => {
                  // Priority 1: explicit FK (most reliable when set).
                  let parent = ts.order_stop_id ? parentStopById.get(ts.order_stop_id) : null;
                  // Priority 2: geographic + type-based proximity match.
                  if (!parent) parent = matchParentByProximity(ts, targetType);
                  if (!parent) return ts;
                  return {
                    ...ts,
                    // Prefer trip_stop value, fall back to parent. We use
                    // `||` (not `??`) for STRING fields so that empty
                    // strings on trip_stop also fall through to parent —
                    // the swap-point flow often stores `""` rather than
                    // `null`, which would otherwise short-circuit `??`.
                    company_name: ts.company_name || parent.company_name,
                    address: ts.address || parent.address,
                    city: ts.city || parent.city,
                    country: ts.country || parent.country,
                    postal_code: ts.postal_code || parent.postal_code,
                    contact_name: ts.contact_name || parent.contact_name,
                    contact_phone: ts.contact_phone || parent.contact_phone,
                    contact_email: ts.contact_email || parent.contact_email,
                    // Date/time fields: `??` is correct (null vs valid value).
                    planned_date: ts.planned_date ?? parent.planned_date,
                    planned_time_from: ts.planned_time_from ?? parent.planned_time_from,
                    planned_time_to: ts.planned_time_to ?? parent.planned_time_to,
                    reference_number: ts.reference_number || parent.reference_number,
                    geofence_radius: ts.geofence_radius ?? parent.geofence_radius,
                    auto_checkin: ts.auto_checkin ?? parent.auto_checkin,
                    auto_checkout: ts.auto_checkout ?? parent.auto_checkout,
                    form_id: ts.form_id ?? parent.form_id,
                    // Combine notes: trip_stop notes win, but if empty
                    // copy the parent's notes (often contains pallet
                    // breakdown, ADR remarks, dock #, etc).
                    notes: ts.notes || parent.notes,
                  };
                };

                if (originTs && destTs) {
                  legStops = [
                    { ...mergeWithParent(originTs, "pickup"), stop_type: "pickup" },
                    { ...mergeWithParent(destTs, "delivery"), stop_type: "delivery" },
                  ];
                  console.log("[v0] TripLegAssignmentDialog: Built leg stops from trip_stops endpoints (with parent metadata merged via FK + proximity fallback):", legStops.map((s) => ({ city: s.city, type: s.stop_type, ref: s.reference_number, company: s.company_name, hasNotes: !!s.notes, hasContact: !!s.contact_name, plannedDate: s.planned_date })));
                }
              }

              // Fallback A-prime: TEXT-MATCH against parent order_stops.
              //
              // When the trip_leg has no origin_stop_id / destination_stop_id
              // (and no trip_stops materialized for this leg yet — which is
              // exactly the state of "freshly added leg via the dispatch
              // dialog"), the leg only carries text fields:
              //   • origin_address (often just a city name like "Nyíregyháza")
              //   • destination_address (e.g. "'s Heerenberg")
              //
              // The parent transport order's order_stops DO contain full
              // operational data for those exact same cities/addresses
              // (company, lat/lng, postal code, contact, dates, notes,
              // reference). Match the leg's text fields against the parent
              // stops to recover the operational data instead of writing
              // empty FWD stops.
              //
              // Matching strategy: case-insensitive substring overlap on
              // either city OR address. The leg's `origin_address` very
              // often contains the parent stop's full address — so we test
              // whether the parent stop's city is contained in the leg
              // text, OR the parent address is. We also constrain by
              // stop_type role so we don't accidentally pair a pickup leg
              // origin with a delivery parent stop (relevant when the same
              // city appears as both pickup and delivery in a round trip).
              if (legStops.length === 0 && parentOrder?.order_stops?.length) {
                const norm = (s: string | null | undefined) => (s || "").toString().toLowerCase().trim();
                const originText = `${norm(legRow?.origin_address)} ${norm((tripLeg as any).from_city)} ${norm((tripLeg as any).origin_city)}`.trim();
                const destText = `${norm(legRow?.destination_address)} ${norm((tripLeg as any).to_city)} ${norm((tripLeg as any).destination_city)}`.trim();

                const findParentByText = (text: string, role: "origin" | "destination") => {
                  if (!text) return null;
                  const acceptedTypes = role === "origin"
                    ? ["pickup", "loading"]
                    : ["delivery", "unloading"];
                  // Sort parent stops by sequence_order so when multiple
                  // pickups share a city we still pick the right one
                  // (first pickup for the origin, last delivery for the
                  // destination).
                  const sorted = [...(parentOrder.order_stops || [])].sort(
                    (a: any, b: any) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0),
                  );
                  const candidates = sorted.filter((ps: any) => {
                    if (!acceptedTypes.includes(ps.stop_type)) return false;
                    const psCity = norm(ps.city);
                    const psAddr = norm(ps.address);
                    if (psCity && text.includes(psCity)) return true;
                    if (psAddr && text.includes(psAddr)) return true;
                    return false;
                  });
                  if (candidates.length === 0) return null;
                  // Origin → first matching pickup; destination → last
                  // matching delivery.
                  return role === "origin" ? candidates[0] : candidates[candidates.length - 1];
                };

                const originParent = findParentByText(originText, "origin");
                const destParent = findParentByText(destText, "destination");

                if (originParent && destParent && originParent.id !== destParent.id) {
                  legStops = [
                    { ...originParent, stop_type: "pickup" },
                    { ...destParent, stop_type: "delivery" },
                  ];
                  console.log("[v0] TripLegAssignmentDialog: Built leg stops via text-match against parent order_stops:", {
                    origin: { city: originParent.city, company: originParent.company_name, plannedDate: originParent.planned_date },
                    dest: { city: destParent.city, company: destParent.company_name, plannedDate: destParent.planned_date },
                  });
                } else {
                  console.log("[v0] TripLegAssignmentDialog: text-match fallback did not find matching parent stops", {
                    originText, destText,
                    foundOrigin: !!originParent,
                    foundDest: !!destParent,
                    sameStop: originParent && destParent && originParent.id === destParent.id,
                  });
                }
              }

              // Fallback A: synthesize minimal stops from leg's address
              // fields. Used when the leg doesn't have stop FKs yet AND
              // we couldn't text-match against parent order_stops (very
              // rare — the leg's address is unrelated to anything in the
              // parent order).
              if (legStops.length === 0 && (legRow?.origin_address || (tripLeg as any).from_city) && (legRow?.destination_address || (tripLeg as any).to_city)) {
                legStops = [
                  {
                    stop_type: "pickup",
                    company_name: null,
                    address: legRow?.origin_address || (tripLeg as any).from_city || "",
                    city: (tripLeg as any).from_city || legRow?.origin_address || "",
                    country: null,
                    postal_code: null,
                    lat: null,
                    lng: null,
                    planned_date: null,
                    planned_time_from: null,
                    planned_time_to: null,
                    notes: null,
                  },
                  {
                    stop_type: "delivery",
                    company_name: null,
                    address: legRow?.destination_address || (tripLeg as any).to_city || "",
                    city: (tripLeg as any).to_city || legRow?.destination_address || "",
                    country: null,
                    postal_code: null,
                    lat: null,
                    lng: null,
                    planned_date: null,
                    planned_time_from: null,
                    planned_time_to: null,
                    notes: null,
                  },
                ];
                console.log("[v0] TripLegAssignmentDialog: Built leg stops from address fields fallback");
              }

              // Fallback B (legacy): slice parent order_stops by indices.
              // Only used if BOTH preferred paths failed. Logged loudly so
              // we can spot it in production telemetry.
              if (legStops.length === 0 && parentOrder?.order_stops && parentOrder.order_stops.length > 0) {
                const sortedParentStops = [...parentOrder.order_stops].sort((a: any, b: any) => a.sequence_order - b.sequence_order);
                const fromIdx = tripLeg.from_stop_index ?? 0;
                const toIdx = tripLeg.to_stop_index ?? (sortedParentStops.length - 1);
                legStops = sortedParentStops.slice(fromIdx, toIdx + 1);
                console.log("[v0] TripLegAssignmentDialog: WARN - falling back to legacy parent-stop slice logic", { fromIdx, toIdx, count: legStops.length });
              }

              console.log("[v0] TripLegAssignmentDialog: Final legStops for FWD order:", legStops.length, "stops");

              if (legStops.length > 0) {
                // Create order_stops for the FWD order.
                // Use 1-based sequence_order. stop_type is already set
                // correctly per the source path above. We copy every
                // operationally-relevant field so the carrier-facing FWD
                // order is a faithful representation of the parent
                // transport order for this leg: company, address, contact
                // person, dock reference, time window, ADR/pallet notes,
                // geofence radius, auto check-in/out flags, attached form.
                const fwdStops = legStops.map((s: any, idx: number) => ({
                  order_id: newFwdOrder.id,
                  sequence_order: idx + 1,
                  stop_type: s.stop_type,
                  company_name: s.company_name,
                  address: s.address,
                  city: s.city,
                  country: s.country,
                  postal_code: s.postal_code,
                  lat: s.lat,
                  lng: s.lng,
                  contact_name: s.contact_name ?? null,
                  contact_phone: s.contact_phone ?? null,
                  contact_email: s.contact_email ?? null,
                  reference_number: s.reference_number ?? null,
                  planned_date: s.planned_date,
                  planned_time_from: s.planned_time_from,
                  planned_time_to: s.planned_time_to,
                  notes: s.notes,
                  geofence_radius: s.geofence_radius ?? null,
                  auto_checkin: s.auto_checkin ?? null,
                  auto_checkout: s.auto_checkout ?? null,
                  form_id: s.form_id ?? null,
                  status: "pending",
                }));
                console.log("[v0] TripLegAssignmentDialog: Inserting FWD order_stops:", fwdStops.map((s: any) => ({ city: s.city, type: s.stop_type, ref: s.reference_number, hasContact: !!s.contact_name })));
                const { data: insertedStops, error: fwdStopsErr } = await supabase.from("order_stops").insert(fwdStops).select();
                console.log("[v0] TripLegAssignmentDialog: FWD order_stops insert result:", fwdStopsErr?.message, "inserted:", insertedStops?.length);

                // ---- COMPUTE & PERSIST LEG ROUTE GEOMETRY -----------------
                //
                // Why this exists: the FWD order's Overview page renders a
                // RouteMap. The map needs either valid lat/lng on stops
                // (which we have now), OR a saved route_geometry on the
                // order (preferred — it avoids re-fetching from OSRM and
                // gives correct truck routing, distance, duration).
                //
                // The parent transport order has a route_geometry that
                // covers the ENTIRE trip across all legs. We can't reuse
                // it verbatim ��� each FWD order needs only the segment for
                // ITS leg. trip_stops.route_to_geometry stores per-segment
                // geometry (geometry from previous stop to this stop), and
                // distance_to_km/duration_to_minutes the segment metrics.
                //
                // Algorithm:
                //   1. Fetch all trip_stops where leg_id = tripLeg.id,
                //      ordered by sequence_order.
                //   2. The first stop is the leg origin and has no
                //      "incoming" segment — skip its route_to_geometry.
                //   3. Concatenate route_to_geometry of every subsequent
                //      stop (in the typical 2-stop leg, that's just the
                //      destination's geometry — exactly the leg's route).
                //   4. Sum distance_to_km and duration_to_minutes the same
                //      way.
                //   5. Save geometry + summed distance + summed duration
                //      (converted to hours) onto the FWD order.
                try {
                  const { data: legTripStops } = await supabase
                    .from("trip_stops")
                    .select("id, sequence_order, route_to_geometry, distance_to_km, duration_to_minutes")
                    .eq("leg_id", tripLeg.id)
                    .order("sequence_order", { ascending: true });

                  if (legTripStops && legTripStops.length >= 2) {
                    const concatenatedGeometry: [number, number][] = [];
                    let totalDistanceKm = 0;
                    let totalDurationMinutes = 0;
                    // Skip index 0 (origin has no incoming segment).
                    for (let i = 1; i < legTripStops.length; i++) {
                      const stop = legTripStops[i];
                      const geom = stop.route_to_geometry as [number, number][] | null;
                      if (Array.isArray(geom) && geom.length > 0) {
                        // Avoid duplicating the joining point between
                        // adjacent segments — drop the first coord of
                        // each segment after the first.
                        if (concatenatedGeometry.length === 0) {
                          concatenatedGeometry.push(...geom);
                        } else {
                          concatenatedGeometry.push(...geom.slice(1));
                        }
                      }
                      if (typeof stop.distance_to_km === "number") totalDistanceKm += stop.distance_to_km;
                      if (typeof stop.duration_to_minutes === "number") totalDurationMinutes += stop.duration_to_minutes;
                    }

                    if (concatenatedGeometry.length > 0 || totalDistanceKm > 0) {
                      const updatePayload: any = {};
                      if (concatenatedGeometry.length > 0) updatePayload.route_geometry = concatenatedGeometry;
                      if (totalDistanceKm > 0) updatePayload.estimated_distance_km = Math.round(totalDistanceKm * 10) / 10;
                      if (totalDurationMinutes > 0) updatePayload.estimated_duration_hours = Math.round((totalDurationMinutes / 60) * 100) / 100;
                      await supabase.from("orders").update(updatePayload).eq("id", newFwdOrder.id);
                      console.log("[v0] TripLegAssignmentDialog: FWD order route persisted:", { distance: updatePayload.estimated_distance_km, durationH: updatePayload.estimated_duration_hours, geomPoints: concatenatedGeometry.length });
                    } else {
                      console.log("[v0] TripLegAssignmentDialog: leg trip_stops have no route segments yet — FWD order will render route via on-the-fly OSRM lookup");
                    }
                  } else {
                    console.log("[v0] TripLegAssignmentDialog: not enough trip_stops for leg to derive route geometry (need ≥2):", legTripStops?.length);
                  }
                } catch (routeErr) {
                  console.log("[v0] TripLegAssignmentDialog: route geometry copy failed (non-fatal):", (routeErr as Error)?.message);
                }
                
                // Create a trip for the FWD order with trip_stops so it can be viewed/executed
                const { data: fwdTrip, error: tripErr } = await supabase
                  .from("trips")
                  .insert({
                    admin_id: adminId,
                    created_by: creatorId,
                    reference_number: `TRIP-FWD-${Date.now()}`,
                    assignment_type: "forwarding",
                  // Trip-level status is administrative metadata only; the
                  // user-facing lifecycle lives on trip_legs (Internal column
                  // in the v3 status spec). 'planned' here is a trip housekeeping
                  // value, not the leg status.
                    status: "planned",
                    carrier_id: carrierId,
                  })
                  .select()
                  .single();
                
                console.log("[v0] TripLegAssignmentDialog: FWD trip created:", fwdTrip?.id, "error:", tripErr?.message);
                
                if (fwdTrip) {
                  // Link trip to FWD order
                  await supabase.from("trip_orders").insert({ trip_id: fwdTrip.id, order_id: newFwdOrder.id });
                  
                  // Create trip_stops for the FWD order's trip.
                  // Mirror the same enriched data set we put into order_stops
                  // so the execution view shows full contact details,
                  // dock references, and dwell-time form attachments —
                  // not just city names.
                  const tripStops = (insertedStops || fwdStops).map((s: any, idx: number) => ({
                    trip_id: fwdTrip.id,
                    order_stop_id: s.id || null,
                    order_id: newFwdOrder.id,
                    sequence_order: idx,
                    stop_type: s.stop_type,
                    company_name: s.company_name,
                    address: s.address,
                    city: s.city,
                    country: s.country,
                    postal_code: s.postal_code,
                    lat: s.lat,
                    lng: s.lng,
                    contact_name: s.contact_name ?? null,
                    contact_phone: s.contact_phone ?? null,
                    contact_email: s.contact_email ?? null,
                    reference_number: s.reference_number ?? null,
                    planned_date: s.planned_date,
                    planned_time_from: s.planned_time_from,
                    planned_time_to: s.planned_time_to,
                    notes: s.notes,
                    geofence_radius: s.geofence_radius ?? null,
                    auto_checkin: s.auto_checkin ?? null,
                    auto_checkout: s.auto_checkout ?? null,
                    form_id: s.form_id ?? null,
                    status: "pending",
                  }));
                  const { error: tripStopsErr } = await supabase.from("trip_stops").insert(tripStops);
                  console.log("[v0] TripLegAssignmentDialog: FWD trip_stops inserted:", tripStops.length, "error:", tripStopsErr?.message);
                  
                  // Create a single trip_leg for the FWD order's trip.
                  // Copy vehicle / trailer / driver from the parent
                  // order's leg (whatever the operator just entered in
                  // this dialog) so the carrier and the printed FWD
                  // PDF both surface the assigned truck and driver.
                  const { error: legErr } = await supabase.from("trip_legs").insert({
                    trip_id: fwdTrip.id,
                    leg_number: 1,
                    assignment_type: "forwarding",
                    // Forwarding legs start "assigned" because the carrier is
                    // already chosen — the visible execution lifecycle from
                    // here on lives on the FWD child order's fwd_* status.
                    status: "assigned",
                    carrier_id: carrierId,
                    from_stop_index: 0,
                    to_stop_index: tripStops.length - 1,
                    subcontractor_vehicle_plate: subVehiclePlate || null,
                    subcontractor_trailer_plate: subTrailerPlate || null,
                    subcontractor_driver_name: subDriverName || null,
                    subcontractor_driver_phone: subDriverPhone || null,
                  });
                  console.log("[v0] TripLegAssignmentDialog: FWD trip_leg created, error:", legErr?.message);
                  
                  // Link FWD order to its execution trip
                  await supabase.from("orders").update({ execution_trip_id: fwdTrip.id }).eq("id", newFwdOrder.id);
                }
              } else {
                console.log("[v0] TripLegAssignmentDialog: ERROR - Could not build any stops for FWD order. Leg has no origin/destination_stop_id, no address fields, and parent has no order_stops.");
              }
              
              // Link parent order's leg to new FWD order via junction table
              await supabase.from("forwarding_order_legs").delete().eq("trip_leg_id", tripLeg.id);
              await supabase.from("forwarding_order_legs").insert({
                forwarding_order_id: newFwdOrder.id,
                trip_leg_id: tripLeg.id,
              });
            }
          }
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
