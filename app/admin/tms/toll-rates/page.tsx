"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Search, ChevronRight, ArrowLeft, Plus, Pencil, Trash2, Save, X,
  Globe, Calculator, History, AlertTriangle, ExternalLink, Info,
  ChevronDown, Filter, MoreHorizontal, RefreshCw, DollarSign,
  ArrowLeftRight, Fuel, Volume2, Factory, Leaf, Weight, Truck
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TollCalculator } from "@/components/tms/toll-calculator";
import { MapPinned } from "lucide-react";

// ─── Types ──────────────────────────────
interface TollCountry {
  id: string;
  country_code: string;
  country_name: string;
  toll_operator: string;
  toll_operator_url: string;
  currency: string;
  has_distance_based: boolean;
  has_vignette: boolean;
  has_section_based: boolean;
  is_active: boolean;
  last_rate_update: string | null;
  notes: string;
  rate_count: number;
  vignette_count: number;
  special_count: number;
}

interface VehicleCategory {
  id: string;
  category_type: string;
  code: string;
  name: string;
  sort_order: number;
}

interface TollRate {
  id: string;
  toll_country_id: string;
  road_segment_id: string | null;
  emission_class_id: string | null;
  axle_category_id: string | null;
  weight_class_id: string | null;
  co2_class_id: string | null;
  infrastructure_rate: number;
  air_pollution_rate: number;
  noise_rate: number;
  co2_surcharge: number;
  rate_per_km: number;
  surcharge_per_km: number;
  total_per_km: number;
  currency: string;
  valid_from: string;
  valid_to: string | null;
  source_reference: string;
  notes: string;
  emission_class?: VehicleCategory;
  axle_category?: VehicleCategory;
  weight_category?: VehicleCategory;
  co2_class?: VehicleCategory;
  road_segment?: { id: string; segment_code: string; segment_name: string; segment_type: string };
}

interface TollVignette {
  id: string;
  toll_country_id: string;
  vignette_type: string;
  vignette_name: string;
  vehicle_type: string;
  duration_days: number;
  price: number;
  currency: string;
  emission_class_id: string | null;
  axle_category_id: string | null;
  weight_class_id: string | null;
  valid_from: string;
  valid_to: string | null;
  source_reference: string;
  notes: string;
  emission_class?: VehicleCategory;
  axle_category?: VehicleCategory;
  weight_category?: VehicleCategory;
}

interface SpecialCharge {
  id: string;
  toll_country_id: string;
  name: string;
  charge_type: string;
  location: string;
  price: number;
  currency: string;
  is_round_trip: boolean;
  axle_category_id: string | null;
  weight_class_id: string | null;
  valid_from: string;
  valid_to: string | null;
  notes: string;
  axle_category?: VehicleCategory;
  weight_category?: VehicleCategory;
}

