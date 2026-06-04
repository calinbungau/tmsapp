"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  Save,
  Loader2,
  MapPin,
  Calendar,
  Package,
  DollarSign,
  FileText,
  Truck,
  Thermometer,
  Plus,
  Trash2,
  GripVertical,
  Phone,
  Building2,
  ArrowDown,
  ArrowUp,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddressAutocomplete, ParsedAddress } from "@/components/ui/address-autocomplete";

// ─── Constants ─────────────────────────────────────────────
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

const BODY_TYPES = [
  "Tarpaulin",
  "Box",
  "Refrigerated",
  "Tanker",
  "Flatbed",
  "Container",
  "Walking Floor",
  "Silo",
  "Dump",
];

const ADR_CLASSES = [
  "None",
  "ADR 1 - Explosives",
  "ADR 2 - Gases",
  "ADR 3 - Flammable Liquids",
  "ADR 4.1 - Flammable Solids",
  "ADR 4.2 - Spontaneous Combustion",
  "ADR 4.3 - Water Reactive",
  "ADR 5.1 - Oxidizers",
  "ADR 5.2 - Organic Peroxides",
  "ADR 6.1 - Toxic Substances",
  "ADR 6.2 - Infectious Substances",
  "ADR 7 - Radioactive",
  "ADR 8 - Corrosives",
  "ADR 9 - Miscellaneous",
];

const CURRENCIES = ["EUR", "USD", "GBP", "RON", "HUF", "PLN", "CZK", "CHF"];

const STOP_TYPES = [
  { value: "load", label: "Loading", color: "text-blue-600" },
  { value: "unload", label: "Unloading", color: "text-emerald-600" },
  { value: "intermediate", label: "Intermediate", color: "text-amber-600" },
];

// ─── Country flag helper ──────────────────────────────────
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

// ─── Types ────────────────────────────────────────────────
interface Stop {
  id: string;
  stop_type: "load" | "unload" | "intermediate";
  company_name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  lat: number | null;
  lng: number | null;
  contact_name: string;
  contact_phone: string;
  date_from: string;
  date_to: string;
  time_from: string;
  time_to: string;
  reference_number: string;
  notes: string;
}

interface FormData {
  title: string;
  vehicle_type: string;
  body_type: string;
  length_m: string;
  weight_kg: string;
  ldm: string;
  pallet_count: string;
  volume_m3: string;
  adr_class: string;
  temp_min: string;
  temp_max: string;
  goods_description: string;
  pricing_mode: string;
  price_amount: string;
  currency: string;
  payment_terms_days: string;
  notes: string;
}

const createEmptyStop = (type: "load" | "unload" | "intermediate"): Stop => ({
  id: crypto.randomUUID(),
  stop_type: type,
  company_name: "",
  address: "",
  city: "",
  postal_code: "",
  country: "",
  lat: null,
  lng: null,
  contact_name: "",
  contact_phone: "",
  date_from: "",
  date_to: "",
  time_from: "",
  time_to: "",
  reference_number: "",
  notes: "",
});

const initialFormData: FormData = {
  title: "",
  vehicle_type: "",
  body_type: "",
  length_m: "",
  weight_kg: "",
  ldm: "",
  pallet_count: "",
  volume_m3: "",
  adr_class: "",
  temp_min: "",
  temp_max: "",
  goods_description: "",
  pricing_mode: "open",
  price_amount: "",
  currency: "EUR",
  payment_terms_days: "",
  notes: "",
};

// ─── Reference generator ─────────────────────────────────
function generateReference() {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = (now.getMonth() + 1).toString().padStart(2, "0");
  const dd = now.getDate().toString().padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `FX-${yy}${mm}${dd}-${rand}`;
}

