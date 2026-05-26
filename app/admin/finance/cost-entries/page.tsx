"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
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
  Eye,
  Link as LinkIcon,
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
  /** When the row was created from another table (e.g. trip_expenses), this names it. */
  external_source: string | null;
  /** Total fuel volume in litres for fuel entries; populated by the trip_expenses sync. */
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
  
  // Form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<CostEntry | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Reference data
  const [costCatalog, setCostCatalog] = useState<CostCatalogItem[]>([]);
  const [vehicles, setVehicles] = useState<{ id: string; plate_number: string }[]>([]);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  
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
  }, [adminSession?.id, currentPage, statusFilter, dateFrom, dateTo]);

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
    if (dateFrom) {
      query = query.gte("entry_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("entry_date", dateTo);
    }
    if (searchQuery) {
      query = query.or(`description.ilike.%${searchQuery}%,invoice_number.ilike.%${searchQuery}%,cost_code.ilike.%${searchQuery}%`);
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
  }, [adminSession?.id, currentPage, statusFilter, dateFrom, dateTo, searchQuery]);

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
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
              </SelectContent>
            </Select>
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
        </CardContent>
      </Card>

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
                    <TableRow key={entry.id}>
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
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
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
    </div>
  );
}