// ─── Flag Helper ──────────────────────────────
function getFlagUrl(code: string): string {
  if (!code) return "";
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

// ─── Country Card ──────────────────────────────
function CountryCard({ country, onClick }: { country: TollCountry; onClick: () => void }) {
  const totalItems = country.rate_count + country.vignette_count + country.special_count;
  const isStale = country.last_rate_update
    ? new Date(country.last_rate_update) < new Date(Date.now() - 365 * 86400000)
    : true;

  return (
    <button
      onClick={onClick}
      className="w-full text-left group p-3 rounded-lg border border-border/50 bg-card hover:border-primary/30 hover:bg-card/80 transition-all"
    >
      <div className="flex items-start gap-3">
        <img
          src={getFlagUrl(country.country_code) || "/placeholder.svg"}
          alt={country.country_name}
          className="w-8 h-6 rounded object-cover mt-0.5 shrink-0"
          crossOrigin="anonymous"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground truncate">{country.country_name}</h3>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{country.toll_operator}</p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {country.has_distance_based && (
              <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-emerald-500/30 text-emerald-400">
                Per-km
              </Badge>
            )}
            {country.has_vignette && (
              <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-blue-500/30 text-blue-400">
                Vignette
              </Badge>
            )}
            {country.has_section_based && (
              <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-purple-500/30 text-purple-400">
                Section
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[9px] text-muted-foreground">
              {totalItems} rate{totalItems !== 1 ? "s" : ""} configured
            </span>
            {isStale && (
              <span className="flex items-center gap-0.5 text-[9px] text-amber-500">
                <AlertTriangle className="h-2.5 w-2.5" />
                Needs update
              </span>
            )}
            {!isStale && country.last_rate_update && (
              <span className="text-[9px] text-muted-foreground/60">
                Updated {new Date(country.last_rate_update).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Rate Row ──────────────────────────────
function RateRow({ rate, onEdit, onDelete }: { rate: TollRate; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 hover:bg-muted/30 transition-colors group text-[11px]">
      <div className="w-[100px] shrink-0">
        <span className="text-foreground font-medium">{rate.emission_class?.code || "-"}</span>
        <p className="text-[9px] text-muted-foreground truncate">{rate.emission_class?.name || "-"}</p>
      </div>
      <div className="w-[80px] shrink-0 text-muted-foreground">{rate.axle_category?.code || "-"}</div>
      <div className="w-[70px] shrink-0 text-right font-mono text-emerald-400">
        {Number(rate.infrastructure_rate || 0).toFixed(4)}
      </div>
      <div className="w-[70px] shrink-0 text-right font-mono text-blue-400">
        {Number(rate.air_pollution_rate || 0).toFixed(4)}
      </div>
      <div className="w-[70px] shrink-0 text-right font-mono text-purple-400">
        {Number(rate.noise_rate || 0).toFixed(4)}
      </div>
      <div className="w-[70px] shrink-0 text-right font-mono text-amber-400">
        {Number(rate.co2_surcharge || 0).toFixed(4)}
      </div>
      <div className="w-[80px] shrink-0 text-right font-mono font-semibold text-foreground">
        {Number(rate.total_per_km || 0).toFixed(4)}
      </div>
      <div className="w-[50px] shrink-0 text-center text-muted-foreground">{rate.currency}</div>
      <div className="w-[80px] shrink-0 text-muted-foreground text-[10px]">
        {rate.valid_from ? new Date(rate.valid_from).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "-"}
      </div>
      <div className="flex-1" />
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary">
          <Pencil className="h-3 w-3" />
        </button>
        <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Rate Header ──────────────────────────────
function RateHeader() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 text-[9px] text-muted-foreground/70 uppercase tracking-wider font-medium bg-muted/20">
      <div className="w-[100px] shrink-0">Emission</div>
      <div className="w-[80px] shrink-0">Axles</div>
      <div className="w-[70px] shrink-0 text-right flex items-center justify-end gap-1">
        <Factory className="h-2.5 w-2.5" /> Infra
      </div>
      <div className="w-[70px] shrink-0 text-right flex items-center justify-end gap-1">
        <Fuel className="h-2.5 w-2.5" /> Air
      </div>
      <div className="w-[70px] shrink-0 text-right flex items-center justify-end gap-1">
        <Volume2 className="h-2.5 w-2.5" /> Noise
      </div>
      <div className="w-[70px] shrink-0 text-right flex items-center justify-end gap-1">
        <Leaf className="h-2.5 w-2.5" /> CO2
      </div>
      <div className="w-[80px] shrink-0 text-right font-semibold">Total/km</div>
      <div className="w-[50px] shrink-0 text-center">Cur</div>
      <div className="w-[80px] shrink-0">Valid From</div>
      <div className="flex-1" />
      <div className="w-[50px]" />
    </div>
  );
}

// ─── Main Page ──────────────────────────────
export default function TollRatesPage() {
  const [countries, setCountries] = useState<TollCountry[]>([]);
  const [categories, setCategories] = useState<VehicleCategory[]>([]);
  const [activeView, setActiveView] = useState<"manager" | "calculator">("manager");
  const [selectedCountry, setSelectedCountry] = useState<TollCountry | null>(null);
  const [rates, setRates] = useState<TollRate[]>([]);
  const [vignettes, setVignettes] = useState<TollVignette[]>([]);
  const [specialCharges, setSpecialCharges] = useState<SpecialCharge[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("rates");
  const [editingRate, setEditingRate] = useState<Partial<TollRate> | null>(null);
  const [editingVignette, setEditingVignette] = useState<Partial<TollVignette> | null>(null);
  const [editingSpecial, setEditingSpecial] = useState<Partial<SpecialCharge> | null>(null);
  const [saving, setSaving] = useState(false);

  // Fetch overview
  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, catRes] = await Promise.all([
        fetch("/api/tms/toll-rates?type=overview"),
        fetch("/api/tms/toll-rates?type=categories"),
      ]);
      const overviewData = await overviewRes.json();
      const catData = await catRes.json();
      if (overviewData.countries) setCountries(overviewData.countries);
      if (catData.categories) setCategories(catData.categories);
    } catch (err) {
      console.error("Failed to fetch toll overview:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  // Fetch country details
  const fetchCountryDetails = useCallback(async (countryId: string) => {
    setLoading(true);
    try {
      const [ratesRes, vigRes, specialRes] = await Promise.all([
        fetch(`/api/tms/toll-rates?type=rates&country_id=${countryId}`),
        fetch(`/api/tms/toll-rates?type=vignettes&country_id=${countryId}`),
        fetch(`/api/tms/toll-rates?type=special&country_id=${countryId}`),
      ]);
      const ratesData = await ratesRes.json();
      const vigData = await vigRes.json();
      const specialData = await specialRes.json();
      if (ratesData.rates) setRates(ratesData.rates);
      if (ratesData.segments) setSegments(ratesData.segments);
      if (vigData.vignettes) setVignettes(vigData.vignettes);
      if (specialData.special_charges) setSpecialCharges(specialData.special_charges);
    } catch (err) {
      console.error("Failed to fetch country details:", err);
    }
    setLoading(false);
  }, []);

  const selectCountry = (country: TollCountry) => {
    setSelectedCountry(country);
    setActiveTab("rates");
    fetchCountryDetails(country.id);
  };

  // Save rate
  const saveRate = async () => {
    if (!editingRate || !selectedCountry) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tms/toll-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_rate",
          data: { ...editingRate, toll_country_id: selectedCountry.id },
        }),
      });
      if (res.ok) {
        setEditingRate(null);
        fetchCountryDetails(selectedCountry.id);
        fetchOverview();
      }
    } catch (err) {
      console.error("Failed to save rate:", err);
    }
    setSaving(false);
  };

  // Save vignette
  const saveVignette = async () => {
    if (!editingVignette || !selectedCountry) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tms/toll-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_vignette",
          data: { ...editingVignette, toll_country_id: selectedCountry.id },
        }),
      });
      if (res.ok) {
        setEditingVignette(null);
        fetchCountryDetails(selectedCountry.id);
        fetchOverview();
      }
    } catch (err) {
      console.error("Failed to save vignette:", err);
    }
    setSaving(false);
  };

  // Save special charge
  const saveSpecial = async () => {
    if (!editingSpecial || !selectedCountry) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tms/toll-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_special_charge",
          data: { ...editingSpecial, toll_country_id: selectedCountry.id },
        }),
      });
      if (res.ok) {
        setEditingSpecial(null);
        fetchCountryDetails(selectedCountry.id);
        fetchOverview();
      }
    } catch (err) {
      console.error("Failed to save special charge:", err);
    }
    setSaving(false);
  };

  // Delete handlers
  const deleteRate = async (id: string) => {
    await fetch("/api/tms/toll-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_rate", data: { id } }),
    });
    if (selectedCountry) fetchCountryDetails(selectedCountry.id);
    fetchOverview();
  };

  const deleteVignette = async (id: string) => {
    await fetch("/api/tms/toll-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_vignette", data: { id } }),
    });
    if (selectedCountry) fetchCountryDetails(selectedCountry.id);
    fetchOverview();
  };

  const emissionClasses = categories.filter(c => c.category_type === "emission_class");
  const axleCategories = categories.filter(c => c.category_type === "axle_category");
  const weightClasses = categories.filter(c => c.category_type === "weight_class");
  const co2Classes = categories.filter(c => c.category_type === "co2_class");

  const filteredCountries = countries.filter(c =>
    c.country_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.country_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.toll_operator?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stats
  const totalRates = countries.reduce((s, c) => s + c.rate_count, 0);
  const totalVignettes = countries.reduce((s, c) => s + c.vignette_count, 0);
  const staleCountries = countries.filter(c =>
    !c.last_rate_update || new Date(c.last_rate_update) < new Date(Date.now() - 365 * 86400000)
  ).length;

  // ─── Country Detail View ──────────────────────────────
  if (selectedCountry) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedCountry(null); setRates([]); setVignettes([]); setSpecialCharges([]); }}
              className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <img
              src={getFlagUrl(selectedCountry.country_code) || "/placeholder.svg"}
              alt={selectedCountry.country_name}
              className="w-8 h-6 rounded object-cover"
              crossOrigin="anonymous"
            />
            <div>
              <h1 className="text-lg font-bold text-foreground">{selectedCountry.country_name}</h1>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{selectedCountry.toll_operator}</span>
                {selectedCountry.toll_operator_url && (
                  <a href={selectedCountry.toll_operator_url} target="_blank" rel="noreferrer"
                    className="text-primary hover:underline flex items-center gap-0.5">
                    <ExternalLink className="h-2.5 w-2.5" /> Website
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              Currency: <strong className="text-foreground">{selectedCountry.currency}</strong>
            </span>
            {selectedCountry.last_rate_update && (
              <Badge variant="outline" className="text-[9px]">
                Updated {new Date(selectedCountry.last_rate_update).toLocaleDateString("en-GB")}
              </Badge>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-2 border-b border-border/50 shrink-0">
            <TabsList className="bg-transparent gap-1 h-8">
              <TabsTrigger value="rates" className="text-[11px] data-[state=active]:bg-muted h-7 px-3">
                <Calculator className="h-3 w-3 mr-1.5" />
                Per-km Rates ({rates.length})
              </TabsTrigger>
              {selectedCountry.has_vignette && (
                <TabsTrigger value="vignettes" className="text-[11px] data-[state=active]:bg-muted h-7 px-3">
                  <DollarSign className="h-3 w-3 mr-1.5" />
                  Vignettes ({vignettes.length})
                </TabsTrigger>
              )}
              <TabsTrigger value="special" className="text-[11px] data-[state=active]:bg-muted h-7 px-3">
                <ArrowLeftRight className="h-3 w-3 mr-1.5" />
                Special Charges ({specialCharges.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="text-[11px] data-[state=active]:bg-muted h-7 px-3">
                <History className="h-3 w-3 mr-1.5" />
                History
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Per-km Rates Tab */}
          <TabsContent value="rates" className="flex-1 overflow-hidden m-0 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{rates.length} active rate{rates.length !== 1 ? "s" : ""}</span>
              </div>
              <Button size="sm" className="h-7 text-[11px] gap-1" onClick={() => setEditingRate({
                currency: selectedCountry.currency,
                valid_from: new Date().toISOString().split("T")[0],
                infrastructure_rate: 0, air_pollution_rate: 0, noise_rate: 0, co2_surcharge: 0,
              })}>
                <Plus className="h-3 w-3" /> Add Rate
              </Button>
            </div>
            <div className="flex-1 overflow-auto" style={{ scrollbarWidth: "thin" }}>
              {rates.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Calculator className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No per-km rates configured</p>
                  <p className="text-[10px] mt-1">Click "Add Rate" to start adding toll rates</p>
                </div>
              ) : (
                <>
                  <RateHeader />
                  {rates.map(rate => (
                    <RateRow key={rate.id} rate={rate} onEdit={() => setEditingRate(rate)} onDelete={() => deleteRate(rate.id)} />
                  ))}
                </>
              )}
            </div>
          </TabsContent>

          {/* Vignettes Tab */}
          <TabsContent value="vignettes" className="flex-1 overflow-hidden m-0 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 shrink-0">
              <span className="text-[10px] text-muted-foreground">{vignettes.length} vignette{vignettes.length !== 1 ? "s" : ""}</span>
              <Button size="sm" className="h-7 text-[11px] gap-1" onClick={() => setEditingVignette({
                currency: selectedCountry.currency,
                valid_from: new Date().toISOString().split("T")[0],
                vignette_type: "annual", vehicle_type: "truck_over_12t", price: 0, duration_days: 365,
              })}>
                <Plus className="h-3 w-3" /> Add Vignette
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2" style={{ scrollbarWidth: "thin" }}>
              {vignettes.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <DollarSign className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No vignettes configured</p>
                </div>
              ) : vignettes.map(v => (
                <div key={v.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/30 bg-card hover:border-border/60 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-foreground">{v.vignette_name || v.vignette_type}</span>
                      <Badge variant="outline" className="text-[8px] h-4">{v.vehicle_type}</Badge>
                      <Badge variant="outline" className="text-[8px] h-4">{v.duration_days}d</Badge>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      {v.emission_class?.name || "All emission classes"} / {v.axle_category?.name || "All axles"} / {v.weight_class?.name || "All weights"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold font-mono text-foreground">{Number(v.price).toFixed(2)}</span>
                    <span className="text-[10px] text-muted-foreground ml-1">{v.currency}</span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditingVignette(v)} className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button onClick={() => deleteVignette(v.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Special Charges Tab */}
          <TabsContent value="special" className="flex-1 overflow-hidden m-0 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 shrink-0">
              <span className="text-[10px] text-muted-foreground">{specialCharges.length} charge{specialCharges.length !== 1 ? "s" : ""}</span>
              <Button size="sm" className="h-7 text-[11px] gap-1" onClick={() => setEditingSpecial({
                currency: selectedCountry.currency,
                valid_from: new Date().toISOString().split("T")[0],
                charge_type: "tunnel", price: 0, is_round_trip: false,
              })}>
                <Plus className="h-3 w-3" /> Add Charge
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2" style={{ scrollbarWidth: "thin" }}>
              {specialCharges.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <ArrowLeftRight className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No special charges configured</p>
                </div>
              ) : specialCharges.map(sc => (
                <div key={sc.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/30 bg-card hover:border-border/60 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-foreground">{sc.name}</span>
                      <Badge variant="outline" className="text-[8px] h-4">{sc.charge_type}</Badge>
                      {sc.is_round_trip && <Badge variant="outline" className="text-[8px] h-4 border-amber-500/30 text-amber-400">Round trip</Badge>}
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{sc.location}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold font-mono text-foreground">{Number(sc.price).toFixed(2)}</span>
                    <span className="text-[10px] text-muted-foreground ml-1">{sc.currency}</span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditingSpecial(sc)} className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button onClick={async () => {
                      await fetch("/api/tms/toll-rates", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "delete_special_charge", data: { id: sc.id } }),
                      });
                      if (selectedCountry) fetchCountryDetails(selectedCountry.id);
                    }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="flex-1 overflow-auto p-4 m-0">
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <History className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Rate change history</p>
              <p className="text-[10px] mt-1">All rate modifications will be tracked here</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* ─── Edit Rate Dialog ──────────────────────────────── */}
        <Dialog open={!!editingRate} onOpenChange={(open) => !open && setEditingRate(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm">{editingRate?.id ? "Edit" : "Add"} Per-km Rate</DialogTitle>
              <DialogDescription className="text-[11px]">
                Configure toll rate breakdown for {selectedCountry.country_name}
              </DialogDescription>
            </DialogHeader>
            {editingRate && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Emission Class</Label>
                    <Select value={editingRate.emission_class_id || "default"} onValueChange={v => setEditingRate({ ...editingRate, emission_class_id: v })}>
                      <SelectTrigger className="h-8 text-[11px]"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {emissionClasses.map(ec => <SelectItem key={ec.id} value={ec.id}>{ec.code} - {ec.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Axle Category</Label>
                    <Select value={editingRate.axle_category_id || "default"} onValueChange={v => setEditingRate({ ...editingRate, axle_category_id: v })}>
                      <SelectTrigger className="h-8 text-[11px]"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {axleCategories.map(ac => <SelectItem key={ac.id} value={ac.id}>{ac.code} - {ac.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Weight Class (optional)</Label>
                    <Select value={editingRate.weight_class_id || "__any__"} onValueChange={v => setEditingRate({ ...editingRate, weight_class_id: v === "__any__" ? null : v })}>
                      <SelectTrigger className="h-8 text-[11px]"><SelectValue placeholder="Any weight" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any__">Any</SelectItem>
                        {weightClasses.map(wc => <SelectItem key={wc.id} value={wc.id}>{wc.code} - {wc.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">CO2 Class (optional)</Label>
                    <Select value={editingRate.co2_class_id || "__any__"} onValueChange={v => setEditingRate({ ...editingRate, co2_class_id: v === "__any__" ? null : v })}>
                      <SelectTrigger className="h-8 text-[11px]"><SelectValue placeholder="Any CO2 class" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any__">Any</SelectItem>
                        {co2Classes.map(cc => <SelectItem key={cc.id} value={cc.id}>{cc.code} - {cc.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">Rate Breakdown (EUR/km)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] flex items-center gap-1"><Factory className="h-2.5 w-2.5 text-emerald-400" /> Infrastructure</Label>
                      <Input type="number" step="0.0001" value={editingRate.infrastructure_rate || ""} onChange={e => setEditingRate({ ...editingRate, infrastructure_rate: parseFloat(e.target.value) || 0 })} className="h-8 text-[11px] font-mono" placeholder="0.0000" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] flex items-center gap-1"><Fuel className="h-2.5 w-2.5 text-blue-400" /> Air Pollution</Label>
                      <Input type="number" step="0.0001" value={editingRate.air_pollution_rate || ""} onChange={e => setEditingRate({ ...editingRate, air_pollution_rate: parseFloat(e.target.value) || 0 })} className="h-8 text-[11px] font-mono" placeholder="0.0000" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] flex items-center gap-1"><Volume2 className="h-2.5 w-2.5 text-purple-400" /> Noise</Label>
                      <Input type="number" step="0.0001" value={editingRate.noise_rate || ""} onChange={e => setEditingRate({ ...editingRate, noise_rate: parseFloat(e.target.value) || 0 })} className="h-8 text-[11px] font-mono" placeholder="0.0000" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] flex items-center gap-1"><Leaf className="h-2.5 w-2.5 text-amber-400" /> CO2 Surcharge</Label>
                      <Input type="number" step="0.0001" value={editingRate.co2_surcharge || ""} onChange={e => setEditingRate({ ...editingRate, co2_surcharge: parseFloat(e.target.value) || 0 })} className="h-8 text-[11px] font-mono" placeholder="0.0000" />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-semibold">Total per km</span>
                    <span className="text-sm font-bold font-mono text-foreground">
                      {((editingRate.infrastructure_rate || 0) + (editingRate.air_pollution_rate || 0) + (editingRate.noise_rate || 0) + (editingRate.co2_surcharge || 0)).toFixed(4)} {editingRate.currency}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Valid From</Label>
                    <Input type="date" value={editingRate.valid_from || ""} onChange={e => setEditingRate({ ...editingRate, valid_from: e.target.value })} className="h-8 text-[11px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Source Reference</Label>
                    <Input value={editingRate.source_reference || ""} onChange={e => setEditingRate({ ...editingRate, source_reference: e.target.value })} className="h-8 text-[11px]" placeholder="e.g. BAG Maut 2024" />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditingRate(null)} className="h-7 text-[11px]">Cancel</Button>
              <Button size="sm" onClick={saveRate} disabled={saving} className="h-7 text-[11px] gap-1">
                <Save className="h-3 w-3" /> {saving ? "Saving..." : "Save Rate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Edit Vignette Dialog ──────────────────────────── */}
        <Dialog open={!!editingVignette} onOpenChange={(open) => !open && setEditingVignette(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">{editingVignette?.id ? "Edit" : "Add"} Vignette</DialogTitle>
            </DialogHeader>
            {editingVignette && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Vignette Name</Label>
                    <Input value={editingVignette.vignette_name || ""} onChange={e => setEditingVignette({ ...editingVignette, vignette_name: e.target.value })} className="h-8 text-[11px]" placeholder="e.g. RO e-Vinieta Annual" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Type</Label>
                    <Select value={editingVignette.vignette_type || "daily"} onValueChange={v => setEditingVignette({ ...editingVignette, vignette_type: v })}>
                      <SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["daily", "weekly", "monthly", "annual", "10_day"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Price</Label>
                    <Input type="number" step="0.01" value={editingVignette.price || ""} onChange={e => setEditingVignette({ ...editingVignette, price: parseFloat(e.target.value) || 0 })} className="h-8 text-[11px] font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Duration (days)</Label>
                    <Input type="number" value={editingVignette.duration_days || ""} onChange={e => setEditingVignette({ ...editingVignette, duration_days: parseInt(e.target.value) || 0 })} className="h-8 text-[11px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Vehicle Type</Label>
                    <Select value={editingVignette.vehicle_type || "truck_over_12t"} onValueChange={v => setEditingVignette({ ...editingVignette, vehicle_type: v })}>
                      <SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="truck_over_12t">Truck &gt;12t</SelectItem>
                        <SelectItem value="truck_3.5_12t">Truck 3.5-12t</SelectItem>
                        <SelectItem value="truck_over_3.5t">Truck &gt;3.5t</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Valid From</Label>
                    <Input type="date" value={editingVignette.valid_from || ""} onChange={e => setEditingVignette({ ...editingVignette, valid_from: e.target.value })} className="h-8 text-[11px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Source</Label>
                    <Input value={editingVignette.source_reference || ""} onChange={e => setEditingVignette({ ...editingVignette, source_reference: e.target.value })} className="h-8 text-[11px]" placeholder="Official source" />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditingVignette(null)} className="h-7 text-[11px]">Cancel</Button>
              <Button size="sm" onClick={saveVignette} disabled={saving} className="h-7 text-[11px] gap-1">
                <Save className="h-3 w-3" /> {saving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Edit Special Charge Dialog ───────────────────── */}
        <Dialog open={!!editingSpecial} onOpenChange={(open) => !open && setEditingSpecial(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">{editingSpecial?.id ? "Edit" : "Add"} Special Charge</DialogTitle>
            </DialogHeader>
            {editingSpecial && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Name</Label>
                    <Input value={editingSpecial.name || ""} onChange={e => setEditingSpecial({ ...editingSpecial, name: e.target.value })} className="h-8 text-[11px]" placeholder="e.g. Brenner Pass" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Type</Label>
                    <Select value={editingSpecial.charge_type || "tunnel"} onValueChange={v => setEditingSpecial({ ...editingSpecial, charge_type: v })}>
                      <SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["tunnel", "bridge", "ferry", "mountain_pass", "city_toll", "border_crossing"].map(t =>
                          <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Location</Label>
                  <Input value={editingSpecial.location || ""} onChange={e => setEditingSpecial({ ...editingSpecial, location: e.target.value })} className="h-8 text-[11px]" placeholder="e.g. Austria/Italy border" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Price</Label>
                    <Input type="number" step="0.01" value={editingSpecial.price || ""} onChange={e => setEditingSpecial({ ...editingSpecial, price: parseFloat(e.target.value) || 0 })} className="h-8 text-[11px] font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Currency</Label>
                    <Input value={editingSpecial.currency || ""} onChange={e => setEditingSpecial({ ...editingSpecial, currency: e.target.value })} className="h-8 text-[11px]" />
                  </div>
                  <div className="flex items-end pb-1 gap-2">
                    <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
                      <input type="checkbox" checked={editingSpecial.is_round_trip || false} onChange={e => setEditingSpecial({ ...editingSpecial, is_round_trip: e.target.checked })} className="rounded" />
                      Round trip
                    </label>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Valid From</Label>
                  <Input type="date" value={editingSpecial.valid_from || ""} onChange={e => setEditingSpecial({ ...editingSpecial, valid_from: e.target.value })} className="h-8 text-[11px]" />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditingSpecial(null)} className="h-7 text-[11px]">Cancel</Button>
              <Button size="sm" onClick={saveSpecial} disabled={saving} className="h-7 text-[11px] gap-1">
                <Save className="h-3 w-3" /> {saving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── Overview / Country List View ──────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-lg font-bold text-foreground">Toll Rate Manager</h1>
            <p className="text-[11px] text-muted-foreground">Manage European road toll rates, vignettes, and special charges</p>
          </div>
          {/* View Toggle */}
          <div className="flex rounded-lg border border-border/50 overflow-hidden">
            <button
              onClick={() => setActiveView("manager")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors ${
                activeView === "manager" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <Globe className="h-3 w-3" /> Rate Tables
            </button>
            <button
              onClick={() => setActiveView("calculator")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors border-l border-border/50 ${
                activeView === "calculator" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <MapPinned className="h-3 w-3" /> Route Calculator
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeView === "manager" && (
            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 bg-transparent" onClick={fetchOverview}>
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Calculator View */}
      {activeView === "calculator" && (
        <div className="flex-1 overflow-hidden">
          <TollCalculator />
        </div>
      )}

      {/* Manager View */}
      {activeView === "manager" && (
        <>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 px-4 py-3 border-b border-border/30 shrink-0">
            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30">
              <div className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] text-muted-foreground">Countries</span>
              </div>
              <p className="text-xl font-bold text-foreground mt-1">{countries.length}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30">
              <div className="flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[10px] text-muted-foreground">Per-km Rates</span>
              </div>
              <p className="text-xl font-bold text-foreground mt-1">{totalRates}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-[10px] text-muted-foreground">Vignettes</span>
              </div>
              <p className="text-xl font-bold text-foreground mt-1">{totalVignettes}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] text-muted-foreground">Need Update</span>
              </div>
              <p className="text-xl font-bold text-foreground mt-1">{staleCountries}</p>
            </div>
          </div>

          {/* Search */}
          <div className="px-4 py-2 border-b border-border/30 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search countries, operators..."
                className="h-8 text-[11px] pl-8"
              />
            </div>
          </div>

          {/* Country Grid */}
          <div className="flex-1 overflow-auto p-4" style={{ scrollbarWidth: "thin" }}>
            {loading && countries.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading toll data...</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredCountries.map(country => (
                  <CountryCard key={country.id} country={country} onClick={() => selectCountry(country)} />
                ))}
              </div>
            )}
          </div>
      </>)}
    </div>
  );
}
