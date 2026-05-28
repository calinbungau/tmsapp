"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Plus, Trash2, Loader2, Save, X, Languages, ChevronLeft,
  Globe, Zap, Tag, FileText, Copy, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/email/rich-text-editor";
import { toast } from "sonner";

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
  updated_at: string;
  email_template_translations: { id: string; language_code: string; subject: string }[];
}

const LANGUAGES = [
  { code: "en", label: "English", flag: "GB" },
  { code: "ro", label: "Romanian", flag: "RO" },
  { code: "de", label: "German", flag: "DE" },
  { code: "hu", label: "Hungarian", flag: "HU" },
  { code: "fr", label: "French", flag: "FR" },
  { code: "es", label: "Spanish", flag: "ES" },
  { code: "it", label: "Italian", flag: "IT" },
  { code: "nl", label: "Dutch", flag: "NL" },
  { code: "pl", label: "Polish", flag: "PL" },
  { code: "bg", label: "Bulgarian", flag: "BG" },
  { code: "cs", label: "Czech", flag: "CZ" },
  { code: "sk", label: "Slovak", flag: "SK" },
];

const TRIGGER_EVENTS = [
  { value: "", label: "Manual only" },
  { value: "order_confirmed", label: "Order confirmed (stamp + signature)" },
  { value: "order_created", label: "New order received" },
  { value: "order_delivered", label: "Order delivered" },
  { value: "order_invoiced", label: "Invoice sent to client" },
  { value: "carrier_assigned", label: "Carrier assigned" },
  { value: "documents_received", label: "CMR/POD documents received" },
  { value: "payment_received", label: "Payment received" },
];

const CATEGORIES = [
  { value: "orders", label: "Orders" },
  { value: "invoicing", label: "Invoicing" },
  { value: "carrier", label: "Carrier" },
  { value: "documents", label: "Documents" },
  { value: "general", label: "General" },
];

const TEMPLATE_VARIABLES = [
  { key: "customer_name", desc: "Customer/client name" },
  { key: "company_name", desc: "Your company name" },
  { key: "order_number", desc: "Order reference number" },
  { key: "order_date", desc: "Order creation date" },
  { key: "delivery_date", desc: "Delivery date" },
  { key: "pickup_location", desc: "Pickup city/address" },
  { key: "delivery_location", desc: "Delivery city/address" },
  { key: "carrier_name", desc: "Carrier name" },
  { key: "invoice_number", desc: "Invoice number" },
  { key: "total_amount", desc: "Total amount" },
  { key: "currency", desc: "Currency (EUR, RON...)" },
  { key: "sender_name", desc: "Your name" },
  { key: "sender_email", desc: "Your email" },
];

