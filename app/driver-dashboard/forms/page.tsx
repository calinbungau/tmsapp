"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, Clock, ChevronRight, ClipboardList, Car, FileText, Calendar } from "lucide-react";
import type { FormTemplate } from "@/lib/types";

interface DriverSession {
  id: string;
  name: string;
  pin_code: string;
  admin_id: string;
}

interface FormWithStatus extends FormTemplate {
  isCompleted: boolean;
  lastSubmission?: {
    id: string;
    vehiclePlate?: string;
    completedAt: string;
  };
}

interface SubmissionHistory {
  id: string;
  form_template_id: string;
  form_name: string;
  vehicle_plate: string;
  created_at: string;
  status: string;
}

export default function DriverFormsPage() {
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [forms, setForms] = useState<FormWithStatus[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const session = localStorage.getItem("driver_session");
    if (!session) {
      router.push("/driver");
      return;
    }
    const driverData = JSON.parse(session);
    setDriver(driverData);
    fetchData(driverData);
  }, [router]);

  const fetchData = async (driverData: DriverSession) => {
    const supabase = createClient();
    
    // Fetch all active forms for this admin
    const { data: formsData } = await supabase
      .from("form_templates")
      .select("*, questions:form_questions(*)")
      .eq("admin_id", driverData.admin_id)
      .eq("is_active", true)
      .order("frequency")
      .order("name");

    // Fetch recent submissions for this driver (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: submissionsData } = await supabase
      .from("form_submissions")
      .select(`
        id, 
        form_template_id, 
        status, 
        created_at,
        form_templates:form_template_id(name),
        vehicles:vehicle_id(plate_number)
      `)
      .eq("driver_id", driverData.id)
      .eq("status", "completed")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    if (formsData) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const formsWithStatus: FormWithStatus[] = formsData.map((form) => {
        // Find the most recent submission for this form
        const recentSubmission = submissionsData?.find((s) => s.form_template_id === form.id);
        
        // Check completion based on frequency
        let isCompleted = false;
        if (form.frequency === "daily") {
          const todaySubmission = submissionsData?.find(
            (s) => s.form_template_id === form.id && new Date(s.created_at) >= today
          );
          isCompleted = !!todaySubmission;
        } else if (form.frequency === "weekly") {
          const weekStart = new Date();
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          weekStart.setHours(0, 0, 0, 0);
          isCompleted = submissionsData?.some(
            (s) => s.form_template_id === form.id && new Date(s.created_at) >= weekStart
          ) || false;
        } else if (form.frequency === "monthly") {
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);
          isCompleted = submissionsData?.some(
            (s) => s.form_template_id === form.id && new Date(s.created_at) >= monthStart
          ) || false;
        }

        return {
          ...form,
          isCompleted,
          lastSubmission: recentSubmission ? {
            id: recentSubmission.id,
            vehiclePlate: (recentSubmission.vehicles as { plate_number?: string })?.plate_number,
            completedAt: recentSubmission.created_at,
          } : undefined,
        };
      });

      setForms(formsWithStatus);
    }

    if (submissionsData) {
      const history: SubmissionHistory[] = submissionsData.map((s) => ({
        id: s.id,
        form_template_id: s.form_template_id,
        form_name: (s.form_templates as { name?: string })?.name || "Unknown Form",
        vehicle_plate: (s.vehicles as { plate_number?: string })?.plate_number || "N/A",
        created_at: s.created_at,
        status: s.status,
      }));
      setSubmissions(history);
    }

    setLoading(false);
  };

  const handleSelectForm = (form: FormWithStatus) => {
    localStorage.setItem("selected_form", JSON.stringify({
      id: form.id,
      name: form.name,
      frequency: form.frequency,
      isRedo: form.isCompleted,
    }));
    router.push("/select-vehicle");
  };

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case "daily": return "Daily";
      case "weekly": return "Weekly";
      case "monthly": return "Monthly";
      case "on_demand": return "On Demand";
      default: return frequency;
    }
  };

  const getFrequencyColor = (frequency: string) => {
    switch (frequency) {
      case "daily": return "bg-blue-500/20 text-blue-400";
      case "weekly": return "bg-purple-500/20 text-purple-400";
      case "monthly": return "bg-orange-500/20 text-orange-400";
      case "on_demand": return "bg-primary/20 text-primary";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <Tabs defaultValue="available" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="available">Available</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="space-y-4">
          {forms.length > 0 ? (
            forms.map((form) => (
              <Card 
                key={form.id}
                className="cursor-pointer transition-all hover:ring-2 hover:ring-primary"
                onClick={() => handleSelectForm(form)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      form.isCompleted ? "bg-green-500/20" : "bg-primary/20"
                    }`}>
                      {form.isCompleted ? (
                        <CheckCircle className="h-5 w-5 text-green-400" />
                      ) : (
                        <FileText className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{form.name}</p>
                        <Badge className={getFrequencyColor(form.frequency)}>
                          {getFrequencyLabel(form.frequency)}
                        </Badge>
                        {form.isCompleted && form.frequency !== "on_demand" && (
                          <Badge className="bg-green-500/20 text-green-400">
                            Done
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {form.questions?.length || 0} questions
                        {form.lastSubmission && (
                          <span className="ml-2">
                            - Last: {formatDate(form.lastSubmission.completedAt)}
                          </span>
                        )}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No forms available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {submissions.length > 0 ? (
            submissions.map((submission) => (
              <Card key={submission.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/20">
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{submission.form_name}</p>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Car className="h-3 w-3" />
                        <span>{submission.vehicle_plate}</span>
                        <span>-</span>
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(submission.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No submissions yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
