"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Fuel, TrendingUp, TrendingDown, MapPin, Calendar, Trash2, Check, X, Sparkles, Plus, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FuelEntry {
  id: string;
  trip_id: string;
  category: string;
  amount: number;
  currency: string;
  quantity: number | null;
  unit: string | null;
  vendor: string | null;
  country: string | null;
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  occurred_at: string;
  status: string;
  source: string;
  receipt_url: string | null;
  extraction_confidence: number | null;
}

interface TabFuelProps {
  tripId: string;
  trip: {
    id: string;
    reference_number?: string | null;
    planned_start?: string | null;
    planned_end?: string | null;
    distance_km?: number | null;
    vehicle_id?: string | null;
  };
  onChange?: () => void;
}

export function TabFuel({ tripId, trip, onChange }: TabFuelProps) {
  const { toast } = useToast();
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicleFuelData, setVehicleFuelData] = useState<{
    fuel_type: string | null;
    fuel_consumption_l_per_100km: number | null;
    tank_capacity_liters: number | null;
  } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  // Manual form state
  const [formData, setFormData] = useState({
    quantity: "",
    amount: "",
    currency: "EUR",
    vendor: "",
    country: "",
    occurred_at: new Date().toISOString().slice(0, 16),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tms/trips/${tripId}/expenses`);
      const j = await res.json();
      const fuels = (j.expenses ?? []).filter((e: FuelEntry) => e.category === "fuel");
      setFuelEntries(fuels);
    } catch (err) {
      console.log("[v0] TabFuel load error", err);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  const loadVehicleData = useCallback(async () => {
    if (!trip.vehicle_id) return;
    try {
      const res = await fetch(`/api/admin/tms/vehicles/${trip.vehicle_id}`);
      if (res.ok) {
        const v = await res.json();
        setVehicleFuelData({
          fuel_type: v.fuel_type,
          fuel_consumption_l_per_100km: v.fuel_consumption_l_per_100km,
          tank_capacity_liters: v.tank_capacity_liters,
        });
      }
    } catch (err) {
      console.log("[v0] TabFuel loadVehicleData error", err);
    }
  }, [trip.vehicle_id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadVehicleData(); }, [loadVehicleData]);

  // Calculations
  const totalLiters = fuelEntries.reduce((sum, e) => sum + (e.quantity ?? 0), 0);
  const totalEur = fuelEntries.reduce((sum, e) => {
    // Simple EUR assumption; real app would use FX
    return sum + (e.currency === "EUR" ? e.amount : e.amount * 0.2);
  }, 0);
  const distanceKm = trip.distance_km ?? 0;
  const actualConsumption = distanceKm > 0 && totalLiters > 0 ? (totalLiters / distanceKm) * 100 : null;
  const normativeConsumption = vehicleFuelData?.fuel_consumption_l_per_100km ?? null;
  const consumptionDelta = actualConsumption && normativeConsumption
    ? ((actualConsumption - normativeConsumption) / normativeConsumption) * 100
    : null;
  const avgPricePerLiter = totalLiters > 0 ? totalEur / totalLiters : null;
  const costPer100km = distanceKm > 0 ? (totalEur / distanceKm) * 100 : null;
  const tankCapacity = vehicleFuelData?.tank_capacity_liters ?? null;
  const tankPercentRefueled = tankCapacity && totalLiters > 0 ? (totalLiters / tankCapacity) * 100 : null;

  const pendingCount = fuelEntries.filter((e) => e.status === "pending_review").length;

  // Period formatting
  const formatPeriod = () => {
    if (!trip.planned_start) return null;
    const start = new Date(trip.planned_start);
    const end = trip.planned_end ? new Date(trip.planned_end) : null;
    const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return end ? `${fmt(start)} → ${fmt(end)}` : fmt(start);
  };

  // Actions
  async function handleApprove(id: string) {
    const res = await fetch(`/api/admin/tms/trips/${tripId}/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "recorded" }),
    });
    if (res.ok) {
      toast({ title: "Fuel entry approved" });
      load();
      onChange?.();
    } else {
      const j = await res.json().catch(() => ({}));
      toast({ title: "Approval failed", description: j.error, variant: "destructive" });
    }
  }

  async function handleReject(id: string) {
    const res = await fetch(`/api/admin/tms/trips/${tripId}/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
    if (res.ok) {
      toast({ title: "Fuel entry rejected" });
      load();
      onChange?.();
    } else {
      const j = await res.json().catch(() => ({}));
      toast({ title: "Rejection failed", description: j.error, variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/admin/tms/trips/${tripId}/expenses/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Fuel entry deleted" });
      load();
      onChange?.();
    } else {
      const j = await res.json().catch(() => ({}));
      toast({ title: "Delete failed", description: j.error, variant: "destructive" });
    }
  }

  // AI extraction (same as expenses tab)
  async function extractAndSave(file: File) {
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tripId", tripId);
      const res = await fetch("/api/tms/extract-receipt", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "AI extraction failed");
      }
      const { receipt_url, extraction } = await res.json();

      if (!extraction?.quantity || extraction.quantity <= 0) {
        toast({ title: "No liters detected", description: "Please enter manually", variant: "destructive" });
        setShowManualForm(true);
        return;
      }

      // Force category to fuel
      const saveRes = await fetch(`/api/admin/tms/trips/${tripId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "fuel",
          amount: extraction.amount,
          currency: extraction.currency || "EUR",
          quantity: extraction.quantity,
          unit: extraction.unit || "L",
          vendor: extraction.vendor,
          country: extraction.country,
          occurred_at: extraction.occurred_at || new Date().toISOString(),
          receipt_url,
          latitude: extraction.latitude,
          longitude: extraction.longitude,
          location_label: [extraction.address, extraction.city].filter(Boolean).join(", ") || null,
          extracted_data: extraction,
          extraction_confidence: extraction.confidence,
          source: "ai",
          status: "pending_review",
        }),
      });

      if (!saveRes.ok) {
        const j = await saveRes.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }

      toast({
        title: "Fuel receipt extracted",
        description: `${extraction.quantity?.toFixed(1)}L · ${extraction.amount?.toFixed(2)} ${extraction.currency || "EUR"} · ${extraction.vendor || "Unknown station"}`,
      });
      load();
      onChange?.();
    } catch (e: any) {
      toast({ title: "Extraction error", description: e.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  }

  async function handleManualSave() {
    if (!formData.quantity || !formData.amount) {
      toast({ title: "Missing fields", description: "Liters and amount are required", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(`/api/admin/tms/trips/${tripId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "fuel",
          amount: parseFloat(formData.amount),
          currency: formData.currency,
          quantity: parseFloat(formData.quantity),
          unit: "L",
          vendor: formData.vendor || null,
          country: formData.country || null,
          occurred_at: formData.occurred_at || new Date().toISOString(),
          source: "admin",
          status: "recorded",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      toast({ title: "Fuel entry added" });
      setShowManualForm(false);
      setFormData({ quantity: "", amount: "", currency: "EUR", vendor: "", country: "", occurred_at: new Date().toISOString().slice(0, 16) });
      load();
      onChange?.();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) extractAndSave(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) extractAndSave(file);
  };

  return (
    <div className="h-full overflow-y-auto flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20">
            <Fuel className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">FUEL</span>
              {trip.reference_number && (
                <span className="font-mono text-sm font-semibold text-foreground">{trip.reference_number}</span>
              )}
            </div>
            {formatPeriod() && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatPeriod()}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-400">
              {pendingCount} pending
            </Badge>
          )}
          <div className="text-right">
            <div className="text-xs text-muted-foreground">TOTAL</div>
            <div className="text-lg font-bold text-amber-400">{totalLiters.toFixed(1)} L</div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="border-border/50 bg-card/50 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Distance</div>
          <div className="mt-1 text-lg font-semibold">{distanceKm.toLocaleString()} km</div>
        </Card>
        <Card className="border-border/50 bg-card/50 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Liters</div>
          <div className="mt-1 text-lg font-semibold text-amber-400">{totalLiters.toFixed(1)} L</div>
        </Card>
        <Card className="border-border/50 bg-card/50 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Cost</div>
          <div className="mt-1 text-lg font-semibold">{totalEur.toFixed(2)} EUR</div>
        </Card>
        <Card className="border-border/50 bg-card/50 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Actual L/100km</div>
          <div className="mt-1 flex items-center gap-1">
            <span className={cn("text-lg font-semibold", consumptionDelta && consumptionDelta > 10 ? "text-red-400" : consumptionDelta && consumptionDelta < -5 ? "text-emerald-400" : "")}>
              {actualConsumption?.toFixed(1) ?? "—"}
            </span>
            {consumptionDelta !== null && (
              <span className={cn("flex items-center text-xs", consumptionDelta > 0 ? "text-red-400" : "text-emerald-400")}>
                {consumptionDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(consumptionDelta).toFixed(0)}%
              </span>
            )}
          </div>
          {normativeConsumption && (
            <div className="text-[10px] text-muted-foreground">Norm: {normativeConsumption} L/100km</div>
          )}
        </Card>
        <Card className="border-border/50 bg-card/50 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Avg EUR/L</div>
          <div className="mt-1 text-lg font-semibold">{avgPricePerLiter?.toFixed(3) ?? "—"}</div>
        </Card>
        <Card className="border-border/50 bg-card/50 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">EUR/100km</div>
          <div className="mt-1 text-lg font-semibold">{costPer100km?.toFixed(2) ?? "—"}</div>
        </Card>
      </div>

      {/* Tank capacity warning */}
      {tankCapacity && totalLiters > tankCapacity && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-sm text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          Total refueled ({totalLiters.toFixed(0)}L) exceeds tank capacity ({tankCapacity}L) — check for duplicate entries
        </div>
      )}

      {/* AI Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors",
          extracting
            ? "border-amber-500/50 bg-amber-500/5"
            : "border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/5"
        )}
      >
        <input
          type="file"
          accept="image/*,application/pdf"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={handleFileSelect}
          disabled={extracting}
        />
        {extracting ? (
          <>
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            <span className="text-sm font-medium text-amber-400">Reading fuel receipt...</span>
          </>
        ) : (
          <>
            <Sparkles className="h-6 w-6 text-amber-400" />
            <span className="text-sm font-medium text-amber-400">Drop fuel receipt for AI extraction</span>
            <span className="text-xs text-muted-foreground">Fuel slips, station receipts — extracts liters, price, station</span>
          </>
        )}
      </div>

      {/* Manual form toggle */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setShowManualForm(!showManualForm)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add manually
        </Button>
      </div>

      {/* Manual form */}
      {showManualForm && (
        <Card className="border-border/50 bg-card/50 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Liters *</label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 450"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Amount *</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 650.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Currency</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option>EUR</option>
                <option>RON</option>
                <option>HUF</option>
                <option>PLN</option>
                <option>CZK</option>
                <option>BGN</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Station</label>
              <input
                type="text"
                placeholder="e.g. Shell, OMV"
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Country</label>
              <input
                type="text"
                placeholder="e.g. DE, AT"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Date/Time</label>
              <input
                type="datetime-local"
                value={formData.occurred_at}
                onChange={(e) => setFormData({ ...formData, occurred_at: e.target.value })}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowManualForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleManualSave} className="bg-amber-500 text-black hover:bg-amber-400">Save Fuel Entry</Button>
          </div>
        </Card>
      )}

      {/* Fuel entries list */}
      <div className="space-y-2">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : fuelEntries.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No fuel entries yet. Drop a receipt or add manually.
          </div>
        ) : (
          fuelEntries.map((entry) => {
            const pricePerLiter = entry.quantity && entry.quantity > 0 ? entry.amount / entry.quantity : null;
            const exceedsTank = tankCapacity && entry.quantity && entry.quantity > tankCapacity;
            return (
              <Card
                key={entry.id}
                className={cn(
                  "flex items-center gap-3 border-border/50 bg-card/50 p-3",
                  entry.status === "pending_review" && "border-amber-500/30 bg-amber-500/5",
                  entry.status === "rejected" && "border-red-500/30 bg-red-500/5 opacity-60"
                )}
              >
                {/* Date + time */}
                <div className="w-20 shrink-0 text-xs text-muted-foreground">
                  {new Date(entry.occurred_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  <br />
                  {new Date(entry.occurred_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </div>

                {/* Fuel icon */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                  <Fuel className="h-4 w-4 text-amber-400" />
                </div>

                {/* Station + location */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{entry.vendor || "Unknown station"}</span>
                    {entry.country && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">{entry.country}</Badge>
                    )}
                    {exceedsTank && (
                      <Badge variant="outline" className="shrink-0 border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-400">
                        Exceeds tank
                      </Badge>
                    )}
                  </div>
                  {entry.location_label && (
                    <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {entry.location_label}
                    </div>
                  )}
                </div>

                {/* Liters */}
                <div className="shrink-0 text-right">
                  <div className="text-lg font-bold text-amber-400">{entry.quantity?.toFixed(1) ?? "—"} L</div>
                  {pricePerLiter && (
                    <div className="text-[10px] text-muted-foreground">{pricePerLiter.toFixed(3)} {entry.currency}/L</div>
                  )}
                </div>

                {/* Amount */}
                <div className="w-24 shrink-0 text-right">
                  <div className="font-semibold">{entry.amount.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">{entry.currency}</div>
                </div>

                {/* Status + actions */}
                <div className="flex shrink-0 items-center gap-1">
                  {entry.source === "ai" && entry.extraction_confidence && (
                    <Badge variant="outline" className="text-[10px]">
                      AI {Math.round(entry.extraction_confidence)}%
                    </Badge>
                  )}
                  {entry.status === "pending_review" ? (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-400 hover:bg-emerald-500/20" onClick={() => handleApprove(entry.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:bg-red-500/20" onClick={() => handleReject(entry.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Badge variant="outline" className={cn(
                      "text-[10px]",
                      entry.status === "recorded" && "border-emerald-500/50 text-emerald-400",
                      entry.status === "rejected" && "border-red-500/50 text-red-400"
                    )}>
                      {entry.status}
                    </Badge>
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-400" onClick={() => handleDelete(entry.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Normative info footer */}
      {!vehicleFuelData?.fuel_consumption_l_per_100km && (
        <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
          <strong>Tip:</strong> Set the normative fuel consumption on the vehicle master data to see consumption variance analysis.
        </div>
      )}
    </div>
  );
}
