"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import {
  ChevronLeft,
  Loader2,
  Edit,
  Send,
  Trash2,
  MapPin,
  Calendar,
  Package,
  Truck,
  Thermometer,
  AlertTriangle,
  FileText,
  ArrowRight,
  Globe,
  Lock,
  Folder,
  Sparkles,
  XCircle,
  Users,
  Clock,
  Banknote,
  ClipboardList,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/components/i18n/i18n-provider";
import { PublishToExchangeDialog } from "@/components/tms/publish-to-exchange-dialog";
import { OfferRecipientsPanel } from "@/components/exchange/offer-recipients-panel";

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
  origin_company: string | null;
  origin_address: string | null;
  origin_city: string | null;
  origin_postal_code: string | null;
  origin_country: string | null;
  dest_company: string | null;
  dest_address: string | null;
  dest_city: string | null;
  dest_postal_code: string | null;
  dest_country: string | null;
  load_date_from: string | null;
  load_date_to: string | null;
  unload_date_from: string | null;
  unload_date_to: string | null;
  vehicle_type: string | null;
  body_type: string | null;
  length_m: number | null;
  weight_kg: number | null;
  ldm: number | null;
  pallet_count: number | null;
  volume_m3: number | null;
  adr_class: string | null;
  temp_min: number | null;
  temp_max: number | null;
  goods_description: string | null;
  pricing_mode: string;
  price_amount: number | null;
  currency: string;
  payment_terms_days: number | null;
  visibility: string;
  published_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  // Linked order
  order_id: string | null;
  trip_leg_id: string | null;
}

interface LinkedOrder {
  id: string;
  reference_number: string | null;
  customer_reference: string | null;
  customer_name: string | null;
  customer_price: number | null;
  customer_currency: string | null;
  carrier_cost: number | null;
  carrier_currency: string | null;
  margin: number | null;
  estimated_distance_km: number | null;
  status: string | null;
}

interface LinkedLeg {
  id: string;
  leg_number: number | null;
  from_stop_index: number | null;
  to_stop_index: number | null;
  status: string | null;
  from_label: string | null;
  to_label: string | null;
}

interface Distribution {
  id: string;
  channel: string;
  group_id: string | null;
  tier: number;
  status: string;
  group_name?: string;
  group_color?: string;
  group_type?: string;
}

// ─── Helpers ───────────────────────────────────────────────
function fmtCurrency(amount: number | null | undefined, currency = "EUR") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function fmtDateRange(from: string | null | undefined, to: string | null | undefined) {
  if (!from && !to) return "—";
  if (from === to || !to) return fmtDate(from);
  return `${fmtDate(from)} – ${fmtDate(to)}`;
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
  draft: "Draft", published: "Published", bidding: "Bidding", awarded: "Awarded",
  booked: "Booked", cancelled: "Cancelled", expired: "Expired",
};

const COLOR_DOT: Record<string, string> = {
  blue: "bg-blue-500", green: "bg-green-500", amber: "bg-amber-500",
  red: "bg-red-500", purple: "bg-purple-500", slate: "bg-slate-500",
};

