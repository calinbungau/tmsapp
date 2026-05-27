"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal, flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DetermineCostDialog } from "@/components/tms/determine-cost-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  X, MapPin, Clock, Calendar, Package, Truck, User, ArrowRight,
  DollarSign, FileText, History, ChevronRight, Save, Plus, Trash2,
  Fuel, Sparkles, Route, Edit2, XCircle, ChevronDown, GripVertical,
  ArrowUp, ArrowDown,
  Phone, Layers, Maximize2, MessageSquare, Navigation,
  CheckCircle2, Circle, AlertTriangle, Timer, Copy, FileDown, Send,
  Upload, Download, File, Image as ImageIcon, Loader2, Eye, ZoomIn, ZoomOut,
  RotateCw, ChevronLeft, Receipt, CreditCard, Check, Ban, Mail, ExternalLink,
  Building2, AlertCircle, ChevronsUpDown, Container, Calculator,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import {
  PARENT_STATUSES,
  FORWARDER_STATUSES,
  INTERNAL_STATUSES,
  getStatusEntry,
  isActiveStatus,
  forwarderToInternal,
} from "@/lib/tms/status/registry";
import { recomputeParentStatus } from "@/lib/tms/status/recompute-parent";
import { LegStatusChip } from "@/components/tms/leg-status-chip";
import { nextStatuses as nextStatusesFor } from "@/lib/tms/status/transitions";
import { StatusGuide } from "@/components/tms/status-guide";
import dynamic from "next/dynamic";
import { OrderChat } from "@/components/chat/order-chat";
import { SendToCarrierDialog } from "@/components/tms/send-to-carrier-dialog";
import { SendDocsToCustomerDialog } from "@/components/tms/send-docs-to-customer-dialog";
import { ShareTrackingLinkDialog } from "@/components/tms/share-tracking-link-dialog";
import { TripLegAssignmentDialog } from "@/components/tms/trip-leg-assignment-dialog";
import { CarrierDocumentRequestCard } from "@/components/tms/carrier-document-request-card";

const RouteMap = dynamic(() => import("@/components/tms/route-map").then(m => ({ default: m.RouteMap })), { ssr: false });

// ---------- Types ----------
interface OrderStop {
  id: string; sequence_order: number; stop_type: string;
  company_name: string | null; address: string | null;
  city: string | null; country: string | null; postal_code: string | null;
  lat: number | null; lng: number | null;
  planned_date: string | null; planned_time_from: string | null; planned_time_to: string | null;
  actual_arrival: string | null; actual_departure: string | null;
  contact_name: string | null; contact_phone: string | null;
  reference_number: string | null; notes: string | null; status: string;
  origin: string | null; form_id: string | null;
}
interface ActivityEntry { id: string; action: string; details: any; performed_by_type: string; created_at: string; }
interface OrderInvoice {
  id: string; invoice_number: string; direction: 'outgoing' | 'incoming';
  amount: number; currency: string; tax_rate: number | null; total_with_tax: number | null;
  status: string; issue_date: string | null; due_date: string | null; paid_date: string | null;
  skonto_percentage: number | null; skonto_days: number | null; skonto_deadline: string | null;
  paid_amount: number | null; remaining_amount: number | null;
  file_url: string | null; external_invoice_number: string | null;
  accounting_system: string | null; accounting_sync_status: string | null;
  business_partner_id: string | null;
  smartbill_series: string | null; smartbill_number: string | null;
  }
interface InvoicePayment {
  id: string; invoice_id: string; amount: number; currency: string;
  payment_date: string; payment_method: string | null; reference: string | null;
  is_skonto: boolean; notes: string | null; created_at: string;
}
interface OrderExpense { id: string; expense_type: string; description: string | null; amount: number; currency: string; expense_date: string | null; receipt_url: string | null; approved: boolean; }
interface OrderDocument { id: string; document_type: string; name: string; file_url: string; created_at: string; mime_type?: string; uploaded_by_type?: string; uploaded_by_name?: string; }
interface StatusHistoryEntry { id: string; from_status: string | null; to_status: string; changed_by_type: string; changed_by: string | null; notes: string | null; created_at: string; }
interface FormSubmission { id: string; stop_id: string; form_name: string; submitted_by_name: string | null; submitted_at: string; data: Record<string, any>; }
interface TripStopExecution {
  id: string; trip_id: string; order_stop_id: string | null; sequence_order: number;
  stop_type: string; action_type_name: string | null; action_type_code: string | null;
  company_name: string | null; address: string | null; city: string | null; country: string | null;
  planned_date: string | null; planned_time_from: string | null; planned_time_to: string | null;
  status: string; actual_arrival: string | null; actual_departure: string | null;
  distance_to_km: number | null; duration_to_minutes: number | null;
  notes: string | null; trip_status: string; trip_ref: string | null;
}
interface TripLeg {
  id: string; trip_id: string; leg_number: number;
  assignment_type: "own_fleet" | "forwarding" | "undecided" | null;
  driver_id: string | null; vehicle_id: string | null; trailer_id: string | null;
  carrier_id: string | null; forwarding_order_id: string | null;
  from_stop_index: number | null; to_stop_index: number | null;
  status: string | null;
  subcontractor_vehicle_plate: string | null;
  subcontractor_trailer_plate: string | null;
  subcontractor_driver_name: string | null;
  subcontractor_driver_phone: string | null;
  // Joined data — `forwarding_order_id` is already declared above as a real
  // column on trip_legs; we only need the joined ref string here.
  driver_name?: string; vehicle_plate?: string; trailer_plate?: string;
  carrier_name?: string; forwarding_order_ref?: string;
  from_city?: string; to_city?: string;
}

// ---------- Status config (registry-backed) ----------
// Single source of truth lives in lib/tms/status/registry.ts. We expose a
// label/color/dot view over it so the existing render code keeps working.
const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = new Proxy({} as any, {
  get(_t, key: string) {
    const e = getStatusEntry(key);
    return { label: e.label, color: e.pillClass, dot: e.dotClass };
  },
  has() { return true; },
});

// Forwarding checklist items (7 items, post-delivery)
const FWD_CHECKLIST_ITEMS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "documents_pending", label: "Documents Pending (CMR/POD)", icon: <AlertTriangle className="h-3 w-3" /> },
  { key: "documents_received", label: "Documents Received (CMR/POD)", icon: <FileText className="h-3 w-3" /> },
  { key: "client_invoiced", label: "Invoiced to Client", icon: <DollarSign className="h-3 w-3" /> },
  { key: "docs_sent_to_client", label: "Documents Sent to Client", icon: <Send className="h-3 w-3" /> },
  { key: "carrier_payment_due", label: "Carrier Payment Due", icon: <DollarSign className="h-3 w-3" /> },
  { key: "carrier_paid", label: "Carrier Paid", icon: <CheckCircle2 className="h-3 w-3" /> },
  { key: "client_payment_received", label: "Client Payment Received", icon: <DollarSign className="h-3 w-3" /> },
];

const STOP_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  pickup: { label: "Loading", color: "bg-blue-500/10 text-blue-400" },
  delivery: { label: "Unloading", color: "bg-emerald-500/10 text-emerald-400" },
  customs: { label: "Customs", color: "bg-amber-500/10 text-amber-400" },
  fuel: { label: "Fuel", color: "bg-orange-500/10 text-orange-400" },
  rest: { label: "Rest", color: "bg-zinc-500/10 text-zinc-400" },
  border: { label: "Border", color: "bg-violet-500/10 text-violet-400" },
};

type TabKey = "overview" | "stops" | "documents" | "invoices" | "expenses" | "activity" | "chat" | "execution";

// Helper to get country code for flag URLs
const COUNTRY_CODES: Record<string, string> = {
  "Belgium": "be", "Germany": "de", "Austria": "at", "Hungary": "hu", "France": "fr",
  "Netherlands": "nl", "Poland": "pl", "Czech Republic": "cz", "Czechia": "cz",
  "Romania": "ro", "Bulgaria": "bg", "Italy": "it", "Spain": "es", "Portugal": "pt",
  "United Kingdom": "gb", "Ireland": "ie", "Denmark": "dk", "Sweden": "se", "Norway": "no",
  "Finland": "fi", "Switzerland": "ch", "Slovakia": "sk", "Slovenia": "si", "Croatia": "hr",
  "Serbia": "rs", "Greece": "gr", "Turkey": "tr", "Ukraine": "ua", "Moldova": "md",
  "Luxembourg": "lu", "Lithuania": "lt", "Latvia": "lv", "Estonia": "ee",
};
function getCountryCode(country?: string | null): string {
  if (!country) return "";
  if (country.length === 2) return country.toLowerCase();
  return COUNTRY_CODES[country] || country.substring(0, 2).toLowerCase();
}

interface Props { orderId: string; editTripId?: string; onClose: () => void; onStatusChange?: () => void; showBackButton?: boolean; }

