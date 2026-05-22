"use client";

import { useEffect, useState, useRef } from "react";
import {
  Plus, Loader2, Check, X, Receipt, Fuel, Coins, ParkingSquare, Ship, Droplet,
  Wrench, ShieldAlert, AlertCircle, FileWarning, Sparkles, Trash2, ExternalLink,
  Upload, MapPin, Calendar, Pencil,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CatalogPicker, type CatalogItem } from "@/components/finance/catalog-picker";

const CATEGORIES: { id: string; label: string; icon: any; tone: string }[] = [
  { id: "fuel", label: "Fuel", icon: Fuel, tone: "text-amber-400" },
  { id: "toll", label: "Toll", icon: Coins, tone: "text-blue-400" },
  { id: "parking", label: "Parking", icon: ParkingSquare, tone: "text-cyan-400" },
  { id: "ferry", label: "Ferry", icon: Ship, tone: "text-sky-400" },
  { id: "ad_blue", label: "AdBlue", icon: Droplet, tone: "text-indigo-400" },
  { id: "wash", label: "Wash", icon: Sparkles, tone: "text-teal-400" },
  { id: "repair", label: "Repair", icon: Wrench, tone: "text-orange-400" },
  { id: "driver_per_diem", label: "Driver Per-diem", icon: Receipt, tone: "text-emerald-400" },
  { id: "customs", label: "Customs", icon: FileWarning, tone: "text-violet-400" },
  { id: "insurance", label: "Insurance", icon: ShieldAlert, tone: "text-fuchsia-400" },
  { id: "penalty", label: "Penalty", icon: AlertCircle, tone: "text-red-400" },
  { id: "other", label: "Other", icon: Receipt, tone: "text-muted-foreground" },
];

interface Expense {
  id: string;
  trip_id: string;
  leg_id: string | null;
  order_id: string | null;
  category: string;
  description: string | null;
  amount: number;
  currency: string;
  amount_eur: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  amount_excl_vat: number | null;
  amount_incl_vat: number | null;
  amount_eur_excl_vat: number | null;
  amount_eur_incl_vat: number | null;
  occurred_at: string;
  country: string | null;
  vendor: string | null;
  receipt_url: string | null;
  source: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  quantity: number | null;
  unit: string | null;
  extraction_confidence: number | null;
  cost_catalog_id?: string | null;
  cost_catalog?: { id: string; cost_code: string; cost_line: string; unit: string | null } | null;
  driver?: { id: string; first_name: string; last_name: string } | null;
}

interface Props {
  tripId: string;
  trip: any;
  linkedOrders: any[];
  onChange?: () => void;
}

const fmtDate = (d?: string | null) => {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
};

