"use client";

import { useParams } from "next/navigation";
import { OfferDetailView } from "@/components/exchange/offer-detail-view";

export default function CarrierPortalPage() {
  const params = useParams();
  const token = String(params.token);
  return <OfferDetailView token={token} />;
}
