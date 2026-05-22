"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Plus, MoreVertical, Pencil, Trash2, Copy, Globe, FileText,
  Loader2, Check, ChevronDown, X, Zap, Tag, Languages, Eye,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { RichTextEditor } from "@/components/email/rich-text-editor";

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ro", label: "Romanian", flag: "🇷🇴" },
  { code: "de", label: "German", flag: "🇩🇪" },
  { code: "hu", label: "Hungarian", flag: "🇭🇺" },
  { code: "fr", label: "French", flag: "🇫🇷" },
  { code: "es", label: "Spanish", flag: "🇪🇸" },
  { code: "it", label: "Italian", flag: "🇮🇹" },
  { code: "pl", label: "Polish", flag: "🇵🇱" },
  { code: "nl", label: "Dutch", flag: "🇳🇱" },
  { code: "bg", label: "Bulgarian", flag: "🇧🇬" },
];

const CATEGORIES = [
  { value: "orders", label: "Orders" },
  { value: "forwarding", label: "Forwarding" },
  { value: "documents", label: "Documents" },
  { value: "invoices", label: "Invoices" },
  { value: "maintenance", label: "Maintenance" },
  { value: "general", label: "General" },
];

const TRIGGER_EVENTS = [
  { value: "", label: "Manual only" },
  { value: "order_confirmed", label: "Order Confirmed" },
  { value: "order_signed_sent", label: "Signed Order Sent to Customer" },
  { value: "order_delivered", label: "Order Delivered" },
  { value: "invoice_created", label: "Invoice Created" },
  { value: "cmr_pod_received", label: "CMR/POD Received" },
  { value: "carrier_assigned", label: "Carrier Assigned" },
  { value: "documents_sent", label: "Documents Sent to Client" },
];

const TEMPLATE_VARIABLES = [
  { key: "customer_name", desc: "Customer/Client name" },
  { key: "company_name", desc: "Your company name" },
  { key: "order_number", desc: "Order reference number" },
  { key: "carrier_name", desc: "Carrier company name" },
  { key: "pickup_address", desc: "Pickup location" },
  { key: "delivery_address", desc: "Delivery location" },
  { key: "pickup_date", desc: "Pickup date" },
  { key: "delivery_date", desc: "Delivery date" },
  { key: "invoice_number", desc: "Invoice number" },
  { key: "total_amount", desc: "Total amount" },
  { key: "currency", desc: "Currency code" },
  { key: "sender_name", desc: "Sender (admin) name" },
  { key: "sender_email", desc: "Sender email" },
];

interface Translation {
  language_code: string;
  subject: string;
  body_html: string;
  body_text?: string;
}

interface Template {
  id: string;
  name: string;
  trigger_event: string | null;
  category: string;
  is_active: boolean;
  created_at: string;
  email_template_translations: { id: string; language_code: string; subject: string }[];
}

