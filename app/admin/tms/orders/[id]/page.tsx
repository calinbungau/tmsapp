"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useTranslation } from "@/components/i18n/i18n-provider";
import OrderDetailPanel from "@/components/tms/order-detail-panel";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function OrderByIdPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session: adminSession } = useAdminSession();
  const { t } = useTranslation();
  const orderId = params.id as string;
  const editTripId = searchParams.get("editTrip");
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrder = useCallback(async () => {
    if (!adminSession?.id || !orderId) return;
    const supabase = createClient();
    setLoading(true);
    // commercial_role and order_type are needed so the back button can
    // route back to the correct workspace (Forwarder Board for
    // subcontract FWDs, generic Orders list for everything else).
    const { data, error } = await supabase
      .from("orders")
      .select("id, reference_number, status, admin_id, commercial_role, order_type")
      .eq("id", orderId)
      .eq("admin_id", adminSession.id)
      .single();
    if (error || !data) { setLoading(false); return; }
    setOrder(data);
    setLoading(false);
  }, [adminSession?.id, orderId]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  // Realtime: update when order changes
  useEffect(() => {
    if (!orderId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`order-page-${orderId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, () => {
        fetchOrder();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_stops", filter: `order_id=eq.${orderId}` }, () => {
        // The detail panel will re-fetch internally, but this triggers a re-render
        fetchOrder();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, fetchOrder]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] gap-4">
        <p className="text-muted-foreground">{t("tms.orderDetail.notFound")}</p>
        <Button variant="outline" className="bg-transparent" onClick={() => router.push("/admin/tms/orders")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("tms.orderDetail.backToOrders")}
        </Button>
      </div>
    );
  }

  // The back-button destination depends on the order's commercial role.
  // Subcontract orders (i.e. FWD orders we sent to a carrier on behalf
  // of a customer order) belong to the Forwarder Board workflow, so the
  // operator expects to return there. All other orders return to the
  // generic Orders list. We also treat any order_type === 'forwarding'
  // as belonging to the Forwarder Board, even if the commercial_role
  // happens to be null on legacy rows.
  const isSubcontract =
    order.commercial_role === "subcontract" || order.order_type === "forwarding";
  const backHref = isSubcontract ? "/admin/tms/forwarding" : "/admin/tms/orders";

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      {/* Full-width detail panel - back button moved inside panel */}
      <div className="flex-1 overflow-hidden">
        <OrderDetailPanel
          key={order.id}
          orderId={order.id}
          editTripId={editTripId || undefined}
          onClose={() => router.push(backHref)}
          onStatusChange={() => { fetchOrder(); }}
          showBackButton
        />
      </div>
    </div>
  );
}
