"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Save, GripVertical, Eye, EyeOff, Trash2, Plus, FileText,
  Building2, Route, MapPin, Package, DollarSign, Truck, Users, StickyNote,
  Scale, PenLine, Minus, Type, Hash, Check, Loader2, ChevronLeft,
  ChevronRight, Maximize2, Minimize2, Download,
} from "lucide-react";

// ── Block Types ──────────────────────────────────────────────
type BlockType =
  | "company_header" | "order_info" | "route_summary" | "stops_table"
  | "cargo_details" | "financial_summary" | "carrier_info" | "customer_info"
  | "notes" | "terms" | "signature_area" | "custom_text" | "divider" | "footer";

interface TemplateBlock {
  id: string;
  type: BlockType;
  visible: boolean;
  props: Record<string, any>;
}

interface TemplateConfig {
  blocks: TemplateBlock[];
  pageSettings: {
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    orientation: "portrait" | "landscape";
    fontSize: number;
    primaryColor: string;
  };
}

const BLOCK_CATALOG: { type: BlockType; label: string; icon: React.ReactNode; description: string; defaultProps: Record<string, any>; estimatedHeight: number }[] = [
  { type: "company_header", label: "Company Header", icon: <Building2 className="h-4 w-4" />, description: "Logo, company name, address, VAT", defaultProps: { showLogo: true, showAddress: true, showVat: true, showPhone: true, showEmail: true, alignment: "left" }, estimatedHeight: 100 },
  { type: "order_info", label: "Order Information", icon: <Hash className="h-4 w-4" />, description: "Reference, date, status, type", defaultProps: { showDate: true, showStatus: true, showType: true, layout: "horizontal" }, estimatedHeight: 60 },
  { type: "route_summary", label: "Route Summary", icon: <Route className="h-4 w-4" />, description: "Origin to destination with distance", defaultProps: { showDistance: true, showDuration: true, showFlags: true }, estimatedHeight: 50 },
  { type: "stops_table", label: "Stops Table", icon: <MapPin className="h-4 w-4" />, description: "All stops with details. Auto-paginates.", defaultProps: { showTimeWindow: true, showAddress: true, showContact: true, showNotes: false, rowsPerPage: 10 }, estimatedHeight: 200 },
  { type: "cargo_details", label: "Cargo Details", icon: <Package className="h-4 w-4" />, description: "Weight, pallets, dimensions, ADR", defaultProps: { showWeight: true, showPallets: true, showVolume: true, showAdr: true, showTemperature: true, showGoodsType: true }, estimatedHeight: 80 },
  { type: "financial_summary", label: "Financial Summary", icon: <DollarSign className="h-4 w-4" />, description: "Pricing, costs, margin", defaultProps: { showCustomerPrice: true, showCarrierCost: false, showMargin: false, showCurrency: true, showPaymentTerms: true }, estimatedHeight: 70 },
  { type: "carrier_info", label: "Carrier Information", icon: <Truck className="h-4 w-4" />, description: "Carrier details and contact", defaultProps: { showContact: true, showPaymentTerms: true, showVat: true }, estimatedHeight: 70 },
  { type: "customer_info", label: "Customer Information", icon: <Users className="h-4 w-4" />, description: "Customer details and contact", defaultProps: { showContact: true, showVat: true }, estimatedHeight: 70 },
  { type: "notes", label: "Notes / Instructions", icon: <StickyNote className="h-4 w-4" />, description: "Special instructions and notes", defaultProps: { title: "Notes & Instructions", showInternalNotes: false }, estimatedHeight: 60 },
  { type: "terms", label: "Terms & Conditions", icon: <Scale className="h-4 w-4" />, description: "Legal terms text block", defaultProps: { title: "Terms & Conditions", text: "Standard transport terms apply. Goods must be secured properly during transit. Any damage must be reported within 24 hours of delivery.", fontSize: 8 }, estimatedHeight: 80 },
  { type: "signature_area", label: "Signature Area", icon: <PenLine className="h-4 w-4" />, description: "Sender and carrier signature boxes", defaultProps: { leftLabel: "Sender", rightLabel: "Carrier", showDate: true, showStamp: true }, estimatedHeight: 100 },
  { type: "custom_text", label: "Custom Text", icon: <Type className="h-4 w-4" />, description: "Free text block", defaultProps: { title: "", text: "Enter custom text here...", fontSize: 10, bold: false, alignment: "left" }, estimatedHeight: 40 },
  { type: "divider", label: "Divider", icon: <Minus className="h-4 w-4" />, description: "Horizontal separator line", defaultProps: { style: "solid", color: "#e5e7eb", thickness: 1 }, estimatedHeight: 10 },
  { type: "footer", label: "Page Footer", icon: <FileText className="h-4 w-4" />, description: "Company contact info, page numbers", defaultProps: { showPageNumbers: true, showContact: true, customText: "" }, estimatedHeight: 40 },
];

