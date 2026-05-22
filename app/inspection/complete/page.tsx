"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { translations, type Language } from "@/lib/types";

export default function InspectionCompletePage() {
  const router = useRouter();
  const [driverName, setDriverName] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const t = translations[language];

  useEffect(() => {
    const session = localStorage.getItem("driver_session");
    const lang = localStorage.getItem("driver_language") as Language;
    if (session) {
      const driver = JSON.parse(session);
      setDriverName(driver.name);
    }
    if (lang) {
      setLanguage(lang);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("driver_session");
    localStorage.removeItem("driver_language");
    localStorage.removeItem("current_inspection");
    router.push("/driver");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-12 text-center space-y-6">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{t.inspectionComplete}</h1>
            <p className="text-muted-foreground">
              {t.thankYou}{driverName ? `, ${driverName}` : ""}.
            </p>
          </div>

          <div className="space-y-2 pt-4">
            <Button variant="outline" className="w-full bg-transparent" onClick={handleLogout}>
              {t.logout}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
