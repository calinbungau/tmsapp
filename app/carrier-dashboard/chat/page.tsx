"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, MessageSquare, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getStoredCarrierSession } from "@/hooks/use-carrier-session";

interface OfferRow {
  id: string;
  token: string;
  offer: {
    id: string;
    reference: string;
    title: string | null;
    origin_city: string | null;
    dest_city: string | null;
  } | null;
}

export default function CarrierChatListPage() {
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

  return (
    <div className="p-4 max-w-md mx-auto space-y-3">
      <h1 className="text-lg font-semibold pt-1">Messages</h1>

      {offers.length === 0 ? (
        <Card className="p-8 text-center">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium">No conversations</p>
          <p className="text-xs text-muted-foreground mt-1 text-pretty">
            Open an offer to chat directly with the dispatcher.
          </p>
        </Card>
      ) : (
        offers.map((row) => {
          const o = row.offer;
          if (!o) return null;
          return (
            <Link key={row.id} href={`/carrier-dashboard/offers/${row.token}#chat`}>
              <Card className="p-4 flex items-center gap-3 hover:border-primary/40 transition-colors">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{o.title || "Freight offer"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {o.reference} · {o.origin_city || "—"} → {o.dest_city || "—"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