const DEFAULT_TEMPLATE: TemplateConfig = {
  blocks: [
    { id: "b1", type: "company_header", visible: true, props: BLOCK_CATALOG[0].defaultProps },
    { id: "b2", type: "divider", visible: true, props: { style: "solid", color: "#e5e7eb", thickness: 1 } },
    { id: "b3", type: "order_info", visible: true, props: BLOCK_CATALOG[1].defaultProps },
    { id: "b4", type: "route_summary", visible: true, props: BLOCK_CATALOG[2].defaultProps },
    { id: "b5", type: "stops_table", visible: true, props: BLOCK_CATALOG[3].defaultProps },
    { id: "b6", type: "cargo_details", visible: true, props: BLOCK_CATALOG[4].defaultProps },
    { id: "b7", type: "carrier_info", visible: true, props: BLOCK_CATALOG[6].defaultProps },
    { id: "b8", type: "financial_summary", visible: true, props: BLOCK_CATALOG[5].defaultProps },
    { id: "b9", type: "divider", visible: true, props: { style: "solid", color: "#e5e7eb", thickness: 1 } },
    { id: "b10", type: "notes", visible: true, props: BLOCK_CATALOG[8].defaultProps },
    { id: "b11", type: "terms", visible: true, props: BLOCK_CATALOG[9].defaultProps },
    { id: "b12", type: "signature_area", visible: true, props: BLOCK_CATALOG[10].defaultProps },
    { id: "b13", type: "footer", visible: true, props: BLOCK_CATALOG[13].defaultProps },
  ],
  pageSettings: { marginTop: 20, marginBottom: 20, marginLeft: 20, marginRight: 20, orientation: "portrait", fontSize: 10, primaryColor: "#1e40af" },
};

// ── Sample Data for Preview ──────────────────────────────────
const SAMPLE = {
  company: { name: "ROTIR EVOLUTION SRL", address: "Str. Fabricii Nr. 12, Sector 6", city: "Bucuresti", country: "Romania", vat: "RO12345678", reg: "J40/1234/2020", phone: "+40 721 234 567", email: "office@rotir.ro", logo: null as string | null },
  order: { ref: "FWD-20260216-0001", date: "2026-02-16", status: "Confirmed", type: "Forwarding Order" },
  route: { origin: "Berlin, Germany", destination: "Bucuresti, Romania", distance: "1,847 km", duration: "19h 45m" },
  stops: [
    { nr: 1, type: "Pickup", company: "Berlin Logistics GmbH", city: "Berlin", country: "DE", date: "2026-02-16", time: "08:00 - 12:00", address: "Industriestr. 45" },
    { nr: 2, type: "Transit", company: "Praha Customs", city: "Praha", country: "CZ", date: "2026-02-17", time: "06:00 - 08:00", address: "Celni 12" },
    { nr: 3, type: "Transit", company: "Wien Depot", city: "Wien", country: "AT", date: "2026-02-17", time: "14:00 - 16:00", address: "Lagerstr. 8" },
    { nr: 4, type: "Delivery", company: "Bucuresti Warehouse", city: "Bucuresti", country: "RO", date: "2026-02-18", time: "10:00 - 16:00", address: "Bd. Timisoara 55" },
  ],
  cargo: { weight: "14,500 kg", pallets: "24 EUR", volume: "65 m\u00b3", goods: "Electronics", adr: "None", temp: "N/A" },
  financial: { customerPrice: "\u20ac3,200.00", carrierCost: "\u20ac2,400.00", margin: "\u20ac800.00", marginPct: "25%", currency: "EUR", paymentTerms: "30 days" },
  carrier: { name: "Trans Express SRL", contact: "Ion Popescu", phone: "+40 722 111 222", email: "dispatch@transexpress.ro", vat: "RO87654321" },
  customer: { name: "TechCargo Berlin GmbH", contact: "Hans Mueller", phone: "+49 30 123 456", email: "logistics@techcargo.de", vat: "DE123456789" },
};

