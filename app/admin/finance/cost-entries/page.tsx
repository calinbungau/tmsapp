"use client";

import React, { useEffect, useState, useMemo, useCallback, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Pencil,
  Trash2,
  Receipt,
  Calendar,
  Truck,
  User,
  Building2,
  FileText,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  Link as LinkIcon,
  MapPin,
  Clock,
  Hash,
  Coins,
  Fuel,
  ExternalLink,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface CostEntry {
  id: string;
  entry_date: string;
  cost_code: string;
  cost_catalog_id: string;
  cost_catalog: {
    code: string;
    name: string;
    group_code: string;
    group_name: string;
    category_code: string;
    category_name: string;
  } | null;
  description: string | null;
  net_amount: number;
  vat_rate: number | null;
  vat_amount: number | null;
  gross_amount: number;
  currency: string;
  quantity: number | null;
  unit_price: number | null;
  unit: string | null;
  vehicle_id: string | null;
  vehicle: { id: string; plate_number: string } | null;
  driver_id: string | null;
  driver: { id: string; name: string } | null;
  trip_id: string | null;
  trip: { id: string; reference_number: string } | null;
  order_id: string | null;
  order: { id: string; reference_number: string } | null;
  supplier_id: string | null;
  supplier: { id: string; name: string } | null;
  invoice_number: string | null;
  invoice_date: string | null;
  receipt_url: string | null;
  status: string;
  source: string;
  /** When the row was migrated from the legacy trip_expenses table, this names it. */
  external_source: string | null;
  /** Total fuel volume in litres for fuel entries; populated on driver/admin trip-expense ingest. */
  liters_qty: number | null;
  /** Generic quantity (e.g. parcare hours, AdBlue litres). */
  units_qty: number | null;
  notes: string | null;
  created_at: string;
}

interface CostCatalogItem {
  id: string;
  code: string;
  name: string;
  group_code: string;
  group_name: string;
  category_code: string;
  category_name: string;
  default_vat_rate: number | null;
  unit: string | null;
}

const PAGE_SIZE = 25;

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  rejected: "bg-red-500/20 text-red-400 border-red-500/40",
  posted: "bg-blue-500/20 text-blue-400 border-blue-500/40",
};

