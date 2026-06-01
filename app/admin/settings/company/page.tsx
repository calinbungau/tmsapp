"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Hash, FileText, CreditCard, Loader2, Check, ArrowLeft, Globe, Upload, Trash2, ImageIcon, Stamp, PenTool, Landmark, Plus, Star } from "lucide-react";
import { useAdminSession } from "@/hooks/use-admin-session";
import Link from "next/link";

const CURRENCIES = [
  { value: "EUR", label: "EUR - Euro" },
  { value: "RON", label: "RON - Romanian Leu" },
  { value: "USD", label: "USD - US Dollar" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "CHF", label: "CHF - Swiss Franc" },
  { value: "PLN", label: "PLN - Polish Zloty" },
  { value: "HUF", label: "HUF - Hungarian Forint" },
  { value: "CZK", label: "CZK - Czech Koruna" },
  { value: "BGN", label: "BGN - Bulgarian Lev" },
  { value: "SEK", label: "SEK - Swedish Krona" },
  { value: "NOK", label: "NOK - Norwegian Krone" },
  { value: "DKK", label: "DKK - Danish Krone" },
  { value: "TRY", label: "TRY - Turkish Lira" },
];

interface CompanyProfile {
  company_name: string;
  logo_url: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state_province: string;
  country: string;
  postal_code: string;
  vat_number: string;
  registration_number: string;
  phone: string;
  email: string;
  website: string;
  default_currency: string;
  default_payment_terms_days: number;
  order_prefix: string;
  order_include_year: boolean;
  order_next_number: number;
  invoice_prefix: string;
  invoice_next_number: number;
  stamp_url: string;
  signature_url: string;
}

interface BankAccount {
  id?: string;
  bank_name: string;
  iban: string;
  swift: string;
  currency: string;
  account_label: string;
  is_default: boolean;
}

const EMPTY_BANK_ACCOUNT: BankAccount = {
  bank_name: "",
  iban: "",
  swift: "",
  currency: "RON",
  account_label: "",
  is_default: false,
};

const DEFAULT_PROFILE: CompanyProfile = {
  company_name: "",
  logo_url: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state_province: "",
  country: "",
  postal_code: "",
  vat_number: "",
  registration_number: "",
  phone: "",
  email: "",
  website: "",
  default_currency: "EUR",
  default_payment_terms_days: 30,
  order_prefix: "TMS",
  order_include_year: true,
  order_next_number: 1,
  invoice_prefix: "INV",
  invoice_next_number: 1,
  stamp_url: "",
  signature_url: "",
};

