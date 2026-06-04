"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  X,
  MapPin,
  Calendar,
  Package,
  Truck,
  ArrowRight,
  DollarSign,
  History,
  Edit2,
  ChevronDown,
  Send,
  Loader2,
  Eye,
  Users,
  Clock,
  MessageSquare,
  CheckCircle2,
  XCircle,
  BadgeEuro,
  Trophy,
  RotateCcw,
  Globe,
  Lock,
} from "lucide-react";
import dynamic from "next/dynamic";
import { OfferRecipientsPanel } from "@/components/exchange/offer-recipients-panel";
import { PublishToExchangeDialog } from "@/components/tms/publish-to-exchange-dialog";
import Link from "next/link";

const RouteMap = dynamic(
  () => import("@/components/tms/route-map").then((m) => ({ default: m.RouteMap })),
  { ssr: false }
);

// ─── Types ─────────────────────────────────────────────────
interface FreightOffer {
  id: string;
  reference: string;
  title: string | null;
  status: string;
  visibility: string;
  origin_address: string | null;
  origin_city: string | null;
  origin_postal_code: string | null;
  origin_country: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  dest_address: string | null;
  dest_city: string | null;
  dest_postal_code: string | null;
  dest_country: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  load_date_from: string | null;
  load_date_to: string | null;
  delivery_date_from: string | null;
  delivery_date_to: string | null;
  vehicle_type: string | null;
  vehicle_size: string | null;
  weight_kg: number | null;
  volume_m3: number | null;
  ldm: number | null;
  pallets: number | null;
  cargo_description: string | null;
  pricing_mode: string;
  price_amount: number | null;
  currency: string;
  notes: string | null;
  created_at: string;
  admin_id: string;
}

interface FreightStop {
  id: string;
  sequence_order: number;
  stop_type: string;
  company_name: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  date_from: string | null;
  date_to: string | null;
  time_from: string | null;
  time_to: string | null;
  reference_number: string | null;
  notes: string | null;
}

interface Recipient {
  id: string;
  carrier_name: string | null;
  email: string | null;
  response: "interested" | "quoted" | "declined" | null;
  responded_at: string | null;
  quote_amount: number | null;
  quote_currency: string | null;
  first_viewed_at: string | null;
  view_count: number;
  dispatcher_decision: "accepted" | "declined" | null;
}

interface ActivityEntry {
  id: string;
  action: string;
  details: any;
  performed_by: string | null;
  performed_by_type: string;
  created_at: string;
}

// ─── Helpers ───────────────────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  Belgium: "be", Germany: "de", Austria: "at", Hungary: "hu", France: "fr",
  Netherlands: "nl", Poland: "pl", "Czech Republic": "cz", Czechia: "cz",
  Romania: "ro", Bulgaria: "bg", Italy: "it", Spain: "es", Portugal: "pt",
  "United Kingdom": "gb", Ireland: "ie", Denmark: "dk", Sweden: "se", Norway: "no",
  Finland: "fi", Switzerland: "ch", Slovakia: "sk", Slovenia: "si", Croatia: "hr",
  Serbia: "rs", Greece: "gr", Turkey: "tr", Ukraine: "ua", Moldova: "md",
  Luxembourg: "lu", Lithuania: "lt", Latvia: "lv", Estonia: "ee",
  hungary: "hu", germany: "de", romania: "ro", poland: "pl", czechia: "cz",
  slovakia: "sk", austria: "at", france: "fr", italy: "it", spain: "es",
  netherlands: "nl", belgium: "be", croatia: "hr", slovenia: "si", serbia: "rs",
  bulgaria: "bg", greece: "gr", turkey: "tr", ukraine: "ua", moldova: "md",
  "united kingdom": "gb", uk: "gb", ireland: "ie", portugal: "pt", sweden: "se",
  norway: "no", denmark: "dk", finland: "fi", switzerland: "ch", luxembourg: "lu",
};

function getCountryCode(country?: string | null): string {
  if (!country) return "";
  const trimmed = country.trim();
  if (trimmed.length === 2) return trimmed.toLowerCase();
  return COUNTRY_CODES[trimmed] || COUNTRY_CODES[trimmed.toLowerCase()] || trimmed.substring(0, 2).toLowerCase();
}

