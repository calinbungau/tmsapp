"use client";

import { useCarrierSession } from "@/hooks/use-carrier-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Building2, User, Phone, Mail, FileText, LogOut } from "lucide-react";
import { AppPromo } from "@/components/exchange/app-promo";
import { CarrierNotificationsPanel } from "@/components/carrier/carrier-notifications-panel";

export default function CarrierAccountPage() {
  const { session, loading, logout } = useCarrierSession();

  if (loading || !session) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rows = [
    { icon: Building2, label: "Company", value: session.company_name },
    { icon: User, label: "Contact", value: session.contact_name },
    { icon: Mail, label: "Email", value: session.email },
    { icon: Phone, label: "Phone", value: session.phone },
    { icon: FileText, label: "VAT number", value: session.vat_number },
  ].filter((r) => r.value);

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      <h1 className="text-lg font-semibold pt-1">Account</h1>

      <Card className="divide-y">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 p-4">
            <r.icon className="h-4.5 w-4.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{r.label}</p>
              <p className="text-sm font-medium truncate">{r.value}</p>
            </div>
          </div>
        ))}
      </Card>

      <CarrierNotificationsPanel carrierAccountId={session.id} />

      <AppPromo subtitle="Manage offers on the go with the BNG Tracking mobile app." />

      <Button variant="outline" className="w-full" onClick={logout}>
        <LogOut className="mr-2 h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
}
