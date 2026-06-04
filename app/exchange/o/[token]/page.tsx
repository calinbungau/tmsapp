"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { OfferDetailView } from "@/components/exchange/offer-detail-view";
import { getStoredCarrierSession } from "@/hooks/use-carrier-session";

export default function CarrierPortalPage() {
  const params = useParams();
  const router = useRouter();
  const token = String(params.token);

  // A logged-in carrier reaching this public link (e.g. via a notification tap
  // that the native shell routes through /event/[token] → here) should land
  // inside the full dashboard chrome — header, bottom navigation and a back
  // button — instead of this chrome-less standalone page. Forward them to the
  // embedded dashboard offer route. Anonymous visitors (the emailed magic link)
  // stay on this standalone portal with its PIN gate.
  const [checked, setChecked] = useState(false);
  const [forwarding, setForwarding] = useState(false);

  useEffect(() => {
    let isCarrier = false;
    try {
      isCarrier = !!getStoredCarrierSession()?.id;
    } catch {
      /* ignore storage access errors */
    }
    if (isCarrier) {
      setForwarding(true);
      router.replace(`/carrier-dashboard/offers/${token}`);
    } else {
      setChecked(true);
    }
  }, [token, router]);

  if (forwarding || !checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <OfferDetailView token={token} />;
}
