"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, Inbox, ArrowRight, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getStoredCarrierSession } from "@/hooks/use-carrier-session";

interface OfferRow {
  id: string;
  token: string;
  response: string | null;
  responded_at: string | null;
  quote_amount: number | null;
  quote_currency: string | null;
  offer: {
    id: string;
    reference: string;
    title: string | null;
    origin_city: string | null;
    origin_country: string | null;
    dest_city: string | null;
    dest_country: string | null;
  } | null;
}

const responseStyles: Record<string, string> = {
  interested: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  quoted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  declined: "bg-muted text-muted-foreground",
};

export default function CarrierResponsesPage() {
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
      if (res.ok) setOffers((data.offers || []).filter((o: OfferRow) => o.response));
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

  return (
    <div className="p-4 max-w-md mx-auto space-y-3">
      <h1 className="text-lg font-semibold pt-1">My responses</h1>

      {offers.length === 0 ? (
        <Card className="p-8 text-center">
          <Inbox className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium">No responses yet</p>
          <p className="text-xs text-muted-foreground mt-1 text-pretty">
            Open an offer to express interest, send a quote, or decline.
          </p>
        </Card>
      ) : (
        offers.map((row) => {
          const o = row.offer;
          if (!o) return null;
          return (
            <Link key={row.id} href={`/exchange/o/${row.token}`}>
              <Card className="p-4 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-mono">{o.reference}</p>
                    <p className="text-sm font-medium truncate">{o.title || "Freight offer"}</p>
                  </div>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      responseStyles[row.response || ""] || "bg-muted text-muted-foreground"
                    }`}
                  >
                    {row.response}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{o.origin_city || o.origin_country || "—"}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{o.dest_city || o.dest_country || "—"}</span>
                </div>
                {row.response === "quoted" && row.quote_amount != null && (
                  <p className="mt-2 text-sm font-medium">
                    Your quote: {row.quote_amount} {row.quote_currency || "EUR"}
                  </p>
                )}
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
