"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  MapPin,
  Package,
  DollarSign,
  Percent,
  Truck,
  ArrowRight,
  Calculator,
  Send,
  Save,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────
interface OrderStop {
  id: string;
  sequence_order: number;
  stop_type: string;
  company_name: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  planned_date: string | null;
  planned_time_from: string | null;
  planned_time_to: string | null;
  reference_number: string | null;
  notes: string | null;
}

interface TripLeg {
  id: string;
  leg_number: number;
  from_stop_index: number | null;
  to_stop_index: number | null;
  carrier_id: string | null;
  carrier_cost: number | null;
  carrier_currency: string | null;
  status: string | null;
}

interface Order {
  id: string;
  reference_number: string | null;
  customer_price: number | null;
  customer_currency: string | null;
  carrier_cost: number | null;
  carrier_currency: string | null;
  margin: number | null;
  estimated_distance_km: number | null;
  weight_kg: number | null;
  volume_m3: number | null;
  pallet_count: number | null;
  loading_meters: number | null;
  cargo_description: string | null;
  adr_class: string | null;
  temperature_min: number | null;
  temperature_max: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  order: Order;
  stops: OrderStop[];
  tripLegs: TripLeg[];
  adminId: string;
  onCreated?: (offerId: string) => void;
}

const CURRENCIES = ["EUR", "USD", "GBP", "RON", "HUF", "PLN", "CZK", "CHF"];
const VEHICLE_TYPES = [
  "Standard Truck",
  "Mega Trailer",
  "Tautliner",
  "Box Truck",
  "Refrigerated",
  "Flatbed",
  "Tanker",
  "Container",
  "Van",
  "Jumbo",
  "Low Loader",
];

function generateReference() {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = (now.getMonth() + 1).toString().padStart(2, "0");
  const dd = now.getDate().toString().padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `FX-${yy}${mm}${dd}-${rand}`;
}

function fmtCurrency(amount: number | null | undefined, currency = "EUR") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Country flag helper
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

function CountryFlag({ country, className = "w-5 h-3.5" }: { country: string | null | undefined; className?: string }) {
  const code = getCountryCode(country);
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt={country || ""}
      className={`${className} rounded-sm object-cover shrink-0`}
      crossOrigin="anonymous"
    />
  );
}

