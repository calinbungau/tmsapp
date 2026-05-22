"use client";

import React from "react"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  FileText,
  Calendar,
  CalendarDays,
  CalendarRange,
  Zap,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import type { FormTemplate, FormSubmission, FormFrequency, Language } from "@/lib/types";
import { FORM_FREQUENCY_LABELS } from "@/lib/types";

interface DriverSession {
  id: string;
  name: string;
  pin_code: string;
  admin_id: string;
}

interface FormWithStatus extends FormTemplate {
  isCompleted: boolean;
  lastSubmission: FormSubmission | null;
}

const FREQUENCY_ICONS: Record<FormFrequency, React.ReactNode> = {
  daily: <Calendar className="h-4 w-4" />,
  weekly: <CalendarDays className="h-4 w-4" />,
  monthly: <CalendarRange className="h-4 w-4" />,
  on_demand: <Zap className="h-4 w-4" />,
};

export default function DriverFormsPage() {
  const router = useRouter();
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [forms, setForms] = useState<FormWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = localStorage.getItem("driver_session");
    if (!session) {
      router.push("/driver");
      return;
    }

    const driverData = JSON.parse(session);
    setDriver(driverData);

    fetchForms(driverData);
  }, [router]);

  const fetchForms = async (driverData: DriverSession) => {
    const supabase = createClient();

    // Fetch active forms for this admin
    const { data: formsData } = await supabase
      .from("form_templates")
      .select("*")
      .eq("admin_id", driverData.admin_id)
      .eq("is_active", true)
      .order("frequency");

    if (!formsData) {
      setLoading(false);
      return;
    }

    // Fetch today's submissions for this driver
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: submissionsData } = await supabase
      .from("form_submissions")
      .select("*")
      .eq("driver_id", driverData.id)
      .gte("created_at", today.toISOString())
      .eq("status", "completed");

    // Calculate completion status for each form
    const formsWithStatus: FormWithStatus[] = formsData.map((form) => {
      const formSubmissions = (submissionsData || []).filter(
        (s) => s.form_template_id === form.id
      );

      let isCompleted = false;
      const lastSubmission = formSubmissions[0] || null;

      if (form.frequency === "daily") {
        isCompleted = formSubmissions.length > 0;
      } else if (form.frequency === "weekly") {
        // Check if submitted this week
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        isCompleted = formSubmissions.some(
          (s) => new Date(s.created_at) >= weekStart
        );
      } else if (form.frequency === "monthly") {
        // Check if submitted this month
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        isCompleted = formSubmissions.some(
          (s) => new Date(s.created_at) >= monthStart
        );
      } else {
        // On-demand forms are never "required" to be completed
        isCompleted = true;
      }

      return {
        ...form,
        isCompleted,
        lastSubmission,
      };
    });

    setForms(formsWithStatus);
    setLoading(false);
  };

  const getStatusBadge = (form: FormWithStatus) => {
    if (form.frequency === "on_demand") {
      return (
        <Badge className="bg-primary/20 text-primary border-primary/30">
          <Zap className="h-3 w-3 mr-1" />
          Available
        </Badge>
      );
    }

    if (form.isCompleted) {
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    }

    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Required
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const requiredForms = forms.filter((f) => f.frequency !== "on_demand" && !f.isCompleted);
  const completedForms = forms.filter((f) => f.frequency !== "on_demand" && f.isCompleted);
  const onDemandForms = forms.filter((f) => f.frequency === "on_demand");

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={() => router.push("/select-vehicle")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Forms</h1>
            <p className="text-sm text-muted-foreground">Hello, {driver?.name}</p>
          </div>
        </div>

        {/* Required Forms */}
        {requiredForms.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Required ({requiredForms.length})
            </h2>
            <div className="space-y-3">
              {requiredForms.map((form) => (
                <Card
                  key={form.id}
                  className="cursor-pointer hover:shadow-md transition-all border-red-500/30"
                  onClick={() => router.push(`/forms/${form.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
                          <FileText className="h-5 w-5 text-red-400" />
                        </div>
                        <div>
                          <p className="font-medium">{form.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {FORM_FREQUENCY_LABELS[form.frequency]}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Completed Forms */}
        {completedForms.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Completed ({completedForms.length})
            </h2>
            <div className="space-y-3">
              {completedForms.map((form) => (
                <Card
                  key={form.id}
                  className="cursor-pointer hover:shadow-md transition-all opacity-75"
                  onClick={() => router.push(`/forms/${form.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
                          <CheckCircle className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                          <p className="font-medium">{form.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {FORM_FREQUENCY_LABELS[form.frequency]} - Done
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* On-Demand Forms */}
        {onDemandForms.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              On Demand
            </h2>
            <div className="space-y-3">
              {onDemandForms.map((form) => (
                <Card
                  key={form.id}
                  className="cursor-pointer hover:shadow-md transition-all"
                  onClick={() => router.push(`/forms/${form.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{form.name}</p>
                          <p className="text-xs text-muted-foreground">{form.description}</p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {forms.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No forms available</h3>
              <p className="text-muted-foreground text-center">
                Your administrator has not created any forms yet.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