function genId() { return `b${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

// ── A4 Page Height (at 72dpi scale, portrait) ───────────────
const A4_H = 1123; // px at preview scale
const A4_W = 794;

export default function TemplateBuilderPage() {
  const { session: adminSession } = useAdminSession();
  const [template, setTemplate] = useState<TemplateConfig>(DEFAULT_TEMPLATE);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("Forwarding Order Template");
  const [allTemplates, setAllTemplates] = useState<{ id: string; name: string; is_default: boolean }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewScale, setPreviewScale] = useState(0.65);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dragSourceIdx, setDragSourceIdx] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<"blocks" | "properties">("blocks");
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Load existing template
  useEffect(() => {
    if (!adminSession?.id) return;
    (async () => {
      const s = createClient();
      const { data } = await s.from("order_templates").select("*").eq("admin_id", adminSession.id).in("template_type", ["forwarding_order", "carrier_order"]).order("is_default", { ascending: false });
      if (data && data.length > 0) {
        setAllTemplates(data.map(t => ({ id: t.id, name: t.name, is_default: t.is_default })));
const active = data[0]; // default first
  try {
  const parsed = typeof active.html_template === "string" ? JSON.parse(active.html_template) : active.html_template;
  if (parsed?.blocks) setTemplate({ 
    ...DEFAULT_TEMPLATE, 
    ...parsed, 
    pageSettings: { ...DEFAULT_TEMPLATE.pageSettings, ...(parsed.pageSettings || {}) } 
  });
  } catch { /* use default */ }
        setTemplateId(active.id);
        setTemplateName(active.name || "Forwarding Order Template");
      }
      // Load company info
      const { data: cp } = await s.from("company_profiles").select("*").eq("admin_id", adminSession.id).maybeSingle();
      if (cp) SAMPLE.company = { name: cp.company_name || SAMPLE.company.name, address: cp.address_line1 || SAMPLE.company.address, city: cp.city || SAMPLE.company.city, country: cp.country || SAMPLE.company.country, vat: cp.vat_number || SAMPLE.company.vat, reg: cp.registration_number || SAMPLE.company.reg, phone: cp.phone || SAMPLE.company.phone, email: cp.email || SAMPLE.company.email, logo: cp.logo_url || null };
      setLoading(false);
    })();
  }, [adminSession?.id]);

  const selectedBlock = template.blocks.find(b => b.id === selectedBlockId) || null;
  const visibleBlocks = template.blocks.filter(b => b.visible);

  // Calculate pages based on estimated block heights
  const pages = useMemo(() => {
    const pageContentH = A4_H - template.pageSettings.marginTop - template.pageSettings.marginBottom - 40;
    const result: TemplateBlock[][] = [[]];
    let currentH = 0;
    for (const block of visibleBlocks) {
      const catalog = BLOCK_CATALOG.find(c => c.type === block.type);
      const h = catalog?.estimatedHeight || 40;
      if (currentH + h > pageContentH && result[result.length - 1].length > 0) {
        result.push([]);
        currentH = 0;
      }
      result[result.length - 1].push(block);
      currentH += h;
    }
    return result;
  }, [visibleBlocks, template.pageSettings]);

  const totalPages = pages.length;

  // Save template
  const handleSave = useCallback(async () => {
    if (!adminSession?.id) return;
    setSaving(true);
    const s = createClient();
    const payload = { admin_id: adminSession.id, template_type: "carrier_order" as const, name: templateName, html_template: JSON.stringify(template), is_default: !allTemplates.some(t => t.is_default && t.id !== templateId), is_active: true };
    if (templateId) {
      await s.from("order_templates").update(payload).eq("id", templateId);
    } else {
      const { data } = await s.from("order_templates").insert(payload).select("id").single();
      if (data) { setTemplateId(data.id); setAllTemplates(prev => [...prev, { id: data.id, name: templateName, is_default: payload.is_default }]); }
    }
    // Refresh list
    const { data: refreshed } = await s.from("order_templates").select("id, name, is_default").eq("admin_id", adminSession.id).in("template_type", ["forwarding_order", "carrier_order"]).order("is_default", { ascending: false });
    if (refreshed) setAllTemplates(refreshed);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [adminSession?.id, template, templateId, templateName, allTemplates]);

  const switchTemplate = async (id: string) => {
    if (id === templateId) return;
    const s = createClient();
    const { data } = await s.from("order_templates").select("*").eq("id", id).single();
if (data) {
  try { 
    const parsed = typeof data.html_template === "string" ? JSON.parse(data.html_template) : data.html_template; 
    if (parsed?.blocks) setTemplate({ 
      ...DEFAULT_TEMPLATE, 
      ...parsed, 
      pageSettings: { ...DEFAULT_TEMPLATE.pageSettings, ...(parsed.pageSettings || {}) } 
    }); 
  } catch {}
  setTemplateId(data.id);
  setTemplateName(data.name || "Untitled Template");
  setSelectedBlockId(null);
  }
  };

  const createNewTemplate = () => {
    setTemplate(DEFAULT_TEMPLATE);
    setTemplateId(null);
    setTemplateName("New Template");
    setSelectedBlockId(null);
  };

  // Block operations
  const updateBlock = (id: string, updates: Partial<TemplateBlock>) => {
    setTemplate(prev => ({ ...prev, blocks: prev.blocks.map(b => b.id === id ? { ...b, ...updates } : b) }));
  };
  const updateBlockProp = (id: string, key: string, value: any) => {
    setTemplate(prev => ({ ...prev, blocks: prev.blocks.map(b => b.id === id ? { ...b, props: { ...b.props, [key]: value } } : b) }));
  };
  const removeBlock = (id: string) => {
    setTemplate(prev => ({ ...prev, blocks: prev.blocks.filter(b => b.id !== id) }));
    if (selectedBlockId === id) setSelectedBlockId(null);
  };
  const addBlock = (type: BlockType) => {
    const catalog = BLOCK_CATALOG.find(c => c.type === type)!;
    const newBlock: TemplateBlock = { id: genId(), type, visible: true, props: { ...catalog.defaultProps } };
    setTemplate(prev => ({ ...prev, blocks: [...prev.blocks, newBlock] }));
    setSelectedBlockId(newBlock.id);
    setRightTab("properties");
  };
  const selectBlock = (id: string) => {
    setSelectedBlockId(id);
    setRightTab("properties");
  };

  // Drag reorder
  const handleDragStart = (idx: number) => { setDragSourceIdx(idx); };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDrop = (idx: number) => {
    if (dragSourceIdx === null || dragSourceIdx === idx) { setDragOverIdx(null); setDragSourceIdx(null); return; }
    setTemplate(prev => {
      const blocks = [...prev.blocks];
      const [moved] = blocks.splice(dragSourceIdx, 1);
      blocks.splice(idx > dragSourceIdx ? idx - 1 : idx, 0, moved);
      return { ...prev, blocks };
    });
    setDragOverIdx(null);
    setDragSourceIdx(null);
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* ── Top Bar ─────────────────────────────────────── */}
      <div className="h-12 border-b border-border/40 bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/admin/settings/forwarding">
            <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs"><ArrowLeft className="h-3.5 w-3.5" />Back to Settings</Button>
          </Link>
          <div className="h-5 w-px bg-border/40" />
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Order Template Builder</span>
          <div className="h-5 w-px bg-border/40" />
          {allTemplates.length > 1 && (
            <Select value={templateId || ""} onValueChange={switchTemplate}>
              <SelectTrigger className="h-7 text-xs bg-card/50 border-border/50 w-[180px]"><SelectValue placeholder="Select template" /></SelectTrigger>
              <SelectContent>
                {allTemplates.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.is_default ? "(Default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            className="h-7 text-xs bg-card/50 border-border/50 w-[180px] font-medium"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            placeholder="Template name"
          />
          <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-muted-foreground" onClick={createNewTemplate}>
            <Plus className="h-3 w-3" />New
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
            <span>Page</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-3 w-3" /></Button>
            <span className="font-medium text-foreground">{currentPage}</span>
            <span>/</span>
            <span>{totalPages}</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-3 w-3" /></Button>
          </div>
          <div className="flex items-center gap-1 border rounded-md px-1.5 py-0.5 border-border/40">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPreviewScale(s => Math.max(0.4, s - 0.1))}><Minimize2 className="h-3 w-3" /></Button>
            <span className="text-[10px] font-mono w-8 text-center">{Math.round(previewScale * 100)}%</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPreviewScale(s => Math.min(1, s + 0.1))}><Maximize2 className="h-3 w-3" /></Button>
          </div>
          <Button variant="default" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving..." : saved ? "Saved" : "Save Template"}
          </Button>
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT: A4 Preview ──────────────────────────── */}
        <div ref={previewContainerRef} className="flex-1 bg-muted/30 overflow-auto flex justify-center py-8 px-4">
          <div className="flex flex-col gap-6">
            {pages.map((pageBlocks, pageIdx) => (
              <div
                key={pageIdx}
                className={`bg-white shadow-xl transition-opacity ${pageIdx + 1 !== currentPage ? "opacity-30 scale-95" : ""}`}
                style={{ width: A4_W * previewScale, minHeight: A4_H * previewScale, padding: `${template.pageSettings.marginTop * previewScale}px ${template.pageSettings.marginRight * previewScale}px ${template.pageSettings.marginBottom * previewScale}px ${template.pageSettings.marginLeft * previewScale}px`, transformOrigin: "top center" }}
                onClick={() => setCurrentPage(pageIdx + 1)}
              >
                {pageBlocks.map(block => (
                  <div
                    key={block.id}
                    className={`relative group cursor-pointer transition-all ${selectedBlockId === block.id ? "ring-2 ring-primary/60 ring-offset-1" : "hover:ring-1 hover:ring-primary/20"}`}
                    style={{ fontSize: `${template.pageSettings.fontSize * previewScale}px` }}
                    onClick={(e) => { e.stopPropagation(); selectBlock(block.id); }}
                  >
                    <BlockPreview block={block} scale={previewScale} primaryColor={template.pageSettings.primaryColor} sample={SAMPLE} />
                  </div>
                ))}
                {/* Page number */}
                <div className="absolute bottom-2 left-0 right-0 text-center" style={{ fontSize: `${8 * previewScale}px`, color: "#9ca3af" }}>
                  Page {pageIdx + 1} of {totalPages}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Block Palette + Properties ─────────── */}
        <div className="w-[340px] border-l border-border/40 bg-card/30 flex flex-col overflow-hidden shrink-0">
          {/* Block List (reorderable) */}
          <div className="border-b border-border/30 px-3 py-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Document Blocks</span>
              <span className="text-[9px] text-muted-foreground">{template.blocks.length} blocks</span>
            </div>
            <div className="space-y-0.5 max-h-[280px] overflow-y-auto">
              {template.blocks.map((block, idx) => {
                const catalog = BLOCK_CATALOG.find(c => c.type === block.type);
                return (
                  <div
                    key={block.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={() => { setDragOverIdx(null); setDragSourceIdx(null); }}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-all ${
                      selectedBlockId === block.id ? "bg-primary/10 text-primary border border-primary/30" :
                      dragOverIdx === idx ? "bg-accent/20 border border-dashed border-primary/40" :
                      "hover:bg-muted/50 border border-transparent"
                    } ${!block.visible ? "opacity-40" : ""}`}
                    onClick={() => selectBlock(block.id)}
                  >
                    <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0 cursor-grab" />
                    <span className="shrink-0">{catalog?.icon}</span>
                    <span className="truncate flex-1 font-medium">{catalog?.label}</span>
                    <button className="opacity-0 group-hover:opacity-100 hover:text-foreground" onClick={(e) => { e.stopPropagation(); updateBlock(block.id, { visible: !block.visible }); }}>
                      {block.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </button>
                    <button className="opacity-0 group-hover:opacity-100 hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="border-b border-border/30 px-3 py-1.5 flex gap-1">
            <button
              onClick={() => setRightTab("blocks")}
              className={`flex-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 rounded-md transition-colors ${rightTab === "blocks" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
            >
              <Plus className="h-3 w-3 inline mr-1" />Add Block
            </button>
            <button
              onClick={() => setRightTab("properties")}
              className={`flex-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 rounded-md transition-colors ${rightTab === "properties" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"} ${selectedBlock ? "" : "opacity-40"}`}
            >
              <Eye className="h-3 w-3 inline mr-1" />Properties
              {selectedBlock && <span className="ml-1 text-[8px] opacity-60">({BLOCK_CATALOG.find(c => c.type === selectedBlock.type)?.label})</span>}
            </button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {rightTab === "blocks" ? (
              <div className="grid grid-cols-2 gap-1.5">
                {BLOCK_CATALOG.map(cat => (
                  <button
                    key={cat.type}
                    onClick={() => addBlock(cat.type)}
                    className="flex flex-col items-center gap-1 px-2 py-3 rounded-lg text-[10px] hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border/30 hover:border-primary/30"
                  >
                    {cat.icon}
                    <span className="truncate text-center">{cat.label}</span>
                  </button>
                ))}
              </div>
            ) : selectedBlock ? (
              <BlockProperties block={selectedBlock} onUpdate={updateBlockProp} onToggleVisibility={() => updateBlock(selectedBlock.id, { visible: !selectedBlock.visible })} onRemove={() => removeBlock(selectedBlock.id)} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40">
                <FileText className="h-8 w-8 mb-2" />
                <p className="text-xs">Select a block to edit properties</p>
              </div>
            )}
          </div>

          {/* Page Settings */}
          <div className="border-t border-border/30 px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Page Settings</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[9px] text-muted-foreground">Font Size</Label>
                <Input type="number" className="h-7 text-xs bg-card/50 border-border/50" value={template.pageSettings.fontSize} min={7} max={14} onChange={e => setTemplate(p => ({ ...p, pageSettings: { ...p.pageSettings, fontSize: Number(e.target.value) } }))} />
              </div>
              <div>
                <Label className="text-[9px] text-muted-foreground">Primary Color</Label>
                <div className="flex items-center gap-1">
                  <input type="color" value={template.pageSettings.primaryColor} onChange={e => setTemplate(p => ({ ...p, pageSettings: { ...p.pageSettings, primaryColor: e.target.value } }))} className="w-7 h-7 rounded border border-border/50 cursor-pointer bg-transparent" />
                  <Input className="h-7 text-xs bg-card/50 border-border/50 flex-1 font-mono" value={template.pageSettings.primaryColor} onChange={e => setTemplate(p => ({ ...p, pageSettings: { ...p.pageSettings, primaryColor: e.target.value } }))} />
                </div>
              </div>
              <div>
                <Label className="text-[9px] text-muted-foreground">Margins (px)</Label>
                <Input type="number" className="h-7 text-xs bg-card/50 border-border/50" value={template.pageSettings.marginTop} min={0} max={60} onChange={e => { const v = Number(e.target.value); setTemplate(p => ({ ...p, pageSettings: { ...p.pageSettings, marginTop: v, marginBottom: v, marginLeft: v, marginRight: v } })); }} />
              </div>
              <div>
                <Label className="text-[9px] text-muted-foreground">Orientation</Label>
                <Select value={template.pageSettings.orientation} onValueChange={v => setTemplate(p => ({ ...p, pageSettings: { ...p.pageSettings, orientation: v as any } }))}>
                  <SelectTrigger className="h-7 text-xs bg-card/50 border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Block Preview Renderer ──────────────────────────────────
function BlockPreview({ block, scale, primaryColor, sample }: { block: TemplateBlock; scale: number; primaryColor: string; sample: typeof SAMPLE }) {
  const s = (v: number) => v * scale;
  const fs = (v: number) => `${v * scale}px`;

  switch (block.type) {
    case "company_header":
      return (
        <div style={{ padding: `${s(8)}px 0`, display: "flex", alignItems: block.props.alignment === "center" ? "center" : "flex-start", flexDirection: block.props.alignment === "center" ? "column" : "row", gap: `${s(12)}px` }}>
          {block.props.showLogo && (
            <div style={{ width: s(60), height: s(60), background: primaryColor + "15", borderRadius: s(6), display: "flex", alignItems: "center", justifyContent: "center", border: `${s(1)}px solid ${primaryColor}30`, flexShrink: 0 }}>
              <span style={{ fontSize: fs(7), color: primaryColor, fontWeight: 700 }}>LOGO</span>
            </div>
          )}
          <div style={{ textAlign: block.props.alignment === "center" ? "center" : "left" }}>
            <div style={{ fontSize: fs(16), fontWeight: 800, color: primaryColor, letterSpacing: "-0.01em" }}>{sample.company.name}</div>
            {block.props.showAddress && <div style={{ fontSize: fs(8), color: "#6b7280", marginTop: s(2) }}>{sample.company.address}, {sample.company.city}, {sample.company.country}</div>}
            <div style={{ display: "flex", gap: `${s(12)}px`, marginTop: s(3), flexWrap: "wrap", justifyContent: block.props.alignment === "center" ? "center" : "flex-start" }}>
              {block.props.showVat && <span style={{ fontSize: fs(7), color: "#9ca3af" }}>VAT: {sample.company.vat}</span>}
              {block.props.showPhone && <span style={{ fontSize: fs(7), color: "#9ca3af" }}>Tel: {sample.company.phone}</span>}
              {block.props.showEmail && <span style={{ fontSize: fs(7), color: "#9ca3af" }}>{sample.company.email}</span>}
            </div>
          </div>
        </div>
      );

    case "order_info":
      return (
        <div style={{ padding: `${s(8)}px 0`, display: "flex", gap: `${s(16)}px`, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: fs(7), color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Reference</div>
            <div style={{ fontSize: fs(12), fontWeight: 700, color: "#111827" }}>{sample.order.ref}</div>
          </div>
          {block.props.showDate && <div><div style={{ fontSize: fs(7), color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Date</div><div style={{ fontSize: fs(10), color: "#374151" }}>{sample.order.date}</div></div>}
          {block.props.showStatus && <div><div style={{ fontSize: fs(7), color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</div><span style={{ fontSize: fs(8), background: primaryColor + "15", color: primaryColor, padding: `${s(2)}px ${s(6)}px`, borderRadius: s(4), fontWeight: 600 }}>{sample.order.status}</span></div>}
          {block.props.showType && <div><div style={{ fontSize: fs(7), color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</div><div style={{ fontSize: fs(9), color: "#374151" }}>{sample.order.type}</div></div>}
        </div>
      );

    case "route_summary":
      return (
        <div style={{ padding: `${s(8)}px ${s(10)}px`, background: primaryColor + "08", borderRadius: s(6), border: `${s(1)}px solid ${primaryColor}20`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: `${s(8)}px` }}>
            <span style={{ fontSize: fs(10), fontWeight: 600, color: "#111827" }}>{sample.route.origin}</span>
            <span style={{ fontSize: fs(10), color: primaryColor }}>{"\u2192"}</span>
            <span style={{ fontSize: fs(10), fontWeight: 600, color: "#111827" }}>{sample.route.destination}</span>
          </div>
          <div style={{ display: "flex", gap: `${s(10)}px` }}>
            {block.props.showDistance && <span style={{ fontSize: fs(8), color: "#6b7280" }}>{sample.route.distance}</span>}
            {block.props.showDuration && <span style={{ fontSize: fs(8), color: "#6b7280" }}>{sample.route.duration}</span>}
          </div>
        </div>
      );

    case "stops_table":
      return (
        <div style={{ padding: `${s(6)}px 0` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: fs(8) }}>
            <thead>
              <tr style={{ background: primaryColor + "10" }}>
                <th style={{ padding: `${s(4)}px ${s(6)}px`, textAlign: "left", fontWeight: 600, color: primaryColor, borderBottom: `${s(1)}px solid ${primaryColor}30`, fontSize: fs(7) }}>#</th>
                <th style={{ padding: `${s(4)}px ${s(6)}px`, textAlign: "left", fontWeight: 600, color: primaryColor, borderBottom: `${s(1)}px solid ${primaryColor}30`, fontSize: fs(7) }}>Type</th>
                <th style={{ padding: `${s(4)}px ${s(6)}px`, textAlign: "left", fontWeight: 600, color: primaryColor, borderBottom: `${s(1)}px solid ${primaryColor}30`, fontSize: fs(7) }}>Company</th>
                <th style={{ padding: `${s(4)}px ${s(6)}px`, textAlign: "left", fontWeight: 600, color: primaryColor, borderBottom: `${s(1)}px solid ${primaryColor}30`, fontSize: fs(7) }}>Location</th>
                <th style={{ padding: `${s(4)}px ${s(6)}px`, textAlign: "left", fontWeight: 600, color: primaryColor, borderBottom: `${s(1)}px solid ${primaryColor}30`, fontSize: fs(7) }}>Date</th>
                {block.props.showTimeWindow && <th style={{ padding: `${s(4)}px ${s(6)}px`, textAlign: "left", fontWeight: 600, color: primaryColor, borderBottom: `${s(1)}px solid ${primaryColor}30`, fontSize: fs(7) }}>Time</th>}
              </tr>
            </thead>
            <tbody>
              {sample.stops.map((stop, i) => (
                <tr key={i} style={{ borderBottom: `${s(0.5)}px solid #e5e7eb` }}>
                  <td style={{ padding: `${s(4)}px ${s(6)}px`, color: "#6b7280" }}>{stop.nr}</td>
                  <td style={{ padding: `${s(4)}px ${s(6)}px` }}><span style={{ fontSize: fs(7), background: stop.type === "Pickup" ? "#dbeafe" : stop.type === "Delivery" ? "#dcfce7" : "#f3f4f6", color: stop.type === "Pickup" ? "#1d4ed8" : stop.type === "Delivery" ? "#15803d" : "#6b7280", padding: `${s(1)}px ${s(4)}px`, borderRadius: s(3), fontWeight: 500 }}>{stop.type}</span></td>
                  <td style={{ padding: `${s(4)}px ${s(6)}px`, fontWeight: 500, color: "#111827" }}>{stop.company}</td>
                  <td style={{ padding: `${s(4)}px ${s(6)}px`, color: "#374151" }}>{stop.city}, {stop.country}{block.props.showAddress ? ` - ${stop.address}` : ""}</td>
                  <td style={{ padding: `${s(4)}px ${s(6)}px`, color: "#374151" }}>{stop.date}</td>
                  {block.props.showTimeWindow && <td style={{ padding: `${s(4)}px ${s(6)}px`, color: "#6b7280" }}>{stop.time}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "cargo_details":
      return (
        <div style={{ padding: `${s(8)}px 0` }}>
          <div style={{ fontSize: fs(9), fontWeight: 700, color: "#111827", marginBottom: s(6) }}>Cargo Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: `${s(4)}px` }}>
            {block.props.showWeight && <InfoCell label="Weight" value={sample.cargo.weight} scale={scale} />}
            {block.props.showPallets && <InfoCell label="Pallets" value={sample.cargo.pallets} scale={scale} />}
            {block.props.showVolume && <InfoCell label="Volume" value={sample.cargo.volume} scale={scale} />}
            {block.props.showGoodsType && <InfoCell label="Goods Type" value={sample.cargo.goods} scale={scale} />}
            {block.props.showAdr && <InfoCell label="ADR Class" value={sample.cargo.adr} scale={scale} />}
            {block.props.showTemperature && <InfoCell label="Temperature" value={sample.cargo.temp} scale={scale} />}
          </div>
        </div>
      );

    case "financial_summary":
      return (
        <div style={{ padding: `${s(8)}px 0` }}>
          <div style={{ fontSize: fs(9), fontWeight: 700, color: "#111827", marginBottom: s(6) }}>Financial Summary</div>
          <div style={{ display: "flex", gap: `${s(8)}px` }}>
            {block.props.showCustomerPrice && <div style={{ flex: 1, padding: `${s(6)}px`, background: "#f0fdf4", borderRadius: s(4), border: `${s(0.5)}px solid #bbf7d0` }}><div style={{ fontSize: fs(7), color: "#6b7280" }}>Customer Price</div><div style={{ fontSize: fs(12), fontWeight: 700, color: "#15803d" }}>{sample.financial.customerPrice}</div></div>}
            {block.props.showCarrierCost && <div style={{ flex: 1, padding: `${s(6)}px`, background: "#fef2f2", borderRadius: s(4), border: `${s(0.5)}px solid #fecaca` }}><div style={{ fontSize: fs(7), color: "#6b7280" }}>Carrier Cost</div><div style={{ fontSize: fs(12), fontWeight: 700, color: "#dc2626" }}>{sample.financial.carrierCost}</div></div>}
            {block.props.showMargin && <div style={{ flex: 1, padding: `${s(6)}px`, background: primaryColor + "08", borderRadius: s(4), border: `${s(0.5)}px solid ${primaryColor}30` }}><div style={{ fontSize: fs(7), color: "#6b7280" }}>Margin</div><div style={{ fontSize: fs(12), fontWeight: 700, color: primaryColor }}>{sample.financial.margin} ({sample.financial.marginPct})</div></div>}
          </div>
          {block.props.showPaymentTerms && <div style={{ fontSize: fs(7), color: "#9ca3af", marginTop: s(4) }}>Payment Terms: {sample.financial.paymentTerms}</div>}
        </div>
      );

    case "carrier_info":
      return (
        <div style={{ padding: `${s(8)}px 0` }}>
          <div style={{ fontSize: fs(9), fontWeight: 700, color: "#111827", marginBottom: s(6) }}>Carrier</div>
          <div style={{ padding: `${s(6)}px`, background: "#f9fafb", borderRadius: s(4), border: `${s(0.5)}px solid #e5e7eb` }}>
            <div style={{ fontSize: fs(10), fontWeight: 600, color: "#111827" }}>{sample.carrier.name}</div>
            {block.props.showContact && <div style={{ fontSize: fs(8), color: "#6b7280", marginTop: s(2) }}>{sample.carrier.contact} | {sample.carrier.phone} | {sample.carrier.email}</div>}
            {block.props.showVat && <div style={{ fontSize: fs(7), color: "#9ca3af", marginTop: s(2) }}>VAT: {sample.carrier.vat}</div>}
          </div>
        </div>
      );

    case "customer_info":
      return (
        <div style={{ padding: `${s(8)}px 0` }}>
          <div style={{ fontSize: fs(9), fontWeight: 700, color: "#111827", marginBottom: s(6) }}>Customer</div>
          <div style={{ padding: `${s(6)}px`, background: "#f9fafb", borderRadius: s(4), border: `${s(0.5)}px solid #e5e7eb` }}>
            <div style={{ fontSize: fs(10), fontWeight: 600, color: "#111827" }}>{sample.customer.name}</div>
            {block.props.showContact && <div style={{ fontSize: fs(8), color: "#6b7280", marginTop: s(2) }}>{sample.customer.contact} | {sample.customer.phone} | {sample.customer.email}</div>}
            {block.props.showVat && <div style={{ fontSize: fs(7), color: "#9ca3af", marginTop: s(2) }}>VAT: {sample.customer.vat}</div>}
          </div>
        </div>
      );

    case "notes":
      return (
        <div style={{ padding: `${s(8)}px 0` }}>
          <div style={{ fontSize: fs(9), fontWeight: 700, color: "#111827", marginBottom: s(4) }}>{block.props.title}</div>
          <div style={{ padding: `${s(6)}px`, background: "#fffbeb", borderRadius: s(4), border: `${s(0.5)}px solid #fde68a`, minHeight: s(30), fontSize: fs(8), color: "#92400e" }}>
            Loading/unloading by carrier. Temperature must be maintained at all times. Call 30 min before arrival.
          </div>
        </div>
      );

    case "terms":
      return (
        <div style={{ padding: `${s(8)}px 0` }}>
          <div style={{ fontSize: fs(9), fontWeight: 700, color: "#111827", marginBottom: s(4) }}>{block.props.title}</div>
          <div style={{ fontSize: fs(block.props.fontSize || 8), color: "#6b7280", lineHeight: 1.5 }}>{block.props.text}</div>
        </div>
      );

    case "signature_area":
      return (
        <div style={{ padding: `${s(12)}px 0`, display: "flex", gap: `${s(20)}px` }}>
          {[block.props.leftLabel, block.props.rightLabel].map((label, i) => (
            <div key={i} style={{ flex: 1 }}>
              <div style={{ fontSize: fs(8), fontWeight: 600, color: "#374151", marginBottom: s(4) }}>{label}</div>
              <div style={{ borderBottom: `${s(1)}px solid #d1d5db`, height: s(40), marginBottom: s(4) }} />
              {block.props.showDate && <div style={{ fontSize: fs(7), color: "#9ca3af" }}>Date: ____/____/________</div>}
              {block.props.showStamp && <div style={{ width: s(50), height: s(50), border: `${s(1)}px dashed #d1d5db`, borderRadius: s(4), marginTop: s(6), display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: fs(6), color: "#d1d5db" }}>Stamp</span></div>}
            </div>
          ))}
        </div>
      );

    case "custom_text":
      return (
        <div style={{ padding: `${s(6)}px 0`, fontSize: fs(block.props.fontSize || 10), color: "#374151", fontWeight: block.props.bold ? 700 : 400, textAlign: block.props.alignment || "left" }}>
          {block.props.title && <div style={{ fontWeight: 700, marginBottom: s(2) }}>{block.props.title}</div>}
          {block.props.text}
        </div>
      );

    case "divider":
      return <hr style={{ border: "none", borderTop: `${block.props.thickness * scale}px ${block.props.style} ${block.props.color}`, margin: `${s(6)}px 0` }} />;

    case "footer":
      return (
        <div style={{ padding: `${s(6)}px 0`, borderTop: `${s(0.5)}px solid #e5e7eb`, marginTop: s(6), display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {block.props.showContact && <span style={{ fontSize: fs(7), color: "#9ca3af" }}>{sample.company.name} | {sample.company.phone} | {sample.company.email}</span>}
          {block.props.customText && <span style={{ fontSize: fs(7), color: "#9ca3af" }}>{block.props.customText}</span>}
        </div>
      );

    default:
      return <div style={{ padding: s(8), background: "#f3f4f6", fontSize: fs(9), color: "#9ca3af" }}>Unknown block: {block.type}</div>;
  }
}

function InfoCell({ label, value, scale }: { label: string; value: string; scale: number }) {
  const s = (v: number) => v * scale;
  const fs = (v: number) => `${v * scale}px`;
  return (
    <div style={{ padding: `${s(4)}px`, background: "#f9fafb", borderRadius: s(3), border: `${s(0.5)}px solid #e5e7eb` }}>
      <div style={{ fontSize: fs(7), color: "#9ca3af" }}>{label}</div>
      <div style={{ fontSize: fs(9), fontWeight: 600, color: "#111827" }}>{value}</div>
    </div>
  );
}

// ── Block Properties Panel ──────────────────────────────────
function BlockProperties({ block, onUpdate, onToggleVisibility, onRemove }: {
  block: TemplateBlock;
  onUpdate: (id: string, key: string, value: any) => void;
  onToggleVisibility: () => void;
  onRemove: () => void;
}) {
  const catalog = BLOCK_CATALOG.find(c => c.type === block.type);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {catalog?.icon}
          <span className="text-xs font-semibold">{catalog?.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onToggleVisibility}>
            {block.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">{catalog?.description}</p>

      <div className="space-y-3">
        {Object.entries(block.props).map(([key, value]) => {
          const label = key.replace(/([A-Z])/g, " $1").replace(/^show\s/i, "Show ").replace(/^./, s => s.toUpperCase());
          if (typeof value === "boolean") {
            return (
              <div key={key} className="flex items-center justify-between">
                <Label className="text-[10px]">{label}</Label>
                <Switch checked={value} onCheckedChange={v => onUpdate(block.id, key, v)} className="scale-75" />
              </div>
            );
          }
          if (typeof value === "number") {
            return (
              <div key={key}>
                <Label className="text-[10px] text-muted-foreground">{label}</Label>
                <Input type="number" className="h-7 text-xs bg-card/50 border-border/50 mt-1" value={value ?? 0} onChange={e => onUpdate(block.id, key, Number(e.target.value))} />
              </div>
            );
          }
          if (key === "alignment") {
            return (
              <div key={key}>
                <Label className="text-[10px] text-muted-foreground">{label}</Label>
                <Select value={value || "left"} onValueChange={v => onUpdate(block.id, key, v)}>
                  <SelectTrigger className="h-7 text-xs bg-card/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          }
          if (key === "style") {
            return (
              <div key={key}>
                <Label className="text-[10px] text-muted-foreground">{label}</Label>
                <Select value={value || "solid"} onValueChange={v => onUpdate(block.id, key, v)}>
                  <SelectTrigger className="h-7 text-xs bg-card/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solid">Solid</SelectItem>
                    <SelectItem value="dashed">Dashed</SelectItem>
                    <SelectItem value="dotted">Dotted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          }
          if (key === "layout") {
            return (
              <div key={key}>
                <Label className="text-[10px] text-muted-foreground">{label}</Label>
                <Select value={value || "horizontal"} onValueChange={v => onUpdate(block.id, key, v)}>
                  <SelectTrigger className="h-7 text-xs bg-card/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="horizontal">Horizontal</SelectItem>
                    <SelectItem value="vertical">Vertical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          }
          if (key === "color") {
            return (
              <div key={key}>
                <Label className="text-[10px] text-muted-foreground">{label}</Label>
                <div className="flex items-center gap-1 mt-1">
                  <input type="color" value={value || "#e5e7eb"} onChange={e => onUpdate(block.id, key, e.target.value)} className="w-7 h-7 rounded border border-border/50 cursor-pointer bg-transparent" />
                  <Input className="h-7 text-xs bg-card/50 border-border/50 flex-1 font-mono" value={value || ""} onChange={e => onUpdate(block.id, key, e.target.value)} />
                </div>
              </div>
            );
          }
          if (typeof value === "string" && value.length > 50) {
            return (
              <div key={key}>
                <Label className="text-[10px] text-muted-foreground">{label}</Label>
                <textarea
                  value={value || ""}
                  onChange={e => onUpdate(block.id, key, e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-border/50 bg-card/50 px-2 py-1.5 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>
            );
          }
          return (
            <div key={key}>
              <Label className="text-[10px] text-muted-foreground">{label}</Label>
              <Input className="h-7 text-xs bg-card/50 border-border/50 mt-1" value={value ?? ""} onChange={e => onUpdate(block.id, key, e.target.value)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
