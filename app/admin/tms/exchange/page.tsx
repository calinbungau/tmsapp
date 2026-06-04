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
  RefreshCw,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Send,
  ChevronLeft,
  ChevronRight,
  Globe,
  Lock,
  Users,
  MessageSquare,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { PublishToExchangeDialog } from "@/components/tms/publish-to-exchange-dialog";
import { OfferDetailPanel } from "@/components/exchange/offer-detail-panel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

function CountryFlag({ country, className = "w-5 h-3.5" }: { country: string | null | undefined; className?: string }) {
  const code = getCountryCode(country);
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt={country || ""}
      className={`${className} rounded-sm object-cover shrink-0`}
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
  admin_last_seen_at?: string | null;
  recipients_count?: number;
  responses_count?: number;
  awarded_carrier?: string | null;
  // Event tracking
  last_event_type?: "quote" | "response" | "view" | "message" | null;
  last_event_label?: string | null;
  last_event_at?: string | null;
  has_unseen_event?: boolean;
}

interface Stats {
  total: number;
  published: number;
  bidding: number;
  awarded: number;
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
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

function fmtRelative(d: string | null | undefined) {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(d);
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

// ─── Event line ────────────────────────────────────────────
const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  quote: DollarSign,
  response: MessageSquare,
  view: Eye,
  message: MessageSquare,
};

function EventLine({ offer }: { offer: FreightOffer }) {
  if (!offer.last_event_label) return null;
  const Icon = EVENT_ICONS[offer.last_event_type || "view"] || Eye;
  const unseen = offer.has_unseen_event;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs max-w-full ${
        unseen
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border/60 bg-muted/30 text-muted-foreground"
      }`}
    >
      {unseen && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
        </span>
      )}
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate font-medium">{offer.last_event_label}</span>
      <span className={`shrink-0 ${unseen ? "text-destructive/70" : "text-muted-foreground/70"}`}>
        · {fmtRelative(offer.last_event_at)}
      </span>
    </div>
  );
}

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
  const [publishOffer, setPublishOffer] = useState<FreightOffer | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [deleteOfferId, setDeleteOfferId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Stats
  const [stats, setStats] = useState<Stats>({ total: 0, published: 0, bidding: 0, awarded: 0 });

  // ─── Fetch stats ─────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!adminSession?.id) return;
    try {
      const { count: total } = await supabase
        .from("freight_offers")
        .select("*", { count: "exact", head: true })
        .eq("admin_id", adminSession.id);

      const { count: published } = await supabase
        .from("freight_offers")
        .select("*", { count: "exact", head: true })
        .eq("admin_id", adminSession.id)
        .eq("status", "published");

      const { count: bidding } = await supabase
        .from("freight_offers")
        .select("*", { count: "exact", head: true })
        .eq("admin_id", adminSession.id)
        .eq("status", "bidding");

      const { count: awarded } = await supabase
        .from("freight_offers")
        .select("*", { count: "exact", head: true })
        .eq("admin_id", adminSession.id)
        .eq("status", "awarded");

      setStats({
        total: total || 0,
        published: published || 0,
        bidding: bidding || 0,
        awarded: awarded || 0,
      });
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, [adminSession?.id, supabase]);

  // ─── Fetch offers with pagination ────────────────────────
  const fetchOffers = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    try {
      let query = supabase
        .from("freight_offers")
        .select("*", { count: "exact" })
        .eq("admin_id", adminSession.id)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (search.trim()) {
        query = query.or(
          `reference.ilike.%${search}%,title.ilike.%${search}%,origin_city.ilike.%${search}%,dest_city.ilike.%${search}%`
        );
      }

      // Pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      // Fetch recipient counts + activity for each offer
      const offerIds = (data || []).map((o: FreightOffer) => o.id);
      if (offerIds.length > 0) {
        const { data: recipientData } = await supabase
          .from("freight_offer_recipients")
          .select(
            "id, offer_id, response, dispatcher_decision, carrier_name, email, responded_at, last_viewed_at, quote_amount, quote_currency"
          )
          .in("offer_id", offerIds);

        // Map recipient.id -> offer.id (chat conversations are keyed by recipient id)
        const recipientToOffer = new Map<string, string>();
        (recipientData || []).forEach((r: any) => recipientToOffer.set(r.id, r.offer_id));
        const recipientIds = (recipientData || []).map((r: any) => r.id);

        // Fetch latest chat activity per recipient conversation
        let convData: any[] = [];
        if (recipientIds.length > 0) {
          const { data: convs } = await supabase
            .from("conversations")
            .select("context_id, last_message_at, last_message_preview, last_message_sender_name")
            .eq("context_type", "freight_offer_recipient")
            .in("context_id", recipientIds);
          convData = convs || [];
        }

        // Aggregate per offer
        type Agg = {
          count: number;
          responses: number;
          awarded?: string;
          eventType?: "quote" | "response" | "view" | "message";
          eventLabel?: string;
          eventAt?: string;
        };
        const recipientMap = new Map<string, Agg>();
        const consider = (offerId: string, at: string | null | undefined, type: Agg["eventType"], label: string) => {
          if (!at) return;
          const curr = recipientMap.get(offerId) || { count: 0, responses: 0 };
          if (!curr.eventAt || new Date(at).getTime() > new Date(curr.eventAt).getTime()) {
            curr.eventAt = at;
            curr.eventType = type;
            curr.eventLabel = label;
          }
          recipientMap.set(offerId, curr);
        };

        (recipientData || []).forEach((r: any) => {
          const curr = recipientMap.get(r.offer_id) || { count: 0, responses: 0 };
          curr.count++;
          if (r.response) curr.responses++;
          if (r.dispatcher_decision === "accepted") curr.awarded = r.carrier_name || undefined;
          recipientMap.set(r.offer_id, curr);

          const who = r.carrier_name || r.email || "A carrier";
          if (r.response === "quoted" && r.responded_at) {
            const amount = r.quote_amount != null ? ` · ${fmtCurrency(r.quote_amount, r.quote_currency || "EUR")}` : "";
            consider(r.offer_id, r.responded_at, "quote", `New quote from ${who}${amount}`);
          } else if (r.response && r.responded_at) {
            const verb = r.response === "interested" ? "is interested" : r.response === "declined" ? "declined" : "responded";
            consider(r.offer_id, r.responded_at, "response", `${who} ${verb}`);
          } else if (r.last_viewed_at) {
            consider(r.offer_id, r.last_viewed_at, "view", `${who} viewed the offer`);
          }
        });

        convData.forEach((c: any) => {
          const offerId = recipientToOffer.get(c.context_id);
          if (!offerId || !c.last_message_at) return;
          const who = c.last_message_sender_name || "A carrier";
          consider(offerId, c.last_message_at, "message", `New message from ${who}`);
        });

        const enriched: FreightOffer[] = (data || []).map((o: FreightOffer) => {
          const agg = recipientMap.get(o.id);
          const eventAt = agg?.eventAt || null;
          const hasUnseen =
            !!eventAt && (!o.admin_last_seen_at || new Date(eventAt).getTime() > new Date(o.admin_last_seen_at).getTime());
          return {
            ...o,
            recipients_count: agg?.count || 0,
            responses_count: agg?.responses || 0,
            awarded_carrier: agg?.awarded || null,
            last_event_type: agg?.eventType || null,
            last_event_label: agg?.eventLabel || null,
            last_event_at: eventAt,
            has_unseen_event: hasUnseen,
          };
        });

        // Sort: unseen events first (newest), then active (published/bidding), then newest
        const activeStatuses = new Set(["published", "bidding"]);
        enriched.sort((a, b) => {
          if (a.has_unseen_event !== b.has_unseen_event) return a.has_unseen_event ? -1 : 1;
          if (a.has_unseen_event && b.has_unseen_event) {
            return new Date(b.last_event_at!).getTime() - new Date(a.last_event_at!).getTime();
          }
          const aActive = activeStatuses.has(a.status);
          const bActive = activeStatuses.has(b.status);
          if (aActive !== bActive) return aActive ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        setOffers(enriched);
      } else {
        setOffers(data || []);
      }

      setTotalCount(count || 0);
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
  }, [adminSession?.id, supabase, statusFilter, search, currentPage, pageSize, toast]);

  useEffect(() => {
    fetchOffers();
    fetchStats();
  }, [fetchOffers, fetchStats]);

  // ─── Realtime subscription ───────────────────────────────
  useEffect(() => {
    if (!adminSession?.id) return;
    const channel = supabase
      .channel("exchange-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "freight_offers" }, () => {
        fetchOffers();
        fetchStats();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "freight_offer_recipients" }, () => {
        fetchOffers();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminSession?.id, supabase, fetchOffers, fetchStats]);

  // ─── Restore selected offer from URL ─────────────────────
  useEffect(() => {
    if (offers.length === 0 || selectedOfferId) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("offer");
    if (id) setSelectedOfferId(id);
  }, [offers, selectedOfferId]);

  // ─── Select offer (update URL + mark seen) ───────────────
  const selectOffer = (id: string | null) => {
    setSelectedOfferId(id);
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set("offer", id);
      // Clear the blink immediately, then persist the "seen" timestamp
      const now = new Date().toISOString();
      setOffers((prev) =>
        prev.map((o) => (o.id === id ? { ...o, has_unseen_event: false, admin_last_seen_at: now } : o))
      );
      supabase
        .from("freight_offers")
        .update({ admin_last_seen_at: now })
        .eq("id", id)
        .then(() => {});
    } else {
      url.searchParams.delete("offer");
    }
    window.history.replaceState({}, "", url.toString());
  };

  // ─── Delete offer ────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteOfferId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("freight_offers").delete().eq("id", deleteOfferId);
      if (error) throw error;
      if (selectedOfferId === deleteOfferId) selectOffer(null);
      setDeleteOfferId(null);
      toast({ title: "Deleted", description: "Offer deleted successfully" });
      fetchOffers();
      fetchStats();
    } catch {
      toast({ title: "Error", description: "Failed to delete offer", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Left: Offers List */}
      <div
        className={`flex flex-col transition-all duration-300 ease-in-out ${
          selectedOfferId ? "hidden md:flex md:w-1/2 lg:w-1/2" : "w-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/admin/tms/orders")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-semibold text-foreground tracking-tight">
                Freight Exchange
              </h1>
              <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">
                {totalCount} offers total
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="gap-1.5 h-9 md:h-8 px-3 md:px-4 text-xs">
            <Link href="/admin/tms/exchange/new">
              <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" />
              <span className="hidden sm:inline">New Offer</span>
              <span className="sm:hidden">New</span>
            </Link>
          </Button>
        </div>

        {/* Stats Strip */}
        <div className="flex items-center gap-4 md:gap-6 px-4 md:px-6 py-2 md:py-3 border-b border-border/50 bg-muted/20 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Package className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-base md:text-lg font-semibold leading-none">{stats.total}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-md bg-blue-500/10 flex items-center justify-center">
              <Send className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-base md:text-lg font-semibold leading-none">{stats.published}</p>
              <p className="text-[10px] text-muted-foreground">Published</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-md bg-amber-500/10 flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-base md:text-lg font-semibold leading-none">{stats.bidding}</p>
              <p className="text-[10px] text-muted-foreground">Bidding</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-md bg-green-500/10 flex items-center justify-center">
              <Trophy className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <p className="text-base md:text-lg font-semibold leading-none">{stats.awarded}</p>
              <p className="text-[10px] text-muted-foreground">Awarded</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="border-b border-border/50 bg-card/30 px-4 py-2 md:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search offers..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8 h-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setCurrentPage(1);
              }}
            >
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
            <Button variant="ghost" size="icon" onClick={fetchOffers} className="h-9 w-9">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {loading && offers.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : offers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No offers found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search || statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Create your first freight offer to get started"}
              </p>
              {!search && statusFilter === "all" && (
                <Button asChild>
                  <Link href="/admin/tms/exchange/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Offer
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  onClick={() => selectOffer(offer.id)}
                  className={`px-4 md:px-6 py-3 cursor-pointer transition-colors ${
                    selectedOfferId === offer.id
                      ? "bg-primary/5 border-l-2 border-l-primary"
                      : offer.has_unseen_event
                      ? "event-blink hover:bg-destructive/10"
                      : "hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: Route & Info */}
                    <div className="min-w-0 lg:shrink-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-mono text-sm font-medium text-foreground">
                          {offer.reference}
                        </span>
                        <Badge className={`text-[10px] ${STATUS_COLORS[offer.status] || "bg-muted"}`}>
                          {STATUS_LABELS[offer.status] || offer.status}
                        </Badge>
                        {offer.visibility === "private" ? (
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <Globe className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      {/* Route with flags */}
                      <div className="flex items-center gap-2 text-sm">
                        <div className="flex items-center gap-1.5">
                          <CountryFlag country={offer.origin_country} className="w-4 h-3" />
                          <span className="text-foreground truncate max-w-[100px]">
                            {offer.origin_city || "—"}
                          </span>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="flex items-center gap-1.5">
                          <CountryFlag country={offer.dest_country} className="w-4 h-3" />
                          <span className="text-foreground truncate max-w-[100px]">
                            {offer.dest_city || "—"}
                          </span>
                        </div>
                      </div>
                      {/* Meta row */}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {fmtDateRange(offer.load_date_from, offer.load_date_to)}
                        </span>
                        {offer.recipients_count !== undefined && offer.recipients_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {offer.recipients_count}
                          </span>
                        )}
                        {offer.responses_count !== undefined && offer.responses_count > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {offer.responses_count}
                          </span>
                        )}
                        {offer.awarded_carrier && (
                          <span className="flex items-center gap-1 text-green-600">
                            <Trophy className="h-3 w-3" />
                            {offer.awarded_carrier}
                          </span>
                        )}
                      </div>
                      {/* Event line — small screens */}
                      {offer.last_event_label && (
                        <div className="lg:hidden mt-1.5">
                          <EventLine offer={offer} />
                        </div>
                      )}
                    </div>

                    {/* Middle: Event line — large screens */}
                    <div className="hidden lg:flex flex-1 items-center justify-center px-4 min-w-0">
                      {offer.last_event_label && <EventLine offer={offer} />}
                    </div>

                    {/* Right: Price & Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right mr-1">
                        {offer.pricing_mode === "open" ? (
                          <span className="text-xs text-muted-foreground">Open</span>
                        ) : (
                          <p className="text-sm font-semibold text-foreground">
                            {fmtCurrency(offer.price_amount, offer.currency)}
                          </p>
                        )}
                      </div>
                      {/* Visible quick actions */}
                      {(offer.status === "draft" || offer.status === "published" || offer.status === "bidding") && (
                        <Button
                          variant={offer.status === "draft" ? "default" : "outline"}
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPublishOffer(offer);
                          }}
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{offer.status === "draft" ? "Publish" : "Manage"}</span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5"
                        asChild
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/admin/tms/exchange/${offer.id}/edit`}>
                          <Edit className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">Edit</span>
                        </Link>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => selectOffer(offer.id)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/tms/exchange/${offer.id}/edit`}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          {(offer.status === "draft" ||
                            offer.status === "published" ||
                            offer.status === "bidding") && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setPublishOffer(offer);
                              }}
                            >
                              <Send className="h-4 w-4 mr-2" />
                              {offer.status === "draft" ? "Publish" : "Manage"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteOfferId(offer.id);
                            }}
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

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 md:px-6 py-2 md:py-2.5 border-t border-border/50 shrink-0 bg-background/95">
          <p className="text-[10px] md:text-xs text-muted-foreground">
            {totalCount > 0 ? (
              <>
                <span className="hidden sm:inline">
                  {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)} of{" "}
                </span>
                {totalCount}
                <span className="hidden sm:inline"> offers</span>
              </>
            ) : (
              "No offers"
            )}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-0.5 md:gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 md:h-7 md:w-7"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4 md:h-3.5 md:w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground px-2 md:hidden">
                {currentPage}/{totalPages}
              </span>
              <div className="hidden md:flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "..." ? (
                      <span key={`dots-${i}`} className="text-xs text-muted-foreground px-1">
                        ...
                      </span>
                    ) : (
                      <Button
                        key={p}
                        variant={currentPage === p ? "default" : "ghost"}
                        size="icon"
                        className={`h-7 w-7 text-xs ${
                          currentPage === p ? "bg-primary text-primary-foreground" : ""
                        }`}
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </Button>
                    )
                  )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 md:h-7 md:w-7"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4 md:h-3.5 md:w-3.5" />
              </Button>
            </div>
          )}
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[70px] md:w-[90px] h-8 md:h-7 text-[10px] md:text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 / pg</SelectItem>
              <SelectItem value="50">50 / pg</SelectItem>
              <SelectItem value="100">100 / pg</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Right: Detail Panel */}
      {selectedOfferId && adminSession?.id && (
        <div className="fixed top-14 left-0 right-0 bottom-0 z-40 md:relative md:top-auto md:left-auto md:right-auto md:bottom-auto md:z-auto w-full md:w-1/2 border-l border-border/50 bg-card overflow-hidden">
          <OfferDetailPanel
            offerId={selectedOfferId}
            adminId={adminSession.id}
            onClose={() => selectOffer(null)}
            onStatusChange={() => {
              fetchOffers();
              fetchStats();
            }}
          />
        </div>
      )}

      {/* Publish Dialog */}
      {adminSession?.id && publishOffer && (
        <PublishToExchangeDialog
          open={!!publishOffer}
          onOpenChange={(open) => !open && setPublishOffer(null)}
          offerId={publishOffer.id}
          offerReference={publishOffer.reference}
          adminId={adminSession.id}
          onPublished={() => {
            setPublishOffer(null);
            fetchOffers();
            fetchStats();
          }}
        />
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteOfferId} onOpenChange={(open) => !open && setDeleteOfferId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Offer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this offer? This action cannot be undone and will
              permanently remove the offer along with all its recipients and responses.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting ? "Deleting..." : "Delete Offer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