function CountryFlag({ country, className = "w-5 h-3.5" }: { country?: string | null; className?: string }) {
  const code = getCountryCode(country);
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      alt={country || ""}
      className={`${className} rounded-sm object-cover shrink-0`}
      crossOrigin="anonymous"
    />
  );
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateRange(from: string | null | undefined, to: string | null | undefined) {
  if (!from && !to) return "—";
  if (from === to || !to) return fmtDate(from);
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

function fmtCurrency(amount: number | null | undefined, currency = "EUR") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtTime(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-muted text-muted-foreground" },
  published: { label: "Published", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  bidding: { label: "Bidding", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  awarded: { label: "Awarded", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  booked: { label: "Booked", color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  cancelled: { label: "Cancelled", color: "bg-red-500/10 text-red-600 dark:text-red-400" },
  expired: { label: "Expired", color: "bg-muted text-muted-foreground" },
};

const STOP_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  load: { label: "Loading", color: "bg-blue-500" },
  unload: { label: "Unloading", color: "bg-emerald-500" },
  intermediate: { label: "Stop", color: "bg-amber-500" },
};

const RESPONSE_CONFIG: Record<string, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  interested: { label: "Interested", className: "bg-blue-500/10 text-blue-600", Icon: CheckCircle2 },
  quoted: { label: "Quoted", className: "bg-emerald-500/10 text-emerald-600", Icon: BadgeEuro },
  declined: { label: "Declined", className: "bg-muted text-muted-foreground", Icon: XCircle },
};

type TabKey = "overview" | "activity";

interface Props {
  offerId: string;
  adminId: string;
  onClose: () => void;
  onStatusChange?: () => void;
}

export function OfferDetailPanel({ offerId, adminId, onClose, onStatusChange }: Props) {
  const { toast } = useToast();
  const supabase = createClient();

  const [offer, setOffer] = useState<FreightOffer | null>(null);
  const [stops, setStops] = useState<FreightStop[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [publishOpen, setPublishOpen] = useState(false);

  // ─── Fetch offer data ────────────────────────────────────
  const fetchOffer = useCallback(async () => {
    try {
      const [offerRes, stopsRes, recipientsRes, activityRes] = await Promise.all([
        supabase.from("freight_offers").select("*").eq("id", offerId).single(),
        supabase.from("freight_offer_stops").select("*").eq("offer_id", offerId).order("sequence_order"),
        supabase.from("freight_offer_recipients").select("*").eq("offer_id", offerId).order("created_at", { ascending: false }),
        supabase.from("freight_offer_activity").select("*").eq("offer_id", offerId).order("created_at", { ascending: false }).limit(50),
      ]);

      if (offerRes.error) throw offerRes.error;
      setOffer(offerRes.data);
      setStops(stopsRes.data || []);
      setRecipients(recipientsRes.data || []);
      setActivity(activityRes.data || []);
    } catch (err) {
      console.error("Failed to fetch offer:", err);
      toast({ title: "Error", description: "Failed to load offer details", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [offerId, supabase, toast]);

  useEffect(() => {
    fetchOffer();
  }, [fetchOffer]);

  // ─── Realtime subscription ───────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`offer-detail-${offerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "freight_offers", filter: `id=eq.${offerId}` }, () => fetchOffer())
      .on("postgres_changes", { event: "*", schema: "public", table: "freight_offer_stops", filter: `offer_id=eq.${offerId}` }, () => fetchOffer())
      .on("postgres_changes", { event: "*", schema: "public", table: "freight_offer_recipients", filter: `offer_id=eq.${offerId}` }, () => fetchOffer())
      .on("postgres_changes", { event: "*", schema: "public", table: "freight_offer_activity", filter: `offer_id=eq.${offerId}` }, () => fetchOffer())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [offerId, supabase, fetchOffer]);

  // ─── Build route for map ─────────────────────────────────
  const mapStops = stops.length > 0
    ? stops.map((s, i) => ({
        id: s.id,
        sequence_order: s.sequence_order,
        stop_type: s.stop_type === "load" ? "pickup" : s.stop_type === "unload" ? "delivery" : "customs",
        city: s.city,
        country: s.country,
        lat: s.lat,
        lng: s.lng,
        status: "pending",
      }))
    : offer
    ? [
        { id: "origin", sequence_order: 0, stop_type: "pickup" as const, city: offer.origin_city, country: offer.origin_country, lat: offer.origin_lat, lng: offer.origin_lng, status: "pending" },
        { id: "dest", sequence_order: 1, stop_type: "delivery" as const, city: offer.dest_city, country: offer.dest_country, lat: offer.dest_lat, lng: offer.dest_lng, status: "pending" },
      ]
    : [];

  // ─── Stats ───────────────────────────────────────────────
  const totalViews = recipients.reduce((sum, r) => sum + (r.view_count || 0), 0);
  const responsesCount = recipients.filter((r) => r.response).length;
  const quotesCount = recipients.filter((r) => r.response === "quoted").length;
  const awardedRecipient = recipients.find((r) => r.dispatcher_decision === "accepted");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-card gap-2">
        <p className="text-muted-foreground">Offer not found</p>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[offer.status] || STATUS_CONFIG.draft;
  const firstStop = stops[0] || { city: offer.origin_city, country: offer.origin_country };
  const lastStop = stops[stops.length - 1] || { city: offer.dest_city, country: offer.dest_country };

  return (
    <div className="flex flex-col h-full bg-card">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-base font-semibold text-foreground">{offer.reference}</span>
            <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
            {offer.visibility === "private" ? (
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          {/* Route summary with flags */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CountryFlag country={firstStop.country} />
              <span>{firstStop.city || "—"}</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            <div className="flex items-center gap-1.5">
              <CountryFlag country={lastStop.country} />
              <span>{lastStop.city || "—"}</span>
            </div>
            {stops.length > 2 && (
              <span className="text-xs text-muted-foreground/70">+{stops.length - 2} stops</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(offer.status === "draft" || offer.status === "published" || offer.status === "bidding") && (
            <Button size="sm" variant="outline" onClick={() => setPublishOpen(true)}>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {offer.status === "draft" ? "Publish" : "Manage"}
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/admin/tms/exchange/${offer.id}/edit`}>
              <Edit2 className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ─── Route Map ──────────────────────────────────────── */}
      <div className="h-44 shrink-0 border-b border-border/50">
        <RouteMap stops={mapStops} height="100%" interactive={false} showRouteInfo />
      </div>

      {/* ─── Tabs ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border/50 shrink-0 overflow-x-auto">
        {(["overview", "activity"] as TabKey[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {tab === "overview" ? "Overview" : "Activity"}
            {tab === "activity" && activity.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">{activity.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {activeTab === "overview" && (
          <div className="p-4 space-y-4">
            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Users className="h-3.5 w-3.5" />
                  <span className="text-xs">Sent</span>
                </div>
                <p className="text-lg font-semibold">{recipients.length}</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Eye className="h-3.5 w-3.5" />
                  <span className="text-xs">Views</span>
                </div>
                <p className="text-lg font-semibold">{totalViews}</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span className="text-xs">Responses</span>
                </div>
                <p className="text-lg font-semibold">{responsesCount}</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <BadgeEuro className="h-3.5 w-3.5" />
                  <span className="text-xs">Quotes</span>
                </div>
                <p className="text-lg font-semibold">{quotesCount}</p>
              </div>
            </div>

            {/* Awarded Banner */}
            {awardedRecipient && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-3">
                <Trophy className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-600">Awarded to {awardedRecipient.carrier_name || awardedRecipient.email}</p>
                  {awardedRecipient.quote_amount && (
                    <p className="text-xs text-green-600/80">
                      {fmtCurrency(awardedRecipient.quote_amount, awardedRecipient.quote_currency || offer.currency)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Route / Stops */}
            <div className="bg-muted/20 rounded-lg p-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Route
              </h3>
              <div className="space-y-3">
                {(stops.length > 0 ? stops : [
                  { id: "o", sequence_order: 0, stop_type: "load", city: offer.origin_city, country: offer.origin_country, address: offer.origin_address, date_from: offer.load_date_from, date_to: offer.load_date_to },
                  { id: "d", sequence_order: 1, stop_type: "unload", city: offer.dest_city, country: offer.dest_country, address: offer.dest_address, date_from: offer.delivery_date_from, date_to: offer.delivery_date_to },
                ] as any[]).map((stop, idx) => {
                  const typeCfg = STOP_TYPE_CONFIG[stop.stop_type] || STOP_TYPE_CONFIG.intermediate;
                  return (
                    <div key={stop.id} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${typeCfg.color}`} />
                        {idx < (stops.length > 0 ? stops.length : 2) - 1 && (
                          <div className="w-0.5 h-8 bg-border mt-1" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CountryFlag country={stop.country} className="w-4 h-3" />
                          <span className="font-medium text-sm">{stop.city || "—"}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {typeCfg.label}
                          </Badge>
                        </div>
                        {stop.address && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{stop.address}</p>
                        )}
                        {(stop.date_from || stop.date_to) && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {fmtDateRange(stop.date_from, stop.date_to)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cargo & Vehicle */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/20 rounded-lg p-4">
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  Cargo
                </h3>
                <div className="space-y-1.5 text-sm">
                  {offer.cargo_description && (
                    <p className="text-muted-foreground">{offer.cargo_description}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {offer.weight_kg && <span>{(offer.weight_kg / 1000).toFixed(1)} t</span>}
                    {offer.volume_m3 && <span>{offer.volume_m3} m³</span>}
                    {offer.ldm && <span>{offer.ldm} LDM</span>}
                    {offer.pallets && <span>{offer.pallets} pal</span>}
                  </div>
                </div>
              </div>
              <div className="bg-muted/20 rounded-lg p-4">
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" />
                  Vehicle
                </h3>
                <div className="space-y-1 text-sm">
                  {offer.vehicle_type && <p>{offer.vehicle_type}</p>}
                  {offer.vehicle_size && <p className="text-xs text-muted-foreground">{offer.vehicle_size}</p>}
                  {!offer.vehicle_type && !offer.vehicle_size && (
                    <p className="text-muted-foreground text-xs">Not specified</p>
                  )}
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="bg-muted/20 rounded-lg p-4">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                Pricing
              </h3>
              {offer.pricing_mode === "open" ? (
                <p className="text-sm text-muted-foreground">Open to quotes — submit your price</p>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-semibold">
                    {fmtCurrency(offer.price_amount, offer.currency)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {offer.pricing_mode === "fixed" ? "Fixed price" : "Target price"}
                  </span>
                </div>
              )}
            </div>

            {/* Carrier Responses */}
            {recipients.length > 0 && (
              <div className="bg-muted/20 rounded-lg p-4">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Carrier Responses
                </h3>
                <div className="space-y-2">
                  {recipients.slice(0, 5).map((r) => {
                    const respCfg = r.response ? RESPONSE_CONFIG[r.response] : null;
                    const isAwarded = r.dispatcher_decision === "accepted";
                    return (
                      <div
                        key={r.id}
                        className={`flex items-center justify-between p-2 rounded-md ${
                          isAwarded ? "bg-green-500/10 border border-green-500/20" : "bg-background/50"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isAwarded && <Trophy className="h-4 w-4 text-green-600 shrink-0" />}
                          <span className="text-sm truncate">
                            {r.carrier_name || r.email || "Unknown"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {r.response === "quoted" && r.quote_amount && (
                            <span className="text-sm font-medium">
                              {fmtCurrency(r.quote_amount, r.quote_currency || offer.currency)}
                            </span>
                          )}
                          {respCfg && (
                            <Badge className={respCfg.className}>
                              <respCfg.Icon className="h-3 w-3 mr-1" />
                              {respCfg.label}
                            </Badge>
                          )}
                          {!r.response && r.view_count > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Eye className="h-3 w-3" /> {r.view_count}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {recipients.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">
                      +{recipients.length - 5} more carriers
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {offer.notes && (
              <div className="bg-muted/20 rounded-lg p-4">
                <h3 className="text-sm font-medium mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{offer.notes}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <div className="p-4">
            {activity.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No activity yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activity.map((entry) => (
                  <div key={entry.id} className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{entry.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtTime(entry.created_at)}
                        {entry.performed_by_type && ` · ${entry.performed_by_type}`}
                      </p>
                      {entry.details && typeof entry.details === "object" && Object.keys(entry.details).length > 0 && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          {JSON.stringify(entry.details)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Publish Dialog */}
      <PublishToExchangeDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        offerId={offer.id}
        offerReference={offer.reference}
        adminId={adminId}
        onPublished={() => {
          setPublishOpen(false);
          fetchOffer();
          onStatusChange?.();
        }}
      />
    </div>
  );
}