export default function CompanyProfilePage() {
  const { session: adminSession } = useAdminSession();
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [logoUploading, setLogoUploading] = useState(false);
  const [stampUploading, setStampUploading] = useState(false);
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [deletedBankIds, setDeletedBankIds] = useState<string[]>([]);

  const fetchProfile = useCallback(async () => {
    if (!adminSession?.id) return;
    const supabase = createClient();

    const { data } = await supabase
      .from("company_profiles")
      .select("*")
      .eq("admin_id", adminSession.id)
      .maybeSingle();

    // Load all bank accounts for this company.
    const { data: banks } = await supabase
      .from("company_bank_accounts")
      .select("id, bank_name, iban, swift, currency, account_label, is_default, sort_order")
      .eq("admin_id", adminSession.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (banks) {
      setBankAccounts(
        banks.map((b: any) => ({
          id: b.id,
          bank_name: b.bank_name || "",
          iban: b.iban || "",
          swift: b.swift || "",
          currency: b.currency || "RON",
          account_label: b.account_label || "",
          is_default: !!b.is_default,
        })),
      );
    }

    if (data) {
      setHasProfile(true);
      setProfile({
        company_name: data.company_name || "",
        logo_url: data.logo_url || "",
          address_line1: data.address_line1 || "",
          address_line2: data.address_line2 || "",
        city: data.city || "",
          state_province: data.state_province || "",
        country: data.country || "",
        postal_code: data.postal_code || "",
        vat_number: data.vat_number || "",
        registration_number: data.registration_number || "",
        phone: data.phone || "",
        email: data.email || "",
        website: data.website || "",
        default_currency: data.default_currency || "EUR",
        default_payment_terms_days: data.default_payment_terms_days ?? 30,
        order_prefix: data.order_prefix || "TMS",
        order_include_year: data.order_include_year ?? true,
        order_next_number: data.order_next_number ?? 1,
        invoice_prefix: data.invoice_prefix || "INV",
        invoice_next_number: data.invoice_next_number ?? 1,
        stamp_url: data.stamp_url || "",
        signature_url: data.signature_url || "",
      });
    } else {
      // Pre-fill company name from admins table
      const { data: admin } = await supabase
        .from("admins")
        .select("company_name, email")
        .eq("id", adminSession.id)
        .single();
      if (admin) {
        setProfile(prev => ({
          ...prev,
          company_name: admin.company_name || "",
          email: admin.email || "",
        }));
      }
    }
    setLoading(false);
  }, [adminSession?.id]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !adminSession?.id) return;
    setLogoUploading(true);
    const supabase = createClient();
    const fileName = `company-logos/${adminSession.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(fileName, file);
    if (uploadError) { setLogoUploading(false); return; }
    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName);
    updateField("logo_url", urlData.publicUrl);
    // Also save immediately so it persists
    if (hasProfile) {
      await supabase.from("company_profiles").update({ logo_url: urlData.publicUrl }).eq("admin_id", adminSession.id);
    }
    setLogoUploading(false);
  };

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "stamp_url" | "signature_url",
    folder: string,
    setUploading: (v: boolean) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file || !adminSession?.id) return;
    setUploading(true);
    const supabase = createClient();
    const fileName = `${folder}/${adminSession.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(fileName, file);
    if (uploadError) { setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName);
    updateField(field, urlData.publicUrl);
    if (hasProfile) {
      await supabase.from("company_profiles").update({ [field]: urlData.publicUrl }).eq("admin_id", adminSession.id);
    }
    setUploading(false);
  };

  const handleImageRemove = async (field: "logo_url" | "stamp_url" | "signature_url") => {
    if (!adminSession?.id || !profile[field]) return;
    const supabase = createClient();
    const pathMatch = profile[field].split("/documents/")[1];
    if (pathMatch) {
      await supabase.storage.from("documents").remove([decodeURIComponent(pathMatch)]);
    }
    updateField(field, "");
    if (hasProfile) {
      await supabase.from("company_profiles").update({ [field]: "" }).eq("admin_id", adminSession.id);
    }
  };

  const handleLogoRemove = async () => {
    if (!adminSession?.id || !profile.logo_url) return;
    const supabase = createClient();
    // Extract path from URL
    const pathMatch = profile.logo_url.split("/documents/")[1];
    if (pathMatch) {
      await supabase.storage.from("documents").remove([decodeURIComponent(pathMatch)]);
    }
    updateField("logo_url", "");
    if (hasProfile) {
      await supabase.from("company_profiles").update({ logo_url: "" }).eq("admin_id", adminSession.id);
    }
  };

  const handleSave = async () => {
    if (!adminSession?.id) return;
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const payload = {
      admin_id: adminSession.id,
      ...profile,
      default_payment_terms_days: Number(profile.default_payment_terms_days) || 30,
      order_next_number: Number(profile.order_next_number) || 1,
      invoice_next_number: Number(profile.invoice_next_number) || 1,
    };

    let error;
    if (hasProfile) {
      const { error: e } = await supabase
        .from("company_profiles")
        .update(payload)
        .eq("admin_id", adminSession.id);
      error = e;
    } else {
      const { error: e } = await supabase
        .from("company_profiles")
        .insert(payload);
      error = e;
      if (!e) setHasProfile(true);
    }

    if (error) {
      setMessage({ type: "error", text: "Failed to save: " + error.message });
    } else {
      // Also update company_name in admins table
      await supabase
        .from("admins")
        .update({ company_name: profile.company_name, updated_at: new Date().toISOString() })
        .eq("id", adminSession.id);

      // Update localStorage
      try {
        const session = JSON.parse(localStorage.getItem("admin_session") || "{}");
        session.company_name = profile.company_name;
        localStorage.setItem("admin_session", JSON.stringify(session));
      } catch {}

      // Persist bank accounts alongside the profile.
      try {
        await saveBankAccounts(supabase);
      } catch (bankErr: any) {
        setMessage({ type: "error", text: "Profile saved, but bank accounts failed: " + bankErr.message });
        setSaving(false);
        return;
      }

      setMessage({ type: "success", text: "Company profile saved successfully" });
    }
    setSaving(false);
  };

  const updateField = (field: keyof CompanyProfile, value: string | boolean | number) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  // --- Bank account management ---
  const addBankAccount = () => {
    setBankAccounts(prev => [
      ...prev,
      { ...EMPTY_BANK_ACCOUNT, currency: prev.length === 0 ? "RON" : profile.default_currency, is_default: prev.length === 0 },
    ]);
  };

  const updateBankAccount = (index: number, field: keyof BankAccount, value: string | boolean) => {
    setBankAccounts(prev =>
      prev.map((acc, i) => {
        if (i !== index) {
          // Only one default per currency: clear other defaults of the same currency.
          if (field === "is_default" && value === true && acc.currency === prev[index].currency) {
            return { ...acc, is_default: false };
          }
          return acc;
        }
        return { ...acc, [field]: value };
      }),
    );
  };

  const removeBankAccount = (index: number) => {
    setBankAccounts(prev => {
      const acc = prev[index];
      if (acc.id) setDeletedBankIds(ids => [...ids, acc.id!]);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Persist bank accounts (called from handleSave after the profile is saved).
  const saveBankAccounts = async (supabase: ReturnType<typeof createClient>) => {
    if (!adminSession?.id) return;
    if (deletedBankIds.length > 0) {
      await supabase.from("company_bank_accounts").delete().in("id", deletedBankIds);
      setDeletedBankIds([]);
    }
    for (let i = 0; i < bankAccounts.length; i++) {
      const acc = bankAccounts[i];
      const row = {
        admin_id: adminSession.id,
        bank_name: acc.bank_name,
        iban: acc.iban,
        swift: acc.swift || null,
        currency: acc.currency,
        account_label: acc.account_label || null,
        is_default: acc.is_default,
        sort_order: i,
        updated_at: new Date().toISOString(),
      };
      if (acc.id) {
        await supabase.from("company_bank_accounts").update(row).eq("id", acc.id);
      } else {
        await supabase.from("company_bank_accounts").insert(row);
      }
    }
  };

  // Preview the order number format
  const year = new Date().getFullYear();
  const paddedNum = String(profile.order_next_number).padStart(4, "0");
  const orderPreview = profile.order_include_year
    ? `${profile.order_prefix}-${year}-${paddedNum}`
    : `${profile.order_prefix}-${paddedNum}`;
  const invPaddedNum = String(profile.invoice_next_number).padStart(4, "0");
  const invoicePreview = profile.order_include_year
    ? `${profile.invoice_prefix}-${year}-${invPaddedNum}`
    : `${profile.invoice_prefix}-${invPaddedNum}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/settings">
          <Button variant="ghost" size="icon" className="h-8 w-8 bg-transparent">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Company Profile</h1>
          <p className="text-muted-foreground text-sm">Company details, document numbering, and defaults</p>
        </div>
      </div>

      {/* Company Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>Company Information</CardTitle>
          </div>
          <CardDescription>Legal entity details used in documents and invoices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Company Logo */}
          <div className="space-y-2">
            <Label>Company Logo</Label>
            <p className="text-xs text-muted-foreground">Used on forwarding orders, invoices, and documents sent to carriers.</p>
            <div className="flex items-center gap-4">
              {profile.logo_url ? (
                <div className="relative group">
                  <img
                    src={profile.logo_url}
                    alt="Company logo"
                    className="w-20 h-20 object-contain rounded-lg border border-border bg-white p-1"
                    crossOrigin="anonymous"
                  />
                  <button
                    onClick={handleLogoRemove}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-6 w-6 mb-1" />
                  <span className="text-[9px]">No logo</span>
                </div>
              )}
              <div>
                <label htmlFor="logo-upload">
                  <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer" asChild disabled={logoUploading}>
                    <span>
                      {logoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {logoUploading ? "Uploading..." : "Upload Logo"}
                    </span>
                  </Button>
                </label>
                <input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG, SVG. Max 2MB recommended.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input id="company_name" value={profile.company_name} onChange={e => updateField("company_name", e.target.value)} placeholder="Your Company SRL" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vat_number">VAT Number</Label>
              <Input id="vat_number" value={profile.vat_number} onChange={e => updateField("vat_number", e.target.value)} placeholder="RO12345678" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="registration_number">Registration Number</Label>
              <Input id="registration_number" value={profile.registration_number} onChange={e => updateField("registration_number", e.target.value)} placeholder="J40/1234/2020" />
            </div>
          </div>

          <div className="space-y-2">
              <Label htmlFor="address_line1">Address</Label>
              <Textarea id="address_line1" value={profile.address_line1} onChange={e => updateField("address_line1", e.target.value)} placeholder="Street address" rows={2} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={profile.city} onChange={e => updateField("city", e.target.value)} placeholder="Bucharest" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state_province">State / County</Label>
              <Input id="state_province" value={profile.state_province} onChange={e => updateField("state_province", e.target.value)} placeholder="Sector 1" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" value={profile.country} onChange={e => updateField("country", e.target.value)} placeholder="Romania" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal_code">Postal Code</Label>
              <Input id="postal_code" value={profile.postal_code} onChange={e => updateField("postal_code", e.target.value)} placeholder="010101" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle>Contact</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={profile.phone} onChange={e => updateField("phone", e.target.value)} placeholder="+40 7xx xxx xxx" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={profile.email} onChange={e => updateField("email", e.target.value)} placeholder="office@company.ro" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" value={profile.website} onChange={e => updateField("website", e.target.value)} placeholder="https://company.ro" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company Stamp & Signature */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Stamp className="h-5 w-5 text-primary" />
            <CardTitle>Company Stamp & Signature</CardTitle>
          </div>
          <CardDescription>Upload your company stamp and authorized signature for electronic document signing. These will be overlaid on documents when using Sign & Send.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Stamp */}
            <div className="space-y-3">
              <Label className="flex items-center gap-1.5">
                <Stamp className="h-3.5 w-3.5" />
                Company Stamp
              </Label>
              <p className="text-xs text-muted-foreground">PNG with transparent background recommended. Will be placed on the bottom-right of documents.</p>
              <div className="flex items-center gap-4">
                {profile.stamp_url ? (
                  <div className="relative group">
                    <img
                      src={profile.stamp_url}
                      alt="Company stamp"
                      className="w-24 h-24 object-contain rounded-lg border border-border bg-white p-1"
                      crossOrigin="anonymous"
                    />
                    <button
                      onClick={() => handleImageRemove("stamp_url")}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground">
                    <Stamp className="h-6 w-6 mb-1 opacity-40" />
                    <span className="text-[9px]">No stamp</span>
                  </div>
                )}
                <div>
                  <label htmlFor="stamp-upload">
                    <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer" asChild disabled={stampUploading}>
                      <span>
                        {stampUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {stampUploading ? "Uploading..." : "Upload Stamp"}
                      </span>
                    </Button>
                  </label>
                  <input id="stamp-upload" type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, "stamp_url", "company-stamps", setStampUploading)} />
                  <p className="text-[10px] text-muted-foreground mt-1">PNG with transparency. Max 1MB.</p>
                </div>
              </div>
            </div>

            {/* Signature */}
            <div className="space-y-3">
              <Label className="flex items-center gap-1.5">
                <PenTool className="h-3.5 w-3.5" />
                Authorized Signature
              </Label>
              <p className="text-xs text-muted-foreground">PNG with transparent background recommended. Will be placed near the stamp area on signed documents.</p>
              <div className="flex items-center gap-4">
                {profile.signature_url ? (
                  <div className="relative group">
                    <img
                      src={profile.signature_url}
                      alt="Authorized signature"
                      className="w-24 h-24 object-contain rounded-lg border border-border bg-white p-1"
                      crossOrigin="anonymous"
                    />
                    <button
                      onClick={() => handleImageRemove("signature_url")}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground">
                    <PenTool className="h-6 w-6 mb-1 opacity-40" />
                    <span className="text-[9px]">No signature</span>
                  </div>
                )}
                <div>
                  <label htmlFor="signature-upload">
                    <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer" asChild disabled={signatureUploading}>
                      <span>
                        {signatureUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {signatureUploading ? "Uploading..." : "Upload Signature"}
                      </span>
                    </Button>
                  </label>
                  <input id="signature-upload" type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, "signature_url", "company-signatures", setSignatureUploading)} />
                  <p className="text-[10px] text-muted-foreground mt-1">PNG with transparency. Max 1MB.</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order Numbering */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Hash className="h-5 w-5 text-primary" />
            <CardTitle>Order Numbering</CardTitle>
          </div>
          <CardDescription>Configure how transport order numbers are generated</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="order_prefix">Prefix</Label>
              <Input id="order_prefix" value={profile.order_prefix} onChange={e => updateField("order_prefix", e.target.value.toUpperCase())} placeholder="TMS" maxLength={10} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order_next_number">Next Number</Label>
              <Input id="order_next_number" type="number" min={1} value={profile.order_next_number} onChange={e => updateField("order_next_number", parseInt(e.target.value) || 1)} />
            </div>
            <div className="flex items-center gap-3 pb-0.5">
              <Switch id="order_include_year" checked={profile.order_include_year} onCheckedChange={v => updateField("order_include_year", v)} />
              <Label htmlFor="order_include_year" className="text-sm cursor-pointer">Include year</Label>
            </div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Preview</p>
            <p className="text-sm font-mono font-medium">{orderPreview}</p>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Numbering */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>Invoice Numbering</CardTitle>
          </div>
          <CardDescription>Configure how invoice numbers are generated</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice_prefix">Prefix</Label>
              <Input id="invoice_prefix" value={profile.invoice_prefix} onChange={e => updateField("invoice_prefix", e.target.value.toUpperCase())} placeholder="INV" maxLength={10} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice_next_number">Next Number</Label>
              <Input id="invoice_next_number" type="number" min={1} value={profile.invoice_next_number} onChange={e => updateField("invoice_next_number", parseInt(e.target.value) || 1)} />
            </div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Preview</p>
            <p className="text-sm font-mono font-medium">{invoicePreview}</p>
          </div>
        </CardContent>
      </Card>

      {/* Bank Accounts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" />
              <CardTitle>Bank Accounts</CardTitle>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={addBankAccount}>
              <Plus className="h-3.5 w-3.5" />
              Add Account
            </Button>
          </div>
          <CardDescription>
            Add an IBAN per currency (e.g. RON and EUR). The account matching an invoice&apos;s currency is shown on its PDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bankAccounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No bank accounts yet. Add one to display IBAN details on invoices.
            </div>
          ) : (
            bankAccounts.map((acc, index) => (
              <div key={acc.id ?? `new-${index}`} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{acc.account_label || acc.bank_name || `Account ${index + 1}`}</span>
                    {acc.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <Star className="h-3 w-3" />
                        Default {acc.currency}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => removeBankAccount(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Bank Name</Label>
                    <Input
                      value={acc.bank_name}
                      onChange={e => updateBankAccount(index, "bank_name", e.target.value)}
                      placeholder="e.g. Banca Transilvania"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Label</Label>
                    <Input
                      value={acc.account_label}
                      onChange={e => updateBankAccount(index, "account_label", e.target.value)}
                      placeholder="optional, e.g. Main RON"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>IBAN</Label>
                    <Input
                      value={acc.iban}
                      onChange={e => updateBankAccount(index, "iban", e.target.value.toUpperCase())}
                      placeholder="RO00 XXXX 0000 0000 0000 0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SWIFT / BIC</Label>
                    <Input
                      value={acc.swift}
                      onChange={e => updateBankAccount(index, "swift", e.target.value.toUpperCase())}
                      placeholder="optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={acc.currency} onValueChange={v => updateBankAccount(index, "currency", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={acc.is_default}
                    onCheckedChange={v => updateBankAccount(index, "is_default", v)}
                  />
                  <Label className="text-sm font-normal">Default account for {acc.currency} invoices</Label>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Defaults */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle>Defaults</CardTitle>
          </div>
          <CardDescription>Default values used when creating new orders and invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default Currency</Label>
              <Select value={profile.default_currency} onValueChange={v => updateField("default_currency", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_terms">Default Payment Terms (days)</Label>
              <Input id="payment_terms" type="number" min={0} value={profile.default_payment_terms_days} onChange={e => updateField("default_payment_terms_days", parseInt(e.target.value) || 0)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === "success" ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
        }`}>
          {message.type === "success" && <Check className="h-4 w-4 inline mr-2" />}
          {message.text}
        </div>
      )}

      <div className="flex justify-end gap-3 pb-8">
        <Link href="/admin/settings">
          <Button variant="outline" className="bg-transparent">Cancel</Button>
        </Link>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Company Profile"}
        </Button>
      </div>
    </div>
  );
}
