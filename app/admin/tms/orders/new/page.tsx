"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deriveLegStatus } from "@/lib/tms/status/derive-leg-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { PdfViewer } from "@/components/tms/pdf-viewer";
import { RouteMap } from "@/components/tms/route-map";
import { FleetAssignment, type TripSegment, type FleetMapData } from "@/components/tms/fleet-assignment";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/components/i18n/i18n-provider";
import {
  ArrowLeft, ArrowRight, Plus, X, GripVertical, Trash2, MapPin, Clock,
  User, Building2, Truck, Package, DollarSign, FileText, Check,
  Loader2, Search, Send, Upload, Sparkles, Brain, ScanLine, FileCheck,
  ChevronRight, AlertTriangle, Zap, Eye, Cloud, CloudOff,
  Container, Users, UserPlus, ExternalLink, Route as RouteIcon, Phone,
  ArrowLeftRight, ShieldCheck, ChevronsUpDown,
} from "lucide-react";

// ─── Country Flag Helper ──────────────────────────────────
// Maps country names (English, local languages, Nominatim variants) to ISO 3166-1 alpha-2 codes
const COUNTRY_CODES: Record<string, string> = {
  // English
  hungary: "HU", germany: "DE", romania: "RO", poland: "PL", czechia: "CZ",
  "czech republic": "CZ", slovakia: "SK", austria: "AT", france: "FR",
  italy: "IT", spain: "ES", netherlands: "NL", belgium: "BE", croatia: "HR",
  slovenia: "SI", serbia: "RS", bulgaria: "BG", greece: "GR", turkey: "TR",
  ukraine: "UA", moldova: "MD", "united kingdom": "GB", uk: "GB",
  ireland: "IE", portugal: "PT", sweden: "SE", norway: "NO", denmark: "DK",
  finland: "FI", switzerland: "CH", luxembourg: "LU", lithuania: "LT",
  latvia: "LV", estonia: "EE", belarus: "BY", "bosnia and herzegovina": "BA",
  "north macedonia": "MK", montenegro: "ME", albania: "AL", kosovo: "XK",
  // Local language variants (Nominatim returns these)
  magyarorszag: "HU", "magyarorsz\u00E1g": "HU", ungarn: "HU",
  deutschland: "DE", allemagne: "DE", germania: "DE",
  "rom\u00E2nia": "RO",
  polska: "PL",
  "\u010Desko": "CZ", "\u010Desk\u00E1 republika": "CZ",
  slovensko: "SK",
  "\u00F6sterreich": "AT",
  "france m\u00E9tropolitaine": "FR", "franta": "FR", "fran\u021Ba": "FR",
  "fran\u021Ba metropolitan\u0103": "FR",
  italia: "IT",
  "espa\u00F1a": "ES",
  nederland: "NL", "the netherlands": "NL",
  "belgi\u00EB": "BE", belgique: "BE", belgien: "BE",
  hrvatska: "HR",
  slovenija: "SI",
  srbija: "RS", "\u0441\u0440\u0431\u0438\u0458\u0430": "RS",
  "\u0431\u044A\u043B\u0433\u0430\u0440\u0438\u044F": "BG",
  "\u0395\u03BB\u03BB\u03AC\u03B4\u03B1": "GR", "ellas": "GR", "ellada": "GR",
  "t\u00FCrkiye": "TR",
  "\u0443\u043A\u0440\u0430\u0457\u043D\u0430": "UA",
  schweiz: "CH", suisse: "CH", svizzera: "CH",
  sverige: "SE",
  norge: "NO",
  danmark: "DK",
  suomi: "FI",
  "lietuva": "LT", "latvija": "LV", "eesti": "EE",
  "\u0431\u0435\u043B\u0430\u0440\u0443\u0441\u044C": "BY",
  "crna gora": "ME", "shqip\u00EBria": "AL",
};
function getCountryCode(country: string): string {
  if (!country) return "";
  const trimmed = country.trim();
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && /^[A-Z]{2}$/.test(upper)) return upper;
  if (upper.length === 3) {
    // Common 3-letter prefixes from stop names like "de." "nl." "fr."
    const twoLetter = upper.substring(0, 2);
    if (["DE","NL","FR","IT","ES","AT","PL","CZ","SK","HU","RO","BG","HR","SI","RS","GR","TR","UA","BE","LU","CH","SE","NO","DK","FI","LT","LV","EE","IE","PT","GB"].includes(twoLetter)) return twoLetter;
  }
  return COUNTRY_CODES[trimmed.toLowerCase()] || "";
}
function getCountryFlagUrl(country: string): string {
  const code = getCountryCode(country);
  if (!code) return "";
  return `https://flagcdn.com/w20/${code.toLowerCase()}.png`;
}

// ─── Types ─────────────────────────────────────────────
interface Partner { id: string; name: string; types: string[]; payment_terms?: string | null; }
interface Driver { id: string; name: string; }
interface Vehicle { id: string; plate_number: string; make: string | null; model: string | null; max_weight_kg: number | null; max_pallets: number | null; loading_meters: number | null; }
interface Trailer { id: string; plate_number: string; trailer_type: string; max_weight_kg: number | null; max_pallets: number | null; loading_meters: number | null; }
interface TaskForm { id: string; name: string; }
interface AIInstruction { id: string; name: string; description: string | null; document_type: string; is_default: boolean; }

interface SwapConfig {
  swap_type: "truck_swap" | "trailer_swap" | "driver_swap" | "full_swap";
  new_driver_id?: string;
  new_vehicle_id?: string;
  new_trailer_id?: string;
}

interface StopData {
  id: string;
  stop_type: "pickup" | "delivery" | "customs" | "transit" | "rest" | "swap";
  company_name: string;
  address: string;
  city: string;
  country: string;
  postal_code: string;
  lat: number | null;
  lng: number | null;
  planned_date: string;
  planned_time_from: string;
  planned_time_to: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  reference_number: string;
  notes: string;
  form_id: string;
  swap_config?: SwapConfig;
  origin?: "order" | "execution" | "existing_trip"; // "order" = from customer doc, "execution" = added during execution planning, "existing_trip" = from existing trip on same vehicle
  existing_trip_stop_id?: string; // original trip_stop.id from existing trip
  existing_order_ref?: string; // order reference for display (e.g. "ORD-20260215-0001")
  existing_order_id?: string; // order_id from the existing trip stop
}

interface OrderFormData {
  order_type: "internal" | "forwarding";
  status?: string; // Pre-set status (e.g. fwd_unassigned from signed email)
  customer_id: string;
  customer_reference: string;
  special_instructions: string;
  internal_notes: string;
  cargo_description: string;
  goods_type: string;
  weight_kg: string;
  volume_m3: string;
  pallet_count: string;
  loading_meters: string;
  adr_class: string;
  temperature_min: string;
  temperature_max: string;
  stackable: boolean;
  stops: StopData[];
  customer_price: string;
  customer_currency: string;
  customer_vat_type: "excluding" | "including" | "exempt" | "reverse_charge" | "non_taxable";
  customer_vat_rate: string;
  payment_terms_customer_days: string;
  driver_id: string;
  vehicle_id: string;
  trailer_id: string;
  form_id: string;
  carrier_id: string;
  carrier_cost: string;
  carrier_currency: string;
  carrier_vat_type: "excluding" | "including" | "exempt" | "reverse_charge" | "non_taxable";
  carrier_vat_rate: string;
  payment_terms_carrier_days: string;
  estimated_distance_km: string;
  estimated_duration_hours: string;
  route_geometry: [number, number][] | null;
  route_waypoints: [number, number][];
  trips: TripSegment[];
}

interface DraftTab {
  id: string;
  dbId: string | null;
  referenceNumber: string;
  form: OrderFormData;
  saveStatus: "idle" | "saving" | "saved" | "error";
  lastSavedAt: string | null;
  createdFrom: "manual" | "ai_upload" | "ai_email" | "email_signed";
  sourceEmailId: string | null;
  aiExtractionId: string | null;
  aiTokensUsed: number | null;
  aiCostUsd: number | null;
  aiConfidence: number | null;
  pdfUrl: string | null;
  aiCustomerName: string | null;
}

interface AiExtractionState {
  stage: "idle" | "uploading" | "classifying" | "extracting" | "done" | "error";
  progress: number;
  message: string;
  fileUrl: string | null;
  fileName: string | null;
  fileObjectUrl: string | null;
  metadata: any | null;
  error: string | null;
}

interface AddressSuggestion { display_name: string; lat: string; lon: string; }

// ─── VAT Calculation Helper (Romanian Law) ───────────────
// Note: DB columns use "price" for customer and "cost" for carrier
function calculateVatAmounts(
  price: string,
  vatType: OrderFormData["customer_vat_type"],
  vatRate: string,
  prefix: "customer" | "carrier"
): Record<string, number | null> {
  const priceNum = price ? parseFloat(price) : null;
  const rate = vatRate ? parseFloat(vatRate) : 21;
  // DB uses "price" for customer columns, "cost" for carrier columns
  const amountWord = prefix === "customer" ? "price" : "cost";
  
  if (!priceNum) {
    return {
      [`${prefix}_vat_amount`]: null,
      [`${prefix}_${amountWord}_with_vat`]: null,
      [`${prefix}_${amountWord}_without_vat`]: null,
    };
  }

  // For exempt, reverse_charge, non_taxable - no VAT calculation
  if (["exempt", "reverse_charge", "non_taxable"].includes(vatType)) {
    return {
      [`${prefix}_vat_amount`]: 0,
      [`${prefix}_${amountWord}_with_vat`]: priceNum,
      [`${prefix}_${amountWord}_without_vat`]: priceNum,
    };
  }

  if (vatType === "including") {
    // Price includes VAT - extract net and VAT
    const priceWithoutVat = priceNum / (1 + rate / 100);
    const vatAmount = priceNum - priceWithoutVat;
    return {
      [`${prefix}_vat_amount`]: Math.round(vatAmount * 100) / 100,
      [`${prefix}_${amountWord}_with_vat`]: priceNum,
      [`${prefix}_${amountWord}_without_vat`]: Math.round(priceWithoutVat * 100) / 100,
    };
  }

  // Default: excluding (net price)
  const vatAmount = priceNum * (rate / 100);
  const priceWithVat = priceNum + vatAmount;
  return {
    [`${prefix}_vat_amount`]: Math.round(vatAmount * 100) / 100,
    [`${prefix}_${amountWord}_with_vat`]: Math.round(priceWithVat * 100) / 100,
    [`${prefix}_${amountWord}_without_vat`]: priceNum,
  };
}

// ─── Helpers ──────────────────────────────────────────
function emptyStop(type: StopData["stop_type"] = "pickup", origin: "order" | "execution" = "order"): StopData {
  return {
    id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    stop_type: type,
    company_name: "", address: "", city: "", country: "", postal_code: "",
    lat: null, lng: null,
    planned_date: "", planned_time_from: "", planned_time_to: "",
    contact_name: "", contact_phone: "", contact_email: "",
    reference_number: "", notes: "", form_id: "",
    origin,
  };
}

function emptyFormData(): OrderFormData {
  return {
    order_type: "internal", customer_id: "", customer_reference: "",
    special_instructions: "", internal_notes: "",
    cargo_description: "", goods_type: "", weight_kg: "", volume_m3: "",
    pallet_count: "", loading_meters: "", adr_class: "",
    temperature_min: "", temperature_max: "", stackable: false,
    stops: [emptyStop("pickup"), emptyStop("delivery")],
    // Payment terms default to 45 days — overridden per-partner by parsing
    // `business_partners.payment_terms` (free-text, e.g. "30 zile") when a
    // customer or carrier is selected. See the useEffect that watches
    // customer_id / carrier_id below.
    customer_price: "", customer_currency: "EUR", customer_vat_type: "excluding", customer_vat_rate: "21", payment_terms_customer_days: "45",
    driver_id: "", vehicle_id: "", trailer_id: "", form_id: "",
    carrier_id: "", carrier_cost: "", carrier_currency: "EUR", carrier_vat_type: "excluding", carrier_vat_rate: "21", payment_terms_carrier_days: "45",
  estimated_distance_km: "", estimated_duration_hours: "",
  route_geometry: null,
  route_waypoints: [],
  trips: [],
  };
}

function emptyDraft(): DraftTab {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    dbId: null, referenceNumber: "",
    form: emptyFormData(),
    saveStatus: "idle", lastSavedAt: null,
    createdFrom: "manual", sourceEmailId: null, aiExtractionId: null, aiTokensUsed: null, aiCostUsd: null, aiConfidence: null,
    pdfUrl: null, aiCustomerName: null,
  };
}