// ─── Invoice Dialog Component ──────────────────────────────────────
function InvoiceDialog({ 
  isOpen, onClose, onSave, invoice, direction, order, payments, saving, adminId 
}: { 
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  invoice: OrderInvoice | null;
  direction: 'outgoing' | 'incoming';
  order: any;
  payments: InvoicePayment[];
  saving: boolean;
  adminId?: string;
}) {
  const supabase = createClient();
  const { toast } = useToast();
  
  // ── Order-level commercial snapshot ──
  // The "original" amount/currency the order was placed in. Used as
  // the BASIS for currency conversion when the user later picks a
  // different invoice currency (e.g. order priced in EUR, invoice
  // issued in RON via BNR rate). For outgoing invoices this is what
  // we agreed to charge the customer; for incoming it's what the
  // carrier agreed to charge us.
  const originalAmount = Number(
    direction === 'outgoing'
      ? order?.customer_price ?? 0
      : order?.carrier_cost ?? 0,
  );
  const originalCurrency: string =
    (direction === 'outgoing'
      ? order?.customer_currency
      : order?.carrier_currency) ||
    order?.currency ||
    'EUR';

  // Romanian colloquial currency label used inside the line
  // description ("EUR" is technically correct, but Romanian customers
  // expect to see "EURO" on the invoice line).
  const currencyLabel = (c: string) =>
    c === 'EUR' ? 'EURO' : c === 'USD' ? 'USD' : c === 'GBP' ? 'GBP' : c;

  // Format the tariff number compactly: integers as "1740", decimals
  // as "1740.50". Matches how Romanian accounting templates render
  // amounts on invoice line descriptions.
  const fmtTariff = (n: number) => {
    if (!Number.isFinite(n)) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  };

  const fmtBnrDate = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
  };

  // ── Line description builder ──
  // Builds the Romanian template the accounting team expects on every
  // outgoing invoice. The base form is:
  //   TRANSPORT MARFA CONFORM COMENZII {customer_reference} - LKW {veh}/{trl}
  // When the invoice is being issued in a currency that differs from
  // the order's original currency, we append the original tariff and
  // the BNR rate used for conversion:
  //   ... - TARIF 1740EURO + TVA
  //   (curs BNR 12.05.2026: 1 EUR = 4.9762 RON)
  // We use customer_reference (the order number the customer gave us,
  // e.g. "13/5427") rather than our internal reference_number
  // (INT-XXXX) because the invoice line is what the customer's
  // accounting team uses to reconcile the bill against their own
  // purchase order.
  const buildLineDescription = (opts?: {
    bnr?: { date: string; rate: number } | null;
    invoiceCurrency?: string;
  }): string => {
    if (!order) return '';
    const customerRef = (order?.customer_reference || '').toString().trim();
    const internalRef = order?.reference_number || '';
    const ref = customerRef || internalRef;
    const ownVehicle = Array.isArray(order?.vehicle) ? order.vehicle[0]?.plate_number : order?.vehicle?.plate_number;
    const ownTrailer = Array.isArray(order?.trailer) ? order.trailer[0]?.plate_number : order?.trailer?.plate_number;
    const plate = ownVehicle || order?.subcontractor_vehicle_plate || '';
    const trailer = ownTrailer || order?.subcontractor_trailer_plate || '';
    const lkwPart = [plate, trailer].filter(Boolean).join('/');

    let line = `TRANSPORT MARFA CONFORM COMENZII ${ref}`;
    if (lkwPart) line += ` - LKW ${lkwPart}`;

    const invCurrency = opts?.invoiceCurrency;
    const showTariff =
      opts?.bnr &&
      invCurrency &&
      invCurrency !== originalCurrency &&
      originalAmount > 0;

    if (showTariff && opts?.bnr) {
      line += ` - TARIF ${fmtTariff(originalAmount)}${currencyLabel(originalCurrency)} + TVA`;
      // BNR note on a second line — keeps the primary tariff line
      // scannable while still embedding the legally-required
      // conversion reference.
      line += `\n(curs BNR ${fmtBnrDate(opts.bnr.date)}: 1 ${originalCurrency} = ${opts.bnr.rate.toFixed(4)} RON)`;
    }
    return line;
  };

  // The auto-generated description as of the most recent successful
  // build. We compare against this when the user changes the currency
  // again so we don't clobber a hand-edited description silently — if
  // the textarea content === this snapshot, the user hasn't touched
  // it and we're safe to regenerate.
  const initialAutoDescription = buildLineDescription();

  // Conversion state — null when the invoice currency matches the
  // order's original currency (no conversion needed).
  const [bnrInfo, setBnrInfo] = useState<{
    date: string;
    rate: number;          // RON per 1 unit of originalCurrency
    fromCurrency: string;
    toCurrency: string;
  } | null>(null);
  const [conversionLoading, setConversionLoading] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  // Tracks the most recent auto-generated description so we can detect
  // user edits and avoid stomping them on currency change.
  const lastAutoDescriptionRef = useRef<string>(initialAutoDescription);

  // ── Default due date ──
  // Computed from the order's payment terms so the operator doesn't
  // have to remember each customer's net-X arrangement. Outgoing
  // invoices use `payment_terms_customer_days` (when we invoice the
  // customer); incoming invoices use `payment_terms_carrier_days`
  // (when the carrier invoices us). Falls back to net-30 if neither
  // is set — same as the previous hard-coded default. The base date
  // is the issue date (today), so the result is always
  // today + N days, formatted as YYYY-MM-DD for the <input type="date">
  // control.
  const _today = new Date();
  const _termsDays = direction === 'outgoing'
    ? (order?.payment_terms_customer_days ?? 30)
    : (order?.payment_terms_carrier_days ?? 30);
  const _defaultDueDate = new Date(_today.getTime() + _termsDays * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    invoice_number: invoice?.invoice_number || '',
    external_invoice_number: invoice?.external_invoice_number || '',
    amount: invoice?.amount || (direction === 'outgoing' ? order?.customer_price || 0 : order?.carrier_cost || 0),
    currency: invoice?.currency || order?.currency || 'EUR',
    tax_rate: invoice?.tax_rate ?? 21,
    tax_type: 'Normala' as string, // Smartbill tax type
    issue_date: invoice?.issue_date || new Date().toISOString().split('T')[0],
    due_date: invoice?.due_date || _defaultDueDate,
    skonto_percentage: invoice?.skonto_percentage || 0,
    skonto_days: invoice?.skonto_days || 0,
    business_partner_id: invoice?.business_partner_id || '',
    // Editable text that becomes the Smartbill product/article line.
    // Pre-filled with the Romanian template; the user can overwrite it
    // before clicking "Create in Smartbill". When the user later picks
    // a different currency, this text auto-updates to include the BNR
    // tariff suffix UNLESS the user has manually edited it.
    line_description: initialAutoDescription,
  });

  // ── Currency change handler ──
  // When the user picks a different currency for the invoice:
  //   - same as original → restore the original amount and drop the BNR suffix
  //   - different       → fetch BNR rates, convert, append BNR suffix
  // The line_description is only auto-rewritten if the user hasn't
  // manually edited it (compared against lastAutoDescriptionRef).
  const handleCurrencyChange = async (newCurrency: string) => {
    setConversionError(null);

    // Same currency — no conversion, just clear any BNR suffix.
    if (newCurrency === originalCurrency) {
      setBnrInfo(null);
      const nextDescription = buildLineDescription({ invoiceCurrency: newCurrency, bnr: null });
      setFormData(prev => {
        const userEdited = prev.line_description !== lastAutoDescriptionRef.current;
        const description = userEdited ? prev.line_description : nextDescription;
        lastAutoDescriptionRef.current = nextDescription;
        return {
          ...prev,
          currency: newCurrency,
          amount: originalAmount,
          line_description: description,
        };
      });
      return;
    }

    // Different currency — fetch BNR and convert. Optimistically apply
    // the currency change first so the UI feels responsive; we'll
    // update the amount once the rates come in.
    setFormData(prev => ({ ...prev, currency: newCurrency }));
    setConversionLoading(true);
    try {
      const res = await fetch('/api/bnr/rates');
      if (!res.ok) throw new Error(`BNR returned HTTP ${res.status}`);
      const data: { date: string; rates: Record<string, number> } = await res.json();
      const origRate = data.rates?.[originalCurrency];
      const targetRate = data.rates?.[newCurrency];
      if (!origRate || !targetRate) {
        throw new Error(`Missing BNR rate for ${!origRate ? originalCurrency : newCurrency}`);
      }
      // Convert via RON as the pivot currency. BNR rates are
      // RON-per-unit so:
      //   amount_in_RON     = origAmount * origRate
      //   amount_in_target  = amount_in_RON / targetRate
      const amountInRon = originalAmount * origRate;
      const convertedAmount = amountInRon / targetRate;
      const bnr = { date: data.date, rate: origRate };
      const nextDescription = buildLineDescription({ invoiceCurrency: newCurrency, bnr });

      setBnrInfo({
        date: data.date,
        rate: origRate,
        fromCurrency: originalCurrency,
        toCurrency: newCurrency,
      });

      setFormData(prev => {
        const userEdited = prev.line_description !== lastAutoDescriptionRef.current;
        const description = userEdited ? prev.line_description : nextDescription;
        lastAutoDescriptionRef.current = nextDescription;
        return {
          ...prev,
          currency: newCurrency,
          // Round to 2 decimals — standard invoice precision.
          amount: Math.round(convertedAmount * 100) / 100,
          line_description: description,
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch BNR rate';
      setConversionError(message);
      // The currency was already applied optimistically; we leave the
      // amount unchanged so the operator can correct it manually.
    } finally {
      setConversionLoading(false);
    }
  };

  // Tax types from Smartbill
  const taxTypes = [
    { name: 'Normala', percentage: 21, label: 'TVA 21% (Normal)' },
    { name: 'Redusa', percentage: 9, label: 'TVA 9% (Redus)' },
    { name: 'Redusa locuinte', percentage: 5, label: 'TVA 5% (Locuinte)' },
    { name: 'SDD', percentage: 0, label: 'SDD - Scutit cu drept de deducere' },
    { name: 'SFDD', percentage: 0, label: 'SFDD - Scutit fara drept de deducere' },
    { name: 'Taxare inversa', percentage: 0, label: 'Taxare inversa' },
    { name: 'TVA Inclus', percentage: 0, label: 'TVA Inclus in pret' },
  ];

  // Smartbill integration state
  const [smartbillEnabled, setSmartbillEnabled] = useState(false);
  const [smartbillIntegration, setSmartbillIntegration] = useState<any>(null);
  const [smartbillSeries, setSmartbillSeries] = useState<any[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<string>('');
  const [createInSmartbill, setCreateInSmartbill] = useState(false);
  const [creatingInSmartbill, setCreatingInSmartbill] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  
  // File upload state for incoming invoices
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(invoice?.file_url || null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Smartbill integration on mount
  useEffect(() => {
    if (isOpen && direction === 'outgoing' && adminId) {
      fetchSmartbillIntegration();
    }
  }, [isOpen, direction, adminId]);

  const fetchSmartbillIntegration = async () => {
    if (!adminId) return;
    
    // Get integration
    const { data: integration } = await supabase
      .from("billing_integrations")
      .select("*")
      .eq("admin_id", adminId)
      .eq("provider", "smartbill")
      .eq("is_active", true)
      .single();

    if (integration) {
      setSmartbillIntegration(integration);
      setSmartbillEnabled(true);
      setCreateInSmartbill(true); // Default to creating in Smartbill if enabled

      // Get series
      const { data: series } = await supabase
        .from("smartbill_series")
        .select("*")
        .eq("integration_id", integration.id)
        .eq("series_type", "invoice")
        .order("is_default", { ascending: false });

      if (series && series.length > 0) {
        setSmartbillSeries(series);
        const defaultSeries = series.find((s: any) => s.is_default) || series[0];
        setSelectedSeries(defaultSeries.series_name);
      }
    }
  };

  const handleCreateInSmartbill = async () => {
    if (!smartbillIntegration || !selectedSeries) {
      toast({ title: "Select a series first", variant: "destructive" });
      return;
    }

    setCreatingInSmartbill(true);
    try {
      const response = await fetch("/api/smartbill/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId: smartbillIntegration.id,
          orderId: order?.id,
          series: selectedSeries,
          invoiceData: {
            amount: formData.amount,
            currency: formData.currency,
            tax_rate: formData.tax_rate,
            tax_type: formData.tax_type,
            issue_date: formData.issue_date,
            due_date: formData.due_date,
            // User-editable article description. The API falls back to
            // a server-built template if this is empty.
            line_description: formData.line_description,
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: "Invoice created in Smartbill", description: `Invoice #${result.invoiceNumber}` });
        
        // Wait a moment for Smartbill to process the PDF (it may not be immediately available)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Show PDF preview inline - use rawNumber (just the number part, not with series prefix)
        const pdfUrl = `/api/smartbill/invoice?series=${encodeURIComponent(result.series || selectedSeries)}&number=${encodeURIComponent(result.rawNumber)}&integrationId=${encodeURIComponent(smartbillIntegration.id)}`;
        setPdfPreviewUrl(pdfUrl);
      } else {
        toast({ title: "Smartbill error", description: result.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Failed to create invoice", description: err.message, variant: "destructive" });
    } finally {
      setCreatingInSmartbill(false);
    }
  };

  const totalWithTax = formData.amount * (1 + (formData.tax_rate || 0) / 100);
  const skontoAmount = formData.skonto_percentage ? totalWithTax * (1 - formData.skonto_percentage / 100) : null;

  // Handle file selection for incoming invoices
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload a PDF or image file", variant: "destructive" });
      return;
    }
    
    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10MB", variant: "destructive" });
      return;
    }
    
    setUploadedFile(file);
    // Create a preview URL for the file
    setUploadedFileUrl(URL.createObjectURL(file));
  };

  const uploadFileToStorage = async (): Promise<string | null> => {
    if (!uploadedFile || !order?.id) return null;
    
    setUploadingFile(true);
    try {
      const fileName = `invoices/${order.id}/${Date.now()}-${uploadedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, uploadedFile);
      
      if (uploadError) throw uploadError;
      
      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (err: any) {
      toast({ title: "File upload failed", description: err.message, variant: "destructive" });
      return null;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSaveWithFile = async () => {
    console.log("[v0] handleSaveWithFile ENTER", {
      hasUploadedFile: !!uploadedFile,
      currentUploadedFileUrl: uploadedFileUrl,
      formDataSummary: {
        amount: formData.amount,
        currency: formData.currency,
        external_invoice_number: formData.external_invoice_number,
        issue_date: formData.issue_date,
        due_date: formData.due_date,
      },
    });
    let fileUrl = uploadedFileUrl;

    // If we have a new file selected, upload it first
    if (uploadedFile) {
      console.log("[v0] handleSaveWithFile uploading file to storage");
      const uploadedUrl = await uploadFileToStorage();
      console.log("[v0] handleSaveWithFile uploadFileToStorage result", { uploadedUrl });
      if (uploadedUrl) {
        fileUrl = uploadedUrl;
      }
    } else {
      console.log("[v0] handleSaveWithFile no file selected, skipping upload");
    }

    // Include file_url in the save data
    console.log("[v0] handleSaveWithFile calling onSave with payload", { ...formData, file_url: fileUrl });
    onSave({ ...formData, file_url: fileUrl });
  };

  if (!isOpen) return null;

  // If we have a PDF preview, show full-screen preview
  if (pdfPreviewUrl) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex flex-col bg-black/90">
        {/* Header */}
        <div className="bg-card border-b border-border/50 px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Invoice Preview</h3>
            <p className="text-xs text-muted-foreground">Smartbill Invoice</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => {
                const a = document.createElement('a');
                a.href = pdfPreviewUrl;
                a.download = `invoice.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => window.open(pdfPreviewUrl, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in Tab
            </Button>
            <button 
              onClick={() => { 
                setPdfPreviewUrl(null); 
                onSave({ _refreshOnly: true }); 
                onClose(); 
              }} 
              className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted/50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* PDF Embed */}
        <div className="flex-1 p-4 min-h-0">
          <iframe 
            src={pdfPreviewUrl} 
            className="w-full h-full min-h-[600px] rounded-lg border border-border/30 bg-white"
            title="Invoice PDF"
          />
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border/50 px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">
              {invoice ? 'Edit Invoice' : 'New Invoice'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {direction === 'outgoing' ? 'Invoice to Customer' : 'Invoice from Carrier'}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          {/* Invoice Number */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                {direction === 'outgoing' ? 'Invoice Number *' : 'Our Reference'}
              </label>
              <Input
                value={formData.invoice_number}
                onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                placeholder={direction === 'outgoing' ? 'INV-2026-0001' : 'Internal ref'}
                className="h-9 text-sm"
              />
            </div>
            {direction === 'incoming' && (
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Carrier Invoice # *</label>
                <Input
                  value={formData.external_invoice_number}
                  onChange={(e) => setFormData({ ...formData, external_invoice_number: e.target.value })}
                  placeholder="Carrier's invoice number"
                  className="h-9 text-sm"
                />
              </div>
            )}
          </div>

          {/* Line description — appears as the article/product name on
              the Smartbill invoice. Pre-filled with a Romanian template
              derived from the order; the operator can edit before
              sending so they're never stuck with a wrong text. */}
          {direction === 'outgoing' && (
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                Invoice Line Description
              </label>
              <Textarea
                value={formData.line_description}
                onChange={(e) => setFormData({ ...formData, line_description: e.target.value })}
                placeholder="TRANSPORT MARFA CONFORM COMENZII ... - LKW .../..."
                rows={2}
                className="text-sm resize-none"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                This text is sent to Smartbill as the article name.
              </p>
            </div>
          )}

          {/* Amount & Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Net Amount *</label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Currency</label>
              <Select value={formData.currency} onValueChange={handleCurrencyChange}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[10001]" position="popper" sideOffset={4}>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="RON">RON</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* BNR conversion status — only shown when the invoice
              currency differs from the order's original currency. Lets
              the operator double-check the rate before sending. */}
          {(conversionLoading || conversionError || bnrInfo) && (
            <div className="rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-[11px] leading-relaxed">
              {conversionLoading && (
                <span className="text-muted-foreground">Fetching BNR rate…</span>
              )}
              {conversionError && !conversionLoading && (
                <span className="text-red-400">
                  BNR rate unavailable: {conversionError}. Please set the amount manually.
                </span>
              )}
              {bnrInfo && !conversionLoading && !conversionError && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
                  <span>
                    Converted from{' '}
                    <span className="font-medium text-foreground">
                      {fmtTariff(originalAmount)} {originalCurrency}
                    </span>{' '}
                    using BNR rate of{' '}
                    <span className="font-medium text-foreground">{fmtBnrDate(bnrInfo.date)}</span>:
                  </span>
                  <span className="font-mono text-foreground">
                    1 {bnrInfo.fromCurrency} = {bnrInfo.rate.toFixed(4)} RON
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Tax Type (for Smartbill) */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">TVA / Tax Type</label>
            <Select 
              value={formData.tax_type} 
              onValueChange={(v) => {
                const selectedTax = taxTypes.find(t => t.name === v);
                setFormData({ 
                  ...formData, 
                  tax_type: v, 
                  tax_rate: selectedTax?.percentage ?? 0 
                });
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select tax type" />
              </SelectTrigger>
              <SelectContent className="z-[10001]" position="popper" sideOffset={4}>
                {taxTypes.map((tax) => (
                  <SelectItem key={tax.name} value={tax.name}>
                    {tax.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
          </div>

          {/* Total Preview */}
          <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total with VAT</span>
              <span className="font-semibold">{formData.currency} {totalWithTax.toFixed(2)}</span>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Issue Date *</label>
              <Input
                type="date"
                value={formData.issue_date}
                onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Due Date *</label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Skonto */}
          <div className="p-3 rounded-lg border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium">Skonto (Early Payment Discount)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Discount %</label>
                <Input
                  type="number"
                  step="0.5"
                  value={formData.skonto_percentage || ''}
                  onChange={(e) => setFormData({ ...formData, skonto_percentage: parseFloat(e.target.value) || 0 })}
                  placeholder="e.g. 2"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Within Days</label>
                <Input
                  type="number"
                  value={formData.skonto_days || ''}
                  onChange={(e) => setFormData({ ...formData, skonto_days: parseInt(e.target.value) || 0 })}
                  placeholder="e.g. 14"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            {skontoAmount && formData.skonto_days > 0 && (
              <p className="text-[10px] text-amber-400 mt-2">
                Pay {formData.currency} {skontoAmount.toFixed(2)} within {formData.skonto_days} days for {formData.skonto_percentage}% discount
              </p>
            )}
          </div>

          {/* File Upload (Incoming invoices only) */}
          {direction === 'incoming' && (
            <div className="p-3 rounded-lg border border-border/30">
              <div className="flex items-center gap-2 mb-3">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium">Invoice Document</span>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {uploadedFileUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/20 border border-border/30">
                    <File className="h-4 w-4 text-blue-400" />
                    <span className="text-xs flex-1 truncate">
                      {uploadedFile?.name || 'Invoice file attached'}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => window.open(uploadedFileUrl, '_blank')}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                      onClick={() => {
                        setUploadedFile(null);
                        setUploadedFileUrl(null);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace File
                  </Button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-border/50 rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Click to upload carrier invoice
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    PDF, JPG, PNG (max 10MB)
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Smartbill Integration (Outgoing invoices only) */}
          {direction === 'outgoing' && smartbillEnabled && (
            <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-6 w-6 rounded bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white">SB</div>
                <span className="text-xs font-medium">Smartbill Integration</span>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-blue-500/30 text-blue-400">Connected</Badge>
              </div>
              
              <div className="space-y-3">
                <div 
                  className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                    createInSmartbill ? 'bg-blue-500/10 border-blue-500/30' : 'border-border/30 hover:border-blue-500/30'
                  }`}
                  onClick={() => setCreateInSmartbill(!createInSmartbill)}
                >
                  <div className={`h-4 w-4 rounded border flex items-center justify-center ${
                    createInSmartbill ? 'bg-blue-500 border-blue-500' : 'border-border'
                  }`}>
                    {createInSmartbill && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <span className="text-xs">Create invoice in Smartbill</span>
                </div>

                {createInSmartbill && smartbillSeries.length > 0 && (
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Invoice Series</label>
                    <Select value={selectedSeries} onValueChange={setSelectedSeries}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select series" />
                      </SelectTrigger>
                      <SelectContent className="z-[10001]" position="popper" sideOffset={4}>
                        {smartbillSeries.map((s) => (
                          <SelectItem key={s.id} value={s.series_name}>
                            {s.series_name} {s.is_default && '(Default)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {createInSmartbill && smartbillSeries.length === 0 && (
                  <p className="text-[10px] text-amber-400">
                    No invoice series configured. Go to Settings → Integrations to fetch series from Smartbill.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Payment History (Edit mode only) */}
          {invoice && payments.length > 0 && (
            <div className="p-3 rounded-lg border border-border/30">
              <h4 className="text-xs font-medium mb-2">Payment History</h4>
              <div className="space-y-1.5">
                {payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {new Date(p.payment_date).toLocaleDateString()}
                      {p.is_skonto && <span className="text-amber-400 ml-1">(Skonto)</span>}
                    </span>
                    <span className="font-medium">{p.currency} {p.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border/50 px-4 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving || creatingInSmartbill}>Cancel</Button>
          
          {/* Show Smartbill button if creating in Smartbill, otherwise show regular save */}
          {direction === 'outgoing' && createInSmartbill && smartbillSeries.length > 0 ? (
            <Button 
              size="sm" 
              onClick={handleCreateInSmartbill} 
              disabled={creatingInSmartbill || !formData.amount || !selectedSeries}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700"
            >
              {creatingInSmartbill ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
                <div className="h-3.5 w-3.5 rounded bg-white/20 flex items-center justify-center text-[8px] font-bold">SB</div>
              )}
              Create in Smartbill
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                console.log("[v0] Create Invoice button clicked", {
                  direction,
                  isUpdate: !!invoice,
                  formData,
                  hasUploadedFile: !!uploadedFile,
                  uploadedFileName: uploadedFile?.name ?? null,
                  uploadedFileSize: uploadedFile?.size ?? null,
                  uploadedFileUrl,
                  disabled: saving || uploadingFile || !formData.amount || (direction === 'outgoing' && !formData.invoice_number),
                  saving,
                  uploadingFile,
                });
                try {
                  if (direction === 'incoming') {
                    console.log("[v0] Create Invoice → handleSaveWithFile path (incoming)");
                    handleSaveWithFile();
                  } else {
                    console.log("[v0] Create Invoice → onSave(formData) path (outgoing)");
                    onSave(formData);
                  }
                } catch (err) {
                  console.log("[v0] Create Invoice click threw synchronously:", err);
                }
              }}
              disabled={saving || uploadingFile || !formData.amount || (direction === 'outgoing' && !formData.invoice_number)}
              className="gap-1.5"
            >
              {(saving || uploadingFile) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {uploadingFile ? 'Uploading...' : invoice ? 'Update' : 'Create'} Invoice
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Payment Dialog Component ──────────────────────────────────────
function PaymentDialog({ 
  isOpen, onClose, onSave, invoice 
}: { 
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  invoice: OrderInvoice;
}) {
  const totalDue = invoice.total_with_tax || invoice.amount;
  const remaining = totalDue - (invoice.paid_amount || 0);
  const hasSkontoActive = invoice.skonto_deadline && new Date(invoice.skonto_deadline) >= new Date();
  const skontoAmount = hasSkontoActive && invoice.skonto_percentage 
    ? totalDue * (1 - invoice.skonto_percentage / 100) - (invoice.paid_amount || 0)
    : null;

  const [formData, setFormData] = useState({
    amount: remaining,
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    reference: '',
    is_skonto: false,
    notes: '',
  });

  // Update amount when skonto is toggled
  useEffect(() => {
    if (formData.is_skonto && skontoAmount) {
      setFormData(prev => ({ ...prev, amount: Math.max(0, skontoAmount) }));
    } else {
      setFormData(prev => ({ ...prev, amount: remaining }));
    }
  }, [formData.is_skonto]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="border-b border-border/50 px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Record Payment</h3>
            <p className="text-xs text-muted-foreground">{invoice.invoice_number}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          {/* Outstanding Amount */}
          <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Outstanding Amount</span>
              <span className="font-semibold">{invoice.currency} {remaining.toFixed(2)}</span>
            </div>
          </div>

          {/* Skonto Option */}
          {hasSkontoActive && skontoAmount && skontoAmount > 0 && (
            <div 
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                formData.is_skonto 
                  ? 'bg-amber-500/10 border-amber-500/30' 
                  : 'border-border/30 hover:border-amber-500/30'
              }`}
              onClick={() => setFormData({ ...formData, is_skonto: !formData.is_skonto })}
            >
              <div className="flex items-center gap-2">
                <div className={`h-4 w-4 rounded border flex items-center justify-center ${
                  formData.is_skonto ? 'bg-amber-500 border-amber-500' : 'border-border'
                }`}>
                  {formData.is_skonto && <Check className="h-3 w-3 text-black" />}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium">Apply Skonto ({invoice.skonto_percentage}%)</p>
                  <p className="text-[10px] text-muted-foreground">
                    Pay {invoice.currency} {skontoAmount.toFixed(2)} (valid until {new Date(invoice.skonto_deadline!).toLocaleDateString()})
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Payment Amount *</label>
            <Input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0, is_skonto: false })}
              className="h-9 text-sm"
            />
          </div>

          {/* Date & Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Payment Date *</label>
              <Input
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Method</label>
              <Select value={formData.payment_method} onValueChange={(v) => setFormData({ ...formData, payment_method: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[10001]" position="popper" sideOffset={4}>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Reference */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Reference / Transaction ID</label>
            <Input
              value={formData.reference}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              placeholder="Bank transaction reference"
              className="h-9 text-sm"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes"
              className="text-sm min-h-[60px]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/50 px-4 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => {
              console.log("[v0] Record Payment button clicked", {
                invoiceId: invoice?.id,
                invoiceNumber: invoice?.invoice_number,
                formData,
                disabled: !formData.amount || formData.amount <= 0,
              });
              try {
                onSave(formData);
                console.log("[v0] onSave invoked successfully");
              } catch (err) {
                console.log("[v0] onSave threw synchronously:", err);
              }
            }}
            disabled={!formData.amount || formData.amount <= 0}
            className="gap-1.5"
          >
            <CreditCard className="h-3.5 w-3.5" />
            Record Payment
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function OrderDetailPanel({ orderId, editTripId, onClose, onStatusChange, showBackButton }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();
  const [order, setOrder] = useState<any>(null);
  const [subcontracts, setSubcontracts] = useState<any[]>([]); // Child forwarding orders

  // For FWD orders only. Holds the linked parent-order trip-leg ID
  // (source of truth for vehicle/trailer/driver — read by the PDF
  // renderer via forwarding_order_legs) and, when present, the FWD's
  // own trip-leg ID (what the execution view of this FWD order shows).
  // Both are updated together in saveEdits when the user edits the
  // Vehicle/Trailer/Driver fields from this page.
  // A forwarding order can be backed by ONE parent trip-leg (the
  // classic carrier-subcontract created from a single leg, linked via
  // the `forwarding_order_legs` junction table) OR by MANY parent
  // legs (a consolidation FWD created from /tms/carriers/consolidation,
  // which links every leg directly through `trip_legs.forwarding_order_id`).
  // We store the full set so the fleet-fields save loop updates all
  // backing legs in lockstep.
  const [fwdParentLegIds, setFwdParentLegIds] = useState<string[]>([]);
  const [fwdOwnLegId, setFwdOwnLegId] = useState<string | null>(null);
  const [orderTrips, setOrderTrips] = useState<{ 
    id: string; reference_number: string; assignment_type: string; status: string; 
    driver: { id: string; name: string } | null; vehicle: { id: string; plate_number: string } | null; 
    carrier: { id: string; name: string } | null; forwarding_order_id: string | null; forwarding_order_ref: string | null;
    legs: { id: string; leg_number: number; assignment_type: string | null; driver_name: string | null; vehicle_plate: string | null; trailer_plate: string | null; carrier_name: string | null; status: string | null; from_stop_index: number | null; to_stop_index: number | null }[];
    trip_stops: { id: string; sequence_order: number; stop_type: string; company_name: string | null; city: string | null; country: string | null; lat: number | null; lng: number | null }[];
  }[]>([]);
  const [splitTripOpen, setSplitTripOpen] = useState(false);
  const [splitAtStopIndex, setSplitAtStopIndex] = useState<number | null>(null);
  const [splitTripType, setSplitTripType] = useState<"internal" | "forwarding">("internal");
  const [creatingSplit, setCreatingSplit] = useState(false);
  const [addingNewSwapStop, setAddingNewSwapStop] = useState(false);
  const [newSwapStop, setNewSwapStop] = useState({ city: "", country: "", address: "", company_name: "", lat: 0, lng: 0, planned_date: "" });
  const [splitInsertAfterIndex, setSplitInsertAfterIndex] = useState<number>(0); // Insert after which stop
  const [swapLocationSearch, setSwapLocationSearch] = useState("");
  const [swapLocationResults, setSwapLocationResults] = useState<any[]>([]);
  const [searchingSwapLocation, setSearchingSwapLocation] = useState(false);
  
  // Assignment search filters
  const [driverSearch, setDriverSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [trailerSearch, setTrailerSearch] = useState("");
  const [carrierSearch, setCarrierSearch] = useState("");
  
  // Commercial section search
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchValue, setCustomerSearchValue] = useState("");
  const [carrierSearchOpen, setCarrierSearchOpen] = useState(false);
  const [carrierSearchValue, setCarrierSearchValue] = useState("");
  const [carrierPopoverOpen, setCarrierPopoverOpen] = useState(false);
  const [stops, setStops] = useState<OrderStop[]>([]);
  const [invoices, setInvoices] = useState<OrderInvoice[]>([]);
  const [expenses, setExpenses] = useState<OrderExpense[]>([]);
  const [documents, setDocuments] = useState<OrderDocument[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);
  const [formSubmissions, setFormSubmissions] = useState<FormSubmission[]>([]);
  const [tripStopsExec, setTripStopsExec] = useState<TripStopExecution[]>([]);
  const [editingTrip, setEditingTrip] = useState<any>(null);
  const [editingStops, setEditingStops] = useState<any[]>([]);
  const [editingTripLegs, setEditingTripLegs] = useState<TripLeg[]>([]);
  const [editingLeg, setEditingLeg] = useState<TripLeg | null>(null);
  const [legDialogOpen, setLegDialogOpen] = useState(false);
  // For filtering map to show only selected leg's stops/route (null = show all)
  const [selectedMapLegIndex, setSelectedMapLegIndex] = useState<number | null>(null);
  const [editingRoute, setEditingRoute] = useState<{ geometry: [number, number][] | null; distance_km: number; duration_hours: number }>({ geometry: null, distance_km: 0, duration_hours: 0 });
  const [savingTrip, setSavingTrip] = useState(false);
  const [loading, setLoading] = useState(true);
  // Initial tab resolution order: ?tab=<key> > editTripId implies execution > overview.
  // This lets "Create & Proceed to Execution" on the New Order page deep-link
  // straight into the Execution tab via `/admin/tms/orders/<id>?tab=execution`.
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams?.get("tab") as TabKey | null;
  const VALID_TABS: TabKey[] = ["overview", "stops", "documents", "invoices", "expenses", "activity", "chat", "execution"];
  const initialTab: TabKey = tabFromUrl && VALID_TABS.includes(tabFromUrl)
    ? tabFromUrl
    : (editTripId ? "execution" : "overview");
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Editable state
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  // Determine-Cost dialog: opened via the "Determine cost" pill above the
  // Carrier Cost field. Persists a full breakdown (unit, distance, pricing
  // rule, extras) to `carrier_cost_calculations` and writes the resulting
  // total back into editData.carrier_cost so the user only has to click Save.
  const [determineCostOpen, setDetermineCostOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Stops editing state
  const [editingStopsMode, setEditingStopsMode] = useState(false);
  const [editableStops, setEditableStops] = useState<OrderStop[]>([]);
  const [savingStops, setSavingStops] = useState(false);
  // Index of the stop currently being dragged; null when not dragging.
  // Used to render the visual placeholder and to know the source index
  // on drop. We use plain HTML5 drag-and-drop (no extra library) so the
  // dependency footprint stays the same.
  const [draggedStopIndex, setDraggedStopIndex] = useState<number | null>(null);
  const [dragOverStopIndex, setDragOverStopIndex] = useState<number | null>(null);

  // Reference data for dropdowns
  const [partners, setPartners] = useState<{ id: string; name: string; types?: string[] }[]>([]);
  const [driversList, setDriversList] = useState<{ id: string; name: string }[]>([]);
  const [vehiclesList, setVehiclesList] = useState<{ id: string; plate_number: string }[]>([]);
  const [trailersList, setTrailersList] = useState<{ id: string; plate_number: string }[]>([]);

  // ETA state
  const [eta, setEta] = useState<{ minutes: number; distance: number; toStopName: string } | null>(null);
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);
  const [driverSpeed, setDriverSpeed] = useState<number | null>(null);
  const [showSendDialog, setShowSendDialog] = useState(false);
  // Controls the "Send Documents to Customer" dialog. Available
  // only on parent orders (orders that have a customer to ship to
  // and that may aggregate documents from subcontract children).
  const [showSendDocsDialog, setShowSendDocsDialog] = useState(false);
  // Share-tracking-link dialog mount + cached count of active shares
  // so the header button can show "1 active link" without opening
  // the dialog. Refreshed from /api/orders/[id]/tracking-shares.
  const [showShareTrackingDialog, setShowShareTrackingDialog] = useState(false);
  const [activeTrackingShares, setActiveTrackingShares] = useState<number>(0);
  // Timestamp of the most recent "Send Doc to Customer" email,
  // pulled from order_activity_log. Drives the small caption under
  // the header button so operators can see at a glance whether docs
  // were already sent (and roughly when) without opening the dialog.
  // Null = never sent.
  const [lastDocsSentAt, setLastDocsSentAt] = useState<string | null>(null);

  // Document upload state
  const [uploading, setUploading] = useState(false);
  const [uploadDocType, setUploadDocType] = useState("cmr_pod");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Document preview state
  const [previewDoc, setPreviewDoc] = useState<OrderDocument | null>(null);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [previewRotation, setPreviewRotation] = useState(0);

  // Invoice management state
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<OrderInvoice | null>(null);
  const [invoiceDirection, setInvoiceDirection] = useState<'outgoing' | 'incoming'>('outgoing');
  const [invoicePayments, setInvoicePayments] = useState<InvoicePayment[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<OrderInvoice | null>(null);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);

  // Admin session
  const [adminSession, setAdminSession] = useState<any>(null);
  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (stored) setAdminSession(JSON.parse(stored));
  }, []);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select(`*, customer:business_partners!orders_customer_id_fkey(id, name), carrier:business_partners!orders_carrier_id_fkey(id, name, email), driver:drivers!orders_driver_id_fkey(id, name, phone, last_lat, last_lng, last_seen_at), vehicle:vehicles!orders_vehicle_id_fkey(id, plate_number, traccar_device_id), trailer:trailers!orders_trailer_id_fkey(id, plate_number), parent_order:parent_order_id(id, reference_number)`)
      .eq("id", orderId).single();
    if (data) {
      setOrder(data);
setEditData({
  order_type: data.order_type || "internal",
  customer_price: data.customer_price, customer_currency: data.customer_currency || "EUR",
  carrier_cost: data.carrier_cost, carrier_currency: data.carrier_currency || "EUR",
  weight_kg: data.weight_kg, pallet_count: data.pallet_count, loading_meters: data.loading_meters,
  cargo_description: data.cargo_description, goods_type: data.goods_type,
  special_instructions: data.special_instructions, internal_notes: data.internal_notes,
  customer_id: data.customer_id, carrier_id: data.carrier_id,
  driver_id: data.driver_id, vehicle_id: data.vehicle_id, trailer_id: data.trailer_id,
  customer_reference: data.customer_reference,
  // Subcontractor vehicle/trailer/driver – seeded below from the
  // parent trip-leg, so the user can edit them directly from this
  // FWD detail page (mirroring what's done in trip-leg-assignment).
  subcontractor_vehicle_plate: null,
  subcontractor_trailer_plate: null,
  subcontractor_driver_name: null,
  subcontractor_driver_phone: null,
  });

  // For FWD (carrier-subcontract) orders, pull the parent order's
  // trip-leg row that this FWD was generated from. That leg's
  // `subcontractor_*` fields are the source of truth for the PDF
  // renderer, the execution view, and now this inline editor.
  if (data.commercial_role === "carrier_subcontract") {
    // Source A — the junction table used by single-leg FWDs.
    //   forwarding_order_legs(trip_leg_id, forwarding_order_id)
    // Source B — the direct column used by consolidation FWDs.
    //   trip_legs.forwarding_order_id = <this order>
    // We hit both in parallel and merge the resulting IDs. A leg that
    // appears in both (shouldn't happen but is harmless) is deduped.
    const [{ data: junctions }, { data: directLegs }] = await Promise.all([
      supabase
        .from("forwarding_order_legs")
        .select(`
          trip_leg_id,
          trip_leg:trip_leg_id(
            id,
            subcontractor_vehicle_plate,
            subcontractor_trailer_plate,
            subcontractor_driver_name,
            subcontractor_driver_phone
          )
        `)
        .eq("forwarding_order_id", orderId),
      supabase
        .from("trip_legs")
        .select(`
          id,
          subcontractor_vehicle_plate,
          subcontractor_trailer_plate,
          subcontractor_driver_name,
          subcontractor_driver_phone,
          leg_number
        `)
        .eq("forwarding_order_id", orderId)
        .order("leg_number", { ascending: true }),
    ]);

    // Flatten the junction rows down to their trip_leg payload so we
    // can iterate uniformly with the direct rows.
    const junctionLegs: any[] = (junctions || [])
      .map((j: any) => (Array.isArray(j.trip_leg) ? j.trip_leg[0] : j.trip_leg))
      .filter(Boolean);

    // Merge + dedupe by id, preserving order (junction first, then
    // any direct legs that weren't already in the junction set).
    const parentLegsById = new Map<string, any>();
    for (const lg of junctionLegs) parentLegsById.set(lg.id, lg);
    for (const lg of directLegs || []) {
      if (!parentLegsById.has(lg.id)) parentLegsById.set(lg.id, lg);
    }
    const parentLegs = Array.from(parentLegsById.values());

    setFwdParentLegIds(parentLegs.map((l) => l.id));

    // Seed the inline-editor with whichever leg actually has values.
    // For a consolidation with mixed plates across legs we pick the
    // first non-empty value — the operator can then overwrite once
    // and the save will fan out to every linked leg.
    if (parentLegs.length > 0) {
      const firstNonEmpty = (key: string) =>
        parentLegs.map((l) => l?.[key]).find((v) => v != null && String(v).trim() !== "") || "";
      setEditData((prev: any) => ({
        ...prev,
        subcontractor_vehicle_plate: firstNonEmpty("subcontractor_vehicle_plate"),
        subcontractor_trailer_plate: firstNonEmpty("subcontractor_trailer_plate"),
        subcontractor_driver_name:   firstNonEmpty("subcontractor_driver_name"),
        subcontractor_driver_phone:  firstNonEmpty("subcontractor_driver_phone"),
      }));
    }

    // Resolve the FWD's OWN trip-leg (different row from the parent
    // leg above). The FWD has its own Trip via the trip_orders bridge,
    // and the only leg on that trip is the one we want to keep in sync
    // so the execution panel on this same page also displays the
    // values we are editing.
    const { data: ownTripOrders } = await supabase
      .from("trip_orders")
      .select("trip_id")
      .eq("order_id", orderId);
    const ownTripIds = (ownTripOrders || []).map((t: any) => t.trip_id).filter(Boolean);
    if (ownTripIds.length > 0) {
      const { data: ownLegs } = await supabase
        .from("trip_legs")
        .select("id, trip_id, assignment_type")
        .in("trip_id", ownTripIds)
        .order("leg_number");
      const ownLeg = (ownLegs || []).find((l: any) => l.assignment_type === "forwarding")
                  || (ownLegs || [])[0];
      setFwdOwnLegId(ownLeg?.id || null);
    } else {
      setFwdOwnLegId(null);
    }
  } else {
    setFwdParentLegIds([]);
    setFwdOwnLegId(null);
  }
      const [stopsRes, invoicesRes, expensesRes, docsRes, activityRes, historyRes, formsRes, subcontractsRes] = await Promise.all([
        supabase.from("order_stops").select("*").eq("order_id", orderId).order("sequence_order"),
        supabase.from("order_invoices").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
        supabase.from("order_expenses").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
        supabase.from("order_documents").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
        supabase.from("order_activity_log").select("*").eq("order_id", orderId).order("created_at", { ascending: false }).limit(50),
        supabase.from("order_status_history").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
        supabase.from("order_stop_form_submissions").select("*").eq("order_id", orderId).order("submitted_at", { ascending: false }),
        // Fetch child subcontract orders (forwarding orders linked to this order)
        supabase.from("orders").select("id, reference_number, status, order_type, commercial_role, carrier_id, carrier_cost, carrier_currency, carrier:carrier_id(id, name)").eq("parent_order_id", orderId),
      ]);
      setStops(stopsRes.data || []);
      setInvoices(invoicesRes.data || []);
      setExpenses(expensesRes.data || []);
      setDocuments(docsRes.data || []);
      setActivity(activityRes.data || []);
      setStatusHistory(historyRes.data || []);
      setFormSubmissions(formsRes.data || []);
      setSubcontracts(subcontractsRes.data || []);

      // Fetch trips linked to this order via trip_orders (including trip_stops for map)
      const { data: tripOrdersData } = await supabase
        .from("trip_orders")
        .select(`
          trip:trips(
            id, reference_number, assignment_type, status,
            driver:drivers(id, name),
            vehicle:vehicles(id, plate_number),
            carrier:business_partners!trips_carrier_id_fkey(id, name),
            trip_stops(id, sequence_order, stop_type, company_name, city, country, lat, lng)
          )
        `)
        .eq("order_id", orderId);
      
      if (tripOrdersData?.length) {
        // Fetch FWD orders linked to trips via forwarding_order_legs junction table
        const tripIds = tripOrdersData.map((to: any) => to.trip?.id).filter(Boolean);
        const fwdOrderByTrip = new Map<string, { id: string; ref: string; carrier?: { id: string; name: string } }>();
        
        // Fetch all trip_legs with driver/vehicle/carrier details for these trips
        const { data: tripLegsWithDetails } = await supabase
          .from("trip_legs")
          .select(`
          id, trip_id, leg_number, assignment_type, status, driver_id, vehicle_id, carrier_id,
          from_stop_index, to_stop_index,
          subcontractor_vehicle_plate, subcontractor_trailer_plate, subcontractor_driver_name, subcontractor_driver_phone,
          driver:drivers(id, name),
          vehicle:vehicles(id, plate_number),
          carrier:business_partners(id, name),
          trailer:trailers(id, plate_number)
          `)
          .in("trip_id", tripIds)
          .order("leg_number");
        
        const legIds = (tripLegsWithDetails || []).map((l: any) => l.id);
        const legToTripMap = new Map<string, string>();
        (tripLegsWithDetails || []).forEach((l: any) => legToTripMap.set(l.id, l.trip_id));
        
        // Get FWD orders linked via junction table - need this BEFORE building legsByTrip
        const legFwdOrderMap = new Map<string, { id: string; ref: string }>();
        if (legIds.length > 0) {
          const { data: junctionData } = await supabase
            .from("forwarding_order_legs")
            .select("trip_leg_id, forwarding_order_id")
            .in("trip_leg_id", legIds);
          
          const fwdOrderIds = [...new Set((junctionData || []).map(j => j.forwarding_order_id))];
          
          if (fwdOrderIds.length > 0) {
            const { data: fwdOrders } = await supabase
              .from("orders")
              .select("id, reference_number, carrier_id, carrier:carrier_id(id, name)")
              .in("id", fwdOrderIds);
            
            const fwdOrderMap = new Map<string, any>();
            (fwdOrders || []).forEach(f => fwdOrderMap.set(f.id, f));
            
            // Map FWD orders to both legs AND trips
            (junctionData || []).forEach(j => {
              const fwd = fwdOrderMap.get(j.forwarding_order_id);
              if (fwd) {
                // Store leg-level FWD order info
                legFwdOrderMap.set(j.trip_leg_id, { id: fwd.id, ref: fwd.reference_number });
                
                // Also map to trip level (for backward compatibility)
                const tripId = legToTripMap.get(j.trip_leg_id);
                if (tripId && !fwdOrderByTrip.has(tripId)) {
                  const carrier = fwd.carrier ? (Array.isArray(fwd.carrier) ? fwd.carrier[0] : fwd.carrier) : null;
                  fwdOrderByTrip.set(tripId, { id: fwd.id, ref: fwd.reference_number, carrier });
                }
              }
            });
          }
        }
        
        // Build a map of trip_id -> legs with details (including FWD order info)
        const legsByTrip = new Map<string, any[]>();
        (tripLegsWithDetails || []).forEach((leg: any) => {
          if (!legsByTrip.has(leg.trip_id)) legsByTrip.set(leg.trip_id, []);
          const driver = Array.isArray(leg.driver) ? leg.driver[0] : leg.driver;
          const vehicle = Array.isArray(leg.vehicle) ? leg.vehicle[0] : leg.vehicle;
          const trailer = Array.isArray(leg.trailer) ? leg.trailer[0] : leg.trailer;
          const carrier = Array.isArray(leg.carrier) ? leg.carrier[0] : leg.carrier;
          const legFwd = legFwdOrderMap.get(leg.id);
          legsByTrip.get(leg.trip_id)!.push({
            id: leg.id,
            leg_number: leg.leg_number,
            assignment_type: leg.assignment_type,
            driver_name: driver?.name || null,
            vehicle_plate: vehicle?.plate_number || null,
            trailer_plate: trailer?.plate_number || null,
            carrier_name: carrier?.name || null,
            status: leg.status,
            from_stop_index: leg.from_stop_index,
            to_stop_index: leg.to_stop_index,
            subcontractor_vehicle_plate: leg.subcontractor_vehicle_plate,
            subcontractor_trailer_plate: leg.subcontractor_trailer_plate,
            subcontractor_driver_name: leg.subcontractor_driver_name,
            subcontractor_driver_phone: leg.subcontractor_driver_phone,
            forwarding_order_id: legFwd?.id || null,
            forwarding_order_ref: legFwd?.ref || null,
          });
        });
        
        // Also check for legacy execution_trip_id links (backward compatibility)
        const { data: legacyFwdOrders } = await supabase
          .from("orders")
          .select("id, reference_number, execution_trip_id, carrier_id, carrier:carrier_id(id, name)")
          .eq("parent_order_id", orderId)
          .eq("order_type", "forwarding")
          .not("execution_trip_id", "is", null);
        
        (legacyFwdOrders || []).forEach((fwd: any) => {
          if (fwd.execution_trip_id && !fwdOrderByTrip.has(fwd.execution_trip_id)) {
            const carrier = fwd.carrier ? (Array.isArray(fwd.carrier) ? fwd.carrier[0] : fwd.carrier) : null;
            fwdOrderByTrip.set(fwd.execution_trip_id, { id: fwd.id, ref: fwd.reference_number, carrier });
          }
        });

        setOrderTrips(tripOrdersData.map((to: any) => {
          const trip = Array.isArray(to.trip) ? to.trip[0] : to.trip;
          if (!trip) return null;
          const fwd = fwdOrderByTrip.get(trip.id);
          // For forwarding trips, use carrier from FWD order instead of trip
          const tripCarrier = Array.isArray(trip.carrier) ? trip.carrier[0] : trip.carrier;
          const carrierToUse = trip.assignment_type === "forwarding" && fwd?.carrier ? fwd.carrier : tripCarrier;
          // Get legs for this trip
          const tripLegs = legsByTrip.get(trip.id) || [];
          return {
            id: trip.id,
            reference_number: trip.reference_number,
            assignment_type: trip.assignment_type,
            status: trip.status,
            driver: Array.isArray(trip.driver) ? trip.driver[0] : trip.driver,
            vehicle: Array.isArray(trip.vehicle) ? trip.vehicle[0] : trip.vehicle,
            carrier: carrierToUse,
            forwarding_order_id: fwd?.id || null,
            forwarding_order_ref: fwd?.ref || null,
            legs: tripLegs,
            trip_stops: (trip.trip_stops || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order),
          };
        }).filter(Boolean));
      } else {
        setOrderTrips([]);
      }

      // Fetch trip_stops for this order (execution layer)
      const { data: tripStopsData } = await supabase
        .from("trip_stops")
        .select(`
          id, trip_id, order_stop_id, sequence_order, stop_type, action_type_id,
          company_name, address, city, country,
          planned_date, planned_time_from, planned_time_to,
          status, actual_arrival, actual_departure,
          distance_to_km, duration_to_minutes, notes,
          trip:trips(id, status)
        `)
        .eq("order_id", orderId)
        .order("trip_id").order("sequence_order");

      if (tripStopsData?.length) {
        // Load action type names
        const actionIds = [...new Set(tripStopsData.filter((ts: any) => ts.action_type_id).map((ts: any) => ts.action_type_id))];
        let actionMap = new Map<string, { code: string; name: string }>();
        if (actionIds.length > 0) {
          const { data: actionTypes } = await supabase.from("stop_action_types").select("id, code, name").in("id", actionIds);
          actionMap = new Map((actionTypes || []).map(a => [a.id, a]));
        }
        setTripStopsExec(tripStopsData.map((ts: any) => {
          const at = ts.action_type_id ? actionMap.get(ts.action_type_id) : null;
          return {
            id: ts.id, trip_id: ts.trip_id, order_stop_id: ts.order_stop_id,
            sequence_order: ts.sequence_order, stop_type: ts.stop_type,
            action_type_name: at?.name || null, action_type_code: at?.code || null,
            company_name: ts.company_name, address: ts.address, city: ts.city, country: ts.country,
            planned_date: ts.planned_date, planned_time_from: ts.planned_time_from, planned_time_to: ts.planned_time_to,
            status: ts.status, actual_arrival: ts.actual_arrival, actual_departure: ts.actual_departure,
            distance_to_km: ts.distance_to_km, duration_to_minutes: ts.duration_to_minutes,
            notes: ts.notes, trip_status: ts.trip?.status || "unknown", trip_ref: ts.trip_id?.substring(0, 8) || null,
          };
        }));
      } else {
        setTripStopsExec([]);
      }
    }
    setLoading(false);
  }, [orderId, supabase]);

  const fetchRefData = useCallback(async () => {
    if (!order?.admin_id) return;
  const [p, d, v, t] = await Promise.all([
    supabase.from("business_partners").select("id, name, types").eq("admin_id", order.admin_id).order("name"),
      supabase.from("drivers").select("id, name").eq("admin_id", order.admin_id).order("name"),
      supabase.from("vehicles").select("id, plate_number").eq("admin_id", order.admin_id).order("plate_number"),
      supabase.from("trailers").select("id, plate_number").eq("admin_id", order.admin_id).order("plate_number"),
    ]);
    setPartners(p.data || []); setDriversList(d.data || []); setVehiclesList(v.data || []); setTrailersList(t.data || []);
  }, [order?.admin_id, supabase]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);
  useEffect(() => { if (order) fetchRefData(); }, [order?.admin_id, fetchRefData]);

  // Loads the most recent "documents_sent_to_customer" activity-log
  // row so the header button can show a tiny "Sent on …" caption.
  // Defined as useCallback so the SendDocsToCustomerDialog's onSent
  // callback can call it to instantly refresh the caption without a
  // full fetchOrder() round-trip.
  const refreshLastDocsSent = useCallback(async () => {
    if (!orderId) return;
    const { data } = await supabase
      .from("order_activity_log")
      .select("created_at")
      .eq("order_id", orderId)
      .eq("action", "documents_sent_to_customer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLastDocsSentAt(data?.created_at || null);
  }, [orderId, supabase]);
  useEffect(() => { refreshLastDocsSent(); }, [refreshLastDocsSent]);

  // Count active (not-revoked, not-expired) tracking shares so the
  // header button can display a small badge. We fetch directly from
  // the table here (rather than the API route) to avoid an extra
  // round-trip — the panel already has the admin context.
  const refreshTrackingShares = useCallback(async () => {
    if (!orderId) return;
    const { count } = await supabase
      .from("order_tracking_shares")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString());
    setActiveTrackingShares(count || 0);
  }, [orderId, supabase]);
  useEffect(() => { refreshTrackingShares(); }, [refreshTrackingShares]);

  // Realtime: auto-refresh when order or its stops change
  useEffect(() => {
    if (!orderId) return;
    const s = createClient();
    const channel = s
      .channel(`order-detail-${orderId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, () => fetchOrder())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_stops", filter: `order_id=eq.${orderId}` }, () => fetchOrder())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_status_history", filter: `order_id=eq.${orderId}` }, () => fetchOrder())
      .subscribe();
    return () => { s.removeChannel(channel); };
  }, [orderId, fetchOrder]);

  // Load trip data for editing when editTripId is provided
  useEffect(() => {
    if (!editTripId) return;
    (async () => {
      const { data: trip } = await supabase
        .from("trips").select(`
          id, status, driver_id, vehicle_id, trailer_id, carrier_id, assignment_type,
          distance_km, duration_minutes, route_geometry,
          driver:driver_id(name), vehicle:vehicle_id(plate_number), trailer:trailer_id(plate_number),
          carrier:carrier_id(name),
          trip_legs(
            id, trip_id, leg_number, assignment_type, status,
            driver_id, vehicle_id, trailer_id, carrier_id, forwarding_order_id,
            from_stop_index, to_stop_index,
                        subcontractor_vehicle_plate, subcontractor_trailer_plate, subcontractor_driver_name, subcontractor_driver_phone,
                        driver:driver_id(name), vehicle:vehicle_id(plate_number), trailer:trailer_id(plate_number),
                        carrier:carrier_id(name)
                      ),
          trip_stops(id, sequence_order, stop_type, company_name, address, city, country, postal_code,
                     order_id, order_stop_id, lat, lng, planned_date, planned_time_from, planned_time_to, status, notes,
                     auto_checkin, auto_checkout, geofence_radius, form_id,
                     route_to_geometry, distance_to_km, duration_to_minutes,
                     action_type:action_type_id(id, code, name, icon, color))
        `).eq("id", editTripId).single();
      if (trip) {
        let fwdOrderId = null;
        let fwdOrderRef = null;
        let carrierName = trip.carrier?.name;
        
        // For forwarding trips, fetch FWD order via junction table or legacy execution_trip_id
        if (trip.assignment_type === "forwarding") {
          // First try junction table via trip_legs
          const legIds = (trip.trip_legs || []).map((l: any) => l.id);
          if (legIds.length > 0) {
            const { data: junctionData } = await supabase
              .from("forwarding_order_legs")
              .select("forwarding_order_id")
              .in("trip_leg_id", legIds)
              .limit(1);
            
            if (junctionData?.[0]?.forwarding_order_id) {
              const { data: fwdOrder } = await supabase
                .from("orders")
                .select("id, reference_number, carrier:carrier_id(id, name)")
                .eq("id", junctionData[0].forwarding_order_id)
                .single();
              if (fwdOrder) {
                fwdOrderId = fwdOrder.id;
                fwdOrderRef = fwdOrder.reference_number;
                const fwdCarrier = Array.isArray(fwdOrder.carrier) ? fwdOrder.carrier[0] : fwdOrder.carrier;
                if (fwdCarrier?.name) carrierName = fwdCarrier.name;
              }
            }
          }
          
          // Fallback to legacy execution_trip_id if no junction found
          if (!fwdOrderId) {
            const { data: fwdOrder } = await supabase
              .from("orders")
              .select("id, reference_number, carrier:carrier_id(id, name)")
              .eq("parent_order_id", orderId)
              .eq("execution_trip_id", trip.id)
              .eq("order_type", "forwarding")
              .maybeSingle();
            if (fwdOrder) {
              fwdOrderId = fwdOrder.id;
              fwdOrderRef = fwdOrder.reference_number;
              const fwdCarrier = Array.isArray(fwdOrder.carrier) ? fwdOrder.carrier[0] : fwdOrder.carrier;
              if (fwdCarrier?.name) carrierName = fwdCarrier.name;
            }
          }
        }
        
        setEditingTrip({
          ...trip,
          driver_name: trip.driver?.name,
          vehicle_plate: trip.vehicle?.plate_number,
          trailer_plate: trip.trailer?.plate_number,
          carrier_name: carrierName,
          forwarding_order_id: fwdOrderId,
          forwarding_order_ref: fwdOrderRef,
        });
        
        // Process trip_legs with joined data and fetch FWD order refs
        const sortedLegs = (trip.trip_legs || [])
          .sort((a: any, b: any) => a.leg_number - b.leg_number)
          .map((leg: any) => ({
            ...leg,
            driver_name: leg.driver?.name,
            vehicle_plate: leg.vehicle?.plate_number,
            trailer_plate: leg.trailer?.plate_number,
            carrier_name: leg.carrier?.name,
          }));
        
        // Fetch FWD order refs for subcontract legs via junction table
        const forwardingLegs = sortedLegs.filter((l: any) => l.assignment_type === "forwarding" && !l.forwarding_order_ref);
        if (forwardingLegs.length > 0) {
          // First, get the junction records
          const { data: fwdLinks } = await supabase
            .from("forwarding_order_legs")
            .select("trip_leg_id, forwarding_order_id")
            .in("trip_leg_id", forwardingLegs.map((l: any) => l.id));
          
          if (fwdLinks && fwdLinks.length > 0) {
            // Then fetch the FWD order details
            const fwdOrderIds = fwdLinks.map(l => l.forwarding_order_id).filter(Boolean);
            const { data: fwdOrders } = await supabase
              .from("orders")
              .select("id, reference_number")
              .in("id", fwdOrderIds);
            
            const fwdOrderMap = new Map((fwdOrders || []).map((o: any) => [o.id, o.reference_number]));
            
            const fwdRefMap = new Map(
              fwdLinks.map((link: any) => [
                link.trip_leg_id,
                { id: link.forwarding_order_id, ref: fwdOrderMap.get(link.forwarding_order_id) }
              ])
            );
            
            sortedLegs.forEach((leg: any) => {
              const fwdInfo = fwdRefMap.get(leg.id);
              if (fwdInfo && fwdInfo.id) {
                leg.forwarding_order_id = fwdInfo.id;
                leg.forwarding_order_ref = fwdInfo.ref;
              }
            });
          }
        }
        
        // Fallback: check direct forwarding_order_id on legs not found in junction table
        const legsStillMissingFwd = sortedLegs.filter((l: any) => l.assignment_type === "forwarding" && !l.forwarding_order_ref && l.forwarding_order_id);
        if (legsStillMissingFwd.length > 0) {
          const { data: directFwdOrders } = await supabase
            .from("orders")
            .select("id, reference_number")
            .in("id", legsStillMissingFwd.map((l: any) => l.forwarding_order_id));
          
          const directFwdMap = new Map((directFwdOrders || []).map((o: any) => [o.id, o.reference_number]));
          sortedLegs.forEach((leg: any) => {
            if (leg.forwarding_order_id && !leg.forwarding_order_ref) {
              leg.forwarding_order_ref = directFwdMap.get(leg.forwarding_order_id);
            }
          });
        }
        
        setEditingTripLegs(sortedLegs);
        
        const sortedStops = (trip.trip_stops || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order);
        setEditingStops(sortedStops.map((s: any) => ({
          ...s,
          action_type_id: s.action_type?.id || null,
          action_type_name: s.action_type?.name || null,
          action_type_code: s.action_type?.code || null,
        })));
        setEditingRoute({
          geometry: trip.route_geometry || null,
          distance_km: trip.distance_km || 0,
          duration_hours: (trip.duration_minutes || 0) / 60,
        });
      }
    })();
  }, [editTripId, supabase]);

  // Auto-select first trip when Execution tab is active and no trip is selected
  useEffect(() => {
    if (activeTab !== "execution" || editingTrip || tripStopsExec.length === 0) return;
    // Get unique trip IDs and select the first one
    const uniqueTripIds = [...new Set(tripStopsExec.map(ts => ts.trip_id))];
    if (uniqueTripIds.length === 0) return;
    
    const firstTripId = uniqueTripIds[0];
    (async () => {
      const { data: trip } = await supabase
        .from("trips").select(`
          id, status, driver_id, vehicle_id, trailer_id, carrier_id, assignment_type,
          distance_km, duration_minutes, route_geometry,
          driver:driver_id(name), vehicle:vehicle_id(plate_number), trailer:trailer_id(plate_number),
          carrier:carrier_id(name),
          trip_legs(
            id, trip_id, leg_number, assignment_type, status,
            driver_id, vehicle_id, trailer_id, carrier_id, forwarding_order_id,
            from_stop_index, to_stop_index,
                        subcontractor_vehicle_plate, subcontractor_trailer_plate, subcontractor_driver_name, subcontractor_driver_phone,
                        driver:driver_id(name), vehicle:vehicle_id(plate_number), trailer:trailer_id(plate_number),
                        carrier:carrier_id(name)
                      ),
          trip_stops(id, sequence_order, stop_type, company_name, address, city, country, postal_code,
                     order_id, order_stop_id, lat, lng, planned_date, planned_time_from, planned_time_to, status, notes,
                     auto_checkin, auto_checkout, geofence_radius, form_id,
                     route_to_geometry, distance_to_km, duration_to_minutes,
                     action_type:action_type_id(id, code, name, icon, color))
        `).eq("id", firstTripId).single();
      if (trip) {
        let fwdOrderId = null;
        let fwdOrderRef = null;
        let carrierName = trip.carrier?.name;
        
        if (trip.assignment_type === "forwarding") {
          const legIds = (trip.trip_legs || []).map((l: any) => l.id);
          if (legIds.length > 0) {
            const { data: junctionData } = await supabase
              .from("forwarding_order_legs")
              .select("forwarding_order_id")
              .in("trip_leg_id", legIds)
              .limit(1);
            if (junctionData?.[0]?.forwarding_order_id) {
              const { data: fwdOrder } = await supabase
                .from("orders")
                .select("id, reference_number, carrier:carrier_id(id, name)")
                .eq("id", junctionData[0].forwarding_order_id)
                .single();
              if (fwdOrder) {
                fwdOrderId = fwdOrder.id;
                fwdOrderRef = fwdOrder.reference_number;
                const fwdCarrier = Array.isArray(fwdOrder.carrier) ? fwdOrder.carrier[0] : fwdOrder.carrier;
                if (fwdCarrier?.name) carrierName = fwdCarrier.name;
              }
            }
          }
        }
        
        setEditingTrip({ 
          ...trip, 
          driver_name: trip.driver?.name, 
          vehicle_plate: trip.vehicle?.plate_number,
          trailer_plate: trip.trailer?.plate_number,
          carrier_name: carrierName,
          forwarding_order_id: fwdOrderId,
          forwarding_order_ref: fwdOrderRef,
        });
        
        const sortedLegs = (trip.trip_legs || [])
          .sort((a: any, b: any) => a.leg_number - b.leg_number)
          .map((leg: any) => ({
            ...leg,
            driver_name: leg.driver?.name,
            vehicle_plate: leg.vehicle?.plate_number,
            trailer_plate: leg.trailer?.plate_number,
            carrier_name: leg.carrier?.name,
          }));
        
        // Fetch FWD order refs for subcontract legs via junction table
        const forwardingLegs = sortedLegs.filter((l: any) => l.assignment_type === "forwarding" && !l.forwarding_order_ref);
        if (forwardingLegs.length > 0) {
          // First, get the junction records
          const { data: fwdLinks } = await supabase
            .from("forwarding_order_legs")
            .select("trip_leg_id, forwarding_order_id")
            .in("trip_leg_id", forwardingLegs.map((l: any) => l.id));
          
          if (fwdLinks && fwdLinks.length > 0) {
            // Then fetch the FWD order details
            const fwdOrderIds = fwdLinks.map(l => l.forwarding_order_id).filter(Boolean);
            const { data: fwdOrders } = await supabase
              .from("orders")
              .select("id, reference_number")
              .in("id", fwdOrderIds);
            
            const fwdOrderMap = new Map((fwdOrders || []).map((o: any) => [o.id, o.reference_number]));
            
            const fwdRefMap = new Map(
              fwdLinks.map((link: any) => [
                link.trip_leg_id,
                { id: link.forwarding_order_id, ref: fwdOrderMap.get(link.forwarding_order_id) }
              ])
            );
            
            sortedLegs.forEach((leg: any) => {
              const fwdInfo = fwdRefMap.get(leg.id);
              if (fwdInfo && fwdInfo.id) {
                leg.forwarding_order_id = fwdInfo.id;
                leg.forwarding_order_ref = fwdInfo.ref;
              }
            });
          }
        }
        
        setEditingTripLegs(sortedLegs);
        
        const sortedStops = (trip.trip_stops || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order);
        setEditingStops(sortedStops.map((s: any) => ({
          ...s,
          action_type_id: s.action_type?.id || null,
          action_type_name: s.action_type?.name || null,
          action_type_code: s.action_type?.code || null,
        })));
        setEditingRoute({
          geometry: trip.route_geometry || null,
          distance_km: trip.distance_km || 0,
          duration_hours: (trip.duration_minutes || 0) / 60,
        });
      }
    })();
  }, [activeTab, editingTrip, tripStopsExec, supabase]);

  // Save trip edits
  const saveTrip = async () => {
    if (!editingTrip) return;
    setSavingTrip(true);
    try {
      // Update trip record
      await supabase.from("trips").update({
        route_geometry: editingRoute.geometry,
        distance_km: editingRoute.distance_km,
        duration_minutes: Math.round(editingRoute.duration_hours * 60),
      }).eq("id", editingTrip.id);

      // Update each trip_stop (including sequence_order for reordering)
      for (let i = 0; i < editingStops.length; i++) {
        const stop = editingStops[i];
        await supabase.from("trip_stops").update({
          sequence_order: i + 1,
          company_name: stop.company_name,
          address: stop.address,
          city: stop.city,
          country: stop.country,
          lat: stop.lat,
          lng: stop.lng,
          planned_date: stop.planned_date,
          planned_time_from: stop.planned_time_from,
          planned_time_to: stop.planned_time_to,
          notes: stop.notes,
          distance_to_km: stop.distance_to_km,
          duration_to_minutes: stop.duration_to_minutes,
          route_to_geometry: stop.route_to_geometry,
        }).eq("id", stop.id);
      }

      // Log activity
      await supabase.from("order_activity_log").insert({
        order_id: orderId,
        action: "trip_execution_edited",
        details: { trip_id: editingTrip.id, edited_fields: ["route", "stops", "timing"] },
        performed_by_type: "admin",
        performed_by_id: order?.admin_id,
      });

      toast({ title: "Trip execution updated" });
      fetchOrder();
      onStatusChange?.();
    } catch (err: any) {
      toast({ title: "Error saving trip", description: err.message, variant: "destructive" });
    } finally {
      setSavingTrip(false);
    }
  };

  // Driver location polling for ETA
  useEffect(() => {
    if (!order?.driver_id || !adminSession?.id) return;
    const isActive = isActiveStatus(order.status);
    if (!isActive) { setDriverLat(null); setDriverLng(null); return; }

    const fetchDriverPos = async () => {
      try {
        const res = await fetch(`/api/traccar/positions?adminId=${adminSession.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.vehicles) {
          const veh = data.vehicles.find((v: any) => (v.vehicle_id || v.id) === order.vehicle_id);
          if (veh) {
            setDriverLat(veh.latitude);
            setDriverLng(veh.longitude);
            setDriverSpeed(veh.speed || null);
          }
        }
      } catch { /* traccar not available */ }
    };
    fetchDriverPos();
    const iv = setInterval(fetchDriverPos, 30000);
    return () => clearInterval(iv);
  }, [order?.driver_id, order?.vehicle_id, order?.status, adminSession?.id]);

  // ETA Calculation (Haversine - no external API)
  useEffect(() => {
    if (driverLat == null || driverLng == null || stops.length === 0) { setEta(null); return; }
    const nextStop = stops.find(s => s.status === "pending" || s.status === "en_route");
    if (!nextStop || !nextStop.lat || !nextStop.lng) { setEta(null); return; }

    const R = 6371;
    const dLat = ((nextStop.lat - driverLat) * Math.PI) / 180;
    const dLng = ((nextStop.lng - driverLng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((driverLat * Math.PI) / 180) * Math.cos((nextStop.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const roadDist = R * c * 1.3;
    const speedKmh = driverSpeed && driverSpeed > 1 ? driverSpeed * 3.6 : 40;
    const minutes = Math.max(1, Math.round((roadDist / speedKmh) * 60));

    setEta({ minutes, distance: Math.round(roadDist * 10) / 10, toStopName: nextStop.company_name || nextStop.city || `Stop ${nextStop.sequence_order}` });
  }, [driverLat, driverLng, driverSpeed, stops]);

  const updateStatus = async (newStatus: string) => {
    const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    // Log to both activity log and status history
    await Promise.all([
      supabase.from("order_activity_log").insert({ order_id: orderId, action: "status_changed", details: { from: order.status, to: newStatus }, performed_by_type: "admin" }),
      supabase.from("order_status_history").insert({ order_id: orderId, from_status: order.status, to_status: newStatus, changed_by_type: "admin", changed_by: adminSession?.id, notes: `Changed by ${adminSession?.name || "Admin"}` }),
    ]);

    // ── Propagate FWD status → linked trip_legs.status (same rank twin) ─��
    // When this is a forwarding (subcontract) order, the parent trip's
    // leg(s) backing it must move in lockstep, otherwise the orders-list
    // secondary chip and the Execution > Leg chip stay stuck on the old
    // value (e.g. "Planned") even though the FWD says "Carrier Confirmed".
    if (newStatus.startsWith("fwd_")) {
      const internalTwin = forwarderToInternal(newStatus);
      if (internalTwin) {
        try {
          const { data: links } = await supabase
            .from("forwarding_order_legs")
            .select("trip_leg_id")
            .eq("forwarding_order_id", orderId);
          const legIds = (links || []).map((l: any) => l.trip_leg_id).filter(Boolean);
          if (legIds.length > 0) {
            await supabase.from("trip_legs").update({ status: internalTwin }).in("id", legIds);
          }
        } catch (e) {
          // non-critical: leg sync best-effort, parent status already saved
          console.error("[v0] Failed to sync trip_legs.status from FWD", e);
        }
      }
    }

    toast({ title: "Status updated" }); fetchOrder(); onStatusChange?.();

    // Auto-trigger CMR/POD request email when order is delivered or moves to documents pending
    if ((newStatus === "fwd_delivered" || newStatus === "fwd_documents_pending") && adminSession?.id) {
      try {
        const res = await fetch("/api/orders/request-cmr-pod", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-id": adminSession.id, "x-user-id": adminSession.user_id || "" },
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          toast({ title: "CMR/POD Request Sent", description: "Carrier will receive an email to upload CMR/POD documents." });
          fetchOrder(); onStatusChange?.();
        } else if (!data.alreadySent) {
          toast({ title: "CMR/POD Email Failed", description: data.error || "Could not send CMR/POD request", variant: "destructive" });
        }
      } catch { /* non-critical */ }
    }
  };

  const safeFloat = (v: any): number | null => { if (v === "" || v == null) return null; const n = parseFloat(v); return isNaN(n) ? null : n; };
  const safeInt = (v: any): number | null => { if (v === "" || v == null) return null; const n = parseInt(v); return isNaN(n) ? null : n; };

  const saveEdits = async () => {
    setSaving(true);
    
    // Determine if order type is changing and what status to set
    const orderTypeChanging = editData.order_type !== order.order_type;
    let newStatus = order.status;
    if (orderTypeChanging) {
      if (editData.order_type === "forwarding") {
        // Internal -> Forwarding: a parent flipping to forwarder doesn't
        // map cleanly (parent statuses live on a different scope). We keep
        // the parent at draft / confirmed_to_customer until execution begins
        // — the FWD child carries the fwd_* lifecycle. So just preserve the
        // existing parent status when it's still valid for forwarder parents.
        // No conversion needed: parent statuses (draft, confirmed_to_customer,
        // in_execution, etc.) are shared across order_type.
        newStatus = order.status;
      } else {
        // Forwarding -> Internal: same — parent status stays as-is. Legacy
        // fwd_* values (which should never be on a parent in v3) collapse
        // to draft as a safe fallback.
        newStatus = order.status?.startsWith("fwd_") ? "draft" : order.status;
      }
    }
    
    // ── Derive VAT amounts (Romanian fiscal rules) ──
    // For taxable rows we always store BOTH net and gross plus the VAT
    // amount, so downstream consumers (PDF, invoice, accounting export)
    // never have to recompute. For exempt / reverse_charge / non_taxable
    // rows we zero the VAT portion and keep net = gross = entered amount.
    const computeVat = (amount: number | null, rate: number, type: string) => {
      if (amount == null || !Number.isFinite(amount)) return { net: null, gross: null, vat: 0 };
      if (["exempt", "reverse_charge", "non_taxable"].includes(type)) {
        return { net: amount, gross: amount, vat: 0 };
      }
      if (type === "including") {
        const net = amount / (1 + rate / 100);
        return { net: round2(net), gross: round2(amount), vat: round2(amount - net) };
      }
      // default: excluding
      const gross = amount * (1 + rate / 100);
      return { net: round2(amount), gross: round2(gross), vat: round2(gross - amount) };
    };
    const round2 = (n: number) => Math.round(n * 100) / 100;

    const customerPriceNum = safeFloat(editData.customer_price);
    const customerVatType  = editData.customer_vat_type || order.customer_vat_type || "excluding";
    const customerVatRate  = Number(editData.customer_vat_rate ?? order.customer_vat_rate ?? 21);
    const customerVat = computeVat(customerPriceNum, customerVatRate, customerVatType);

    const carrierCostNum  = safeFloat(editData.carrier_cost);
    const carrierVatType  = editData.carrier_vat_type || order.carrier_vat_type || "excluding";
    const carrierVatRate  = Number(editData.carrier_vat_rate ?? order.carrier_vat_rate ?? 21);
    const carrierVat = computeVat(carrierCostNum, carrierVatRate, carrierVatType);

    const payload: any = {
      order_type: editData.order_type || "internal",
      customer_price: customerPriceNum, customer_currency: editData.customer_currency || "EUR",
      carrier_cost: carrierCostNum, carrier_currency: editData.carrier_currency || "EUR",
      // Customer VAT + payment terms
      customer_vat_type: customerVatType,
      customer_vat_rate: customerVatRate,
      customer_vat_amount: customerVat.vat,
      customer_price_without_vat: customerVat.net,
      customer_price_with_vat: customerVat.gross,
      payment_terms_customer_days: editData.payment_terms_customer_days ?? order.payment_terms_customer_days ?? null,
      // Carrier VAT + payment terms
      carrier_vat_type: carrierVatType,
      carrier_vat_rate: carrierVatRate,
      carrier_vat_amount: carrierVat.vat,
      carrier_cost_without_vat: carrierVat.net,
      carrier_cost_with_vat: carrierVat.gross,
      payment_terms_carrier_days: editData.payment_terms_carrier_days ?? order.payment_terms_carrier_days ?? null,
      // Free-text Observații printed on the carrier confirmation just under
      // the Payment Terms line. Persisted as-is (multi-line allowed).
      carrier_payment_notes:
        editData.carrier_payment_notes !== undefined
          ? (editData.carrier_payment_notes?.trim() || null)
          : (order.carrier_payment_notes ?? null),
      // Cargo & relations
      weight_kg: safeFloat(editData.weight_kg), pallet_count: safeInt(editData.pallet_count),
      loading_meters: safeFloat(editData.loading_meters), cargo_description: editData.cargo_description || null,
      goods_type: editData.goods_type || null, special_instructions: editData.special_instructions || null,
      internal_notes: editData.internal_notes || null,
      customer_id: editData.customer_id === "none" ? null : editData.customer_id || null,
      carrier_id: editData.carrier_id === "none" ? null : editData.carrier_id || null,
      driver_id: editData.driver_id === "none" ? null : editData.driver_id || null,
      vehicle_id: editData.vehicle_id === "none" ? null : editData.vehicle_id || null,
      trailer_id: editData.trailer_id === "none" ? null : editData.trailer_id || null,
      customer_reference: editData.customer_reference || null,
    };
    
    // If order type changed, also update status
    if (orderTypeChanging) {
      payload.status = newStatus;
    }
    
    // Auto-flip status to fwd_assigned_to_carrier when a carrier is selected
    // for an order that's currently sitting in fwd_unassigned. This is only
    // meaningful for forwarder *child* orders (parents don't carry fwd_*).
    const isForwardingOrder = (editData.order_type || order.order_type) === "forwarding";
    const carrierWasAssigned = editData.carrier_id && editData.carrier_id !== "none" && !order.carrier_id;
    const currentStatusIsUnassigned = order.status === "fwd_unassigned";
    if (isForwardingOrder && carrierWasAssigned && currentStatusIsUnassigned) {
      payload.status = "fwd_assigned_to_carrier";
    }

    const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
    if (error) { setSaving(false); toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

    // Persist the Vehicle / Trailer / Driver inline-edits onto every
    // trip-leg backing this FWD, but only when the user actually
    // touched one of the four fields. Empty-string → null is
    // intentional so clearing a field in the UI removes it from the
    // database (rather than persisting "").
    const touchedFleet = (
      editData.subcontractor_vehicle_plate !== undefined ||
      editData.subcontractor_trailer_plate !== undefined ||
      editData.subcontractor_driver_name   !== undefined ||
      editData.subcontractor_driver_phone  !== undefined
    );
    if (touchedFleet) {
      const norm = (v: any) =>
        v === undefined || v === null || (typeof v === "string" && v.trim() === "")
          ? null
          : String(v).trim();
      const fleetPatch = {
        subcontractor_vehicle_plate: norm(editData.subcontractor_vehicle_plate),
        subcontractor_trailer_plate: norm(editData.subcontractor_trailer_plate),
        subcontractor_driver_name:   norm(editData.subcontractor_driver_name),
        subcontractor_driver_phone:  norm(editData.subcontractor_driver_phone),
      };
      // Update ALL parent legs (single-leg FWDs have 1; consolidation
      // FWDs have many) PLUS this FWD's own execution leg, so the
      // values stay in lockstep across:
      //   - the parent order's leg row (read by the FWD PDF renderer)
      //   - this FWD's execution view on the same page
      const fleetIds = Array.from(new Set([...fwdParentLegIds, fwdOwnLegId].filter(Boolean) as string[]));
      if (fleetIds.length > 0) {
        const { error: fleetErr } = await supabase
          .from("trip_legs")
          .update(fleetPatch)
          .in("id", fleetIds);
        if (fleetErr) {
          // Non-fatal: the order itself saved fine. Surface a soft warn.
          toast({ title: "Order saved", description: `Fleet update failed: ${fleetErr.message}`, variant: "destructive" });
        }
      } else if (isForwardingOrder) {
        // FWD has no backing legs at all — most often the case when a
        // FWD was created standalone (not from a parent leg and not
        // from a consolidation). Warn the operator so they understand
        // why the fleet fields appear to "not save" on this order.
        toast({
          title: "Order saved",
          description: "Vehicle / Trailer / Driver couldn't be stored — this forwarding order has no linked trip legs.",
          variant: "destructive",
        });
      }
    }

    setSaving(false);
    await supabase.from("order_activity_log").insert({ order_id: orderId, action: "order_edited", details: { fields: Object.keys(editData) }, performed_by_type: "admin" });
    toast({ title: "Order saved" }); setEditing(false); fetchOrder(); onStatusChange?.();
  };

  // Returns the legal next-statuses for the parent order, derived from the
  // central transitions registry (lib/tms/status/transitions.ts). The same
  // helper is used for both internal and forwarder orders — the order_type
  // tells us which scope to query.
  const getNextStatuses = (current: string): string[] =>
    nextStatusesFor("parent", current);

  const getForwardingNextStatuses = (current: string): string[] =>
    nextStatusesFor("forwarder", current);

  // All statuses available for manual override. Pulled from the registry so
  // that adding/removing a status only happens in one place.
  const getAllStatuses = (orderType: string): string[] => {
    if (orderType === "forwarding") {
      return Object.keys(FORWARDER_STATUSES);
    }
    return Object.keys(PARENT_STATUSES);
  };

  // Stops editing functions
  const startEditingStops = () => {
    setEditableStops(stops.map(s => ({ ...s })));
    setEditingStopsMode(true);
  };

  const cancelEditingStops = () => {
    setEditableStops([]);
    setEditingStopsMode(false);
  };

  const updateEditableStop = (stopId: string, field: string, value: any) => {
    setEditableStops(prev => prev.map(s => s.id === stopId ? { ...s, [field]: value } : s));
  };

  const addNewStop = () => {
    const newStop: OrderStop = {
      id: `new-${Date.now()}`,
      sequence_order: editableStops.length + 1,
      stop_type: "pickup",
      company_name: "",
      address: "",
      city: "",
      country: "",
      postal_code: "",
      lat: null,
      lng: null,
      planned_date: null,
      planned_time_from: null,
      planned_time_to: null,
      actual_arrival: null,
      actual_departure: null,
      contact_name: null,
      contact_phone: null,
      reference_number: null,
      notes: null,
      status: "pending",
      origin: "manual",
      form_id: null,
    };
    setEditableStops(prev => [...prev, newStop]);
  };

  const removeStop = (stopId: string) => {
    setEditableStops(prev => prev.filter(s => s.id !== stopId).map((s, idx) => ({ ...s, sequence_order: idx + 1 })));
  };

  // Reorder a stop from `fromIndex` to `toIndex` and re-stamp the
  // sequence_order field so the visible numbering badge (1, 2, 3...)
  // matches the new visual order. saveStops() already uses the array
  // index as the persisted sequence, so the new order will round-trip
  // correctly to order_stops.sequence_order on save.
  const moveStop = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setEditableStops(prev => {
      if (fromIndex < 0 || fromIndex >= prev.length) return prev;
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((s, idx) => ({ ...s, sequence_order: idx + 1 }));
    });
  };

  const saveStops = async () => {
    setSavingStops(true);
    try {
      // Delete removed stops
      const currentIds = stops.map(s => s.id);
      const editIds = editableStops.filter(s => !s.id.startsWith("new-")).map(s => s.id);
      const deletedIds = currentIds.filter(id => !editIds.includes(id));
      
      for (const id of deletedIds) {
        await supabase.from("order_stops").delete().eq("id", id);
      }

      // Update existing and insert new stops
      for (let i = 0; i < editableStops.length; i++) {
        const stop = editableStops[i];
        const payload = {
          order_id: orderId,
          sequence_order: i + 1,
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
          reference_number: stop.reference_number || null,
          notes: stop.notes || null,
          status: stop.status || "pending",
        };

        if (stop.id.startsWith("new-")) {
          await supabase.from("order_stops").insert(payload);
        } else {
          await supabase.from("order_stops").update(payload).eq("id", stop.id);
        }
      }

      await supabase.from("order_activity_log").insert({
        order_id: orderId,
        action: "stops_edited",
        details: { stops_count: editableStops.length },
        performed_by_type: "admin",
        performed_by_id: adminSession?.id,
      });

      toast({ title: "Stops saved successfully" });
      setEditingStopsMode(false);
      setEditableStops([]);
      fetchOrder();
      onStatusChange?.();
    } catch (err: any) {
      toast({ title: "Error saving stops", description: err.message, variant: "destructive" });
    } finally {
      setSavingStops(false);
    }
  };

  // Upload document to order
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !order) return;

    setUploading(true);
    try {
      // Upload to Supabase storage
      const fileName = `orders/${orderId}/${Date.now()}-${file.name}`;
      const { data: fileData, error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName);
      const fileUrl = urlData.publicUrl;

      // Insert document record
      const { error: insertError } = await supabase.from("order_documents").insert({
        order_id: orderId,
        admin_id: order.admin_id,
        document_type: uploadDocType,
        name: file.name,
        file_url: fileUrl,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by_type: "admin",
        uploaded_by_id: adminSession?.id,
        uploaded_by_name: adminSession?.name || "Admin",
      });

      if (insertError) throw insertError;

      // Log activity
      await supabase.from("order_activity_log").insert({
        order_id: orderId,
        action: "document_uploaded",
        details: { document_type: uploadDocType, file_name: file.name },
        performed_by_type: "admin",
        performed_by_id: adminSession?.id,
      });

      toast({ title: "Document uploaded", description: file.name });
      fetchOrder();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Delete document
  const handleDeleteDocument = async (docId: string, fileName: string) => {
    if (!confirm("Delete this document?")) return;
    try {
      await supabase.from("order_documents").delete().eq("id", docId);
      toast({ title: "Document deleted" });
      fetchOrder();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  // ─── Invoice Functions ───────────────────────────────────────────
  const openNewInvoiceDialog = (direction: 'outgoing' | 'incoming') => {
    setInvoiceDirection(direction);
    setEditingInvoice(null);
    setShowInvoiceDialog(true);
  };

  const openEditInvoiceDialog = async (invoice: OrderInvoice) => {
    setEditingInvoice(invoice);
    setInvoiceDirection(invoice.direction);
    // Fetch payments for this invoice
    const { data: payments } = await supabase
      .from("order_invoice_payments")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("payment_date", { ascending: false });
    setInvoicePayments(payments || []);
    setShowInvoiceDialog(true);
  };

const handleSaveInvoice = async (formData: {
    invoice_number?: string;
    external_invoice_number?: string;
    amount?: number;
    currency?: string;
    tax_rate?: number;
    issue_date?: string;
    due_date?: string;
    skonto_percentage?: number;
    skonto_days?: number;
    file_url?: string;
    business_partner_id?: string;
    _refreshOnly?: boolean;
    _skipSave?: boolean;
    }) => {
    // If just refreshing (e.g., after PDF preview close), only fetch order and close dialog
    if (formData._refreshOnly || formData._skipSave) {
      fetchOrder();
      setShowInvoiceDialog(false);
      setEditingInvoice(null);
      return;
    }
    
    console.log("[v0] handleSaveInvoice ENTER", { invoiceDirection, editingInvoiceId: editingInvoice?.id, formData });
    if (!order) {
      console.log("[v0] handleSaveInvoice EARLY EXIT — no order");
      return;
    }
    setSavingInvoice(true);
    try {
      const totalWithTax = (formData.amount ?? 0) * (1 + (formData.tax_rate || 0) / 100);
      const skontoDeadline = formData.skonto_days && formData.issue_date
        ? new Date(new Date(formData.issue_date).getTime() + formData.skonto_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : null;

      const invoiceData = {
        order_id: orderId,
        admin_id: order.admin_id,
        direction: invoiceDirection,
        invoice_number: formData.invoice_number,
        external_invoice_number: formData.external_invoice_number || null,
        amount: formData.amount,
        currency: formData.currency,
        tax_rate: formData.tax_rate,
        total_with_tax: Math.round(totalWithTax * 100) / 100,
        issue_date: formData.issue_date,
        due_date: formData.due_date,
        skonto_percentage: formData.skonto_percentage || null,
        skonto_days: formData.skonto_days || null,
        skonto_deadline: skontoDeadline,
        file_url: formData.file_url || null,
        business_partner_id: formData.business_partner_id || null,
        status: 'draft',
        paid_amount: 0,
        remaining_amount: Math.round(totalWithTax * 100) / 100,
      };
      console.log("[v0] handleSaveInvoice prepared invoiceData", invoiceData);

      if (editingInvoice) {
        console.log("[v0] handleSaveInvoice updating existing invoice", editingInvoice.id);
        const { error } = await supabase
          .from("order_invoices")
          .update(invoiceData)
          .eq("id", editingInvoice.id);
        if (error) {
          console.log("[v0] handleSaveInvoice update FAILED", error);
          throw error;
        }
        console.log("[v0] handleSaveInvoice update OK");
        toast({ title: "Invoice updated" });
      } else {
        console.log("[v0] handleSaveInvoice inserting new invoice");
        const { error } = await supabase
          .from("order_invoices")
          .insert(invoiceData);
        if (error) {
          console.log("[v0] handleSaveInvoice insert FAILED", error);
          throw error;
        }
        console.log("[v0] handleSaveInvoice insert OK");
        toast({ title: "Invoice created" });
      }

      // Log activity
      await supabase.from("order_activity_log").insert({
        order_id: orderId,
        action: editingInvoice ? "invoice_updated" : "invoice_created",
        details: { 
          invoice_number: formData.invoice_number, 
          direction: invoiceDirection,
          amount: totalWithTax 
        },
        performed_by_type: "admin",
        performed_by_id: adminSession?.id,
      });

      console.log("[v0] handleSaveInvoice SUCCESS — closing dialog and refreshing");
      setShowInvoiceDialog(false);
      fetchOrder();
    } catch (err: any) {
      console.log("[v0] handleSaveInvoice CAUGHT error", err);
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingInvoice(false);
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm("Delete this invoice?")) return;
    try {
      await supabase.from("order_invoices").delete().eq("id", invoiceId);
      toast({ title: "Invoice deleted" });
      fetchOrder();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const handleUpdateInvoiceStatus = async (invoiceId: string, status: string) => {
    try {
      const invoice = invoices.find(i => i.id === invoiceId);
      
      // If cancelling or storno a Smartbill invoice, call the Smartbill API
      if (invoice?.smartbill_series && invoice?.smartbill_number && invoice?.accounting_system === 'smartbill') {
        if (status === 'cancelled' || status === 'storno') {
          const integration = await getSmartbillIntegration();
          if (integration) {
            const response = await fetch("/api/smartbill/cancel", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                integrationId: integration.id,
                invoiceId: invoiceId,
                orderId: order?.id,
                series: invoice.smartbill_series,
                number: invoice.smartbill_number,
                cancelType: status === 'storno' ? 'storno' : 'cancel',
              }),
            });
            
            const result = await response.json();
            if (!result.success) {
              toast({ title: "Smartbill cancel failed", description: result.error, variant: "destructive" });
              return;
            }
            toast({ title: status === 'storno' ? "Invoice storno created in Smartbill" : "Invoice cancelled in Smartbill" });
            fetchOrder();
            return;
          }
        }
      }
      
      // Regular status update (non-Smartbill or non-cancel statuses).
      //
      // When the operator manually marks an invoice as paid (e.g. they
      // already collected the money in Smartbill via "incasare" and
      // just want our card to reflect that), we also need to update
      // the financial columns the Payment Progress UI reads from:
      //   • paid_amount       → equal to the invoice total
      //   • remaining_amount  → 0
      //   • paid_date         → today
      // The `order_invoices` table uses a single `status` column for
      // the lifecycle ("issued" / "paid" / "cancelled" / "storno") —
      // there's no separate `payment_status` column, so we don't write
      // one. Cancellations don't zero out `paid_amount` because that's
      // audit data the accounting team needs to reconcile against
      // bank statements.
      const updates: Record<string, any> = { status };
      if (status === 'paid' && invoice) {
        const totalDue = invoice.total_with_tax || invoice.amount || 0;
        updates.paid_amount = totalDue;
        updates.remaining_amount = 0;
        updates.paid_date = new Date().toISOString().split('T')[0];
      }
      await supabase.from("order_invoices").update(updates).eq("id", invoiceId);

      // Audit trail: every manual status change is logged so the
      // operator can later see who marked what as paid and when.
      if (order?.id) {
        await supabase.from("order_activity_log").insert({
          order_id: order.id,
          action: "invoice_status_changed",
          details: {
            invoice_id: invoiceId,
            invoice_number: invoice?.invoice_number || null,
            from: invoice?.status || null,
            to: status,
            paid_amount_after: updates.paid_amount ?? invoice?.paid_amount ?? null,
            manual: true,
          },
          performed_by_type: "admin",
          performed_by_id: adminSession?.id || null,
        }).then(() => {}).catch(() => {});
      }

      toast({ title: `Invoice marked as ${status}` });
      fetchOrder();
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
  };

  // Get Smartbill integration for PDF operations
  const getSmartbillIntegration = async () => {
    if (!adminSession?.id) return null;
    const { data } = await supabase
      .from("billing_integrations")
      .select("id")
      .eq("admin_id", adminSession.id)
      .eq("provider", "smartbill")
      .eq("is_active", true)
      .single();
    return data;
  };

  // Preview Smartbill invoice PDF
  const handlePreviewSmartbillInvoice = async (invoice: OrderInvoice) => {
    if (!invoice.smartbill_series || !invoice.smartbill_number) {
      toast({ title: "No Smartbill data", variant: "destructive" });
      return;
    }
    const integration = await getSmartbillIntegration();
    if (!integration) {
      toast({ title: "Smartbill not configured", variant: "destructive" });
      return;
    }
    // Set preview document to show inline PDF
    const pdfUrl = `/api/smartbill/invoice?series=${encodeURIComponent(invoice.smartbill_series)}&number=${encodeURIComponent(invoice.smartbill_number)}&integrationId=${encodeURIComponent(integration.id)}`;
    setPreviewDoc({
      id: invoice.id,
      name: `${invoice.smartbill_series}${invoice.smartbill_number}.pdf`,
      file_url: pdfUrl,
      document_type: 'invoice',
      created_at: invoice.issue_date || '',
      mime_type: 'application/pdf',
    });
  };

  // Download Smartbill invoice PDF
  const handleDownloadSmartbillInvoice = async (invoice: OrderInvoice) => {
    if (!invoice.smartbill_series || !invoice.smartbill_number) {
      toast({ title: "No Smartbill data", variant: "destructive" });
      return;
    }
    try {
      const integration = await getSmartbillIntegration();
      if (!integration) {
        toast({ title: "Smartbill not configured", variant: "destructive" });
        return;
      }
      const pdfUrl = `/api/smartbill/invoice?series=${encodeURIComponent(invoice.smartbill_series)}&number=${encodeURIComponent(invoice.smartbill_number)}&integrationId=${encodeURIComponent(integration.id)}`;
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error("Failed to fetch PDF");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice.smartbill_series}${invoice.smartbill_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Invoice downloaded" });
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    }
  };

  // Send invoice via email
  const handleSendInvoiceEmail = async (invoice: OrderInvoice) => {
    // Get customer email from order
    const customerEmail = order?.customer?.email;
    if (!customerEmail) {
      toast({ title: "No customer email found", variant: "destructive" });
      return;
    }
    
    // TODO: Implement email sending via system email or Smartbill
    toast({ 
      title: "Email feature", 
      description: `Would send invoice ${invoice.invoice_number} to ${customerEmail}` 
    });
  };

  const handleRecordPayment = async (invoiceId: string, paymentData: {
    amount: number;
    payment_date: string;
    payment_method: string;
    reference?: string;
    is_skonto: boolean;
    notes?: string;
  }) => {
    console.log("[v0] handleRecordPayment ENTER", { invoiceId, paymentData });
    try {
      const invoice = invoices.find(i => i.id === invoiceId);
      console.log("[v0] handleRecordPayment found invoice?", {
        invoiceFound: !!invoice,
        invoicesArrayLength: invoices.length,
        invoiceId,
      });
      if (!invoice) {
        console.log("[v0] handleRecordPayment EARLY EXIT — invoice not found in local state");
        return;
      }

      // If invoice has Smartbill data, sync payment to Smartbill first.
      // IMPORTANT: regardless of whether Smartbill sync succeeds or
      // fails, we still fall through to the local DB writes below.
      // Smartbill is the external accounting system, but the dashboard
      // card reads from our own `order_invoices` columns
      // (paid_amount, payment_status, status, paid_date), so skipping
      // those writes leaves the UI showing "issued / Paid: 0.00 /
      // Remaining: full" even though the money was successfully
      // collected in Smartbill — which was the bug reported on the
      // invoice card. Track sync success separately so the toast can
      // mention the dual-write.
      let smartbillSynced = false;
      console.log("[v0] handleRecordPayment Smartbill branch check", {
        smartbill_series: invoice.smartbill_series,
        smartbill_number: invoice.smartbill_number,
        accounting_system: invoice.accounting_system,
        willSync: !!(invoice.smartbill_series && invoice.smartbill_number && invoice.accounting_system === 'smartbill'),
      });
      if (invoice.smartbill_series && invoice.smartbill_number && invoice.accounting_system === 'smartbill') {
        const integration = await getSmartbillIntegration();
        console.log("[v0] handleRecordPayment got Smartbill integration?", { hasIntegration: !!integration });
        if (integration) {
          const response = await fetch("/api/smartbill/payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              integrationId: integration.id,
              invoiceId: invoiceId,
              orderId: order?.id,
              series: invoice.smartbill_series,
              number: invoice.smartbill_number,
              paymentData: {
                amount: paymentData.amount,
                payment_date: paymentData.payment_date,
                payment_method: paymentData.payment_method,
                notes: paymentData.notes,
              },
            }),
          });

          const result = await response.json();
          console.log("[v0] handleRecordPayment Smartbill response", { status: response.status, result });
          if (!result.success) {
            // Special case: Smartbill rejects the call because the
            // invoice is ALREADY fully collected (or stornated) on
            // their side. This happens when a previous attempt
            // succeeded server-side but the local DB write didn't run
            // (e.g. the user closed the dialog before the network
            // round-trip finished). In that case the right behaviour
            // is to treat Smartbill as already-synced and let the
            // local DB catch up — NOT to bail out with a destructive
            // toast, which is what was leaving the card stuck on
            // "issued / Paid 0.00".
            const errMsg = String(result.error || "").toLowerCase();
            const alreadyPaidOnSmartbill =
              errMsg.includes("incasata") ||
              errMsg.includes("încasată") ||
              errMsg.includes("already") && errMsg.includes("paid");
            if (alreadyPaidOnSmartbill) {
              console.log("[v0] handleRecordPayment Smartbill already paid — syncing local state");
              smartbillSynced = true;
              toast({
                title: "Already collected in Smartbill",
                description: "Updating local payment record to match.",
              });
            } else {
              toast({ title: "Smartbill sync failed", description: result.error, variant: "destructive" });
              // Continue with local save anyway so the dashboard
              // reflects the operator's intent even if Smartbill is
              // unreachable.
            }
          } else {
            smartbillSynced = true;
          }
        }
      }

      console.log("[v0] handleRecordPayment inserting into order_invoice_payments");
      // Insert payment record locally. Column names match the actual
      // `order_invoice_payments` schema:
      //   - no `currency` column on this table (currency is inherited
      //     from the parent order_invoices row)
      //   - the reference column is `reference_number`, not `reference`
      //   - `admin_id` is NOT NULL — sourced from the parent order so
      //     row-level tenant scoping stays consistent with every other
      //     table on the order graph
      //   - `created_by` is an FK to the `users` table (NOT `admins`),
      //     and our session token belongs to an admin. Since the admin
      //     doesn't have a guaranteed corresponding row in `users`, we
      //     leave this column null — the tenant is already captured
      //     by `admin_id` and the "who" can be reconstructed from the
      //     order_activity_log entry written below. Passing an admin
      //     id here is what caused the 23503 FK-violation that
      //     silently aborted the whole payment flow and left the
      //     invoice card stuck on "issued / Paid 0.00".
      // Previous mismatches caused PGRST204 / 23502 / 23503 errors.
      const { error: paymentError } = await supabase.from("order_invoice_payments").insert({
        invoice_id: invoiceId,
        admin_id: order?.admin_id ?? (invoice as any)?.admin_id ?? adminSession?.id,
        amount: paymentData.amount,
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        reference_number: paymentData.reference || null,
        is_skonto: paymentData.is_skonto,
        notes: paymentData.notes || null,
        created_by: null,
      });
      if (paymentError) {
        console.log("[v0] handleRecordPayment payment insert FAILED", paymentError);
        throw paymentError;
      }
      console.log("[v0] handleRecordPayment payment insert OK");

      // Calculate new amount paid and status. `order_invoices` has
      // one `status` column that encodes the lifecycle ������� there's no
      // separate payment_status, and `remaining_amount` is a regular
      // numeric column we maintain in tandem with `paid_amount`.
      const newPaidAmount = (invoice.paid_amount || 0) + paymentData.amount;
      const totalDue = invoice.total_with_tax || invoice.amount || 0;
      const remaining = Math.max(0, totalDue - newPaidAmount);
      const fullyPaid = newPaidAmount >= totalDue;
      const newStatus = fullyPaid ? 'paid' : invoice.status;
      console.log("[v0] handleRecordPayment computed totals", { newPaidAmount, totalDue, remaining, newStatus });

      // Update invoice
      const { error: updateError } = await supabase.from("order_invoices").update({
        paid_amount: newPaidAmount,
        remaining_amount: Math.round(remaining * 100) / 100,
        status: newStatus,
        paid_date: fullyPaid ? paymentData.payment_date : null,
      }).eq("id", invoiceId);
      if (updateError) {
        console.log("[v0] handleRecordPayment invoice update FAILED", updateError);
        throw updateError;
      }
      console.log("[v0] handleRecordPayment invoice update OK");

      console.log("[v0] handleRecordPayment SUCCESS — showing toast and refreshing order");
      toast({
        title: smartbillSynced ? "Payment recorded in Smartbill and locally" : "Payment recorded",
      });
      setShowPaymentDialog(false);
      setSelectedInvoiceForPayment(null);
      fetchOrder();
    } catch (err: any) {
      console.log("[v0] handleRecordPayment CAUGHT error", err);
      toast({ title: "Payment failed", description: err.message, variant: "destructive" });
    }
  };

  const handleUploadInvoiceFile = async (invoiceId: string, file: File) => {
    try {
      const fileName = `invoices/${orderId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName);
      
      await supabase.from("order_invoices")
        .update({ file_url: urlData.publicUrl })
        .eq("id", invoiceId);
      
      toast({ title: "Invoice file uploaded" });
      fetchOrder();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
  };

  // Toggle a checklist item and auto-compute the forwarding status from checklist state
  const toggleForwardingChecklist = async (key: string) => {
    if (!order || order.order_type !== "forwarding") return;
    const checklist = order.forwarding_checklist || {};
    const item = checklist[key];
    if (!item) return;

    const newChecked = !item.checked;
    const now = new Date().toISOString();
    const updatedChecklist = {
      ...checklist,
      [key]: { ...item, checked: newChecked, date: newChecked ? now : null },
    };

    // Determine the auto-computed status based on checklist state
    let newStatus = order.status;
    const allItems = Object.values(updatedChecklist) as { checked: boolean }[];
    const allChecked = allItems.every(i => i.checked);
    const anyChecked = allItems.some(i => i.checked);
    const docsReceived = updatedChecklist.documents_received?.checked;

    if (allChecked) {
      newStatus = "fwd_completed";
    } else if (docsReceived) {
      newStatus = "fwd_documents_received";
    } else if (anyChecked) {
      newStatus = "fwd_documents_pending";
    } else {
      newStatus = "fwd_delivered";
    }

    const statusChanged = newStatus !== order.status;
    const updates: any = { forwarding_checklist: updatedChecklist };
    if (statusChanged) updates.status = newStatus;

    const { error } = await supabase.from("orders").update(updates).eq("id", orderId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

    // Log checklist toggle + status change
    await supabase.from("order_activity_log").insert({
      order_id: orderId, action: "checklist_toggled",
      details: { item: key, checked: newChecked, status_changed: statusChanged, new_status: newStatus },
      performed_by_type: "admin", performed_by_id: adminSession?.id,
    });
    if (statusChanged) {
      await supabase.from("order_status_history").insert({
        order_id: orderId, from_status: order.status, to_status: newStatus,
        changed_by_type: "admin", changed_by: adminSession?.id,
        notes: `Checklist: ${key} ${newChecked ? "checked" : "unchecked"} by ${adminSession?.name || "Admin"}`,
      });
    }
    toast({ title: newChecked ? "Item completed" : "Item unchecked" });
    fetchOrder(); onStatusChange?.();
  };

  const fmtDate = (d: string | null) => { if (!d) return "-"; return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); };
  const fmtCurrency = (a: number | null, c: string) => { if (a == null) return "-"; return new Intl.NumberFormat("en-US", { style: "currency", currency: c || "EUR" }).format(a); };
  const fmtTime = (d: string) => new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  const tabs: { key: TabKey; label: string; count?: number; icon?: React.ReactNode }[] = [
    { key: "overview", label: "Overview" },
    { key: "stops", label: "Stops", count: stops.length },
    { key: "documents", label: "Docs", count: documents.length },
    { key: "invoices", label: "Invoices", count: invoices.length },
    { key: "expenses", label: "Expenses", count: expenses.length },
  { key: "activity", label: "Activity" },
  { key: "chat", label: "Chat", icon: <MessageSquare className="h-3 w-3" /> },
  ...(tripStopsExec.length > 0 || editTripId ? [{ key: "execution" as TabKey, label: "Execution", icon: <Navigation className="h-3 w-3" /> }] : []),
  ];

  if (loading) return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="h-5 w-40 bg-muted animate-pulse rounded" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    </div>
  );
  if (!order) return (
    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Order not found</div>
  );

  const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft;
  const isForwarding = order.order_type === "forwarding";
  const nextStatuses = isForwarding ? getForwardingNextStatuses(order.status) : getNextStatuses(order.status);
  // For forwarding orders post-delivery, checklist items drive the status
  const isChecklistPhase = isForwarding && ["fwd_delivered", "fwd_documents_pending", "fwd_documents_received", "fwd_completed"].includes(order.status);
  const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer;
  const carrier = Array.isArray(order.carrier) ? order.carrier[0] : order.carrier;
  const driver = Array.isArray(order.driver) ? order.driver[0] : order.driver;
  const vehicle = Array.isArray(order.vehicle) ? order.vehicle[0] : order.vehicle;
  const trailer = Array.isArray(order.trailer) ? order.trailer[0] : order.trailer;
  // The Order detail map should always show the ORDER's original stops
  // (pickup → delivery), never the full trip's stops. When an order rides on
  // a multi-order trip, the trip carries other orders' stops too — those
  // belong in the Trip Editor's execution view, not on the order's map.
  // Previously we tried to merge in trip swap/transshipment stops, but the
  // filter let the OTHER orders' stops through whenever their `order_stop_id`
  // wasn't populated, producing the wrong route on shared trips.
  const stopsForMap = stops;
  const mapStops = stopsForMap.filter((s: any) => s.lat && s.lng).map((s: any) => ({
    id: s.id, stop_type: s.stop_type, company_name: s.company_name || "",
    address: s.address || "", city: s.city || "", country: s.country || "",
    lat: s.lat!, lng: s.lng!, planned_date: s.planned_date || "", planned_time_from: s.planned_time_from || "",
  }));
  const isActiveOrder = isActiveStatus(order.status);

  // Calculate execution type from legs
  const allLegs = orderTrips.flatMap(t => t.legs || []);

  // Build tripLegs data for map visualization (with leg-based routing and styling)
  // If from_stop_index/to_stop_index are null, infer from leg_number (assuming sequential legs)
  const totalLegs = allLegs.length;
  const numStopsForMap = stopsForMap.length;
  const mapTripLegs = allLegs.map((leg, idx) => {
    // Use stored indices if available, otherwise calculate based on leg position
    let fromIdx = leg.from_stop_index;
    let toIdx = leg.to_stop_index;
    
    // If indices not stored, distribute stops across legs evenly
    if (fromIdx === null || fromIdx === undefined || toIdx === null || toIdx === undefined) {
      if (totalLegs === 1) {
        fromIdx = 0;
        toIdx = numStopsForMap - 1;
      } else {
        // For multiple legs, each leg covers a segment
        // Leg 1: stop 0 -> stop 1, Leg 2: stop 1 -> stop 2, etc.
        fromIdx = idx;
        toIdx = idx + 1;
      }
    }
    
    const result = {
      id: leg.id,
      leg_number: leg.leg_number,
      assignment_type: (leg.assignment_type === "forwarding" ? "forwarding" : "own_fleet") as "own_fleet" | "forwarding",
      from_stop_index: fromIdx,
      to_stop_index: toIdx,
      driver_name: leg.driver_name || undefined,
      vehicle_plate: leg.vehicle_plate || undefined,
      trailer_plate: leg.trailer_plate || undefined,
      carrier_name: leg.carrier_name || undefined,
    };
    return result;
  });
  const hasOwnFleetLegs = allLegs.some(l => l.assignment_type === "own_fleet");
  const hasSubcontractLegs = allLegs.some(l => l.assignment_type === "forwarding");
  const hasMixedExecution = hasOwnFleetLegs && hasSubcontractLegs;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header - Mobile optimized */}
      <div className={`flex items-center justify-between px-4 md:px-5 py-2 border-b border-border/50 shrink-0 bg-card ${showBackButton ? 'py-1.5' : 'py-2'}`}>
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          {/* Back button for full page view */}
          {showBackButton && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground shrink-0" onClick={onClose}>
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Orders</span>
            </Button>
          )}
          {/* Close button first on mobile for easy thumb access */}
          {!showBackButton && (
            <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden shrink-0" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-base md:text-sm tracking-tight">{order.reference_number}</h2>
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusCfg.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                <span className="hidden sm:inline">{statusCfg.label}</span>
              </span>
              {/* Show execution type badge based on actual legs */}
              {orderTrips.length > 0 && allLegs.length > 0 ? (
                hasMixedExecution ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-400 border-amber-500/30 bg-amber-500/10 hidden sm:inline-flex">
                    Mixed
                  </Badge>
                ) : hasOwnFleetLegs ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-400 border-blue-500/30 bg-blue-500/10 hidden sm:inline-flex">
                    Own Fleet
                  </Badge>
                ) : hasSubcontractLegs ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-indigo-400 border-indigo-500/30 bg-indigo-500/10 hidden sm:inline-flex">
                    Subcontract
                  </Badge>
                ) : null
              ) : (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/50 hidden sm:inline-flex">
                  {order.order_type === "internal" ? "Own Fleet" : "Forwarding"}
                </Badge>
              )}
              {(order.created_from === "ai_upload" || order.created_from === "ai_email") && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded bg-violet-500/10 text-violet-400 text-[10px]">
                  <Sparkles className="h-2.5 w-2.5" />AI
                </span>
              )}
            </div>
            {customer && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{customer.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 md:gap-1.5 shrink-0">
          {order.order_type === "forwarding" && !editing && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 md:h-7 text-xs gap-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 px-2 md:px-3"
                onClick={() => setShowSendDialog(true)}
              >
                <Send className="h-4 w-4 md:h-3 md:w-3" />
                <span className="hidden sm:inline">Send to Carrier</span>
              </Button>
              <SendToCarrierDialog
                open={showSendDialog}
                onOpenChange={setShowSendDialog}
                orderId={orderId}
                adminId={order.admin_id}
                adminName={adminSession?.name}
                onSent={() => fetchOrder()}
              />
            </>
          )}
          {/* Send Documents to Customer — only on parent orders that
              actually have a customer to send to. We hide it on
              subcontract child orders (parent_order_id set) because
              those don't have a direct customer relationship; the
              customer-facing send happens on the parent. */}
          {!editing && !order.parent_order_id && order.customer_id && (
            <>
              {/* Stack the button + tiny "already sent on …" caption
                  in a column so the caption appears directly below the
                  button. The wrapping div takes up one slot in the
                  parent flex row and aligns to its top so the button
                  stays vertically centred with the other header
                  buttons (Edit, expand, close) and the caption hangs
                  underneath without affecting their alignment. */}
              <div className="flex flex-col items-center leading-none self-start">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 md:h-7 text-xs gap-1 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 px-2 md:px-3"
                  onClick={() => setShowSendDocsDialog(true)}
                  title="Send invoices and documents from this order and its subcontracts to the customer"
                >
                  <Mail className="h-4 w-4 md:h-3 md:w-3" />
                  <span className="hidden sm:inline">Send Doc to Customer</span>
                </Button>
                {lastDocsSentAt && (
                  <span
                    className="text-[9px] text-emerald-400/80 mt-0.5 px-1 truncate max-w-[140px]"
                    title={`Last sent ${new Date(lastDocsSentAt).toLocaleString()}`}
                  >
                    Sent {new Date(lastDocsSentAt).toLocaleDateString(undefined, {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                )}
              </div>
              <SendDocsToCustomerDialog
                open={showSendDocsDialog}
                onOpenChange={setShowSendDocsDialog}
                orderId={orderId}
                adminId={order.admin_id}
                customerEmailOnFile={customer?.email || null}
                orderReference={order.reference_number || null}
                onSent={() => { fetchOrder(); refreshLastDocsSent(); }}
              />
              {/* ── Share Live Tracking ──────────────────────────────────
                  Same parent-order-only gating as Send-Docs (customers
                  don't track subcontracts; they track the shipment as a
                  whole). Button + tiny "N active" caption mirror the
                  layout used above so the header keeps a consistent
                  rhythm. */}
              <div className="flex flex-col items-center leading-none self-start">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 md:h-7 text-xs gap-1 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 px-2 md:px-3"
                  onClick={() => setShowShareTrackingDialog(true)}
                  title="Share a public live-tracking link with the customer"
                >
                  <MapPin className="h-4 w-4 md:h-3 md:w-3" />
                  <span className="hidden sm:inline">Share Tracking</span>
                </Button>
                {activeTrackingShares > 0 && (
                  <span
                    className="text-[9px] text-emerald-400/80 mt-0.5 px-1 truncate max-w-[140px]"
                    title={`${activeTrackingShares} active tracking link${activeTrackingShares === 1 ? "" : "s"}`}
                  >
                    {activeTrackingShares} active
                  </span>
                )}
              </div>
              <ShareTrackingLinkDialog
                open={showShareTrackingDialog}
                onOpenChange={(o) => {
                  setShowShareTrackingDialog(o);
                  // Refresh the badge count when the dialog closes so
                  // newly-created or revoked shares are reflected.
                  if (!o) refreshTrackingShares();
                }}
                orderId={orderId}
                adminId={order.admin_id}
                customerEmailOnFile={customer?.email || null}
                orderReference={order.reference_number || null}
              />
            </>
          )}
          {!editing ? (
            <Button variant="ghost" size="sm" className="h-9 md:h-7 text-xs gap-1 px-2 md:px-3" onClick={() => setEditing(true)}>
              <Edit2 className="h-4 w-4 md:h-3 md:w-3" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="h-9 md:h-7 text-xs gap-1 px-2 md:px-3" onClick={() => setEditing(false)}>
                <XCircle className="h-4 w-4 md:h-3 md:w-3" />
                <span className="hidden sm:inline">Cancel</span>
              </Button>
              <Button size="sm" className="h-9 md:h-7 text-xs gap-1 px-2 md:px-3" disabled={saving} onClick={saveEdits}>
                <Save className="h-4 w-4 md:h-3 md:w-3" />{saving ? "..." : <span className="hidden sm:inline">Save</span>}
              </Button>
            </>
          )}
          {!showBackButton && (
            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7 hidden md:flex" title="Open full page" onClick={() => router.push(`/admin/tms/orders/${orderId}`)}>
              <Maximize2 className="h-4 w-4 md:h-3.5 md:w-3.5" />
            </Button>
          )}
          {!showBackButton && (
            <Button variant="ghost" size="icon" className="h-7 w-7 hidden md:flex" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
          )}
        </div>
      </div>

      {/* Status Actions - Scrollable on mobile */}
      {!editing && order && (
        <div className="px-4 md:px-5 py-2 border-b border-border/50 flex items-center gap-2 shrink-0 bg-muted/10 overflow-x-auto scrollbar-hide">
          {nextStatuses.length > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium shrink-0">Move to</span>
              {nextStatuses.map(s => {
                const cfg = STATUS_CONFIG[s] || STATUS_CONFIG.draft;
                return (
                  <Button key={s} variant="outline" size="sm" className="h-8 md:h-6 text-[11px] md:text-[10px] px-3 md:px-2 border-border/50 bg-transparent hover:bg-muted/50 shrink-0" onClick={() => updateStatus(s)}>
                    {cfg.label}
                  </Button>
                );
              })}
              <div className="w-px h-4 bg-border/50 mx-1 shrink-0 hidden md:block" />
            </>
          )}
          {/* Change to any status dropdown + status guide info popover */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 md:h-6 text-[11px] md:text-[10px] px-3 md:px-2 gap-1 text-muted-foreground hover:text-foreground shrink-0">
                Change Status <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto">
              {getAllStatuses(order.order_type).map(s => {
                const cfg = STATUS_CONFIG[s] || STATUS_CONFIG.draft;
                const isCurrent = s === order.status;
                return (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => !isCurrent && updateStatus(s)}
                    className={`min-h-[44px] md:min-h-0 ${isCurrent ? "bg-muted/50 font-medium" : ""}`}
                    disabled={isCurrent}
                  >
                    <span className={`w-2 h-2 rounded-full mr-2 ${cfg.dot}`} />
                    {cfg.label}
                    {isCurrent && <span className="ml-auto text-[10px] text-muted-foreground">(current)</span>}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Status reference guide — opens a localized popover (EN/RO/DE/HU)
              explaining how parent / internal / forwarder statuses map to
              each other. Lives right next to the Change Status trigger so
              users who aren't sure which status to pick can self-serve. */}
          <StatusGuide />
        </div>
      )}

      {/* Route Map + ETA badge */}
      {mapStops.length >= 2 && (
        <div className="h-[200px] md:h-[220px] shrink-0 border-b border-border/50 relative">
          <RouteMap stops={mapStops} fullHeight hideBottomPanels tripLegs={mapTripLegs.length > 0 ? mapTripLegs : undefined} selectedLegIndex={selectedMapLegIndex} />
          {/* ETA badge */}
          {eta && isActiveOrder && (
            <div className="absolute top-2 left-2 z-10 bg-background/95 backdrop-blur border border-primary/30 rounded-lg px-2.5 py-1.5 shadow-md">
              <div className="flex items-center gap-2">
                <Navigation className="h-3.5 w-3.5 text-primary" />
                <div>
                  <p className="text-[10px] text-muted-foreground leading-none">ETA to {eta.toStopName}</p>
                  <p className="text-sm font-bold text-primary leading-tight">
                    {eta.minutes < 60 ? `${eta.minutes} min` : `${Math.floor(eta.minutes / 60)}h ${eta.minutes % 60}m`}
                    <span className="text-[10px] font-normal text-muted-foreground ml-1.5">{eta.distance} km</span>
                  </p>
                </div>
              </div>
            </div>
          )}
          {/* Route summary bar with flags - use stopsForMap for accurate count */}
          <div className="absolute bottom-2 left-2 bg-background/95 backdrop-blur-sm rounded-md px-2.5 py-1.5 flex items-center gap-1.5 text-[10px] border border-border/50 shadow-sm">
            {getCountryCode(stopsForMap[0]?.country) && (
              <img src={`https://flagcdn.com/w20/${getCountryCode(stopsForMap[0]?.country)}.png`} alt="" className="w-4 h-3 rounded-sm object-cover" />
            )}
            <span className="font-semibold text-foreground">{stopsForMap[0]?.city || "?"}</span>
            <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
            {getCountryCode(stopsForMap[stopsForMap.length - 1]?.country) && (
              <img src={`https://flagcdn.com/w20/${getCountryCode(stopsForMap[stopsForMap.length - 1]?.country)}.png`} alt="" className="w-4 h-3 rounded-sm object-cover" />
            )}
            <span className="font-semibold text-foreground">{stopsForMap[stopsForMap.length - 1]?.city || "?"}</span>
            <span className="text-muted-foreground border-l border-border/50 pl-1.5 ml-0.5">{mapStops.length} stops</span>
            {mapTripLegs.length > 1 && (
              <span className="text-muted-foreground">{mapTripLegs.length} legs</span>
            )}
          </div>
        </div>
      )}

      {/* Tabs - Horizontal scroll on mobile */}
      <div className="flex border-b border-border/50 shrink-0 bg-card overflow-x-auto scrollbar-hide">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2.5 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t.icon}
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="text-[9px] bg-muted/50 px-1 rounded">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "overview" && (
          <div className="p-4 md:p-5 space-y-4">
            {/* "Subcontracted To" summary block intentionally removed.
                The same FWD references are surfaced just below in the
                richer SUBCONTRACTS section, which additionally shows the
                carrier name and current assignment status — so the top
                block was duplicate information. Keep the lower section
                as the single source of truth on the Overview tab. */}

            {/* Driver Tracking Card (only for active orders with driver) */}
            {isActiveOrder && driver && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-primary/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Navigation className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium">Driver Tracking</span>
                  </div>
                  {eta && (
                    <span className="text-xs font-bold text-primary">
                      ETA: {eta.minutes < 60 ? `${eta.minutes}m` : `${Math.floor(eta.minutes / 60)}h ${eta.minutes % 60}m`}
                    </span>
                  )}
                </div>
                <div className="p-4 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Driver</p>
                    <p className="text-xs font-semibold mt-0.5">{driver.name}</p>
                    {driver.phone && <p className="text-[10px] text-muted-foreground">{driver.phone}</p>}
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Vehicle</p>
                    <p className="text-xs font-semibold mt-0.5">{vehicle?.plate_number || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Distance</p>
                    <p className="text-xs font-semibold mt-0.5">{eta ? `${eta.distance} km` : "-"}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Status History Timeline */}
            {statusHistory.length > 0 && (
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <div className="px-4 py-2.5 bg-muted/20 border-b border-border/30 flex items-center gap-2">
                  <Timer className="h-3.5 w-3.5 text-violet-400" />
                  <span className="text-xs font-medium">Status History</span>
                </div>
                <div className="px-4 py-3">
                  <div className="space-y-0">
                    {statusHistory.map((h, idx) => {
                      const cfg = STATUS_CONFIG[h.to_status] || STATUS_CONFIG.draft;
                      return (
                        <div key={h.id} className="flex items-start gap-3 relative">
                          {idx < statusHistory.length - 1 && <div className="absolute left-[9px] top-5 bottom-0 w-px bg-border/40" />}
                          <div className={`h-[18px] w-[18px] rounded-full flex items-center justify-center shrink-0 ${idx === 0 ? cfg.dot : "bg-muted/50"}`}>
                            {idx === 0 ? <CheckCircle2 className="h-2.5 w-2.5 text-background" /> : <Circle className="h-2 w-2 text-muted-foreground" />}
                          </div>
                          <div className="pb-3 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.color}`}>{cfg.label}</span>
                              {h.from_status && (
                                <span className="text-[10px] text-muted-foreground">from {STATUS_CONFIG[h.from_status]?.label || h.from_status}</span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {fmtTime(h.created_at)} by {h.notes || h.changed_by_type}
                            </p>
                            {h.notes && <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">{h.notes}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Carrier Document Request (FWD subcontract orders only) */}
            {/*
              Shows the live status of the two-step carrier upload portal:
              has the CMR/POD been received? has the carrier invoice been
              attached? Plus a one-click resend (with optional custom
              recipient + note) that reuses the existing token URL so any
              earlier emails the carrier still has remain valid.

              Gated by `commercial_role === "carrier_subcontract"` because
              this flow only makes sense on the FWD child order — the
              parent INT invoices the customer separately and has no
              carrier to ask for CMR/POD.
            */}
            {isForwarding && isChecklistPhase && order.commercial_role === "carrier_subcontract" && (
              <CarrierDocumentRequestCard
                orderId={order.id}
                carrierEmailOnFile={carrier?.email || null}
                adminId={adminSession?.id}
                onChange={() => { fetchOrder(); onStatusChange?.(); }}
              />
            )}

            {/* Forwarding Checklist (post-delivery phase) */}
            {isForwarding && isChecklistPhase && order.forwarding_checklist && (
              <div className="rounded-lg border border-primary/30 overflow-hidden bg-primary/5">
                <div className="px-4 py-2.5 bg-primary/10 border-b border-primary/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium">Completion Checklist</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {Object.values(order.forwarding_checklist as Record<string, { checked: boolean }>).filter(i => i.checked).length} / {Object.keys(order.forwarding_checklist).length} completed
                  </span>
                </div>
                <div className="p-3 space-y-1">
                  {FWD_CHECKLIST_ITEMS.map(item => {
                    const ci = (order.forwarding_checklist as Record<string, any>)?.[item.key];
                    if (!ci) return null;
                    const isChecked = ci.checked;
                    return (
                      <button
                        key={item.key}
                        onClick={() => toggleForwardingChecklist(item.key)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all text-left ${
                          isChecked
                            ? "bg-emerald-500/10 border border-emerald-500/30"
                            : "bg-card/50 border border-border/40 hover:border-primary/30 hover:bg-muted/30"
                        }`}
                      >
                        <div className={`h-5 w-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                          isChecked ? "bg-emerald-500 text-white" : "border-2 border-muted-foreground/30"
                        }`}>
                          {isChecked && <CheckCircle2 className="h-3 w-3" />}
                        </div>
                        <div className={`flex items-center gap-2 flex-1 ${isChecked ? "text-emerald-400" : "text-foreground"}`}>
                          <span className={isChecked ? "text-emerald-400/60" : "text-muted-foreground"}>{item.icon}</span>
                          <span className={`text-xs font-medium ${isChecked ? "line-through opacity-70" : ""}`}>{item.label}</span>
                        </div>
                        {isChecked && ci.date && (
                          <span className="text-[9px] text-muted-foreground shrink-0">{fmtDate(ci.date)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Progress bar */}
                <div className="px-4 pb-3">
                  {(() => {
                    const total = Object.keys(order.forwarding_checklist).length;
                    const done = Object.values(order.forwarding_checklist as Record<string, { checked: boolean }>).filter(i => i.checked).length;
                    const pct = total > 0 ? (done / total) * 100 : 0;
                    return (
                      <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? "bg-emerald-500" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

          {/* Execution Type used to live here as an Own-Fleet / Forwarding
              toggle in edit mode, but execution is now driven exclusively by
              the trip-leg assignments under the Execution tab. The original
              order's commercial role doesn't change when its leg gets
              subcontracted, so editing this field here was misleading and
              risked corrupting the order's status. The current execution
              type is still surfaced as a read-only badge above. */}

{/* Parent Order Link (for subcontracts) */}
                {order.commercial_role === "carrier_subcontract" && order.parent_order && (
            <div className="mb-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <label className="text-[10px] text-orange-400 uppercase tracking-wider block mb-2">Parent Order</label>
              <div 
                className="flex items-center justify-between p-2 rounded-lg bg-background/50 cursor-pointer hover:bg-background/80 transition-colors"
                onClick={() => router.push(`/admin/tms/orders/${order.parent_order.id}`)}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">{order.parent_order.reference_number}</Badge>
                  <span className="text-xs text-muted-foreground">Customer Order</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Subcontracts Section (for customer orders with child forwarding orders)
              We filter out FWDs in 'cancelled' status — they were either removed
              by the operator (and their hard delete fell back to a soft-cancel
              because of FK constraints), or they originate from before the
              hard-delete behaviour shipped. In both cases the operator does
              not want a ghost row in their Overview; the canonical place to
              find cancelled FWDs is the Forwarding Orders list view itself. */}
          {(() => {
            const activeSubcontracts = subcontracts.filter((sub: any) => sub.status !== "cancelled");
            if (activeSubcontracts.length === 0) return null;
            return (
              <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <label className="text-[10px] text-amber-400 uppercase tracking-wider block mb-2">
                  Subcontracts ({activeSubcontracts.length})
                </label>
                <div className="space-y-1.5">
                  {activeSubcontracts.map((sub: any) => (
                    <div 
                      key={sub.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-background/50 cursor-pointer hover:bg-background/80 transition-colors"
                      onClick={() => router.push(`/admin/tms/orders/${sub.id}`)}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-mono bg-orange-500/10 text-orange-400 border-orange-500/20">
                          {sub.reference_number}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {sub.carrier?.name || "No carrier"}
                        </span>
                        {sub.carrier_cost && (
                          <span className="text-xs font-medium text-orange-400">
                            {sub.carrier_currency || "EUR"} {sub.carrier_cost}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[8px] ${STATUS_CONFIG[sub.status]?.color || "bg-muted text-muted-foreground"}`}>
                          {STATUS_CONFIG[sub.status]?.label || sub.status}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Commercial */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 hover:bg-muted/30 rounded-md px-2 -mx-2 transition-colors">
              <DollarSign className="h-4 w-4 text-primary" />
<span className="text-xs font-medium">Commercial</span>
            </CollapsibleTrigger>
<CollapsibleContent>
  <div className="p-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Customer</label>
                    {editing ? (
                      <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full h-9 justify-between font-normal">
                            {editData.customer_id ? partners.find(p => p.id === editData.customer_id)?.name : <span className="text-muted-foreground">Select customer...</span>}
                            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search customer..." value={customerSearchValue} onValueChange={setCustomerSearchValue} />
                            <CommandList>
                              <CommandEmpty>No customer found</CommandEmpty>
                              <CommandGroup>
                                <CommandItem value="none" onSelect={() => { setEditData((p: any) => ({ ...p, customer_id: null })); setCustomerSearchOpen(false); }}>
                                  <span className="text-muted-foreground">No customer</span>
                                </CommandItem>
                                {partners.filter(p => p.types?.includes("customer") && p.name.toLowerCase().includes(customerSearchValue.toLowerCase())).map(p => (
                                  <CommandItem key={p.id} value={p.name} onSelect={() => { setEditData((prev: any) => ({ ...prev, customer_id: p.id })); setCustomerSearchOpen(false); }}>
                                    <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                                    {p.name}
                                    {editData.customer_id === p.id && <Check className="h-4 w-4 ml-auto" />}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    ) : <p className="text-sm font-medium">{customer?.name || "-"}</p>}
                  </div>
  <div>
  <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Customer Reference</label>
  {editing ? (
  <Input className="h-8 text-xs" value={editData.customer_reference || ""} onChange={e => setEditData((p: any) => ({ ...p, customer_reference: e.target.value }))} placeholder="Customer order name..." />
  ) : <p className="text-sm font-medium">{order.customer_reference || "-"}</p>}
  </div>
  <div className="col-span-2 space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Customer Pricing</label>
                  {editing ? (
                    /* Edit mode for the customer side renders the price + currency,
                       then a 2nd row with VAT type / VAT rate / payment terms.
                       All four feed into the shared `editData` map and are persisted
                       by `saveEdits`, which also derives *_vat_amount / *_with_vat /
                       *_without_vat so the document and Financial Summary stay in sync. */
                    <div className="space-y-1.5">
                      <div className="flex gap-1.5">
                        <Input type="number" className="h-8 text-xs flex-1" value={editData.customer_price || ""} onChange={e => setEditData((p: any) => ({ ...p, customer_price: e.target.value }))} />
                        <Select value={editData.customer_currency} onValueChange={v => setEditData((p: any) => ({ ...p, customer_currency: v }))}>
                          <SelectTrigger className="h-8 text-xs w-[70px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{["EUR", "RON", "USD", "GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div>
                          <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5 block">VAT Type</label>
                          <Select
                            value={editData.customer_vat_type || "excluding"}
                            onValueChange={v => setEditData((p: any) => ({ ...p, customer_vat_type: v }))}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="excluding">Excl. VAT (net)</SelectItem>
                              <SelectItem value="including">Incl. VAT (gross)</SelectItem>
                              <SelectItem value="exempt">Exempt (scutit)</SelectItem>
                              <SelectItem value="reverse_charge">Reverse charge</SelectItem>
                              <SelectItem value="non_taxable">Non-taxable</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5 block">VAT %</label>
                          <Select
                            value={String(editData.customer_vat_rate ?? 21)}
                            onValueChange={v => setEditData((p: any) => ({ ...p, customer_vat_rate: Number(v) }))}
                            disabled={["exempt", "reverse_charge", "non_taxable"].includes(editData.customer_vat_type || "excluding")}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{[0, 5, 9, 19, 21].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5 block">Payment (days)</label>
                          <Input
                            type="number" min={0} max={365}
                            className="h-8 text-xs"
                            placeholder="30"
                            value={editData.payment_terms_customer_days ?? ""}
                            onChange={e => setEditData((p: any) => ({ ...p, payment_terms_customer_days: e.target.value === "" ? null : Number(e.target.value) }))}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          {order.customer_vat_type === "including" ? "Price (incl. VAT)" : "Net Price"}
                        </span>
                        <span className="font-medium">{fmtCurrency(order.customer_price, order.customer_currency)}</span>
                      </div>
                      {!["exempt", "reverse_charge", "non_taxable"].includes(order.customer_vat_type || "excluding") && (
                        <>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">VAT ({order.customer_vat_rate || 21}%)</span>
                            <span className="font-medium">{fmtCurrency(order.customer_vat_amount, order.customer_currency)}</span>
                          </div>
                          <div className="flex justify-between text-xs pt-1 border-t border-border/30">
                            <span className="font-medium">{order.customer_vat_type === "including" ? "Net" : "Total"}</span>
                            <span className="font-semibold text-emerald-400">
                              {fmtCurrency(order.customer_vat_type === "including" ? order.customer_price_without_vat : order.customer_price_with_vat, order.customer_currency)}
                            </span>
                          </div>
                        </>
                      )}
                      {order.customer_vat_type === "exempt" && (
                        <p className="text-[10px] text-amber-500">VAT exempt (scutit de TVA)</p>
                      )}
                      {order.customer_vat_type === "reverse_charge" && (
                        <p className="text-[10px] text-amber-500">Reverse charge (taxare inversă)</p>
                      )}
                      {order.customer_vat_type === "non_taxable" && (
                        <p className="text-[10px] text-blue-400">Non-taxable (export)</p>
                      )}
                      {/* Payment terms — extracted from the customer's
                          PDF (or set manually in edit mode) and stored
                          in `payment_terms_customer_days`. Shown here
                          so the operator can see at a glance how soon
                          this invoice is due, without opening the
                          edit drawer. */}
                      <div className="flex justify-between text-xs pt-1 border-t border-border/30">
                        <span className="text-muted-foreground">Payment terms</span>
                        <span className="font-medium">
                          {order.payment_terms_customer_days != null
                            ? `${order.payment_terms_customer_days} days`
                            : <span className="text-muted-foreground/70">Not set</span>}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {/* Carrier info only shown for carrier_subcontract orders (FWD orders sent to carriers).
                    A subtle col-span-2 divider with a "Carrier" chip visually separates the
                    customer-facing pricing above from the carrier-facing pricing below, so the
                    operator never confuses the two sides of the forwarding spread. */}
                {order.commercial_role === "carrier_subcontract" && (
                  <>
                    <div className="col-span-2 relative flex items-center justify-center my-2 select-none" aria-hidden="true">
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                      <div className="relative flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 backdrop-blur-sm">
                        <Truck className="h-3 w-3 text-amber-500" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">Carrier</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Carrier</label>
                      {editing ? (
                        <Popover open={carrierSearchOpen} onOpenChange={setCarrierSearchOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full h-9 justify-between font-normal">
                              {editData.carrier_id ? partners.find(p => p.id === editData.carrier_id)?.name : <span className="text-muted-foreground">Select carrier...</span>}
                              <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search carrier..." value={carrierSearchValue} onValueChange={setCarrierSearchValue} />
                              <CommandList>
                                <CommandEmpty>No carrier found</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem value="none" onSelect={() => { setEditData((p: any) => ({ ...p, carrier_id: null })); setCarrierSearchOpen(false); }}>
                                    <span className="text-muted-foreground">No carrier</span>
                                  </CommandItem>
                                  {partners.filter(p => p.types?.includes("carrier") && p.name.toLowerCase().includes(carrierSearchValue.toLowerCase())).map(p => (
                                    <CommandItem key={p.id} value={p.name} onSelect={() => { setEditData((prev: any) => ({ ...prev, carrier_id: p.id })); setCarrierSearchOpen(false); }}>
                                      <Truck className="h-4 w-4 mr-2 text-muted-foreground" />
                                      {p.name}
                                      {editData.carrier_id === p.id && <Check className="h-4 w-4 ml-auto" />}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      ) : <p className="text-sm font-medium">{carrier?.name || "-"}</p>}
                    </div>
                    <div>
                      {/* Header row: label + Determine-Cost trigger.
                          The trigger only shows in edit mode because the
                          dialog writes back into editData (which only exists
                          while the user is actively editing the order). */}
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider block">Carrier Cost</label>
                        {editing && (
                          <button
                            type="button"
                            onClick={() => setDetermineCostOpen(true)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                            title="Open the calculator: pick a unit, pull GPS distance, choose a pricing rule, save the breakdown."
                          >
                            <Calculator className="h-3 w-3" />
                            Determine cost
                          </button>
                        )}
                      </div>
                      {editing ? (
                        /* Symmetric to the customer block: cost + currency, then
                           VAT type / VAT rate / carrier payment-term days. The
                           {{payment_terms_carrier_days}} placeholder used in the
                           Romanian Comandă de Transport template is sourced from
                           this exact field after saveEdits writes it back. */
                        <div className="space-y-1.5">
                          <div className="flex gap-1.5">
                            <Input type="number" className="h-8 text-xs flex-1" value={editData.carrier_cost || ""} onChange={e => setEditData((p: any) => ({ ...p, carrier_cost: e.target.value }))} />
                            <Select value={editData.carrier_currency} onValueChange={v => setEditData((p: any) => ({ ...p, carrier_currency: v }))}>
                              <SelectTrigger className="h-8 text-xs w-[70px]"><SelectValue /></SelectTrigger>
                              <SelectContent>{["EUR", "RON", "USD", "GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <div>
                              <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5 block">VAT Type</label>
                              <Select
                                value={editData.carrier_vat_type || "excluding"}
                                onValueChange={v => setEditData((p: any) => ({ ...p, carrier_vat_type: v }))}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="excluding">Excl. VAT (net)</SelectItem>
                                  <SelectItem value="including">Incl. VAT (gross)</SelectItem>
                                  <SelectItem value="exempt">Exempt (scutit)</SelectItem>
                                  <SelectItem value="reverse_charge">Reverse charge</SelectItem>
                                  <SelectItem value="non_taxable">Non-taxable</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5 block">VAT %</label>
                              <Select
                                value={String(editData.carrier_vat_rate ?? 21)}
                                onValueChange={v => setEditData((p: any) => ({ ...p, carrier_vat_rate: Number(v) }))}
                                disabled={["exempt", "reverse_charge", "non_taxable"].includes(editData.carrier_vat_type || "excluding")}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>{[0, 5, 9, 19, 21].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5 block">Payment (days)</label>
                              <Input
                                type="number" min={0} max={365}
                                className="h-8 text-xs"
                                placeholder="30"
                                value={editData.payment_terms_carrier_days ?? ""}
                                onChange={e => setEditData((p: any) => ({ ...p, payment_terms_carrier_days: e.target.value === "" ? null : Number(e.target.value) }))}
                              />
                            </div>
                          </div>
                          {/* Free-text Observații / Mențiuni speciale that prints
                              right under the Payment Terms line on the carrier
                              order document. The PDF renderer reads it via the
                              `{{carrier_payment_notes}}` placeholder configured
                              in the Comandă de Transport (RO) template. */}
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5 block">
                              Order Notes / Observații (printed on document)
                            </label>
                            <Textarea
                              className="min-h-[60px] text-xs resize-y"
                              placeholder="e.g. Plata se efectuează în baza CMR și avizului semnate. Confirmare obligatorie la încărcare prin telefon."
                              value={editData.carrier_payment_notes ?? ""}
                              onChange={e => setEditData((p: any) => ({ ...p, carrier_payment_notes: e.target.value }))}
                            />
                          </div>
                        </div>
                      ) : (
                        /* Compact read-only carrier summary mirroring the customer
                           pricing card so the user immediately sees net / VAT /
                           gross + payment-term days without entering edit mode. */
                        <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              {order.carrier_vat_type === "including" ? "Cost (incl. VAT)" : "Net Cost"}
                            </span>
                            <span className="font-medium text-red-400">{fmtCurrency(order.carrier_cost, order.carrier_currency)}</span>
                          </div>
                          {!["exempt", "reverse_charge", "non_taxable"].includes(order.carrier_vat_type || "excluding") && (
                            <>
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">VAT ({order.carrier_vat_rate ?? 21}%)</span>
                                <span className="font-medium">{fmtCurrency(order.carrier_vat_amount, order.carrier_currency)}</span>
                              </div>
                              <div className="flex justify-between text-xs pt-1 border-t border-border/30">
                                <span className="font-medium">{order.carrier_vat_type === "including" ? "Net" : "Total"}</span>
                                <span className="font-semibold text-red-400">
                                  {fmtCurrency(order.carrier_vat_type === "including" ? order.carrier_cost_without_vat : order.carrier_cost_with_vat, order.carrier_currency)}
                                </span>
                              </div>
                            </>
                          )}
                          {order.carrier_vat_type === "exempt" && (
                            <p className="text-[10px] text-amber-500">VAT exempt (scutit de TVA)</p>
                          )}
                          {order.carrier_vat_type === "reverse_charge" && (
                            <p className="text-[10px] text-amber-500">Reverse charge (taxare inversă)</p>
                          )}
                          {order.carrier_vat_type === "non_taxable" && (
                            <p className="text-[10px] text-blue-400">Non-taxable (export)</p>
                          )}
                          <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                            Payment terms: {order.payment_terms_carrier_days ?? 30} days
                          </p>
                          {order.carrier_payment_notes && (
                            <div className="text-[10px] text-foreground/80 pt-1 border-t border-border/30 whitespace-pre-line bg-amber-500/5 rounded px-1.5 py-1 border-l-2 border-amber-500/40">
                              {order.carrier_payment_notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* ── Vehicle, Trailer & Driver (subcontractor fleet) ──
                        Inline-editable card mirroring the look of the
                        Carrier card. Values are sourced from / written
                        back to the parent order's trip-leg via
                        forwarding_order_legs (and mirrored to this FWD's
                        own leg). The PDF renderer picks these up via
                        the `vehicle_info` template block and prints them
                        as "Vehicul / Remorcă / Șofer" on the Comandă de
                        Transport document. */}
                    <div className="col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider block">
                          Vehicle, Trailer &amp; Driver
                        </label>
                        {!editing && (editData.subcontractor_vehicle_plate || editData.subcontractor_trailer_plate || editData.subcontractor_driver_name || editData.subcontractor_driver_phone) && (
                          <span className="text-[9px] text-muted-foreground italic">
                            From parent order leg
                          </span>
                        )}
                      </div>
                      {editing ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5 block">Vehicle plate</label>
                            <Input
                              className="h-8 text-xs"
                              placeholder="e.g. BH37CBE"
                              value={editData.subcontractor_vehicle_plate ?? ""}
                              onChange={(e) => setEditData((p: any) => ({ ...p, subcontractor_vehicle_plate: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5 block">Trailer plate</label>
                            <Input
                              className="h-8 text-xs"
                              placeholder="e.g. MS07CDP"
                              value={editData.subcontractor_trailer_plate ?? ""}
                              onChange={(e) => setEditData((p: any) => ({ ...p, subcontractor_trailer_plate: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5 block">Driver name</label>
                            <Input
                              className="h-8 text-xs"
                              placeholder="e.g. Ion Popescu"
                              value={editData.subcontractor_driver_name ?? ""}
                              onChange={(e) => setEditData((p: any) => ({ ...p, subcontractor_driver_name: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5 block">Driver phone</label>
                            <Input
                              className="h-8 text-xs"
                              placeholder="e.g. +40 712 345 678"
                              value={editData.subcontractor_driver_phone ?? ""}
                              onChange={(e) => setEditData((p: any) => ({ ...p, subcontractor_driver_phone: e.target.value }))}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5 grid grid-cols-2 md:grid-cols-3 gap-3">
                          <div>
                            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Vehicle</div>
                            <div className="text-xs font-medium">{editData.subcontractor_vehicle_plate || "—"}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Trailer</div>
                            <div className="text-xs font-medium">{editData.subcontractor_trailer_plate || "—"}</div>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Driver</div>
                            <div className="text-xs font-medium">
                              {editData.subcontractor_driver_name || "—"}
                              {editData.subcontractor_driver_phone && (
                                <span className="text-muted-foreground"> · {editData.subcontractor_driver_phone}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {order.margin != null && !editing && (
                      <div className="col-span-2 flex items-center justify-between bg-muted/20 rounded-md px-3 py-2">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Margin</span>
                        <span className={`text-sm font-bold ${order.margin >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtCurrency(order.margin, order.customer_currency)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Execution - Shows trips/legs and how order is being executed */}
          {orderTrips.length > 0 && (() => {
            // Get all legs across all trips with global numbering
            const allLegs: Array<{leg: any; globalIndex: number; tripIdx: number}> = [];
            orderTrips.forEach((t, tripIdx) => {
              (t.legs || []).forEach((leg: any) => {
                allLegs.push({ leg, globalIndex: allLegs.length + 1, tripIdx });
              });
            });
            const hasOwnFleet = allLegs.some(l => l.leg.assignment_type === "own_fleet");
            const hasSubcontract = allLegs.some(l => l.leg.assignment_type === "forwarding");
            const hasMixed = hasOwnFleet && hasSubcontract;
            
            return (
            <div className="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden">
              <div className="px-4 py-2.5 bg-primary/10 border-b border-primary/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Navigation className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium">Execution</span>
                </div>
                <div className="flex items-center gap-1">
                  {hasMixed ? (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-amber-400 border-amber-500/30 bg-amber-500/10">
                      Mixed
                    </Badge>
                  ) : hasOwnFleet ? (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-blue-400 border-blue-500/30 bg-blue-500/10">
                      Own Fleet
                    </Badge>
                  ) : hasSubcontract ? (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-indigo-400 border-indigo-500/30 bg-indigo-500/10">
                      Subcontract
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="p-3 space-y-2">
                {/* Show all legs with global numbering */}
                {allLegs.map(({ leg, globalIndex }) => (
                  <div 
                    key={leg.id} 
                    className="rounded-md border border-border/40 bg-card/50 p-3 hover:bg-card/80 cursor-pointer transition-colors"
                    onClick={() => setActiveTab("execution")}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-medium">Leg {globalIndex}</span>
                        <Badge 
                          variant="outline" 
                          className={`text-[9px] px-1.5 py-0 h-4 ${
                            leg.assignment_type === "own_fleet" 
                              ? "text-blue-400 border-blue-500/30 bg-blue-500/10" 
                              : leg.assignment_type === "forwarding"
                              ? "text-indigo-400 border-indigo-500/30 bg-indigo-500/10"
                              : "text-muted-foreground border-muted bg-muted/50"
                          }`}
                        >
                          {leg.assignment_type === "own_fleet" ? "Own Fleet" : leg.assignment_type === "forwarding" ? "Subcontract" : "Undecided"}
                        </Badge>
                      </div>
                      <div className="flex items-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {leg.assignment_type === "forwarding" && leg.forwarding_order_id ? (
                          /* Subcontracted leg — Forwarder is the source of
                           * truth. We hide the Internal chip to avoid
                           * confusing operators with two stacked statuses
                           * for the same physical movement; the leg's
                           * internal status is mirrored automatically via
                           * forwarderToInternal(). */
                          (() => {
                            const fwd = subcontracts.find((s: any) => s.id === leg.forwarding_order_id);
                            const fwdStatus: string = fwd?.status || "fwd_unassigned";
                            return (
                              <LegStatusChip
                                scope="forwarder"
                                value={fwdStatus}
                                contextLabel={fwd?.reference_number || "subcontract"}
                                /* Subcontracted legs are owned by the FWD child
                                 * order — the carrier's lifecycle is the source
                                 * of truth. We render the chip read-only here
                                 * so ops are forced to open the FWD order to
                                 * change status, which keeps the two records
                                 * from drifting apart. */
                                readOnly
                                onChange={async (next) => {
                                  const { error } = await supabase
                                    .from("orders")
                                    .update({ status: next })
                                    .eq("id", leg.forwarding_order_id);
                                  if (error) {
                                    toast({ title: "Error", description: error.message, variant: "destructive" });
                                    return;
                                  }
                                  // Mirror to leg via same-rank twin so the orders
                                  // list secondary chip stays in sync.
                                  const twin = forwarderToInternal(next);
                                  if (twin) {
                                    await supabase.from("trip_legs").update({ status: twin }).eq("id", leg.id);
                                  }
                                  // Recompute parent client-side (SQL trigger may
                                  // miss legacy rows without execution_trip_id).
                                  if (order?.id) {
                                    await recomputeParentStatus(supabase, order.id, leg.trip_id ?? null);
                                  }
                                  toast({ title: "Forwarder status updated", description: `${fwd?.reference_number || "FWD"} → ${next.replace(/^fwd_/, "").replace(/_/g, " ")}` });
                                  fetchOrder();
                                  onStatusChange?.();
                                }}
                              />
                            );
                          })()
                        ) : (
                          /* Own-fleet or undecided leg — Internal scope only. */
                          <LegStatusChip
                            scope="internal"
                            value={leg.status || "unassigned"}
                            contextLabel={`Leg ${globalIndex}`}
                            /* Until the operator picks an execution method
                             * (own_fleet or forwarding), there is nothing to
                             * dispatch — locking the chip prevents bogus
                             * status changes on a leg that has no resources
                             * and no FWD child to mirror to. */
                            readOnly={!leg.assignment_type || leg.assignment_type === "undecided"}
                            onChange={async (next) => {
                              const { error } = await supabase
                                .from("trip_legs")
                                .update({ status: next })
                                .eq("id", leg.id);
                              if (error) {
                                toast({ title: "Error", description: error.message, variant: "destructive" });
                                return;
                              }
                              if (order?.id) {
                                await recomputeParentStatus(supabase, order.id, leg.trip_id ?? null);
                              }
                              toast({ title: "Leg status updated", description: `Leg ${globalIndex} → ${next.replace(/_/g, " ")}` });
                              fetchOrder();
                              onStatusChange?.();
                            }}
                          />
                        )}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground self-center" />
                      </div>
                    </div>
                    
                    {leg.assignment_type === "own_fleet" ? (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className={`truncate ${leg.driver_name ? "text-foreground" : "text-amber-400"}`}>
                            {leg.driver_name || "Unassigned"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className={`truncate ${leg.vehicle_plate ? "text-foreground" : "text-amber-400"}`}>
                            {leg.vehicle_plate || "Unassigned"}
                          </span>
                        </div>
                      </div>
                    ) : leg.assignment_type === "forwarding" ? (
                      <div className="flex items-center text-xs">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3 w-3 text-indigo-400 shrink-0" />
                          <span className={leg.carrier_name ? "text-indigo-400" : "text-amber-400"}>
                            {leg.carrier_name || "Carrier unassigned"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Execution method pending
                      </div>
                    )}
                  </div>
                ))}
                {/* Fallback for orders without any legs - show trips directly */}
                {allLegs.length === 0 && orderTrips.map((trip, tripIdx) => (
                    <div 
                      key={trip.id} 
                      className="rounded-md border border-border/40 bg-card/50 p-3 hover:bg-card/80 cursor-pointer transition-colors"
                      onClick={() => setActiveTab("execution")}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground font-medium">Round Trip {tripIdx + 1}</span>
                          <Badge 
                            variant="outline" 
                            className={`text-[9px] px-1.5 py-0 h-4 ${
                              trip.assignment_type === "internal" 
                                ? "text-blue-400 border-blue-500/30 bg-blue-500/10" 
                                : "text-indigo-400 border-indigo-500/30 bg-indigo-500/10"
                            }`}
                          >
                            {trip.assignment_type === "internal" ? "Own Fleet" : "Forwarding"}
                          </Badge>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      
                      {trip.assignment_type === "internal" ? (
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{trip.driver?.name || "Unassigned"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Truck className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{trip.vehicle?.plate_number || "Unassigned"}</span>
                          </div>
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              trip.status === "completed" ? "bg-emerald-500/10 text-emerald-400" :
                              trip.status === "in_progress" ? "bg-amber-500/10 text-amber-400" :
                              trip.status === "planned" ? "bg-blue-500/10 text-blue-400" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {trip.status?.replace(/_/g, " ") || "Planned"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3 w-3 text-indigo-400 shrink-0" />
                            <span className="text-indigo-400">
                              {order.order_type === "forwarding" 
                                ? (carrier?.name || "No carrier") 
                                : (trip.carrier?.name || "No carrier")}
                            </span>
                          </div>
                          {trip.forwarding_order_id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/admin/tms/orders/${trip.forwarding_order_id}`);
                              }}
                              className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                            >
                              <FileText className="h-3 w-3" />
                              <span className="text-[10px]">{trip.forwarding_order_ref || "FWD Order"}</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                ))}
              </div>
            </div>
            );
          })()}

          {/* No Execution - Show inline Create Execution panel (not for FWD orders which have carrier assigned at order level) */}
          {orderTrips.length === 0 && order.order_type !== "forwarding" && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden">
              <div className="px-4 py-2.5 bg-primary/10 border-b border-primary/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Navigation className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium">Create Execution</span>
                </div>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-xs text-muted-foreground">Choose how this order will be executed:</p>
                
                {/* Execution Type Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={async () => {
                      // Create internal trip (own fleet)
                      const { data: newTrip, error } = await supabase
                        .from("trips")
                        .insert({
                          admin_id: order.admin_id,
                          reference_number: `TRIP-${Date.now()}`,
                          assignment_type: "internal",
                          status: "planned",
                          from_stop_index: 0,
                          to_stop_index: stops.length - 1,
                        })
                        .select()
                        .single();
                      
                      if (newTrip && !error) {
                        // Link trip to order
                        await supabase.from("trip_orders").insert({ trip_id: newTrip.id, order_id: orderId });
                        
                        // Copy order stops to trip stops
                        const tripStops = stops.map((s, idx) => ({
                          trip_id: newTrip.id,
                          order_stop_id: s.id,
                          order_id: orderId,
                          sequence_order: idx,
                          stop_type: s.stop_type,
                          company_name: s.company_name,
                          address: s.address,
                          city: s.city,
                          country: s.country,
                          postal_code: s.postal_code,
                          lat: s.lat,
                          lng: s.lng,
                          planned_date: s.planned_date,
                          planned_time_from: s.planned_time_from,
                          planned_time_to: s.planned_time_to,
                          notes: s.notes,
                          status: "pending",
                        }));
                        await supabase.from("trip_stops").insert(tripStops);
                        
                        // Auto-create Leg 1 covering the entire trip
                        await supabase.from("trip_legs").insert({
                          trip_id: newTrip.id,
                          leg_number: 1,
                          assignment_type: "own_fleet",
                          status: "planned",
                          from_stop_index: 0,
                          to_stop_index: stops.length - 1,
                        });
                        
                        toast({ title: "Trip created", description: "Internal execution created. Click on Leg 1 to assign driver and vehicle." });
                        fetchOrder(); // Refresh to show the new trip
                        setActiveTab("execution"); // Switch to execution tab
                      } else {
                        toast({ title: "Error creating trip", description: error?.message, variant: "destructive" });
                      }
                    }}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 transition-colors cursor-pointer"
                  >
                    <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Truck className="h-5 w-5 text-blue-400" />
                    </div>
                    <span className="text-sm font-medium">Own Fleet</span>
                    <span className="text-[10px] text-muted-foreground text-center">Execute with your drivers and vehicles</span>
                  </button>
                  
                  <button
                    onClick={async () => {
                      // Create trip with undecided leg - FWD order creation happens in Trip Leg Assignment dialog
                      const { data: newTrip, error: tripError } = await supabase
                        .from("trips")
                        .insert({
                          admin_id: order.admin_id,
                          reference_number: `TRIP-${Date.now()}`,
                          assignment_type: "forwarding",
                          status: "planned",
                          from_stop_index: 0,
                          to_stop_index: stops.length - 1,
                        })
                        .select()
                        .single();
                      
                      if (newTrip && !tripError) {
                        // Link trip to order
                        await supabase.from("trip_orders").insert({ trip_id: newTrip.id, order_id: orderId });
                        
                        // Copy order stops to trip stops
                        const tripStops = stops.map((s, idx) => ({
                          trip_id: newTrip.id,
                          order_stop_id: s.id,
                          order_id: orderId,
                          sequence_order: idx,
                          stop_type: s.stop_type,
                          company_name: s.company_name,
                          address: s.address,
                          city: s.city,
                          country: s.country,
                          postal_code: s.postal_code,
                          lat: s.lat,
                          lng: s.lng,
                          planned_date: s.planned_date,
                          planned_time_from: s.planned_time_from,
                          planned_time_to: s.planned_time_to,
                          notes: s.notes,
                          status: "pending",
                        }));
                        await supabase.from("trip_stops").insert(tripStops);
                        
                        // Create trip_leg entry with forwarding type (but no FWD order yet - that happens in leg assignment dialog)
                        await supabase.from("trip_legs").insert({
                          trip_id: newTrip.id,
                          leg_number: 1,
                          assignment_type: "forwarding",
                          from_stop_index: 0,
                          to_stop_index: stops.length - 1,
                          status: "planned",
                        });
                        
                        toast({ title: "Execution created", description: "Click on the leg to assign a carrier and create FWD order." });
                        fetchOrder();
                        setActiveTab("execution");
                      } else {
                        toast({ title: "Error creating trip", description: tripError?.message, variant: "destructive" });
                      }
                    }}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                  >
                    <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-indigo-400" />
                    </div>
                    <span className="text-sm font-medium">Forwarding</span>
                    <span className="text-[10px] text-muted-foreground text-center">Subcontract to external carrier</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FWD Order Execution Summary - only show if no orderTrips (to avoid duplicate with generic execution section) */}
          {order.order_type === "forwarding" && orderTrips.length === 0 && (
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 overflow-hidden">
              <div className="px-4 py-2.5 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Navigation className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="text-xs font-medium">Execution</span>
                </div>
                <Badge variant="outline" className="text-[10px] bg-indigo-500/10 border-indigo-500/30 text-indigo-400">
                  Subcontract
                </Badge>
              </div>
              <div className="p-4 space-y-3">
                {/* Carrier info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-indigo-400" />
                    <span className="text-sm font-medium">{carrier?.name || "No carrier assigned"}</span>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${
                    order.status === "fwd_completed" ? "bg-emerald-500/10 text-emerald-400" :
                    order.status === "fwd_in_progress" ? "bg-amber-500/10 text-amber-400" :
                    order.status === "fwd_assigned_to_carrier" ? "bg-blue-500/10 text-blue-400" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {order.status?.replace(/fwd_/g, "").replace(/_/g, " ") || "planned"}
                  </Badge>
                </div>
                
                {/* Leg 1 display */}
                <div className="rounded-lg bg-background/50 border border-border/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Leg 1</span>
                      <Badge variant="outline" className="text-[9px] bg-indigo-500/10 text-indigo-400 border-indigo-500/30">
                        Subcontract
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{stops[0]?.city || "?"}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>{stops[stops.length - 1]?.city || "?"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

            {/* Cargo */}
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/20 border-b border-border/30 flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs font-medium">Cargo</span>
              </div>
              <div className="p-4">
                {editing ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Description</label>
                      <Input className="h-8 text-xs" value={editData.cargo_description || ""} onChange={e => setEditData((p: any) => ({ ...p, cargo_description: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Weight (kg)</label>
                      <Input type="number" className="h-8 text-xs" value={editData.weight_kg || ""} onChange={e => setEditData((p: any) => ({ ...p, weight_kg: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Pallets</label>
                      <Input type="number" className="h-8 text-xs" value={editData.pallet_count || ""} onChange={e => setEditData((p: any) => ({ ...p, pallet_count: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Loading Meters</label>
                      <Input type="number" className="h-8 text-xs" value={editData.loading_meters || ""} onChange={e => setEditData((p: any) => ({ ...p, loading_meters: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Goods Type</label>
                      <Input className="h-8 text-xs" value={editData.goods_type || ""} onChange={e => setEditData((p: any) => ({ ...p, goods_type: e.target.value }))} />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-3">
                    {order.cargo_description && (
                      <div className="col-span-4">
                        <p className="text-xs text-muted-foreground mb-0.5">Description</p>
                        <p className="text-sm">{order.cargo_description}</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-lg font-semibold">{order.weight_kg ? `${(order.weight_kg / 1000).toFixed(1)}` : "-"}</p>
                      <p className="text-[10px] text-muted-foreground">tonnes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">{order.pallet_count || "-"}</p>
                      <p className="text-[10px] text-muted-foreground">pallets</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">{order.loading_meters || "-"}</p>
                      <p className="text-[10px] text-muted-foreground">LDM</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">{order.goods_type || "-"}</p>
                      <p className="text-[10px] text-muted-foreground">type</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/20 border-b border-border/30 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Notes</span>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Special Instructions</label>
                  {editing ? (
                    <Textarea className="text-xs min-h-[60px]" value={editData.special_instructions || ""} onChange={e => setEditData((p: any) => ({ ...p, special_instructions: e.target.value }))} />
                  ) : <p className="text-xs text-foreground whitespace-pre-wrap">{order.special_instructions || "-"}</p>}
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Internal Notes</label>
                  {editing ? (
                    <Textarea className="text-xs min-h-[60px]" value={editData.internal_notes || ""} onChange={e => setEditData((p: any) => ({ ...p, internal_notes: e.target.value }))} />
                  ) : <p className="text-xs text-foreground whitespace-pre-wrap">{order.internal_notes || "-"}</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "stops" && (
          <div className="p-5 space-y-2">
            {/* Edit/Add Stops Header */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">{editingStopsMode ? "Editing Stops" : `${stops.length} Stop${stops.length !== 1 ? "s" : ""}`}</span>
              <div className="flex items-center gap-2">
                {editingStopsMode ? (
                  <>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={cancelEditingStops}>
                      <XCircle className="h-3 w-3" />Cancel
                    </Button>
                    <Button size="sm" className="h-7 text-xs gap-1" disabled={savingStops} onClick={saveStops}>
                      <Save className="h-3 w-3" />{savingStops ? "Saving..." : "Save Stops"}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={startEditingStops}>
                    <Edit2 className="h-3 w-3" />Edit Stops
                  </Button>
                )}
              </div>
            </div>

            {/* Editing Mode */}
            {editingStopsMode ? (
              <div className="space-y-3">
                {editableStops.map((stop, idx) => {
                  const typeCfg = STOP_TYPE_CONFIG[stop.stop_type] || { label: stop.stop_type, color: "bg-muted text-muted-foreground" };
                  const isDragging = draggedStopIndex === idx;
                  const isDragOver = dragOverStopIndex === idx && draggedStopIndex !== null && draggedStopIndex !== idx;
                  return (
                    <div
                      key={stop.id}
                      // The whole card is the drop target. We listen on
                      // dragover (to allow the drop) and dragenter (to
                      // highlight). dragleave resets the highlight when
                      // the cursor exits this card without dropping.
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                      onDragEnter={() => { if (draggedStopIndex !== null) setDragOverStopIndex(idx); }}
                      onDragLeave={(e) => {
                        // Only clear when the cursor truly leaves the card
                        // (relatedTarget is outside this element), not when
                        // it merely enters a child input.
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverStopIndex(prev => (prev === idx ? null : prev));
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedStopIndex !== null && draggedStopIndex !== idx) {
                          moveStop(draggedStopIndex, idx);
                        }
                        setDraggedStopIndex(null);
                        setDragOverStopIndex(null);
                      }}
                      className={`relative rounded-lg border p-3 bg-card transition-all ${
                        isDragging ? "opacity-40 border-primary/40" :
                        isDragOver ? "border-primary border-2 bg-primary/5 ring-1 ring-primary/30" :
                        "border-border/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1.5">
                          {/* Grip handle — only THIS element is draggable
                              so inputs/textareas inside the card remain
                              fully interactive (otherwise selecting text
                              inside a field would trigger a drag). */}
                          <button
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              setDraggedStopIndex(idx);
                              // Required for Firefox to start the drag
                              e.dataTransfer.effectAllowed = "move";
                              try { e.dataTransfer.setData("text/plain", String(idx)); } catch {}
                            }}
                            onDragEnd={() => { setDraggedStopIndex(null); setDragOverStopIndex(null); }}
                            className="p-0.5 rounded hover:bg-muted/40 cursor-grab active:cursor-grabbing touch-none"
                            aria-label={`Drag stop ${idx + 1} to reorder`}
                            title="Drag to reorder"
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                          </button>
                          <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-bold ${typeCfg.color}`}>
                            {idx + 1}
                          </div>
                          {/* Up/Down arrows for click-to-reorder. Useful
                              on touch devices where HTML5 drag is
                              unreliable, and as a keyboard-accessible
                              alternative to the drag handle. */}
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 disabled:opacity-30"
                              disabled={idx === 0}
                              onClick={() => moveStop(idx, idx - 1)}
                              aria-label="Move stop up"
                              title="Move up"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 disabled:opacity-30"
                              disabled={idx === editableStops.length - 1}
                              onClick={() => moveStop(idx, idx + 1)}
                              aria-label="Move stop down"
                              title="Move down"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Type</label>
                              <Select value={stop.stop_type} onValueChange={v => updateEditableStop(stop.id, "stop_type", v)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pickup">Loading</SelectItem>
                                  <SelectItem value="delivery">Unloading</SelectItem>
                                  <SelectItem value="customs">Customs</SelectItem>
                                  <SelectItem value="border">Border</SelectItem>
                                  <SelectItem value="fuel">Fuel</SelectItem>
                                  <SelectItem value="rest">Rest</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Company</label>
                              <Input className="h-8 text-xs" value={stop.company_name || ""} onChange={e => updateEditableStop(stop.id, "company_name", e.target.value)} placeholder="Company name" />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground mb-1 block">Address</label>
                            <Input className="h-8 text-xs" value={stop.address || ""} onChange={e => updateEditableStop(stop.id, "address", e.target.value)} placeholder="Address" />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">City</label>
                              <Input className="h-8 text-xs" value={stop.city || ""} onChange={e => updateEditableStop(stop.id, "city", e.target.value)} placeholder="City" />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Country</label>
                              <Input className="h-8 text-xs" value={stop.country || ""} onChange={e => updateEditableStop(stop.id, "country", e.target.value)} placeholder="Country" />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Postal</label>
                              <Input className="h-8 text-xs" value={stop.postal_code || ""} onChange={e => updateEditableStop(stop.id, "postal_code", e.target.value)} placeholder="Postal" />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Date</label>
                              <Input type="date" className="h-8 text-xs" value={stop.planned_date || ""} onChange={e => updateEditableStop(stop.id, "planned_date", e.target.value)} />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Time From</label>
                              <Input type="time" className="h-8 text-xs" value={stop.planned_time_from || ""} onChange={e => updateEditableStop(stop.id, "planned_time_from", e.target.value)} />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Time To</label>
                              <Input type="time" className="h-8 text-xs" value={stop.planned_time_to || ""} onChange={e => updateEditableStop(stop.id, "planned_time_to", e.target.value)} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Contact Name</label>
                              <Input className="h-8 text-xs" value={stop.contact_name || ""} onChange={e => updateEditableStop(stop.id, "contact_name", e.target.value)} placeholder="Contact name" />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Contact Phone</label>
                              <Input className="h-8 text-xs" value={stop.contact_phone || ""} onChange={e => updateEditableStop(stop.id, "contact_phone", e.target.value)} placeholder="+40..." />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground mb-1 block">Reference</label>
                            <Input className="h-8 text-xs" value={stop.reference_number || ""} onChange={e => updateEditableStop(stop.id, "reference_number", e.target.value)} placeholder="Reference number" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground mb-1 block">Notes</label>
                            <Textarea className="text-xs min-h-[50px]" value={stop.notes || ""} onChange={e => updateEditableStop(stop.id, "notes", e.target.value)} placeholder="Stop notes..." />
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-500 hover:bg-red-500/10" onClick={() => removeStop(stop.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <Button variant="outline" className="w-full h-9 text-xs gap-1 border-dashed" onClick={addNewStop}>
                  <Plus className="h-3.5 w-3.5" />Add Stop
                </Button>
              </div>
            ) : stops.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No stops defined</p>
            ) : stops.map((stop, idx) => {
              const typeCfg = STOP_TYPE_CONFIG[stop.stop_type] || { label: stop.stop_type, color: "bg-muted text-muted-foreground" };
              const stopForms = formSubmissions.filter(f => f.stop_id === stop.id);
              return (
                <div key={stop.id} className="relative">
                  {idx < stops.length - 1 && <div className="absolute left-[18px] top-10 bottom-0 w-px bg-border/50 z-0" />}
                  <div className="flex gap-3 relative z-10">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${typeCfg.color}`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 rounded-lg border border-border/40 p-3 bg-card hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeCfg.color}`}>{typeCfg.label}</span>
                        {stop.company_name && <span className="text-xs font-medium">{stop.company_name}</span>}
                        {stop.status && stop.status !== "pending" && (
<span className={`text-[9px] px-1.5 py-0.5 rounded-full ${stop.status === "completed" ? "bg-emerald-500/10 text-emerald-400" : stop.status === "cancelled" ? "bg-red-500/10 text-red-400" : "bg-muted text-muted-foreground"}`}>
  {stop.status === "completed" ? "Completed" : stop.status === "cancelled" ? "Cancelled" : stop.status}
  </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span>{[stop.address, stop.city, stop.country].filter(Boolean).join(", ") || "-"}</span>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                        {stop.planned_date && (
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(stop.planned_date)}</span>
                        )}
                        {stop.planned_time_from && (
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{stop.planned_time_from}{stop.planned_time_to ? ` - ${stop.planned_time_to}` : ""}</span>
                        )}
                        {stop.reference_number && (
                          <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{stop.reference_number}</span>
                        )}
                      </div>
                      {/* Actual arrival/departure times */}
                      {(stop.actual_arrival || stop.actual_departure) && (
                        <div className="flex items-center gap-4 mt-1.5 text-[10px]">
                          {stop.actual_arrival && (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="h-2.5 w-2.5" />Arrived: {fmtTime(stop.actual_arrival)}
                            </span>
                          )}
                          {stop.actual_departure && (
                            <span className="text-blue-400 flex items-center gap-1">
                              <CheckCircle2 className="h-2.5 w-2.5" />Departed: {fmtTime(stop.actual_departure)}
                            </span>
                          )}
                        </div>
                      )}
                      {stop.contact_name && (
                        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                          <Phone className="h-3 w-3" />{stop.contact_name} {stop.contact_phone ? `(${stop.contact_phone})` : ""}
                        </p>
                      )}
                      {stop.notes && <p className="text-[11px] text-muted-foreground mt-1 italic">{stop.notes}</p>}
                      {/* Form submissions for this stop */}
                      {stopForms.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/30 space-y-1.5">
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Form Submissions</p>
                          {stopForms.map(sf => (
                            <div key={sf.id} className="bg-muted/20 rounded-md p-2 text-[10px]">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">{sf.form_name}</span>
                                <span className="text-muted-foreground">{fmtTime(sf.submitted_at)}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                {Object.entries(sf.data || {}).map(([key, val]) => (
                                  <div key={key}>
                                    <span className="text-muted-foreground">{key}: </span>
                                    <span className="font-medium">{String(val)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Execution Timeline (trip_stops) */}
            {tripStopsExec.length > 0 && (
              <div className="mt-6 pt-4 border-t border-border/40">
                <div className="flex items-center gap-2 mb-3">
                  <Route className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Execution Timeline</h3>
                </div>
                <p className="text-[10px] text-muted-foreground mb-3">Real-time driver execution sequence across all trips for this order.</p>
                <div className="space-y-1.5">
                  {tripStopsExec.map((ts, idx) => {
                    const isCompleted = ts.status === "completed";
                    const isActive = ts.status === "en_route" || ts.status === "arrived" || ts.status === "in_action";
                    const statusCfg: Record<string, { label: string; color: string }> = {
                      pending: { label: "Pending", color: "text-muted-foreground" },
                      en_route: { label: "En Route", color: "text-blue-400" },
                      arrived: { label: "Arrived", color: "text-amber-400" },
                      in_action: { label: ts.action_type_name || "Working", color: "text-violet-400" },
                      completed: { label: "Done", color: "text-emerald-400" },
                      skipped: { label: "Skipped", color: "text-orange-400" },
                    };
                    const sc = statusCfg[ts.status] || statusCfg.pending;
                    const typeCfg = STOP_TYPE_CONFIG[ts.stop_type] || { label: ts.stop_type, color: "bg-muted text-muted-foreground" };

                    return (
                      <div key={ts.id} className="relative">
                        {idx < tripStopsExec.length - 1 && (
                          <div className={`absolute left-[14px] top-7 bottom-0 w-px z-0 ${isCompleted ? "bg-emerald-500/50" : "bg-border/50"}`} />
                        )}
                        <div className={`flex gap-3 relative z-10 rounded-lg p-2 ${isActive ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}>
                          <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 border ${
                            isCompleted ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" :
                            isActive ? "bg-blue-500/20 border-blue-500/40 text-blue-400 animate-pulse" :
                            "bg-muted/50 border-border/40 text-muted-foreground"
                          }`}>
                            {ts.sequence_order}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${typeCfg.color}`}>
                                {ts.action_type_name || typeCfg.label}
                              </span>
                              <span className={`text-[9px] font-semibold ${sc.color}`}>{sc.label}</span>
                              {ts.trip_ref && (
                                <span className="text-[8px] font-mono text-muted-foreground/60 bg-muted/30 px-1 rounded">RT {ts.trip_ref}</span>
                              )}
                            </div>
                            <p className="text-[11px] font-medium mt-0.5">{ts.company_name || ts.city || `Stop ${ts.sequence_order}`}</p>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                              {ts.planned_date && <span>{fmtDate(ts.planned_date)}{ts.planned_time_from ? ` ${ts.planned_time_from}` : ""}</span>}
                              {ts.distance_to_km != null && <span>{Math.round(ts.distance_to_km)} km</span>}
                              {ts.duration_to_minutes != null && <span>~{Math.round(ts.duration_to_minutes)} min</span>}
                            </div>
                            {(ts.actual_arrival || ts.actual_departure) && (
                              <div className="flex gap-3 text-[9px] mt-0.5">
                                {ts.actual_arrival && <span className="text-emerald-400">Arr: {fmtTime(ts.actual_arrival)}</span>}
                                {ts.actual_departure && <span className="text-blue-400">Dep: {fmtTime(ts.actual_departure)}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "documents" && (
          <div className="p-3 md:p-5 space-y-3">
            {/* Upload Section */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-lg border border-dashed border-border/60 bg-muted/10">
              <div className="flex items-center gap-2 flex-1">
                <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={uploadDocType} onValueChange={setUploadDocType}>
                  <SelectTrigger className="h-9 w-full sm:w-[140px] text-xs bg-card/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cmr_pod">CMR / POD</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="bill_of_lading">Bill of Lading</SelectItem>
                    <SelectItem value="proof_of_delivery">Proof of Delivery</SelectItem>
                    <SelectItem value="customs">Customs</SelectItem>
                    <SelectItem value="insurance">Insurance</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                onChange={handleDocumentUpload}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs gap-1.5"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    Upload Document
                  </>
                )}
              </Button>
            </div>

            {/* Documents List */}
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No documents yet. Upload your first document above.</p>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => {
                  const isImage = doc.mime_type?.startsWith("image/");
                  const isPdf = doc.mime_type === "application/pdf";
                  const canPreview = isImage || isPdf;
                  return (
                    <div 
                      key={doc.id} 
                      className={`flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg border border-border/40 hover:bg-muted/20 transition-colors group ${canPreview ? "cursor-pointer" : ""}`}
                      onClick={() => canPreview && setPreviewDoc(doc)}
                    >
                      <div className={`h-8 w-8 md:h-9 md:w-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isImage ? "bg-emerald-500/10" : isPdf ? "bg-red-500/10" : "bg-blue-500/10"
                      }`}>
                        {isImage ? (
                          <ImageIcon className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-400" />
                        ) : isPdf ? (
                          <FileText className="h-3.5 w-3.5 md:h-4 md:w-4 text-red-400" />
                        ) : (
                          <File className="h-3.5 w-3.5 md:h-4 md:w-4 text-blue-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] md:text-xs font-medium truncate">{doc.name}</p>
                        <div className="flex items-center gap-1.5 md:gap-2 text-[9px] md:text-[10px] text-muted-foreground flex-wrap">
                          <span className="capitalize px-1 md:px-1.5 py-0.5 rounded bg-muted/50">{doc.document_type?.replace(/_/g, " ")}</span>
                          <span className="hidden sm:inline">{fmtDate(doc.created_at)}</span>
                          {doc.uploaded_by_name && (
                            <span className="hidden md:inline">by {doc.uploaded_by_name}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 md:gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        {canPreview && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc); }}
                            className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-primary/10 text-muted-foreground hover:text-primary"
                            title="Preview"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteDocument(doc.id, doc.name); }}
                          className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Document Preview Modal - Portal to body */}
        {previewDoc && typeof document !== "undefined" && createPortal(
          <div 
            className="fixed inset-0 z-[9999] bg-black/95 flex flex-col"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setPreviewDoc(null); setPreviewZoom(100); setPreviewRotation(0);
              }
            }}
          >
            {/* Floating Close Button - Always visible */}
            <button
              onClick={() => { setPreviewDoc(null); setPreviewZoom(100); setPreviewRotation(0); }}
              className="absolute top-3 right-3 md:top-4 md:right-4 z-10 h-10 w-10 md:h-11 md:w-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-lg border border-white/20 transition-colors"
              title="Close preview"
            >
              <X className="h-5 w-5 md:h-6 md:w-6" />
            </button>

            {/* Preview Header */}
            <div className="shrink-0 flex items-center justify-between px-3 md:px-5 py-2 md:py-3 bg-black/50 backdrop-blur-sm">
              <div className="flex items-center gap-2 md:gap-3 min-w-0 pr-14">
                <button
                  onClick={() => { setPreviewDoc(null); setPreviewZoom(100); setPreviewRotation(0); }}
                  className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-white/10 text-white/70 hover:text-white shrink-0"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate text-white">{previewDoc.name}</p>
                  <p className="text-[10px] text-white/60 capitalize">{previewDoc.document_type?.replace(/_/g, " ")}</p>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-2">
                {/* Zoom & Rotate Controls */}
                <div className="flex items-center gap-1 mr-2">
                  <button
                    onClick={() => setPreviewZoom(z => Math.max(25, z - 25))}
                    className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-white/10 text-white/70 hover:text-white"
                    title="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-white/60 w-12 text-center">{previewZoom}%</span>
                  <button
                    onClick={() => setPreviewZoom(z => Math.min(300, z + 25))}
                    className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-white/10 text-white/70 hover:text-white"
                    title="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPreviewRotation(r => (r + 90) % 360)}
                    className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-white/10 text-white/70 hover:text-white ml-1"
                    title="Rotate"
                  >
                    <RotateCw className="h-4 w-4" />
                  </button>
                </div>
                <a
                  href={previewDoc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 px-4 rounded-lg flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              </div>
            </div>

            {/* Mobile Zoom/Rotate Controls */}
            <div className="md:hidden flex items-center justify-center gap-2 py-2 bg-black/30">
              <button
                onClick={() => setPreviewZoom(z => Math.max(25, z - 25))}
                className="h-10 w-10 rounded-lg flex items-center justify-center bg-white/10 text-white/70 active:bg-white/20"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs text-white/60 w-14 text-center">{previewZoom}%</span>
              <button
                onClick={() => setPreviewZoom(z => Math.min(300, z + 25))}
                className="h-10 w-10 rounded-lg flex items-center justify-center bg-white/10 text-white/70 active:bg-white/20"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPreviewRotation(r => (r + 90) % 360)}
                className="h-10 w-10 rounded-lg flex items-center justify-center bg-white/10 text-white/70 active:bg-white/20 ml-2"
              >
                <RotateCw className="h-4 w-4" />
              </button>
              <a
                href={previewDoc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/80 text-white ml-2"
              >
                <Download className="h-4 w-4" />
              </a>
            </div>

            {/* Preview Content - Click outside to close */}
            <div 
              className="flex-1 overflow-auto flex items-center justify-center p-2 md:p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setPreviewDoc(null); setPreviewZoom(100); setPreviewRotation(0);
                }
              }}
            >
              {previewDoc.mime_type?.startsWith("image/") ? (
                <img
                  src={previewDoc.file_url}
                  alt={previewDoc.name}
                  className="max-w-full max-h-full object-contain transition-transform duration-200 shadow-2xl"
                  style={{
                    transform: `scale(${previewZoom / 100}) rotate(${previewRotation}deg)`,
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%23333' width='200' height='200'/%3E%3Ctext fill='%23666' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3EFailed to load%3C/text%3E%3C/svg%3E";
                  }}
                />
              ) : previewDoc.mime_type === "application/pdf" ? (
                <iframe
                  src={previewDoc.file_url}
                  className="w-full h-full bg-white rounded-lg shadow-2xl"
                  style={{
                    transform: `scale(${previewZoom / 100})`,
                    transformOrigin: "center center",
                    minHeight: "500px",
                  }}
                  title={previewDoc.name}
                />
              ) : (
                <div className="text-center text-muted-foreground">
                  <File className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">Preview not available for this file type</p>
                  <a
                    href={previewDoc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                  >
                    <Download className="h-4 w-4" />
                    Download to view
</a>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
  
        {activeTab === "invoices" && (
          <div className="p-3 md:p-5 space-y-3">
            {/* Add Invoice Buttons
                ────────────────────
                Invoice-direction visibility depends on the order's role:

                  • Parent / standalone order (commercial_role !==
                    "carrier_subcontract") → can invoice the customer.
                    Carrier invoices may also be attached if the order
                    is forwarded.

                  • FWD subcontract child (commercial_role ===
                    "carrier_subcontract") → can ONLY hold a carrier
                    invoice. The customer is invoiced from the parent
                    INT order, never twice from the child. Showing
                    "Invoice to Customer" here would let an operator
                    accidentally double-bill the end customer.

                Subcontract carrier invoices arrive two ways: (a) admin
                clicks "Upload Carrier Invoice" and attaches manually,
                or (b) the carrier uploads it through the two-step
                portal email, which auto-creates the row. Both flows
                land in this same list. */}
            <div className="flex flex-col sm:flex-row gap-2">
              {order?.commercial_role !== "carrier_subcontract" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-xs gap-1.5 border-dashed"
                  onClick={() => openNewInvoiceDialog('outgoing')}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Invoice to Customer</span>
                </Button>
              )}
              {(order?.is_forwarding || order?.commercial_role === "carrier_subcontract") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-xs gap-1.5 border-dashed"
                  onClick={() => openNewInvoiceDialog('incoming')}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>
                    {order?.commercial_role === "carrier_subcontract"
                      ? "Upload Carrier Invoice"
                      : "Invoice from Carrier"}
                  </span>
                </Button>
              )}
            </div>

            {/* Invoices List */}
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No invoices yet. Create your first invoice above.</p>
            ) : (
              <div className="space-y-2">
                {invoices.map(inv => {
                  const totalDue = inv.total_with_tax || inv.amount;
                  const amountPaid = inv.paid_amount || 0;
                  const remaining = totalDue - amountPaid;
                  const paymentPercent = totalDue > 0 ? Math.min(100, (amountPaid / totalDue) * 100) : 0;
                  const isOverdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'paid';
                  const hasSkontoActive = inv.skonto_deadline && new Date(inv.skonto_deadline) >= new Date() && inv.status !== 'paid';
                  const skontoAmount = hasSkontoActive && inv.skonto_percentage ? totalDue * (1 - inv.skonto_percentage / 100) : null;

                  return (
                    <div 
                      key={inv.id} 
                      className={`rounded-lg border p-3 transition-colors hover:bg-muted/10 ${
                        isOverdue ? 'border-red-500/30 bg-red-500/5' : 'border-border/40'
                      }`}
                    >
                      {/* Header Row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Receipt className={`h-3.5 w-3.5 shrink-0 ${inv.direction === 'outgoing' ? 'text-emerald-400' : 'text-amber-400'}`} />
                            <span className="text-xs font-medium truncate">{inv.invoice_number}</span>
                            {inv.external_invoice_number && (
                              <span className="text-[10px] text-muted-foreground">({inv.external_invoice_number})</span>
                            )}
                            <Badge variant="outline" className={`text-[9px] px-1 py-0 shrink-0 ${
                              inv.direction === 'outgoing' ? 'border-emerald-500/30 text-emerald-400' : 'border-amber-500/30 text-amber-400'
                            }`}>
                              {inv.direction === 'outgoing' ? 'Customer' : 'Carrier'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground flex-wrap">
                            <span>Issued: {fmtDate(inv.issue_date)}</span>
                            <span>Due: {fmtDate(inv.due_date)}</span>
                            {isOverdue && <span className="text-red-400 font-medium">OVERDUE</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">{fmtCurrency(totalDue, inv.currency)}</p>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full inline-block ${
                            inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 
                            inv.status === 'sent' ? 'bg-blue-500/10 text-blue-400' : 
                            isOverdue ? 'bg-red-500/10 text-red-400' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {inv.status}
                          </span>
                        </div>
                      </div>

                      {/* Skonto Banner */}
                      {hasSkontoActive && skontoAmount && (
                        <div className="mt-2 px-2 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-amber-400">
                              Skonto {inv.skonto_percentage}% until {fmtDate(inv.skonto_deadline)}
                            </span>
                            <span className="font-medium text-amber-400">
                              Pay {fmtCurrency(skontoAmount, inv.currency)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Payment Progress */}
                      {inv.status !== 'draft' && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[10px] mb-1">
                            <span className="text-muted-foreground">
                              Paid: {fmtCurrency(amountPaid, inv.currency)}
                            </span>
                            {remaining > 0 && (
                              <span className="text-muted-foreground">
                                Remaining: {fmtCurrency(remaining, inv.currency)}
                              </span>
                            )}
                          </div>
                          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${
                                paymentPercent >= 100 ? 'bg-emerald-500' : 
                                paymentPercent > 0 ? 'bg-blue-500' : 'bg-muted/50'
                              }`}
                              style={{ width: `${paymentPercent}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-2 pt-2 border-t border-border/30 flex items-center gap-1 flex-wrap">
                        {/* Preview - Smartbill or file_url */}
                        {(inv.smartbill_series && inv.smartbill_number) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] px-2 gap-1"
                            onClick={() => handlePreviewSmartbillInvoice(inv)}
                          >
                            <Eye className="h-3 w-3" />
                            Preview
                          </Button>
                        ) : inv.file_url ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] px-2 gap-1"
                            onClick={() => setPreviewDoc({ 
                              id: inv.id, 
                              name: `${inv.invoice_number}.pdf`, 
                              file_url: inv.file_url!, 
                              document_type: 'invoice', 
                              created_at: inv.issue_date || '', 
                              mime_type: 'application/pdf' 
                            })}
                          >
                            <Eye className="h-3 w-3" />
                            Preview
                          </Button>
                        ) : null}

                        {/* Download - Smartbill or file_url */}
                        {(inv.smartbill_series && inv.smartbill_number) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] px-2 gap-1"
                            onClick={() => handleDownloadSmartbillInvoice(inv)}
                          >
                            <Download className="h-3 w-3" />
                            Download
                          </Button>
                        ) : inv.file_url ? (
                          <a
                            href={inv.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="h-7 text-[10px] px-2 gap-1 inline-flex items-center text-muted-foreground hover:text-foreground"
                          >
                            <Download className="h-3 w-3" />
                            Download
                          </a>
                        ) : null}

                        {/* Send via Email */}
                        {inv.direction === 'outgoing' && inv.status !== 'draft' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] px-2 gap-1"
                            onClick={() => handleSendInvoiceEmail(inv)}
                          >
                            <Mail className="h-3 w-3" />
                            Email
                          </Button>
                        )}

                        {/* Status Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2 gap-1">
                              <FileText className="h-3 w-3" />
                              Status
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-32">
                            <DropdownMenuItem onClick={() => handleUpdateInvoiceStatus(inv.id, 'draft')}>
                              Draft
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleUpdateInvoiceStatus(inv.id, 'issued')}>
                              Issued
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleUpdateInvoiceStatus(inv.id, 'sent')}>
                              Sent
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleUpdateInvoiceStatus(inv.id, 'paid')}>
                              Paid
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleUpdateInvoiceStatus(inv.id, 'cancelled')}>
                              Cancelled
                            </DropdownMenuItem>
                            {inv.smartbill_series && inv.smartbill_number && (
                              <DropdownMenuItem 
                                onClick={() => handleUpdateInvoiceStatus(inv.id, 'storno')}
                                className="text-red-400"
                              >
                                Storno (Smartbill)
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Edit (drafts only) */}
                        {inv.status === 'draft' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] px-2 gap-1"
                            onClick={() => openEditInvoiceDialog(inv)}
                          >
                            <Edit2 className="h-3 w-3" />
                            Edit
                          </Button>
                        )}

                        {/* Record Payment */}
                        {inv.status !== 'draft' && inv.status !== 'paid' && remaining > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] px-2 gap-1 text-emerald-400 hover:text-emerald-300"
                            onClick={() => { setSelectedInvoiceForPayment(inv); setShowPaymentDialog(true); }}
                          >
                            <CreditCard className="h-3 w-3" />
                            Payment
                          </Button>
                        )}

                        {/* Upload file (incoming only, no file yet) */}
                        {inv.direction === 'incoming' && !inv.file_url && (
                          <>
                            <input
                              type="file"
                              id={`invoice-file-${inv.id}`}
                              className="hidden"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadInvoiceFile(inv.id, file);
                              }}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px] px-2 gap-1"
                              onClick={() => document.getElementById(`invoice-file-${inv.id}`)?.click()}
                            >
                              <Upload className="h-3 w-3" />
                              Upload
                            </Button>
                          </>
                        )}

                        <div className="flex-1" />

                        {/* Delete button (for testing - works on all invoices) */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] px-2 gap-1 text-red-400 hover:text-red-300"
                          onClick={() => handleDeleteInvoice(inv.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Invoice Create/Edit Dialog */}
        {showInvoiceDialog && (
          <InvoiceDialog
            isOpen={showInvoiceDialog}
            onClose={() => { setShowInvoiceDialog(false); setEditingInvoice(null); }}
            onSave={handleSaveInvoice}
            invoice={editingInvoice}
            direction={invoiceDirection}
            order={order}
            payments={invoicePayments}
            saving={savingInvoice}
            adminId={adminSession?.id}
          />
        )}

        {/* Payment Dialog */}
        {showPaymentDialog && selectedInvoiceForPayment && (
          <PaymentDialog
            isOpen={showPaymentDialog}
            onClose={() => { setShowPaymentDialog(false); setSelectedInvoiceForPayment(null); }}
            onSave={(data) => handleRecordPayment(selectedInvoiceForPayment.id, data)}
            invoice={selectedInvoiceForPayment}
          />
        )}

        {activeTab === "expenses" && (
          <div className="p-5 space-y-2">
            {expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No expenses recorded</p>
            ) : expenses.map(exp => (
              <div key={exp.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/40">
                <Fuel className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium capitalize">{exp.expense_type.replace(/_/g, " ")}</p>
                  {exp.description && <p className="text-[10px] text-muted-foreground">{exp.description}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium">{fmtCurrency(exp.amount, exp.currency)}</p>
                  <span className={`text-[9px] ${exp.approved ? "text-emerald-400" : "text-amber-400"}`}>{exp.approved ? "Approved" : "Pending"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "activity" && (
          <div className="p-5 space-y-1">
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No activity yet</p>
            ) : activity.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-border/20 last:border-0">
                <div className="h-6 w-6 rounded-full bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
                  <History className="h-3 w-3 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs">
                    <span className="font-medium capitalize">{entry.action.replace(/_/g, " ")}</span>
                    {entry.details?.from && entry.details?.to && (
                      <span className="text-muted-foreground">{" "}from <span className="font-medium">{entry.details.from}</span> to <span className="font-medium">{entry.details.to}</span></span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {fmtTime(entry.created_at)} by {entry.performed_by_type}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "chat" && (
          <div className="h-full min-h-[400px]">
            {adminSession?.id ? (
              <OrderChat
                orderId={orderId}
                orderReference={order.reference_number}
                currentUserId={adminSession.id}
                currentUserType="admin"
                currentUserName={adminSession.name || "Admin"}
                driverId={order.driver_id}
                driverName={driver?.name}
              />
            ) : (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                Loading chat...
              </div>
            )}
          </div>
        )}

        {/* ── EXECUTION TAB (Trip-centric) ── */}
        {activeTab === "execution" && (
          <div className="space-y-4">
            {/* Trip selector tabs */}
            {(() => {
// Get unique trip IDs and sort them by their first stop's planned_date, or by order_stop sequence
const uniqueTripIds = [...new Set(tripStopsExec.map(ts => ts.trip_id))];
if (editTripId && !uniqueTripIds.includes(editTripId)) uniqueTripIds.push(editTripId);

// Sort trips: first by first stop date, then by order_stop's original sequence in the order
const tripIds = uniqueTripIds.sort((a, b) => {
  const stopsA = tripStopsExec.filter(s => s.trip_id === a).sort((x, y) => x.sequence_order - y.sequence_order);
  const stopsB = tripStopsExec.filter(s => s.trip_id === b).sort((x, y) => x.sequence_order - y.sequence_order);
  const dateA = stopsA[0]?.planned_date || "";
  const dateB = stopsB[0]?.planned_date || "";
  // If both have dates, sort by date
  if (dateA && dateB) return dateA.localeCompare(dateB);
  // If only one has date, the one with date comes first
  if (dateA && !dateB) return -1;
  if (!dateA && dateB) return 1;
  // If neither has dates, use the order_stop_id's sequence from the original order stops
  // Find the original order stop sequence for each trip's first stop
  const orderStopA = stops.find(os => os.id === stopsA[0]?.order_stop_id);
  const orderStopB = stops.find(os => os.id === stopsB[0]?.order_stop_id);
  const origSeqA = orderStopA?.sequence_order ?? stopsA[0]?.sequence_order ?? 999;
  const origSeqB = orderStopB?.sequence_order ?? stopsB[0]?.sequence_order ?? 999;
  return origSeqA - origSeqB;
});

// Only show trip tabs when there are multiple trips (multi-order consolidation)
// For single trip orders, auto-select and hide the tab
return tripIds.length > 1 && (
                <div className="flex items-center gap-2 border-b border-border/30 pb-2">
                  {tripIds.map((tid, idx) => (
                    <Button key={tid} variant={editingTrip?.id === tid ? "default" : "outline"} size="sm" className="text-xs gap-1 h-7"
                      onClick={async () => {
                        if (editingTrip?.id === tid) return;
                        const { data: trip } = await supabase
                          .from("trips").select(`
                            id, status, driver_id, vehicle_id, trailer_id, carrier_id, assignment_type,
                            distance_km, duration_minutes, route_geometry,
                            driver:driver_id(name), vehicle:vehicle_id(plate_number), trailer:trailer_id(plate_number),
                            carrier:carrier_id(name),
                            trip_legs(
                              id, trip_id, leg_number, assignment_type, status,
                              driver_id, vehicle_id, trailer_id, carrier_id, forwarding_order_id,
                              from_stop_index, to_stop_index,
                              subcontractor_vehicle_plate, subcontractor_driver_name, subcontractor_driver_phone,
                              driver:driver_id(name), vehicle:vehicle_id(plate_number), trailer:trailer_id(plate_number),
                              carrier:carrier_id(name)
                            ),
                            trip_stops(id, sequence_order, stop_type, company_name, address, city, country, postal_code,
                              order_id, order_stop_id, lat, lng, planned_date, planned_time_from, planned_time_to, status, notes,
                              auto_checkin, auto_checkout, geofence_radius, form_id,
                              route_to_geometry, distance_to_km, duration_to_minutes,
                              action_type:action_type_id(id, code, name, icon, color))
                          `).eq("id", tid).single();
                        if (trip) {
                        // For forwarding trips, fetch FWD order via junction table or legacy execution_trip_id
                        let fwdOrderId = null;
                        let fwdOrderRef = null;
                        let carrierName = trip.carrier?.name;
                        
                        if (trip.assignment_type === "forwarding") {
                          // First try junction table via trip_legs
                          const legIds = (trip.trip_legs || []).map((l: any) => l.id);
                          if (legIds.length > 0) {
                            const { data: junctionData } = await supabase
                              .from("forwarding_order_legs")
                              .select("forwarding_order_id")
                              .in("trip_leg_id", legIds)
                              .limit(1);
                            
                            if (junctionData?.[0]?.forwarding_order_id) {
                              const { data: fwdOrder } = await supabase
                                .from("orders")
                                .select("id, reference_number, carrier:carrier_id(id, name)")
                                .eq("id", junctionData[0].forwarding_order_id)
                                .single();
                              if (fwdOrder) {
                                fwdOrderId = fwdOrder.id;
                                fwdOrderRef = fwdOrder.reference_number;
                                const fwdCarrier = Array.isArray(fwdOrder.carrier) ? fwdOrder.carrier[0] : fwdOrder.carrier;
                                if (fwdCarrier?.name) carrierName = fwdCarrier.name;
                              }
                            }
                          }
                          
                          // Fallback to legacy execution_trip_id
                          if (!fwdOrderId) {
                            const { data: fwdOrder } = await supabase
                              .from("orders")
                              .select("id, reference_number, carrier:carrier_id(id, name)")
                              .eq("parent_order_id", orderId)
                              .eq("execution_trip_id", trip.id)
                              .eq("order_type", "forwarding")
                              .maybeSingle();
                            if (fwdOrder) {
                              fwdOrderId = fwdOrder.id;
                              fwdOrderRef = fwdOrder.reference_number;
                              const fwdCarrier = Array.isArray(fwdOrder.carrier) ? fwdOrder.carrier[0] : fwdOrder.carrier;
                              if (fwdCarrier?.name) carrierName = fwdCarrier.name;
                            }
                          }
                        }
                        
                        setEditingTrip({ 
                          ...trip, 
                          driver_name: trip.driver?.name, 
                          vehicle_plate: trip.vehicle?.plate_number,
                          trailer_plate: trip.trailer?.plate_number,
                          carrier_name: carrierName,
                          forwarding_order_id: fwdOrderId,
                          forwarding_order_ref: fwdOrderRef,
                        });
                        
                        // Process trip_legs
                        const sortedLegs = (trip.trip_legs || [])
                          .sort((a: any, b: any) => a.leg_number - b.leg_number)
                          .map((leg: any) => ({
                            ...leg,
                            driver_name: leg.driver?.name,
                            vehicle_plate: leg.vehicle?.plate_number,
                            trailer_plate: leg.trailer?.plate_number,
                            carrier_name: leg.carrier?.name,
                          }));
                        setEditingTripLegs(sortedLegs);
                        
                          const sorted = (trip.trip_stops || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order);
                          setEditingStops(sorted.map((s: any) => ({
                            ...s, action_type_id: s.action_type?.id || null, action_type_name: s.action_type?.name || null,
                          })));
                          setEditingRoute({ geometry: trip.route_geometry || null, distance_km: trip.distance_km || 0, duration_hours: (trip.duration_minutes || 0) / 60 });
                        }
                      }}>
                      <Truck className="h-3 w-3" /> Round Trip {idx + 1}
                    </Button>
                  ))}
                </div>
              );
            })()}

            {/* Add Leg Dialog - Select swap point where new leg starts */}
            {splitTripOpen && editingTrip && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Add New Leg</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setSplitTripOpen(false); setAddingNewSwapStop(false); setNewSwapStop({ city: "", country: "", address: "", company_name: "", lat: 0, lng: 0, planned_date: "" }); setSplitAtStopIndex(null); setSwapLocationSearch(""); setSwapLocationResults([]); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Select where the new leg starts (swap point). The previous leg will end here, and the new leg will continue to the destination.
                </p>
                
                {/* Current stops visualization */}
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Route stops:</label>
                  <div className="space-y-1">
                    {editingStops.map((stop, idx) => (
                      <div key={stop.id} className="relative">
                        {/* Stop item */}
                        <div className={`p-2 rounded-lg border text-xs flex items-center gap-2 group ${
                          idx === 0 ? "border-emerald-500/30 bg-emerald-500/5" :
                          idx === editingStops.length - 1 ? "border-blue-500/30 bg-blue-500/5" :
                          stop.stop_type === "swap" ? "border-amber-500/30 bg-amber-500/5" :
                          "border-border/30"
                        }`}>
                          <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-medium ${
                            idx === 0 ? "bg-emerald-500 text-white" :
                            idx === editingStops.length - 1 ? "bg-blue-500 text-white" :
                            stop.stop_type === "swap" ? "bg-amber-500 text-white" :
                            "bg-muted"
                          }`}>
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium truncate block">{stop.city || stop.company_name}</span>
                            <span className="text-muted-foreground truncate block">{stop.stop_type}</span>
                          </div>
                          {idx === 0 && <Badge variant="outline" className="text-[9px] h-4 border-emerald-500/30 text-emerald-400">Start</Badge>}
                          {idx === editingStops.length - 1 && <Badge variant="outline" className="text-[9px] h-4 border-blue-500/30 text-blue-400">End</Badge>}
                          {/* Edit/Delete buttons for swap stops */}
                          {stop.stop_type === "swap" && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm("Remove this swap point?")) return;
                                  
                                  // Delete the swap stop
                                  await supabase.from("trip_stops").delete().eq("id", stop.id);
                                  
                                  // Resequence remaining stops
                                  const remainingStops = editingStops.filter(s => s.id !== stop.id);
                                  for (let i = 0; i < remainingStops.length; i++) {
                                    await supabase.from("trip_stops").update({ sequence_order: i }).eq("id", remainingStops[i].id);
                                    remainingStops[i].sequence_order = i;
                                  }
                                  
                                  // Update affected legs - find legs that reference this stop and adjust their indices
                                  const stopsBeforeDeleted = idx;
                                  for (const leg of editingTripLegs) {
                                    let needsUpdate = false;
                                    const updates: any = {};
                                    
                                    if (leg.from_stop_index >= idx) {
                                      updates.from_stop_index = Math.max(0, leg.from_stop_index - 1);
                                      needsUpdate = true;
                                    }
                                    if (leg.to_stop_index >= idx) {
                                      updates.to_stop_index = Math.max(0, leg.to_stop_index - 1);
                                      needsUpdate = true;
                                    }
                                    
                                    if (needsUpdate) {
                                      await supabase.from("trip_legs").update(updates).eq("id", leg.id);
                                    }
                                  }
                                  
                                  setEditingStops(remainingStops);
                                  toast({ title: "Swap point removed" });
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        
                        {/* Add swap point button between stops (not after last stop) */}
                        {idx < editingStops.length - 1 && (
                          <div className="flex items-center justify-center py-1">
                            {splitInsertAfterIndex === idx && addingNewSwapStop ? (
                              <div className="w-full p-3 rounded-lg border border-amber-500/50 bg-amber-500/10 space-y-3">
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4 text-amber-400" />
                                  <span className="text-xs font-medium">New Swap Point</span>
                                </div>
                                
                                {/* Location Search */}
                                <div className="relative">
                                  <label className="text-[10px] text-muted-foreground block mb-1">Search Location *</label>
                                  <div className="relative">
                                    <Input 
                                      className="h-8 text-xs pr-8" 
                                      placeholder="Search city, address, or place..."
                                      value={swapLocationSearch}
                                      onChange={async (e) => {
                                        const q = e.target.value;
                                        setSwapLocationSearch(q);
                                        if (q.length < 3) {
                                          setSwapLocationResults([]);
                                          return;
                                        }
                                        setSearchingSwapLocation(true);
                                        try {
                                          const res = await fetch(`/api/tms/geocode?action=search&q=${encodeURIComponent(q)}`);
                                          const data = await res.json();
                                          setSwapLocationResults(Array.isArray(data) ? data.slice(0, 5) : []);
                                        } catch { setSwapLocationResults([]); }
                                        setSearchingSwapLocation(false);
                                      }}
                                    />
                                    {searchingSwapLocation && (
                                      <Loader2 className="h-3 w-3 animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    )}
                                  </div>
                                  
                                  {/* Search Results Dropdown */}
                                  {swapLocationResults.length > 0 && (
                                    <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                      {swapLocationResults.map((r, i) => (
                                        <button
                                          key={i}
                                          className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 border-b border-border/30 last:border-0"
                                          onClick={() => {
                                            setNewSwapStop({
                                              city: r.address?.city || r.address?.town || r.address?.village || r.address?.municipality || r.name || "",
                                              country: r.address?.country || "",
                                              address: r.display_name || "",
                                              company_name: `Swap - ${r.address?.city || r.address?.town || r.name || ""}`,
                                              lat: parseFloat(r.lat) || 0,
                                              lng: parseFloat(r.lon) || 0,
                                            });
                                            setSwapLocationSearch(r.display_name || "");
                                            setSwapLocationResults([]);
                                          }}
                                        >
                                          <div className="flex items-start gap-2">
                                            <MapPin className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                              <div className="font-medium truncate">{r.address?.city || r.address?.town || r.address?.village || r.name}</div>
                                              <div className="text-muted-foreground truncate">{r.display_name}</div>
                                            </div>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                
                                {/* Selected Location Preview */}
                                {newSwapStop.city && (
                                  <div className="p-2 rounded bg-amber-500/20 text-xs space-y-2">
                                    <div className="font-medium">{newSwapStop.city}, {newSwapStop.country}</div>
                                    {newSwapStop.lat !== 0 && (
                                      <div className="text-muted-foreground text-[10px]">
                                        Coordinates: {newSwapStop.lat.toFixed(4)}, {newSwapStop.lng.toFixed(4)}
                                      </div>
                                    )}
                                    {/* Swap Date */}
                                    <div>
                                      <label className="text-[10px] text-muted-foreground block mb-1">Swap Date (determines trip order)</label>
                                      <Input 
                                        type="date" 
                                        className="h-7 text-xs bg-background" 
                                        value={newSwapStop.planned_date}
                                        onChange={e => setNewSwapStop(p => ({ ...p, planned_date: e.target.value }))}
                                      />
                                    </div>
                                  </div>
                                )}
                                
                                <div className="flex items-center gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-7 text-xs"
                                    onClick={() => { 
                                      setAddingNewSwapStop(false); 
                                      setNewSwapStop({ city: "", country: "", address: "", company_name: "", lat: 0, lng: 0 }); 
                                      setSwapLocationSearch("");
                                      setSwapLocationResults([]);
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    className="h-7 text-xs"
                                    disabled={!newSwapStop.city}
                                    onClick={() => {
                                      // Mark that we're using a new swap stop, store the insert position
                                      setSplitAtStopIndex(-1); // -1 indicates new stop
                                      setSwapLocationResults([]);
                                    }}
                                  >
                                    Use This Swap Point
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setSplitInsertAfterIndex(idx); setAddingNewSwapStop(true); setSplitAtStopIndex(null); }}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-amber-400 hover:bg-amber-500/10 transition-colors"
                              >
                                <Plus className="h-3 w-3" /> Add swap point here
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Selected swap point summary */}
                {(splitAtStopIndex === -1 && newSwapStop.city) && (
                  <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <MapPin className="h-4 w-4 text-amber-400" />
                      <span className="font-medium">Swap at: {newSwapStop.city}{newSwapStop.country ? `, ${newSwapStop.country}` : ""}</span>
                      <button onClick={() => { setSplitAtStopIndex(null); setAddingNewSwapStop(false); }} className="ml-auto text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Trip 2 execution type */}
                {(splitAtStopIndex !== null && splitAtStopIndex !== -1) || (splitAtStopIndex === -1 && newSwapStop.city) ? (
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Trip 2 execution type:</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSplitTripType("internal")}
                        className={`p-3 rounded-lg border text-xs flex items-center gap-2 transition-colors ${
                          splitTripType === "internal"
                            ? "border-blue-500/50 bg-blue-500/10"
                            : "border-border/30 hover:bg-muted/30"
                        }`}
                      >
                        <Truck className="h-4 w-4 text-blue-400" />
                        <span>Own Fleet</span>
                      </button>
                      <button
                        onClick={() => setSplitTripType("forwarding")}
                        className={`p-3 rounded-lg border text-xs flex items-center gap-2 transition-colors ${
                          splitTripType === "forwarding"
                            ? "border-indigo-500/50 bg-indigo-500/10"
                            : "border-border/30 hover:bg-muted/30"
                        }`}
                      >
                        <Building2 className="h-4 w-4 text-indigo-400" />
                        <span>Forwarding</span>
                      </button>
                    </div>
                  </div>
                ) : null}
                
                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setSplitTripOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    className="h-8 text-xs gap-1" 
                    disabled={creatingSplit || (splitAtStopIndex === null) || (splitAtStopIndex === -1 && !newSwapStop.city)}
                    onClick={async () => {
                      if (splitAtStopIndex === null || (splitAtStopIndex === -1 && !newSwapStop.city)) return;
                      setCreatingSplit(true);
                      
                      try {
                        // swapStopArrayIndex is the 0-based array index where the swap point is/will be
                        let swapStopArrayIndex = splitAtStopIndex;
                        
                        // If adding a new swap stop, insert it first
                        if (splitAtStopIndex === -1 && newSwapStop.city) {
                          // splitInsertAfterIndex is the array index of the stop AFTER which we insert
                          // The new swap stop will be at array index = splitInsertAfterIndex + 1
                          swapStopArrayIndex = splitInsertAfterIndex + 1;
                          
                          // Calculate sequence_order for database (1-based)
                          const insertAfterSequence = editingStops[splitInsertAfterIndex]?.sequence_order ?? (splitInsertAfterIndex + 1);
                          const newSequenceOrder = insertAfterSequence + 1;
                          
                          // Shift all stops after the insert point in the database
                          const stopsToShift = editingStops.filter(s => s.sequence_order >= newSequenceOrder);
                          for (const s of stopsToShift) {
                            await supabase.from("trip_stops").update({ sequence_order: s.sequence_order + 1 }).eq("id", s.id);
                          }
                          
                          // Insert new swap stop
                          const { data: newStop, error: stopError } = await supabase
                            .from("trip_stops")
                            .insert({
                              trip_id: editingTrip.id,
                              order_id: orderId,
                              sequence_order: newSequenceOrder,
                              stop_type: "swap",
                              city: newSwapStop.city,
                              country: newSwapStop.country || null,
                              address: newSwapStop.address || null,
                              company_name: newSwapStop.company_name || `Swap Point - ${newSwapStop.city}`,
                              lat: newSwapStop.lat || null,
                              lng: newSwapStop.lng || null,
                              planned_date: newSwapStop.planned_date || null,
                              status: "pending",
                            })
                            .select()
                            .single();
                          
                          if (stopError) throw stopError;
                        }
                        
                        // Update the LAST existing leg to end at swap point (not just Leg 1)
                        const sortedLegs = [...editingTripLegs].sort((a, b) => a.leg_number - b.leg_number);
                        const lastLeg = sortedLegs[sortedLegs.length - 1];
                        
                        if (lastLeg) {
                          await supabase.from("trip_legs").update({ 
                            to_stop_index: swapStopArrayIndex 
                          }).eq("id", lastLeg.id);
                        } else {
                          // Create Leg 1 if no legs exist (legacy trips)
                          await supabase.from("trip_legs").insert({
                            trip_id: editingTrip.id,
                            leg_number: 1,
                            assignment_type: editingTrip.assignment_type === "forwarding" ? "forwarding" : "own_fleet",
                            status: "planned",
                            from_stop_index: 0,
                            to_stop_index: swapStopArrayIndex,
                            driver_id: editingTrip.driver_id,
                            vehicle_id: editingTrip.vehicle_id,
                            trailer_id: editingTrip.trailer_id,
                          });
                        }
                        
                        // Create the new leg starting from swap point to end
                        const nextLegNumber = editingTripLegs.length + 1;
                        // Total stops after insertion (add 1 if we inserted a new swap stop)
                        const totalStops = splitAtStopIndex === -1 ? editingStops.length + 1 : editingStops.length;
                        
                        const { data: newLeg2 } = await supabase.from("trip_legs").insert({
                          trip_id: editingTrip.id,
                          leg_number: nextLegNumber,
                          assignment_type: splitTripType === "forwarding" ? "forwarding" : "own_fleet",
                          status: "planned",
                          from_stop_index: swapStopArrayIndex,
                          to_stop_index: totalStops - 1,
                        }).select(`
                          id, trip_id, leg_number, assignment_type, status,
                          driver_id, vehicle_id, trailer_id, carrier_id, forwarding_order_id,
                          from_stop_index, to_stop_index,
                      subcontractor_vehicle_plate, subcontractor_trailer_plate, subcontractor_driver_name, subcontractor_driver_phone,
                      driver:driver_id(name), vehicle:vehicle_id(plate_number), trailer:trailer_id(plate_number),
                      carrier:carrier_id(name)
                    `).single();
                        
                        // Refresh the trip stops to include the new swap stop
                        const { data: updatedTripStops } = await supabase
                          .from("trip_stops")
                          .select("*, action_type:action_type_id(id, name, code)")
                          .eq("trip_id", editingTrip.id)
                          .order("sequence_order");
                        
                        // Also refresh legs to get updated indices
                        const { data: updatedLegs } = await supabase
                          .from("trip_legs")
                          .select(`
                            id, trip_id, leg_number, assignment_type, status,
                            driver_id, vehicle_id, trailer_id, carrier_id, forwarding_order_id,
                            from_stop_index, to_stop_index,
                    subcontractor_vehicle_plate, subcontractor_trailer_plate, subcontractor_driver_name, subcontractor_driver_phone,
                    driver:driver_id(name), vehicle:vehicle_id(plate_number), trailer:trailer_id(plate_number),
                    carrier:carrier_id(name)
                  `)
                  .eq("trip_id", editingTrip.id)
                  .order("leg_number");
                        
                        const formattedLegs = (updatedLegs || []).map((leg: any) => ({
                          ...leg,
                          driver_name: leg.driver?.name,
                          vehicle_plate: leg.vehicle?.plate_number,
                          trailer_plate: leg.trailer?.plate_number,
                          carrier_name: leg.carrier?.name,
                        }));
                        
                        // Use flushSync to ensure state updates are committed before opening the dialog
                        // This prevents the leg card from rendering with stale editingStops
                        let sortedStops: any[] = [];
                        if (updatedTripStops) {
                          sortedStops = updatedTripStops.map((s: any) => ({
                            ...s,
                            action_type_id: s.action_type?.id || null,
                            action_type_name: s.action_type?.name || null,
                            action_type_code: s.action_type?.code || null,
                          }));
                        }
                        
                        // Flush all state updates synchronously to ensure render completes
                        flushSync(() => {
                          if (sortedStops.length > 0) {
                            setEditingStops(sortedStops);
                          }
                          setEditingTripLegs(formattedLegs);
                          
                          // Close the swap dialog and reset state
                          setSplitTripOpen(false);
                          setSplitAtStopIndex(null);
                          setAddingNewSwapStop(false);
                          setNewSwapStop({ city: "", country: "", address: "", company_name: "", lat: 0, lng: 0 });
                          setSwapLocationSearch("");
                          setSwapLocationResults([]);
                        });
                        
                        // NOTE: Don't call fetchOrder() here as it would overwrite our freshly updated state
                        // The local state (editingStops, editingTripLegs) has already been refreshed above
                        
                        // Open the leg assignment dialog for the new leg
                        const newLegFormatted = formattedLegs.find((l: any) => l.id === newLeg2?.id);
                        if (newLegFormatted) {
                          setEditingLeg(newLegFormatted);
                          setLegDialogOpen(true);
                          toast({ title: "Leg created", description: `Leg ${nextLegNumber} created. Now configure the assignment.` });
                        }
                      } catch (err: any) {
                        toast({ title: "Error adding swap point", description: err.message, variant: "destructive" });
                      } finally {
                        setCreatingSplit(false);
                      }
                    }}
                  >
                    {creatingSplit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    {creatingSplit ? "Creating..." : "Create Leg"}
                  </Button>
                </div>
              </div>
            )}

            {editingTrip && !splitTripOpen ? (
              <div className="space-y-4">
                {/* Trip header */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] capitalize ${editingTrip.status === "in_progress" ? "border-amber-500/50 text-amber-400" : editingTrip.status === "completed" ? "border-emerald-500/50 text-emerald-400" : ""}`}>
                      {editingTrip.status?.replace("_", " ")}
                    </Badge>
                    {/* Show execution badge based on legs */}
                    {(() => {
                      const legTypes = editingTripLegs.map(l => l.assignment_type);
                      const hasOwnFleet = legTypes.includes("own_fleet");
                      const hasForwarding = legTypes.includes("forwarding");
                      const isMixed = hasOwnFleet && hasForwarding;
                      
                      if (isMixed) {
                        return (
                          <Badge variant="outline" className="text-[9px] px-1.5 text-amber-400 border-amber-500/30 bg-amber-500/10">
                            Mixed
                          </Badge>
                        );
                      } else if (hasOwnFleet) {
                        return (
                          <Badge variant="outline" className="text-[9px] px-1.5 text-blue-400 border-blue-500/30 bg-blue-500/10">
                            Own Fleet
                          </Badge>
                        );
                      } else if (hasForwarding) {
                        return (
                          <Badge variant="outline" className="text-[9px] px-1.5 text-indigo-400 border-indigo-500/30 bg-indigo-500/10">
                            Subcontract
                          </Badge>
                        );
                      } else {
                        // Fallback to trip-level assignment type
                        return (
                          <Badge variant="outline" className={`text-[9px] px-1.5 ${editingTrip.assignment_type === "internal" ? "text-blue-400 border-blue-500/30" : "text-indigo-400 border-indigo-500/30"}`}>
                            {editingTrip.assignment_type === "internal" ? "Own Fleet" : "Forwarding"}
                          </Badge>
                        );
                      }
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditingTrip(null); setEditingStops([]); }}>
                      Cancel
                    </Button>
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={saveTrip} disabled={savingTrip}>
                      <Save className="h-3 w-3" />{savingTrip ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>

                {/* Assignment Section - Only for internal trips WITHOUT legs (legacy/backwards compat) */}
                {editingTrip.assignment_type === "internal" && editingTripLegs.length === 0 && (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Truck className="h-4 w-4 text-blue-400" />
                      <span className="text-xs font-medium">Assignment</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {/* Driver Searchable Select */}
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Driver</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full h-8 text-xs justify-between font-normal">
                              {editingTrip.driver_name || <span className="text-muted-foreground">Select driver...</span>}
                              <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[200px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search driver..." className="h-8 text-xs" value={driverSearch} onValueChange={setDriverSearch} />
                              <CommandList>
                                <CommandEmpty>No driver found</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    value="none"
                                    onSelect={async () => {
                                      await supabase.from("trips").update({ driver_id: null }).eq("id", editingTrip.id);
                                      setEditingTrip((p: any) => ({ ...p, driver_id: null, driver_name: null }));
                                    }}
                                    className="text-xs"
                                  >
                                    <span className="text-muted-foreground">Unassigned</span>
                                  </CommandItem>
                                  {driversList.filter(d => d.name.toLowerCase().includes(driverSearch.toLowerCase())).map(d => (
                                    <CommandItem
                                      key={d.id}
                                      value={d.name}
                                      onSelect={async () => {
                                        await supabase.from("trips").update({ driver_id: d.id }).eq("id", editingTrip.id);
                                        setEditingTrip((p: any) => ({ ...p, driver_id: d.id, driver_name: d.name }));
                                      }}
                                      className="text-xs"
                                    >
                                      <User className="h-3 w-3 mr-2 text-muted-foreground" />
                                      {d.name}
                                      {editingTrip.driver_id === d.id && <Check className="h-3 w-3 ml-auto" />}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      
                      {/* Vehicle Searchable Select */}
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Vehicle</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full h-8 text-xs justify-between font-normal">
                              {editingTrip.vehicle_plate || <span className="text-muted-foreground">Select vehicle...</span>}
                              <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[200px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search vehicle..." className="h-8 text-xs" value={vehicleSearch} onValueChange={setVehicleSearch} />
                              <CommandList>
                                <CommandEmpty>No vehicle found</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    value="none"
                                    onSelect={async () => {
                                      await supabase.from("trips").update({ vehicle_id: null }).eq("id", editingTrip.id);
                                      setEditingTrip((p: any) => ({ ...p, vehicle_id: null, vehicle_plate: null }));
                                    }}
                                    className="text-xs"
                                  >
                                    <span className="text-muted-foreground">Unassigned</span>
                                  </CommandItem>
                                  {vehiclesList.filter(v => v.plate_number.toLowerCase().includes(vehicleSearch.toLowerCase())).map(v => (
                                    <CommandItem
                                      key={v.id}
                                      value={v.plate_number}
                                      onSelect={async () => {
                                        await supabase.from("trips").update({ vehicle_id: v.id }).eq("id", editingTrip.id);
                                        setEditingTrip((p: any) => ({ ...p, vehicle_id: v.id, vehicle_plate: v.plate_number }));
                                      }}
                                      className="text-xs"
                                    >
                                      <Truck className="h-3 w-3 mr-2 text-muted-foreground" />
                                      {v.plate_number}
                                      {editingTrip.vehicle_id === v.id && <Check className="h-3 w-3 ml-auto" />}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      
                      {/* Trailer Searchable Select */}
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Trailer</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full h-8 text-xs justify-between font-normal">
                              {editingTrip.trailer_plate || <span className="text-muted-foreground">Select trailer...</span>}
                              <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[200px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search trailer..." className="h-8 text-xs" value={trailerSearch} onValueChange={setTrailerSearch} />
                              <CommandList>
                                <CommandEmpty>No trailer found</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    value="none"
                                    onSelect={async () => {
                                      await supabase.from("trips").update({ trailer_id: null }).eq("id", editingTrip.id);
                                      setEditingTrip((p: any) => ({ ...p, trailer_id: null, trailer_plate: null }));
                                    }}
                                    className="text-xs"
                                  >
                                    <span className="text-muted-foreground">Unassigned</span>
                                  </CommandItem>
                                  {trailersList.filter(t => t.plate_number.toLowerCase().includes(trailerSearch.toLowerCase())).map(t => (
                                    <CommandItem
                                      key={t.id}
                                      value={t.plate_number}
                                      onSelect={async () => {
                                        await supabase.from("trips").update({ trailer_id: t.id }).eq("id", editingTrip.id);
                                        setEditingTrip((p: any) => ({ ...p, trailer_id: t.id, trailer_plate: t.plate_number }));
                                      }}
                                      className="text-xs"
                                    >
                                      <Container className="h-3 w-3 mr-2 text-muted-foreground" />
                                      {t.plate_number}
                                      {editingTrip.trailer_id === t.id && <Check className="h-3 w-3 ml-auto" />}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>
                )}

                {/* Trip Legs Section - All execution is managed through legs */}
                {editingTripLegs.length > 0 && (
                  <div className="rounded-lg border border-border/50 bg-card/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium">Trip Legs ({editingTripLegs.length})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedMapLegIndex !== null && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                            onClick={() => setSelectedMapLegIndex(null)}
                          >
                            View Full Route
                          </Button>
                        )}
                        <span className="text-[10px] text-muted-foreground">Click to view on map</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {editingTripLegs.map((leg, idx) => {
                        // Get stops covered by this leg
                        const fromIdx = leg.from_stop_index ?? 0;
                        const toIdx = leg.to_stop_index ?? editingStops.length - 1;
                        const fromStop = editingStops[fromIdx];
                        const toStop = editingStops[toIdx];
                        
                        const isSelected = selectedMapLegIndex === idx;
                        const assignmentColor = leg.assignment_type === "own_fleet" 
                          ? "border-blue-500/30 bg-blue-500/5" 
                          : leg.assignment_type === "forwarding" 
                            ? "border-indigo-500/30 bg-indigo-500/5" 
                            : "border-amber-500/30 bg-amber-500/5";
                        const selectedRing = isSelected ? "ring-2 ring-primary" : "";
                        
                        return (
                          <div key={leg.id} className="relative group">
                            <button
                              onClick={() => setSelectedMapLegIndex(isSelected ? null : idx)}
                              className={`w-full rounded-lg border p-3 text-left transition-all hover:ring-1 hover:ring-primary/50 ${assignmentColor} ${selectedRing}`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium">Leg {leg.leg_number}</span>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-[9px] px-1.5 ${
                                      leg.assignment_type === "own_fleet" 
                                        ? "text-blue-400 border-blue-500/30" 
                                        : leg.assignment_type === "forwarding" 
                                          ? "text-indigo-400 border-indigo-500/30"
                                          : "text-amber-400 border-amber-500/30"
                                    }`}
                                  >
                                    {leg.assignment_type === "own_fleet" ? "Own Fleet" : leg.assignment_type === "forwarding" ? "Subcontract" : "Undecided"}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-1">
                                  {isSelected && (
                                    <Badge variant="outline" className="text-[8px] px-1 py-0 text-primary border-primary/30">
                                      On Map
                                    </Badge>
                                  )}
                                  {/* Inline status chip — same UX as the
                                   * Overview leg row. For forwarding legs
                                   * it edits the FWD child; for own-fleet
                                   * it edits the leg itself. We wrap in a
                                   * span with stopPropagation so opening
                                   * the popover doesn't also toggle the
                                   * "highlight on map" button behind it. */}
                                  {(() => {
                                    const isFwd = leg.assignment_type === "forwarding" && leg.forwarding_order_id;
                                    if (isFwd) {
                                      const fwd = subcontracts.find((s: any) => s.id === leg.forwarding_order_id);
                                      const fwdStatus: string = fwd?.status || "fwd_unassigned";
                                      return (
                                        <span onClick={(e) => e.stopPropagation()}>
                                          <LegStatusChip
                                            scope="forwarder"
                                            value={fwdStatus}
                                            contextLabel={fwd?.reference_number || "subcontract"}
                                            showScopeLabel={false}
                                            /* See parent panel: forwarder chip is
                                             * read-only because the FWD child
                                             * order owns the lifecycle. */
                                            readOnly
                                            onChange={async (next) => {
                                              const { error } = await supabase
                                                .from("orders")
                                                .update({ status: next })
                                                .eq("id", leg.forwarding_order_id);
                                              if (error) {
                                                toast({ title: "Error", description: error.message, variant: "destructive" });
                                                return;
                                              }
                                              const twin = forwarderToInternal(next);
                                              if (twin) {
                                                await supabase.from("trip_legs").update({ status: twin }).eq("id", leg.id);
                                              }
                                              if (order?.id) {
                                                await recomputeParentStatus(supabase, order.id, leg.trip_id ?? null);
                                              }
                                              toast({ title: "Forwarder status updated" });
                                              fetchOrder();
                                              onStatusChange?.();
                                            }}
                                          />
                                        </span>
                                      );
                                    }
                                    return (
                                      <span onClick={(e) => e.stopPropagation()}>
                  <LegStatusChip
                  scope="internal"
                  value={leg.status || "unassigned"}
                  contextLabel={`Leg ${leg.leg_number}`}
                                          showScopeLabel={false}
                                          /* Same rule as the Overview chip:
                                           * status is meaningless until an
                                           * execution method is chosen. */
                                          readOnly={!leg.assignment_type || leg.assignment_type === "undecided"}
                                          onChange={async (next) => {
                                            const { error } = await supabase
                                              .from("trip_legs")
                                              .update({ status: next })
                                              .eq("id", leg.id);
                                            if (error) {
                                              toast({ title: "Error", description: error.message, variant: "destructive" });
                                              return;
                                            }
                                            if (order?.id) {
                                              await recomputeParentStatus(supabase, order.id, leg.trip_id ?? null);
                                            }
                                            toast({ title: "Leg status updated" });
                                            fetchOrder();
                                            onStatusChange?.();
                                          }}
                                        />
                                      </span>
                                    );
                                  })()}
                                  {/*
                                    Open the parent Round Trip in a new tab.
                                    Stop propagation so the leg's own click
                                    handler (which toggles map highlight)
                                    doesn't also fire.
                                    
                                    HIDE for subcontract legs: a Round Trip
                                    is an EXECUTION record for our own
                                    fleet/driver. Subcontracted legs are
                                    executed by the external carrier and
                                    don't have a meaningful Round Trip from
                                    the operator's perspective — surfacing
                                    one here was confusing (it pointed to
                                    a trip that the operator never owns).
                                    Only show this button for own_fleet
                                    and undecided legs.
                                  */}
                                  {editingTrip?.id && leg.assignment_type !== "forwarding" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-1.5 gap-1 text-[10px] text-primary hover:text-primary hover:bg-primary/10"
                                      title={`Open Round Trip for Leg ${leg.leg_number}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(
                                          `/admin/tms/trips/${editingTrip.id}/edit#leg-${leg.leg_number}`,
                                          "_blank",
                                          "noopener,noreferrer",
                                        );
                                      }}
                                    >
                                      <Route className="h-3 w-3" />
                                      <span>Round Trip</span>
                                      <ExternalLink className="h-2.5 w-2.5" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => { e.stopPropagation(); setEditingLeg(leg); setLegDialogOpen(true); }}
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                              <MapPin className="h-3 w-3" />
                              <span>{fromStop?.city || "Start"}</span>
                              <ArrowRight className="h-3 w-3" />
                              <span>{toStop?.city || "End"}</span>
                            </div>
                            
                            {leg.assignment_type === "own_fleet" && (
                              <div className="flex items-center gap-3 text-[10px]">
                                {leg.driver_name && (
                                  <span className="flex items-center gap-1 text-blue-400">
                                    <User className="h-3 w-3" /> {leg.driver_name}
                                  </span>
                                )}
                                {leg.vehicle_plate && (
                                  <span className="flex items-center gap-1 text-blue-400">
                                    <Truck className="h-3 w-3" /> {leg.vehicle_plate}
                                  </span>
                                )}
                                {leg.trailer_plate && (
                                  <span className="flex items-center gap-1 text-blue-400">
                                    <Container className="h-3 w-3" /> {leg.trailer_plate}
                                  </span>
                                )}
                                {!leg.driver_name && !leg.vehicle_plate && (
                                  <span className="text-muted-foreground">No resources assigned</span>
                                )}
                              </div>
                            )}
                            
                            {leg.assignment_type === "forwarding" && (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-3 text-[10px] flex-wrap">
                                  {leg.carrier_name && (
                                    <span className="flex items-center gap-1 text-indigo-400">
                                      <Building2 className="h-3 w-3" /> {leg.carrier_name}
                                    </span>
                                  )}
                                  {leg.subcontractor_vehicle_plate && (
                                    <span className="flex items-center gap-1 text-indigo-300">
                                      <Truck className="h-3 w-3" /> {leg.subcontractor_vehicle_plate}
                                    </span>
                                  )}
                                  {leg.subcontractor_trailer_plate && (
                                    <span className="flex items-center gap-1 text-indigo-300">
                                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="6" width="15" height="10" rx="2"/><circle cx="5" cy="16" r="2"/><circle cx="12" cy="16" r="2"/><path d="M16 11h4l3 3v2h-7V11z"/></svg>
                                      {leg.subcontractor_trailer_plate}
                                    </span>
                                  )}
                                  {leg.subcontractor_driver_name && (
                                    <span className="flex items-center gap-1 text-indigo-300">
                                      <User className="h-3 w-3" /> {leg.subcontractor_driver_name}
                                    </span>
                                  )}
                                  {!leg.carrier_name && (
                                    <span className="text-muted-foreground">No carrier assigned</span>
                                  )}
                                </div>
                                {/* FWD Order info */}
                                <div className="flex items-center gap-2 text-[10px]">
                                  {leg.forwarding_order_id && leg.forwarding_order_ref ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/admin/tms/orders/${leg.forwarding_order_id}`);
                                      }}
                                      className="flex items-center gap-1 text-amber-400 hover:text-amber-300 hover:underline"
                                    >
                                      <FileText className="h-3 w-3" />
                                      <span>{leg.forwarding_order_ref}</span>
                                      <ExternalLink className="h-2.5 w-2.5" />
                                    </button>
                                  ) : order.order_type === "forwarding" ? (
                                    <span className="text-amber-400/80 flex items-center gap-1">
                                      <FileText className="h-3 w-3" /> This is the FWD order ({order.reference_number})
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/60 flex items-center gap-1">
                                      <FileText className="h-3 w-3" /> No FWD order
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {leg.assignment_type === "undecided" && (
                              <div className="text-[10px] text-amber-400">
                                Execution method pending decision
                              </div>
                            )}
                            </button>
                            {/* Delete button - only show when more than 1 leg */}
                            {editingTripLegs.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="absolute top-2 right-8 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm(`Delete Leg ${leg.leg_number}? This cannot be undone.`)) return;
                                  
                                  // Delete the leg
                                  await supabase.from("forwarding_order_legs").delete().eq("trip_leg_id", leg.id);
                                  await supabase.from("trip_legs").delete().eq("id", leg.id);
                                  
                                  // Renumber remaining legs
                                  const remainingLegs = editingTripLegs.filter(l => l.id !== leg.id);
                                  for (let i = 0; i < remainingLegs.length; i++) {
                                    await supabase.from("trip_legs").update({ leg_number: i + 1 }).eq("id", remainingLegs[i].id);
                                    remainingLegs[i].leg_number = i + 1;
                                  }
                                  
                                  // If we deleted a leg in the middle, adjust the previous leg's to_stop_index
                                  if (remainingLegs.length > 0) {
                                    const lastLeg = remainingLegs[remainingLegs.length - 1];
                                    await supabase.from("trip_legs").update({ to_stop_index: editingStops.length - 1 }).eq("id", lastLeg.id);
                                    lastLeg.to_stop_index = editingStops.length - 1;
                                  }
                                  
                                  setEditingTripLegs(remainingLegs);
                                  toast({ title: "Leg deleted", description: `Leg removed and remaining legs renumbered.` });
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Add new leg button - opens swap point dialog */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs gap-1 border-dashed"
                      onClick={() => setSplitTripOpen(true)}
                    >
                      <Plus className="h-3 w-3" /> Add Leg (Swap Point)
                    </Button>
                  </div>
                )}
                
                {/* Create first leg if none exist */}
                {editingTripLegs.length === 0 && editingStops.length > 0 && (
                  <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-center gap-3">
                      <Layers className="h-5 w-5 text-primary" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">No Trip Legs Defined</p>
                        <p className="text-xs text-muted-foreground">Create legs to assign different execution methods per segment</p>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1"
                    onClick={async () => {
                      if (!editingTrip?.id) {
                        return;
                          }
                          const insertData = {
                            trip_id: editingTrip.id,
                            leg_number: 1,
                            assignment_type: editingTrip.assignment_type === "forwarding" ? "forwarding" : "own_fleet",
                            from_stop_index: 0,
                            to_stop_index: Math.max(0, editingStops.length - 1),
                            driver_id: editingTrip.driver_id || null,
                            vehicle_id: editingTrip.vehicle_id || null,
                            trailer_id: editingTrip.trailer_id || null,
                            carrier_id: editingTrip.carrier_id || null,
                            status: "planned",
                      };
                      const { data: newLeg, error } = await supabase
                            .from("trip_legs")
                            .insert(insertData)
                            .select(`
                              id, trip_id, leg_number, assignment_type, status,
                              driver_id, vehicle_id, trailer_id, carrier_id, forwarding_order_id,
                              from_stop_index, to_stop_index,
                              subcontractor_vehicle_plate, subcontractor_driver_name, subcontractor_driver_phone,
                              driver:driver_id(name), vehicle:vehicle_id(plate_number), trailer:trailer_id(plate_number),
                              carrier:carrier_id(name)
                            `)
                        .single();
                      if (error) {
                            console.error("[v0] Error creating leg:", error);
                            toast({ title: "Error creating leg", description: error.message, variant: "destructive" });
                            return;
                          }
                          if (newLeg) {
                            const formattedLeg = {
                              ...newLeg,
                              driver_name: newLeg.driver?.name,
                              vehicle_plate: newLeg.vehicle?.plate_number,
                              trailer_plate: newLeg.trailer?.plate_number,
                              carrier_name: newLeg.carrier?.name,
                      };
                      setEditingTripLegs([formattedLeg]);
                            setEditingLeg(formattedLeg);
                            setLegDialogOpen(true);
                          }
                        }}
                      >
                        <Plus className="h-3 w-3" /> Create Leg
                      </Button>
                    </div>
                  </div>
                )}

                {/* Linked orders summary */}
                {(() => {
                  const orderIds = [...new Set(editingStops.filter(s => s.order_id).map(s => s.order_id))];
                  return orderIds.length > 0 && (
                    <div className="bg-muted/30 rounded-lg p-2.5 space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Orders in this trip ({orderIds.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {orderIds.map(oid => {
                          const stopsForOrder = editingStops.filter(s => s.order_id === oid);
                          const pickup = stopsForOrder.find(s => s.stop_type === "pickup");
                          const delivery = stopsForOrder.find(s => s.stop_type === "delivery");
                          return (
                            <div key={oid} className="text-[10px] bg-card border border-border/50 rounded px-2 py-1 flex items-center gap-1.5">
                              <Package className="h-3 w-3 text-muted-foreground" />
                              {pickup?.city || "?"} <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40" /> {delivery?.city || "?"}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Route map with drag-and-drop support */}
                <div className="h-[300px] rounded-lg overflow-hidden border border-border/50">
                  <RouteMap
                    stops={editingStops.map((s: any) => ({
                      id: s.id,
                      lat: s.lat,
                      lng: s.lng,
                      city: s.city || s.company_name || "",
                      country: s.country || "",
                      stop_type: s.stop_type,
                      company_name: s.company_name || "",
                      address: s.address || "",
                      planned_date: s.planned_date || "",
                      planned_time_from: s.planned_time_from || "",
                    }))}
                    fullHeight
                    hideBottomPanels
                    tripLegs={editingTripLegs.length > 0 ? editingTripLegs.map((leg, idx) => {
                      // Use stored indices if available, otherwise calculate based on leg position
                      let fromIdx = leg.from_stop_index;
                      let toIdx = leg.to_stop_index;
                      
                      if (fromIdx === null || fromIdx === undefined || toIdx === null || toIdx === undefined) {
                        if (editingTripLegs.length === 1) {
                          fromIdx = 0;
                          toIdx = editingStops.length - 1;
                        } else {
                          // For multiple legs, each leg covers a segment
                          fromIdx = idx;
                          toIdx = idx + 1;
                        }
                      }
                      
                      return {
                        id: leg.id,
                        leg_number: leg.leg_number,
                        assignment_type: (leg.assignment_type === "forwarding" ? "forwarding" : "own_fleet") as "own_fleet" | "forwarding",
                        from_stop_index: fromIdx,
                        to_stop_index: toIdx,
                        driver_name: leg.driver_name || undefined,
                        vehicle_plate: leg.vehicle_plate || undefined,
                        trailer_plate: leg.trailer_plate || undefined,
                        carrier_name: leg.carrier_name || undefined,
                      };
                    }) : undefined}
                    onStopsReordered={(reorderedStops) => {
                      // Map reordered RouteMap stops back to our editing stops
                      const newStops = reorderedStops.map((rs: any, idx: number) => {
                        const original = editingStops.find(s => s.id === rs.id);
                        return original ? { ...original, sequence_order: idx + 1 } : editingStops[idx];
                      });
                      setEditingStops(newStops);
                    }}
                    onRouteCalculated={(info) => {
                      setEditingRoute({
                        geometry: info.geometry || null,
                        distance_km: info.distance_km,
                        duration_hours: info.duration_hours + info.duration_minutes / 60,
                      });
                      if (info.legs?.length) {
                        setEditingStops(prev => prev.map((s, i) => {
                          if (i === 0) return { ...s, distance_to_km: null, duration_to_minutes: null, route_to_geometry: null };
                          const leg = info.legs?.[i - 1];
                          return leg ? { ...s, distance_to_km: Math.round(leg.distance_km * 10) / 10, duration_to_minutes: Math.round(leg.duration_min), route_to_geometry: leg.geometry || null } : s;
                        }));
                      }
                    }}
                  />
                </div>

                {/* Route summary */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
                  <span className="flex items-center gap-1"><Route className="h-3 w-3" />{Math.round(editingRoute.distance_km)} km</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{Math.floor(editingRoute.duration_hours)}h{Math.round((editingRoute.duration_hours % 1) * 60)}m</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{editingStops.length} stops</span>
                </div>

                {/* Editable stops list with drag handles */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Stop sequence</p>
                    <p className="text-[10px] text-muted-foreground">Drag to reorder or use arrows</p>
                  </div>
                  {editingStops.map((stop, idx) => {
                    const orderLabel = stop.order_id ? `ORD-${stop.order_id.substring(0, 6)}` : null;
                    return (
                      <div key={stop.id || idx} className="border border-border/50 rounded-lg p-3 space-y-2 bg-card/30 group">
                        {/* Stop header with reorder controls */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col gap-0.5">
                              <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-muted-foreground/40 hover:text-foreground" disabled={idx === 0}
                                onClick={() => {
                                  const newStops = [...editingStops];
                                  [newStops[idx - 1], newStops[idx]] = [newStops[idx], newStops[idx - 1]];
                                  setEditingStops(newStops.map((s, i) => ({ ...s, sequence_order: i + 1 })));
                                }}>
                                <ChevronRight className="h-3 w-3 -rotate-90" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-muted-foreground/40 hover:text-foreground" disabled={idx === editingStops.length - 1}
                                onClick={() => {
                                  const newStops = [...editingStops];
                                  [newStops[idx], newStops[idx + 1]] = [newStops[idx + 1], newStops[idx]];
                                  setEditingStops(newStops.map((s, i) => ({ ...s, sequence_order: i + 1 })));
                                }}>
                                <ChevronRight className="h-3 w-3 rotate-90" />
                              </Button>
                            </div>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${stop.stop_type === "pickup" ? "bg-amber-500/20 text-amber-400" : stop.stop_type === "delivery" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}>
                              {idx + 1}
                            </span>
                            <span className="text-xs font-medium capitalize">{stop.stop_type}</span>
                            {stop.action_type_name && <span className="text-[10px] text-muted-foreground">({stop.action_type_name})</span>}
                            {orderLabel && <Badge variant="outline" className="text-[8px] h-4 font-mono">{orderLabel}</Badge>}
                            {stop.distance_to_km != null && idx > 0 && (
                              <span className="text-[10px] text-muted-foreground">{Math.round(stop.distance_to_km)}km / {Math.round(stop.duration_to_minutes || 0)}min</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {/* Delete button for swap stops - allows removing a swap point */}
                            {stop.stop_type === "swap" && !stop.order_stop_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-400 hover:text-red-500 hover:bg-red-500/10"
                                onClick={async () => {
                                  // Delete the swap stop from DB and local state
                                  if (stop.id) {
                                    await supabase.from("trip_stops").delete().eq("id", stop.id);
                                  }
                                  setEditingStops(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sequence_order: i + 1 })));
                                  toast({ title: "Swap point removed", description: "The swap stop has been deleted" });
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                            <Badge variant="outline" className={`text-[9px] capitalize ${stop.status === "completed" ? "border-emerald-500/50 text-emerald-400" : stop.status === "pending" ? "" : "border-amber-500/50 text-amber-400"}`}>
                              {stop.status?.replace("_", " ")}
                            </Badge>
                          </div>
                        </div>

                        {/* Editable fields */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground block mb-0.5">Company</label>
                            <Input className="h-7 text-xs" value={stop.company_name || ""} onChange={e => setEditingStops(prev => prev.map((s, i) => i === idx ? { ...s, company_name: e.target.value } : s))} />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground block mb-0.5">City</label>
                            <Input className="h-7 text-xs" value={stop.city || ""} onChange={e => setEditingStops(prev => prev.map((s, i) => i === idx ? { ...s, city: e.target.value } : s))} />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Address</label>
                          <Input className="h-7 text-xs" value={stop.address || ""} onChange={e => setEditingStops(prev => prev.map((s, i) => i === idx ? { ...s, address: e.target.value } : s))} />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground block mb-0.5">Date</label>
                            <Input type="date" className="h-7 text-xs" value={stop.planned_date || ""} onChange={e => setEditingStops(prev => prev.map((s, i) => i === idx ? { ...s, planned_date: e.target.value } : s))} />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground block mb-0.5">Time From</label>
                            <Input type="time" className="h-7 text-xs" value={stop.planned_time_from || ""} onChange={e => setEditingStops(prev => prev.map((s, i) => i === idx ? { ...s, planned_time_from: e.target.value } : s))} />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground block mb-0.5">Time To</label>
                            <Input type="time" className="h-7 text-xs" value={stop.planned_time_to || ""} onChange={e => setEditingStops(prev => prev.map((s, i) => i === idx ? { ...s, planned_time_to: e.target.value } : s))} />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Notes</label>
                          <Textarea className="min-h-[40px] text-xs resize-none" rows={1} value={stop.notes || ""} onChange={e => setEditingStops(prev => prev.map((s, i) => i === idx ? { ...s, notes: e.target.value } : s))} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Truck className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">{tripStopsExec.length > 0 ? "Select a trip above to edit" : "No trips found for this order"}</p>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Trip Leg Assignment Dialog */}
      {editingLeg && (
        <TripLegAssignmentDialog
          open={legDialogOpen}
          onOpenChange={setLegDialogOpen}
          tripLeg={{
            id: editingLeg.id,
            leg_number: editingLeg.leg_number,
            assignment_type: editingLeg.assignment_type,
            driver_id: editingLeg.driver_id,
            vehicle_id: editingLeg.vehicle_id,
            trailer_id: editingLeg.trailer_id,
            carrier_id: editingLeg.carrier_id,
            forwarding_order_id: editingLeg.forwarding_order_id,
            subcontractor_vehicle_plate: editingLeg.subcontractor_vehicle_plate,
            subcontractor_driver_name: editingLeg.subcontractor_driver_name,
            subcontractor_driver_phone: editingLeg.subcontractor_driver_phone,
            from_city: editingLeg.from_city || editingStops[editingLeg.from_stop_index ?? 0]?.city || "",
            to_city: editingLeg.to_city || editingStops[editingLeg.to_stop_index ?? (editingStops.length - 1)]?.city || "",
            from_stop_index: editingLeg.from_stop_index ?? 0,
            to_stop_index: editingLeg.to_stop_index ?? (editingStops.length - 1),
          }}
          adminId={order?.admin_id || ""}
          parentOrderId={orderId}
          onSave={(updatedLeg) => {
            setEditingTripLegs(prev => prev.map(l => l.id === updatedLeg.id ? updatedLeg : l));
            setEditingLeg(null);
          }}
        />
      )}

      {/* Determine Cost Dialog — opened from the pill above the Carrier Cost
          input. Pulls defaults from the current order so the user usually
          only has to confirm: assigned vehicle/trailer/driver, the order's
          window, and total_distance_km from the planned route. */}
      {order && (
        <DetermineCostDialog
          open={determineCostOpen}
          onOpenChange={setDetermineCostOpen}
          mode="order"
          orderId={order.id}
          adminId={order.admin_id}
          defaults={{
            vehicleId: order.vehicle_id ?? null,
            trailerId: (order as any).trailer_id ?? null,
            driverId:  order.driver_id  ?? null,
            // Period defaults to the FIRST stop's planned datetime → LAST
            // stop's planned datetime (sorted by sequence_order in the
            // fetch). This matches what the user actually means by "the
            // trip" and produces a tighter Traccar query than the
            // pickup-window/delivery-window pair.
            periodFrom:
              (() => {
                const s = stops[0];
                if (!s) return (order as any).pickup_date_from || null;
                const d = s.planned_date;
                const t = s.planned_time_from || "00:00";
                return d ? `${d}T${t.length === 5 ? t : "00:00"}` : null;
              })(),
            periodTo:
              (() => {
                const s = stops[stops.length - 1];
                if (!s) return (order as any).delivery_date_to || null;
                const d = s.planned_date;
                const t = (s as any).planned_time_to || s.planned_time_from || "23:59";
                return d ? `${d}T${t.length === 5 ? t : "23:59"}` : null;
              })(),
            plannedDistanceKm: (order as any).total_distance_km ?? (order as any).distance_km ?? null,
            currency: editData.carrier_currency || order.carrier_currency || "EUR",
            initialAmount: editData.carrier_cost ? Number(editData.carrier_cost) : (order.carrier_cost ?? null),
            // Stops with coordinates → the dialog renders an inline map on
            // the right with these markers and the route polyline once GPS
            // is pulled.
            stops: stops
              .filter((s: any) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
              .map((s: any) => ({
                id: s.id,
                stop_type: s.stop_type,
                label: [s.city, s.country].filter(Boolean).join(", ") || s.address || "Stop",
                lat: Number(s.lat),
                lng: Number(s.lng),
              })),
          }}
          onApply={({ amount, currency }) => {
            // Write the computed total back into the in-flight edit form so
            // the user sees the value immediately and the existing Save
            // button persists it to orders.carrier_cost / .carrier_currency.
            setEditData((p: any) => ({ ...p, carrier_cost: String(amount), carrier_currency: currency }));
          }}
        />
      )}
    </div>
  );
}
