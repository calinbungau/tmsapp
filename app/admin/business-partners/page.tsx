"use client";

import React from "react";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CarrierPortalInvite } from "@/components/exchange/carrier-portal-invite";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Building2,
  Loader2,
  CheckCircle,
  XCircle,
  Phone,
  Mail,
  MapPin,
  Truck,
  Package,
  ArrowRightLeft,
  Wrench,
  Users,
  Globe,
  CreditCard,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  UserPlus,
  Star,
} from "lucide-react";
import { useAdminSession } from "@/hooks/use-admin-session";
import Link from "next/link";

type PartnerType = "shipper" | "carrier" | "forwarder" | "vendor";

interface BusinessPartner {
  id: string;
  name: string;
  types: PartnerType[];
  tax_id: string | null;
  registration_number: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state_province: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  payment_terms: string | null;
  credit_limit: number | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_iban: string | null;
  bank_swift: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_notes: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

interface BusinessPartnerContact {
  id: string;
  business_partner_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  position: string | null;
  department: string | null;
  language: string | null;
  notes: string | null;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
}

const PARTNER_TYPES: { value: PartnerType; label: string; icon: React.ElementType; color: string }[] = [
  { value: "shipper", label: "Shipper", icon: Package, color: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  { value: "carrier", label: "Carrier", icon: Truck, color: "bg-green-500/10 text-green-600 border-green-500/30" },
  { value: "forwarder", label: "Forwarder", icon: ArrowRightLeft, color: "bg-purple-500/10 text-purple-600 border-purple-500/30" },
  { value: "vendor", label: "Vendor", icon: Wrench, color: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
];

const PAYMENT_TERMS = [
  { value: "immediate", label: "Immediate" },
  { value: "net_7", label: "Net 7 days" },
  { value: "net_14", label: "Net 14 days" },
  { value: "net_30", label: "Net 30 days" },
  { value: "net_45", label: "Net 45 days" },
  { value: "net_60", label: "Net 60 days" },
  { value: "net_90", label: "Net 90 days" },
];

export default function BusinessPartnersPage() {
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const searchParams = useSearchParams();
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<PartnerType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<BusinessPartner | null>(null);
  const [activeTab, setActiveTab] = useState("general");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
  
  const [anafLoading, setAnafLoading] = useState(false);

  // Contacts state
  const [contacts, setContacts] = useState<BusinessPartnerContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<BusinessPartnerContact | null>(null);
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    phone: "",
    mobile: "",
    whatsapp: "",
    position: "",
    department: "",
    language: "",
    notes: "",
    is_primary: false,
    is_active: true,
  });

  const [formData, setFormData] = useState({
    name: "",
    types: [] as PartnerType[],
    tax_id: "",
    registration_number: "",
    contact_person: "",
    email: "",
    phone: "",
    website: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state_province: "",
    postal_code: "",
    country: "",
    billing_address_line1: "",
    billing_address_line2: "",
    billing_city: "",
    billing_state_province: "",
    billing_postal_code: "",
    billing_country: "",
    payment_terms: "",
    credit_limit: "",
    bank_name: "",
    bank_account_number: "",
    bank_iban: "",
    bank_swift: "",
    contract_start_date: "",
    contract_end_date: "",
    contract_notes: "",
    is_active: true,
    notes: "",
    same_billing_address: true,
  });

useEffect(() => {
  if (adminSession?.id) {
  fetchPartners();
  }
  }, [adminSession?.id]);
  
  // Handle opening partner from URL query param (from quick search)
  useEffect(() => {
    const selectedId = searchParams.get("selected");
    if (selectedId && partners.length > 0 && !loading) {
      const partner = partners.find(p => p.id === selectedId);
      if (partner) {
        handleOpenDialog(partner);
        // Clear the URL param after opening
        window.history.replaceState({}, "", "/admin/business-partners");
      }
    }
  }, [searchParams, partners, loading]);
  
  const fetchPartners = async () => {
    if (!adminSession?.id) return;
    
    setLoading(true);
    const supabase = createClient();
    
    const { data } = await supabase
      .from("business_partners")
      .select("*")
      .eq("admin_id", adminSession.id)
      .order("name");

    if (data) {
      setPartners(data);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      types: [],
      tax_id: "",
      registration_number: "",
      contact_person: "",
      email: "",
      phone: "",
      website: "",
      address_line1: "",
      address_line2: "",
      city: "",
      state_province: "",
      postal_code: "",
      country: "",
      billing_address_line1: "",
      billing_address_line2: "",
      billing_city: "",
      billing_state_province: "",
      billing_postal_code: "",
      billing_country: "",
      payment_terms: "",
      credit_limit: "",
      bank_name: "",
      bank_account_number: "",
      bank_iban: "",
      bank_swift: "",
      contract_start_date: "",
      contract_end_date: "",
      contract_notes: "",
      is_active: true,
      notes: "",
      same_billing_address: true,
    });
    setEditingPartner(null);
    setActiveTab("general");
    setContacts([]);
    resetContactForm();
  };