export function EmailTemplatesManager({ adminId }: { adminId: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editor state
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTrigger, setEditTrigger] = useState("");
  const [editCategory, setEditCategory] = useState("general");
  const [editActive, setEditActive] = useState(true);
  const [editTranslations, setEditTranslations] = useState<Translation[]>([]);
  const [activeLang, setActiveLang] = useState("en");
  const [previewMode, setPreviewMode] = useState(false);

  const headers = useCallback(() => ({
    "Content-Type": "application/json",
    "x-admin-id": adminId,
    "x-user-id": (typeof window !== "undefined" ? (() => { try { return JSON.parse(window.localStorage.getItem("admin_session") || "{}").user_id || ""; } catch { return ""; } })() : ""),
  }), [adminId]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/templates", { headers: headers() });
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch { /* silent */ }
    setLoading(false);
  }, [headers]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const startNew = () => {
    setEditId(null);
    setEditName("");
    setEditTrigger("");
    setEditCategory("general");
    setEditActive(true);
    setEditTranslations([{ language_code: "en", subject: "", body_html: "" }]);
    setActiveLang("en");
    setEditing(true);
    setPreviewMode(false);
  };

  const startEdit = async (tpl: Template) => {
    try {
      const res = await fetch(`/api/email/templates/${tpl.id}`, { headers: headers() });
      const data = await res.json();
      const t = data.template;
      setEditId(t.id);
      setEditName(t.name);
      setEditTrigger(t.trigger_event || "");
      setEditCategory(t.category || "general");
      setEditActive(t.is_active);
      const trans = (t.email_template_translations || []).map((tr: any) => ({
        language_code: tr.language_code,
        subject: tr.subject,
        body_html: tr.body_html,
        body_text: tr.body_text,
      }));
      setEditTranslations(trans.length > 0 ? trans : [{ language_code: "en", subject: "", body_html: "" }]);
      setActiveLang(trans[0]?.language_code || "en");
      setEditing(true);
      setPreviewMode(false);
    } catch {
      toast.error("Failed to load template");
    }
  };

  const addLanguage = (code: string) => {
    if (editTranslations.find((t) => t.language_code === code)) return;
    setEditTranslations((prev) => [...prev, { language_code: code, subject: "", body_html: "" }]);
    setActiveLang(code);
  };

  const removeLanguage = (code: string) => {
    if (editTranslations.length <= 1) return;
    setEditTranslations((prev) => prev.filter((t) => t.language_code !== code));
    if (activeLang === code) {
      const remaining = editTranslations.filter((t) => t.language_code !== code);
      setActiveLang(remaining[0]?.language_code || "en");
    }
  };

  const updateTranslation = (code: string, field: keyof Translation, value: string) => {
    setEditTranslations((prev) =>
      prev.map((t) => (t.language_code === code ? { ...t, [field]: value } : t))
    );
  };

  const saveTemplate = async () => {
    if (!editName.trim()) { toast.error("Template name is required"); return; }
    const hasContent = editTranslations.some((t) => t.subject.trim() && t.body_html.trim());
    if (!hasContent) { toast.error("At least one language needs a subject and body"); return; }

    setSaving(true);
    try {
      const payload = {
        name: editName,
        trigger_event: editTrigger || null,
        category: editCategory,
        is_active: editActive,
        translations: editTranslations.filter((t) => t.subject.trim() || t.body_html.trim()),
      };

      const url = editId ? `/api/email/templates/${editId}` : "/api/email/templates";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(payload) });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
        setSaving(false);
        return;
      }

      toast.success(editId ? "Template updated" : "Template created");
      setEditing(false);
      fetchTemplates();
    } catch {
      toast.error("Failed to save template");
    }
    setSaving(false);
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Delete this template and all its translations?")) return;
    try {
      await fetch(`/api/email/templates/${id}`, { method: "DELETE", headers: headers() });
      toast.success("Template deleted");
      fetchTemplates();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const duplicateTemplate = async (tpl: Template) => {
    try {
      const res = await fetch(`/api/email/templates/${tpl.id}`, { headers: headers() });
      const data = await res.json();
      const t = data.template;
      const payload = {
        name: `${t.name} (Copy)`,
        trigger_event: t.trigger_event || null,
        category: t.category,
        is_active: false,
        translations: (t.email_template_translations || []).map((tr: any) => ({
          language_code: tr.language_code,
          subject: tr.subject,
          body_html: tr.body_html,
          body_text: tr.body_text,
        })),
      };
      await fetch("/api/email/templates", { method: "POST", headers: headers(), body: JSON.stringify(payload) });
      toast.success("Template duplicated");
      fetchTemplates();
    } catch {
      toast.error("Failed to duplicate");
    }
  };

  const currentTrans = editTranslations.find((t) => t.language_code === activeLang);
  const langLabel = (code: string) => LANGUAGES.find((l) => l.code === code)?.label || code.toUpperCase();
  const langFlag = (code: string) => LANGUAGES.find((l) => l.code === code)?.flag || "";

  const renderPreview = (html: string) => {
    let rendered = html;
    TEMPLATE_VARIABLES.forEach(({ key }) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      rendered = rendered.replace(regex, `<span style="background:#fbbf24;color:#000;padding:1px 4px;border-radius:3px;font-size:12px">[${key}]</span>`);
    });
    return rendered;
  };

  // ─── EDITOR VIEW ───
  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setEditing(false)}>
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <h4 className="text-sm font-semibold">{editId ? "Edit Template" : "New Template"}</h4>
        </div>

        {/* Template metadata */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Template Name</label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="e.g. Order Confirmation" className="text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
              <select
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Auto-trigger</label>
              <select
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                value={editTrigger}
                onChange={(e) => setEditTrigger(e.target.value)}
              >
                {TRIGGER_EVENTS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} className="rounded" />
            <span className="text-xs text-muted-foreground">Active</span>
          </label>
        </div>

        {/* Language tabs */}
        <div className="border-t border-border/40 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              {editTranslations.map((t) => (
                <button
                  key={t.language_code}
                  onClick={() => { setActiveLang(t.language_code); setPreviewMode(false); }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeLang === t.language_code
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground"
                  }`}
                >
                  <span className="uppercase text-[10px] font-bold">{t.language_code}</span>
                  <span>{langLabel(t.language_code)}</span>
                  {editTranslations.length > 1 && (
                    <X
                      className="h-3 w-3 ml-0.5 opacity-60 hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); removeLanguage(t.language_code); }}
                    />
                  )}
                </button>
              ))}
            </div>
            {/* Add language dropdown */}
            <div className="relative">
              <select
                className="h-7 pl-2 pr-6 rounded border border-border bg-background text-xs appearance-none cursor-pointer"
                value=""
                onChange={(e) => { if (e.target.value) addLanguage(e.target.value); }}
              >
                <option value="">+ Language</option>
                {LANGUAGES.filter((l) => !editTranslations.find((t) => t.language_code === l.code)).map((l) => (
                  <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                ))}
              </select>
            </div>
          </div>

          {currentTrans && !previewMode && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Subject ({langLabel(activeLang)})
                </label>
                <Input
                  value={currentTrans.subject}
                  onChange={(e) => updateTranslation(activeLang, "subject", e.target.value)}
                  placeholder="e.g. Order {{order_number}} has been confirmed"
                  className="text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Body ({langLabel(activeLang)})
                  </label>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setPreviewMode(true)}>
                    <Eye className="h-3 w-3" /> Preview
                  </Button>
                </div>
                <RichTextEditor
                  content={currentTrans.body_html}
                  onChange={(html) => updateTranslation(activeLang, "body_html", html)}
                  placeholder="Write your template body..."
                  minHeight="180px"
                />
              </div>
              {/* Variable insertion helper */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Insert Variable</label>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                      onClick={() => {
                        const tag = `{{${v.key}}}`;
                        // Append to subject or body - append to body by default
                        updateTranslation(
                          activeLang,
                          "body_html",
                          currentTrans.body_html + tag
                        );
                      }}
                      title={v.desc}
                    >
                      {`{{${v.key}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Preview mode */}
          {currentTrans && previewMode && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Preview ({langLabel(activeLang)})</span>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setPreviewMode(false)}>
                  <FileText className="h-3 w-3" /> Edit
                </Button>
              </div>
              <div className="rounded-md border border-border/40 bg-white text-black p-4 text-sm">
                <p className="font-semibold mb-2 text-base">{currentTrans.subject || "(No subject)"}</p>
                <div dangerouslySetInnerHTML={{ __html: renderPreview(currentTrans.body_html || "<em>Empty body</em>") }} />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
          <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          <Button size="sm" onClick={saveTemplate} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            {editId ? "Update" : "Create"}
          </Button>
        </div>
      </div>
    );
  }

  // ─── LIST VIEW ───
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Create reusable email templates with multi-language support and auto-trigger events.
        </p>
        <Button size="sm" className="h-7 text-xs gap-1" onClick={startNew}>
          <Plus className="h-3 w-3" /> New Template
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No templates yet</p>
          <p className="text-xs mt-1">Create your first email template to get started.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex items-start justify-between p-3 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer group"
              onClick={() => startEdit(tpl)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{tpl.name}</span>
                  {!tpl.is_active && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Inactive</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5">
                    <Tag className="h-2.5 w-2.5" />
                    {tpl.category}
                  </Badge>
                  {tpl.trigger_event && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5 border-amber-500/30 text-amber-400">
                      <Zap className="h-2.5 w-2.5" />
                      {TRIGGER_EVENTS.find((t) => t.value === tpl.trigger_event)?.label || tpl.trigger_event}
                    </Badge>
                  )}
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Globe className="h-2.5 w-2.5" />
                    {tpl.email_template_translations?.map((t) => t.language_code.toUpperCase()).join(", ") || "No translations"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); duplicateTemplate(tpl); }} title="Duplicate">
                  <Copy className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-300" onClick={(e) => { e.stopPropagation(); deleteTemplate(tpl.id); }} title="Delete">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