// ─── Page ─────────────────────────────────────────────────
export default function NewFreightOfferPage() {
  const { session: adminSession } = useAdminSession();
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<FormData>(initialFormData);
  const [stops, setStops] = useState<Stop[]>([
    createEmptyStop("load"),
    createEmptyStop("unload"),
  ]);
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<"draft" | "publish" | null>(null);

  // Update form field
  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Update stop field
  const updateStop = (id: string, field: keyof Stop, value: any) => {
    setStops((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  // Handle address selection
  const handleAddressSelect = (stopId: string, result: ParsedAddress) => {
    setStops((prev) =>
      prev.map((s) =>
        s.id === stopId
          ? {
              ...s,
              address: result.address,
              city: result.city,
              postal_code: result.postalCode,
              country: result.country,
              lat: result.lat,
              lng: result.lng,
            }
          : s
      )
    );
  };

  // Add stop
  const addStop = (type: "load" | "unload" | "intermediate") => {
    setStops((prev) => [...prev, createEmptyStop(type)]);
  };

  // Remove stop
  const removeStop = (id: string) => {
    if (stops.length <= 2) {
      toast({ title: "Minimum stops", description: "At least 2 stops required", variant: "destructive" });
      return;
    }
    setStops((prev) => prev.filter((s) => s.id !== id));
  };

  // Move stop
  const moveStop = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= stops.length) return;
    const newStops = [...stops];
    [newStops[index], newStops[newIndex]] = [newStops[newIndex], newStops[index]];
    setStops(newStops);
  };

  // Save offer
  const handleSave = async (publish = false) => {
    if (!adminSession?.id) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      return;
    }

    // Validate stops
    const firstStop = stops[0];
    const lastStop = stops[stops.length - 1];
    if (!firstStop.city && !firstStop.country) {
      toast({ title: "Missing origin", description: "First stop needs at least city or country", variant: "destructive" });
      return;
    }
    if (!lastStop.city && !lastStop.country) {
      toast({ title: "Missing destination", description: "Last stop needs at least city or country", variant: "destructive" });
      return;
    }

    setSaving(true);
    setSaveMode(publish ? "publish" : "draft");
    try {
      const reference = generateReference();

      // Build offer payload with first/last stop for backwards compatibility
      const payload = {
        admin_id: adminSession.id,
        reference,
        title: form.title || null,
        status: publish ? "published" : "draft",
        published_at: publish ? new Date().toISOString() : null,
        visibility: "private",
        // Origin (first stop) - for backwards compatibility
        origin_company: firstStop.company_name || null,
        origin_address: firstStop.address || null,
        origin_city: firstStop.city || null,
        origin_postal_code: firstStop.postal_code || null,
        origin_country: firstStop.country || null,
        origin_lat: firstStop.lat,
        origin_lng: firstStop.lng,
        // Destination (last stop) - for backwards compatibility
        dest_company: lastStop.company_name || null,
        dest_address: lastStop.address || null,
        dest_city: lastStop.city || null,
        dest_postal_code: lastStop.postal_code || null,
        dest_country: lastStop.country || null,
        dest_lat: lastStop.lat,
        dest_lng: lastStop.lng,
        // Schedule from first/last stops
        load_date_from: firstStop.date_from || null,
        load_date_to: firstStop.date_to || null,
        unload_date_from: lastStop.date_from || null,
        unload_date_to: lastStop.date_to || null,
        // Cargo & Vehicle
        vehicle_type: form.vehicle_type || null,
        body_type: form.body_type || null,
        length_m: form.length_m ? parseFloat(form.length_m) : null,
        weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
        ldm: form.ldm ? parseFloat(form.ldm) : null,
        pallet_count: form.pallet_count ? parseInt(form.pallet_count) : null,
        volume_m3: form.volume_m3 ? parseFloat(form.volume_m3) : null,
        adr_class: form.adr_class === "None" ? null : form.adr_class || null,
        temp_min: form.temp_min ? parseFloat(form.temp_min) : null,
        temp_max: form.temp_max ? parseFloat(form.temp_max) : null,
        goods_description: form.goods_description || null,
        // Pricing
        pricing_mode: form.pricing_mode,
        price_amount: form.price_amount ? parseFloat(form.price_amount) : null,
        currency: form.currency,
        payment_terms_days: form.payment_terms_days ? parseInt(form.payment_terms_days) : null,
        // Notes
        notes: form.notes || null,
        created_by: adminSession.id,
      };

      const { data: offer, error: offerError } = await supabase
        .from("freight_offers")
        .insert(payload)
        .select("id")
        .single();

      if (offerError) throw offerError;

      // Insert all stops
      const stopsPayload = stops.map((stop, index) => ({
        offer_id: offer.id,
        admin_id: adminSession.id,
        sequence_order: index,
        stop_type: stop.stop_type,
        company_name: stop.company_name || null,
        address: stop.address || null,
        city: stop.city || null,
        postal_code: stop.postal_code || null,
        country: stop.country || null,
        lat: stop.lat,
        lng: stop.lng,
        contact_name: stop.contact_name || null,
        contact_phone: stop.contact_phone || null,
        date_from: stop.date_from || null,
        date_to: stop.date_to || null,
        time_from: stop.time_from || null,
        time_to: stop.time_to || null,
        reference_number: stop.reference_number || null,
        notes: stop.notes || null,
      }));

      const { error: stopsError } = await supabase
        .from("freight_offer_stops")
        .insert(stopsPayload);

      if (stopsError) throw stopsError;

      toast({
        title: publish ? "Published" : "Created",
        description: publish
          ? `Offer ${reference} is now live on the exchange`
          : `Offer ${reference} saved as draft`,
      });
      router.push("/admin/tms/exchange");
    } catch (err: any) {
      console.error("Save error:", err);
      toast({ title: "Error", description: err?.message || "Failed to save offer", variant: "destructive" });
    } finally {
      setSaving(false);
      setSaveMode(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/60 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/admin/tms/exchange")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">New Freight Offer</h1>
              <p className="text-sm text-muted-foreground">
                Create a standalone offer for the freight exchange
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Title */}
          <div className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="font-medium text-foreground">Title (Optional)</h2>
            </div>
            <Input
              placeholder="e.g., FTL Budapest to Munich"
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
            />
          </div>

          {/* Route Section - Multi-Stop */}
          <div className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <h2 className="font-medium text-foreground">Route</h2>
                <span className="text-xs text-muted-foreground">({stops.length} stops)</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addStop("intermediate")}
                  className="h-8 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Stop
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {stops.map((stop, index) => {
                const typeConfig = STOP_TYPES.find((t) => t.value === stop.stop_type) || STOP_TYPES[0];
                const isFirst = index === 0;
                const isLast = index === stops.length - 1;

                return (
                  <div
                    key={stop.id}
                    className="border border-border/50 rounded-lg p-4 bg-muted/20"
                  >
                    {/* Stop Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveStop(index, "up")}
                            disabled={isFirst}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveStop(index, "down")}
                            disabled={isLast}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                            {index + 1}
                          </span>
                          <Select
                            value={stop.stop_type}
                            onValueChange={(v) => updateStop(stop.id, "stop_type", v)}
                          >
                            <SelectTrigger className="w-[130px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STOP_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>
                                  <span className={t.color}>{t.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <CountryFlag country={stop.country} />
                          {stop.city && (
                            <span className="text-sm font-medium">{stop.city}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeStop(stop.id)}
                        disabled={stops.length <= 2}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Address Autocomplete */}
                    <div className="mb-4">
                      <Label className="text-xs text-muted-foreground mb-1.5 block">
                        Search Address
                      </Label>
                      <AddressAutocomplete
                        value={stop.address}
                        placeholder="Start typing address..."
                        onSelect={(result) => handleAddressSelect(stop.id, result)}
                        onClear={() => {
                          updateStop(stop.id, "address", "");
                          updateStop(stop.id, "city", "");
                          updateStop(stop.id, "postal_code", "");
                          updateStop(stop.id, "country", "");
                          updateStop(stop.id, "lat", null);
                          updateStop(stop.id, "lng", null);
                        }}
                      />
                      {stop.lat && stop.lng && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                        </p>
                      )}
                    </div>

                    {/* Company & Details */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                          <Building2 className="h-3 w-3" />
                          Company
                        </Label>
                        <Input
                          placeholder="Company name"
                          value={stop.company_name}
                          onChange={(e) => updateStop(stop.id, "company_name", e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">
                          Reference
                        </Label>
                        <Input
                          placeholder="Loading reference"
                          value={stop.reference_number}
                          onChange={(e) => updateStop(stop.id, "reference_number", e.target.value)}
                          className="h-9"
                        />
                      </div>
                    </div>

                    {/* Contacts */}
                    <div className="grid md:grid-cols-2 gap-4 mt-3">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">
                          Contact Name
                        </Label>
                        <Input
                          placeholder="Contact person"
                          value={stop.contact_name}
                          onChange={(e) => updateStop(stop.id, "contact_name", e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                          <Phone className="h-3 w-3" />
                          Phone
                        </Label>
                        <Input
                          type="tel"
                          placeholder="+40 xxx xxx xxx"
                          value={stop.contact_phone}
                          onChange={(e) => updateStop(stop.id, "contact_phone", e.target.value)}
                          className="h-9"
                        />
                      </div>
                    </div>

                    {/* Dates & Times */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                      <div>
                        <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                          <Calendar className="h-3 w-3" />
                          Date From
                        </Label>
                        <Input
                          type="date"
                          value={stop.date_from}
                          onChange={(e) => updateStop(stop.id, "date_from", e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">
                          Date To
                        </Label>
                        <Input
                          type="date"
                          value={stop.date_to}
                          onChange={(e) => updateStop(stop.id, "date_to", e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">
                          Time From
                        </Label>
                        <Input
                          type="time"
                          value={stop.time_from}
                          onChange={(e) => updateStop(stop.id, "time_from", e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">
                          Time To
                        </Label>
                        <Input
                          type="time"
                          value={stop.time_to}
                          onChange={(e) => updateStop(stop.id, "time_to", e.target.value)}
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Add Buttons */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50">
              <span className="text-xs text-muted-foreground">Quick add:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addStop("load")}
                className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <Plus className="h-3 w-3 mr-1" />
                Loading
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addStop("unload")}
                className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              >
                <Plus className="h-3 w-3 mr-1" />
                Unloading
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addStop("intermediate")}
                className="h-7 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
              >
                <Plus className="h-3 w-3 mr-1" />
                Intermediate
              </Button>
            </div>
          </div>

          {/* Cargo & Vehicle Section */}
          <div className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-4 w-4 text-primary" />
              <h2 className="font-medium text-foreground">Cargo &amp; Vehicle</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Vehicle Type</Label>
                <Select value={form.vehicle_type} onValueChange={(v) => updateField("vehicle_type", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Body Type</Label>
                <Select value={form.body_type} onValueChange={(v) => updateField("body_type", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {BODY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">ADR Class</Label>
                <Select value={form.adr_class} onValueChange={(v) => updateField("adr_class", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ADR_CLASSES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
              <div>
                <Label className="text-xs text-muted-foreground">Weight (kg)</Label>
                <Input
                  type="number"
                  placeholder="e.g., 24000"
                  value={form.weight_kg}
                  onChange={(e) => updateField("weight_kg", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">LDM</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g., 13.6"
                  value={form.ldm}
                  onChange={(e) => updateField("ldm", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Pallets</Label>
                <Input
                  type="number"
                  placeholder="e.g., 33"
                  value={form.pallet_count}
                  onChange={(e) => updateField("pallet_count", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Volume (m³)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g., 90"
                  value={form.volume_m3}
                  onChange={(e) => updateField("volume_m3", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Length (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g., 13.6"
                  value={form.length_m}
                  onChange={(e) => updateField("length_m", e.target.value)}
                />
              </div>
            </div>

            {/* Temperature requirements */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Thermometer className="h-3 w-3" />
                  Temp Min (°C)
                </Label>
                <Input
                  type="number"
                  placeholder="e.g., -20"
                  value={form.temp_min}
                  onChange={(e) => updateField("temp_min", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Thermometer className="h-3 w-3" />
                  Temp Max (°C)
                </Label>
                <Input
                  type="number"
                  placeholder="e.g., +4"
                  value={form.temp_max}
                  onChange={(e) => updateField("temp_max", e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4">
              <Label className="text-xs text-muted-foreground">Goods Description</Label>
              <Textarea
                placeholder="Description of goods, special requirements..."
                value={form.goods_description}
                onChange={(e) => updateField("goods_description", e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Pricing Section */}
          <div className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="h-4 w-4 text-primary" />
              <h2 className="font-medium text-foreground">Pricing</h2>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Pricing Mode</Label>
                <Select value={form.pricing_mode} onValueChange={(v) => updateField("pricing_mode", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open (Carriers Propose)</SelectItem>
                    <SelectItem value="target">Target Price</SelectItem>
                    <SelectItem value="fixed">Fixed Price</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.pricing_mode !== "open" && (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {form.pricing_mode === "fixed" ? "Fixed Price" : "Target Price"}
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Amount"
                      value={form.price_amount}
                      onChange={(e) => updateField("price_amount", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Currency</Label>
                    <Select value={form.currency} onValueChange={(v) => updateField("currency", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Payment Terms (days)</Label>
                <Input
                  type="number"
                  placeholder="e.g., 30"
                  value={form.payment_terms_days}
                  onChange={(e) => updateField("payment_terms_days", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="font-medium text-foreground">Notes</h2>
            </div>
            <Textarea
              placeholder="Additional information, requirements, instructions..."
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              rows={3}
            />
          </div>

          {/* Bottom Save Buttons */}
          <div className="flex justify-end gap-3 pb-6">
            <Button variant="ghost" onClick={() => router.push("/admin/tms/exchange")}>
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
          </div>
        </div>
      </div>
    </div>
  );
}