  const handleOpenDialog = (partner?: BusinessPartner) => {
    if (partner) {
      setEditingPartner(partner);
      setFormData({
        name: partner.name,
        types: partner.types || [],
        tax_id: partner.tax_id || "",
        registration_number: partner.registration_number || "",
        contact_person: partner.contact_person || "",
        email: partner.email || "",
        phone: partner.phone || "",
        website: partner.website || "",
        address_line1: partner.address_line1 || "",
        address_line2: partner.address_line2 || "",
        city: partner.city || "",
        state_province: partner.state_province || "",
        postal_code: partner.postal_code || "",
        country: partner.country || "",
        billing_address_line1: partner.billing_address_line1 || "",
        billing_address_line2: partner.billing_address_line2 || "",
        billing_city: partner.billing_city || "",
        billing_state_province: partner.billing_state_province || "",
        billing_postal_code: partner.billing_postal_code || "",
        billing_country: partner.billing_country || "",
        payment_terms: partner.payment_terms || "",
        credit_limit: partner.credit_limit?.toString() || "",
        bank_name: partner.bank_name || "",
        bank_account_number: partner.bank_account_number || "",
        bank_iban: partner.bank_iban || "",
        bank_swift: partner.bank_swift || "",
        contract_start_date: partner.contract_start_date || "",
        contract_end_date: partner.contract_end_date || "",
        contract_notes: partner.contract_notes || "",
        is_active: partner.is_active,
        notes: partner.notes || "",
        same_billing_address: !partner.billing_address_line1,
      });
      // Fetch contacts for this partner
      fetchContacts(partner.id);
    } else {
      resetForm();
      setContacts([]);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert("Partner name is required");
      return;
    }
    if (formData.types.length === 0) {
      alert("Please select at least one partner type");
      return;
    }

    const supabase = createClient();
    
    const partnerData = {
      name: formData.name.trim(),
      types: formData.types,
      tax_id: formData.tax_id || null,
      registration_number: formData.registration_number || null,
      contact_person: formData.contact_person || null,
      email: formData.email || null,
      phone: formData.phone || null,
      website: formData.website || null,
      address_line1: formData.address_line1 || null,
      address_line2: formData.address_line2 || null,
      city: formData.city || null,
      state_province: formData.state_province || null,
      postal_code: formData.postal_code || null,
      country: formData.country || null,
      billing_address_line1: formData.same_billing_address ? null : formData.billing_address_line1 || null,
      billing_address_line2: formData.same_billing_address ? null : formData.billing_address_line2 || null,
      billing_city: formData.same_billing_address ? null : formData.billing_city || null,
      billing_state_province: formData.same_billing_address ? null : formData.billing_state_province || null,
      billing_postal_code: formData.same_billing_address ? null : formData.billing_postal_code || null,
      billing_country: formData.same_billing_address ? null : formData.billing_country || null,
      payment_terms: formData.payment_terms || null,
      credit_limit: formData.credit_limit ? parseFloat(formData.credit_limit) : null,
      bank_name: formData.bank_name || null,
      bank_account_number: formData.bank_account_number || null,
      bank_iban: formData.bank_iban || null,
      bank_swift: formData.bank_swift || null,
      contract_start_date: formData.contract_start_date || null,
      contract_end_date: formData.contract_end_date || null,
      contract_notes: formData.contract_notes || null,
      is_active: formData.is_active,
      notes: formData.notes || null,
    };

    if (editingPartner) {
      const { error } = await supabase
        .from("business_partners")
        .update(partnerData)
        .eq("id", editingPartner.id);

      if (error) {
        alert("Failed to update partner: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from("business_partners")
        .insert({ ...partnerData, admin_id: adminSession?.id });

      if (error) {
        alert("Failed to create partner: " + error.message);
        return;
      }
    }

    setDialogOpen(false);
    resetForm();
    fetchPartners();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this business partner?")) return;

    const supabase = createClient();
    const { error } = await supabase.from("business_partners").delete().eq("id", id);

    if (error) {
      alert("Failed to delete partner: " + error.message);
      return;
    }

    fetchPartners();
  };

  const toggleActive = async (partner: BusinessPartner) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("business_partners")
      .update({ is_active: !partner.is_active })
      .eq("id", partner.id);

    if (!error) {
      fetchPartners();
    }
  };

  const toggleType = (type: PartnerType) => {
    setFormData((prev) => ({
      ...prev,
      types: prev.types.includes(type)
        ? prev.types.filter((t) => t !== type)
        : [...prev.types, type],
    }));
  };

  // Fetch contacts for the currently editing partner
  const fetchContacts = async (partnerId: string) => {
    if (!adminSession?.id) return;
    setContactsLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("business_partner_contacts")
      .select("*")
      .eq("business_partner_id", partnerId)
      .eq("admin_id", adminSession.id)
      .order("is_primary", { ascending: false })
      .order("name");
    if (data) setContacts(data);
    setContactsLoading(false);
  };

  const resetContactForm = () => {
    setContactForm({
      name: "",
      email: "",
      phone: "",
      mobile: "",
      whatsapp: "",
      position: "",
      department: "",
      language: "",
      notes: "",
      is_primary: false,
      is_active: true,
    });
    setEditingContact(null);
    setContactFormOpen(false);
  };

  const handleOpenContactForm = (contact?: BusinessPartnerContact) => {
    if (contact) {
      setEditingContact(contact);
      setContactForm({
        name: contact.name || "",
        email: contact.email || "",
        phone: contact.phone || "",
        mobile: contact.mobile || "",
        whatsapp: contact.whatsapp || "",
        position: contact.position || "",
        department: contact.department || "",
        language: contact.language || "",
        notes: contact.notes || "",
        is_primary: contact.is_primary,
        is_active: contact.is_active,
      });
    } else {
      resetContactForm();
    }
    setContactFormOpen(true);
  };

  const handleSaveContact = async () => {
    if (!editingPartner?.id || !adminSession?.id) return;
    if (!contactForm.name.trim() && !contactForm.email.trim()) {
      alert("Please enter a name or email for the contact");
      return;
    }

    const supabase = createClient();
    const contactData = {
      name: contactForm.name.trim() || null,
      email: contactForm.email.trim() || null,
      phone: contactForm.phone.trim() || null,
      mobile: contactForm.mobile.trim() || null,
      whatsapp: contactForm.whatsapp.trim() || null,
      position: contactForm.position.trim() || null,
      department: contactForm.department.trim() || null,
      language: contactForm.language.trim() || null,
      notes: contactForm.notes.trim() || null,
      is_primary: contactForm.is_primary,
      is_active: contactForm.is_active,
    };

    // If setting as primary, unset other primaries first
    if (contactForm.is_primary) {
      await supabase
        .from("business_partner_contacts")
        .update({ is_primary: false })
        .eq("business_partner_id", editingPartner.id)
        .eq("admin_id", adminSession.id);
    }

    if (editingContact) {
      const { error } = await supabase
        .from("business_partner_contacts")
        .update(contactData)
        .eq("id", editingContact.id);
      if (error) {
        alert("Failed to update contact: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from("business_partner_contacts")
        .insert({
          ...contactData,
          business_partner_id: editingPartner.id,
          admin_id: adminSession.id,
        });
      if (error) {
        alert("Failed to create contact: " + error.message);
        return;
      }
    }

    resetContactForm();
    fetchContacts(editingPartner.id);
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm("Are you sure you want to delete this contact?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("business_partner_contacts")
      .delete()
      .eq("id", contactId);
    if (error) {
      alert("Failed to delete contact: " + error.message);
      return;
    }
    if (editingPartner?.id) fetchContacts(editingPartner.id);
  };

  const handleSetPrimaryContact = async (contactId: string) => {
    if (!editingPartner?.id || !adminSession?.id) return;
    const supabase = createClient();
    // Unset all primaries
    await supabase
      .from("business_partner_contacts")
      .update({ is_primary: false })
      .eq("business_partner_id", editingPartner.id)
      .eq("admin_id", adminSession.id);
    // Set the new primary
    await supabase
      .from("business_partner_contacts")
      .update({ is_primary: true })
      .eq("id", contactId);
    fetchContacts(editingPartner.id);
  };

  // EU country codes for VIES
  const EU_COUNTRY_CODES = [
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", 
    "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", 
    "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI"
  ];

  // Unified VAT lookup - ANAF for Romania, VIES for other EU countries
  const lookupVAT = async () => {
    const taxId = formData.tax_id.trim().toUpperCase();
    
    if (!taxId) {
      alert("Please enter a Tax ID / VAT Number first");
      return;
    }

    // Check if Romanian (use ANAF for more detailed data)
    const isRomanian = /^RO\d{6,10}$/i.test(taxId) || /^\d{6,10}$/.test(taxId);
    
    // Check if EU VAT number
    const countryCode = taxId.substring(0, 2);
    const isEU = EU_COUNTRY_CODES.includes(countryCode);

    if (!isRomanian && !isEU) {
      alert("VAT lookup is only available for EU companies.\n\nSupported countries: " + EU_COUNTRY_CODES.join(", "));
      return;
    }

    setAnafLoading(true);
    
    try {
      if (isRomanian) {
        // Use ANAF for Romanian companies (more detailed data)
        const response = await fetch("/api/anaf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cui: taxId }),
        });

        const result = await response.json().catch(() => ({ success: false }));

        if (!response.ok || !result.success) {
          // ANAF is down or returned nothing — fall back to VIES so the user
          // can still validate and auto-fill an RO company (less detail, but
          // better than failing). allowRomania bypasses VIES's "use ANAF" hint.
          const roVat = /^RO/i.test(taxId) ? taxId : `RO${taxId.replace(/^RO/i, "")}`;
          const viesResponse = await fetch("/api/vies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vatNumber: roVat, allowRomania: true }),
          });
          const viesResult = await viesResponse.json().catch(() => ({ success: false }));

          if (viesResponse.ok && viesResult.success) {
            const v = viesResult.data;
            setFormData((prev) => ({
              ...prev,
              name: v.name || prev.name,
              address_line1: v.street || prev.address_line1,
              city: v.city || prev.city,
              postal_code: v.postalCode || prev.postal_code,
              country: v.country || "Romania",
              tax_id: v.vatNumber || prev.tax_id,
            }));
            alert("Company data loaded from VIES (ANAF fallback).\n\nStatus: Valid & Active");
          } else {
            alert(
              result.error
                ? `ANAF: ${result.error}\n\nVIES fallback also failed. Please enter details manually.`
                : "ANAF unavailable and VIES fallback also failed. Please enter details manually."
            );
          }
          return;
        }

        const data = result.data;
        
        setFormData((prev) => ({
          ...prev,
          name: data.name || prev.name,
          registration_number: data.registrationNumber || prev.registration_number,
          phone: data.phone || prev.phone,
          address_line1: data.address || prev.address_line1,
          city: data.city || prev.city,
          state_province: data.county || prev.state_province,
          postal_code: data.postalCode || prev.postal_code,
          country: data.country || "Romania",
          bank_iban: data.iban || prev.bank_iban,
          is_active: data.isActive,
          tax_id: data.isVatPayer && !/^RO/i.test(prev.tax_id) 
            ? `RO${prev.tax_id.replace(/^RO/i, "")}` 
            : prev.tax_id.toUpperCase(),
        }));

        const statusMsg = [
          data.isVatPayer ? "VAT Payer" : "Not VAT registered",
          data.isActive ? "Active" : "INACTIVE - Warning!",
        ].join(" | ");
        
        alert(`Company data loaded from ANAF!\n\nStatus: ${statusMsg}`);
      } else {
        // Use VIES for other EU countries
        const response = await fetch("/api/vies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vatNumber: taxId }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          if (result.useAnaf) {
            // Redirect to ANAF for Romanian companies
            setAnafLoading(false);
            return lookupVAT();
          }
          alert(result.error || "Failed to validate VAT number in VIES");
          return;
        }

        const data = result.data;
        
        // Only update fields if we have data (some countries hide details for privacy)
        setFormData((prev) => ({
          ...prev,
          name: data.name || prev.name,
          address_line1: data.street || prev.address_line1,
          city: data.city || prev.city,
          postal_code: data.postalCode || prev.postal_code,
          country: data.country || prev.country,
          tax_id: data.vatNumber || prev.tax_id,
        }));

        // Show appropriate message based on whether we got company details
        if (data.limitedData) {
          alert(`VAT Number VALID in VIES!\n\nVAT: ${data.vatNumber}\nCountry: ${data.country}\n\nNote: ${data.limitedDataReason}\n\nPlease enter company details manually.`);
        } else {
          alert(`Company data loaded from VIES (EU VAT System)!\n\nVAT Number: ${data.vatNumber}\nCompany: ${data.name || "N/A"}\nStatus: Valid & Active`);
        }
      }
    } catch (error) {
      console.error("VAT lookup error:", error);
      alert("Failed to connect to VAT validation service");
    } finally {
      setAnafLoading(false);
    }
  };

  // Filter partners
  const filteredPartners = partners.filter((partner) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = partner.name.toLowerCase().includes(query);
      const matchesContact = partner.contact_person?.toLowerCase().includes(query);
      const matchesEmail = partner.email?.toLowerCase().includes(query);
      const matchesCity = partner.city?.toLowerCase().includes(query);
      if (!matchesName && !matchesContact && !matchesEmail && !matchesCity) return false;
    }
    
    // Type filter
    if (filterType !== "all" && !partner.types.includes(filterType)) return false;
    
    // Status filter
    if (filterStatus === "active" && !partner.is_active) return false;
    if (filterStatus === "inactive" && partner.is_active) return false;
    
    return true;
  });
  
  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, filterStatus]);
  
  // Pagination calculations
  const totalCount = filteredPartners.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const paginatedPartners = filteredPartners.slice(startIndex, endIndex);

  // Stats
  const stats = {
    total: partners.length,
    active: partners.filter((p) => p.is_active).length,
    shippers: partners.filter((p) => p.types.includes("shipper")).length,
    carriers: partners.filter((p) => p.types.includes("carrier")).length,
    forwarders: partners.filter((p) => p.types.includes("forwarder")).length,
    vendors: partners.filter((p) => p.types.includes("vendor")).length,
  };

  if (sessionLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/drivers">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Business Partners</h1>
            <p className="text-muted-foreground">
              Manage your shippers, carriers, forwarders, and vendors
            </p>
          </div>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Partner
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.shippers}</p>
                <p className="text-xs text-muted-foreground">Shippers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Truck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.carriers}</p>
                <p className="text-xs text-muted-foreground">Carriers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <ArrowRightLeft className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.forwarders}</p>
                <p className="text-xs text-muted-foreground">Forwarders</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Wrench className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.vendors}</p>
                <p className="text-xs text-muted-foreground">Vendors</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search partners..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={filterType === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("all")}
              >
                All Types
              </Button>
              {PARTNER_TYPES.map((type) => (
                <Button
                  key={type.value}
                  variant={filterType === type.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterType(type.value)}
                >
                  <type.icon className="h-4 w-4 mr-1" />
                  {type.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant={filterStatus === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("all")}
              >
                All
              </Button>
              <Button
                variant={filterStatus === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("active")}
              >
                Active
              </Button>
              <Button
                variant={filterStatus === "inactive" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("inactive")}
              >
                Inactive
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Partners Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Types</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPartners.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {partners.length === 0 ? "No business partners yet. Add your first partner!" : "No partners match your filters."}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPartners.map((partner) => (
                  <TableRow key={partner.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleOpenDialog(partner)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{partner.name}</div>
                          {partner.tax_id && (
                            <div className="text-sm text-muted-foreground">
                              Tax ID: {partner.tax_id}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {partner.types.map((type) => {
                          const typeConfig = PARTNER_TYPES.find((t) => t.value === type);
                          return (
                            <Badge
                              key={type}
                              variant="outline"
                              className={`text-xs ${typeConfig?.color}`}
                            >
                              {typeConfig?.label || type}
                            </Badge>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="space-y-1">
                        {partner.contact_person && (
                          <div className="flex items-center gap-1 text-sm">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            {partner.contact_person}
                          </div>
                        )}
                        {partner.email && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {partner.email}
                          </div>
                        )}
                        {partner.phone && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {partner.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {partner.city || partner.country ? (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {[partner.city, partner.country].filter(Boolean).join(", ")}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={partner.is_active ? "default" : "secondary"}>
                        {partner.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenDialog(partner)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive(partner)}>
                            {partner.is_active ? (
                              <>
                                <XCircle className="h-4 w-4 mr-2" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDelete(partner.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          
          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              {totalCount > 0 ? `${startIndex + 1}-${endIndex} of ${totalCount} partners` : "No partners"}
            </p>
            <div className="flex items-center gap-4">
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) => p === "..." ? (
                      <span key={`dots-${i}`} className="text-sm text-muted-foreground px-1">...</span>
                    ) : (
                      <Button key={p} variant={currentPage === p ? "default" : "ghost"} size="icon" className={`h-8 w-8 text-sm ${currentPage === p ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setCurrentPage(p)}>
                        {p}
                      </Button>
                    ))}
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>{size} / page</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPartner ? "Edit Partner" : "Add Business Partner"}</DialogTitle>
            <DialogDescription>
              {editingPartner ? "Update partner information" : "Add a new shipper, carrier, forwarder, or vendor"}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList
              className={`grid w-full ${
                editingPartner && formData.types.includes("carrier")
                  ? "grid-cols-6"
                  : "grid-cols-5"
              }`}
            >
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="contacts" disabled={!editingPartner}>
                Contacts {contacts.length > 0 && `(${contacts.length})`}
              </TabsTrigger>
              <TabsTrigger value="address">Address</TabsTrigger>
              <TabsTrigger value="financial">Financial</TabsTrigger>
              <TabsTrigger value="contract">Contract</TabsTrigger>
              {editingPartner && formData.types.includes("carrier") && (
                <TabsTrigger value="portal">Portal</TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Company Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Enter company name"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Partner Types *</Label>
                <div className="grid grid-cols-2 gap-3">
                  {PARTNER_TYPES.map((type) => (
                    <div
                      key={type.value}
                      className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        formData.types.includes(type.value)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => toggleType(type.value)}
                    >
                      <Checkbox
                        checked={formData.types.includes(type.value)}
                        onCheckedChange={() => toggleType(type.value)}
                      />
                      <type.icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{type.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {type.value === "shipper" && "Customer who pays you"}
                          {type.value === "carrier" && "Transport company you hire"}
                          {type.value === "forwarder" && "Freight intermediary"}
                          {type.value === "vendor" && "Service provider"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tax_id">Tax ID / VAT Number</Label>
                  <div className="flex gap-2">
                    <Input
                      id="tax_id"
                      value={formData.tax_id}
                      onChange={(e) => setFormData((p) => ({ ...p, tax_id: e.target.value.toUpperCase() }))}
                      onBlur={() => {
                        // Auto-prompt VAT lookup for EU VAT numbers
                        const taxId = formData.tax_id.trim().toUpperCase();
                        const countryCode = taxId.substring(0, 2);
                        const isEU = EU_COUNTRY_CODES.includes(countryCode) || /^\d{6,10}$/.test(taxId);
                        if (isEU && !formData.name && !anafLoading) {
                          // Auto-lookup if name is empty (likely new entry)
                          lookupVAT();
                        }
                      }}
                      placeholder="e.g. RO12345678"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={lookupVAT}
                      disabled={anafLoading || !formData.tax_id.trim()}
                      title="Lookup company data (ANAF for Romania, VIES for other EU countries)"
                    >
                      {anafLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Globe className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click the globe icon to auto-fill data (ANAF for RO, VIES for EU)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration_number">Registration Number</Label>
                  <Input
                    id="registration_number"
                    value={formData.registration_number}
                    onChange={(e) => setFormData((p) => ({ ...p, registration_number: e.target.value }))}
                    placeholder="Company registration"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="contact_person">Contact Person</Label>
                <Input
                  id="contact_person"
                  value={formData.contact_person}
                  onChange={(e) => setFormData((p) => ({ ...p, contact_person: e.target.value }))}
                  placeholder="Primary contact name"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                    placeholder="contact@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="+1234567890"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={formData.website}
                  onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))}
                  placeholder="https://www.company.com"
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData((p) => ({ ...p, is_active: !!checked }))}
                />
                <Label htmlFor="is_active" className="font-normal cursor-pointer">
                  Partner is active
                </Label>
              </div>
            </TabsContent>
            
            <TabsContent value="contacts" className="space-y-4 mt-4">
              {!editingPartner ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Save the partner first to add contacts
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Manage contact persons for this business partner. These contacts will appear as suggestions when sending emails.
                    </p>
                    <Button size="sm" onClick={() => handleOpenContactForm()}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Contact
                    </Button>
                  </div>

                  {contactsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : contacts.length === 0 ? (
                    <div className="text-center py-8 border rounded-lg bg-muted/20">
                      <Users className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No contacts yet</p>
                      <p className="text-xs text-muted-foreground">Click &quot;Add Contact&quot; to add people you communicate with at this company</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            contact.is_primary ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                              {contact.name?.[0]?.toUpperCase() || contact.email?.[0]?.toUpperCase() || "?"}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">
                                  {contact.name || contact.email || "Unnamed"}
                                </p>
                                {contact.is_primary && (
                                  <Badge variant="outline" className="text-xs border-primary text-primary">
                                    <Star className="h-3 w-3 mr-1 fill-current" />
                                    Primary
                                  </Badge>
                                )}
                                {!contact.is_active && (
                                  <Badge variant="secondary" className="text-xs">Inactive</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                {contact.position && <span>{contact.position}</span>}
                                {contact.email && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {contact.email}
                                  </span>
                                )}
                                {contact.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {contact.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {!contact.is_primary && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleSetPrimaryContact(contact.id)}
                                title="Set as primary contact"
                              >
                                <Star className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleOpenContactForm(contact)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteContact(contact.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Contact Form Dialog */}
                  {contactFormOpen && (
                    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                      <div className="bg-background border rounded-lg shadow-lg w-full max-w-md p-6 space-y-4">
                        <h3 className="font-semibold text-lg">
                          {editingContact ? "Edit Contact" : "Add Contact"}
                        </h3>
                        
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="contact_name">Name</Label>
                            <Input
                              id="contact_name"
                              value={contactForm.name}
                              onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
                              placeholder="Contact name"
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="contact_email">Email</Label>
                              <Input
                                id="contact_email"
                                type="email"
                                value={contactForm.email}
                                onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                                placeholder="email@company.com"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="contact_phone">Phone</Label>
                              <Input
                                id="contact_phone"
                                value={contactForm.phone}
                                onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))}
                                placeholder="+40..."
                              />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="contact_mobile">Mobile</Label>
                              <Input
                                id="contact_mobile"
                                value={contactForm.mobile}
                                onChange={(e) => setContactForm((p) => ({ ...p, mobile: e.target.value }))}
                                placeholder="+40..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="contact_whatsapp">WhatsApp</Label>
                              <Input
                                id="contact_whatsapp"
                                value={contactForm.whatsapp}
                                onChange={(e) => setContactForm((p) => ({ ...p, whatsapp: e.target.value }))}
                                placeholder="+40..."
                              />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="contact_position">Position</Label>
                              <Input
                                id="contact_position"
                                value={contactForm.position}
                                onChange={(e) => setContactForm((p) => ({ ...p, position: e.target.value }))}
                                placeholder="e.g. Dispatcher"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="contact_department">Department</Label>
                              <Input
                                id="contact_department"
                                value={contactForm.department}
                                onChange={(e) => setContactForm((p) => ({ ...p, department: e.target.value }))}
                                placeholder="e.g. Operations"
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="contact_language">Preferred Language</Label>
                            <Select
                              value={contactForm.language}
                              onValueChange={(v) => setContactForm((p) => ({ ...p, language: v }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select language" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ro">Romanian</SelectItem>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="de">German</SelectItem>
                                <SelectItem value="hu">Hungarian</SelectItem>
                                <SelectItem value="fr">French</SelectItem>
                                <SelectItem value="it">Italian</SelectItem>
                                <SelectItem value="es">Spanish</SelectItem>
                                <SelectItem value="pl">Polish</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="contact_notes">Notes</Label>
                            <Textarea
                              id="contact_notes"
                              value={contactForm.notes}
                              onChange={(e) => setContactForm((p) => ({ ...p, notes: e.target.value }))}
                              placeholder="Additional notes about this contact..."
                              rows={2}
                            />
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="contact_is_primary"
                                checked={contactForm.is_primary}
                                onCheckedChange={(checked) => setContactForm((p) => ({ ...p, is_primary: !!checked }))}
                              />
                              <Label htmlFor="contact_is_primary" className="font-normal cursor-pointer">
                                Primary contact
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="contact_is_active"
                                checked={contactForm.is_active}
                                onCheckedChange={(checked) => setContactForm((p) => ({ ...p, is_active: !!checked }))}
                              />
                              <Label htmlFor="contact_is_active" className="font-normal cursor-pointer">
                                Active
                              </Label>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-4 border-t">
                          <Button variant="outline" onClick={resetContactForm}>
                            Cancel
                          </Button>
                          <Button onClick={handleSaveContact}>
                            {editingContact ? "Update" : "Add"} Contact
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
            
            <TabsContent value="address" className="space-y-4 mt-4">
              <div className="space-y-4">
                <h3 className="font-medium">Main Address</h3>
                <div className="space-y-2">
                  <Label htmlFor="address_line1">Street Address</Label>
                  <Input
                    id="address_line1"
                    value={formData.address_line1}
                    onChange={(e) => setFormData((p) => ({ ...p, address_line1: e.target.value }))}
                    placeholder="Street and number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_line2">Address Line 2</Label>
                  <Input
                    id="address_line2"
                    value={formData.address_line2}
                    onChange={(e) => setFormData((p) => ({ ...p, address_line2: e.target.value }))}
                    placeholder="Apartment, suite, etc. (optional)"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state_province">State / Province</Label>
                    <Input
                      id="state_province"
                      value={formData.state_province}
                      onChange={(e) => setFormData((p) => ({ ...p, state_province: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="postal_code">Postal Code</Label>
                    <Input
                      id="postal_code"
                      value={formData.postal_code}
                      onChange={(e) => setFormData((p) => ({ ...p, postal_code: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 pt-4 border-t">
                <Checkbox
                  id="same_billing_address"
                  checked={formData.same_billing_address}
                  onCheckedChange={(checked) => setFormData((p) => ({ ...p, same_billing_address: !!checked }))}
                />
                <Label htmlFor="same_billing_address" className="font-normal cursor-pointer">
                  Billing address same as main address
                </Label>
              </div>
              
              {!formData.same_billing_address && (
                <div className="space-y-4">
                  <h3 className="font-medium">Billing Address</h3>
                  <div className="space-y-2">
                    <Label htmlFor="billing_address_line1">Street Address</Label>
                    <Input
                      id="billing_address_line1"
                      value={formData.billing_address_line1}
                      onChange={(e) => setFormData((p) => ({ ...p, billing_address_line1: e.target.value }))}
                      placeholder="Street and number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_address_line2">Address Line 2</Label>
                    <Input
                      id="billing_address_line2"
                      value={formData.billing_address_line2}
                      onChange={(e) => setFormData((p) => ({ ...p, billing_address_line2: e.target.value }))}
                      placeholder="Apartment, suite, etc. (optional)"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="billing_city">City</Label>
                      <Input
                        id="billing_city"
                        value={formData.billing_city}
                        onChange={(e) => setFormData((p) => ({ ...p, billing_city: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="billing_state_province">State / Province</Label>
                      <Input
                        id="billing_state_province"
                        value={formData.billing_state_province}
                        onChange={(e) => setFormData((p) => ({ ...p, billing_state_province: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="billing_postal_code">Postal Code</Label>
                      <Input
                        id="billing_postal_code"
                        value={formData.billing_postal_code}
                        onChange={(e) => setFormData((p) => ({ ...p, billing_postal_code: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="billing_country">Country</Label>
                      <Input
                        id="billing_country"
                        value={formData.billing_country}
                        onChange={(e) => setFormData((p) => ({ ...p, billing_country: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="financial" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="payment_terms">Payment Terms</Label>
                  <select
                    id="payment_terms"
                    value={formData.payment_terms}
                    onChange={(e) => setFormData((p) => ({ ...p, payment_terms: e.target.value }))}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select payment terms</option>
                    {PAYMENT_TERMS.map((term) => (
                      <option key={term.value} value={term.value}>
                        {term.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="credit_limit">Credit Limit</Label>
                  <Input
                    id="credit_limit"
                    type="number"
                    value={formData.credit_limit}
                    onChange={(e) => setFormData((p) => ({ ...p, credit_limit: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium">Bank Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bank_name">Bank Name</Label>
                    <Input
                      id="bank_name"
                      value={formData.bank_name}
                      onChange={(e) => setFormData((p) => ({ ...p, bank_name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bank_account_number">Account Number</Label>
                    <Input
                      id="bank_account_number"
                      value={formData.bank_account_number}
                      onChange={(e) => setFormData((p) => ({ ...p, bank_account_number: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bank_iban">IBAN</Label>
                    <Input
                      id="bank_iban"
                      value={formData.bank_iban}
                      onChange={(e) => setFormData((p) => ({ ...p, bank_iban: e.target.value }))}
                      placeholder="e.g. RO49AAAA1B31007593840000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bank_swift">SWIFT / BIC</Label>
                    <Input
                      id="bank_swift"
                      value={formData.bank_swift}
                      onChange={(e) => setFormData((p) => ({ ...p, bank_swift: e.target.value }))}
                      placeholder="e.g. BRDEROBU"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="contract" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contract_start_date">Contract Start Date</Label>
                  <Input
                    id="contract_start_date"
                    type="date"
                    value={formData.contract_start_date}
                    onChange={(e) => setFormData((p) => ({ ...p, contract_start_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contract_end_date">Contract End Date</Label>
                  <Input
                    id="contract_end_date"
                    type="date"
                    value={formData.contract_end_date}
                    onChange={(e) => setFormData((p) => ({ ...p, contract_end_date: e.target.value }))}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="contract_notes">Contract Notes</Label>
                <Textarea
                  id="contract_notes"
                  value={formData.contract_notes}
                  onChange={(e) => setFormData((p) => ({ ...p, contract_notes: e.target.value }))}
                  placeholder="Contract terms, conditions, and notes..."
                  rows={3}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="notes">General Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Additional notes about this partner..."
                  rows={3}
                />
              </div>
            </TabsContent>

            {editingPartner && formData.types.includes("carrier") && adminSession?.id && (
              <TabsContent value="portal" className="space-y-4 mt-4">
                <CarrierPortalInvite
                  partnerId={editingPartner.id}
                  partnerName={editingPartner.name}
                  partnerEmail={editingPartner.email}
                  adminId={adminSession.id}
                />
              </TabsContent>
            )}
          </Tabs>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingPartner ? "Update Partner" : "Create Partner"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