export default function CostEntriesPage() {
  const { session: adminSession } = useAdminSession();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // New filters: provider (Shell/AGES/DKV…), vehicle, driver, trailer,
  // counterparty (business partner / merchant), cost code.
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [trailerFilter, setTrailerFilter] = useState<string>("all");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [costCodeFilter, setCostCodeFilter] = useState<string>("all");
  
  // Form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<CostEntry | null>(null);
  const [saving, setSaving] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Detail (read-only) view
  const [detailEntry, setDetailEntry] = useState<CostEntry | null>(null);

  // Import history dialog (cost_provider_imports)
  const [historyOpen, setHistoryOpen] = useState(false);
  
  // Reference data
  const [costCatalog, setCostCatalog] = useState<CostCatalogItem[]>([]);
  const [vehicles, setVehicles] = useState<{ id: string; plate_number: string }[]>([]);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [trailers, setTrailers] = useState<{ id: string; plate_number: string }[]>([]);
  const [providers, setProviders] = useState<
    { id: string; name: string; code: string | null; last_import_at: string | null; last_import_status: string | null }[]
  >([]);
  
  const { toast } = useToast();

  // Form data
  const [formData, setFormData] = useState({
    entry_date: new Date().toISOString().split("T")[0],
    cost_catalog_id: "",
    description: "",
    net_amount: "",
    vat_rate: "",
    gross_amount: "",
    currency: "EUR",
    quantity: "",
    unit_price: "",
    vehicle_id: "",
    driver_id: "",
    supplier_id: "",
    invoice_number: "",
    invoice_date: "",
    notes: "",
    status: "pending_review",
  });

  // Fetch reference data
  useEffect(() => {
    if (!adminSession?.id) return;
    fetchReferenceData();
  }, [adminSession?.id]);

  // Fetch entries when filters change
  useEffect(() => {
    if (!adminSession?.id) return;
    fetchEntries();
  }, [
    adminSession?.id,
    currentPage,
    statusFilter,
    dateFrom,
    dateTo,
    providerFilter,
    vehicleFilter,
    driverFilter,
    trailerFilter,
    partnerFilter,
    costCodeFilter,
  ]);

  const fetchReferenceData = async () => {
    if (!adminSession?.id) return;
    const supabase = createClient();

    // Fetch cost catalog (manual entries only)
    const { data: catalogData, error: catalogErr } = await supabase
      .from("cost_catalog")
      .select("id, cost_code, cost_line, description, unit, manual_allowed")
      .or(`admin_id.eq.${adminSession.id},is_system.eq.true`)
      .eq("is_active", true)
      .or("manual_allowed.eq.true,manual_allowed.is.null")
      .order("cost_code");
    if (catalogErr) console.log("[v0] cost_catalog fetch error:", catalogErr.message);
    if (catalogData) {
      // Map to legacy shape used by UI
      setCostCatalog(
        catalogData.map((c: any) => ({
          id: c.id,
          code: c.cost_code,
          name: c.cost_line,
          group_code: "",
          group_name: "",
          category_code: "",
          category_name: "",
          default_vat_rate: null,
          unit: c.unit,
        })),
      );
    }

    // Fetch vehicles
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select("id, plate_number")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("plate_number");
    if (vehiclesData) setVehicles(vehiclesData);

    // Fetch drivers
    const { data: driversData } = await supabase
      .from("drivers")
      .select("id, name")
      .eq("admin_id", adminSession.id)
      .order("name");
    if (driversData) setDrivers(driversData);

    // Fetch suppliers
    const { data: suppliersData } = await supabase
      .from("business_partners")
      .select("id, name")
      .eq("admin_id", adminSession.id)
      .in("partner_type", ["supplier", "both"])
      .order("name");
    if (suppliersData) setSuppliers(suppliersData);

    // Fetch trailers
    const { data: trailersData } = await supabase
      .from("trailers")
      .select("id, plate_number")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("plate_number");
    if (trailersData) setTrailers(trailersData);

    // Fetch cost providers (Shell / AGES / DKV / …) so we can filter by
    // the supplier file the cost was imported from. Also surfaces
    // "last imported at / status" so the user knows the freshness of
    // each provider's data without leaving the page.
    const { data: providersData } = await supabase
      .from("cost_providers")
      .select("id, name, code, last_import_at, last_import_status")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("name");
    if (providersData) setProviders(providersData);
  };

  const fetchEntries = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);

    const supabase = createClient();
    let query = supabase
      .from("cost_entries")
      .select(`
        *,
        cost_catalog:cost_catalog(id, cost_code, cost_line, description),
        vehicle:vehicles(id, plate_number),
        driver:drivers(id, name),
        trip:trips(id, reference_number),
        cost_provider:cost_providers(id, name, code)
      `, { count: "exact" })
      .eq("admin_id", adminSession.id)
      .order("entry_date", { ascending: false });

    // Filters
    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (providerFilter !== "all") {
      query = query.eq("provider_id", providerFilter);
    }
    if (vehicleFilter !== "all") {
      query = query.eq("vehicle_id", vehicleFilter);
    }
    if (driverFilter !== "all") {
      query = query.eq("driver_id", driverFilter);
    }
    if (trailerFilter !== "all") {
      query = query.eq("trailer_id", trailerFilter);
    }
    if (partnerFilter !== "all") {
      query = query.eq("vendor_id", partnerFilter);
    }
    if (costCodeFilter !== "all") {
      query = query.eq("cost_code", costCodeFilter);
    }
    if (dateFrom) {
      query = query.gte("entry_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("entry_date", dateTo);
    }
    if (searchQuery) {
      query = query.or(
        `description.ilike.%${searchQuery}%,invoice_number.ilike.%${searchQuery}%,cost_code.ilike.%${searchQuery}%,location_label.ilike.%${searchQuery}%,vendor_name.ilike.%${searchQuery}%,external_id.ilike.%${searchQuery}%`,
      );
    }

    // Pagination
    const from = (currentPage - 1) * PAGE_SIZE;
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, error, count } = await query;

    if (error) {
      console.log("[v0] cost_entries query error:", error.message, error.details, error.hint);
    }
    if (data) {
      // Map ledger schema to legacy CostEntry shape used by the UI
      const mapped = (data as any[]).map((e) => ({
        ...e,
        net_amount: e.amount_excl_vat ?? e.amount ?? 0,
        gross_amount: e.amount_incl_vat ?? e.amount ?? 0,
        vat_rate: e.tax_rate ?? null,
        invoice_number: e.invoice_number ?? null,
        supplier_id: e.vendor_id ?? null,
        // Prefer the cost provider (Shell, AGES, DKV, ...) over the merchant
        // vendor name (Toll4Europe G…/Shell CZ…) — those merchant strings come
        // from the supplier file and belong in `vendor_name`, not the
        // Supplier column. Falls back to vendor_name for legacy/manual rows.
        supplier: e.cost_provider
          ? { id: e.cost_provider.id, name: e.cost_provider.name }
          : e.vendor_name
            ? { id: e.vendor_id ?? "", name: e.vendor_name }
            : null,
        cost_catalog: e.cost_catalog
          ? {
              code: e.cost_catalog.cost_code,
              name: e.cost_catalog.cost_line,
              group_code: "",
              group_name: "",
              category_code: "",
              category_name: "",
            }
          : e.cost_code
            ? {
                code: e.cost_code,
                name: e.category || e.cost_code,
                group_code: "",
                group_name: "",
                category_code: "",
                category_name: "",
              }
            : null,
      }));
      setEntries(mapped as any);
      setTotalCount(count || 0);
    }

    setLoading(false);
  }, [
    adminSession?.id,
    currentPage,
    statusFilter,
    dateFrom,
    dateTo,
    searchQuery,
    providerFilter,
    vehicleFilter,
    driverFilter,
    trailerFilter,
    partnerFilter,
    costCodeFilter,
  ]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (adminSession?.id) {
        setCurrentPage(1);
        fetchEntries();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const openDialog = (entry?: CostEntry) => {
    if (entry) {
      setEditEntry(entry);
      setFormData({
        entry_date: entry.entry_date,
        cost_catalog_id: entry.cost_catalog_id || "",
        description: entry.description || "",
        net_amount: entry.net_amount?.toString() || "",
        vat_rate: entry.vat_rate?.toString() || "",
        gross_amount: entry.gross_amount?.toString() || "",
        currency: entry.currency || "EUR",
        quantity: entry.quantity?.toString() || "",
        unit_price: entry.unit_price?.toString() || "",
        vehicle_id: entry.vehicle_id || "",
        driver_id: entry.driver_id || "",
        supplier_id: entry.supplier_id || "",
        invoice_number: entry.invoice_number || "",
        invoice_date: entry.invoice_date || "",
        notes: entry.notes || "",
        status: entry.status || "pending_review",
      });
    } else {
      setEditEntry(null);
      setFormData({
        entry_date: new Date().toISOString().split("T")[0],
        cost_catalog_id: "",
        description: "",
        net_amount: "",
        vat_rate: "",
        gross_amount: "",
        currency: "EUR",
        quantity: "",
        unit_price: "",
        vehicle_id: "",
        driver_id: "",
        supplier_id: "",
        invoice_number: "",
        invoice_date: "",
        notes: "",
        status: "pending_review",
      });
    }
    setDialogOpen(true);
  };

  const handleCostCodeChange = (catalogId: string) => {
    const item = costCatalog.find((c) => c.id === catalogId);
    setFormData((prev) => ({
      ...prev,
      cost_catalog_id: catalogId,
      vat_rate: item?.default_vat_rate?.toString() || prev.vat_rate,
    }));
  };

  const calculateGross = () => {
    const net = parseFloat(formData.net_amount) || 0;
    const vat = parseFloat(formData.vat_rate) || 0;
    const gross = net * (1 + vat / 100);
    setFormData((prev) => ({ ...prev, gross_amount: gross.toFixed(2) }));
  };

  const handleSave = async () => {
    if (!adminSession?.id) return;
    if (!formData.cost_catalog_id || !formData.net_amount) {
      toast({
        title: "Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const selectedCatalog = costCatalog.find((c) => c.id === formData.cost_catalog_id);
    const net = parseFloat(formData.net_amount) || 0;
    const vat = parseFloat(formData.vat_rate) || 0;
    const vatAmount = net * (vat / 100);
    const gross = net + vatAmount;

    const payload = {
      admin_id: adminSession.id,
      entry_date: formData.entry_date,
      occurred_at: new Date(formData.entry_date).toISOString(),
      posting_date: formData.entry_date,
      cost_code: selectedCatalog?.code || "",
      cost_catalog_id: formData.cost_catalog_id,
      category: selectedCatalog?.name || null,
      description: formData.description || null,
      amount: net,
      amount_excl_vat: net,
      amount_incl_vat: gross,
      tax_rate: vat || null,
      tax_amount: vatAmount || null,
      currency: formData.currency,
      amount_eur: formData.currency === "EUR" ? net : null,
      units_qty: formData.quantity ? parseFloat(formData.quantity) : null,
      vehicle_id: formData.vehicle_id || null,
      driver_id: formData.driver_id || null,
      vendor_id: formData.supplier_id || null,
      invoice_number: formData.invoice_number || null,
      notes: formData.notes || null,
      status: formData.status,
      source: "manual",
      recorded_by: adminSession.id,
    };

    let error;
    if (editEntry) {
      const { error: err } = await supabase
        .from("cost_entries")
        .update(payload)
        .eq("id", editEntry.id)
        .eq("admin_id", adminSession.id);
      error = err;
    } else {
      const { error: err } = await supabase.from("cost_entries").insert(payload);
      error = err;
    }

    setSaving(false);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: editEntry ? "Updated" : "Created",
        description: "Cost entry has been saved.",
      });
      setDialogOpen(false);
      fetchEntries();
    }
  };

  const handleDelete = async (entry: CostEntry) => {
    if (!adminSession?.id) return;
    if (!confirm("Delete this cost entry?")) return;

    const supabase = createClient();
    const { error } = await supabase
      .from("cost_entries")
      .delete()
      .eq("id", entry.id)
      .eq("admin_id", adminSession.id);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Deleted",
        description: "Cost entry has been deleted.",
      });
      fetchEntries();
    }
  };

  const handleBulkDelete = async () => {
    if (!adminSession?.id) return;
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Delete ${selectedIds.size} cost ${selectedIds.size === 1 ? "entry" : "entries"}? This cannot be undone.`,
      )
    )
      return;

    setBulkDeleting(true);
    const supabase = createClient();
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from("cost_entries")
      .delete()
      .eq("admin_id", adminSession.id)
      .in("id", ids);

    setBulkDeleting(false);

    if (error) {
      toast({
        title: "Bulk delete failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Deleted",
        description: `${ids.length} ${ids.length === 1 ? "entry" : "entries"} removed.`,
      });
      setSelectedIds(new Set());
      fetchEntries();
    }
  };

  // Clear stale selection any time the visible page changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    currentPage,
    statusFilter,
    dateFrom,
    dateTo,
    searchQuery,
    providerFilter,
    vehicleFilter,
    driverFilter,
    trailerFilter,
    partnerFilter,
    costCodeFilter,
  ]);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelectedIds((prev) => {
      const allOnPageSelected = entries.length > 0 && entries.every((e) => prev.has(e.id));
      if (allOnPageSelected) {
        const next = new Set(prev);
        for (const e of entries) next.delete(e.id);
        return next;
      }
      const next = new Set(prev);
      for (const e of entries) next.add(e.id);
      return next;
    });
  };

  const handleStatusChange = async (entry: CostEntry, newStatus: string) => {
    if (!adminSession?.id) return;

    const supabase = createClient();
    const { error } = await supabase
      .from("cost_entries")
      .update({ status: newStatus })
      .eq("id", entry.id)
      .eq("admin_id", adminSession.id);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Status Updated",
        description: `Entry status changed to ${newStatus.replace("_", " ")}.`,
      });
      fetchEntries();
    }
  };

  const formatCurrency = (amount: number, currency = "EUR") => {
    return new Intl.NumberFormat("en-EU", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Stats
  const stats = useMemo(() => {
    const pending = entries.filter((e) => e.status === "pending_review").length;
    const totalNet = entries.reduce((sum, e) => sum + (Number(e.net_amount) || 0), 0);
    return { pending, totalNet };
  }, [entries]);

  if (loading && entries.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            Cost Entries
          </h1>
          <p className="text-sm text-muted-foreground">
            {totalCount} entries • {stats.pending > 0 && `${stats.pending} pending review`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            <Clock className="h-4 w-4 mr-2" />
            Import history
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => openDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search description, invoice, code, station, transaction id…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[140px]"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[140px]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending_review">Pending review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
              </SelectContent>
            </Select>

            {/* All non-trivial filters are searchable comboboxes so the
                user can type to filter — e.g. type a plate fragment to
                find a vehicle or trailer, or part of a driver name. The
                first option in each list ("All …") clears that filter. */}
            <SearchableSelect
              className="w-[220px]"
              value={providerFilter}
              onValueChange={setProviderFilter}
              placeholder="All suppliers"
              searchPlaceholder="Search supplier…"
              options={[
                { value: "all", label: "All suppliers" },
                ...providers.map((p) => ({
                  value: p.id,
                  label: p.name,
                  sublabel: p.last_import_at
                    ? `Last import ${new Date(p.last_import_at).toLocaleDateString("en-GB")}${
                        p.last_import_status ? ` · ${p.last_import_status}` : ""
                      }`
                    : "Never imported",
                })),
              ]}
            />

            <SearchableSelect
              className="w-[170px]"
              value={vehicleFilter}
              onValueChange={setVehicleFilter}
              placeholder="All vehicles"
              searchPlaceholder="Search plate…"
              options={[
                { value: "all", label: "All vehicles" },
                ...vehicles.map((v) => ({ value: v.id, label: v.plate_number })),
              ]}
            />

            <SearchableSelect
              className="w-[170px]"
              value={trailerFilter}
              onValueChange={setTrailerFilter}
              placeholder="All trailers"
              searchPlaceholder="Search plate…"
              options={[
                { value: "all", label: "All trailers" },
                ...trailers.map((t) => ({ value: t.id, label: t.plate_number })),
              ]}
            />

            <SearchableSelect
              className="w-[180px]"
              value={driverFilter}
              onValueChange={setDriverFilter}
              placeholder="All drivers"
              searchPlaceholder="Search driver…"
              options={[
                { value: "all", label: "All drivers" },
                ...drivers.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />

            <SearchableSelect
              className="w-[200px]"
              value={partnerFilter}
              onValueChange={setPartnerFilter}
              placeholder="All counterparties"
              searchPlaceholder="Search counterparty…"
              options={[
                { value: "all", label: "All counterparties" },
                ...suppliers.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />

            <SearchableSelect
              className="w-[220px]"
              value={costCodeFilter}
              onValueChange={setCostCodeFilter}
              placeholder="All cost codes"
              searchPlaceholder="Search code or name…"
              options={[
                { value: "all", label: "All cost codes" },
                ...costCatalog.map((c) => ({
                  value: c.code,
                  label: `${c.code} — ${c.name}`,
                })),
              ]}
            />

            {(providerFilter !== "all" ||
              vehicleFilter !== "all" ||
              driverFilter !== "all" ||
              trailerFilter !== "all" ||
              partnerFilter !== "all" ||
              costCodeFilter !== "all" ||
              statusFilter !== "all" ||
              dateFrom ||
              dateTo ||
              searchQuery) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setProviderFilter("all");
                  setVehicleFilter("all");
                  setDriverFilter("all");
                  setTrailerFilter("all");
                  setPartnerFilter("all");
                  setCostCodeFilter("all");
                  setStatusFilter("all");
                  setDateFrom("");
                  setDateTo("");
                  setSearchQuery("");
                }}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear filters
              </Button>
            )}
          </div>

          {/* Per-provider freshness panel: tells the user when each
              cost provider's data was last imported, so they know
              whether to re-upload a file. */}
          {providers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">
                Last imports:
              </span>
              {providers.map((p) => {
                const ok = p.last_import_status === "completed" || p.last_import_status === "ok";
                const tone = !p.last_import_at
                  ? "border-muted-foreground/30 text-muted-foreground"
                  : ok
                    ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                    : "border-amber-500/40 text-amber-300 bg-amber-500/10";
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProviderFilter(p.id)}
                    className={`text-[11px] px-2 py-0.5 rounded-md border ${tone} hover:opacity-80 transition`}
                    title={
                      p.last_import_at
                        ? `Last import ${new Date(p.last_import_at).toLocaleString("en-GB")}${
                            p.last_import_status ? ` (${p.last_import_status})` : ""
                          }`
                        : "Never imported"
                    }
                  >
                    {p.name}
                    <span className="ml-1.5 tabular-nums opacity-80">
                      {p.last_import_at
                        ? new Date(p.last_import_at).toLocaleDateString("en-GB")
                        : "never"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk action bar — visible when rows are selected */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-md border border-amber-500/40 bg-amber-500/10">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-amber-500/50 text-amber-300 bg-amber-500/15">
              {selectedIds.size} selected
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="h-7 px-2 text-xs"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="h-8"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            {bulkDeleting ? "Deleting…" : `Delete ${selectedIds.size}`}
          </Button>
        </div>
      )}

      {/* Entries Table */}
      <Card>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="p-12 text-center">
              <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Cost Entries</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start tracking your fleet costs by adding your first entry.
              </p>
              <Button onClick={() => openDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Entry
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={
                          entries.length > 0 && entries.every((e) => selectedIds.has(e.id))
                        }
                        onCheckedChange={togglePage}
                        aria-label="Select all on page"
                      />
                    </TableHead>
                    <TableHead className="w-[100px]">Date</TableHead>
                    <TableHead className="w-[100px]">Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[100px]">Vehicle</TableHead>
                    <TableHead className="w-[100px]">Supplier</TableHead>
                    <TableHead className="w-[120px] text-right">Amount</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow
                      key={entry.id}
                      data-state={selectedIds.has(entry.id) ? "selected" : undefined}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={(e) => {
                        // Don't open detail when interacting with the
                        // checkbox cell, the actions menu, or any link.
                        const target = e.target as HTMLElement;
                        if (target.closest("[data-row-stop]")) return;
                        setDetailEntry(entry);
                      }}
                    >
                      <TableCell
                        className="align-middle"
                        data-row-stop=""
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedIds.has(entry.id)}
                          onCheckedChange={() => toggleRow(entry.id)}
                          aria-label="Select row"
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(entry.entry_date).toLocaleDateString("en-GB")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {entry.cost_code}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm">
                            {entry.cost_catalog?.name || entry.description || "-"}
                          </span>
                          {/* Fuel & qty sub-line — show "21.80 L" for liters, otherwise just the unit. */}
                          {(entry.liters_qty || entry.units_qty) && (
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {entry.liters_qty
                                ? `${Number(entry.liters_qty).toFixed(2)} L`
                                : `${Number(entry.units_qty).toFixed(2)}${entry.unit ? ` ${entry.unit}` : ""}`}
                              {/* If we have both qty and EUR, show implied unit price (helps spot OCR mistakes). */}
                              {entry.amount_eur != null && (entry.liters_qty || entry.units_qty)
                                ? ` · ${formatCurrency(
                                    Number(entry.amount_eur) /
                                      Number(entry.liters_qty || entry.units_qty),
                                    "EUR",
                                  )}/${entry.liters_qty ? "L" : entry.unit || "u"}`
                                : ""}
                            </span>
                          )}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {entry.invoice_number && (
                              <span className="text-[10px] text-muted-foreground">
                                Invoice: {entry.invoice_number}
                              </span>
                            )}
                            {entry.external_source === "trip_expenses" && entry.trip && (
                              <Link
                                href={`/admin/tms/trips/${entry.trip.id}/edit`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
                                title="Open the originating trip"
                              >
                                <Truck className="h-2.5 w-2.5" />
                                {entry.trip.reference_number}
                              </Link>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.vehicle?.plate_number || "-"}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[100px]">
                        {entry.supplier?.name || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        <div>{formatCurrency(entry.gross_amount, entry.currency)}</div>
                        {entry.currency !== "EUR" && entry.amount_eur != null && (
                          <div className="text-[10px] font-normal text-muted-foreground tabular-nums">
                            {"\u2248 "}{formatCurrency(entry.amount_eur, "EUR")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={STATUS_COLORS[entry.status] || ""}
                        >
                          {entry.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell data-row-stop="" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailEntry(entry)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openDialog(entry)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {entry.status === "pending_review" && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleStatusChange(entry, "approved")}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleStatusChange(entry, "rejected")}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Reject
                                </DropdownMenuItem>
                              </>
                            )}
                            {entry.trip_id && (
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/tms/trips/${entry.trip_id}/edit`}>
                                  <LinkIcon className="h-4 w-4 mr-2" />
                                  View Trip
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDelete(entry)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1} to{" "}
                    {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editEntry ? "Edit Cost Entry" : "Add Cost Entry"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="entry_date">Date *</Label>
              <Input
                id="entry_date"
                type="date"
                value={formData.entry_date}
                onChange={(e) =>
                  setFormData({ ...formData, entry_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost_catalog_id">Cost Code *</Label>
              <Select
                value={formData.cost_catalog_id}
                onValueChange={handleCostCodeChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select cost code" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {costCatalog.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <span className="font-mono text-xs mr-2">{item.code}</span>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Optional description..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="net_amount">Net Amount *</Label>
              <Input
                id="net_amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.net_amount}
                onChange={(e) =>
                  setFormData({ ...formData, net_amount: e.target.value })
                }
                onBlur={calculateGross}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vat_rate">VAT Rate (%)</Label>
              <Input
                id="vat_rate"
                type="number"
                step="0.1"
                placeholder="0"
                value={formData.vat_rate}
                onChange={(e) =>
                  setFormData({ ...formData, vat_rate: e.target.value })
                }
                onBlur={calculateGross}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gross_amount">Gross Amount</Label>
              <Input
                id="gross_amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.gross_amount}
                onChange={(e) =>
                  setFormData({ ...formData, gross_amount: e.target.value })
                }
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(v) => setFormData({ ...formData, currency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="HUF">HUF</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="RON">RON</SelectItem>
                  <SelectItem value="PLN">PLN</SelectItem>
                  <SelectItem value="CZK">CZK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                placeholder="e.g., 120 liters"
                value={formData.quantity}
                onChange={(e) =>
                  setFormData({ ...formData, quantity: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit_price">Unit Price</Label>
              <Input
                id="unit_price"
                type="number"
                step="0.01"
                placeholder="Price per unit"
                value={formData.unit_price}
                onChange={(e) =>
                  setFormData({ ...formData, unit_price: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle_id">Vehicle</Label>
              <Select
                value={formData.vehicle_id || "none"}
                onValueChange={(v) =>
                  setFormData({ ...formData, vehicle_id: v === "none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver_id">Driver</Label>
              <Select
                value={formData.driver_id || "none"}
                onValueChange={(v) =>
                  setFormData({ ...formData, driver_id: v === "none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier_id">Supplier</Label>
              <Select
                value={formData.supplier_id || "none"}
                onValueChange={(v) =>
                  setFormData({ ...formData, supplier_id: v === "none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice_number">Invoice Number</Label>
              <Input
                id="invoice_number"
                placeholder="e.g., INV-2024-001"
                value={formData.invoice_number}
                onChange={(e) =>
                  setFormData({ ...formData, invoice_number: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice_date">Invoice Date</Label>
              <Input
                id="invoice_date"
                type="date"
                value={formData.invoice_date}
                onChange={(e) =>
                  setFormData({ ...formData, invoice_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData({ ...formData, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="posted">Posted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes..."
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editEntry ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail (read-only) view */}
      <CostEntryDetailDialog
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
        onEdit={(e) => {
          setDetailEntry(null);
          openDialog(e);
        }}
      />

      {/* Import history (cost_provider_imports) */}
      <ImportHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        adminId={adminSession?.id}
      />
    </div>
  );
}

// =====================================================================
// Detail dialog: read-only view exposing every field on a cost entry,
// including time, address, lat/lon, invoice + transaction id, receipt,
// merchant, raw extracted_data, etc.
// =====================================================================

interface DetailDialogProps {
  entry: (CostEntry & Record<string, any>) | null;
  onClose: () => void;
  onEdit: (entry: CostEntry) => void;
}

function CostEntryDetailDialog({ entry, onClose, onEdit }: DetailDialogProps) {
  if (!entry) return null;

  const e = entry as any;

  const fmtMoney = (v: any, ccy: string | null | undefined) => {
    if (v == null || v === "") return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    try {
      return new Intl.NumberFormat("en-EU", {
        style: "currency",
        currency: ccy || "EUR",
        minimumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${ccy || ""}`;
    }
  };
  const fmtNum = (v: any, suffix = "") => {
    if (v == null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return `${n.toLocaleString("en-EU", { maximumFractionDigits: 3 })}${suffix}`;
  };
  const fmtDate = (v: any) => {
    if (!v) return "—";
    try {
      return new Date(v).toLocaleDateString("en-GB");
    } catch {
      return String(v);
    }
  };
  const fmtDateTime = (v: any) => {
    if (!v) return "—";
    try {
      const d = new Date(v);
      return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    } catch {
      return String(v);
    }
  };

  const lat = e.latitude != null ? Number(e.latitude) : null;
  const lon = e.longitude != null ? Number(e.longitude) : null;
  const hasCoords = lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon);

  const receiptUrl: string | null =
    e.receipt_url || e.receipt_path || e.attachment_url || e.invoice_url || null;
  const extracted = e.extracted_data && typeof e.extracted_data === "object" ? e.extracted_data : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!max-w-[1100px] w-[92vw] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            <span>Cost entry</span>
            {e.cost_code && (
              <Badge variant="outline" className="font-mono text-[11px]">
                {e.cost_code}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={STATUS_COLORS[e.status] || ""}
            >
              {String(e.status || "").replace("_", " ")}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Headline summary */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <SummaryStat
            label="Gross"
            value={fmtMoney(e.amount_incl_vat ?? e.amount, e.currency)}
            sub={
              e.currency && e.currency !== "EUR" && e.amount_eur != null
                ? `≈ ${fmtMoney(e.amount_eur, "EUR")}`
                : undefined
            }
          />
          <SummaryStat label="Net" value={fmtMoney(e.amount_excl_vat, e.currency)} />
          <SummaryStat
            label="VAT"
            value={fmtMoney(e.tax_amount, e.currency)}
            sub={e.tax_rate != null ? `${Number(e.tax_rate).toFixed(2)}%` : undefined}
          />
        </div>

        <Separator className="my-3" />

        {/* When */}
        <DetailSection title="When" icon={<Clock className="h-3.5 w-3.5" />}>
          <DetailRow label="Date" value={fmtDate(e.entry_date)} />
          <DetailRow label="Time / Occurred at" value={fmtDateTime(e.occurred_at)} />
          <DetailRow label="Posting date" value={fmtDate(e.posting_date)} />
          {extracted?.posted_at && (
            <DetailRow label="Posted at" value={fmtDateTime(extracted.posted_at)} />
          )}
          <DetailRow label="Recorded" value={fmtDateTime(e.created_at)} />
        </DetailSection>

        {/* Where */}
        <DetailSection title="Where" icon={<MapPin className="h-3.5 w-3.5" />}>
          <DetailRow label="Country" value={e.country_code || "—"} mono />
          <DetailRow label="Station / Location" value={e.location_label || "—"} />
          <DetailRow label="Geocoded address" value={e.geocoded_address || "—"} wrap />
          <DetailRow
            label="Coordinates"
            value={
              hasCoords ? (
                <a
                  className="inline-flex items-center gap-1 text-primary hover:underline tabular-nums"
                  href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {lat!.toFixed(5)}, {lon!.toFixed(5)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                "—"
              )
            }
          />
        </DetailSection>

        {/* Identification */}
        <DetailSection title="Identification" icon={<Hash className="h-3.5 w-3.5" />}>
          <DetailRow label="Invoice number" value={e.invoice_number || "—"} mono />
          <DetailRow label="Transaction ID" value={e.external_id || "—"} mono wrap />
          <DetailRow label="External source" value={e.external_source || "—"} mono />
          <DetailRow label="Source" value={e.source || "—"} mono />
          <DetailRow label="Entry ID" value={e.id} mono wrap />
        </DetailSection>

        {/* Allocation */}
        <DetailSection title="Allocation" icon={<Truck className="h-3.5 w-3.5" />}>
          <DetailRow
            label="Cost code"
            value={
              e.cost_catalog?.name
                ? `${e.cost_code} — ${e.cost_catalog.name}`
                : e.cost_code || "—"
            }
          />
          <DetailRow label="Vehicle" value={e.vehicle?.plate_number || "—"} mono />
          <DetailRow label="Driver" value={e.driver?.name || "—"} />
          <DetailRow
            label="Trip"
            value={
              e.trip ? (
                <Link
                  href={`/admin/tms/trips/${e.trip.id}/edit`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {e.trip.reference_number}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                "—"
              )
            }
          />
        </DetailSection>

        {/* Money */}
        <DetailSection title="Amounts" icon={<Coins className="h-3.5 w-3.5" />}>
          <DetailRow label="Currency" value={e.currency || "—"} mono />
          <DetailRow label="Amount" value={fmtMoney(e.amount, e.currency)} />
          <DetailRow label="Amount (excl. VAT)" value={fmtMoney(e.amount_excl_vat, e.currency)} />
          <DetailRow label="Amount (incl. VAT)" value={fmtMoney(e.amount_incl_vat, e.currency)} />
          <DetailRow label="Tax rate" value={e.tax_rate != null ? `${Number(e.tax_rate).toFixed(2)}%` : "—"} />
          <DetailRow label="Tax amount" value={fmtMoney(e.tax_amount, e.currency)} />
          <DetailRow label="EUR equivalent" value={fmtMoney(e.amount_eur, "EUR")} />
        </DetailSection>

        {/* Quantities */}
        {(e.liters_qty || e.kwh_qty || e.km_qty || e.units_qty) && (
          <DetailSection title="Quantities" icon={<Fuel className="h-3.5 w-3.5" />}>
            <DetailRow label="Liters" value={fmtNum(e.liters_qty, " L") || "—"} />
            <DetailRow label="kWh" value={fmtNum(e.kwh_qty, " kWh") || "—"} />
            <DetailRow label="Kilometers" value={fmtNum(e.km_qty, " km") || "—"} />
            <DetailRow label="Units" value={fmtNum(e.units_qty) || "—"} />
          </DetailSection>
        )}

        {/* Counterparty */}
        <DetailSection title="Counterparty" icon={<Building2 className="h-3.5 w-3.5" />}>
          <DetailRow label="Supplier (provider)" value={e.cost_provider?.name || "—"} />
          <DetailRow label="Merchant on receipt" value={e.vendor_name || "—"} />
        </DetailSection>

        {/* Notes / description */}
        {(e.description || e.notes) && (
          <DetailSection title="Notes" icon={<FileText className="h-3.5 w-3.5" />}>
            {e.description && <DetailRow label="Description" value={e.description} wrap />}
            {e.notes && <DetailRow label="Notes" value={e.notes} wrap />}
          </DetailSection>
        )}

        {/* Receipt */}
        {receiptUrl && (
          <DetailSection title="Receipt" icon={<Receipt className="h-3.5 w-3.5" />}>
            <a
              href={receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open receipt
            </a>
          </DetailSection>
        )}

        {/* Raw extracted data */}
        {extracted && (
          <DetailSection title="Raw supplier data" icon={<FileText className="h-3.5 w-3.5" />}>
            <pre className="text-[11px] leading-snug bg-muted/40 rounded-md p-3 overflow-x-auto max-h-64">
              {JSON.stringify(extracted, null, 2)}
            </pre>
          </DetailSection>
        )}

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => onEdit(entry)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {icon}
        {title}
      </h4>
      <div className="rounded-md border divide-y">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-1.5 text-sm">
      <div className="w-44 shrink-0 text-xs text-muted-foreground pt-0.5">{label}</div>
      <div
        className={`flex-1 min-w-0 ${mono ? "font-mono text-[12px]" : ""} ${
          wrap ? "break-words whitespace-pre-wrap" : "truncate"
        }`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

// =====================================================================
// Import history: lists every supplier file that was uploaded, with
// who ran it, when, status, row counts, totals and any error log.
// Backed by cost_provider_imports (already populated by the import
// commit route).
// =====================================================================

interface ImportRun {
  id: string;
  provider_id: string | null;
  file_name: string | null;
  file_url: string | null;
  file_size_bytes: number | null;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_rows: number | null;
  imported_count: number | null;
  skipped_count: number | null;
  duplicate_count: number | null;
  error_count: number | null;
  total_amount: number | null;
  total_amount_eur: number | null;
  period_from: string | null;
  period_to: string | null;
  notes: string | null;
  error_log: any;
  unmapped_rows: any;
  cost_provider: { id: string; name: string; code: string | null } | null;
}

function ImportHistoryDialog({
  open,
  onOpenChange,
  adminId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  adminId: string | undefined;
}) {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !adminId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("cost_provider_imports")
        .select(
          `
          id, provider_id, file_name, file_url, file_size_bytes, status,
          started_at, completed_at, total_rows, imported_count, skipped_count,
          duplicate_count, error_count, total_amount, total_amount_eur,
          period_from, period_to, notes, error_log, unmapped_rows,
          cost_provider:cost_providers(id, name, code)
          `,
        )
        .eq("admin_id", adminId)
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (cancelled) return;
      if (!error && data) setRuns(data as unknown as ImportRun[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, adminId]);

  const providers = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const r of runs) {
      if (r.cost_provider) map.set(r.cost_provider.id, { id: r.cost_provider.id, name: r.cost_provider.name });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [runs]);

  const filtered = useMemo(
    () => (providerFilter === "all" ? runs : runs.filter((r) => r.provider_id === providerFilter)),
    [runs, providerFilter],
  );

  const fmtDateTime = (v: string | null) => {
    if (!v) return "—";
    try {
      const d = new Date(v);
      return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } catch {
      return v;
    }
  };
  const fmtSize = (n: number | null) => {
    if (!n) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };
  const fmtMoney = (v: number | null, ccy = "EUR") => {
    if (v == null) return "—";
    try {
      return new Intl.NumberFormat("en-EU", {
        style: "currency",
        currency: ccy,
        minimumFractionDigits: 2,
      }).format(Number(v));
    } catch {
      return `${v}`;
    }
  };

  const statusBadge = (status: string | null) => {
    const s = (status || "").toLowerCase();
    let cls = "border-muted-foreground/30 text-muted-foreground";
    if (s === "completed" || s === "ok" || s === "success") {
      cls = "border-emerald-500/40 text-emerald-300 bg-emerald-500/10";
    } else if (s === "failed" || s === "error") {
      cls = "border-red-500/40 text-red-300 bg-red-500/10";
    } else if (s === "partial" || s === "warning") {
      cls = "border-amber-500/40 text-amber-300 bg-amber-500/10";
    } else if (s === "running" || s === "processing" || s === "pending") {
      cls = "border-sky-500/40 text-sky-300 bg-sky-500/10";
    }
    return (
      <Badge variant="outline" className={cls}>
        {status || "—"}
      </Badge>
    );
  };

  const errorList = (run: ImportRun): string[] => {
    const out: string[] = [];
    const e = run.error_log;
    if (Array.isArray(e)) {
      for (const item of e) {
        if (typeof item === "string") out.push(item);
        else if (item && typeof item === "object") {
          out.push(item.message || item.error || JSON.stringify(item));
        }
      }
    } else if (e && typeof e === "object") {
      if (Array.isArray(e.errors)) {
        for (const item of e.errors) out.push(typeof item === "string" ? item : JSON.stringify(item));
      } else {
        out.push(JSON.stringify(e));
      }
    } else if (typeof e === "string") {
      out.push(e);
    }
    return out;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Import history
            <span className="text-xs font-normal text-muted-foreground">
              {runs.length} run{runs.length === 1 ? "" : "s"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">Provider:</span>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="h-8 w-[220px]">
              <SelectValue placeholder="All providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No imports yet. When you upload a supplier file from a Cost Provider, it will show up here.
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">When</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="text-right w-[90px]">Rows</TableHead>
                  <TableHead className="text-right w-[90px]">Inserted</TableHead>
                  <TableHead className="text-right w-[90px]">Skipped</TableHead>
                  <TableHead className="text-right w-[90px]">Duplicates</TableHead>
                  <TableHead className="text-right w-[80px]">Errors</TableHead>
                  <TableHead className="text-right w-[120px]">Total (EUR)</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((run) => {
                  const isOpen = expandedId === run.id;
                  const errors = errorList(run);
                  return (
                    <Fragment key={run.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/40"
                        data-state={isOpen ? "selected" : undefined}
                        onClick={() => setExpandedId(isOpen ? null : run.id)}
                      >
                        <TableCell className="text-xs tabular-nums whitespace-nowrap">
                          {fmtDateTime(run.started_at)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {run.cost_provider?.name || (
                            <span className="text-muted-foreground italic">unknown</span>
                          )}
                          {run.cost_provider?.code && (
                            <span className="ml-1 text-[10px] font-mono text-muted-foreground">
                              {run.cost_provider.code}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="block truncate max-w-[260px]" title={run.file_name || ""}>
                            {run.file_name || "—"}
                          </span>
                          {run.file_size_bytes != null && (
                            <span className="text-[10px] text-muted-foreground">
                              {fmtSize(run.file_size_bytes)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{statusBadge(run.status)}</TableCell>
                        <TableCell className="text-right tabular-nums">{run.total_rows ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-300">
                          {run.imported_count ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {run.skipped_count ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {run.duplicate_count ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {run.error_count ? (
                            <span className="text-red-300">{run.error_count}</span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtMoney(run.total_amount_eur, "EUR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <ChevronDown
                            className={`h-4 w-4 inline-block transition ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={11} className="p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              <DetailKV label="Started" value={fmtDateTime(run.started_at)} />
                              <DetailKV label="Completed" value={fmtDateTime(run.completed_at)} />
                              <DetailKV
                                label="Period"
                                value={
                                  run.period_from || run.period_to
                                    ? `${run.period_from || "?"} → ${run.period_to || "?"}`
                                    : "—"
                                }
                              />
                              <DetailKV
                                label="Total amount"
                                value={fmtMoney(run.total_amount, "EUR")}
                              />
                              {run.file_url && (
                                <DetailKV
                                  label="Source file"
                                  value={
                                    <a
                                      href={run.file_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-primary inline-flex items-center gap-1 hover:underline"
                                    >
                                      Download
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  }
                                />
                              )}
                              {run.notes && (
                                <DetailKV label="Notes" value={run.notes} className="md:col-span-4" />
                              )}
                            </div>

                            {errors.length > 0 && (
                              <div className="mt-3">
                                <div className="text-[11px] uppercase tracking-wider text-red-300 mb-1">
                                  Errors
                                </div>
                                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto rounded-md border border-red-500/30 bg-red-500/5 p-2">
                                  {errors.slice(0, 50).map((e, i) => (
                                    <li key={i} className="text-red-200 break-words">
                                      • {e}
                                    </li>
                                  ))}
                                  {errors.length > 50 && (
                                    <li className="text-red-200/70 italic">
                                      …and {errors.length - 50} more
                                    </li>
                                  )}
                                </ul>
                              </div>
                            )}

                            {Array.isArray(run.unmapped_rows) && run.unmapped_rows.length > 0 && (
                              <div className="mt-3">
                                <div className="text-[11px] uppercase tracking-wider text-amber-300 mb-1">
                                  Unmapped rows ({run.unmapped_rows.length})
                                </div>
                                <pre className="text-[10px] leading-snug bg-muted/40 rounded-md p-2 overflow-x-auto max-h-40">
                                  {JSON.stringify(run.unmapped_rows.slice(0, 20), null, 2)}
                                </pre>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailKV({
  label,
  value,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs">{value}</div>
    </div>
  );
}