export function TabExpenses({ tripId, trip, linkedOrders, onChange }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  /** Non-null when the form is editing an existing row instead of creating one. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Manual form state
  const [form, setForm] = useState({
    category: "fuel",
    cost_catalog_id: null as string | null,
    cost_catalog_item: null as CatalogItem | null,
    description: "",
    amount: "",         // gross (incl. VAT) — what the driver paid
    amount_excl_vat: "", // optional, derived if blank
    tax_rate: "",       // %
    tax_amount: "",     // VAT in receipt currency
    currency: "EUR",
    occurred_at: new Date().toISOString().slice(0, 16),
    country: "",
    vendor: "",
    order_id: "",
    receipt_url: "",
    quantity: "",
    unit: "",
    location_label: "",
    latitude: "" as string,
    longitude: "" as string,
  });

  // EUR-conversion preview for the form (calls the FX function via API isn't necessary —
  // we just show a hint based on the BNR rate the user can sanity-check after save).
  const [eurPreview, setEurPreview] = useState<{ rate: number; eur: number } | null>(null);
  useEffect(() => {
    const amt = Number(form.amount);
    if (!amt || form.currency === "EUR") { setEurPreview(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bnr/rates`);
        if (!res.ok) return;
        const j = await res.json();
        const eurToRon = j.rates?.EUR;
        const ccyToRon = form.currency === "RON" ? 1 : j.rates?.[form.currency];
        if (!eurToRon || !ccyToRon) return;
        const eur = (amt * ccyToRon) / eurToRon;
        if (!cancelled) setEurPreview({ rate: ccyToRon / eurToRon, eur });
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, [form.amount, form.currency]);

  /** When the user edits gross + tax_rate, derive net + tax_amount on the fly.
   *  When they edit net + tax_rate, derive gross. The DB trigger will do the
   *  same math server-side, but doing it here gives instant feedback. */
  function setVatField(patch: Partial<typeof form>) {
    setForm(prev => {
      const next = { ...prev, ...patch };
      const gross = Number(next.amount);
      const net = Number(next.amount_excl_vat);
      const rate = Number(next.tax_rate);
      const explicitVat = Number(next.tax_amount);

      if (!isNaN(gross) && !isNaN(rate) && rate > 0 && (patch.amount !== undefined || patch.tax_rate !== undefined)) {
        const derivedNet = gross / (1 + rate / 100);
        const derivedVat = gross - derivedNet;
        next.amount_excl_vat = derivedNet.toFixed(2);
        next.tax_amount = derivedVat.toFixed(2);
      } else if (!isNaN(net) && !isNaN(rate) && rate > 0 && patch.amount_excl_vat !== undefined) {
        const derivedGross = net * (1 + rate / 100);
        const derivedVat = derivedGross - net;
        next.amount = derivedGross.toFixed(2);
        next.tax_amount = derivedVat.toFixed(2);
      } else if (!isNaN(gross) && !isNaN(explicitVat) && patch.tax_amount !== undefined) {
        const derivedNet = gross - explicitVat;
        next.amount_excl_vat = derivedNet.toFixed(2);
        if (gross > 0) next.tax_rate = ((explicitVat / derivedNet) * 100).toFixed(2);
      }
      return next;
    });
  }

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/tms/trips/${tripId}/expenses`);
    const j = await res.json();
    setExpenses(j.expenses ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [tripId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast({ title: "Amount must be > 0", variant: "destructive" });
      return;
    }
    setSaving(true);

    // Same payload for create + update; the server's whitelist drops anything
    // it doesn't recognize. amount_eur is intentionally excluded — the FX
    // BEFORE-trigger on trip_expenses owns it on every UPDATE, and it then
    // propagates to cost_entries via the existing forward sync trigger.
    const payload = {
      category: form.category,
      cost_catalog_id: form.cost_catalog_id,
      description: form.description,
      amount: Number(form.amount),
      currency: form.currency,
      amount_excl_vat: form.amount_excl_vat ? Number(form.amount_excl_vat) : null,
      tax_rate: form.tax_rate ? Number(form.tax_rate) : null,
      tax_amount: form.tax_amount ? Number(form.tax_amount) : null,
      amount_incl_vat: Number(form.amount), // gross == amount
      order_id: form.order_id || null,
      country: form.country || null,
      vendor: form.vendor || null,
      receipt_url: form.receipt_url || null,
      quantity: form.quantity ? Number(form.quantity) : null,
      unit: form.unit || null,
      location_label: form.location_label || null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      occurred_at: new Date(form.occurred_at).toISOString(),
    };

    const url = editingId
      ? `/api/admin/tms/trips/${tripId}/expenses/${editingId}`
      : `/api/admin/tms/trips/${tripId}/expenses`;
    const method = editingId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast({
        title: editingId ? "Failed to update expense" : "Failed to save expense",
        description: j.error,
        variant: "destructive",
      });
      return;
    }
    toast({ title: editingId ? "Expense updated" : "Expense added" });
    setShowForm(false);
    setEditingId(null);
    setForm(p => ({
      ...p,
      cost_catalog_id: null,
      cost_catalog_item: null,
      amount: "", amount_excl_vat: "", tax_rate: "", tax_amount: "",
      description: "", vendor: "", receipt_url: "",
      quantity: "", location_label: "", latitude: "", longitude: "",
    }));
    load();
    onChange?.();
  }

  /** Pre-fill the form for inline editing. The same form serves create + update. */
  function editRow(e: any) {
    setEditingId(e.id);
    setForm({
      category: e.category ?? "fuel",
      cost_catalog_id: e.cost_catalog_id ?? null,
      // The picker accepts a fully-hydrated initialItem; if the row only carries
      // the id we let the picker fetch on its own (it's a 1-row API call).
      cost_catalog_item: e.cost_catalog
        ? {
            id: e.cost_catalog.id,
            cost_code: e.cost_catalog.cost_code,
            cost_line: e.cost_catalog.cost_line,
            unit: e.cost_catalog.unit ?? null,
            driver_allowed: !!e.cost_catalog.driver_allowed,
            manual_allowed: !!e.cost_catalog.manual_allowed,
            is_system: !e.cost_catalog.admin_id,
          }
        : null,
      description: e.description ?? "",
      amount: e.amount != null ? String(e.amount) : "",
      amount_excl_vat: e.amount_excl_vat != null ? String(e.amount_excl_vat) : "",
      tax_rate: e.tax_rate != null ? String(e.tax_rate) : "",
      tax_amount: e.tax_amount != null ? String(e.tax_amount) : "",
      currency: e.currency ?? "EUR",
      occurred_at: e.occurred_at
        ? new Date(e.occurred_at).toISOString().slice(0, 16)
        : new Date().toISOString().slice(0, 16),
      country: e.country ?? "",
      vendor: e.vendor ?? "",
      order_id: e.order_id ?? "",
      receipt_url: e.receipt_url ?? "",
      quantity: e.quantity != null ? String(e.quantity) : "",
      unit: e.unit ?? "",
      location_label: e.location_label ?? "",
      latitude: e.latitude != null ? String(e.latitude) : "",
      longitude: e.longitude != null ? String(e.longitude) : "",
    });
    setShowForm(true);
    // Smooth-scroll to the form so the user sees it open
    setTimeout(() => {
      document.querySelector<HTMLElement>("[data-expense-form]")?.scrollIntoView({
        behavior: "smooth", block: "center",
      });
    }, 50);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
  }

  /** AI extraction → auto-save (always pending_review). */
  async function extractAndSave(file: File) {
    console.log("[v0] tab-expenses: extractAndSave start", {
      name: file.name,
      type: file.type,
      size: file.size,
      tripId,
    });
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tripId", tripId);
      console.log("[v0] tab-expenses: POST /api/tms/extract-receipt");
      const res = await fetch(`/api/tms/extract-receipt`, { method: "POST", body: fd });
      console.log("[v0] tab-expenses: extract-receipt status", res.status);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        console.log("[v0] tab-expenses: extract-receipt error body", j);
        throw new Error(j.error || `AI extraction failed (${res.status})`);
      }
      const { receipt_url, extraction } = (await res.json()) as {
        receipt_url: string;
        extraction: any;
      };
      console.log("[v0] tab-expenses: extraction result", {
        receipt_url,
        category: extraction?.category,
        amount: extraction?.amount,
        currency: extraction?.currency,
        confidence: extraction?.confidence,
      });

      if (!extraction?.amount || extraction.amount <= 0) {
        console.log("[v0] tab-expenses: amount missing -> falling back to manual form");
        toast({
          title: "Could not read amount",
          description: "Please add the expense manually.",
          variant: "destructive",
        });
        // Pre-fill the manual form with what we DID get
        setForm(p => ({
          ...p,
          category: extraction?.category || p.category,
          currency: extraction?.currency || p.currency,
          vendor: extraction?.vendor || p.vendor,
          country: extraction?.country || p.country,
          description: extraction?.description || p.description,
          receipt_url: receipt_url,
          occurred_at: extraction?.occurred_at
            ? new Date(extraction.occurred_at).toISOString().slice(0, 16)
            : p.occurred_at,
        }));
        setShowForm(true);
        return;
      }

      // Save directly with status pending_review for the operator to confirm
      console.log("[v0] tab-expenses: POST /api/admin/tms/trips/[id]/expenses (pending_review)");
      const saveRes = await fetch(`/api/admin/tms/trips/${tripId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: extraction.category || "other",
          description: extraction.description,
          amount: extraction.amount,
          currency: extraction.currency || "EUR",
          occurred_at: extraction.occurred_at || new Date().toISOString(),
          country: extraction.country,
          vendor: extraction.vendor,
          receipt_url,
          latitude: extraction.latitude,
          longitude: extraction.longitude,
          location_label:
            [extraction.address, extraction.city].filter(Boolean).join(", ") || null,
          quantity: extraction.quantity,
          unit: extraction.unit,
          // Phase 3: pass VAT through. The OCR returns vat_amount (gross-VAT
          // portion). The DB BEFORE trigger derives amount_excl_vat /
          // amount_incl_vat / amount_eur_excl_vat / amount_eur_incl_vat
          // from these two fields plus the receipt's currency + date.
          vat_amount: extraction.vat_amount ?? null,
          extracted_data: extraction,
          extraction_confidence: extraction.confidence,
          source: "ai",
          status: "pending_review",
        }),
      });
      console.log("[v0] tab-expenses: save status", saveRes.status);

      if (!saveRes.ok) {
        const j = await saveRes.json().catch(() => ({}));
        console.log("[v0] tab-expenses: save error body", j);
        throw new Error(j.error || `Save failed (${saveRes.status})`);
      }
      console.log("[v0] tab-expenses: extraction + save complete");
      toast({
        title: "Receipt extracted",
        description: `${extraction.category?.toUpperCase()} ${extraction.amount?.toFixed(2)} ${extraction.currency || "EUR"} - confidence ${Math.round(extraction.confidence ?? 0)}%`,
      });
      load();
      onChange?.();
    } catch (e: any) {
      console.log("[v0] tab-expenses: extraction caught error", e?.message ?? e);
      toast({ title: "Extraction error", description: e.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  }

  async function patch(id: string, body: any) {
    console.log("[v0] tab-expenses: PATCH", { id, body });
    const res = await fetch(`/api/admin/tms/trips/${tripId}/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    console.log("[v0] tab-expenses: PATCH status", res.status);
    if (res.ok) {
      toast({ title: body.status === "rejected" ? "Expense rejected" : body.status === "approved" ? "Expense approved" : "Expense updated" });
      load();
      onChange?.();
    } else {
      const j = await res.json().catch(() => ({}));
      console.log("[v0] tab-expenses: PATCH error", j);
      toast({ title: "Action failed", description: j.error, variant: "destructive" });
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this expense?")) return;
    console.log("[v0] tab-expenses: DELETE", { id });
    const res = await fetch(`/api/admin/tms/trips/${tripId}/expenses/${id}`, { method: "DELETE" });
    console.log("[v0] tab-expenses: DELETE status", res.status);
    if (res.ok) {
      toast({ title: "Expense deleted" });
      load();
      onChange?.();
    } else {
      const j = await res.json().catch(() => ({}));
      console.log("[v0] tab-expenses: DELETE error", j);
      toast({ title: "Delete failed", description: j.error, variant: "destructive" });
    }
  }

  const visible = filter === "all" ? expenses : expenses.filter(e => e.category === filter);
  const total = visible.reduce((s, e) => s + (e.status === "rejected" ? 0 : Number(e.amount_eur ?? e.amount) || 0), 0);
  const pendingCount = expenses.filter(e => e.status === "pending_review").length;

  // Category breakdown (only categories that have entries)
  const breakdown = CATEGORIES
    .map(c => ({
      ...c,
      total: expenses
        .filter(e => e.category === c.id && e.status !== "rejected")
        .reduce((s, e) => s + (Number(e.amount_eur ?? e.amount) || 0), 0),
      count: expenses.filter(e => e.category === c.id).length,
    }))
    .filter(b => b.count > 0);

  // ── Period header pieces ──
  const startLbl = fmtDate(trip?.actual_start || trip?.planned_start);
  const endLbl = fmtDate(trip?.actual_end || trip?.planned_end);
  const year =
    trip?.planned_end || trip?.planned_start
      ? new Date(trip?.planned_end || trip?.planned_start).getFullYear()
      : null;
  const periodLabel =
    startLbl && endLbl
      ? `${startLbl} \u2192 ${endLbl}${year ? `, ${year}` : ""}`
      : startLbl
      ? `${startLbl}${year ? `, ${year}` : ""}`
      : null;

  return (
    <div className="h-full overflow-y-auto">
      {/* ── Header: Trip code + Period + Totals ── */}
      <div className="px-3 pt-3 pb-2 border-b border-border/40">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Receipt className="h-4 w-4 text-primary" />
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Expenses</span>
                {trip?.reference_number && (
                  <span className="font-mono text-[10px] font-semibold text-foreground tracking-wider">
                    {trip.reference_number}
                  </span>
                )}
              </div>
              {periodLabel && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/80 mt-0.5">
                  <Calendar className="h-3 w-3" />
                  <span className="tabular-nums">{periodLabel}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right leading-tight">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70">Total</div>
              <div className="text-base font-bold tabular-nums">
                {total.toFixed(2)}<span className="text-[10px] text-muted-foreground/70 ml-1">EUR</span>
              </div>
            </div>
            {pendingCount > 0 && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 font-medium">
                {pendingCount} pending review
              </span>
            )}
          </div>
        </div>

        {/* Category mini-cards */}
        {breakdown.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 mt-3">
            {breakdown.map(b => {
              const Icon = b.icon;
              const active = filter === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setFilter(active ? "all" : b.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-left transition-colors ${
                    active
                      ? "bg-foreground/[0.06] border-foreground/20"
                      : "bg-muted/20 border-border/40 hover:bg-muted/40 hover:border-border/60"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${b.tone}`} />
                  <div className="leading-tight min-w-0 flex-1">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 truncate">
                      {b.label}
                    </div>
                    <div className="text-[11px] font-semibold tabular-nums truncate">
                      {b.total.toFixed(0)} <span className="text-[9px] font-normal text-muted-foreground/70">EUR · {b.count}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* ── AI Drop Zone ── */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={async e => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) await extractAndSave(f);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-xl border-2 border-dashed p-4 transition-all ${
            dragOver
              ? "border-primary bg-primary/5"
              : extracting
              ? "border-primary/40 bg-primary/[0.03]"
              : "border-border/40 hover:border-primary/40 hover:bg-muted/30"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) extractAndSave(f);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
              extracting ? "bg-primary/10" : "bg-primary/10"
            }`}>
              {extracting ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <Sparkles className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="flex-1 leading-tight">
              <div className="text-[12px] font-semibold text-foreground">
                {extracting ? "Reading receipt with AI..." : "Drop a receipt or click to upload"}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Fuel slips, toll tickets, ferry vouchers, parking, AdBlue, repair invoices - PDF or image. AI auto-detects category, amount, vendor, date, and location.
              </div>
            </div>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                if (showForm) { cancelForm(); }
                else { setEditingId(null); setShowForm(true); }
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border/50 bg-background text-[10px] font-medium hover:bg-muted whitespace-nowrap"
            >
              <Plus className="h-3 w-3" />
              Add manually
            </button>
          </div>
        </div>

        {/* ── Manual form (collapsed by default) ── */}
        {showForm && (
          <form data-expense-form onSubmit={submit} className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-3">
            {editingId && (
              <div className="flex items-center gap-2 -mt-1 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-semibold uppercase tracking-wider">
                  Editing
                </span>
                <span className="text-muted-foreground/70 font-mono">#{editingId.slice(0, 8)}</span>
                <span className="text-muted-foreground/60">— changes propagate to the cost-entries ledger automatically</span>
              </div>
            )}
            {/* Row 1: Cost catalog picker (full width) — what kind of cost is this */}
            <div className="space-y-1">
              <label className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                Cost code
              </label>
              <CatalogPicker
                value={form.cost_catalog_id}
                initialItem={form.cost_catalog_item}
                manualOnly
                placeholder="Search catalog: A1-001 motorina, A1-013 toll, A1-030 parking..."
                onChange={(item) => {
                  setForm(p => ({
                    ...p,
                    cost_catalog_id: item?.id ?? null,
                    cost_catalog_item: item,
                    // Best-effort sync of the legacy enum so server-side fallbacks work.
                    category:
                      item?.cost_code?.startsWith("A1-001") ? "fuel" :
                      item?.cost_code?.startsWith("A1-002") ? "ad_blue" :
                      item?.cost_code?.startsWith("A1-013") ? "toll" :
                      item?.cost_code?.startsWith("A1-020") ? "toll" :
                      item?.cost_code?.startsWith("A1-030") ? "parking" :
                      item?.cost_code?.startsWith("A1-031") ? "wash" :
                      item?.cost_code?.startsWith("A1-032") ? "ferry" :
                      item?.cost_code?.startsWith("C3")     ? "driver_per_diem" :
                      item?.cost_code?.startsWith("B1")     ? "repair" :
                      item?.cost_code?.startsWith("F5")     ? "penalty" :
                      p.category,
                    unit: item?.unit || p.unit,
                  }));
                }}
                className="h-9 text-[12px] w-full"
              />
            </div>

            {/* Row 2: Amount block. Gross / Net / VAT% / VAT amount auto-derive each other. */}
            <div>
              <label className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                Amount &amp; VAT
              </label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-1">
                <div className="col-span-1">
                  <input type="number" step="0.01" required placeholder="Gross *"
                    value={form.amount}
                    onChange={e => setVatField({ amount: e.target.value })}
                    className="w-full h-9 px-2 rounded-md border border-border/50 bg-background text-[12px] font-semibold tabular-nums" />
                  <span className="text-[9px] text-muted-foreground/70 ml-1">incl. VAT</span>
                </div>
                <div className="col-span-1">
                  <select value={form.currency}
                    onChange={e => setForm({ ...form, currency: e.target.value })}
                    className="w-full h-9 px-2 rounded-md border border-border/50 bg-background text-[12px] font-medium">
                    <option>EUR</option><option>RON</option><option>USD</option>
                    <option>GBP</option><option>HUF</option><option>PLN</option>
                    <option>CHF</option><option>CZK</option><option>BGN</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <input type="number" step="0.01" placeholder="VAT %"
                    value={form.tax_rate}
                    onChange={e => setVatField({ tax_rate: e.target.value })}
                    className="w-full h-9 px-2 rounded-md border border-border/50 bg-background text-[12px] tabular-nums" />
                  <span className="text-[9px] text-muted-foreground/70 ml-1">e.g. 19, 21</span>
                </div>
                <div className="col-span-1">
                  <input type="number" step="0.01" placeholder="VAT amount"
                    value={form.tax_amount}
                    onChange={e => setVatField({ tax_amount: e.target.value })}
                    className="w-full h-9 px-2 rounded-md border border-border/50 bg-background text-[12px] tabular-nums" />
                </div>
                <div className="col-span-1">
                  <input type="number" step="0.01" placeholder="Net (excl. VAT)"
                    value={form.amount_excl_vat}
                    onChange={e => setVatField({ amount_excl_vat: e.target.value })}
                    className="w-full h-9 px-2 rounded-md border border-border/50 bg-background text-[12px] tabular-nums" />
                </div>
              </div>
              {eurPreview && (
                <div className="mt-1.5 text-[10px] text-muted-foreground flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80 font-mono tabular-nums">
                    1 {form.currency} = {eurPreview.rate.toFixed(4)} EUR (BNR today)
                  </span>
                  <span className="text-foreground/80 tabular-nums font-medium">
                    {'\u2248'} {eurPreview.eur.toFixed(2)} EUR
                  </span>
                  <span className="text-muted-foreground/60">— ledger uses BNR rate of receipt date</span>
                </div>
              )}
            </div>

            {/* Row 3: When + where */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">When</label>
                <input type="datetime-local" value={form.occurred_at}
                  onChange={e => setForm({ ...form, occurred_at: e.target.value })}
                  className="w-full h-8 px-2 rounded-md border border-border/50 bg-background text-[11px]" />
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">Country</label>
                <input placeholder="DE / AT / HU" value={form.country}
                  onChange={e => setForm({ ...form, country: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2}
                  className="w-full h-8 px-2 rounded-md border border-border/50 bg-background text-[11px] uppercase tabular-nums" />
              </div>
              <div className="col-span-2">
                <label className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">Vendor</label>
                <input placeholder="OMV, Shell, MyToll, etc." value={form.vendor}
                  onChange={e => setForm({ ...form, vendor: e.target.value })}
                  className="w-full h-8 px-2 rounded-md border border-border/50 bg-background text-[11px]" />
              </div>
            </div>

            {/* Row 4: Order link + qty/unit */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="md:col-span-2">
                <label className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">Allocate to order</label>
                <select value={form.order_id} onChange={e => setForm({ ...form, order_id: e.target.value })}
                  className="w-full h-8 px-2 rounded-md border border-border/50 bg-background text-[11px]">
                  <option value="">No specific order (allocate at trip level)</option>
                  {linkedOrders.map((o: any) => (
                    <option key={o.id} value={o.id}>{o.reference_number}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">Quantity</label>
                <input type="number" step="0.01" placeholder="e.g. liters"
                  value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
                  className="w-full h-8 px-2 rounded-md border border-border/50 bg-background text-[11px] tabular-nums" />
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">Unit</label>
                <input placeholder="L, kg, h, km" value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                  className="w-full h-8 px-2 rounded-md border border-border/50 bg-background text-[11px]" />
              </div>
            </div>

            {/* Row 5: Description + receipt URL */}
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Description / notes"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="h-8 px-2 rounded-md border border-border/50 bg-background text-[11px]" />
              <input placeholder="Receipt URL (optional)" value={form.receipt_url}
                onChange={e => setForm({ ...form, receipt_url: e.target.value })}
                className="h-8 px-2 rounded-md border border-border/50 bg-background text-[11px]" />
            </div>

            {/* Row 6: Optional GPS */}
            <details className="text-[10px]">
              <summary className="cursor-pointer text-muted-foreground/70 hover:text-foreground select-none">
                Location coordinates (optional)
              </summary>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <input placeholder="Location label" value={form.location_label}
                  onChange={e => setForm({ ...form, location_label: e.target.value })}
                  className="h-8 px-2 rounded-md border border-border/50 bg-background text-[11px]" />
                <input type="number" step="0.0001" placeholder="Latitude" value={form.latitude}
                  onChange={e => setForm({ ...form, latitude: e.target.value })}
                  className="h-8 px-2 rounded-md border border-border/50 bg-background text-[11px] tabular-nums" />
                <input type="number" step="0.0001" placeholder="Longitude" value={form.longitude}
                  onChange={e => setForm({ ...form, longitude: e.target.value })}
                  className="h-8 px-2 rounded-md border border-border/50 bg-background text-[11px] tabular-nums" />
              </div>
            </details>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
              <button type="button" onClick={cancelForm} className="px-3 py-1.5 rounded-md text-[11px] text-muted-foreground hover:bg-muted">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90">
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                {editingId ? "Update Expense" : "Save Expense"}
              </button>
            </div>
          </form>
        )}

        {/* ── List ── */}
        {loading ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground p-4">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading expenses...
          </div>
        ) : visible.length === 0 ? (
          <div className="text-[11px] text-muted-foreground p-6 rounded-md bg-muted/20 border border-border/40 text-center">
            <Upload className="h-5 w-5 mx-auto mb-2 text-muted-foreground/50" />
            No expenses yet. Drop a receipt above or add one manually.
          </div>
        ) : (
          <div className="rounded-lg border border-border/40 overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-2 py-1.5 font-semibold">Date</th>
                  <th className="px-2 py-1.5 font-semibold">Category</th>
                  <th className="px-2 py-1.5 font-semibold">Vendor / Description</th>
                  <th className="px-2 py-1.5 font-semibold">Location</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Amount</th>
                  <th className="px-2 py-1.5 font-semibold">Status</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(e => {
                  const C = CATEGORIES.find(c => c.id === e.category);
                  const Icon = C?.icon ?? Receipt;
                  const tone =
                    e.status === "approved" ? "bg-emerald-500/10 text-emerald-300" :
                    e.status === "pending_review" ? "bg-amber-500/15 text-amber-300" :
                    e.status === "rejected" ? "bg-red-500/15 text-red-300 line-through" :
                    "bg-muted text-muted-foreground";
                  return (
                    <tr key={e.id} className="border-t border-border/30 hover:bg-muted/20">
                      <td className="px-2 py-1.5 tabular-nums whitespace-nowrap text-muted-foreground">
                        {new Date(e.occurred_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        <span className="text-muted-foreground/60 ml-1">
                          {new Date(e.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <Icon className={`h-3 w-3 ${C?.tone}`} />
                          {e.cost_catalog?.cost_code ? (
                            <>
                              <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-mono font-semibold tabular-nums">
                                {e.cost_catalog.cost_code}
                              </span>
                              <span className="text-muted-foreground truncate max-w-[180px]">
                                {e.cost_catalog.cost_line}
                              </span>
                            </>
                          ) : (
                            <span className="font-medium">{C?.label ?? e.category}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-col leading-tight">
                          <span className="font-medium">{e.vendor || "-"}</span>
                          {e.description && (
                            <span className="text-muted-foreground truncate max-w-[260px]">
                              {e.description}
                              {e.quantity && e.unit && (
                                <span className="text-muted-foreground/60"> {' \u00B7 '} {e.quantity} {e.unit}</span>
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          {(e.latitude && e.longitude) || e.location_label ? (
                            <>
                              <MapPin className="h-3 w-3" />
                              <span className="truncate max-w-[140px]">
                                {e.location_label || `${e.latitude?.toFixed(3)}, ${e.longitude?.toFixed(3)}`}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground/50">{e.country || "-"}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        <div className="font-semibold">
                          {Number(e.amount).toFixed(2)} <span className="text-muted-foreground/70 text-[10px]">{e.currency}</span>
                        </div>
                        {e.amount_eur != null && e.currency !== "EUR" ? (
                          <div className="text-[9px] text-muted-foreground/70 leading-tight">
                            ≈ {Number(e.amount_eur).toFixed(2)} EUR
                          </div>
                        ) : null}
                        {e.tax_amount != null && Number(e.tax_amount) > 0 ? (
                          <div className="text-[9px] text-amber-500/80 leading-tight">
                            VAT {Number(e.tax_amount).toFixed(2)} {e.currency}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${tone}`}>{e.status.replace("_", " ")}</span>
                        {e.source === "ai" && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] text-primary">
                            <Sparkles className="h-2.5 w-2.5" />AI
                            {e.extraction_confidence != null && (
                              <span className="text-muted-foreground/60">{Math.round(e.extraction_confidence)}%</span>
                            )}
                          </span>
                        )}
                        {e.source === "driver" && <span className="ml-1 text-[9px] text-muted-foreground">{' \u00B7 '}driver</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          {e.receipt_url && (
                            <a href={e.receipt_url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-muted text-muted-foreground" title="View receipt">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          <button
                            onClick={() => editRow(e)}
                            className={`p-1 rounded hover:bg-muted ${editingId === e.id ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
                            title="Edit expense"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          {e.status === "pending_review" && (
                            <>
                              <button onClick={() => patch(e.id, { status: "approved" })} className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400" title="Approve">
                                <Check className="h-3 w-3" />
                              </button>
                              <button onClick={() => { const r = window.prompt("Rejection reason?"); if (r) patch(e.id, { status: "rejected", rejected_reason: r }); }} className="p-1 rounded hover:bg-red-500/20 text-red-400" title="Reject">
                                <X className="h-3 w-3" />
                              </button>
                            </>
                          )}
                          <button onClick={() => remove(e.id)} className="p-1 rounded hover:bg-red-500/20 text-red-400" title="Delete">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