// ═══════════════════════════════════════════════════════════
// AI Scanning Animation Component
// ═══════════════════════════════════════════════════════════
function AiScanOverlay({ stage, progress, message }: { stage: string; progress: number; message: string }) {
  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-6">
      {/* Neural rings */}
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-[spin_8s_linear_infinite]">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
        </div>
        <div className="absolute inset-3 rounded-full border-2 border-primary/30 animate-[spin_5s_linear_infinite_reverse]">
          <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-400" />
        </div>
        <div className="absolute inset-6 rounded-full border-2 border-primary/40 animate-[spin_3s_linear_infinite]">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-violet-400" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
            <Brain className="h-5 w-5 text-primary" />
          </div>
        </div>
      </div>

      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-foreground">{message}</p>
        <div className="flex items-center justify-center gap-1.5">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>

      <div className="w-48 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-primary via-cyan-400 to-violet-500 transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
      </div>

      {/* Scan lines */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-[scanDown_3s_linear_infinite]" />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════�������������════
// Quick Create Partner Dialog
// ═══════════════════════════════════════════════════════════
// EU country codes for VIES validation
const EU_COUNTRY_CODES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", 
  "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", 
  "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI"
];

function QuickCreatePartnerDialog({
  open, onOpenChange, adminId, suggestedName, suggestedVat, onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminId: string;
  suggestedName: string;
  suggestedVat?: string;
  onCreated: (partner: Partner) => void;
}) {
  const [name, setName] = useState(suggestedName);
  const [types, setTypes] = useState<string[]>(["shipper"]);
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [address, setAddress] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [bankIban, setBankIban] = useState("");
  const [saving, setSaving] = useState(false);
  const [vatLoading, setVatLoading] = useState(false);
  const { toast } = useToast();
  const { t: tr } = useTranslation();

  useEffect(() => { setName(suggestedName); }, [suggestedName]);
  
  // Set VAT from props and auto-lookup when dialog opens with VAT
  useEffect(() => { 
    if (suggestedVat) {
      setTaxId(suggestedVat);
    }
  }, [suggestedVat]);
  
  // Auto-trigger VAT lookup when dialog opens with a VAT number
  const hasTriggeredLookup = useRef(false);
  useEffect(() => {
    if (open && suggestedVat && !hasTriggeredLookup.current && !vatLoading) {
      hasTriggeredLookup.current = true;
      // Small delay to allow dialog to render
      setTimeout(() => lookupVAT(), 300);
    }
    if (!open) {
      hasTriggeredLookup.current = false;
    }
  }, [open, suggestedVat, vatLoading]);

  const toggleType = (type: string) => {
    setTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  // Unified VAT lookup - ANAF for Romania, VIES for other EU countries
  const lookupVAT = async () => {
    const vatNumber = taxId.trim().toUpperCase();
    
    if (!vatNumber) {
      toast({ title: tr("tms.newOrder.common.error"), description: tr("tms.newOrder.vat.enterFirst"), variant: "destructive" });
      return;
    }

    // Check if Romanian (use ANAF for more detailed data)
    const isRomanian = /^RO\d{6,10}$/i.test(vatNumber) || /^\d{6,10}$/.test(vatNumber);
    
    // Check if EU VAT number
    const countryCode = vatNumber.substring(0, 2);
    const isEU = EU_COUNTRY_CODES.includes(countryCode);

    if (!isRomanian && !isEU) {
      toast({ 
        title: tr("tms.newOrder.vat.lookupTitle"), 
        description: tr("tms.newOrder.vat.euOnly") + "\n\nSupported: " + EU_COUNTRY_CODES.slice(0, 10).join(", ") + "...",
        variant: "destructive" 
      });
      return;
    }

    setVatLoading(true);
    
    try {
      if (isRomanian) {
        // Use ANAF for Romanian companies (more detailed data)
        const response = await fetch("/api/anaf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cui: vatNumber }),
        });

        const result = await response.json().catch(() => ({ success: false }));

        if (!response.ok || !result.success) {
          // ANAF is down or returned nothing — fall back to VIES so the user
          // can still validate and auto-fill an RO company (less detail, but
          // better than failing). allowRomania bypasses VIES's "use ANAF" hint.
          const roVat = /^RO/i.test(vatNumber) ? vatNumber : `RO${vatNumber.replace(/^RO/i, "")}`;
          const viesResponse = await fetch("/api/vies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vatNumber: roVat, allowRomania: true }),
          });
          const viesResult = await viesResponse.json().catch(() => ({ success: false }));

          if (viesResponse.ok && viesResult.success) {
            const v = viesResult.data;
            setName(v.name || name);
            setAddress(v.street || address);
            setCity(v.city || city);
            setCountry(v.country || "Romania");
            setTaxId(v.vatNumber || taxId);
            toast({
              title: tr("tms.newOrder.vat.loadedViesAnaf"),
              description: `VAT: ${v.vatNumber} | Status: Valid & Active`,
            });
          } else {
            toast({
              title: tr("tms.newOrder.vat.lookupFailed"),
              description: result.error
                ? `ANAF: ${result.error}. VIES fallback also failed.`
                : "ANAF unavailable and VIES fallback also failed. Enter details manually.",
              variant: "destructive",
            });
          }
          return;
        }

        const data = result.data;
        
        setName(data.name || name);
        setRegistrationNumber(data.registrationNumber || registrationNumber);
        setPhone(data.phone || phone);
        setAddress(data.address || address);
        setCity(data.city || city);
        setCountry(data.country || "Romania");
        setBankIban(data.iban || bankIban);
        setTaxId(data.isVatPayer && !/^RO/i.test(taxId) 
          ? `RO${taxId.replace(/^RO/i, "")}` 
          : taxId.toUpperCase());

        const statusMsg = [
          data.isVatPayer ? "VAT Payer" : "Not VAT registered",
          data.isActive ? "Active" : "INACTIVE",
        ].join(" | ");
        
        toast({ 
          title: tr("tms.newOrder.vat.loadedAnaf"), 
          description: `Status: ${statusMsg}`,
        });
      } else {
        // Use VIES for other EU countries
        const response = await fetch("/api/vies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vatNumber }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          if (result.useAnaf) {
            setVatLoading(false);
            return lookupVAT();
          }
          toast({ title: tr("tms.newOrder.vat.viesError"), description: result.error || tr("tms.newOrder.vat.validateFailed"), variant: "destructive" });
          return;
        }

        const data = result.data;
        
        setName(data.name || name);
        setAddress(data.street || address);
        setCity(data.city || city);
        setCountry(data.country || country);
        setTaxId(data.vatNumber || taxId);

        if (data.limitedData) {
          toast({ 
            title: tr("tms.newOrder.vat.valid"), 
            description: `${data.vatNumber} is valid. ${data.limitedDataReason || "Enter details manually."}`,
          });
        } else {
          toast({ 
            title: tr("tms.newOrder.vat.loadedVies"), 
            description: `VAT: ${data.vatNumber} | Status: Valid & Active`,
          });
        }
      }
    } catch (error) {
      console.error("VAT lookup error:", error);
      toast({ title: tr("tms.newOrder.common.error"), description: tr("tms.newOrder.vat.connectFailed"), variant: "destructive" });
    } finally {
      setVatLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || types.length === 0) return;
    setSaving(true);
    const s = createClient();
    const { data, error } = await s.from("business_partners").insert({
      admin_id: adminId,
      name: name.trim(),
      types,
      tax_id: taxId || null,
      registration_number: registrationNumber || null,
      email: email || null,
      phone: phone || null,
      address_line1: address || null,
      city: city || null,
      country: country || null,
      bank_iban: bankIban || null,
      is_active: true,
    }).select("id, name, types");
    setSaving(false);
    if (error) return;
    if (data && data.length > 0) {
      onCreated(data[0]);
      onOpenChange(false);
      setName(""); setTaxId(""); setEmail(""); setPhone(""); setCity(""); setCountry("");
      setAddress(""); setRegistrationNumber(""); setBankIban("");
      setTypes(["shipper"]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> {tr("tms.newOrder.partner.quickCreate")}</DialogTitle>
          <DialogDescription>{tr("tms.newOrder.partner.createDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>{tr("tms.newOrder.partner.companyNameReq")}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={tr("tms.newOrder.partner.namePlaceholder")} autoFocus />
          </div>
          <div className="space-y-2">
            <Label>{tr("tms.newOrder.partner.typeReq")}</Label>
            <div className="flex flex-wrap gap-2">
              {(["shipper", "carrier", "forwarder"] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    types.includes(type) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {/* Tax ID with VAT Lookup */}
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("tms.newOrder.partner.taxId")}</Label>
            <div className="flex gap-2">
              <Input 
                className="h-8 text-sm flex-1" 
                value={taxId} 
                onChange={e => setTaxId(e.target.value)} 
                onBlur={() => {
                  const vat = taxId.trim().toUpperCase();
                  const countryCode = vat.substring(0, 2);
                  const isEU = EU_COUNTRY_CODES.includes(countryCode) || /^\d{6,10}$/.test(vat);
                  if (isEU && !name && !vatLoading) {
                    lookupVAT();
                  }
                }}
                placeholder={tr("tms.newOrder.partner.vatPlaceholder")} 
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={lookupVAT}
                disabled={vatLoading || !taxId.trim()}
                title={tr("tms.newOrder.partner.lookupTitle")}
                className="h-8 px-2.5"
              >
                {vatLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">{tr("tms.newOrder.partner.lookupHint")}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("tms.newOrder.partner.registrationNo")}</Label>
              <Input className="h-8 text-sm" value={registrationNumber} onChange={e => setRegistrationNumber(e.target.value)} placeholder="J40/123/2020" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("tms.newOrder.partner.email")}</Label>
              <Input className="h-8 text-sm" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("tms.newOrder.partner.phone")}</Label>
              <Input className="h-8 text-sm" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+40..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("tms.newOrder.partner.iban")}</Label>
              <Input className="h-8 text-sm" value={bankIban} onChange={e => setBankIban(e.target.value)} placeholder="RO49AAAA..." />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">{tr("tms.newOrder.partner.address")}</Label>
              <Input className="h-8 text-sm" value={address} onChange={e => setAddress(e.target.value)} placeholder={tr("tms.newOrder.partner.addressPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("tms.newOrder.partner.city")}</Label>
              <Input className="h-8 text-sm" value={city} onChange={e => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("tms.newOrder.partner.country")}</Label>
              <Input className="h-8 text-sm" value={country} onChange={e => setCountry(e.target.value)} placeholder={tr("tms.newOrder.partner.countryPlaceholder")} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{tr("tms.newOrder.common.cancel")}</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving || !name.trim() || types.length === 0}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              {tr("tms.newOrder.partner.createPartner")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════
// Section Components for the scrollable form
// ═══════════════════════════════════════════════════════════

function SectionHeader({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3 pb-3">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════���═════════════
// Main Page
// ═════════════════════════���═════════════════════════════════
export default function NewOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { t: tr } = useTranslation();
  const emailAutoLoadRef = useRef(false);
  const [adminSession, setAdminSession] = useState<any>(null);
  const [tabs, setTabs] = useState<DraftTab[]>([emptyDraft()]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"details" | "execution">("details");
  const [availableSeries, setAvailableSeries] = useState<{id: string; name: string; prefix: string; is_default: boolean}[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>("");
  const [fleetMapData, setFleetMapData] = useState<FleetMapData | null>(null);
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(0);
  const [showStopDetails, setShowStopDetails] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  // Execution-layer state: separate from order stops/route. Initialized on "Proceed to Execution".
  const [executionStops, setExecutionStops] = useState<StopData[]>([]);
  // Ref to always have latest executionStops (avoids stale closures in callbacks)
  const executionStopsRef = useRef<StopData[]>([]);
  useEffect(() => { executionStopsRef.current = executionStops; }, [executionStops]);
  const [executionRoute, setExecutionRoute] = useState<{
    geometry: [number, number][] | null;
    distance_km: number;
    duration_hours: number;
    legs: { distance_km: number; duration_min: number; geometry?: [number, number][] }[];
  }>({ geometry: null, distance_km: 0, duration_hours: 0, legs: [] });
  const [executionWaypoints, setExecutionWaypoints] = useState<[number, number][]>([]);
  // When adding to an existing trip, store its ID so save logic can update instead of create
  const [existingTripId, setExistingTripId] = useState<string | null>(null);

  // When FleetAssignment detects an existing trip on the vehicle, merge its stops into execution
  const lastMergedTripIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (step !== "execution") return;
    const tripData = fleetMapData?.existingTripData;
    if (!tripData || tripData.tripStops.length === 0) {
      // If we had a merged trip but the vehicle changed / cleared, remove existing trip stops
      if (lastMergedTripIdRef.current) {
        setExecutionStops(prev => prev.filter(s => s.origin !== "existing_trip"));
        setExistingTripId(null);
        lastMergedTripIdRef.current = null;
      }
      return;
    }
    // Don't re-merge if we already merged this exact trip
    if (lastMergedTripIdRef.current === tripData.tripId) return;
    lastMergedTripIdRef.current = tripData.tripId;
    setExistingTripId(tripData.tripId);

    // Convert existing trip stops to StopData
    const existingStops: StopData[] = tripData.tripStops.map(ts => ({
      id: `existing-${ts.id}`,
      stop_type: (ts.stop_type || "transit") as StopData["stop_type"],
      company_name: ts.company_name || "",
      address: ts.address || "",
      city: ts.city || "",
      country: ts.country || "",
      postal_code: "",
      lat: ts.lat,
      lng: ts.lng,
      planned_date: ts.planned_date || "",
      planned_time_from: ts.planned_time_from || "",
      planned_time_to: ts.planned_time_to || "",
      contact_name: "",
      contact_phone: "",
      contact_email: "",
      reference_number: "",
      notes: ts.notes || "",
      form_id: "",
      origin: "existing_trip" as const,
      existing_trip_stop_id: ts.id,
      existing_order_ref: ts.order_ref || undefined,
      existing_order_id: ts.order_id || undefined,
    }));

    // Merge: remove any old existing_trip stops, then combine new ones with current order stops
    setExecutionStops(prev => {
      const nonExistingStops = prev.filter(s => s.origin !== "existing_trip");
      nonExistingStops.forEach(s => { if (!s.origin) s.origin = "order"; });
      const combined = [...existingStops, ...nonExistingStops].sort((a, b) => {
        const da = a.planned_date || "9999";
        const db = b.planned_date || "9999";
        if (da !== db) return da.localeCompare(db);
        const typeOrder: Record<string, number> = { pickup: 0, customs: 1, transit: 2, rest: 3, swap: 4, delivery: 5 };
        return (typeOrder[a.stop_type] || 2) - (typeOrder[b.stop_type] || 2);
      });
      return combined;
    });
  }, [step, fleetMapData?.existingTripData]);

  // Reference data
  const [partners, setPartners] = useState<Partner[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [forms, setForms] = useState<TaskForm[]>([]);
  const [aiInstructions, setAiInstructions] = useState<AIInstruction[]>([]);
  const [selectedInstructionId, setSelectedInstructionId] = useState<string>("");

  // AI extraction state
  const [aiState, setAiState] = useState<AiExtractionState>({
    stage: "idle", progress: 0, message: "", fileUrl: null, fileName: null, fileObjectUrl: null, metadata: null, error: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftsLoadedRef = useRef(false);

  // Quick create partner dialog
  const [showCreatePartner, setShowCreatePartner] = useState(false);
  const [suggestedPartnerName, setSuggestedPartnerName] = useState("");
  const [suggestedPartnerVat, setSuggestedPartnerVat] = useState("");
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [detailsExistingStops, setDetailsExistingStops] = useState<any[]>([]);

  const activeTab = tabs[activeTabIndex] || tabs[0];

  const updateTab = useCallback((updates: Partial<DraftTab>) => {
    setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, ...updates, saveStatus: "idle" as const } : t));
  }, [activeTabIndex]);

  const updateForm = useCallback((updates: Partial<OrderFormData>) => {
    setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, form: { ...t.form, ...updates }, saveStatus: "idle" as const } : t));
  }, [activeTabIndex]);

  const updateStop = useCallback((stopIndex: number, updates: Partial<StopData>) => {
    if (step === "execution") {
      setExecutionStops(prev => prev.map((s, i) => i === stopIndex ? { ...s, ...updates } : s));
    } else {
      setTabs(prev => prev.map((t, i) => {
        if (i !== activeTabIndex) return t;
        const newStops = [...t.form.stops];
        newStops[stopIndex] = { ...newStops[stopIndex], ...updates };
        return { ...t, form: { ...t.form, stops: newStops }, saveStatus: "idle" as const };
      }));
    }
  }, [activeTabIndex, step]);

  const handleStopDrop = (toIndex: number) => {
    if (dragIdx === null || dragIdx === toIndex) return;
    // In execution step: reorder executionStops (never touch form.stops)
    if (step === "execution") {
      const newStops = [...executionStops];
      const [removed] = newStops.splice(dragIdx, 1);
      newStops.splice(toIndex, 0, removed);
      setExecutionStops(newStops);
    } else {
      const newStops = [...activeTab.form.stops];
      const [removed] = newStops.splice(dragIdx, 1);
      newStops.splice(toIndex, 0, removed);
      updateForm({ stops: newStops });
    }
    setSelectedStopIndex(toIndex);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const addStop = (type: StopData["stop_type"] = "delivery", origin: "order" | "execution" = "order") => {
    const newStop = emptyStop(type, origin);
    if (step === "execution") {
      setExecutionStops(prev => [...prev, newStop]);
      setSelectedStopIndex(executionStops.length);
    } else {
      updateForm({ stops: [...activeTab.form.stops, newStop] });
      setSelectedStopIndex(activeTab.form.stops.length);
    }
    setShowStopDetails(true);
  };

  const removeStop = (index: number) => {
    if (step === "execution") {
      if (executionStops.length <= 1) return;
      setExecutionStops(prev => prev.filter((_, i) => i !== index));
    } else {
      if (activeTab.form.stops.length <= 1) return;
      const newStops = activeTab.form.stops.filter((_: any, i: number) => i !== index);
      updateForm({ stops: newStops });
    }
    if (selectedStopIndex === index) setSelectedStopIndex(Math.max(0, index - 1));
    else if (selectedStopIndex !== null && selectedStopIndex > index) setSelectedStopIndex(selectedStopIndex - 1);
  };

  // Add a swap point at a stop -- splits the route into two trips
  // The swap stop is SHARED: trip1 ends at it, trip2 starts at it
  const addSwapBetweenStops = (swapStopIdx: number) => {
    const currentTrips = activeTab.form.trips || [];
    const stops = step === "execution" ? executionStops : activeTab.form.stops;
    if (swapStopIdx <= 0 || swapStopIdx >= stops.length - 1) return; // can't swap at first or last

    if (currentTrips.length === 0) {
      // First swap: split single-trip mode into two trips
      const trip1: any = {
        id: crypto.randomUUID(), trip_number: 1,
        assignment_type: "own_fleet",
        driver_id: activeTab.form.driver_id || "", vehicle_id: activeTab.form.vehicle_id || "",
        trailer_id: activeTab.form.trailer_id || "",
        carrier_id: "", carrier_cost: "", carrier_currency: "EUR",
        from_stop_index: 0, to_stop_index: swapStopIdx,
        swap_type: null, notes: "", route_info: null,
      };
      const trip2: any = {
        id: crypto.randomUUID(), trip_number: 2,
        assignment_type: "own_fleet",
        driver_id: "", vehicle_id: "",
        trailer_id: activeTab.form.trailer_id || "",
        carrier_id: "", carrier_cost: "", carrier_currency: "EUR",
        from_stop_index: swapStopIdx, to_stop_index: stops.length - 1,
        swap_type: "truck_swap", notes: "", route_info: null,
      };
      updateForm({ trips: [trip1, trip2] });
    } else {
      // Find the trip that contains this swap stop and split it
      const tripIdx = currentTrips.findIndex((t: any) =>
        t.from_stop_index < swapStopIdx && t.to_stop_index >= swapStopIdx
      );
      if (tripIdx === -1) return;
      const trip = currentTrips[tripIdx];
      const shortened = { ...trip, to_stop_index: swapStopIdx };
      const newTrip: any = {
        id: crypto.randomUUID(), trip_number: currentTrips.length + 1,
        assignment_type: "own_fleet",
        driver_id: "", vehicle_id: "",
        trailer_id: trip.trailer_id, carrier_id: "", carrier_cost: "", carrier_currency: "EUR",
        from_stop_index: swapStopIdx, to_stop_index: trip.to_stop_index,
        swap_type: "truck_swap", notes: "", route_info: null,
      };
      const newTrips = [...currentTrips];
      newTrips[tripIdx] = shortened;
      newTrips.splice(tripIdx + 1, 0, newTrip);
      updateForm({ trips: newTrips.map((t: any, i: number) => ({ ...t, trip_number: i + 1 })) });
    }
  };

  // Remove a swap -- merge two trips back into one
  const removeSwapBetweenTrips = (tripIdx: number) => {
    const currentTrips = activeTab.form.trips || [];
    if (currentTrips.length <= 1 || tripIdx >= currentTrips.length - 1) return;
    const merged = { ...currentTrips[tripIdx], to_stop_index: currentTrips[tripIdx + 1].to_stop_index };
    const newTrips = currentTrips.filter((_: any, i: number) => i !== tripIdx + 1);
    newTrips[tripIdx] = merged;
    const renumbered = newTrips.map((t: any, i: number) => ({ ...t, trip_number: i + 1 }));
    updateForm({ trips: renumbered.length <= 1 ? [] : renumbered });
  };

  // Load admin session
  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (!stored) { router.push("/admin/login"); return; }
    setAdminSession(JSON.parse(stored));
  }, [router]);

  // Load reference data
  const fetchRefData = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const s = createClient();
    const [partnersRes, driversRes, vehiclesRes, trailersRes, formsRes, aiInstructionsRes] = await Promise.all([
      s.from("business_partners").select("id, name, types, payment_terms").eq("admin_id", adminSession.id).eq("is_active", true).order("name"),
      s.from("drivers").select("id, name").eq("admin_id", adminSession.id).eq("is_active", true).order("name"),
      s.from("vehicles").select("id, plate_number, make, model, max_weight_kg, max_pallets, loading_meters").eq("admin_id", adminSession.id).eq("is_active", true).order("plate_number"),
      s.from("trailers").select("id, plate_number, trailer_type, max_weight_kg, max_pallets, loading_meters").eq("admin_id", adminSession.id).eq("is_active", true).order("plate_number"),
      s.from("task_forms").select("id, name").eq("admin_id", adminSession.id).eq("is_active", true).order("name"),
      s.from("ai_extraction_instructions").select("id, name, description, document_type, is_default").eq("is_active", true).order("is_default", { ascending: false }).order("name"),
    ]);
    setPartners(partnersRes.data || []);
    setDrivers(driversRes.data || []);
    setVehicles(vehiclesRes.data || []);
    setTrailers(trailersRes.data || []);
    setForms(formsRes.data || []);
    setAiInstructions(aiInstructionsRes.data || []);
    // Auto-select default AI instruction
    const defaultInstruction = (aiInstructionsRes.data || []).find((i: AIInstruction) => i.is_default);
    if (defaultInstruction) setSelectedInstructionId(defaultInstruction.id);
    setLoading(false);
  }, [adminSession?.id]);

useEffect(() => { fetchRefData(); }, [fetchRefData]);
  
// Load available series - all customer orders use internal_order series
  useEffect(() => {
  if (!adminSession?.id) return;
  const loadSeries = async () => {
  const entityType = "internal_order"; // Customer orders always use internal series
  try {
  const res = await fetch(`/api/series/next-number?entity_type=${entityType}&admin_id=${adminSession.id}`);
  const data = await res.json();
  if (data.series) {
  setAvailableSeries(data.series);
  // Auto-select default series
  const defaultSeries = data.series.find((s: any) => s.is_default);
  if (defaultSeries) {
  setSelectedSeriesId(defaultSeries.id);
  } else if (data.series.length > 0) {
  setSelectedSeriesId(data.series[0].id);
  }
  }
  } catch {
  // Silently fail - series are optional
  }
  };
  loadSeries();
  }, [activeTab.form.order_type, adminSession?.id]);
  
  // ── Auto-fill payment terms from selected partner's Company profile ──
  // business_partners.payment_terms is free-text (e.g. "30 zile", "45 days",
  // "Net 60"), so we pull the first integer out of the string. If the partner
  // has no payment_terms set we keep whatever value the user already typed
  // (defaulted to 45 in emptyFormData). We track the last applied partner per
  // role to avoid clobbering manual edits when the form just re-renders.
  const lastAppliedPaymentRef = useRef<{ customer?: string; carrier?: string }>({});
  useEffect(() => {
    const parseDays = (txt: string | null | undefined): number | null => {
      if (!txt) return null;
      const m = String(txt).match(/\d+/);
      if (!m) return null;
      const n = parseInt(m[0], 10);
      if (!Number.isFinite(n) || n <= 0 || n > 365) return null;
      return n;
    };

    const f = activeTab.form;
    const updates: Partial<OrderFormData> = {};

    if (f.customer_id && lastAppliedPaymentRef.current.customer !== f.customer_id) {
      const cust = partners.find(p => p.id === f.customer_id);
      const days = parseDays(cust?.payment_terms);
      if (days != null) updates.payment_terms_customer_days = String(days);
      lastAppliedPaymentRef.current.customer = f.customer_id;
    }
    if (f.carrier_id && lastAppliedPaymentRef.current.carrier !== f.carrier_id) {
      const carr = partners.find(p => p.id === f.carrier_id);
      const days = parseDays(carr?.payment_terms);
      if (days != null) updates.payment_terms_carrier_days = String(days);
      lastAppliedPaymentRef.current.carrier = f.carrier_id;
    }
    if (Object.keys(updates).length > 0) updateForm(updates);
  }, [activeTab.form.customer_id, activeTab.form.carrier_id, partners]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch existing stops for vehicle in details mode (shows other orders on the same truck)
  useEffect(() => {
    if (step !== "details") return;
    const vId = activeTab?.form?.vehicle_id;
    if (!vId || !adminSession?.id) { setDetailsExistingStops([]); return; }
    const s = createClient();
    const fetchStops = async () => {
      const stops = activeTab.form.stops;
      const dates = stops.map(st => st.planned_date).filter(Boolean).sort();
      const dateFrom = dates[0] || "";
      const dateTo = dates[dates.length - 1] || dateFrom;
      if (!dateFrom) { setDetailsExistingStops([]); return; }
      const { data: overlappingOrders } = await s
        .from("orders")
        .select("id, reference_number, vehicle_id, order_stops(city, address, stop_type, planned_date, lat, lng, sequence_order)")
        .eq("admin_id", adminSession.id).eq("vehicle_id", vId)
        .in("status", ["confirmed", "dispatched", "in_transit"]);
      const found: any[] = [];
      for (const order of (overlappingOrders || [])) {
        if (order.id === activeTab.draftId) continue; // skip current draft
        const orderStops = (order.order_stops as any[]) || [];
        const orderDates = orderStops.map((os: any) => os.planned_date).filter(Boolean).sort();
        const oFrom = orderDates[0];
        const oTo = orderDates[orderDates.length - 1] || oFrom;
        if (oFrom && oFrom <= dateTo && oTo >= dateFrom) {
          for (const os of orderStops) {
            found.push({ order_ref: order.reference_number, city: os.city, address: os.address, stop_type: os.stop_type, planned_date: os.planned_date || "", lat: os.lat, lng: os.lng });
          }
        }
      }
      setDetailsExistingStops(found);
    };
    fetchStops();
  }, [step, activeTab?.form?.vehicle_id, adminSession?.id, activeTab?.draftId]);

  // Load existing drafts
  const loadDrafts = useCallback(async () => {
    if (!adminSession?.id) return;
    const s = createClient();
    // Scope drafts to the logged-in user. We accept BOTH the users.id and
    // the legacy tenant id (admins.id) as creator: the former is what new
    // drafts are stamped with, the latter covers historical owner-only
    // sessions that still write the tenant id. This way each dispatcher
    // sees only their own in-progress drafts on a multi-user tenant.
    const creatorIds = [adminSession.user_id, adminSession.id].filter(Boolean) as string[];
    const { data: drafts } = await s.from("orders")
      .select("*")
      .eq("admin_id", adminSession.id)
      .in("status", ["draft", "fwd_draft"])
      .in("created_by", creatorIds)
      .order("updated_at", { ascending: false });

    if (!drafts || drafts.length === 0) {
      draftsLoadedRef.current = true;
      return;
    }

    const draftIds = drafts.map(d => d.id);
    const { data: allStops } = await s.from("order_stops")
      .select("*")
      .in("order_id", draftIds)
      .order("sequence_order");

    const loadedTabs: DraftTab[] = drafts.map(draft => {
      const stops = (allStops || []).filter(st => st.order_id === draft.id)
        .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
      return {
        id: `tab-${draft.id}`,
        dbId: draft.id,
        referenceNumber: draft.reference_number || "",
        form: {
          order_type: draft.order_type || "internal",
          customer_id: draft.customer_id || "",
          customer_reference: draft.customer_reference || "",
          special_instructions: draft.special_instructions || "",
          internal_notes: draft.internal_notes || "",
          cargo_description: draft.cargo_description || "",
          goods_type: draft.goods_type || "",
          weight_kg: draft.weight_kg?.toString() || "",
          volume_m3: draft.volume_m3?.toString() || "",
          pallet_count: draft.pallet_count?.toString() || "",
          loading_meters: draft.loading_meters?.toString() || "",
          adr_class: draft.adr_class || "",
          temperature_min: draft.temperature_min?.toString() || "",
          temperature_max: draft.temperature_max?.toString() || "",
          stackable: draft.stackable || false,
          stops: stops.length > 0 ? stops.map(st => ({
            id: st.id,
            stop_type: st.stop_type || "pickup",
            company_name: st.company_name || "",
            address: st.address || "",
            city: st.city || "",
            country: st.country || "",
            postal_code: st.postal_code || "",
            lat: st.lat,
            lng: st.lng,
            planned_date: st.planned_date || "",
            planned_time_from: st.planned_time_from || "",
            planned_time_to: st.planned_time_to || "",
            contact_name: st.contact_name || "",
            contact_phone: st.contact_phone || "",
            contact_email: st.contact_email || "",
            reference_number: st.reference_number || "",
            notes: st.notes || "",
            form_id: st.form_id || "",
            origin: (st.origin === "execution" ? "execution" : "order") as "order" | "execution",
          })) : [emptyStop("pickup"), emptyStop("delivery")],
customer_price: draft.customer_price?.toString() || "",
  customer_currency: draft.customer_currency || "EUR",
  customer_vat_type: draft.customer_vat_type || "excluding",
  customer_vat_rate: draft.customer_vat_rate?.toString() || "21",
  payment_terms_customer_days: draft.payment_terms_customer_days?.toString() || "30",
  driver_id: draft.driver_id || "",
  vehicle_id: draft.vehicle_id || "",
  trailer_id: draft.trailer_id || "",
  form_id: draft.form_id || "",
  carrier_id: draft.carrier_id || "",
  carrier_cost: draft.carrier_cost?.toString() || "",
  carrier_currency: draft.carrier_currency || "EUR",
  carrier_vat_type: draft.carrier_vat_type || "excluding",
  carrier_vat_rate: draft.carrier_vat_rate?.toString() || "21",
  payment_terms_carrier_days: draft.payment_terms_carrier_days?.toString() || "30",
          estimated_distance_km: draft.estimated_distance_km?.toString() || "",
          estimated_duration_hours: draft.estimated_duration_hours?.toString() || "",
          route_geometry: draft.route_geometry || null,
          route_waypoints: draft.route_waypoints || [],
          trips: [],
        },
        saveStatus: "saved",
        lastSavedAt: new Date(draft.updated_at).toLocaleTimeString(),
  createdFrom: draft.created_from || "manual",
  sourceEmailId: null, aiExtractionId: null, aiTokensUsed: null, aiCostUsd: null, aiConfidence: null,
        pdfUrl: draft.source_document_url || null, aiCustomerName: null,
      };
    });

    setTabs(prev => {
      const emptyOnes = prev.filter(t => t.dbId === null && !t.form.customer_id);
      const all = [...loadedTabs, ...(emptyOnes.length === 0 && loadedTabs.length > 0 ? [] : emptyOnes)];
      return all.length > 0 ? all : [emptyDraft()];
    });
    // Mark drafts as loaded so auto-save can start safely
    draftsLoadedRef.current = true;
  }, [adminSession?.id]);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  // Auto-load attachment from email (when navigating from /admin/email with ?from=email)
  //
  // IMPORTANT — we must wait for reference data (especially `partners`)
  // to finish loading before kicking off the AI extraction. Reason:
  //   • `handleAiExtract` matches the AI-extracted customer name
  //     against the local `partners` array (see ~line 1484).
  //   • If we fire the extraction here before `fetchRefData()` has
  //     resolved, `partners` is still `[]` at the moment the extract
  //     function closes over it (and the long-running `/api/tms/extract-
  //     order` fetch doesn't see the later state update either, because
  //     setTimeout captures the function instance from THIS render).
  //   • Net result: the match always failed → the Quick Partner dialog
  //     was shown even for customers that already existed in the DB.
  //
  // The fix is to require `loading === false` before doing anything.
  // The other entry point (manual upload via the form's file input) is
  // not affected because the user can only click upload after the page
  // has finished its initial render, by which time partners are loaded.
  useEffect(() => {
    if (emailAutoLoadRef.current) return;
    if (searchParams.get("from") !== "email") return;
    if (!adminSession?.id) return;
    if (loading) return; // wait for partners / drivers / vehicles / forms
    emailAutoLoadRef.current = true;

    try {
      const stored = sessionStorage.getItem("email_attachment_for_order");
      if (!stored) return;
      sessionStorage.removeItem("email_attachment_for_order");
      const { fileName, dataUrl, emailSubject, emailFrom, signed, signedDocumentUrl, emailId } = JSON.parse(stored);
      if (!dataUrl || !fileName) return;

      // Convert base64 data URL back to File
      const arr = dataUrl.split(",");
      const mime = arr[0].match(/:(.*?);/)?.[1] || "application/pdf";
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      const file = new File([u8arr], fileName, { type: mime });

// Email orders - execution type will be chosen by user (internal or forwarding)
  // Note: order_type stays "internal" for all customer orders, execution is on trips
  if (emailSubject) updateForm({ special_instructions: `From email: ${emailSubject}${emailFrom ? ` (${emailFrom})` : ""}` });

      // If document was already signed and sent to customer, set status to fwd_unassigned
      // (client confirmed -- ready to assign carrier)
      if (signed) {
        updateForm({ status: "fwd_unassigned" });
        setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, createdFrom: "email_signed", pdfUrl: signedDocumentUrl || null, sourceEmailId: emailId || null } : t));
        toast({ title: tr("tms.newOrder.ai.signedLoaded"), description: `"${fileName}" already confirmed with customer. Status: Unassigned to Carrier.` });
      } else {
        setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, sourceEmailId: emailId || null } : t));
        toast({ title: tr("tms.newOrder.ai.emailLoaded"), description: `Processing "${fileName}" with AI extraction...` });
      }

      // Trigger AI extraction
      setTimeout(() => handleAiExtract(file), 500);
    } catch (e) {
      console.error("Failed to load email attachment:", e);
    }
  // `loading` is included so the effect re-runs once reference data
  // finishes fetching (transition from true → false). The internal
  // `emailAutoLoadRef.current` guard ensures the body still only
  // executes once across all re-runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, adminSession?.id, loading]);

  // Auto save -- blocked until initial load completes
  const autoSave = useCallback(async (): Promise<string | null> => {
    console.log("[v0] autoSave called, adminSession:", !!adminSession?.id, "draftsLoaded:", draftsLoadedRef.current, "submitting:", submitting);
    if (!adminSession?.id) { console.log("[v0] autoSave: No admin session"); return null; }
    if (!draftsLoadedRef.current) { console.log("[v0] autoSave: Drafts not loaded yet"); return null; }
    if (submitting) { console.log("[v0] autoSave: Submission in progress, skipping"); return null; }
    const tab = tabs[activeTabIndex];
    if (!tab || tab.saveStatus === "saving") { console.log("[v0] autoSave: Tab saving or missing"); return tab?.dbId || null; }
    // Don't auto-save if the order was already submitted (no longer a draft)
    if (tab.form.status && tab.form.status !== "draft") { console.log("[v0] autoSave: Order already submitted, skipping"); return tab.dbId; }

    // Don't create a NEW draft unless there's meaningful data (at least customer or stops)
    const f = tab.form;
    const hasMeaningfulData = f.customer_id || (f.stops && f.stops.length > 0) || f.cargo_description || f.customer_price;
    if (!tab.dbId && !hasMeaningfulData) {
      console.log("[v0] autoSave: No dbId and no meaningful data, skipping creation of empty draft");
      setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, saveStatus: "idle" as const } : t));
      return null;
    }

    console.log("[v0] autoSave: Starting save, current dbId:", tab.dbId);
    setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, saveStatus: "saving" as const } : t));
    const s = createClient();

