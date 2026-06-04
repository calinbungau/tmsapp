"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, Plus, UserPlus } from "lucide-react";

// EU country codes for VIES validation
const EU_COUNTRY_CODES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES",
  "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
  "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI"
];

export interface CreatedPartner {
  id: string;
  name: string;
  types: string[];
}

interface QuickCreatePartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminId: string;
  suggestedName?: string;
  suggestedVat?: string;
  defaultType?: "shipper" | "carrier" | "forwarder";
  onCreated: (partner: CreatedPartner) => void;
}

export function QuickCreatePartnerDialog({
  open, onOpenChange, adminId, suggestedName = "", suggestedVat, defaultType = "shipper", onCreated,
}: QuickCreatePartnerDialogProps) {
  const [name, setName] = useState(suggestedName);
  const [types, setTypes] = useState<string[]>([defaultType]);
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [address, setAddress] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [bankIban, setBankIban] = useState("");
  const [saving, setSaving] = useState(false);
  const [vatLoading, setVatLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => { setName(suggestedName); }, [suggestedName]);
  useEffect(() => { setTypes([defaultType]); }, [defaultType]);
  
  // Set VAT from props and auto-lookup when dialog opens with VAT
  useEffect(() => { 
    if (suggestedVat) {
      setTaxId(suggestedVat);
    }
  }, [suggestedVat]);
  
  // Auto-trigger VAT lookup when dialog opens with a VAT number
  const hasTriggeredLookup = useRef(false);
  useEffect(() => {
    if (open && suggestedVat && !hasTriggeredLookup.current && !vatLoading) {
      hasTriggeredLookup.current = true;
      setTimeout(() => lookupVAT(), 300);
    }
    if (!open) {
      hasTriggeredLookup.current = false;
    }
  }, [open, suggestedVat, vatLoading]);

  const toggleType = (type: string) => {
    setTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  // Calls the VIES endpoint and applies the returned company data to the
  // form. `allowRomania` lets us use VIES for an RO number as a fallback
  // when ANAF is unavailable. Returns true on success, false otherwise so
  // callers can decide whether to surface their own error.
  const lookupViaVies = async (vatNumber: string, allowRomania = false): Promise<boolean> => {
    const response = await fetch("/api/vies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vatNumber, allowRomania }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      // The non-fallback EU path may get told to use ANAF instead.
      if (result.useAnaf && !allowRomania) {
        await lookupVAT();
        return true;
      }
      return false;
    }

    const data = result.data;
    setName(data.name || name);
    setAddress(data.street || address);
    setCity(data.city || city);
    setCountry(data.country || country);
    setTaxId(data.vatNumber || taxId);

    if (data.limitedData) {
      toast({
        title: "VAT Number Valid",
        description: `${data.vatNumber} is valid. ${data.limitedDataReason || "Enter details manually."}`,
      });
    } else {
      toast({
        title: allowRomania ? "Company data loaded from VIES (ANAF fallback)" : "Company data loaded from VIES",
        description: `VAT: ${data.vatNumber} | Status: Valid & Active`,
      });
    }
    return true;
  };

  // Unified VAT lookup - ANAF for Romania, VIES for other EU countries
  const lookupVAT = async () => {
    const vatNumber = taxId.trim().toUpperCase();
    
    if (!vatNumber) {
      toast({ title: "Error", description: "Please enter a Tax ID / VAT Number first", variant: "destructive" });
      return;
    }

    const isRomanian = /^RO\d{6,10}$/i.test(vatNumber) || /^\d{6,10}$/.test(vatNumber);
    const countryCode = vatNumber.substring(0, 2);
    const isEU = EU_COUNTRY_CODES.includes(countryCode);

    if (!isRomanian && !isEU) {
      toast({ 
        title: "VAT Lookup", 
        description: "VAT lookup is only available for EU companies.\n\nSupported: " + EU_COUNTRY_CODES.slice(0, 10).join(", ") + "...",
        variant: "destructive" 
      });
      return;
    }

    setVatLoading(true);
    
    try {
      if (isRomanian) {
        const response = await fetch("/api/anaf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cui: vatNumber }),
        });

        const result = await response.json().catch(() => ({ success: false }));

        if (!response.ok || !result.success) {
          // ANAF is down or returned nothing — fall back to VIES so the
          // user can still validate and auto-fill an RO company.
          const roVat = /^RO/i.test(vatNumber) ? vatNumber : `RO${vatNumber.replace(/^RO/i, "")}`;
          const viesOk = await lookupViaVies(roVat, true);
          if (!viesOk) {
            toast({
              title: "Lookup failed",
              description: result.error
                ? `ANAF: ${result.error}. VIES fallback also failed.`
                : "ANAF unavailable and VIES fallback also failed. Enter details manually.",
              variant: "destructive",
            });
          }
          return;
        }

        const data = result.data;
        
        setName(data.name || name);
        setRegistrationNumber(data.registrationNumber || registrationNumber);
        setPhone(data.phone || phone);
        setAddress(data.address || address);
        setCity(data.city || city);
        setCountry(data.country || "Romania");
        setBankIban(data.iban || bankIban);
        setTaxId(data.isVatPayer && !/^RO/i.test(taxId) 
          ? `RO${taxId.replace(/^RO/i, "")}` 
          : taxId.toUpperCase());

        const statusMsg = [
          data.isVatPayer ? "VAT Payer" : "Not VAT registered",
          data.isActive ? "Active" : "INACTIVE",
        ].join(" | ");
        
        toast({ 
          title: "Company data loaded from ANAF", 
          description: `Status: ${statusMsg}`,
        });
      } else {
        const viesOk = await lookupViaVies(vatNumber, false);
        if (!viesOk) {
          toast({ title: "VIES Error", description: "Failed to validate VAT number", variant: "destructive" });
        }
      }
    } catch (error) {
      console.error("VAT lookup error:", error);
      toast({ title: "Error", description: "Failed to connect to VAT service", variant: "destructive" });
    } finally {
      setVatLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || types.length === 0) return;
    setSaving(true);
    const s = createClient();
    const { data, error } = await s.from("business_partners").insert({
      admin_id: adminId,
      name: name.trim(),
      types,
      tax_id: taxId || null,
      registration_number: registrationNumber || null,
      email: email || null,
      phone: phone || null,
      address_line1: address || null,
      city: city || null,
      country: country || null,
      bank_iban: bankIban || null,
      is_active: true,
    }).select("id, name, types").single();
    setSaving(false);
    if (error) return;
    if (data) {
      onCreated(data);
      onOpenChange(false);
      setName(""); setTaxId(""); setEmail(""); setPhone(""); setCity(""); setCountry("");
      setAddress(""); setRegistrationNumber(""); setBankIban("");
      setTypes([defaultType]);
    }
  };

  return (
    // IMPORTANT: this dialog MUST use the standard <DialogContent> shell
    // (not raw <div>s inside DialogPortal). DialogContent wraps children
    // in Radix's DialogPrimitive.Content, which is what provides the
    // FocusScope, DismissableLayer, aria-modal, and the focus-scope-stack
    // registration. Earlier this component hand-rolled the layout with
    // plain <div>s and DialogPortal only — that meant there was NO
    // FocusScope at all on the inner dialog. When opened inside a parent
    // Dialog (e.g. trip-leg-assignment-dialog), the parent's FocusScope
    // remained the only active one in the DOM tree, so it kept pulling
    // focus back to its own inputs every time the user clicked on a
    // field here. That's the "I cannot type anything" bug.
    //
    // z-[9999] keeps this above any other dialog stacked underneath.
    // max-w-md + p-0 + flex-col + max-h-[85vh] preserves the original
    // visual layout (scrollable middle, sticky footer).
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[9999] max-w-md p-0 gap-0 flex flex-col max-h-[85vh]">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Quick Create Partner</DialogTitle>
          <DialogDescription>Create a new business partner to use in this order. You can edit full details later in Master Data.</DialogDescription>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Company Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Partner name..." autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Type *</Label>
            <div className="flex flex-wrap gap-2">
              {(["shipper", "carrier", "forwarder"] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    types.includes(type) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {/* Tax ID with VAT Lookup */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tax ID / VAT Number</Label>
            <div className="flex gap-2">
              <Input 
                className="h-8 text-sm flex-1" 
                value={taxId} 
                onChange={e => setTaxId(e.target.value)} 
                onBlur={() => {
                  const vat = taxId.trim().toUpperCase();
                  const countryCode = vat.substring(0, 2);
                  const isEU = EU_COUNTRY_CODES.includes(countryCode) || /^\d{6,10}$/.test(vat);
                  if (isEU && !name && !vatLoading) {
                    lookupVAT();
                  }
                }}
                placeholder="RO12345678 or EU VAT number" 
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={lookupVAT}
                disabled={vatLoading || !taxId.trim()}
                title="Lookup company (ANAF for RO, VIES for EU)"
                className="h-8 px-2.5"
              >
                {vatLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Enter VAT and click search to auto-fill company data</p>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Registration No.</Label>
              <Input className="h-8 text-sm" value={registrationNumber} onChange={e => setRegistrationNumber(e.target.value)} placeholder="J40/123/2020" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input className="h-8 text-sm" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input className="h-8 text-sm" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+40..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">IBAN</Label>
              <Input className="h-8 text-sm" value={bankIban} onChange={e => setBankIban(e.target.value)} placeholder="RO49AAAA..." />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Address</Label>
              <Input className="h-8 text-sm" value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">City</Label>
              <Input className="h-8 text-sm" value={city} onChange={e => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Country</Label>
              <Input className="h-8 text-sm" value={country} onChange={e => setCountry(e.target.value)} placeholder="Romania" />
            </div>
          </div>
        </div>
        </div>
        
        {/* Sticky Footer */}
        <div className="border-t bg-background p-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={saving || !name.trim() || types.length === 0}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Create Partner
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
