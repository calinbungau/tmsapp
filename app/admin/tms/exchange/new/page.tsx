"use client";

import React, { useState, useCallback } from "react";
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
  AlertTriangle,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { geocodeAddressSmart } from "@/lib/tms/geocode";

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

function CountryFlag({ country, className = "w-4 h-3" }: { country: string | null | undefined; className?: string }) {
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

// ─── Form state type ──────────────────────────────────────
interface FormData {
  title: string;
  // Origin
  origin_company: string;
  origin_address: string;
  origin_city: string;
  origin_postal_code: string;
  origin_country: string;
  origin_lat: number | null;
  origin_lng: number | null;
  // Destination
  dest_company: string;
  dest_address: string;
  dest_city: string;
  dest_postal_code: string;
  dest_country: string;
  dest_lat: number | null;
  dest_lng: number | null;
  // Schedule
  load_date_from: string;
  load_date_to: string;
  unload_date_from: string;
  unload_date_to: string;
  // Cargo & Vehicle
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
  // Pricing
  pricing_mode: string;
  price_amount: string;
  currency: string;
  payment_terms_days: string;
  // Notes
  notes: string;
}

const initialFormData: FormData = {
  title: "",
  origin_company: "",
  origin_address: "",
  origin_city: "",
  origin_postal_code: "",
  origin_country: "",
  origin_lat: null,
  origin_lng: null,
  dest_company: "",
  dest_address: "",
  dest_city: "",
  dest_postal_code: "",
  dest_country: "",
  dest_lat: null,
  dest_lng: null,
  load_date_from: "",
  load_date_to: "",
  unload_date_from: "",
  unload_date_to: "",
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
  const [saving, setSaving] = useState(false);
  const [geocodingOrigin, setGeocodingOrigin] = useState(false);
  const [geocodingDest, setGeocodingDest] = useState(false);

  // Update form field
  const updateField = (field: keyof FormData, value: string | number | null) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Geocode origin
  const geocodeOrigin = useCallback(async () => {
    const addressParts = [form.origin_address, form.origin_city, form.origin_postal_code, form.origin_country]
      .filter(Boolean)
      .join(", ");
    if (!addressParts) return;

    setGeocodingOrigin(true);
    try {
      const result = await geocodeAddressSmart(addressParts, form.origin_country);
      if (result) {
        setForm((prev) => ({
          ...prev,
          origin_lat: result.latitude,
          origin_lng: result.longitude,
        }));
        toast({ title: "Geocoded", description: "Origin location found" });
      } else {
        toast({ title: "Not found", description: "Could not geocode origin address", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Geocoding failed", variant: "destructive" });
    } finally {
      setGeocodingOrigin(false);
    }
  }, [form.origin_address, form.origin_city, form.origin_postal_code, form.origin_country, toast]);

  // Geocode destination
  const geocodeDest = useCallback(async () => {
    const addressParts = [form.dest_address, form.dest_city, form.dest_postal_code, form.dest_country]
      .filter(Boolean)
      .join(", ");
    if (!addressParts) return;

    setGeocodingDest(true);
    try {
      const result = await geocodeAddressSmart(addressParts, form.dest_country);
      if (result) {
        setForm((prev) => ({
          ...prev,
          dest_lat: result.latitude,
          dest_lng: result.longitude,
        }));
        toast({ title: "Geocoded", description: "Destination location found" });
      } else {
        toast({ title: "Not found", description: "Could not geocode destination address", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Geocoding failed", variant: "destructive" });
    } finally {
      setGeocodingDest(false);
    }
  }, [form.dest_address, form.dest_city, form.dest_postal_code, form.dest_country, toast]);

  // Save offer
  const handleSave = async () => {
    if (!adminSession?.id) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      return;
    }

    // Validate required fields
    if (!form.origin_city && !form.origin_country) {
      toast({ title: "Missing origin", description: "Please enter at least a city or country for origin", variant: "destructive" });
      return;
    }
    if (!form.dest_city && !form.dest_country) {
      toast({ title: "Missing destination", description: "Please enter at least a city or country for destination", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const reference = generateReference();
      
      const payload = {
        admin_id: adminSession.id,
        reference,
        title: form.title || null,
        status: "draft",
        visibility: "private",
        // Origin
        origin_company: form.origin_company || null,
        origin_address: form.origin_address || null,
        origin_city: form.origin_city || null,
        origin_postal_code: form.origin_postal_code || null,
        origin_country: form.origin_country || null,
        origin_lat: form.origin_lat,
        origin_lng: form.origin_lng,
        // Destination
        dest_company: form.dest_company || null,
        dest_address: form.dest_address || null,
        dest_city: form.dest_city || null,
        dest_postal_code: form.dest_postal_code || null,
        dest_country: form.dest_country || null,
        dest_lat: form.dest_lat,
        dest_lng: form.dest_lng,
        // Schedule
        load_date_from: form.load_date_from || null,
        load_date_to: form.load_date_to || null,
        unload_date_from: form.unload_date_from || null,
        unload_date_to: form.unload_date_to || null,
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

      const { error } = await supabase.from("freight_offers").insert(payload);
      if (error) throw error;

      toast({ title: "Created", description: `Offer ${reference} saved as draft` });
      router.push("/admin/tms/exchange");
    } catch (err: any) {
      console.error("Save error:", err);
      toast({ title: "Error", description: err?.message || "Failed to save offer", variant: "destructive" });
    } finally {
      setSaving(false);
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
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save as Draft
          </Button>
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

          {/* Route Section */}
          <div className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-4 w-4 text-primary" />
              <h2 className="font-medium text-foreground">Route</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Origin */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-green-600">Origin (Loading)</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={geocodeOrigin}
                    disabled={geocodingOrigin}
                    className="h-7 text-xs"
                  >
                    {geocodingOrigin ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                    Geocode
                  </Button>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Company</Label>
                  <Input
                    placeholder="Company name"
                    value={form.origin_company}
                    onChange={(e) => updateField("origin_company", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <Input
                    placeholder="Street address"
                    value={form.origin_address}
                    onChange={(e) => updateField("origin_address", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">City</Label>
                    <Input
                      placeholder="City"
                      value={form.origin_city}
                      onChange={(e) => updateField("origin_city", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Postal Code</Label>
                    <Input
                      placeholder="Postal"
                      value={form.origin_postal_code}
                      onChange={(e) => updateField("origin_postal_code", e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Country</Label>
                  <div className="flex items-center gap-2">
                    <CountryFlag country={form.origin_country} />
                    <Input
                      placeholder="Country"
                      value={form.origin_country}
                      onChange={(e) => updateField("origin_country", e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                {form.origin_lat && form.origin_lng && (
                  <p className="text-xs text-muted-foreground">
                    Coords: {form.origin_lat.toFixed(4)}, {form.origin_lng.toFixed(4)}
                  </p>
                )}
              </div>

              {/* Destination */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-red-600">Destination (Unloading)</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={geocodeDest}
                    disabled={geocodingDest}
                    className="h-7 text-xs"
                  >
                    {geocodingDest ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                    Geocode
                  </Button>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Company</Label>
                  <Input
                    placeholder="Company name"
                    value={form.dest_company}
                    onChange={(e) => updateField("dest_company", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <Input
                    placeholder="Street address"
                    value={form.dest_address}
                    onChange={(e) => updateField("dest_address", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">City</Label>
                    <Input
                      placeholder="City"
                      value={form.dest_city}
                      onChange={(e) => updateField("dest_city", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Postal Code</Label>
                    <Input
                      placeholder="Postal"
                      value={form.dest_postal_code}
                      onChange={(e) => updateField("dest_postal_code", e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Country</Label>
                  <div className="flex items-center gap-2">
                    <CountryFlag country={form.dest_country} />
                    <Input
                      placeholder="Country"
                      value={form.dest_country}
                      onChange={(e) => updateField("dest_country", e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                {form.dest_lat && form.dest_lng && (
                  <p className="text-xs text-muted-foreground">
                    Coords: {form.dest_lat.toFixed(4)}, {form.dest_lng.toFixed(4)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Schedule Section */}
          <div className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-4 w-4 text-primary" />
              <h2 className="font-medium text-foreground">Schedule</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium text-green-600">Loading Dates</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input
                      type="date"
                      value={form.load_date_from}
                      onChange={(e) => updateField("load_date_from", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input
                      type="date"
                      value={form.load_date_to}
                      onChange={(e) => updateField("load_date_to", e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-medium text-red-600">Unloading Dates</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input
                      type="date"
                      value={form.unload_date_from}
                      onChange={(e) => updateField("unload_date_from", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input
                      type="date"
                      value={form.unload_date_to}
                      onChange={(e) => updateField("unload_date_to", e.target.value)}
                    />
                  </div>
                </div>
              </div>
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
                <Label className="text-xs text-muted-foreground">Volume (m3)</Label>
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
                  Temp Min (C)
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
                  Temp Max (C)
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

          {/* Bottom Save Button */}
          <div className="flex justify-end gap-3 pb-6">
            <Button variant="outline" onClick={() => router.push("/admin/tms/exchange")}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save as Draft
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