export function CreateExchangeOfferDialog({
  open,
  onOpenChange,
  order,
  stops,
  tripLegs,
  adminId,
  onCreated,
}: Props) {
  const supabase = createClient();
  const { toast } = useToast();

  // ─── Scope selection (whole order or specific leg) ───────
  const [scope, setScope] = useState<"order" | string>("order"); // "order" or leg id
  const selectedLeg = tripLegs.find((l) => l.id === scope);

  // ─── Stop selection ──────────────────────────────────────
  const availableStops = useMemo(() => {
    if (scope === "order") return stops;
    if (!selectedLeg) return stops;
    // Filter to leg's stop range
    const from = selectedLeg.from_stop_index ?? 0;
    const to = selectedLeg.to_stop_index ?? stops.length - 1;
    return stops.filter((s) => s.sequence_order >= from && s.sequence_order <= to);
  }, [scope, selectedLeg, stops]);

  const [selectedStopIds, setSelectedStopIds] = useState<Set<string>>(new Set());

  // Initialize stop selection when dialog opens or scope changes
  useEffect(() => {
    setSelectedStopIds(new Set(availableStops.map((s) => s.id)));
  }, [availableStops]);

  const toggleStop = (id: string) => {
    setSelectedStopIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Pricing mode ────────────────────────────────────────
  const [pricingMode, setPricingMode] = useState<"margin" | "km">("margin");
  const [marginPercent, setMarginPercent] = useState<string>(
    order.margin != null ? String(Math.round(order.margin)) : "15"
  );
  const [ratePerKm, setRatePerKm] = useState<string>("1.20");
  const [currency, setCurrency] = useState<string>(order.customer_currency || "EUR");
  const [manualPrice, setManualPrice] = useState<string>("");

  // Source pricing
  const customerPrice = order.customer_price ?? 0;
  const distanceKm = order.estimated_distance_km ?? 0;

  // Calculated suggested price
  const calculatedPrice = useMemo(() => {
    if (pricingMode === "margin") {
      const margin = parseFloat(marginPercent) || 0;
      return customerPrice * (1 - margin / 100);
    } else {
      const rate = parseFloat(ratePerKm) || 0;
      return distanceKm * rate;
    }
  }, [pricingMode, marginPercent, ratePerKm, customerPrice, distanceKm]);

  // Final price (manual override or calculated)
  const finalPrice = manualPrice ? parseFloat(manualPrice) : calculatedPrice;

  // Implied margin for display
  const impliedMargin = customerPrice > 0 ? ((customerPrice - finalPrice) / customerPrice) * 100 : 0;

  // ─── Additional fields ───────────────────────────────────
  const [vehicleType, setVehicleType] = useState<string>("Standard Truck");
  const [notes, setNotes] = useState<string>("");

  // ─── Save state ──────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<"draft" | "publish" | null>(null);

  // ─── Create offer ────────────────────────────────────────
  const handleSave = useCallback(
    async (publish: boolean) => {
      const selected = availableStops.filter((s) => selectedStopIds.has(s.id));
      if (selected.length < 2) {
        toast({
          title: "Select at least 2 stops",
          description: "An offer needs a loading and unloading point",
          variant: "destructive",
        });
        return;
      }

      setSaving(true);
      setSaveMode(publish ? "publish" : "draft");

      try {
        const reference = generateReference();
        const firstStop = selected[0];
        const lastStop = selected[selected.length - 1];

        // Build offer payload
        const payload = {
          admin_id: adminId,
          reference,
          order_id: order.id,
          trip_leg_id: scope !== "order" ? scope : null,
          title: `${order.reference_number || "Order"} - ${firstStop.city || firstStop.country} → ${lastStop.city || lastStop.country}`,
          status: publish ? "published" : "draft",
          published_at: publish ? new Date().toISOString() : null,
          visibility: "private",
          // Origin
          origin_company: firstStop.company_name || null,
          origin_address: firstStop.address || null,
          origin_city: firstStop.city || null,
          origin_postal_code: firstStop.postal_code || null,
          origin_country: firstStop.country || null,
          origin_lat: firstStop.lat,
          origin_lng: firstStop.lng,
          load_date_from: firstStop.planned_date || null,
          load_date_to: firstStop.planned_date || null,
          // Destination
          dest_company: lastStop.company_name || null,
          dest_address: lastStop.address || null,
          dest_city: lastStop.city || null,
          dest_postal_code: lastStop.postal_code || null,
          dest_country: lastStop.country || null,
          dest_lat: lastStop.lat,
          dest_lng: lastStop.lng,
          unload_date_from: lastStop.planned_date || null,
          unload_date_to: lastStop.planned_date || null,
          // Cargo
          weight_kg: order.weight_kg || null,
          volume_m3: order.volume_m3 || null,
          pallet_count: order.pallet_count || null,
          ldm: order.loading_meters || null,
          goods_description: order.cargo_description || null,
          adr_class: order.adr_class || null,
          temp_min: order.temperature_min || null,
          temp_max: order.temperature_max || null,
          // Vehicle
          vehicle_type: vehicleType,
          // Pricing
          pricing_mode: finalPrice > 0 ? "fixed" : "open",
          price_amount: finalPrice > 0 ? finalPrice : null,
          currency,
          notes: notes || null,
        };

        // Insert offer
        const { data: offerData, error: offerError } = await supabase
          .from("freight_offers")
          .insert(payload)
          .select("id")
          .single();

        if (offerError) throw offerError;
        const offerId = offerData.id;

        // Insert stops
        const stopPayloads = selected.map((s, idx) => ({
          admin_id: adminId,
          offer_id: offerId,
          sequence_order: idx,
          stop_type: s.stop_type === "load" ? "load" : s.stop_type === "unload" ? "unload" : "intermediate",
          company_name: s.company_name || null,
          address: s.address || null,
          city: s.city || null,
          postal_code: s.postal_code || null,
          country: s.country || null,
          lat: s.lat,
          lng: s.lng,
          contact_name: s.contact_name || null,
          contact_phone: s.contact_phone || null,
          date_from: s.planned_date || null,
          date_to: s.planned_date || null,
          time_from: s.planned_time_from || null,
          time_to: s.planned_time_to || null,
          reference_number: s.reference_number || null,
          notes: s.notes || null,
        }));

        const { error: stopsError } = await supabase.from("freight_offer_stops").insert(stopPayloads);
        if (stopsError) throw stopsError;

        toast({
          title: publish ? "Offer Published" : "Offer Created",
          description: `${reference} ${publish ? "is now live on the exchange" : "saved as draft"}`,
        });

        onOpenChange(false);
        onCreated?.(offerId);
      } catch (err: any) {
        console.error("Create offer error:", err);
        toast({
          title: "Error",
          description: err?.message || "Failed to create offer",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
        setSaveMode(null);
      }
    },
    [
      adminId,
      order,
      scope,
      availableStops,
      selectedStopIds,
      vehicleType,
      finalPrice,
      currency,
      notes,
      supabase,
      toast,
      onOpenChange,
      onCreated,
    ]
  );

  // ─── Render ──────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Publish on Freight Exchange
          </DialogTitle>
          <DialogDescription>
            Create a freight offer from order {order.reference_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Scope Selection */}
          {tripLegs.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Scope</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="order">Entire Order</SelectItem>
                  {tripLegs.map((leg) => (
                    <SelectItem key={leg.id} value={leg.id}>
                      Leg {leg.leg_number}
                      {leg.carrier_id && " (already assigned)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Stops Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" />
              Stops ({selectedStopIds.size} selected)
            </Label>
            <div className="border border-border rounded-lg divide-y divide-border max-h-[200px] overflow-y-auto">
              {availableStops.map((stop, idx) => (
                <div
                  key={stop.id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors ${
                    selectedStopIds.has(stop.id) ? "bg-primary/5" : ""
                  }`}
                  onClick={() => toggleStop(stop.id)}
                >
                  <Checkbox checked={selectedStopIds.has(stop.id)} />
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${
                        stop.stop_type === "load"
                          ? "border-blue-500/50 text-blue-600"
                          : stop.stop_type === "unload"
                          ? "border-emerald-500/50 text-emerald-600"
                          : "border-amber-500/50 text-amber-600"
                      }`}
                    >
                      {stop.stop_type === "load" ? "Load" : stop.stop_type === "unload" ? "Unload" : "Stop"}
                    </Badge>
                    <CountryFlag country={stop.country} className="w-4 h-3" />
                    <span className="text-sm truncate">
                      {stop.city || stop.address || stop.company_name || "—"}
                    </span>
                    {stop.planned_date && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(stop.planned_date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Smart Pricing */}
          <div className="space-y-3 p-4 bg-muted/20 rounded-lg border border-border/50">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5" />
                Pricing Calculator
              </Label>
              <Tabs value={pricingMode} onValueChange={(v) => setPricingMode(v as "margin" | "km")}>
                <TabsList className="h-7">
                  <TabsTrigger value="margin" className="text-xs h-6 px-2" disabled={!customerPrice}>
                    <Percent className="h-3 w-3 mr-1" />
                    Margin %
                  </TabsTrigger>
                  <TabsTrigger value="km" className="text-xs h-6 px-2" disabled={!distanceKm}>
                    <Truck className="h-3 w-3 mr-1" />
                    €/km
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Source info */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2 bg-background/50 rounded border border-border/30">
                <span className="text-muted-foreground">Customer Price</span>
                <p className="font-semibold text-sm">
                  {customerPrice > 0 ? fmtCurrency(customerPrice, order.customer_currency || "EUR") : "Not set"}
                </p>
              </div>
              <div className="p-2 bg-background/50 rounded border border-border/30">
                <span className="text-muted-foreground">Est. Distance</span>
                <p className="font-semibold text-sm">{distanceKm > 0 ? `${distanceKm.toLocaleString()} km` : "Not set"}</p>
              </div>
            </div>

            {/* Input based on mode */}
            <div className="flex items-end gap-3">
              {pricingMode === "margin" ? (
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Target Margin %</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="number"
                      step="0.5"
                      value={marginPercent}
                      onChange={(e) => {
                        setMarginPercent(e.target.value);
                        setManualPrice("");
                      }}
                      className="h-9"
                      placeholder="15"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              ) : (
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Rate per km</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="number"
                      step="0.01"
                      value={ratePerKm}
                      onChange={(e) => {
                        setRatePerKm(e.target.value);
                        setManualPrice("");
                      }}
                      className="h-9"
                      placeholder="1.20"
                    />
                    <span className="text-sm text-muted-foreground">{currency}/km</span>
                  </div>
                </div>
              )}

              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Carrier Price (or override)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    step="0.01"
                    value={manualPrice || calculatedPrice.toFixed(2)}
                    onChange={(e) => setManualPrice(e.target.value)}
                    className="h-9 font-semibold"
                  />
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="w-20 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Result summary */}
            <div className="flex items-center justify-between pt-2 border-t border-border/30">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-muted-foreground">
                  Offer Price:{" "}
                  <span className="font-semibold text-foreground">{fmtCurrency(finalPrice, currency)}</span>
                </span>
                {customerPrice > 0 && (
                  <span className="text-muted-foreground">
                    Implied Margin:{" "}
                    <span className={`font-semibold ${impliedMargin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {impliedMargin.toFixed(1)}%
                    </span>
                  </span>
                )}
              </div>
              <Calculator className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          {/* Vehicle & Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Vehicle Type</Label>
              <Select value={vehicleType} onValueChange={setVehicleType}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_TYPES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 min-h-[36px] mt-1 resize-none"
                placeholder="Additional info for carriers…"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
            {saving && saveMode === "draft" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save as Draft
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving}>
            {saving && saveMode === "publish" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Publish Offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