export default function EmailTemplatesPage() {
  const [session, setSession] = useState<any>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState("general");
  const [tplTrigger, setTplTrigger] = useState("");
  const [tplActive, setTplActive] = useState(true);
  const [translations, setTranslations] = useState<Translation[]>([{ language_code: "en", subject: "", body_html: "" }]);
  const [activeLang, setActiveLang] = useState("en");
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load session
  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(d => {
      if (d?.session) setSession(d.session);
    });
  }, []);

  const headers = useCallback(() => ({
    "Content-Type": "application/json",
    "x-admin-id": session?.id || "",
  }), [session?.id]);

  const fetchTemplates = useCallback(async () => {
    if (!session?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/email/templates", { headers: headers() });
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [session?.id, headers]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const openNewTemplate = () => {
    setEditingId(null);
    setTplName("");
    setTplCategory("general");
    setTplTrigger("");
    setTplActive(true);
    setTranslations([{ language_code: "en", subject: "", body_html: "" }]);
    setActiveLang("en");
    setEditorOpen(true);
  };

  const openEditTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/email/templates/${id}`, { headers: headers() });
      const data = await res.json();
      if (!data.template) { toast.error("Template not found"); return; }
      const t = data.template;
      setEditingId(id);
      setTplName(t.name);
      setTplCategory(t.category || "general");
      setTplTrigger(t.trigger_event || "");
      setTplActive(t.is_active);
      const trans = (t.email_template_translations || []).map((tr: any) => ({
        language_code: tr.language_code,
        subject: tr.subject,
        body_html: tr.body_html,
        body_text: tr.body_text,
      }));
      setTranslations(trans.length > 0 ? trans : [{ language_code: "en", subject: "", body_html: "" }]);
      setActiveLang(trans[0]?.language_code || "en");
      setEditorOpen(true);
    } catch { toast.error("Failed to load template"); }
  };

  const saveTemplate = async () => {
    if (!tplName.trim()) { toast.error("Template name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: tplName,
        trigger_event: tplTrigger || null,
        category: tplCategory,
        is_active: tplActive,
        translations,
      };
      const url = editingId ? `/api/email/templates/${editingId}` : "/api/email/templates";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Failed to save"); return; }
      toast.success(editingId ? "Template updated" : "Template created");
      setEditorOpen(false);
      fetchTemplates();
    } catch { toast.error("Failed to save"); } finally { setSaving(false); }
  };

  const deleteTemplate = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/email/templates/${id}`, { method: "DELETE", headers: headers() });
      if (!res.ok) { toast.error("Failed to delete"); return; }
      toast.success("Template deleted");
      setDeleteConfirm(null);
      fetchTemplates();
    } catch { toast.error("Failed to delete"); } finally { setDeleting(false); }
  };

  const duplicateTemplate = async (tpl: Template) => {
    try {
      const res = await fetch(`/api/email/templates/${tpl.id}`, { headers: headers() });
      const data = await res.json();
      if (!data.template) return;
      const t = data.template;
      const payload = {
        name: `${t.name} (Copy)`,
        trigger_event: null,
        category: t.category,
        is_active: false,
        translations: (t.email_template_translations || []).map((tr: any) => ({
          language_code: tr.language_code, subject: tr.subject, body_html: tr.body_html,
        })),
      };
      await fetch("/api/email/templates", { method: "POST", headers: headers(), body: JSON.stringify(payload) });
      toast.success("Template duplicated");
      fetchTemplates();
    } catch { toast.error("Failed to duplicate"); }
  };

  // Current translation being edited
  const currentTrans = translations.find(t => t.language_code === activeLang);
  const updateCurrentTranslation = (field: "subject" | "body_html", value: string) => {
    setTranslations(prev => prev.map(t =>
      t.language_code === activeLang ? { ...t, [field]: value } : t
    ));
  };

  const addLanguage = (langCode: string) => {
    if (translations.some(t => t.language_code === langCode)) return;
    setTranslations(prev => [...prev, { language_code: langCode, subject: "", body_html: "" }]);
    setActiveLang(langCode);
  };

  const removeLanguage = (langCode: string) => {
    if (translations.length <= 1) return;
    setTranslations(prev => prev.filter(t => t.language_code !== langCode));
    if (activeLang === langCode) {
      setActiveLang(translations.find(t => t.language_code !== langCode)?.language_code || "en");
    }
  };

  const insertVariable = (varKey: string) => {
    updateCurrentTranslation("body_html", (currentTrans?.body_html || "") + `{{${varKey}}}`);
  };

  const getLangInfo = (code: string) => LANGUAGES.find(l => l.code === code);
  const getCategoryLabel = (val: string) => CATEGORIES.find(c => c.value === val)?.label || val;
  const getTriggerLabel = (val: string | null) => TRIGGER_EVENTS.find(e => e.value === (val || ""))?.label || "Manual";

  // Preview: render with sample data
  const renderPreview = (html: string) => {
    const sampleVars: Record<string, string> = {
      customer_name: "John Smith",
      company_name: "RT Transport",
      order_number: "ORD-20260219-0001",
      carrier_name: "Express Logistics",
      pickup_address: "Dordrecht, Netherlands",
      delivery_address: "Moers, Germany",
      pickup_date: "2026-02-20",
      delivery_date: "2026-02-21",
      invoice_number: "INV-2026-0001",
      total_amount: "1,250.00",
      currency: "EUR",
      sender_name: "Admin",
      sender_email: "office@company.com",
    };
    return html.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      sampleVars[key] !== undefined ? `<span style="background:#fef3c7;padding:0 3px;border-radius:3px">${sampleVars[key]}</span>` : `{{${key}}}`
    );
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border/40">
        <Link href="/admin/email" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Email Templates</h1>
          <p className="text-xs text-muted-foreground">Create and manage multi-language email templates for automated and manual sending</p>
        </div>
        <Button className="gap-2" onClick={openNewTemplate}>
          <Plus className="h-4 w-4" /> New Template
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">No templates yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first email template to get started</p>
            </div>
            <Button className="gap-2 mt-2" onClick={openNewTemplate}>
              <Plus className="h-4 w-4" /> Create Template
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((tpl) => (
              <Card key={tpl.id} className="group hover:border-primary/30 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-semibold truncate">{tpl.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                          <Tag className="h-2.5 w-2.5" /> {getCategoryLabel(tpl.category)}
                        </span>
                        {tpl.trigger_event && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-500">
                            <Zap className="h-2.5 w-2.5" /> {getTriggerLabel(tpl.trigger_event)}
                          </span>
                        )}
                        {!tpl.is_active && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditTemplate(tpl.id)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicateTemplate(tpl)}>
                          <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteConfirm(tpl.id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex items-center gap-1.5">
                    <Languages className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className="flex gap-1">
                      {(tpl.email_template_translations || []).map((tr) => {
                        const lang = getLangInfo(tr.language_code);
                        return (
                          <span key={tr.language_code} className="text-sm" title={lang?.label || tr.language_code}>
                            {lang?.flag || tr.language_code}
                          </span>
                        );
                      })}
                      {(!tpl.email_template_translations || tpl.email_template_translations.length === 0) && (
                        <span className="text-[11px] text-muted-foreground">No languages</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-3 h-8 text-xs"
                    onClick={() => openEditTemplate(tpl.id)}
                  >
                    <Pencil className="h-3 w-3 mr-1.5" /> Edit Template
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Template Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b border-border/40">
            <DialogTitle>{editingId ? "Edit Template" : "New Template"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Template metadata */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Template Name</label>
                <Input value={tplName} onChange={e => setTplName(e.target.value)} placeholder="e.g. Order Confirmation" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Category</label>
                <Select value={tplCategory} onValueChange={setTplCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Auto-Trigger Event</label>
                <Select value={tplTrigger || "none"} onValueChange={v => setTplTrigger(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGER_EVENTS.map(e => <SelectItem key={e.value || "none"} value={e.value || "none"}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <button
                  type="button"
                  onClick={() => setTplActive(!tplActive)}
                  className={`h-5 w-9 rounded-full transition-colors relative ${tplActive ? "bg-primary" : "bg-muted"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${tplActive ? "left-[18px]" : "left-0.5"}`} />
                </button>
                Active
              </label>
            </div>

            {/* Language tabs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Translations</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                      <Globe className="h-3 w-3" /> Add Language <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {LANGUAGES.filter(l => !translations.some(t => t.language_code === l.code)).map(l => (
                      <DropdownMenuItem key={l.code} onClick={() => addLanguage(l.code)}>
                        <span className="mr-2">{l.flag}</span> {l.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Language tabs row */}
              <div className="flex gap-1 border-b border-border/40 pb-0">
                {translations.map((t) => {
                  const lang = getLangInfo(t.language_code);
                  return (
                    <button
                      key={t.language_code}
                      onClick={() => setActiveLang(t.language_code)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                        activeLang === t.language_code
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>{lang?.flag}</span>
                      {lang?.label || t.language_code}
                      {translations.length > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeLanguage(t.language_code); }}
                          className="ml-1 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Subject + body for active language */}
              {currentTrans && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Subject</label>
                    <Input
                      value={currentTrans.subject}
                      onChange={e => updateCurrentTranslation("subject", e.target.value)}
                      placeholder="e.g. Order {{order_number}} has been confirmed"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">Body</label>
                      <div className="flex items-center gap-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2">
                              {"{{x}}"} Insert Variable
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="max-h-60 overflow-y-auto">
                            {TEMPLATE_VARIABLES.map(v => (
                              <DropdownMenuItem key={v.key} onClick={() => insertVariable(v.key)}>
                                <code className="text-[11px] bg-muted px-1 rounded mr-2">{`{{${v.key}}}`}</code>
                                <span className="text-muted-foreground text-[11px]">{v.desc}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] gap-1 px-2"
                          onClick={() => setPreviewOpen(true)}
                        >
                          <Eye className="h-3 w-3" /> Preview
                        </Button>
                      </div>
                    </div>
                    <RichTextEditor
                      content={currentTrans.body_html}
                      onChange={(html) => updateCurrentTranslation("body_html", html)}
                      placeholder="Write your template content..."
                      minHeight="250px"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/40">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {editingId ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
          </DialogHeader>
          {currentTrans && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Subject:</p>
                <p className="font-medium text-sm" dangerouslySetInnerHTML={{ __html: renderPreview(currentTrans.subject) }} />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Body:</p>
                <div
                  className="border rounded-lg p-4 bg-white text-black text-sm prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderPreview(currentTrans.body_html) }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Variables highlighted in yellow are replaced with sample data for preview.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete this template and all its translations. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && deleteTemplate(deleteConfirm)} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
