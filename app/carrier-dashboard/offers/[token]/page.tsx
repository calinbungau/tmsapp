"use client";

import { useParams, useRouter } from "next/navigation";
import { OfferDetailView } from "@/components/exchange/offer-detail-view";

export default function CarrierDashboardOfferPage() {
  const params = useParams();
  const router = useRouter();
  const token = String(params.token);

  return (
    <OfferDetailView
      token={token}
      embedded
      onBack={() => router.push("/carrier-dashboard")}
    />
  );
}
