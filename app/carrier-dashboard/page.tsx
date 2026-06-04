"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, Package, MapPin, Calendar, ArrowRight, Building2, Trophy, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStoredCarrierSession } from "@/hooks/use-carrier-session";

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

const responseStyles: Record<string, string> = {
  interested: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  quoted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  declined: "bg-muted text-muted-foreground",
};

export default function CarrierOffersPage() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const session = getStoredCarrierSession();
    if (!session) return;
    try {
      const res = await fetch("/api/carrier-portal/offers", {
        headers: { "x-carrier-id": session.id },
      });
      const data = await res.json();
      if (res.ok) setOffers(data.offers || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const active = offers.filter((o) => o.offer && o.offer.status !== "expired" && o.offer.status !== "closed");

  return (
    <div className="p-4 max-w-md mx-auto space-y-3">
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-lg font-semibold">Freight offers</h1>
        <Badge variant="secondary">{active.length} active</Badge>
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
        offers.map((row) => {
          const o = row.offer;
          if (!o) return null;
          const isWon = !!o.awarded_recipient_id && o.awarded_recipient_id === row.id;
          const isLost =
            row.dispatcher_decision === "declined" ||
            (!!o.awarded_recipient_id && o.awarded_recipient_id !== row.id);
          return (
            <Link key={row.id} href={`/exchange/o/${row.token}`}>
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
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                          responseStyles[row.response] || "bg-muted text-muted-foreground"
                        }`}
                      >
                        {row.response}
                      </span>
                    )
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {o.origin_city || o.origin_country || "—"}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{o.dest_city || o.dest_country || "—"}</span>
                </div>

                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {fmtDate(o.load_date_from)} → {fmtDate(o.unload_date_from)}
                  </span>
                  {o.pricing_mode === "fixed" && o.price_amount != null && (
                    <span className="font-medium text-foreground">
                      {o.price_amount} {o.currency || "EUR"}
                    </span>
                  )}
                </div>
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
