"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Loader2,
  ArrowRight,
  Calendar,
  Package,
  DollarSign,
  MapPin,
  Clock,
  RefreshCw,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Send,
  ChevronLeft,
  Globe,
  Lock,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

// ─── Country flag ──────────────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  hungary: "HU", germany: "DE", romania: "RO", poland: "PL", czechia: "CZ",
  "czech republic": "CZ", slovakia: "SK", austria: "AT", france: "FR",
  italy: "IT", spain: "ES", netherlands: "NL", belgium: "BE", croatia: "HR",
  slovenia: "SI", serbia: "RS", bulgaria: "BG", greece: "GR", turkey: "TR",
  ukraine: "UA", moldova: "MD", "united kingdom": "GB", uk: "GB",
  ireland: "IE", portugal: "PT", sweden: "SE", norway: "NO", denmark: "DK",
  finland: "FI", switzerland: "CH", luxembourg: "LU",
};

function getCountryCode(c: string | null | undefined) {
  if (!c) return "";
  const t = c.trim();
  const u = t.toUpperCase();
  if (u.length === 2 && /^[A-Z]{2}$/.test(u)) return u;
  return COUNTRY_CODES[t.toLowerCase()] || "";
}

function CountryFlag({ country, className = "w-4 h-3" }: { country: string | null | undefined; className?: string }) {
  const code = getCountryCode(country);
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w20/${code.toLowerCase()}.png`}
      alt={country || ""}
      className={`${className} rounded-[2px] object-cover shrink-0`}
      crossOrigin="anonymous"
    />
  );
}

// ─── Types ─────────────────────────────────────────────────
interface FreightOffer {
  id: string;
  reference: string;
  title: string | null;
  status: string;
  origin_city: string | null;
  origin_country: string | null;
  dest_city: string | null;
  dest_country: string | null;
  load_date_from: string | null;
  load_date_to: string | null;
  vehicle_type: string | null;
  weight_kg: number | null;
  ldm: number | null;
  pricing_mode: string;
  price_amount: number | null;
  currency: string;
  visibility: string;
  created_at: string;
}

// ─── Helpers ───────────────────────────────────────────────
function fmtCurrency(amount: number | null | undefined, currency = "EUR") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function fmtDateRange(from: string | null | undefined, to: string | null | undefined) {
  if (!from && !to) return "—";
  if (from === to || !to) return fmtDate(from);
  return `${fmtDate(from)} - ${fmtDate(to)}`;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  bidding: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  awarded: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  booked: "bg-green-500/10 text-green-600 dark:text-green-400",
  cancelled: "bg-red-500/10 text-red-600 dark:text-red-400",
  expired: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  bidding: "Bidding",
  awarded: "Awarded",
  booked: "Booked",
  cancelled: "Cancelled",
  expired: "Expired",
};

const VISIBILITY_ICONS: Record<string, React.ReactNode> = {
  private: <Lock className="h-3 w-3" />,
  public: <Globe className="h-3 w-3" />,
  external: <Users className="h-3 w-3" />,
};

// ─── Page ──────────────────────────────────────────────────
export default function FreightExchangePage() {
  const { session: adminSession } = useAdminSession();
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();

  const [offers, setOffers] = useState<FreightOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<string>("all");

  // Fetch offers
  const fetchOffers = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    try {
      let query = supabase
        .from("freight_offers")
        .select("*")
        .eq("admin_id", adminSession.id)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (visibilityFilter !== "all") {
        query = query.eq("visibility", visibilityFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setOffers(data || []);
    } catch (err) {
      console.error("Failed to fetch offers:", err);
      toast({
        title: "Error",
        description: "Failed to load freight offers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [adminSession?.id, supabase, statusFilter, visibilityFilter, toast]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Filter by search
  const filteredOffers = offers.filter((offer) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      offer.reference.toLowerCase().includes(q) ||
      offer.title?.toLowerCase().includes(q) ||
      offer.origin_city?.toLowerCase().includes(q) ||
      offer.dest_city?.toLowerCase().includes(q)
    );
  });

  // Delete offer
  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("freight_offers").delete().eq("id", id);
      if (error) throw error;
      setOffers((prev) => prev.filter((o) => o.id !== id));
      toast({ title: "Deleted", description: "Offer deleted successfully" });
    } catch {
      toast({ title: "Error", description: "Failed to delete offer", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/60 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/admin/tms/orders")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Freight Exchange</h1>
              <p className="text-sm text-muted-foreground">
                Manage and publish freight offers to carriers
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href="/admin/tms/exchange/new">
              <Plus className="h-4 w-4 mr-2" />
              New Offer
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-border/40 bg-card/30 px-4 py-2 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search offers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="bidding">Bidding</SelectItem>
              <SelectItem value="awarded">Awarded</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Visibility</SelectItem>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="external">External</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={fetchOffers} className="h-9 w-9">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredOffers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">No offers found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {search || statusFilter !== "all" || visibilityFilter !== "all"
                ? "Try adjusting your filters"
                : "Create your first freight offer to get started"}
            </p>
            {!search && statusFilter === "all" && visibilityFilter === "all" && (
              <Button asChild>
                <Link href="/admin/tms/exchange/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Offer
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredOffers.map((offer) => (
              <div
                key={offer.id}
                className="bg-card border border-border/50 rounded-lg p-4 hover:border-border transition-colors"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left: Route & Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-sm font-medium text-foreground">
                        {offer.reference}
                      </span>
                      <Badge className={STATUS_COLORS[offer.status] || "bg-muted"}>
                        {STATUS_LABELS[offer.status] || offer.status}
                      </Badge>
                      <span className="text-muted-foreground" title={offer.visibility}>
                        {VISIBILITY_ICONS[offer.visibility]}
                      </span>
                    </div>
                    {offer.title && (
                      <p className="text-sm text-muted-foreground mb-2 truncate">
                        {offer.title}
                      </p>
                    )}
                    {/* Route */}
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex items-center gap-1.5">
                        <CountryFlag country={offer.origin_country} />
                        <span className="text-foreground">
                          {offer.origin_city || offer.origin_country || "—"}
                        </span>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex items-center gap-1.5">
                        <CountryFlag country={offer.dest_country} />
                        <span className="text-foreground">
                          {offer.dest_city || offer.dest_country || "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Details */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-1">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{fmtDateRange(offer.load_date_from, offer.load_date_to)}</span>
                    </div>
                    {offer.vehicle_type && (
                      <div className="flex items-center gap-1">
                        <Package className="h-3.5 w-3.5" />
                        <span>{offer.vehicle_type}</span>
                      </div>
                    )}
                    {(offer.weight_kg || offer.ldm) && (
                      <span>
                        {offer.weight_kg ? `${(offer.weight_kg / 1000).toFixed(1)}t` : ""}
                        {offer.weight_kg && offer.ldm ? " / " : ""}
                        {offer.ldm ? `${offer.ldm} LDM` : ""}
                      </span>
                    )}
                  </div>

                  {/* Right: Price & Actions */}
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
                    <div className="text-right">
                      {offer.pricing_mode === "open" ? (
                        <span className="text-sm text-muted-foreground">Open pricing</span>
                      ) : (
                        <>
                          <p className="text-lg font-semibold text-foreground">
                            {fmtCurrency(offer.price_amount, offer.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {offer.pricing_mode === "fixed" ? "Fixed" : "Target"}
                          </p>
                        </>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/tms/exchange/${offer.id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/tms/exchange/${offer.id}/edit`}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        {offer.status === "draft" && (
                          <DropdownMenuItem>
                            <Send className="h-4 w-4 mr-2" />
                            Publish
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDelete(offer.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
