"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Loader2,
  Package,
  MapPin,
  Calendar,
  ArrowRight,
  Building2,
  Trophy,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getStoredCarrierSession } from "@/hooks/use-carrier-session";
import { createClient } from "@/lib/supabase/client";

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

interface OfferRow {
  id: string;
  token: string;
  response: string | null;
  quote_amount: number | null;
  quote_currency: string | null;
  expires_at: string | null;
  dispatcher_decision: "accepted" | "declined" | null;
  from_company: string | null;
  offer: {
    id: string;
    reference: string;
    title: string | null;
    status: string;
    origin_city: string | null;
    origin_country: string | null;
    dest_city: string | null;
    dest_country: string | null;
    load_date_from: string | null;
    unload_date_from: string | null;
    vehicle_type: string | null;
    weight_kg: number | null;
    pricing_mode: string | null;
    price_amount: number | null;
    currency: string | null;
    awarded_recipient_id: string | null;
  } | null;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function fmtCurrency(amount: number | null | undefined, currency = "EUR") {
  if (amount == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const responseStyles: Record<string, string> = {
  interested: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  quoted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  declined: "bg-muted text-muted-foreground",
};

export default function CarrierOffersPage() {
  const supabase = createClient();
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [carrierId, setCarrierId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  const load = useCallback(async () => {
    const session = getStoredCarrierSession();
    if (!session) {
      setLoading(false);
      return;
    }
    setCarrierId(session.id);

    try {
      const res = await fetch(
        `/api/carrier-portal/offers?page=${currentPage}&limit=${pageSize}`,
        {
          headers: { "x-carrier-id": session.id },
        }
      );
      const data = await res.json();
      if (res.ok) {
        setOffers(data.offers || []);
        setTotalCount(data.total || data.offers?.length || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!carrierId) return;

    const channel = supabase
      .channel("carrier-portal-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "freight_offers" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "freight_offer_recipients" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [carrierId, supabase, load]);

  const totalPages = Math.ceil(totalCount / pageSize);
  const active = offers.filter(
    (o) => o.offer && o.offer.status !== "expired" && o.offer.status !== "closed"
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-lg font-semibold">Freight Offers</h1>
          <p className="text-xs text-muted-foreground">{totalCount} offers total</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{active.length} active</Badge>
          <Button variant="ghost" size="icon" onClick={load} className="h-8 w-8">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {offers.length === 0 ? (
        <Card className="p-8 text-center">
          <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium">No offers yet</p>
          <p className="text-xs text-muted-foreground mt-1 text-pretty">
            When a dispatcher sends you a freight offer, it will appear here.
          </p>
        </Card>
      ) : (
        <>
          {offers.map((row) => {
            const o = row.offer;
            if (!o) return null;
            const isWon = !!o.awarded_recipient_id && o.awarded_recipient_id === row.id;
            const isLost =
              row.dispatcher_decision === "declined" ||
              (!!o.awarded_recipient_id && o.awarded_recipient_id !== row.id);

            return (
              <Link key={row.id} href={`/carrier-dashboard/offers/${row.token}`}>
                <Card className="p-4 hover:border-primary/40 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-mono">{o.reference}</p>
                      <p className="text-sm font-medium truncate">{o.title || "Freight offer"}</p>
                      {row.from_company && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 truncate">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {row.from_company}
                        </p>
                      )}
                    </div>
                    {isWon ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Trophy className="h-3 w-3" />
                        Awarded
                      </span>
                    ) : isLost ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">
                        <XCircle className="h-3 w-3" />
                        Not selected
                      </span>
                    ) : (
                      row.response && (
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${
                            responseStyles[row.response] || "bg-muted text-muted-foreground"
                          }`}
                        >
                          {row.response}
                        </span>
                      )
                    )}
                  </div>

                  {/* Route with flags */}
                  <div className="flex items-center gap-2 text-sm">
                    <div className="flex items-center gap-1.5">
                      <CountryFlag country={o.origin_country} className="w-4 h-3" />
                      <span className="truncate max-w-[80px]">
                        {o.origin_city || o.origin_country || "—"}
                      </span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex items-center gap-1.5">
                      <CountryFlag country={o.dest_country} className="w-4 h-3" />
                      <span className="truncate max-w-[80px]">
                        {o.dest_city || o.dest_country || "—"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {fmtDate(o.load_date_from)} → {fmtDate(o.unload_date_from)}
                    </span>
                    {o.pricing_mode === "fixed" && o.price_amount != null && (
                      <span className="font-medium text-foreground">
                        {fmtCurrency(o.price_amount, o.currency || "EUR")}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)} of{" "}
                {totalCount}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  {currentPage}/{totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[70px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}
    </div>
  );
}