try {
  // All customer orders are type "internal" - execution type is determined by trips
  const orderStatus = "draft";
  const orderData: any = {
  admin_id: adminSession.id,
  order_type: "internal", // Customer orders are always internal type
  status: orderStatus,
        customer_id: f.customer_id || null,
        customer_reference: f.customer_reference || null,
        special_instructions: f.special_instructions || null,
        internal_notes: f.internal_notes || null,
        cargo_description: f.cargo_description || null,
        goods_type: f.goods_type || null,
        weight_kg: f.weight_kg ? parseFloat(f.weight_kg) : null,
        volume_m3: f.volume_m3 ? parseFloat(f.volume_m3) : null,
        pallet_count: f.pallet_count ? parseInt(f.pallet_count) : null,
        loading_meters: f.loading_meters ? parseFloat(f.loading_meters) : null,
        adr_class: f.adr_class || null,
        temperature_min: f.temperature_min ? parseFloat(f.temperature_min) : null,
        temperature_max: f.temperature_max ? parseFloat(f.temperature_max) : null,
        stackable: f.stackable,
        customer_price: f.customer_price ? parseFloat(f.customer_price) : null,
        customer_currency: f.customer_currency,
        customer_vat_type: f.customer_vat_type,
        customer_vat_rate: f.customer_vat_rate ? parseFloat(f.customer_vat_rate) : 21,
        ...calculateVatAmounts(f.customer_price, f.customer_vat_type, f.customer_vat_rate, "customer"),
        payment_terms_customer_days: f.payment_terms_customer_days ? parseInt(f.payment_terms_customer_days) : null,
        driver_id: f.driver_id || null,
        vehicle_id: f.vehicle_id || null,
        trailer_id: f.trailer_id || null,
        form_id: f.form_id || null,
        carrier_id: f.carrier_id || null,
        carrier_cost: f.carrier_cost ? parseFloat(f.carrier_cost) : null,
        carrier_currency: f.carrier_currency,
        carrier_vat_type: f.carrier_vat_type,
        carrier_vat_rate: f.carrier_vat_rate ? parseFloat(f.carrier_vat_rate) : 21,
        ...calculateVatAmounts(f.carrier_cost, f.carrier_vat_type, f.carrier_vat_rate, "carrier"),
        payment_terms_carrier_days: f.payment_terms_carrier_days ? parseInt(f.payment_terms_carrier_days) : null,
        estimated_distance_km: f.estimated_distance_km ? parseFloat(f.estimated_distance_km) : null,
        estimated_duration_hours: f.estimated_duration_hours ? parseFloat(f.estimated_duration_hours) : null,
        route_geometry: f.route_geometry || null,
        route_waypoints: f.route_waypoints || [],
created_from: tab.createdFrom,
  source_document_url: tab.pdfUrl || null,
  is_draft: true,
  commercial_role: "customer_order", // Customer orders during draft
  };
  
  let orderId = tab.dbId;
      let needsInsert = !orderId;

      if (orderId) {
        // Verify the row actually exists and was updated
        console.log("[v0] autoSave: Updating existing order:", orderId);
        const { data: updated, error: updateErr } = await s.from("orders").update(orderData).eq("id", orderId).select("id");
        console.log("[v0] autoSave: Update result:", updated, "error:", updateErr);
        if (!updated || updated.length === 0) {
          // Row was deleted or never existed - need a fresh insert
          orderId = null;
          needsInsert = true;
          setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, dbId: null } : t));
        }
      }

      if (needsInsert) {
        console.log("[v0] autoSave: Inserting new order");
        // Generate a draft reference number: DRAFT-YYYYMMDD-XXXX
        const now = new Date();
        const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
        const rand = Math.floor(1000 + Math.random() * 9000);
        orderData.reference_number = `DRAFT-${datePart}-${rand}`;
        console.log("[v0] autoSave: orderData to insert:", JSON.stringify(orderData));

        const { data, error } = await s.from("orders").insert(orderData).select("id, reference_number");
        console.log("[v0] autoSave: Insert result:", data, "error:", error);
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("Insert succeeded but no data returned - check RLS policies on orders table");
        }
        const insertedOrder = data[0];
        orderId = insertedOrder.id;
        console.log("[v0] autoSave: Inserted order, new ID:", orderId);
        setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, dbId: insertedOrder.id, referenceNumber: insertedOrder.reference_number || "" } : t));
      }

      // Upsert stops
      if (orderId) {
        await s.from("order_stops").delete().eq("order_id", orderId);
        const stopsToInsert = f.stops.map((stop, idx) => ({
          order_id: orderId,
          sequence_order: idx + 1,
          stop_type: stop.stop_type,
          company_name: stop.company_name || null,
          address: stop.address || null,
          city: stop.city || null,
          country: stop.country || null,
          postal_code: stop.postal_code || null,
          lat: stop.lat,
          lng: stop.lng,
          planned_date: stop.planned_date || null,
          planned_time_from: stop.planned_time_from || null,
          planned_time_to: stop.planned_time_to || null,
          contact_name: stop.contact_name || null,
          contact_phone: stop.contact_phone || null,
          contact_email: stop.contact_email || null,
          reference_number: stop.reference_number || null,
          notes: stop.notes || null,
          form_id: stop.form_id || null,
          origin: stop.origin || "order",
        }));
        if (stopsToInsert.length > 0) {
          await s.from("order_stops").insert(stopsToInsert);
        }
      }

      // Link order back to source email (set converted_to_order_id)
      if (orderId && tab.sourceEmailId && needsInsert) {
        try {
          await s.from("user_emails").update({ converted_to_order_id: orderId }).eq("id", tab.sourceEmailId);
        } catch { /* non-critical */ }
      }

      const now = new Date().toLocaleTimeString();
      setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, saveStatus: "saved" as const, lastSavedAt: now } : t));
      return orderId || null;
    } catch (err: any) {
      // Draft save error
      console.error("[v0] Draft save error:", err?.message || err);
      setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, saveStatus: "error" as const } : t));
  return tab.dbId || null;
  }
}, [adminSession?.id, activeTabIndex, tabs, submitting]);

  // Debounced auto save -- only after drafts have been loaded from DB
  useEffect(() => {
    if (!draftsLoadedRef.current) return;
    if (submitting) return; // Don't auto-save while submitting
    if (activeTab.saveStatus !== "idle") return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => autoSave(), 2000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [activeTab.form, activeTab.saveStatus, autoSave, submitting]);

  // AI Extraction handler
  const handleAiExtract = async (file: File) => {
    if (!adminSession?.id) return;
    // Create a local preview URL for the file
    const objectUrl = URL.createObjectURL(file);
    setAiState({ stage: "uploading", progress: 10, message: "Uploading document...", fileUrl: null, fileName: file.name, fileObjectUrl: objectUrl, metadata: null, error: null });

    try {
      await new Promise(r => setTimeout(r, 500));
      setAiState(prev => ({ ...prev, stage: "classifying", progress: 30, message: "Analyzing document pages..." }));

      await new Promise(r => setTimeout(r, 800));
      setAiState(prev => ({ ...prev, stage: "extracting", progress: 50, message: "AI extracting order details..." }));

      const formData = new FormData();
      formData.append("file", file);
      formData.append("admin_id", adminSession.id);
      if (selectedInstructionId) {
        formData.append("instruction_id", selectedInstructionId);
      }

      const res = await fetch("/api/tms/extract-order", { method: "POST", body: formData });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Extraction failed");
      }

      setAiState(prev => ({ ...prev, progress: 85, message: "Processing results..." }));
      await new Promise(r => setTimeout(r, 500));

      const result = await res.json();
      const ext = result.extraction;

      // Map extraction to form data
      const newForm: Partial<OrderFormData> = {};
      if (ext.cargo_description) newForm.cargo_description = ext.cargo_description;
      if (ext.goods_type) newForm.goods_type = ext.goods_type;
      if (ext.weight_kg) newForm.weight_kg = ext.weight_kg.toString();
      if (ext.volume_m3) newForm.volume_m3 = ext.volume_m3.toString();
      if (ext.pallet_count) newForm.pallet_count = ext.pallet_count.toString();
      if (ext.loading_meters) newForm.loading_meters = ext.loading_meters.toString();
      if (ext.adr_class) newForm.adr_class = ext.adr_class;
      if (ext.temperature_min) newForm.temperature_min = ext.temperature_min.toString();
      if (ext.temperature_max) newForm.temperature_max = ext.temperature_max.toString();
      if (ext.stackable !== null && ext.stackable !== undefined) newForm.stackable = ext.stackable;
      if (ext.special_instructions) newForm.special_instructions = ext.special_instructions;
      if (ext.customer_price) newForm.customer_price = ext.customer_price.toString();
      if (ext.customer_currency) newForm.customer_currency = ext.customer_currency;
      if (ext.payment_terms_days) newForm.payment_terms_customer_days = ext.payment_terms_days.toString();
      
      // Handle customer reference - use trip_number or customer_reference as main reference
      // customer_reference = main order number (e.g., Cursa: 40116)
      // all_references = individual shipment refs (e.g., Comanda vanzari numbers)
      if (ext.customer_reference) {
        newForm.customer_reference = ext.customer_reference;
      } else if (ext.trip_number) {
        // Fallback to trip_number if customer_reference not set
        newForm.customer_reference = ext.trip_number;
      }
      
      // Add trip number and shipment references to internal notes if present
      const internalNotes = [];
      if (ext.trip_number) internalNotes.push(`Trip: ${ext.trip_number}`);
      if (ext.seal_number) internalNotes.push(`Seal: ${ext.seal_number}`);
      if (ext.crossing_info) internalNotes.push(`Crossing: ${ext.crossing_info}`);
      // Add all shipment references (Comanda vanzari numbers) to notes
      if (ext.all_references && ext.all_references.length > 0) {
        internalNotes.push(`Shipment refs: ${ext.all_references.join(", ")}`);
      }
      if (internalNotes.length > 0) {
        newForm.internal_notes = internalNotes.join(" | ");
      }

      // Map stops - use the AI-extracted reference_number per stop (not cargo items details)
      if (ext.stops && ext.stops.length > 0) {
        newForm.stops = ext.stops.map((s: any) => {
          // Use the reference extracted by AI for THIS specific stop
          const refNumber = s.reference_number || "";
          
          return {
            id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            stop_type: s.type || "pickup",
            company_name: s.company_name || "",
            address: s.address || "",
            city: s.city || "",
            country: s.country || "",
            postal_code: s.postal_code || "",
            lat: null, lng: null,
            planned_date: s.planned_date || "",
            planned_time_from: s.planned_time_from || "",
            planned_time_to: s.planned_time_to || "",
            contact_name: s.contact_name || "",
            contact_phone: s.contact_phone || "",
            contact_email: "",
            reference_number: refNumber,
            notes: s.notes || "",
            origin: "order" as const,
          };
        });
      }

      // Try to match customer name to existing partner
      // customer_name = who ISSUED the document (the real customer, e.g. DE HART)
      // carrier_name = who the order is FOR (our company, e.g. Noarlog Trans)
      let customerMatched = false;
      const extractedCustomerName = ext.customer_name || null;
      const extractedCarrierName = (ext as any).carrier_name || null;

      console.log("[v0] AI Extraction - Customer (document issuer):", extractedCustomerName);
      console.log("[v0] AI Extraction - Carrier (our company):", extractedCarrierName);

      if (extractedCustomerName) {
        const matchedPartner = partners.find(p =>
          p.name.toLowerCase().includes(extractedCustomerName.toLowerCase()) ||
          extractedCustomerName.toLowerCase().includes(p.name.toLowerCase())
        );
        if (matchedPartner) {
          newForm.customer_id = matchedPartner.id;
          customerMatched = true;
        }
      }

      updateForm(newForm);
      updateTab({
        createdFrom: "ai_upload",
        aiTokensUsed: result.metadata?.totalInputTokens + result.metadata?.totalOutputTokens,
        aiCostUsd: result.metadata?.estimatedCostUsd,
        aiConfidence: ext.confidence,
        pdfUrl: result.fileUrl || objectUrl,
        aiCustomerName: extractedCustomerName,
      });

      setAiState(prev => ({
        ...prev,
        stage: "done", progress: 100, message: "Extraction complete!",
        fileUrl: result.fileUrl, metadata: result.metadata,
      }));

      // If customer not matched, prompt to create
      if (!customerMatched && extractedCustomerName) {
        setSuggestedPartnerName(extractedCustomerName);
        setSuggestedPartnerVat((ext as any).customer_vat || "");
        setShowCreatePartner(true);
      }

      if (ext.warnings && ext.warnings.length > 0) {
        toast({ title: "AI extraction warnings", description: ext.warnings.join("; "), variant: "destructive" });
      }
    } catch (err: any) {
      setAiState(prev => ({
        ...prev,
        stage: "error", progress: 0, message: err.message || "Extraction failed",
        error: err.message,
      }));
    }
  };

  // Tab management
  const addNewTab = () => {
    setTabs(prev => [...prev, emptyDraft()]);
    setActiveTabIndex(tabs.length);
    setAiState({ stage: "idle", progress: 0, message: "", fileUrl: null, fileName: null, fileObjectUrl: null, metadata: null, error: null });
  };

  const closeTab = async (index: number) => {
    if (tabs.length <= 1) return;
    const closingTab = tabs[index];
    if (closingTab.dbId) {
      const s = createClient();

      // SAFETY GUARD: only delete if the underlying row is still a draft.
      // A previous bug here would delete a freshly confirmed order on success.
      const { data: rowCheck } = await s
        .from("orders")
        .select("id, is_draft, status")
        .eq("id", closingTab.dbId)
        .maybeSingle();
      const isStillDraft = rowCheck && (rowCheck.is_draft === true || rowCheck.status === "draft");

      if (isStillDraft) {
        // Get trips linked to this order via trip_orders junction table
        const { data: tripOrdersData } = await s.from("trip_orders").select("trip_id").eq("order_id", closingTab.dbId);
        const tripIds = tripOrdersData?.map(to => to.trip_id) || [];
        
        if (tripIds.length > 0) {
          // Delete trip_legs first (references trips)
          await s.from("trip_legs").delete().in("trip_id", tripIds);
          // Delete trip_stops (references trips and orders)
          await s.from("trip_stops").delete().in("trip_id", tripIds);
          // Delete trip_orders junction
          await s.from("trip_orders").delete().eq("order_id", closingTab.dbId);
          // Delete trips
          await s.from("trips").delete().in("id", tripIds);
        }
        // Delete order_stops
        await s.from("order_stops").delete().eq("order_id", closingTab.dbId);
        // Finally delete the order
        await s.from("orders").delete().eq("id", closingTab.dbId);
      }
    }
    const newTabs = tabs.filter((_, i) => i !== index);
    setTabs(newTabs);
    if (activeTabIndex >= newTabs.length) setActiveTabIndex(newTabs.length - 1);
    else if (activeTabIndex > index) setActiveTabIndex(activeTabIndex - 1);
  };

  // Address search
  const [searchResults, setSearchResults] = useState<AddressSuggestion[]>([]);
  const [searchingStop, setSearchingStop] = useState<number | null>(null);

  const searchAddress = async (query: string) => {
    if (query.length < 3) { setSearchResults([]); return; }
    try {
      const res = await fetch(`https://rvs.bngtracking.ro/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
      const data = await res.json();
      setSearchResults(data.map((r: any) => ({ display_name: r.display_name, lat: r.lat, lon: r.lon })));
    } catch { setSearchResults([]); }
  };

  // Submit order
  const handleSubmit = async (
    targetStatus: "confirmed" | "dispatched" = "confirmed",
    options: { goToExecution?: boolean } = {},
  ) => {
    console.log("[v0] handleSubmit called with targetStatus:", targetStatus);
    if (!adminSession?.id) {
      console.log("[v0] handleSubmit: No adminSession.id");
      return;
    }
    setSubmitting(true);
    try {
      console.log("[v0] handleSubmit: Starting order save");
      // 1. Cancel any pending autosave, we'll do a fresh inline save
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

      const s = createClient();
      const f = activeTab.form;
      let orderId = activeTab.dbId;

// Build full order data for insert/update
  // All customer orders are "internal" type - execution type is determined by trips
  const orderData: any = {
  admin_id: adminSession.id,
  order_type: "internal", // Customer orders are always internal type
  status: "draft",
        customer_id: f.customer_id || null,
        customer_reference: f.customer_reference || null,
        special_instructions: f.special_instructions || null,
        internal_notes: f.internal_notes || null,
        cargo_description: f.cargo_description || null,
        goods_type: f.goods_type || null,
        weight_kg: f.weight_kg ? parseFloat(f.weight_kg) : null,
        volume_m3: f.volume_m3 ? parseFloat(f.volume_m3) : null,
        pallet_count: f.pallet_count ? parseInt(f.pallet_count) : null,
        loading_meters: f.loading_meters ? parseFloat(f.loading_meters) : null,
        adr_class: f.adr_class || null,
        temperature_min: f.temperature_min ? parseFloat(f.temperature_min) : null,
        temperature_max: f.temperature_max ? parseFloat(f.temperature_max) : null,
        stackable: f.stackable,
        customer_price: f.customer_price ? parseFloat(f.customer_price) : null,
        customer_currency: f.customer_currency,
        customer_vat_type: f.customer_vat_type,
        customer_vat_rate: f.customer_vat_rate ? parseFloat(f.customer_vat_rate) : 21,
        ...calculateVatAmounts(f.customer_price, f.customer_vat_type, f.customer_vat_rate, "customer"),
        payment_terms_customer_days: f.payment_terms_customer_days ? parseInt(f.payment_terms_customer_days) : null,
        driver_id: f.driver_id || null,
        vehicle_id: f.vehicle_id || null,
        trailer_id: f.trailer_id || null,
        form_id: f.form_id || null,
        carrier_id: f.carrier_id || null,
        carrier_cost: f.carrier_cost ? parseFloat(f.carrier_cost) : null,
        carrier_currency: f.carrier_currency,
        carrier_vat_type: f.carrier_vat_type,
        carrier_vat_rate: f.carrier_vat_rate ? parseFloat(f.carrier_vat_rate) : 21,
        ...calculateVatAmounts(f.carrier_cost, f.carrier_vat_type, f.carrier_vat_rate, "carrier"),
        payment_terms_carrier_days: f.payment_terms_carrier_days ? parseInt(f.payment_terms_carrier_days) : null,
        created_from: activeTab.createdFrom,
        // Prefer the logged-in user's id (users.id) so the dispatcher
        // resolves to the user's linked employee. Fall back to the
        // tenant id only for legacy sessions that have no users-table
        // record (e.g. owner-only logins).
        created_by: adminSession.user_id ?? adminSession.id,
        source_document_url: activeTab.pdfUrl || null,
        is_draft: true,
        commercial_role: "customer_order", // This is a direct customer order
      };

      // If we have a dbId, verify it exists; if not, insert fresh
      console.log("[v0] handleSubmit: orderId before check:", orderId);
      if (orderId) {
        console.log("[v0] handleSubmit: Updating existing order");
        const { data: updated, error: updateErr } = await s.from("orders").update(orderData).eq("id", orderId).select("id");
        console.log("[v0] handleSubmit: Update result:", updated, "error:", updateErr);
        if (!updated || updated.length === 0) {
          orderId = null;
        }
      }
      if (!orderId) {
        console.log("[v0] handleSubmit: Inserting new order");
        const now2 = new Date();
        const dp = now2.toISOString().slice(0, 10).replace(/-/g, "");
        const rnd = Math.floor(1000 + Math.random() * 9000);
        orderData.reference_number = `DRAFT-${dp}-${rnd}`;
        console.log("[v0] handleSubmit: orderData to insert:", JSON.stringify(orderData));
        const { data: ins, error: insErr } = await s.from("orders").insert(orderData).select("id");
        console.log("[v0] handleSubmit: Insert result:", ins, "error:", insErr);
        if (insErr) throw insErr;
        if (!ins || ins.length === 0) throw new Error("Insert succeeded but no data returned");
        orderId = ins[0].id;
        console.log("[v0] handleSubmit: New orderId:", orderId);
        setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, dbId: ins[0].id } : t));
      }

      // Save stops
      console.log("[v0] handleSubmit: STEP saving order_stops, count:", f.stops?.length || 0);
      const { error: delStopsErr } = await s.from("order_stops").delete().eq("order_id", orderId);
      if (delStopsErr) {
        console.log("[v0] handleSubmit: order_stops delete error:", delStopsErr);
      }
      if (f.stops.length > 0) {
        const stopsToInsert = f.stops.map((stop, idx) => ({
          order_id: orderId,
          sequence_order: idx + 1,
          stop_type: stop.stop_type,
          company_name: stop.company_name || null,
          address: stop.address || null,
          city: stop.city || null,
          country: stop.country || null,
          postal_code: stop.postal_code || null,
          lat: stop.lat || null,
          lng: stop.lng || null,
          planned_date: stop.planned_date || null,
          planned_time_from: stop.planned_time_from || null,
          planned_time_to: stop.planned_time_to || null,
          contact_name: stop.contact_name || null,
          contact_phone: stop.contact_phone || null,
          contact_email: stop.contact_email || null,
          reference_number: stop.reference_number || null,
          notes: stop.notes || null,
          form_id: stop.form_id || null,
          origin: stop.origin || "order",
        }));
        const { error: insStopsErr } = await s.from("order_stops").insert(stopsToInsert);
        if (insStopsErr) {
          console.log("[v0] handleSubmit: order_stops insert error:", insStopsErr);
          throw insStopsErr;
        }
      }
      console.log("[v0] handleSubmit: STEP order_stops saved");

      // Fetch saved order_stops with their DB IDs (needed for trip_stops linking)
      console.log("[v0] handleSubmit: STEP fetching savedStops");
      const { data: savedStops, error: fetchStopsErr } = await s.from("order_stops")
        .select("id, sequence_order, stop_type, company_name, address, city, country, lat, lng, planned_date, planned_time_from, planned_time_to, notes, form_id, auto_checkin, auto_checkout, geofence_radius")
        .eq("order_id", orderId)
        .order("sequence_order", { ascending: true });
      console.log("[v0] handleSubmit: STEP savedStops fetched, count:", savedStops?.length || 0, "err:", fetchStopsErr);

      if (!orderId) throw new Error("Could not save order");

      // All orders created here are customer orders
      // The order_type field now indicates the PRIMARY execution method chosen
      const formTrips = f.trips || [];
      // hasMultipleTrips will be recalculated after we determine effectiveTrips
      let hasMultipleTrips = formTrips.length > 1;

      // Determine primary allocation (first trip in multi-trip, or simple values)
      const primaryDriverId = hasMultipleTrips ? (formTrips[0]?.driver_id || null) : (f.driver_id || null);
      const primaryVehicleId = hasMultipleTrips ? (formTrips[0]?.vehicle_id || null) : (f.vehicle_id || null);
      const primaryTrailerId = hasMultipleTrips ? (formTrips[0]?.trailer_id || null) : (f.trailer_id || null);
      
      // Check if any trip segment is forwarding
      const hasForwardingTrip = formTrips.some((t: any) => t.assignment_type === "forwarding") || f.order_type === "forwarding";
      const hasInternalTrip = formTrips.some((t: any) => t.assignment_type === "own_fleet" || t.assignment_type === "internal") || (f.order_type === "internal" && (primaryDriverId || primaryVehicleId));
      
      // Determine if we have allocation (internal trips with driver/vehicle)
      const hasAllocation = hasInternalTrip && (primaryDriverId || primaryVehicleId);
      
      // Determine status based on execution type. The DB constraint
      // (orders_status_check) only accepts the v3 unified status names —
      // legacy "confirmed" / "dispatched" were renamed to
      // "confirmed_to_customer" / "in_execution" in 110_status_v3_unified.sql.
      let status: string;
      if (hasForwardingTrip && !hasInternalTrip) {
        // Pure forwarding — customer side stays "confirmed_to_customer";
        // the FWD child carries its own fwd_* lifecycle.
        status = "confirmed_to_customer";
      } else if (hasAllocation) {
        // "Create & Proceed to Execution" sends targetStatus="dispatched"
        // from the UI, which now maps to in_execution.
        status = targetStatus === "dispatched" ? "in_execution" : "confirmed_to_customer";
      } else {
        status = "confirmed_to_customer";
      }
// 2. Generate proper reference number using series configurator
      // Customer orders always use internal_order series (they're customer-facing)
      let refNumber: string;
      try {
        // Hard timeout so a hanging series API can't keep "Creating..." spinning forever
        const ac = new AbortController();
        const tHandle = setTimeout(() => ac.abort(), 8000);
        const seriesRes = await fetch("/api/series/next-number", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: "internal_order", // Customer orders use internal series
            series_id: selectedSeriesId || undefined,
            admin_id: adminSession?.id,
          }),
          signal: ac.signal,
        });
        clearTimeout(tHandle);
        const seriesData = await seriesRes.json();
        if (seriesData.error) {
          throw new Error(seriesData.error);
        }
        refNumber = seriesData.number;
      } catch (seriesErr) {
        console.log("[v0] handleSubmit: series API failed, using fallback:", seriesErr);
        // Fallback if series API fails
        const now = new Date();
        const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
        const { count } = await s.from("orders").select("*", { count: "exact", head: true }).eq("is_draft", false);
        const seq = String((count || 0) + 1).padStart(4, "0");
        refNumber = `TMS-${datePart}-${seq}`;
      }

      // 3. Update the order with status, allocation, and reference
      // Note: Customer orders store driver/vehicle for internal trips only
      // Carrier info is stored on the FWD subcontract order, not the customer order
      const updatePayload: any = {
        status,
        is_draft: false,
        reference_number: refNumber,
        order_type: "internal", // All customer orders are "internal" type - execution type is on trips
        driver_id: hasInternalTrip ? primaryDriverId : null,
        vehicle_id: hasInternalTrip ? primaryVehicleId : null,
        trailer_id: hasInternalTrip ? primaryTrailerId : null,
        // Don't store carrier info on customer order - it goes on the FWD subcontract
        carrier_id: null,
        carrier_cost: null,
        carrier_currency: null,
      };
      // Customer orders don't need forwarding checklist - that goes on the subcontract FWD order
      console.log("[v0] handleSubmit: STEP final order update, status:", status, "refNumber:", refNumber);
      const { error: orderErr, data: orderUpdated } = await s.from("orders").update(updatePayload).eq("id", orderId).select("id, status, is_draft, reference_number");
      console.log("[v0] handleSubmit: STEP final order update result, count:", orderUpdated?.length || 0, "err:", orderErr);
      if (orderErr) throw orderErr;
      if (!orderUpdated || orderUpdated.length === 0) {
        throw new Error(`Order ${orderId} not found in database. Please try saving again.`);
      }

      // 4. Create trips OR add to existing trip
      // Use executionStops if available (user went through execution step), otherwise fall back to form stops
      const effectiveStopsGlobal = executionStops.length > 0 ? executionStops : f.stops;
      
      // If no trips defined but we have stops, create a default trip
      // This ensures an order always has at least one trip/leg when created
      let effectiveTrips = formTrips;
      if (formTrips.length === 0 && effectiveStopsGlobal.length >= 2) {
        effectiveTrips = [{
          id: crypto.randomUUID(),
          trip_number: 1,
          from_stop_index: 0,
          to_stop_index: effectiveStopsGlobal.length - 1,
          assignment_type: f.order_type === "forwarding" ? "forwarding" : (primaryDriverId || primaryVehicleId ? "own_fleet" : "undecided"),
          driver_id: primaryDriverId || "",
          vehicle_id: primaryVehicleId || "",
          trailer_id: primaryTrailerId || "",
          carrier_id: f.carrier_id || "",
          carrier_cost: f.carrier_cost || "",
          carrier_currency: f.carrier_currency || "EUR",
          swap_type: null,
          notes: "",
          route_info: null,
        }];
      }
      
      // Create trips when: formTrips exist (user defined legs), OR has allocation, OR has forwarding, OR we have stops
      const hasDefinedTrips = effectiveTrips.length > 0;
      hasMultipleTrips = effectiveTrips.length > 1; // Recalculate with effective trips
      const shouldCreateTrips = hasDefinedTrips || hasAllocation || hasForwardingTrip;
      
      console.log("[v0] handleSubmit: Trip creation check");
      console.log("[v0] handleSubmit: formTrips.length:", formTrips.length);
      console.log("[v0] handleSubmit: effectiveTrips.length:", effectiveTrips.length);
      console.log("[v0] handleSubmit: hasDefinedTrips:", hasDefinedTrips);
      console.log("[v0] handleSubmit: hasForwardingTrip:", hasForwardingTrip);
      console.log("[v0] handleSubmit: hasAllocation:", hasAllocation);
      console.log("[v0] handleSubmit: shouldCreateTrips:", shouldCreateTrips);
      console.log("[v0] handleSubmit: executionStops.length:", executionStops.length);
      console.log("[v0] handleSubmit: effectiveStopsGlobal.length:", effectiveStopsGlobal.length);
      
      if (shouldCreateTrips) {
        // Check if we're adding to an existing trip on this vehicle (internal only)
        if (existingTripId && hasAllocation) {
          // --- ADD TO EXISTING TRIP ---
          // 4a. Link new order to existing trip
          const { data: existingLinks } = await s.from("trip_orders")
            .select("sequence").eq("trip_id", existingTripId).order("sequence", { ascending: false }).limit(1);
          const nextSeq = (existingLinks?.[0]?.sequence || 0) + 1;
          await s.from("trip_orders").insert({
            trip_id: existingTripId,
            order_id: orderId,
            sequence: nextSeq,
          });

          // 4b. Delete old trip_stops and re-insert ALL stops (existing + new) in correct order
          await s.from("trip_stops").delete().eq("trip_id", existingTripId);

          const routeLegs = executionRoute.legs || [];
          const tripStopsToInsert = [];
          for (let si = 0; si < executionStops.length; si++) {
            const execStop = executionStops[si];
            const isFirstInTrip = si === 0;
            const leg = !isFirstInTrip && si - 1 >= 0 ? routeLegs[si - 1] : null;

            // For existing trip stops, preserve their original order_stop_id and order_id
            // For new order stops, find matching savedStop
            let orderStopId = execStop.existing_trip_stop_id ? null : null; // we rebuild all
            let stopOrderId = execStop.existing_order_id || null;

            if (execStop.origin === "existing_trip") {
              // Existing trip stop: keep its order_id and find its order_stop_id from the original
              stopOrderId = execStop.existing_order_id || null;
              // The existing_trip_stop had an order_stop_id, but we don't have it in StopData;
              // it will be preserved through the existing_trip_stop_id if needed
            } else if (execStop.origin === "order") {
              // New order stop: link to this new order
              stopOrderId = orderId;
              const matchedSaved = savedStops?.find((os: any) =>
                (os.company_name === execStop.company_name && os.city === execStop.city) ||
                (os.lat === execStop.lat && os.lng === execStop.lng)
              );
              orderStopId = matchedSaved?.id || null;
            } else if (execStop.origin === "execution") {
              // Execution-added stop (transit, rest, etc.)
              stopOrderId = null;
              orderStopId = null;
            }

            tripStopsToInsert.push({
              trip_id: existingTripId,
              order_stop_id: orderStopId,
              order_id: stopOrderId,
              sequence_order: si + 1,
              stop_type: execStop.stop_type || "transit",
              company_name: execStop.company_name || null,
              address: execStop.address || null,
              city: execStop.city || null,
              country: execStop.country || null,
              lat: execStop.lat || null,
              lng: execStop.lng || null,
              planned_date: execStop.planned_date || null,
              planned_time_from: execStop.planned_time_from || null,
              planned_time_to: execStop.planned_time_to || null,
              notes: execStop.notes || null,
              status: "pending",
              auto_checkin: execStop.auto_checkin ?? false,
              auto_checkout: execStop.auto_checkout ?? false,
              geofence_radius: execStop.geofence_radius ?? 200,
              form_id: execStop.form_id || null,
              route_to_geometry: leg?.geometry || null,
              distance_to_km: leg ? Math.round(leg.distance_km * 10) / 10 : null,
              duration_to_minutes: leg ? Math.round(leg.duration_min) : null,
            });
          }

          if (tripStopsToInsert.length > 0) {
            await s.from("trip_stops").insert(tripStopsToInsert);
          }

          // 4c. Update the existing trip's route geometry, distance, duration
          const totalDist = executionRoute.distance_km || null;
          const totalDur = executionRoute.duration_hours ? Math.round(executionRoute.duration_hours * 60) : null;
          await s.from("trips").update({
            distance_km: totalDist,
            duration_minutes: totalDur,
            route_geometry: executionRoute.geometry && executionRoute.geometry.length > 0 ? executionRoute.geometry : undefined,
            to_stop_index: executionStops.length - 1,
          }).eq("id", existingTripId);

        } else {
          // --- CREATE NEW TRIP(S) ---
          console.log("[v0] handleSubmit: Creating new trip(s)");
          // Determine the default assignment type based on what the user selected
          const defaultAssignmentType = f.order_type === "forwarding" ? "forwarding" : "own_fleet";
          const tripsToCreate = effectiveTrips.length > 0 ? effectiveTrips : [{
            id: crypto.randomUUID(), trip_number: 1,
            from_stop_index: 0, to_stop_index: f.stops.length - 1,
            assignment_type: defaultAssignmentType as "own_fleet" | "forwarding",
            driver_id: f.driver_id || "", vehicle_id: f.vehicle_id || "", trailer_id: f.trailer_id || "",
            carrier_id: f.carrier_id || "", carrier_cost: f.carrier_cost || "", carrier_currency: f.carrier_currency || "EUR",
            swap_type: null, notes: "",
            route_info: null,
          }];
          
          console.log("[v0] handleSubmit: tripsToCreate:", JSON.stringify(tripsToCreate.map(t => ({
            trip_number: t.trip_number,
            assignment_type: t.assignment_type,
            from_stop_index: t.from_stop_index,
            to_stop_index: t.to_stop_index,
            carrier_id: t.carrier_id,
            driver_id: t.driver_id,
          }))));

          // Generate date part for trip references
          const tripDatePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
          const tripSeq = refNumber.split("-").pop() || "0001"; // Use the order sequence

          // Create ONE trip for the entire order with MULTIPLE legs
          // Determine overall trip assignment type (mixed if different leg types)
          const hasOwnFleetLeg = tripsToCreate.some(t => t.assignment_type === "own_fleet");
          const hasForwardingLeg = tripsToCreate.some(t => t.assignment_type === "forwarding");
          const overallAssignmentType = hasOwnFleetLeg && hasForwardingLeg ? "mixed" : 
            hasOwnFleetLeg ? "internal" : 
            hasForwardingLeg ? "forwarding" : "undecided";
          
          const firstLeg = tripsToCreate[0];
          const tripRef = `TRP-${tripDatePart}-${tripSeq}`;
          const tripDriverId = firstLeg.driver_id || primaryDriverId;
          const tripVehicleId = firstLeg.vehicle_id || primaryVehicleId;
          const tripTrailerId = firstLeg.trailer_id || primaryTrailerId;
          const firstStop = f.stops[0];
          const lastStop = f.stops[f.stops.length - 1];

          // Determine trip status
          const tripStatus = (tripDriverId || tripVehicleId) ? "dispatched" : "planned";
          
          console.log("[v0] handleSubmit: Creating single trip with", tripsToCreate.length, "legs");
          const { data: trip, error: tripErr } = await s.from("trips").insert({
            admin_id: adminSession.id,
            reference_number: tripRef,
            driver_id: firstLeg.assignment_type === "own_fleet" ? tripDriverId : null,
            vehicle_id: firstLeg.assignment_type === "own_fleet" ? tripVehicleId : null,
            trailer_id: tripTrailerId,
            status: tripStatus,
            planned_start: firstStop?.planned_date ? (() => {
              const time = firstStop.planned_time_from || "00:00:00";
              const normalizedTime = time.includes(":") && time.split(":").length === 2 ? `${time}:00` : time;
              return `${firstStop.planned_date}T${normalizedTime.slice(0, 8)}`;
            })() : new Date().toISOString(),
            from_stop_index: 0,
            to_stop_index: effectiveStopsGlobal.length - 1,
            assignment_type: overallAssignmentType === "mixed" ? "internal" : overallAssignmentType, // DB may not support "mixed"
            distance_km: executionRoute.distance_km || null,
            duration_minutes: executionRoute.duration_hours ? (executionRoute.duration_hours * 60) : null,
            route_geometry: executionRoute.geometry && executionRoute.geometry.length > 0 ? executionRoute.geometry : (f.route_geometry || null),
            route_confirmed_at: tripStatus === "dispatched" ? new Date().toISOString() : null,
            route_confirmed_by: tripStatus === "dispatched" ? adminSession.id : null,
          }).select("id");
          console.log("[v0] handleSubmit: Trip insert result:", trip, "error:", tripErr);
          if (tripErr) throw tripErr;
          if (!trip || trip.length === 0) throw new Error("Trip insert succeeded but no data returned");
          const tripId = trip[0].id;
          console.log("[v0] handleSubmit: Created trip with ID:", tripId);

          // Link order to the single trip
          await s.from("trip_orders").insert({
            trip_id: tripId,
            order_id: orderId,
            sequence: 1,
          });

          // Now create trip_legs for each segment
          for (let ti = 0; ti < tripsToCreate.length; ti++) {
            const seg = tripsToCreate[ti];
            console.log("[v0] handleSubmit: Creating leg", ti + 1, "assignment_type:", seg.assignment_type);
            const legDriverId = seg.driver_id || (ti === 0 ? primaryDriverId : null);
            const legVehicleId = seg.vehicle_id || (ti === 0 ? primaryVehicleId : null);
            const legTrailerId = seg.trailer_id || (ti === 0 ? primaryTrailerId : null);
            const isForwardingLeg = seg.assignment_type === "forwarding";

            // If this is a forwarding leg AND user selected "Create New" FWD order, create a forwarding subcontract order
            // Only create FWD order when explicitly requested (fwd_order_mode === "new")
            let forwardingOrderId: string | null = null;
            const shouldCreateFwdOrder = isForwardingLeg && seg.fwd_order_mode === "new";
            
            if (shouldCreateFwdOrder) {
              console.log("[v0] handleSubmit: Creating FWD order for leg", ti + 1, "fwd_order_mode:", seg.fwd_order_mode);
              
              // Generate forwarding order reference using the series API
              let fwdRef: string;
              try {
                const fwdSeriesRes = await fetch("/api/series/next-number", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    entity_type: "forwarding_order",
                    admin_id: adminSession?.id,
                  }),
                });
                const fwdSeriesData = await fwdSeriesRes.json();
                if (fwdSeriesData.error) throw new Error(fwdSeriesData.error);
                fwdRef = fwdSeriesData.number;
              } catch {
                // Fallback if series API fails
                fwdRef = `FWD-${tripDatePart}-${tripSeq}-${ti + 1}`;
              }
              
              // Get the stops for this forwarding segment
              const fwdStops = effectiveStopsGlobal.slice(seg.from_stop_index, seg.to_stop_index + 1);
              const firstFwdStop = fwdStops[0];
              const lastFwdStop = fwdStops[fwdStops.length - 1];
              
              // Determine status: fwd_assigned if carrier is set, fwd_unassigned otherwise
              const fwdStatus = seg.carrier_id ? "fwd_assigned" : "fwd_unassigned";
              
              // Create the forwarding order (subcontract) linked to parent order
              const { data: fwdOrder, error: fwdErr } = await s.from("orders").insert({
                admin_id: adminSession.id,
                created_by: adminSession.user_id ?? adminSession.id,
                reference_number: fwdRef,
                order_type: "forwarding",
                status: fwdStatus,
                is_draft: false,
                customer_id: f.customer_id || null,
                cargo_description: f.cargo_description || "",
                weight_kg: f.weight_kg ? parseFloat(f.weight_kg) : null,
                volume_m3: f.volume_m3 ? parseFloat(f.volume_m3) : null,
                loading_meters: f.loading_meters ? parseFloat(f.loading_meters) : null,
                goods_type: f.goods_type || null,
                carrier_id: seg.carrier_id || null,
                carrier_cost: seg.carrier_cost ? parseFloat(seg.carrier_cost) : null,
                carrier_currency: seg.carrier_currency || "EUR",
                // Copy customer pricing from parent order (matches TripLegAssignmentDialog behavior)
                customer_price: f.customer_price ? parseFloat(f.customer_price) : null,
                customer_currency: f.customer_currency || "EUR",
                customer_vat_rate: f.customer_vat_rate ? parseFloat(f.customer_vat_rate) : null,
                customer_vat_type: f.customer_vat_type || null,
                customer_reference: f.customer_reference || null,
                special_instructions: f.special_instructions || null,
                internal_notes: `Forwarding segment from ${firstFwdStop?.city || "pickup"} to ${lastFwdStop?.city || "delivery"}. Parent order: ${refNumber}`,
                // Fields for parent-child relationship
                parent_order_id: orderId, // Link to the parent customer order
                commercial_role: "carrier_subcontract", // This is a carrier subcontract
                execution_trip_id: tripId, // Direct link to the trip leg it belongs to
                // Initialize forwarding checklist
                forwarding_checklist: {
                  documents_pending: { checked: false, date: null, note: "" },
                  documents_received: { checked: false, date: null, note: "" },
                  client_invoiced: { checked: false, date: null, note: "" },
                  docs_sent_to_client: { checked: false, date: null, note: "" },
                  carrier_payment_due: { checked: false, date: null, note: "" },
                  carrier_paid: { checked: false, date: null, note: "" },
                  client_payment_received: { checked: false, date: null, note: "" },
                },
              }).select("id").single();
              
              if (fwdErr) {
                console.log("[v0] Forwarding order creation error:", fwdErr);
                throw fwdErr;
              }
              
              forwardingOrderId = fwdOrder?.id || null;
              console.log("[v0] Forwarding subcontract order created - id:", forwardingOrderId, "ref:", fwdRef, "status:", fwdStatus);
              
              // Create stops for the forwarding order (only leg's stops)
              if (forwardingOrderId && fwdStops.length > 0) {
                const fwdOrderStops = fwdStops.map((stop: any, idx: number) => ({
                  order_id: forwardingOrderId,
                  sequence_order: idx + 1,
                  // Preserve original pickup/delivery type. Constraint only allows "pickup" or "delivery".
                  // For first/last fall back to pickup/delivery if missing; for middle stops keep original
                  // (defaults to "delivery" so it doesn't violate the check constraint).
                  stop_type: stop.stop_type === "pickup" || stop.stop_type === "delivery"
                    ? stop.stop_type
                    : (idx === 0 ? "pickup" : "delivery"),
                  company_name: stop.company_name || "",
                  address: stop.address || "",
                  city: stop.city || "",
                  country: stop.country || "",
                  postal_code: stop.postal_code || "",
                  lat: stop.lat || null,
                  lng: stop.lng || null,
                  planned_date: stop.planned_date || null,
                  planned_time_from: stop.planned_time_from || null,
                  planned_time_to: stop.planned_time_to || null,
                  contact_name: stop.contact_name || "",
                  contact_phone: stop.contact_phone || "",
                  reference_number: stop.reference_number || "",
                  notes: stop.notes || "",
                  status: "pending",
                }));
                
                await s.from("order_stops").insert(fwdOrderStops);
              }
            }
            
            // Create trip_leg for forwarding legs (always, regardless of FWD order creation)
            if (isForwardingLeg) {
              console.log("[v0] handleSubmit: Creating forwarding trip_leg for trip:", tripId, "fwd_order_id:", forwardingOrderId);
              const { data: insertedLeg, error: fwdLegErr } = await s.from("trip_legs").insert({
                trip_id: tripId,
                leg_number: ti + 1,
                assignment_type: "forwarding",
                carrier_id: seg.carrier_id || null,
                forwarding_order_id: forwardingOrderId, // Will be null if no FWD order was created
                // Persist subcontractor resource details entered in the leg dialog
                subcontractor_vehicle_plate: seg.subcontractor_vehicle_plate || null,
                subcontractor_trailer_plate: seg.subcontractor_trailer_plate || null,
                subcontractor_driver_name: seg.subcontractor_driver_name || null,
                subcontractor_driver_phone: seg.subcontractor_driver_phone || null,
                from_stop_index: seg.from_stop_index,
                to_stop_index: seg.to_stop_index,
                // Derive status from the leg's actual resource shape rather
                // than hard-coding "planned" — a forwarding leg without a
                // carrier picked yet should read "Unassigned", not "Planned".
                status: deriveLegStatus({
                  assignment_type: "forwarding",
                  carrier_id: seg.carrier_id || null,
                }),
              }).select("id").single();
              console.log("[v0] handleSubmit: Forwarding trip_leg insert error:", fwdLegErr);
              if (fwdLegErr) throw fwdLegErr;
              
              // Also insert into forwarding_order_legs junction table if FWD order was created
              if (forwardingOrderId && insertedLeg?.id) {
                console.log("[v0] handleSubmit: Creating forwarding_order_legs junction for leg:", insertedLeg.id, "fwd_order:", forwardingOrderId);
                const { error: junctionErr } = await s.from("forwarding_order_legs").insert({
                  trip_leg_id: insertedLeg.id,
                  forwarding_order_id: forwardingOrderId,
                });
                if (junctionErr) {
                  console.log("[v0] handleSubmit: Junction insert error:", junctionErr);
                  // Don't throw - junction is for lookup optimization, not critical
                }
              }
            } else if (seg.assignment_type === "undecided" || !seg.assignment_type) {
              // Undecided - create trip_leg entry without resources
              console.log("[v0] handleSubmit: Creating undecided trip_leg for trip:", tripId);
              const { error: undecidedLegErr } = await s.from("trip_legs").insert({
                trip_id: tripId,
                leg_number: ti + 1,
                assignment_type: "undecided",
                from_stop_index: seg.from_stop_index,
                to_stop_index: seg.to_stop_index,
                // Undecided assignment → always "unassigned" so the chip
                // matches reality (no driver, no carrier picked yet).
                status: "unassigned",
              });
              if (undecidedLegErr) throw undecidedLegErr;
            } else {
              // Own fleet - create trip_leg entry
              console.log("[v0] handleSubmit: Creating own_fleet trip_leg for trip:", tripId);
              const { error: ownLegErr } = await s.from("trip_legs").insert({
                trip_id: tripId,
                leg_number: ti + 1,
                assignment_type: "own_fleet",
                driver_id: legDriverId || null,
                vehicle_id: legVehicleId || null,
                trailer_id: legTrailerId || null,
                from_stop_index: seg.from_stop_index,
                to_stop_index: seg.to_stop_index,
                // Derive from resource fullness: a leg with both driver and
                // vehicle assigned is "planned"; missing one of them is
                // "assigned"; nothing picked is "unassigned".
                status: deriveLegStatus({
                  assignment_type: "own_fleet",
                  driver_id: legDriverId || null,
                  vehicle_id: legVehicleId || null,
                  trailer_id: legTrailerId || null,
                }),
              });
              if (ownLegErr) throw ownLegErr;
            }

            // Link forwarding order to the trip if created
            if (forwardingOrderId) {
              await s.from("trip_orders").insert({
                trip_id: tripId,
                order_id: forwardingOrderId,
                sequence: ti + 1,
              });
            }
          } // End of leg loop

          // Create trip_stops for ALL stops (outside leg loop, one trip covers all stops)
          if (savedStops && savedStops.length > 0 && effectiveStopsGlobal.length > 0) {
            const tripStopsToInsert = [];
            const routeLegs = executionRoute.legs || [];

            for (let si = 0; si < effectiveStopsGlobal.length; si++) {
              const execStop = effectiveStopsGlobal[si];
              const matchedSaved = savedStops.find((os: any) =>
                (os.company_name === execStop.company_name && os.city === execStop.city) ||
                (os.lat === execStop.lat && os.lng === execStop.lng)
              );
              const isFirstStop = si === 0;
              const globalLegIdx = si - 1;
              const leg = !isFirstStop && globalLegIdx >= 0 ? routeLegs[globalLegIdx] : null;
              
              // Find which leg this stop belongs to
              const legIdx = tripsToCreate.findIndex(t => si >= t.from_stop_index && si <= t.to_stop_index);
              const legId = legIdx >= 0 ? `leg-${legIdx + 1}` : null; // We'll update with real leg_id if needed

              tripStopsToInsert.push({
                trip_id: tripId,
                order_stop_id: matchedSaved?.id || null,
                order_id: execStop.origin === "execution" ? null : orderId,
                sequence_order: si + 1,
                stop_type: execStop.stop_type || "pickup",
                company_name: execStop.company_name || null,
                address: execStop.address || null,
                city: execStop.city || null,
                country: execStop.country || null,
                lat: execStop.lat || null,
                lng: execStop.lng || null,
                planned_date: execStop.planned_date || null,
                planned_time_from: execStop.planned_time_from || null,
                planned_time_to: execStop.planned_time_to || null,
                notes: execStop.notes || null,
                status: "pending",
                auto_checkin: execStop.auto_checkin ?? false,
                auto_checkout: execStop.auto_checkout ?? false,
                geofence_radius: execStop.geofence_radius ?? 200,
                form_id: execStop.form_id || null,
                route_to_geometry: leg?.geometry || null,
                distance_to_km: leg ? Math.round(leg.distance_km * 10) / 10 : null,
                duration_to_minutes: leg ? Math.round(leg.duration_min) : null,
              });
            }

            if (tripStopsToInsert.length > 0) {
              await s.from("trip_stops").insert(tripStopsToInsert);
            }
          }
        }
      }

      // 5. Activity log
      await s.from("order_activity_log").insert({
        order_id: orderId,
        action: "order_created",
        details: {
          status, created_from: activeTab.createdFrom, reference_number: refNumber,
            allocation: {
            driver_id: primaryDriverId, vehicle_id: primaryVehicleId,
            trailer_id: primaryTrailerId, trips_count: hasMultipleTrips ? effectiveTrips.length : 1,
          },
        },
        performed_by_id: adminSession.id,
        performed_by_type: "admin",
      });

      // 6. Save source document to order_documents if we have a PDF
      console.log("[v0] handleSubmit: STEP order_documents check, hasPdf:", !!activeTab.pdfUrl);
      if (activeTab.pdfUrl) {
        // Check if document already exists for this order
        const { data: existingDocs, error: docCheckErr } = await s.from("order_documents")
          .select("id")
          .eq("order_id", orderId)
          .eq("document_type", "source_order")
          .limit(1);
        console.log("[v0] handleSubmit: STEP existing documents check, count:", existingDocs?.length || 0, "err:", docCheckErr);
        
        if (!existingDocs || existingDocs.length === 0) {
          // Extract filename from URL or use default
          const urlParts = activeTab.pdfUrl.split("/");
          const fileName = urlParts[urlParts.length - 1] || `order-${refNumber}.pdf`;
          
          const { error: docInsErr } = await s.from("order_documents").insert({
            order_id: orderId,
            document_type: "source_order",
            name: fileName,
            file_url: activeTab.pdfUrl,
            uploaded_by_type: "admin",
            uploaded_by_name: adminSession.name || "Admin",
            mime_type: activeTab.pdfUrl.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg",
          });
          console.log("[v0] handleSubmit: STEP order_documents insert result, err:", docInsErr);
        }
      }
      console.log("[v0] handleSubmit: STEP order_documents done");

      // Dispatch notification to driver(s) when trips are created
      console.log("[v0] handleSubmit: STEP notifications check, status:", status);
        if (status === "in_execution" || status === "confirmed_to_customer") {
        // Collect all unique driver IDs from trips
        const allDriverIds = new Set<string>();
        if (hasMultipleTrips) {
          effectiveTrips.forEach(seg => { if (seg.driver_id) allDriverIds.add(seg.driver_id); });
        } else if (primaryDriverId) {
          allDriverIds.add(primaryDriverId);
        }
        console.log("[v0] handleSubmit: STEP driver notification recipients:", allDriverIds.size);
        if (allDriverIds.size > 0) {
          const firstCity = effectiveStopsGlobal[0]?.city || "Origin";
          const lastCity = effectiveStopsGlobal[effectiveStopsGlobal.length - 1]?.city || "Destination";
          try {
            // Hard timeout so a hung notification API can't keep "Creating..." spinning forever
            const nac = new AbortController();
            const nHandle = setTimeout(() => nac.abort(), 5000);
            await fetch("/api/notifications/dispatch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event: "trip.dispatched",
                title: "New Trip Assigned",
                body: `${refNumber}: ${firstCity} → ${lastCity} (${effectiveStopsGlobal.length} stops)`,
                icon: "truck",
                actionUrl: "/driver-dashboard/orders",
                data: { type: "trip_dispatched", order_id: orderId, reference_number: refNumber },
                adminId: adminSession.id,
                module: "tms",
                entityType: "order",
                entityId: orderId,
                triggeredBy: adminSession.id,
                recipientDriverIds: Array.from(allDriverIds),
                priority: "high",
              }),
              signal: nac.signal,
            });
            clearTimeout(nHandle);
          } catch (notifErr) {
            console.log("[v0] handleSubmit: notification dispatch failed (non-fatal):", notifErr);
          }
        }
      }
      console.log("[v0] handleSubmit: STEP notifications done");

      console.log("[v0] handleSubmit: SUCCESS! Order created with refNumber:", refNumber, "status:", status);
      
      // Clear any pending autoSave timers to prevent new draft creation after success
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      
        toast({ title: `Order ${refNumber} ${status === "in_execution" ? "moved to execution" : "confirmed"} successfully` });

      // Drop the now-confirmed tab from local state WITHOUT calling closeTab() —
      // closeTab() would delete the order, its stops and all its trips from the DB.
      // The order has been successfully saved; we only need to remove the tab locally
      // and then send the user to the orders list (regardless of how many tabs are open).
      if (tabs.length > 1) {
        const newTabs = tabs.filter((_, i) => i !== activeTabIndex);
        setTabs(newTabs);
        if (activeTabIndex >= newTabs.length) setActiveTabIndex(Math.max(0, newTabs.length - 1));
      }
      // Navigate to the order detail page with the Execution tab open when
      // the user pressed "Create & Proceed to Execution", otherwise drop
      // back to the orders list.
      if (options.goToExecution && orderId) {
        router.push(`/admin/tms/orders/${orderId}?tab=execution`);
      } else {
        router.push("/admin/tms/orders");
      }
} catch (err: any) {
  console.error("[v0] handleSubmit error:", err);
  console.error("[v0] handleSubmit error message:", err?.message);
  console.error("[v0] handleSubmit error stack:", err?.stack);
  toast({ title: "Error creating order", description: err.message, variant: "destructive" });
  // Only reset submitting on error - on success we redirect and don't want autoSave to fire
  setSubmitting(false);
  }
  // Note: Do NOT setSubmitting(false) here on success - we're redirecting and want to prevent autoSave
  };

  // Partner was quick-created - add to list + select
  const handlePartnerCreated = (newPartner: Partner) => {
    setPartners(prev => [...prev, newPartner].sort((a, b) => a.name.localeCompare(b.name)));
    updateForm({ customer_id: newPartner.id });
    toast({ title: `Partner "${newPartner.name}" created and selected` });
  };

  const customers = partners;
  const carriers = partners.filter(p => p.types?.includes("carrier"));

  // Does this tab have a PDF to show?
  const hasPdf = activeTab.pdfUrl || aiState.fileObjectUrl;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Scrollable Order Form (used on right side) ───
  const renderOrderForm = () => (
    <div className="space-y-8 p-6 pb-24">
      {/* Signed & Confirmed Banner */}
      {activeTab.createdFrom === "email_signed" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
          <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
          <div className="min-w-0">
            <span className="text-sm text-green-400 font-medium">{tr("tms.newOrder.banner.clientConfirmed")}</span>
            <span className="text-xs text-muted-foreground ml-2">{tr("tms.newOrder.banner.signedDesc")}</span>
          </div>
        </div>
      )}

      {/* AI Confidence Banner */}
      {activeTab.aiConfidence !== null && activeTab.createdFrom === "ai_upload" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
          <Sparkles className="h-4 w-4 text-violet-500 shrink-0" />
          <span className="text-sm text-violet-500 font-medium">{tr("tms.newOrder.banner.aiExtracted")}</span>
          <span className="text-xs text-muted-foreground">{tr("tms.newOrder.banner.confidence")} {activeTab.aiConfidence}%</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {activeTab.aiTokensUsed?.toLocaleString()} {tr("tms.newOrder.ai.tokens")} / ${activeTab.aiCostUsd?.toFixed(4)}
          </span>
        </div>
      )}

      {/* ── SECTION 1: Customer ── */}
      <div className="space-y-4">
        <SectionHeader icon={Building2} title={tr("tms.newOrder.customer.section")} description={tr("tms.newOrder.customer.sectionDesc")} />

        <div className="space-y-2">
          <Label>{tr("tms.newOrder.customer.label")}</Label>
          <div className="flex gap-2">
            <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={customerPopoverOpen}
                  className="flex-1 justify-between h-9 font-normal bg-transparent"
                >
                  {activeTab.form.customer_id ? (
                    <span className="flex items-center gap-2 truncate">
                      {customers.find(c => c.id === activeTab.form.customer_id)?.name || tr("tms.newOrder.customer.selectCustomer")}
                      <span className="text-[10px] text-muted-foreground capitalize">
                        ({customers.find(c => c.id === activeTab.form.customer_id)?.types?.join(", ")})
                      </span>
                    </span>
                  ) : (
                    tr("tms.newOrder.customer.selectCustomer")
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[350px] p-0" align="start">
                <Command>
                  <CommandInput placeholder={tr("tms.newOrder.customer.searchPlaceholder")} />
                  <CommandList className="max-h-[250px]">
                    <CommandEmpty>{tr("tms.newOrder.customer.notFound")}</CommandEmpty>
                    <CommandGroup>
                      {customers.map(c => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={() => {
                            updateForm({ customer_id: c.id });
                            setCustomerPopoverOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${activeTab.form.customer_id === c.id ? "opacity-100" : "opacity-0"}`} />
                          <span className="truncate">{c.name}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground capitalize">({c.types?.join(", ")})</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button
              variant="outline" size="icon" className="shrink-0 bg-transparent"
              onClick={() => { setSuggestedPartnerName(activeTab.aiCustomerName || ""); setShowCreatePartner(true); }}
              title={tr("tms.newOrder.customer.createNewPartner")}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
          {/* Show unmatched AI customer name */}
          {activeTab.aiCustomerName && !activeTab.form.customer_id && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-xs text-amber-600">
                {tr("tms.newOrder.customer.aiDetected")} <strong>{activeTab.aiCustomerName}</strong> {tr("tms.newOrder.customer.notInPartners")}
              </span>
              <Button
                variant="outline" size="sm" className="h-6 text-[10px] ml-auto bg-transparent"
                onClick={() => { setSuggestedPartnerName(activeTab.aiCustomerName || ""); setShowCreatePartner(true); }}
              >
                <Plus className="h-3 w-3 mr-0.5" /> {tr("tms.newOrder.customer.create")}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>{tr("tms.newOrder.customer.reference")}</Label>
          <Input value={activeTab.form.customer_reference} onChange={e => updateForm({ customer_reference: e.target.value })} placeholder={tr("tms.newOrder.customer.referencePlaceholder")} />
        </div>

        <div className="space-y-2">
          <Label>{tr("tms.newOrder.customer.specialInstructions")}</Label>
          <Textarea value={activeTab.form.special_instructions} onChange={e => updateForm({ special_instructions: e.target.value })} placeholder={tr("tms.newOrder.customer.specialPlaceholder")} rows={2} />
        </div>
      </div>

      <Separator />

      {/* ── SECTION 2: Cargo ── */}
      <div className="space-y-4">
        <SectionHeader icon={Package} title={tr("tms.newOrder.cargo.section")} description={tr("tms.newOrder.cargo.sectionDesc")} />

        <div className="space-y-2">
          <Label>{tr("tms.newOrder.cargo.description")}</Label>
          <Textarea value={activeTab.form.cargo_description} onChange={e => updateForm({ cargo_description: e.target.value })} placeholder={tr("tms.newOrder.cargo.descriptionPlaceholder")} rows={2} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("tms.newOrder.cargo.goodsType")}</Label>
            <Input className="h-8 text-sm" value={activeTab.form.goods_type} onChange={e => updateForm({ goods_type: e.target.value })} placeholder={tr("tms.newOrder.cargo.goodsTypePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("tms.newOrder.cargo.adrClass")}</Label>
            <Input className="h-8 text-sm" value={activeTab.form.adr_class} onChange={e => updateForm({ adr_class: e.target.value })} placeholder={tr("tms.newOrder.cargo.adrPlaceholder")} />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("tms.newOrder.cargo.weightKg")}</Label>
            <Input className="h-8 text-sm" type="number" value={activeTab.form.weight_kg} onChange={e => updateForm({ weight_kg: e.target.value })} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("tms.newOrder.cargo.volumeM3")}</Label>
            <Input className="h-8 text-sm" type="number" value={activeTab.form.volume_m3} onChange={e => updateForm({ volume_m3: e.target.value })} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("tms.newOrder.cargo.pallets")}</Label>
            <Input className="h-8 text-sm" type="number" value={activeTab.form.pallet_count} onChange={e => updateForm({ pallet_count: e.target.value })} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("tms.newOrder.cargo.loadingMeters")}</Label>
            <Input className="h-8 text-sm" type="number" value={activeTab.form.loading_meters} onChange={e => updateForm({ loading_meters: e.target.value })} placeholder="0" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("tms.newOrder.cargo.tempMin")}</Label>
            <Input className="h-8 text-sm" type="number" value={activeTab.form.temperature_min} onChange={e => updateForm({ temperature_min: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("tms.newOrder.cargo.tempMax")}</Label>
            <Input className="h-8 text-sm" type="number" value={activeTab.form.temperature_max} onChange={e => updateForm({ temperature_max: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch checked={activeTab.form.stackable} onCheckedChange={v => updateForm({ stackable: v })} />
          <Label className="text-sm">{tr("tms.newOrder.cargo.stackable")}</Label>
        </div>
      </div>

      <Separator />

      {/* ── SECTION 3: Stops ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeader icon={MapPin} title={tr("tms.newOrder.stops.section")} description={tr("tms.newOrder.stops.sectionDesc")} />
          <Button size="sm" variant="outline" className="bg-transparent" onClick={() => updateForm({ stops: [...activeTab.form.stops, emptyStop(activeTab.form.stops.length === 0 ? "pickup" : "delivery")] })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> {tr("tms.newOrder.stops.addStop")}
          </Button>
        </div>

        {(() => {
          // Build order-origin stops sorted by datetime, with real index mapping
          const orderStops = activeTab.form.stops
            .map((s, realIdx) => ({ stop: s, realIdx }))
            .filter(({ stop }) => stop.origin !== "execution")
            .sort((a, b) => {
              const dtA = `${a.stop.planned_date || "9999-12-31"}T${a.stop.planned_time_from || "99:99"}`;
              const dtB = `${b.stop.planned_date || "9999-12-31"}T${b.stop.planned_time_from || "99:99"}`;
              return dtA.localeCompare(dtB);
            });
          return orderStops.map(({ stop, realIdx }, displayIdx) => (
          <Card key={stop.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={stop.stop_type === "pickup" ? "default" : stop.stop_type === "delivery" ? "secondary" : "outline"} className="text-[10px]">
                  {stop.stop_type}
                </Badge>
                {stop.country && getCountryFlagUrl(stop.country) && (
                  <img src={getCountryFlagUrl(stop.country)} alt={stop.country} className="w-4 h-3 rounded-[2px] object-cover shrink-0" crossOrigin="anonymous" />
                )}
                <span className="text-xs text-muted-foreground">{tr("tms.newOrder.stops.stopWord")} {displayIdx + 1}{stop.city ? ` \u2013 ${stop.city}` : ""}</span>
              </div>
              <div className="flex items-center gap-2">
                <Select value={stop.stop_type} onValueChange={v => updateStop(realIdx, { stop_type: v as any })}>
                  <SelectTrigger className="w-auto h-6 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pickup">{tr("tms.newOrder.stops.typePickup")}</SelectItem>
                    <SelectItem value="delivery">{tr("tms.newOrder.stops.typeDelivery")}</SelectItem>
                    <SelectItem value="transit">{tr("tms.newOrder.stops.typeTransit")}</SelectItem>
                    <SelectItem value="customs">{tr("tms.newOrder.stops.typeCustoms")}</SelectItem>
                    <SelectItem value="swap">{tr("tms.newOrder.stops.typeSwap")}</SelectItem>
                  </SelectContent>
                </Select>
                {(step === "execution" ? executionStops : activeTab.form.stops).filter(s => s.origin !== "execution").length > 1 && (
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={() => removeStop(realIdx)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("tms.newOrder.stops.companyName")}</Label>
                <Input className="h-8 text-sm" value={stop.company_name} onChange={e => updateStop(realIdx, { company_name: e.target.value })} placeholder={tr("tms.newOrder.stops.companyNamePlaceholder")} />
              </div>
              <div className="space-y-1.5 relative">
                <Label className="text-xs">{tr("tms.newOrder.stops.address")}</Label>
                <div className="relative">
                  <Input className="h-8 text-sm" value={stop.address} onChange={e => { updateStop(realIdx, { address: e.target.value }); setSearchingStop(realIdx); searchAddress(e.target.value); }} placeholder={tr("tms.newOrder.stops.searchAddress")} />
                  {searchingStop === realIdx && searchResults.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-popover border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {searchResults.map((r, ri) => (
                        <button key={ri} type="button" className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors"
                          onClick={() => {
                            const parts = r.display_name.split(",").map(s => s.trim());
                            updateStop(realIdx, {
                              address: r.display_name,
                              lat: parseFloat(r.lat),
                              lng: parseFloat(r.lon),
                              city: parts.length > 2 ? parts[parts.length - 3] : "",
                              country: parts[parts.length - 1] || "",
                            });
                            setSearchResults([]);
                            setSearchingStop(null);
                          }}
                        >
                          <MapPin className="h-3 w-3 inline mr-1 text-muted-foreground" />{r.display_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("tms.newOrder.stops.city")}</Label>
                <Input className="h-8 text-sm" value={stop.city} onChange={e => updateStop(realIdx, { city: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("tms.newOrder.stops.country")}</Label>
                <Input className="h-8 text-sm" value={stop.country} onChange={e => updateStop(realIdx, { country: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("tms.newOrder.stops.postalCode")}</Label>
                <Input className="h-8 text-sm" value={stop.postal_code} onChange={e => updateStop(realIdx, { postal_code: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("tms.newOrder.stops.plannedDate")}</Label>
                <Input className="h-8 text-sm" type="date" value={stop.planned_date} onChange={e => updateStop(realIdx, { planned_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("tms.newOrder.stops.timeFrom")}</Label>
                <Input className="h-8 text-sm" type="time" value={stop.planned_time_from} onChange={e => updateStop(realIdx, { planned_time_from: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("tms.newOrder.stops.timeTo")}</Label>
                <Input className="h-8 text-sm" type="time" value={stop.planned_time_to} onChange={e => updateStop(realIdx, { planned_time_to: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("tms.newOrder.stops.contactName")}</Label>
                <Input className="h-8 text-sm" value={stop.contact_name} onChange={e => updateStop(realIdx, { contact_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("tms.newOrder.stops.contactPhone")}</Label>
                <Input className="h-8 text-sm" value={stop.contact_phone} onChange={e => updateStop(realIdx, { contact_phone: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{tr("tms.newOrder.stops.reference")}</Label>
              <Textarea className="min-h-[60px] text-sm resize-none" value={stop.reference_number} onChange={e => updateStop(realIdx, { reference_number: e.target.value })} placeholder={tr("tms.newOrder.stops.refPlaceholder")} rows={2} />
            </div>
          </Card>
          ));
        })()}

        {/* Route Map -- order stops in user-defined sequence */}
        <RouteMap
          stops={activeTab.form.stops.filter(s => s.origin !== "execution")}
          waypoints={activeTab.form.route_waypoints}
          onWaypointsChange={(wp) => updateForm({ route_waypoints: wp })}
          fleetMapData={detailsExistingStops.length > 0 ? { trips: [], conflicts: [], capacityInfo: null, existingStops: detailsExistingStops, existingTripData: null, routeOptions: {} as any, routeInfo: null, geofences: [], vehicles: [], trailers: [], drivers: [] } : undefined}
          onRouteCalculated={(info) => {
            updateForm({
              estimated_distance_km: String(info.distance_km),
              estimated_duration_hours: String(info.duration_hours + info.duration_minutes / 60),
              route_geometry: info.geometry || null,
            });
          }}
          onStopsGeocoded={(geocodedStops) => {
            // Merge geocoded order stops back, keeping execution stops untouched
            const execStops = activeTab.form.stops.filter(s => s.origin === "execution");
            const orderStopsMap = new Map(geocodedStops.map(s => [s.id, s]));
            const mergedStops = activeTab.form.stops.map(s => {
              if (s.origin === "execution") return s;
              return orderStopsMap.get(s.id) || s;
            });
            updateForm({ stops: mergedStops });
          }}
        />
      </div>

      <Separator />

      {/* ── SECTION 4: Pricing ─��� */}
      <div className="space-y-4">
        <SectionHeader icon={DollarSign} title={tr("tms.newOrder.pricing.section")} description={tr("tms.newOrder.pricing.sectionDesc")} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("tms.newOrder.pricing.price")}</Label>
            <Input className="h-8 text-sm" type="number" value={activeTab.form.customer_price} onChange={e => updateForm({ customer_price: e.target.value })} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("tms.newOrder.pricing.currency")}</Label>
            <Select value={activeTab.form.customer_currency} onValueChange={v => updateForm({ customer_currency: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["EUR", "RON", "USD", "GBP", "CHF", "HUF", "CZK", "PLN"].map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("tms.newOrder.pricing.vatType")}</Label>
            <Select value={activeTab.form.customer_vat_type} onValueChange={v => updateForm({ customer_vat_type: v as OrderFormData["customer_vat_type"] })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="excluding">{tr("tms.newOrder.pricing.vatWithout")}</SelectItem>
                <SelectItem value="including">{tr("tms.newOrder.pricing.vatIncluded")}</SelectItem>
                <SelectItem value="exempt">{tr("tms.newOrder.pricing.vatExempt")}</SelectItem>
                <SelectItem value="reverse_charge">{tr("tms.newOrder.pricing.reverseCharge")}</SelectItem>
                <SelectItem value="non_taxable">{tr("tms.newOrder.pricing.nonTaxable")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tr("tms.newOrder.pricing.vatRate")}</Label>
            <Select 
              value={activeTab.form.customer_vat_rate} 
              onValueChange={v => updateForm({ customer_vat_rate: v })}
              disabled={["exempt", "reverse_charge", "non_taxable"].includes(activeTab.form.customer_vat_type)}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
<SelectItem value="21">{tr("tms.newOrder.pricing.rateStandard")}</SelectItem>
  <SelectItem value="9">{tr("tms.newOrder.pricing.rateReduced9")}</SelectItem>
  <SelectItem value="5">{tr("tms.newOrder.pricing.rateReduced5")}</SelectItem>
  <SelectItem value="0">{tr("tms.newOrder.pricing.rate0")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* VAT Calculation Summary */}
        {activeTab.form.customer_price && (
          <div className="rounded-lg bg-muted/30 border border-border/50 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {activeTab.form.customer_vat_type === "including" ? tr("tms.newOrder.pricing.priceVatIncluded") : tr("tms.newOrder.pricing.netPrice")}
              </span>
              <span className="font-medium">
                {parseFloat(activeTab.form.customer_price).toLocaleString("ro-RO", { minimumFractionDigits: 2 })} {activeTab.form.customer_currency}
              </span>
            </div>
            {!["exempt", "reverse_charge", "non_taxable"].includes(activeTab.form.customer_vat_type) && (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{tr("tms.newOrder.pricing.vat")} ({activeTab.form.customer_vat_rate}%)</span>
                  <span className="font-medium">
                    {(() => {
                      const price = parseFloat(activeTab.form.customer_price) || 0;
                      const rate = parseFloat(activeTab.form.customer_vat_rate) || 19;
                      const vat = activeTab.form.customer_vat_type === "including" 
                        ? price - (price / (1 + rate / 100))
                        : price * (rate / 100);
                      return vat.toLocaleString("ro-RO", { minimumFractionDigits: 2 });
                    })()} {activeTab.form.customer_currency}
                  </span>
                </div>
                <Separator className="my-1" />
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>{activeTab.form.customer_vat_type === "including" ? tr("tms.newOrder.pricing.netPrice") : tr("tms.newOrder.pricing.totalWithVat")}</span>
                  <span className="text-primary">
                    {(() => {
                      const price = parseFloat(activeTab.form.customer_price) || 0;
                      const rate = parseFloat(activeTab.form.customer_vat_rate) || 19;
                      const total = activeTab.form.customer_vat_type === "including" 
                        ? price / (1 + rate / 100)
                        : price * (1 + rate / 100);
                      return total.toLocaleString("ro-RO", { minimumFractionDigits: 2 });
                    })()} {activeTab.form.customer_currency}
                  </span>
                </div>
              </>
            )}
            {["exempt", "reverse_charge"].includes(activeTab.form.customer_vat_type) && (
              <div className="text-[10px] text-amber-500 flex items-center gap-1 mt-1">
                <span className="font-medium">
                  {activeTab.form.customer_vat_type === "exempt" 
                    ? tr("tms.newOrder.pricing.exemptNote") 
                    : tr("tms.newOrder.pricing.reverseNote")}
                </span>
              </div>
            )}
            {activeTab.form.customer_vat_type === "non_taxable" && (
              <div className="text-[10px] text-blue-500 flex items-center gap-1 mt-1">
                <span className="font-medium">{tr("tms.newOrder.pricing.nonTaxableNote")}</span>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">{tr("tms.newOrder.pricing.paymentTerms")}</Label>
          <Input className="h-8 text-sm w-32" type="number" value={activeTab.form.payment_terms_customer_days} onChange={e => updateForm({ payment_terms_customer_days: e.target.value })} />
        </div>
      </div>

      <Separator />

      {/* ── SECTION 5: Execution Type ──
          TEMPORARILY HIDDEN. The user picks Internal vs Forwarding from
          the sticky bar on the Execution step instead. We keep the
          two-option toggle code commented just below so we can bring it
          back without rebuilding from scratch. */}
      {false && (
        <div className="space-y-4">
          <SectionHeader icon={Truck} title="Execution Type" description="How will this order be fulfilled?" />
          <div className="grid grid-cols-2 gap-3">
            {(["internal", "forwarding"] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => { updateForm({ order_type: type }); setStep("execution"); }}
                className={`p-4 rounded-xl border-2 text-left transition-all group ${
                  activeTab.form.order_type === type
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {type === "internal" ? <Truck className="h-5 w-5 text-primary" /> : <Building2 className="h-5 w-5 text-amber-500" />}
                  <span className="text-sm font-semibold capitalize">{type}</span>
                  <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {type === "internal" ? "Execute with your own fleet" : "Assign to external carrier"}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION 6: Internal Notes ── */}
      <div className="space-y-4">
        <SectionHeader icon={FileText} title={tr("tms.newOrder.notes.section")} description={tr("tms.newOrder.notes.sectionDesc")} />
        <Textarea value={activeTab.form.internal_notes} onChange={e => updateForm({ internal_notes: e.target.value })} placeholder={tr("tms.newOrder.notes.placeholder")} rows={2} />
      </div>
    </div>
  );

  // ── Order Summary Data (for Step 2 header) ──
  const summaryCustomer = customers.find(c => c.id === activeTab.form.customer_id);
  const summaryStopsSource = step === "execution" ? executionStops : activeTab.form.stops;
  const summaryFirstStop = summaryStopsSource[0];
  const summaryLastStop = summaryStopsSource[summaryStopsSource.length - 1];
  const summaryRoute = summaryFirstStop?.city && summaryLastStop?.city
    ? `${summaryFirstStop.city} \u2192 ${summaryLastStop.city}`
    : tr("tms.newOrder.summary.noRoute");
  const summaryPallets = activeTab.form.pallet_count || "0";
  const summaryWeight = activeTab.form.weight_kg || "0";
  const summaryPrice = activeTab.form.customer_price
    ? `${parseFloat(activeTab.form.customer_price).toLocaleString()} ${activeTab.form.customer_currency}`
    : "";

  // ── Execution Step Content ──
  const renderExecutionStep = () => (
    <div className="space-y-2">
      {/* Fleet / Carrier Assignment */}
      <FleetAssignment
        adminId={adminSession?.id || ""}
        orderType={activeTab.form.order_type}
        stops={executionStops.map((s, i) => ({ index: i, city: s.city, address: s.address, stop_type: s.stop_type, lat: s.lat, lng: s.lng, origin: s.origin }))}
        palletCount={Number(activeTab.form.pallet_count) || 0}
        weightKg={Number(activeTab.form.weight_kg) || 0}
        plannedDateFrom={executionStops[0]?.planned_date || ""}
        plannedDateTo={executionStops[executionStops.length - 1]?.planned_date || ""}
        trips={activeTab.form.trips || []}
        onTripsChange={(newTrips) => updateForm({ trips: newTrips })}
        driverId={activeTab.form.driver_id}
        vehicleId={activeTab.form.vehicle_id}
        trailerId={activeTab.form.trailer_id}
        onSimpleChange={(field, value) => updateForm({ [field]: value })}
        partners={partners}
        onMapDataChange={setFleetMapData}
        onPartnerCreated={(partner) => setPartners(prev => [...prev, partner])}
        onRequestSwapStop={() => {
          // Add an execution stop (swap point) in the middle and auto-create/split legs
          // Use ref to get latest stops (avoids stale closure issue)
          const currentStops = [...executionStopsRef.current];
          const newStop = emptyStop("swap", "execution");
          const insertIndex = currentStops.length - 1;
          
          // Create new stops array with the swap point inserted before last stop
          const newStops = [
            ...currentStops.slice(0, insertIndex),
            newStop,
            ...currentStops.slice(insertIndex)
          ];
          
          // Update stops state
          setExecutionStops(newStops);
          
          // Update trips to create/split legs for the swap point
          const currentTrips = activeTab.form.trips || [];
          
          if (currentTrips.length === 0) {
            // No trips exist - create both legs
            const trip1: TripSegment = {
              id: crypto.randomUUID(), trip_number: 1,
              assignment_type: "own_fleet",
              driver_id: activeTab.form.driver_id || "", 
              vehicle_id: activeTab.form.vehicle_id || "",
              trailer_id: activeTab.form.trailer_id || "",
              carrier_id: "", carrier_cost: "", carrier_currency: "EUR",
              carrier_vat_type: "excluding", carrier_vat_rate: "21",
              from_stop_index: 0, to_stop_index: insertIndex,
              swap_type: null, notes: "", route_info: null,
            };
            const trip2: TripSegment = {
              id: crypto.randomUUID(), trip_number: 2,
              assignment_type: "undecided",
              driver_id: "", vehicle_id: "",
              trailer_id: activeTab.form.trailer_id || "",
              carrier_id: "", carrier_cost: "", carrier_currency: "EUR",
              carrier_vat_type: "excluding", carrier_vat_rate: "21",
              from_stop_index: insertIndex, to_stop_index: newStops.length - 1,
              swap_type: "truck_swap", notes: "", route_info: null,
            };
            updateForm({ trips: [trip1, trip2] });
          } else if (currentTrips.length === 1) {
            // One trip exists - split it into two at the swap point
            const existingTrip = currentTrips[0];
            const trip1: TripSegment = {
              ...existingTrip,
              to_stop_index: insertIndex, // End at swap point
            };
            const trip2: TripSegment = {
              id: crypto.randomUUID(), trip_number: 2,
              assignment_type: "undecided",
              driver_id: "", vehicle_id: "",
              trailer_id: existingTrip.trailer_id || "",
              carrier_id: "", carrier_cost: "", carrier_currency: "EUR",
              carrier_vat_type: "excluding", carrier_vat_rate: "21",
              from_stop_index: insertIndex, to_stop_index: newStops.length - 1,
              swap_type: "truck_swap", notes: "", route_info: null,
            };
            updateForm({ trips: [trip1, trip2] });
          } else {
            // Multiple trips exist - split the last one
            const lastTrip = currentTrips[currentTrips.length - 1];
            const updatedLastTrip: TripSegment = {
              ...lastTrip,
              to_stop_index: insertIndex,
            };
            const newTrip: TripSegment = {
              id: crypto.randomUUID(), trip_number: currentTrips.length + 1,
              assignment_type: "undecided",
              driver_id: "", vehicle_id: "",
              trailer_id: lastTrip.trailer_id || "",
              carrier_id: "", carrier_cost: "", carrier_currency: "EUR",
              carrier_vat_type: "excluding", carrier_vat_rate: "21",
              from_stop_index: insertIndex, to_stop_index: newStops.length - 1,
              swap_type: "truck_swap", notes: "", route_info: null,
            };
            updateForm({ trips: [...currentTrips.slice(0, -1), updatedLastTrip, newTrip] });
          }
          
          setSelectedStopIndex(insertIndex);
          setShowStopDetails(true);
        }}
      />

      {/* Margin for forwarding */}
      {activeTab.form.order_type === "forwarding" && activeTab.form.customer_price && activeTab.form.carrier_cost && (
        <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/40 text-[10px]">
          <span className="text-muted-foreground">{tr("tms.newOrder.summary.margin")}</span>
          <span className={`font-bold ${
            parseFloat(activeTab.form.customer_price) - parseFloat(activeTab.form.carrier_cost) > 0
              ? "text-emerald-400" : "text-destructive"
          }`}>
            {(parseFloat(activeTab.form.customer_price) - parseFloat(activeTab.form.carrier_cost)).toFixed(2)} {activeTab.form.customer_currency}
            ({((parseFloat(activeTab.form.customer_price) - parseFloat(activeTab.form.carrier_cost)) / parseFloat(activeTab.form.customer_price) * 100).toFixed(0)}%)
          </span>
        </div>
      )}
    </div>
  );

  // ─── Render ───
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Animations CSS */}
      <style jsx global>{`
        @keyframes scanDown {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(calc(100vh)); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* ─── Top-level flex container ─── */}
      <div className="h-full w-full flex flex-col overflow-hidden">

      {/* ─── Tab Bar ─── */}
      <div className={step === "execution"
        ? "absolute top-3 left-3 right-3 z-[600] flex items-center gap-2"
        : "flex items-center gap-2 px-4 pt-3 pb-2 border-b shrink-0"
      }>
        <Button
          variant="outline" size="icon"
          className={`h-8 w-8 shrink-0 ${step === "execution" ? "bg-background/90 backdrop-blur-md shadow-lg border-border/50" : "bg-transparent"}`}
          onClick={() => step === "execution" ? setStep("details") : router.push("/admin/tms/orders")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className={`flex items-center rounded-lg min-w-0 ${step === "execution" ? "bg-background/90 backdrop-blur-md shadow-lg border border-border/50" : "bg-muted/50"}`}>
          <div className="flex items-center overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {tabs.map((tab, i) => (
              <button
                key={tab.id}
                className={`group flex items-center gap-1.5 px-3 py-2 text-xs transition-all whitespace-nowrap relative ${
                  i === activeTabIndex
                    ? "text-primary font-semibold bg-primary/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                onClick={() => { setActiveTabIndex(i); setStep("details"); setAiState(prev => ({ ...prev, stage: "idle" })); }}
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="max-w-[120px] truncate">
                  {tab.referenceNumber || `Draft ${i + 1}`}
                </span>
                {tab.createdFrom === "ai_upload" && <Sparkles className="h-2.5 w-2.5 text-violet-400 shrink-0" />}
                {tab.saveStatus === "saving" && <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />}
                {tab.saveStatus === "saved" && <Cloud className="h-2.5 w-2.5 text-emerald-500 shrink-0" />}
                {tab.saveStatus === "idle" && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                {tab.saveStatus === "error" && <CloudOff className="h-2.5 w-2.5 text-destructive shrink-0" />}
                {tabs.length > 1 && (
                  <span className="opacity-0 group-hover:opacity-100 ml-0.5" onClick={(e) => { e.stopPropagation(); closeTab(i); }}>
                    <X className="h-2.5 w-2.5 hover:text-destructive" />
                  </span>
                )}
                {i === activeTabIndex && <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-primary rounded-t" />}
              </button>
            ))}
          </div>
          <button onClick={addNewTab} className="px-2.5 py-2 text-muted-foreground hover:text-foreground border-l shrink-0">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {step === "details" && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {activeTab.aiTokensUsed && (
              <Badge variant="outline" className="text-[10px] gap-1 h-6">
                <Sparkles className="h-2.5 w-2.5 text-violet-400" />
                {activeTab.aiTokensUsed.toLocaleString()} {tr("tms.newOrder.ai.tokens")}
              </Badge>
            )}
            {activeTab.lastSavedAt && (
              <span className="text-[10px] text-muted-foreground px-2 py-1 rounded-md bg-muted/50">
                {tr("tms.newOrder.ai.savedPrefix")} {activeTab.lastSavedAt}
              </span>
            )}
            <Button
              size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => handleSubmit("confirmed", { goToExecution: true })} disabled={submitting}
            >
              <ArrowRight className="h-3 w-3" />
              {submitting ? tr("tms.newOrder.submit.creating") : tr("tms.newOrder.submit.createProceed")}
            </Button>
          </div>
        )}

        {/* Execution mode: forwarding toggle + create order (always visible, right side) */}
        {step === "execution" && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-background/90 backdrop-blur-md rounded-lg border border-border/50 shadow-lg overflow-hidden">
              {(["internal", "forwarding"] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateForm({ order_type: type })}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium transition-all ${
                    activeTab.form.order_type === type
                      ? type === "internal"
                        ? "bg-primary/15 text-primary"
                        : "bg-amber-500/15 text-amber-500"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {type === "internal" ? <Truck className="h-2.5 w-2.5" /> : <Building2 className="h-2.5 w-2.5" />}
                  {type === "internal" ? tr("tms.newOrder.execution.ownFleet") : tr("tms.newOrder.execution.forwarding")}
                </button>
              ))}
            </div>

            {/* Series selector */}
            {availableSeries.length > 0 && (
              <Select value={selectedSeriesId} onValueChange={setSelectedSeriesId}>
                <SelectTrigger className="h-8 w-[120px] text-xs bg-background/90 border-border/50">
                  <SelectValue placeholder={tr("tms.newOrder.execution.seriesPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {availableSeries.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-1.5">
                        {s.prefix}
                        {s.is_default && <span className="text-[9px] text-muted-foreground">({tr("tms.newOrder.execution.default")})</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 shadow-lg"
              onClick={() => handleSubmit("confirmed")} disabled={submitting}
            >
              <Send className="h-3 w-3" />
              {submitting ? tr("tms.newOrder.submit.creating") : tr("tms.newOrder.submit.createOrder")}
            </Button>
          </div>
        )}
      </div>

      {/* ─── Main Content ─── */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {step === "details" ? (
          <>
            {/* ── STEP 1: LEFT SIDE - Order Details Form ── */}
            <div className={`${hasPdf ? "w-full md:w-1/2" : "w-full"} flex flex-col overflow-hidden ${hasPdf ? "h-1/2 md:h-full" : ""}`}>
              {!hasPdf ? (
                <div className="px-4 pt-4 pb-3">
                  {/* AI Instruction Selector */}
                  {aiInstructions.length > 0 && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{tr("tms.newOrder.ai.profile")}</label>
                      <Select value={selectedInstructionId} onValueChange={setSelectedInstructionId}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder={tr("tms.newOrder.ai.selectProfile")} />
                        </SelectTrigger>
                        <SelectContent>
                          {aiInstructions.map((inst) => (
                            <SelectItem key={inst.id} value={inst.id}>
                              <div className="flex items-center gap-2">
                                <span>{inst.name}</span>
                                {inst.is_default && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{tr("tms.newOrder.ai.default")}</span>}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedInstructionId && aiInstructions.find(i => i.id === selectedInstructionId)?.description && (
                        <p className="text-[11px] text-muted-foreground mt-1">{aiInstructions.find(i => i.id === selectedInstructionId)?.description}</p>
                      )}
                    </div>
                  )}
                  {/* File input - made more accessible for mobile with larger touch target */}
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    accept=".pdf,.png,.jpg,.jpeg,.tiff,.webp,image/*,application/pdf" 
                    capture="environment"
                    className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAiExtract(file); e.target.value = ""; }} 
                  />
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative w-full rounded-xl border-2 border-dashed border-primary/30 hover:border-primary/60 active:border-primary bg-gradient-to-r from-primary/5 via-cyan-500/5 to-violet-500/5 hover:from-primary/10 hover:via-cyan-500/10 hover:to-violet-500/10 transition-all duration-500 overflow-hidden p-4 md:p-4 min-h-[80px] md:min-h-0"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundSize: "200% 100%", animation: "shimmer 2s linear infinite" }} />
                    <div className="relative flex flex-col md:flex-row items-center justify-center gap-3">
                      <div className="w-12 h-12 md:w-10 md:h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Sparkles className="h-6 w-6 md:h-5 md:w-5 text-primary" />
                      </div>
                      <div className="text-center md:text-left">
                        <p className="text-sm md:text-sm font-semibold text-foreground">{tr("tms.newOrder.ai.uploadOrder")}</p>
                        <p className="text-xs text-muted-foreground">{tr("tms.newOrder.ai.uploadHint")}</p>
                      </div>
                      <div className="md:ml-auto flex items-center gap-1 text-xs text-primary font-medium md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Zap className="h-3.5 w-3.5" /> {tr("tms.newOrder.common.upload")}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">{tr("tms.newOrder.ai.orFillManually")}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                </div>
              ) : (
                <div className="px-4 py-2 border-b bg-card shrink-0 flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.tiff,.webp" className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAiExtract(file); e.target.value = ""; }} />
                  <span className="text-xs font-medium">{tr("tms.newOrder.ai.orderDetails")}</span>
                  <span className="text-xs text-muted-foreground">{tr("tms.newOrder.ai.reviewExtracted")}</span>
                  <Button variant="outline" size="sm" className="ml-auto h-7 text-xs bg-transparent" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-3 w-3 mr-1" /> {tr("tms.newOrder.ai.reUpload")}
                  </Button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                <div className={hasPdf ? "p-4 space-y-6" : "max-w-3xl mx-auto p-4 space-y-6"}>
                  {renderOrderForm()}
                </div>
              </div>

              <div className="border-t bg-card px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {activeTab.saveStatus === "saved" && <><Cloud className="h-3 w-3 text-emerald-500" /> {tr("tms.newOrder.ai.draftSaved")}</>}
                  {activeTab.saveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> {tr("tms.newOrder.ai.saving")}</>}
                  {activeTab.saveStatus === "error" && <><CloudOff className="h-3 w-3 text-destructive" /> {tr("tms.newOrder.ai.saveError")}</>}
                </div>
  {/*
    Bottom "Proceed to Execution" button — temporarily hidden per
    operator request. The header already has a "Create & Proceed to
    Execution" CTA (line ~3148) which covers the same flow plus the
    create step, so this bottom button is a duplicate the operator
    doesn't currently want surfaced. Kept commented (not deleted) so
    we can re-enable it without rebuilding the handler if the policy
    changes back.
  */}
  {false && (
    <Button onClick={() => {
      setExecutionStops(JSON.parse(JSON.stringify(activeTab.form.stops)));
      setExistingTripId(null);
      setExecutionRoute({
        geometry: activeTab.form.route_geometry ? [...activeTab.form.route_geometry] : null,
        distance_km: Number(activeTab.form.estimated_distance_km) || 0,
        duration_hours: Number(activeTab.form.estimated_duration_hours) || 0,
        legs: [],
      });
      setExecutionWaypoints(activeTab.form.route_waypoints ? [...activeTab.form.route_waypoints] : []);
      setStep("execution");
    }} className="gap-2">
    <ArrowRight className="h-4 w-4" />
    {tr("tms.newOrder.submit.proceedExecution")}
    </Button>
  )}
              </div>
            </div>

            {/* ── STEP 1: RIGHT SIDE - PDF Preview (hidden on mobile when form is focused) ── */}
            {hasPdf ? (
              <div className="w-full md:w-1/2 h-1/2 md:h-full border-t md:border-t-0 md:border-l flex flex-col relative bg-muted/10">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-card shrink-0">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium truncate">{aiState.fileName || tr("tms.newOrder.ai.document")}</span>
                  {aiState.stage !== "idle" && aiState.stage !== "done" && aiState.stage !== "error" && (
                    <Badge variant="outline" className="ml-auto text-[10px] gap-1 animate-pulse">
                      <Brain className="h-2.5 w-2.5" /> {tr("tms.newOrder.ai.processing")}
                    </Badge>
                  )}
                  {aiState.stage === "done" && (
                    <Badge variant="outline" className="ml-auto text-[10px] gap-1 text-emerald-500 border-emerald-500/30">
                      <Check className="h-2.5 w-2.5" /> {tr("tms.newOrder.ai.extracted")}
                    </Badge>
                  )}
                </div>
                <div className="flex-1 relative overflow-y-auto bg-muted/30">
                  <PdfViewer fileUrl={aiState.fileObjectUrl || activeTab.pdfUrl || ""} />
                  {(aiState.stage === "uploading" || aiState.stage === "classifying" || aiState.stage === "extracting") && (
                    <AiScanOverlay stage={aiState.stage} progress={aiState.progress} message={aiState.message} />
                  )}
                  {aiState.stage === "error" && (
                    <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-3 z-10">
                      <div className="text-center space-y-1">
                        <p className="text-sm font-medium text-destructive">{tr("tms.newOrder.ai.extractionFailed")}</p>
                        <p className="text-xs text-muted-foreground max-w-xs">{aiState.error}</p>
                      </div>
                      <Button size="sm" variant="outline" className="bg-transparent" onClick={() => setAiState(prev => ({ ...prev, stage: "idle" }))}>
                        {tr("tms.newOrder.ai.continueManually")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          /* ══════ STEP 2: EXECUTION - FSM-style full-screen map + floating panels ══════ */
          <div className="relative flex-1 overflow-hidden">
            {/* Full-Screen Map Background */}
            <RouteMap
              fullHeight
              hideBottomPanels
              stops={executionStops}
              waypoints={executionWaypoints}
              onWaypointsChange={(wp) => setExecutionWaypoints(wp)}
              fleetMapData={fleetMapData || undefined}
              palletCount={Number(activeTab.form.pallet_count) || 0}
              weightKg={Number(activeTab.form.weight_kg) || 0}
              initialRouteGeometry={executionRoute.geometry || activeTab.form.route_geometry || undefined}
              onRouteCalculated={(info) => {
                setExecutionRoute({
                  geometry: info.geometry || null,
                  distance_km: info.distance_km,
                  duration_hours: info.duration_hours + info.duration_minutes / 60,
                  legs: info.legs || [],
                });
              }}
              onStopsGeocoded={(geocodedStops) => {
                setExecutionStops(geocodedStops);
              }}
              onStopsReordered={(reorderedStops) => {
                setExecutionStops(reorderedStops);
              }}
              onRouteOptionsChange={(opts) => {
                setFleetMapData(prev => prev ? { ...prev, routeOptions: { ...prev.routeOptions, ...opts } } : prev);
              }}
              onGeofenceChange={(gf) => {
                setFleetMapData(prev => prev ? { ...prev, geofences: gf } : prev);
              }}
            />

            {/* ─── Floating Left Sidebar ─── */}
            <div className="absolute top-14 left-3 bottom-3 w-[320px] z-[500] flex flex-col bg-background/95 backdrop-blur-md rounded-xl shadow-2xl border border-border/50">
              {/* Back to details link */}
              <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between">
                <button onClick={() => setStep("details")} className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                  <ArrowLeft className="h-2.5 w-2.5" /> {tr("tms.newOrder.execution.editDetails")}
                </button>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {activeTab.saveStatus === "saved" && <><Cloud className="h-2.5 w-2.5 text-emerald-500" /> {tr("tms.newOrder.ai.savedShort")}</>}
                  {activeTab.saveStatus === "saving" && <><Loader2 className="h-2.5 w-2.5 animate-spin" /> {tr("tms.newOrder.ai.savingShort")}</>}
                </div>
              </div>

              {/* Scrollable content: Fleet Assignment + Stops List */}
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {/* Fleet Assignment (driver/vehicle/trailer) */}
                <div className="border-b border-border/50">
                  <div className="p-2.5">
                    {renderExecutionStep()}
                  </div>
                </div>

                {/* Stops List */}
                {(() => {
                  const trips = activeTab.form.trips || [];
                  const hasTrips = trips.length > 1;
                  // Find which trip a stop belongs to (for color grouping)
                  const getTripForStop = (si: number) => {
                    if (!hasTrips) return null;
                    return trips.find((t: any) => si >= t.from_stop_index && si <= t.to_stop_index);
                  };
                  // Check if this stop IS a swap point (shared boundary between trips)
                  const isSwapStop = (si: number) => {
                    if (!hasTrips) return false;
                    return trips.some((t: any) => t.from_stop_index === si && t.swap_type);
                  };
                  const getSwapTripIdx = (si: number) => {
                    return trips.findIndex((t: any) => t.from_stop_index === si && t.swap_type);
                  };

                  const displayStops = step === "execution" ? executionStops : activeTab.form.stops;
                  return displayStops.map((stop, si) => {
                    const stopColor = stop.stop_type === "pickup" ? "#22c55e" :
                      stop.stop_type === "delivery" ? "#3b82f6" :
                      stop.stop_type === "transit" ? "#f59e0b" :
                      stop.stop_type === "customs" ? "#8b5cf6" :
                      stop.stop_type === "swap" ? "#f97316" : "#6b7280";
                    const isLast = si === displayStops.length - 1;
                    const flagUrl = getCountryFlagUrl(stop.country);
                    const trip = getTripForStop(si);
                    const tripColor = hasTrips && trip ? (["#3b82f6", "#22c55e", "#a855f7", "#06b6d4", "#ec4899", "#84cc16"][(trip.trip_number - 1) % 6]) : undefined;
                    const isSwap = isSwapStop(si);
                    const swapTripIdx = getSwapTripIdx(si);
                    const isExecStop = stop.origin === "execution";

                    return (
                      <div key={stop.id} className="relative">
                        {/* Trip color bar on the left */}
                        {tripColor && (
                          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r" style={{ backgroundColor: tripColor, opacity: 0.6 }} />
                        )}
                        {/* Swap divider ABOVE the swap stop */}
                        {isSwap && (
                          <div className="relative flex items-center gap-2 px-3 py-1.5 mx-2 my-0.5">
                            <div className="flex-1 h-px border-t border-dashed border-amber-500/40" />
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/8 border border-dashed border-amber-500/30">
                              <ArrowLeftRight className="h-2.5 w-2.5 text-amber-500" />
                              <span className="text-[9px] font-medium text-amber-500">
                                {trips[swapTripIdx]?.swap_type === "truck_swap" ? "Truck swap" :
                                 trips[swapTripIdx]?.swap_type === "trailer_swap" ? "Trailer swap" :
                                 trips[swapTripIdx]?.swap_type === "full_swap" ? "Full swap" :
                                 trips[swapTripIdx]?.swap_type === "driver_swap" ? "Driver swap" : "Swap"}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); removeSwapBetweenTrips(swapTripIdx - 1); }}
                                className="p-0.5 hover:bg-amber-500/20 rounded"
                              >
                                <X className="h-2.5 w-2.5 text-amber-500/70" />
                              </button>
                            </div>
                            <div className="flex-1 h-px border-t border-dashed border-amber-500/40" />
                          </div>
                        )}
                        {/* Connecting line */}
                        {!isLast && (
                          <div className="absolute left-[31px] top-[32px] bottom-0 w-px" style={{ backgroundColor: `${stopColor}30` }} />
                        )}
                        <div
                          draggable={step === "execution"}
                          onDragStart={step === "execution" ? () => setDragIdx(si) : undefined}
                          onDragOver={step === "execution" ? (e) => { e.preventDefault(); setDragOverIdx(si); } : undefined}
                          onDrop={step === "execution" ? () => handleStopDrop(si) : undefined}
                          onDragEnd={step === "execution" ? () => { setDragIdx(null); setDragOverIdx(null); } : undefined}
                          onClick={() => { setSelectedStopIndex(si); setShowStopDetails(true); }}
                          className={`relative flex items-center gap-2 px-2 py-2 cursor-pointer transition-all ${
                            selectedStopIndex === si
                              ? "bg-primary/5"
                              : "hover:bg-muted/30"
                          } ${dragOverIdx === si ? "bg-primary/10" : ""} ${dragIdx === si ? "opacity-30" : ""}`}
                        >
                          {step === "execution" ? (
                            <GripVertical className="h-2.5 w-2.5 text-muted-foreground/20 cursor-grab shrink-0" />
                          ) : (
                            <div className="w-2.5 shrink-0" />
                          )}
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 relative z-10 ${
                              isExecStop ? "ring-2 ring-dashed ring-amber-500/60" : "ring-2 ring-background"
                            }`}
                            style={{ backgroundColor: stopColor }}
                          >
                            {si + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {flagUrl && <img src={flagUrl} alt="" className="w-4 h-3 rounded-[2px] object-cover shrink-0" crossOrigin="anonymous" />}
                              <p className="text-[11px] font-medium truncate leading-tight">
                                {stop.city || stop.company_name || `Stop ${si + 1}`}
                              </p>
                              {isExecStop && (
                                <span className="text-[7px] font-semibold px-1 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/20 leading-none uppercase tracking-wider">
                                  {stop.stop_type === "swap" ? "swap" : "exec"}
                                </span>
                              )}
                              {stop.origin === "existing_trip" && (
                                <span className="text-[7px] font-semibold px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20 leading-none uppercase tracking-wider" title={stop.existing_order_ref || "Existing trip"}>
                                  {stop.existing_order_ref?.split("-").pop() || "trip"}
                                </span>
                              )}
                            </div>
                            <p className="text-[9px] text-muted-foreground truncate leading-tight">
                              {stop.address ? stop.address.substring(0, 40) : "No address set"}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {stop.lat !== null && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                            {stop.planned_date && <Clock className="h-2.5 w-2.5 text-blue-400" />}
                          </div>
                        </div>

                        {/* Add swap button between stops (hover to reveal) -- swap can only happen at middle stops */}
                        {!isLast && si + 1 < displayStops.length - 1 && !isSwapStop(si + 1) && (
                          <div className="group relative flex justify-center -my-1 z-20">
                            <button
                              onClick={(e) => { e.stopPropagation(); addSwapBetweenStops(si + 1); }}
                              className="opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-transparent hover:border-amber-500/30 text-[8px] text-amber-500/70 hover:text-amber-500"
                            >
                              <ArrowLeftRight className="h-2 w-2" />
                              Swap
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}

                <button
                  onClick={() => addStop("delivery", "execution")}
                  className="w-full flex items-center gap-2 px-2 py-2.5 text-[10px] text-primary/60 hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  <div className="w-5 h-5 rounded-full border border-dashed border-primary/30 flex items-center justify-center ml-[14px]">
                    <Plus className="h-2.5 w-2.5" />
                  </div>
                  Add new stop
                </button>
              </div>

            </div>

            {/* ─── Floating Center Panel: Stop Details ─── */}
  {showStopDetails && selectedStopIndex !== null && (step === "execution" ? executionStops : activeTab.form.stops)[selectedStopIndex] && (() => {
  const selectedStop = (step === "execution" ? executionStops : activeTab.form.stops)[selectedStopIndex];
              return (
                <div className="absolute top-14 left-[336px] bottom-3 w-[340px] z-[500] flex flex-col bg-background/95 backdrop-blur-md rounded-xl shadow-2xl border border-border/50">
                  {/* Panel header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                        style={{
                          backgroundColor: selectedStop.stop_type === "pickup" ? "#22c55e" :
                            selectedStop.stop_type === "delivery" ? "#3b82f6" :
                            selectedStop.stop_type === "transit" ? "#f59e0b" :
                            selectedStop.stop_type === "customs" ? "#8b5cf6" :
                            selectedStop.stop_type === "swap" ? "#f97316" : "#6b7280"
                        }}
                      >
                        {selectedStopIndex + 1}
                      </div>
                      {selectedStop.country && getCountryFlagUrl(selectedStop.country) && (
                        <img src={getCountryFlagUrl(selectedStop.country)} alt={selectedStop.country} className="w-5 h-3.5 rounded-[2px] object-cover shrink-0" crossOrigin="anonymous" />
                      )}
                      <span className="text-xs font-semibold">
                        {selectedStop.city || selectedStop.company_name || `Stop ${selectedStopIndex + 1}`}
                      </span>
                      {selectedStop.origin === "execution" && (
                        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/20 leading-none uppercase tracking-wider">{tr("tms.newOrder.stops.execution")}</span>
                      )}
                      {selectedStop.origin !== "execution" && (
                        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20 leading-none uppercase tracking-wider">{tr("tms.newOrder.stops.order")}</span>
                      )}
                      <Select value={selectedStop.stop_type} onValueChange={(v: any) => {
                        updateStop(selectedStopIndex, {
                          stop_type: v,
                          ...(v === "swap" && !selectedStop.swap_config ? { swap_config: { swap_type: "truck_swap" } } : {}),
                        });
                        // Auto-create trip split when marking a stop as swap
                        const currentStops = step === "execution" ? executionStops : activeTab.form.stops;
                        if (v === "swap" && selectedStopIndex > 0 && selectedStopIndex < currentStops.length - 1) {
                          const trips = activeTab.form.trips || [];
                          const alreadySplit = trips.some((t: any) => t.from_stop_index === selectedStopIndex && t.swap_type);
                          if (!alreadySplit) {
                            addSwapBetweenStops(selectedStopIndex);
                          }
                        }
                      }}>
                        <SelectTrigger className="h-5 text-[10px] w-auto min-w-[70px] bg-transparent border-dashed"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pickup">{tr("tms.newOrder.stops.typePickup")}</SelectItem>
                          <SelectItem value="delivery">{tr("tms.newOrder.stops.typeDelivery")}</SelectItem>
                          <SelectItem value="customs">{tr("tms.newOrder.stops.typeCustoms")}</SelectItem>
                          <SelectItem value="transit">{tr("tms.newOrder.stops.typeTransit")}</SelectItem>
                          <SelectItem value="swap">{tr("tms.newOrder.stops.typeSwap")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <button onClick={() => setShowStopDetails(false)} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/50">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: "thin" }}>
                    {/* Company / Stop Name */}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground/70">{tr("tms.newOrder.stops.stopName")}</Label>
                      <Input
                        value={selectedStop.company_name}
                        onChange={(e) => updateStop(selectedStopIndex, { company_name: e.target.value })}
                        placeholder={`${tr("tms.newOrder.stops.stopWord")} ${selectedStopIndex + 1}`}
                        className="h-8 text-xs font-medium bg-background/60"
                      />
                    </div>

                    {/* Address with autocomplete */}
                    <div className="space-y-1 relative">
                      <Label className="text-[10px] text-muted-foreground/70">{tr("tms.newOrder.stops.address")}</Label>
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <Input
                          className="h-8 text-xs pl-7 bg-background/60"
                          value={selectedStop.address}
                          onChange={(e) => { updateStop(selectedStopIndex, { address: e.target.value }); setSearchingStop(selectedStopIndex); searchAddress(e.target.value); }}
                          placeholder={tr("tms.newOrder.stops.searchAddress")}
                        />
                        {searchingStop === selectedStopIndex && searchResults.length > 0 && (
                          <div className="absolute top-full mt-1 left-0 right-0 z-[600] bg-popover border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                            {searchResults.map((r: any, ri: number) => (
                              <button key={ri} type="button" className="w-full text-left px-3 py-2 text-[10px] hover:bg-muted transition-colors"
                                onClick={() => {
                                  const parts = r.display_name.split(",").map((s: string) => s.trim());
                                  updateStop(selectedStopIndex, {
                                    address: r.display_name,
                                    lat: parseFloat(r.lat),
                                    lng: parseFloat(r.lon),
                                    city: parts.length > 2 ? parts[parts.length - 3] : "",
                                    country: parts[parts.length - 1] || "",
                                  });
                                  setSearchResults([]);
                                  setSearchingStop(null);
                                }}
                              >
                                <MapPin className="h-3 w-3 inline mr-1 text-muted-foreground" />{r.display_name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {selectedStop.lat !== null && (
                        <div className="text-[10px] text-green-600/80 flex items-center gap-1">
                          <Check className="h-2.5 w-2.5" />
                          {selectedStop.lat?.toFixed(5)}, {selectedStop.lng?.toFixed(5)}
                        </div>
                      )}
                    </div>

                    {/* City / Country / Postal */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground/70">{tr("tms.newOrder.stops.city")}</Label>
                        <Input className="h-7 text-[11px] bg-background/60" value={selectedStop.city} onChange={e => updateStop(selectedStopIndex, { city: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground/70">{tr("tms.newOrder.stops.country")}</Label>
                        <Input className="h-7 text-[11px] bg-background/60" value={selectedStop.country} onChange={e => updateStop(selectedStopIndex, { country: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground/70">{tr("tms.newOrder.stops.postal")}</Label>
                        <Input className="h-7 text-[11px] bg-background/60" value={selectedStop.postal_code} onChange={e => updateStop(selectedStopIndex, { postal_code: e.target.value })} />
                      </div>
                    </div>

                    {/* Time Window */}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><Clock className="h-3 w-3" />{tr("tms.newOrder.stops.timeWindow")}</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-muted-foreground/50 uppercase">{tr("tms.newOrder.stops.date")}</span>
                          <Input type="date" value={selectedStop.planned_date} onChange={e => updateStop(selectedStopIndex, { planned_date: e.target.value })} className="h-7 text-[11px] bg-background/60" />
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-muted-foreground/50 uppercase">{tr("tms.newOrder.stops.from")}</span>
                          <Input type="time" value={selectedStop.planned_time_from} onChange={e => updateStop(selectedStopIndex, { planned_time_from: e.target.value })} className="h-7 text-[11px] bg-background/60" />
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-muted-foreground/50 uppercase">{tr("tms.newOrder.stops.to")}</span>
                          <Input type="time" value={selectedStop.planned_time_to} onChange={e => updateStop(selectedStopIndex, { planned_time_to: e.target.value })} className="h-7 text-[11px] bg-background/60" />
                        </div>
                      </div>
                    </div>

                    {/* Swap info hint -- config is in the left panel trips section */}
                    {selectedStop.stop_type === "swap" && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                        <ArrowLeftRight className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <p className="text-[10px] text-amber-500">
                          {tr("tms.newOrder.stops.swapHint")}
                        </p>
                      </div>
                    )}

                    {/* Contact */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><User className="h-2.5 w-2.5" />{tr("tms.newOrder.stops.contact")}</Label>
                        <Input value={selectedStop.contact_name} onChange={e => updateStop(selectedStopIndex, { contact_name: e.target.value })} className="h-7 text-[11px] bg-background/60" placeholder={tr("tms.newOrder.stops.namePlaceholder")} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{tr("tms.newOrder.stops.contactPhone")}</Label>
                        <Input value={selectedStop.contact_phone} onChange={e => updateStop(selectedStopIndex, { contact_phone: e.target.value })} className="h-7 text-[11px] bg-background/60" placeholder={tr("tms.newOrder.stops.phonePlaceholder")} />
                      </div>
                    </div>

                    {/* Reference */}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground/70">{tr("tms.newOrder.stops.referenceNumber")}</Label>
                      <Textarea value={selectedStop.reference_number} onChange={e => updateStop(selectedStopIndex, { reference_number: e.target.value })} className="min-h-[60px] text-[11px] bg-background/60 resize-none" placeholder={tr("tms.newOrder.stops.refPlaceholder")} rows={3} />
                    </div>

                    {/* Driver Form */}
                    {forms.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><FileCheck className="h-2.5 w-2.5" />{tr("tms.newOrder.stops.driverForm")}</Label>
                        <Select value={selectedStop.form_id || "_none"} onValueChange={v => updateStop(selectedStopIndex, { form_id: v === "_none" ? "" : v })}>
                          <SelectTrigger className="h-7 text-[11px] bg-background/60">
                            <SelectValue placeholder={tr("tms.newOrder.stops.noForm")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">{tr("tms.newOrder.stops.noFormAssigned")}</SelectItem>
                            {forms.map(f => (
                              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Notes */}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground/70">{tr("tms.newOrder.stops.notes")}</Label>
                      <Textarea
                        value={selectedStop.notes || ""}
                        onChange={e => updateStop(selectedStopIndex, { notes: e.target.value })}
                        placeholder={tr("tms.newOrder.stops.notesPlaceholder")}
                        rows={2}
                        className="text-[11px] resize-none bg-background/60"
                      />
                    </div>

                    {/* Delete */}
                    {(step === "execution" ? executionStops : activeTab.form.stops).length > 1 && (
                      <Button
                        variant="ghost" size="sm"
                        className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 text-[11px] h-7"
                        onClick={() => removeStop(selectedStopIndex)}
                      >
                        <Trash2 className="h-3 w-3 mr-1.5" />
                        Remove Stop
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Reopen details button */}
            {!showStopDetails && selectedStopIndex !== null && (
              <button
                onClick={() => setShowStopDetails(true)}
                className="absolute top-[68px] left-[336px] z-[500] bg-background/90 backdrop-blur-md border rounded-lg shadow-lg px-3 py-2 text-xs flex items-center gap-1.5 hover:bg-background transition-colors"
              >
                <ChevronRight className="h-3 w-3" />
                Show Stop Details
              </button>
            )}

            {/* ─── Floating Bottom-Right Order Summary ─── */}
            {(() => {
              const distKm = parseFloat(activeTab.form.estimated_distance_km || "0");
              const durH = parseFloat(activeTab.form.estimated_duration_hours || "0");
              const fuelConsumption = parseFloat(fleetMapData?.routeOptions?.fuel_consumption_per_100km || "25");
              const fuelPrice = parseFloat(fleetMapData?.routeOptions?.fuel_price_per_liter || "1.45");
              const fuelLiters = distKm > 0 ? (distKm / 100) * fuelConsumption : 0;
              const fuelCost = fuelLiters * fuelPrice;
              const hasData = summaryCustomer || distKm > 0 || summaryPallets !== "0";

              if (!hasData) return null;

              return (
                <div className="absolute bottom-3 right-3 z-[500] w-[280px] bg-background/92 backdrop-blur-xl rounded-xl shadow-2xl border border-border/40 overflow-hidden">
                  {/* Customer header */}
                  {summaryCustomer && (
                    <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="text-xs font-semibold truncate">{summaryCustomer.name}</span>
                      </div>
                      {summaryPrice && (
                        <span className="text-sm font-bold text-emerald-400 shrink-0 tabular-nums">
                          {summaryPrice}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Route line */}
                  <div className="px-3 pb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{summaryRoute}</span>
                  </div>

                  {/* Stats grid */}
                  <div className="px-3 pb-2.5 grid grid-cols-4 gap-1">
                    {distKm > 0 && (
                      <div className="rounded-lg bg-primary/8 px-2 py-1.5 text-center">
                        <div className="text-[9px] text-primary/60 uppercase tracking-wider">{tr("tms.newOrder.summary.dist")}</div>
                        <div className="text-[11px] font-bold text-primary tabular-nums">{distKm.toFixed(0)}<span className="text-[8px] font-normal ml-0.5">km</span></div>
                      </div>
                    )}
                    {durH > 0 && (
                      <div className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
                        <div className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">{tr("tms.newOrder.summary.time")}</div>
                        <div className="text-[11px] font-bold text-foreground tabular-nums">{Math.floor(durH)}h{Math.round((durH % 1) * 60) > 0 ? Math.round((durH % 1) * 60) + "m" : ""}</div>
                      </div>
                    )}
                    {summaryPallets !== "0" && (
                      <div className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
                        <div className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">{tr("tms.newOrder.summary.load")}</div>
                        <div className="text-[11px] font-bold text-foreground tabular-nums">{summaryPallets}<span className="text-[8px] font-normal ml-0.5">plt</span></div>
                      </div>
                    )}
                    {fuelCost > 0 && (
                      <div className="rounded-lg bg-amber-500/8 px-2 py-1.5 text-center">
                        <div className="text-[9px] text-amber-500/60 uppercase tracking-wider">{tr("tms.newOrder.summary.fuel")}</div>
                        <div className="text-[11px] font-bold text-amber-500 tabular-nums">{"\u20AC"}{fuelCost.toFixed(0)}</div>
                      </div>
                    )}
                  </div>

                  {/* Margin if forwarding */}
                  {activeTab.form.order_type === "forwarding" && activeTab.form.customer_price && activeTab.form.carrier_cost && (() => {
                    const margin = parseFloat(activeTab.form.customer_price) - parseFloat(activeTab.form.carrier_cost);
                    const marginPct = (margin / parseFloat(activeTab.form.customer_price) * 100);
                    return (
                      <div className="mx-3 mb-2.5 flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/30 border border-border/30">
                        <span className="text-[10px] text-muted-foreground">{tr("tms.newOrder.summary.margin")}</span>
                        <span className={`text-[11px] font-bold tabular-nums ${margin > 0 ? "text-emerald-400" : "text-destructive"}`}>
                          {margin.toFixed(2)} {activeTab.form.customer_currency} ({marginPct.toFixed(0)}%)
                        </span>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      </div>{/* end top-level flex container */}

      {/* Quick Create Partner Dialog */}
      {adminSession && (
  <QuickCreatePartnerDialog
  open={showCreatePartner}
  onOpenChange={setShowCreatePartner}
  adminId={adminSession.id}
  suggestedName={suggestedPartnerName}
  suggestedVat={suggestedPartnerVat}
  onCreated={handlePartnerCreated}
  />
      )}
    </div>
  );
}