// ─── Detail row ────────────────────────────────────────────
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────
export default function OfferDetailPage() {
  const { session: adminSession } = useAdminSession();
  const { toast } = useToast();
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const offerId = params.id as string;

  const [offer, setOffer] = useState<FreightOffer | null>(null);
  const [linkedOrder, setLinkedOrder] = useState<LinkedOrder | null>(null);
  const [linkedLeg, setLinkedLeg] = useState<LinkedLeg | null>(null);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPublish, setShowPublish] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showUnpublish, setShowUnpublish] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchOffer = useCallback(async () => {
    if (!adminSession?.id || !offerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("freight_offers")
        .select("*")
        .eq("id", offerId)
        .eq("admin_id", adminSession.id)
        .single();
      if (error) throw error;
      setOffer(data);

      // Fetch linked order (and trip leg) if present
      if (data.order_id) {
        const { data: orderData } = await supabase
          .from("orders")
          .select(
            "id, reference_number, customer_reference, customer_name, customer_price, customer_currency, carrier_cost, carrier_currency, margin, estimated_distance_km, status"
          )
          .eq("id", data.order_id)
          .single();
        setLinkedOrder((orderData as LinkedOrder) || null);

        // When the offer is scoped to a specific leg, resolve its label
        // from the order's stops so we can show "Leg 2 · City A → City B".
        if (data.trip_leg_id) {
          const { data: legData } = await supabase
            .from("trip_legs")
            .select("id, leg_number, from_stop_index, to_stop_index, status")
            .eq("id", data.trip_leg_id)
            .maybeSingle();
          if (legData) {
            const { data: legStops } = await supabase
              .from("order_stops")
              .select("sequence_order, city, country")
              .eq("order_id", data.order_id)
              .order("sequence_order", { ascending: true });
            const findLabel = (idx: number | null) => {
              if (idx == null || !legStops) return null;
              const s = legStops.find((x: any) => x.sequence_order === idx);
              return s ? s.city || s.country || null : null;
            };
            setLinkedLeg({
              id: legData.id,
              leg_number: legData.leg_number ?? null,
              from_stop_index: legData.from_stop_index ?? null,
              to_stop_index: legData.to_stop_index ?? null,
              status: legData.status ?? null,
              from_label: findLabel(legData.from_stop_index ?? null),
              to_label: findLabel(legData.to_stop_index ?? null),
            });
          } else {
            setLinkedLeg(null);
          }
        } else {
          setLinkedLeg(null);
        }
      } else {
        setLinkedOrder(null);
        setLinkedLeg(null);
      }

      // distributions + group info
      const { data: dist } = await supabase
        .from("freight_offer_distributions")
        .select("id, channel, group_id, tier, status")
        .eq("offer_id", offerId)
        .eq("status", "active")
        .order("tier", { ascending: true });

      if (dist && dist.length > 0) {
        const groupIds = dist
          .filter((d: { group_id: string | null }) => d.group_id)
          .map((d: { group_id: string | null }) => d.group_id);
        let groupMap: Record<string, { name: string; color: string; group_type: string }> = {};
        if (groupIds.length > 0) {
          const { data: groups } = await supabase
            .from("carrier_groups")
            .select("id, name, color, group_type")
            .in("id", groupIds);
          groups?.forEach((g: { id: string; name: string; color: string; group_type: string }) => {
            groupMap[g.id] = { name: g.name, color: g.color, group_type: g.group_type };
          });
        }
        setDistributions(
          dist.map((d: Distribution) => ({
            ...d,
            group_name: d.group_id ? groupMap[d.group_id]?.name : undefined,
            group_color: d.group_id ? groupMap[d.group_id]?.color : undefined,
            group_type: d.group_id ? groupMap[d.group_id]?.group_type : undefined,
          }))
        );
      } else {
        setDistributions([]);
      }
    } catch (err) {
      console.error("Failed to load offer:", err);
      toast({ title: t("tms.exchangeDetail.toast.errorTitle"), description: t("tms.exchangeDetail.toast.loadFailed"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [adminSession?.id, offerId, supabase, toast]);

  useEffect(() => {
    fetchOffer();
  }, [fetchOffer]);

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase.from("freight_offers").delete().eq("id", offerId);
      if (error) throw error;
      toast({ title: t("tms.exchangeDetail.toast.deletedTitle"), description: t("tms.exchangeDetail.toast.deletedDesc") });
      router.push("/admin/tms/exchange");
    } catch {
      toast({ title: t("tms.exchangeDetail.toast.errorTitle"), description: t("tms.exchangeDetail.toast.deleteFailed"), variant: "destructive" });
      setActionLoading(false);
    }
  };

  const handleUnpublish = async () => {
    setActionLoading(true);
    try {
      await supabase.from("freight_offer_distributions").delete().eq("offer_id", offerId);
      const { error } = await supabase
        .from("freight_offers")
        .update({
          status: "draft",
          visibility: "private",
          published_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", offerId);
      if (error) throw error;
      toast({ title: t("tms.exchangeDetail.toast.unpublishedTitle"), description: t("tms.exchangeDetail.toast.unpublishedDesc") });
      setShowUnpublish(false);
      fetchOffer();
    } catch {
      toast({ title: t("tms.exchangeDetail.toast.errorTitle"), description: t("tms.exchangeDetail.toast.unpublishFailed"), variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <Package className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground">{t("tms.exchangeDetail.offerNotFound")}</p>
        <Button asChild variant="outline">
          <Link href="/admin/tms/exchange">{t("tms.exchangeDetail.backToExchange")}</Link>
        </Button>
      </div>
    );
  }

  const isPublished = offer.status === "published" || offer.status === "bidding";
  const canPublish = offer.status === "draft";
  const hasTemp = offer.temp_min != null || offer.temp_max != null;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/60 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push("/admin/tms/exchange")}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold text-foreground font-mono">
                  {offer.reference}
                </h1>
                <Badge className={STATUS_COLORS[offer.status] || "bg-muted"}>
                  {t(`tms.exchangeDetail.status.${offer.status}`, STATUS_LABELS[offer.status] || offer.status)}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  {offer.visibility === "public" ? (
                    <><Globe className="h-3 w-3" /> {t("tms.exchangeDetail.public")}</>
                  ) : offer.visibility === "external" ? (
                    <><Users className="h-3 w-3" /> {t("tms.exchangeDetail.external")}</>
                  ) : (
                    <><Lock className="h-3 w-3" /> {t("tms.exchangeDetail.private")}</>
                  )}
                </Badge>
                {linkedOrder && (
                  <Link href={`/admin/tms/orders/${linkedOrder.id}`}>
                    <Badge
                      variant="outline"
                      className="gap-1 bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"
                    >
                      <Folder className="h-3 w-3" />
                      {linkedOrder.reference_number || t("tms.exchangeDetail.order")}
                      {linkedLeg && (
                        <span className="ml-1 text-[10px] opacity-80">· {t("tms.exchangeDetail.leg")} {linkedLeg.leg_number ?? "?"}</span>
                      )}
                    </Badge>
                  </Link>
                )}
              </div>
              {offer.title && (
                <p className="text-sm text-muted-foreground truncate">{offer.title}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canPublish && (
              <Button onClick={() => setShowPublish(true)}>
                <Send className="h-4 w-4 mr-2" />
                {t("tms.exchangeDetail.publish")}
              </Button>
            )}
            {isPublished && (
              <>
                <Button variant="outline" onClick={() => setShowPublish(true)}>
                  <Send className="h-4 w-4 mr-2" />
                  {t("tms.exchangeDetail.manage")}
                </Button>
                <Button variant="outline" onClick={() => setShowUnpublish(true)}>
                  <XCircle className="h-4 w-4 mr-2" />
                  {t("tms.exchangeDetail.unpublish")}
                </Button>
              </>
            )}
            <Button variant="outline" size="icon" asChild>
              <Link href={`/admin/tms/exchange/${offer.id}/edit`}>
                <Edit className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {/* Distribution status */}
          {isPublished && (
            <div className="rounded-lg border border-border/50 bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Send className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">{t("tms.exchangeDetail.publishedTo")}</h2>
              </div>
              {distributions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("tms.exchangeDetail.noDistributions")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {distributions.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-1.5"
                    >
                      {d.channel === "public" ? (
                        <>
                          <Globe className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          <span className="text-sm text-foreground">{t("tms.exchangeDetail.publicBoard")}</span>
                        </>
                      ) : (
                        <>
                          {d.group_type === "dynamic" ? (
                            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <span className={`h-2 w-2 rounded-full ${COLOR_DOT[d.group_color || "blue"] || COLOR_DOT.blue}`} />
                          )}
                          <span className="text-sm text-foreground">{d.group_name || t("tms.exchangeDetail.group")}</span>
                        </>
                      )}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {t("tms.exchangeDetail.tier").replace("{n}", String(d.tier))}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                {offer.published_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {t("tms.exchangeDetail.publishedAt").replace("{date}", fmtDateTime(offer.published_at))}
                  </span>
                )}
                {offer.expires_at && (
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {t("tms.exchangeDetail.expiresAt").replace("{date}", fmtDateTime(offer.expires_at))}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Carrier responses + per-carrier chat */}
          {adminSession?.id && (
            <OfferRecipientsPanel
              offerId={offer.id}
              adminId={adminSession.id}
              onAwardLinkedOrder={(orderId, tripLegId) => {
                // Navigate to the order in Execution to create the FWD subcontract
                // The leg assignment dialog will be triggered from there
                if (tripLegId) {
                  // Navigate to the order with leg context - the user can then open the assignment dialog
                  router.push(`/admin/tms/orders/${orderId}?openLeg=${tripLegId}`);
                } else {
                  // Navigate to the order detail - user can manage from there
                  router.push(`/admin/tms/orders/${orderId}`);
                }
              }}
            />
          )}

          {/* Linked Transport Order */}
          {linkedOrder && (
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-orange-400" />
                  <h2 className="text-sm font-semibold text-foreground">{t("tms.exchangeDetail.linkedOrder")}</h2>
                </div>
                <Link href={`/admin/tms/orders/${linkedOrder.id}`}>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                    <ExternalLink className="h-3 w-3" />
                    {t("tms.exchangeDetail.openOrder")}
                  </Button>
                </Link>
              </div>

              {/* Order reference + customer + leg scope */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="font-mono text-sm font-medium text-foreground">
                  {linkedOrder.reference_number || t("tms.exchangeDetail.order")}
                </span>
                {linkedOrder.customer_name && (
                  <span className="text-xs text-muted-foreground">· {linkedOrder.customer_name}</span>
                )}
                {linkedOrder.status && (
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {linkedOrder.status.replace(/_/g, " ")}
                  </Badge>
                )}
                {linkedLeg ? (
                  <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/30 bg-blue-500/10">
                    {t("tms.exchangeDetail.leg")} {linkedLeg.leg_number ?? "?"}
                    {linkedLeg.from_label && linkedLeg.to_label
                      ? ` · ${linkedLeg.from_label} → ${linkedLeg.to_label}`
                      : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {t("tms.exchangeDetail.wholeOrder")}
                  </Badge>
                )}
              </div>

              {/* Commercial snapshot */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-md bg-background border border-border/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{t("tms.exchangeDetail.customerPrice")}</p>
                  <p className="text-sm font-semibold text-foreground">
                    {fmtCurrency(linkedOrder.customer_price, linkedOrder.customer_currency || "EUR")}
                  </p>
                </div>
                <div className="rounded-md bg-background border border-border/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{t("tms.exchangeDetail.offerPrice")}</p>
                  <p className="text-sm font-semibold text-foreground">
                    {fmtCurrency(offer.price_amount, offer.currency || "EUR")}
                  </p>
                </div>
                {(() => {
                  // Prefer the order's stored margin; otherwise derive it from
                  // the customer price and the price we're posting on exchange.
                  const derived =
                    linkedOrder.customer_price != null && offer.price_amount != null && linkedOrder.customer_price > 0
                      ? ((linkedOrder.customer_price - offer.price_amount) / linkedOrder.customer_price) * 100
                      : null;
                  const marginPct = linkedOrder.margin != null ? linkedOrder.margin : derived;
                  return (
                    <div className="rounded-md bg-background border border-border/40 p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{t("tms.exchangeDetail.margin")}</p>
                      <p
                        className={`text-sm font-semibold ${
                          marginPct == null
                            ? "text-foreground"
                            : marginPct >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {marginPct == null ? "—" : `${Math.round(marginPct)}%`}
                      </p>
                    </div>
                  );
                })()}
                <div className="rounded-md bg-background border border-border/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{t("tms.exchangeDetail.distance")}</p>
                  <p className="text-sm font-semibold text-foreground">
                    {linkedOrder.estimated_distance_km != null && linkedOrder.estimated_distance_km > 0
                      ? `${Math.round(linkedOrder.estimated_distance_km).toLocaleString()} km`
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Route */}
          <div className="rounded-lg border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{t("tms.exchangeDetail.route")}</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Origin */}
              <div className="rounded-md bg-background border border-border/40 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("tms.exchangeDetail.loading")}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <CountryFlag country={offer.origin_country} />
                  <span className="text-sm font-medium text-foreground">
                    {offer.origin_city || offer.origin_country || "—"}
                  </span>
                  {offer.origin_postal_code && (
                    <span className="text-xs text-muted-foreground">{offer.origin_postal_code}</span>
                  )}
                </div>
                {offer.origin_company && (
                  <p className="text-xs text-muted-foreground">{offer.origin_company}</p>
                )}
                {offer.origin_address && (
                  <p className="text-xs text-muted-foreground">{offer.origin_address}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {fmtDateRange(offer.load_date_from, offer.load_date_to)}
                </p>
              </div>
              {/* Destination */}
              <div className="rounded-md bg-background border border-border/40 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("tms.exchangeDetail.unloading")}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <CountryFlag country={offer.dest_country} />
                  <span className="text-sm font-medium text-foreground">
                    {offer.dest_city || offer.dest_country || "—"}
                  </span>
                  {offer.dest_postal_code && (
                    <span className="text-xs text-muted-foreground">{offer.dest_postal_code}</span>
                  )}
                </div>
                {offer.dest_company && (
                  <p className="text-xs text-muted-foreground">{offer.dest_company}</p>
                )}
                {offer.dest_address && (
                  <p className="text-xs text-muted-foreground">{offer.dest_address}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {fmtDateRange(offer.unload_date_from, offer.unload_date_to)}
                </p>
              </div>
            </div>
          </div>

          {/* Cargo & Vehicle */}
          <div className="rounded-lg border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{t("tms.exchangeDetail.cargoVehicle")}</h2>
            </div>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
              <Field label={t("tms.exchangeDetail.vehicleType")} value={offer.vehicle_type} />
              <Field label={t("tms.exchangeDetail.bodyType")} value={offer.body_type} />
              <Field label={t("tms.exchangeDetail.length")} value={offer.length_m ? `${offer.length_m} m` : null} />
              <Field label={t("tms.exchangeDetail.weight")} value={offer.weight_kg ? `${(offer.weight_kg / 1000).toFixed(1)} t` : null} />
              <Field label={t("tms.exchangeDetail.loadingMeters")} value={offer.ldm ? `${offer.ldm} LDM` : null} />
              <Field label={t("tms.exchangeDetail.pallets")} value={offer.pallet_count} />
              <Field label={t("tms.exchangeDetail.volume")} value={offer.volume_m3 ? `${offer.volume_m3} m³` : null} />
              <Field
                label={t("tms.exchangeDetail.adr")}
                value={
                  offer.adr_class && offer.adr_class !== "None" ? (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" /> {offer.adr_class}
                    </span>
                  ) : null
                }
              />
              {hasTemp && (
                <Field
                  label={t("tms.exchangeDetail.temperature")}
                  value={
                    <span className="flex items-center gap-1">
                      <Thermometer className="h-3.5 w-3.5" />
                      {offer.temp_min ?? "?"}°C / {offer.temp_max ?? "?"}°C
                    </span>
                  }
                />
              )}
            </div>
            {offer.goods_description && (
              <>
                <Separator className="my-3" />
                <Field label={t("tms.exchangeDetail.goodsDescription")} value={offer.goods_description} />
              </>
            )}
          </div>

          {/* Pricing */}
          <div className="rounded-lg border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Banknote className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{t("tms.exchangeDetail.pricing")}</h2>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                {offer.pricing_mode === "open" ? (
                  <p className="text-2xl font-semibold text-foreground">{t("tms.exchangeDetail.openPricing")}</p>
                ) : (
                  <p className="text-2xl font-semibold text-foreground">
                    {fmtCurrency(offer.price_amount, offer.currency)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground capitalize">
                  {offer.pricing_mode === "fixed"
                    ? t("tms.exchangeDetail.fixedPrice")
                    : offer.pricing_mode === "target"
                    ? t("tms.exchangeDetail.targetPrice")
                    : t("tms.exchangeDetail.carriersSubmit")}
                </p>
              </div>
              {offer.payment_terms_days != null && (
                <Field label={t("tms.exchangeDetail.paymentTerms")} value={t("tms.exchangeDetail.days").replace("{n}", String(offer.payment_terms_days))} />
              )}
            </div>
          </div>

          {/* Notes */}
          {offer.notes && (
            <div className="rounded-lg border border-border/50 bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">{t("tms.exchangeDetail.notes")}</h2>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{offer.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Publish dialog */}
      {adminSession?.id && (
        <PublishToExchangeDialog
          open={showPublish}
          onOpenChange={setShowPublish}
          offerId={offer.id}
          offerReference={offer.reference}
          adminId={adminSession.id}
          onPublished={fetchOffer}
        />
      )}

      {/* Unpublish confirm */}
      <AlertDialog open={showUnpublish} onOpenChange={setShowUnpublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tms.exchangeDetail.unpublishTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tms.exchangeDetail.unpublishDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>{t("tms.exchangeDetail.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnpublish} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("tms.exchangeDetail.unpublish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tms.exchangeDetail.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tms.exchangeDetail.deleteDesc").replace("{ref}", offer.reference)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>{t("tms.exchangeDetail.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={actionLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("tms.exchangeDetail.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
