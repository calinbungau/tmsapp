"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search, 
  Filter, 
  Calendar, 
  User, 
  FileText,
  ChevronRight,
  X,
  ClipboardList,
  Car,
  AlertTriangle,
  Users,
  Download,
  UserX
} from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useTranslation } from "@/components/i18n/i18n-provider";
import type { FormSubmission, FormTemplate, Driver, Vehicle } from "@/lib/types";
import { FORM_FREQUENCY_LABELS } from "@/lib/types";

interface OtherDriverUsage {
  driverName: string;
  formName: string;
}

interface SubmissionWithDetails extends FormSubmission {
  form_template: FormTemplate;
  driver: Driver;
  vehicle?: Vehicle;
  sharedVehicle?: boolean;
  otherDriverUsages?: OtherDriverUsage[];
}

export default function AdminSubmissionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session: adminSession } = useAdminSession();
  const { t } = useTranslation();
  
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [formTemplates, setFormTemplates] = useState<FormTemplate[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDriver, setSelectedDriver] = useState<string>(searchParams.get("driver") || "all");
  const [selectedForm, setSelectedForm] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedFrequency, setSelectedFrequency] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showSharedVehiclesOnly, setShowSharedVehiclesOnly] = useState(false);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [missingSubmissions, setMissingSubmissions] = useState<{
    driver: Driver;
    form: FormTemplate;
    periodStart: Date;
    periodLabel: string;
  }[]>([]);

  useEffect(() => {
    if (adminSession?.id) {
      fetchData();
    }
  }, [adminSession?.id]);

  const fetchData = async () => {
    if (!adminSession?.id) return;
    
    setLoading(true);
    const supabase = createClient();

    // Fetch submissions with related data
    const { data: submissionsData, error: submissionsError } = await supabase
      .from("form_submissions")
      .select(`
        *,
        form_template:form_templates(*),
        driver:drivers(*),
        vehicle:vehicles(*)
      `)
      .eq("admin_id", adminSession.id)
      .order("created_at", { ascending: false })
      .limit(500);

    if (!submissionsError && submissionsData) {
      // Process submissions to detect shared vehicles on same day (across ALL forms)
      const processedSubmissions = (submissionsData as SubmissionWithDetails[]).map((sub) => {
        if (!sub.vehicle_id) return sub;
        
        const subDate = new Date(sub.created_at).toDateString();
        // Find ALL submissions with the same vehicle on the same day by OTHER drivers
        const sameVehicleSameDay = submissionsData.filter((other) => 
          other.vehicle_id === sub.vehicle_id &&
          new Date(other.created_at).toDateString() === subDate &&
          other.driver_id !== sub.driver_id
        );
        
        if (sameVehicleSameDay.length > 0) {
          // Get unique driver + form combinations
          const otherDriverUsages: OtherDriverUsage[] = [];
          const seenCombos = new Set<string>();
          
          for (const s of sameVehicleSameDay) {
            const combo = `${s.driver_id}-${s.form_template_id}`;
            if (!seenCombos.has(combo) && s.driver?.name && s.form_template?.name) {
              seenCombos.add(combo);
              otherDriverUsages.push({
                driverName: s.driver.name,
                formName: s.form_template.name,
              });
            }
          }
          
          return {
            ...sub,
            sharedVehicle: true,
            otherDriverUsages,
          };
        }
        return sub;
      });
      
      setSubmissions(processedSubmissions);
    }

// Fetch drivers for filter
    const { data: driversData } = await supabase
      .from("drivers")
      .select("*")
      .eq("admin_id", adminSession.id)
      .order("name");
  
    if (driversData) {
      setDrivers(driversData);
    }

    // Fetch form templates for filter
    const { data: templatesData } = await supabase
      .from("form_templates")
      .select("*")
      .eq("admin_id", adminSession.id)
      .order("name");

    if (templatesData) {
      setFormTemplates(templatesData);
    }

    // Fetch vehicles for filter
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select("*")
      .eq("admin_id", adminSession.id)
      .order("plate_number");

    if (vehiclesData) {
      setVehicles(vehiclesData);
    }

    // Calculate missing submissions for required forms (daily, weekly, monthly)
    if (driversData && templatesData && submissionsData) {
      const activeDrivers = driversData.filter((d) => d.is_active);
      const requiredForms = templatesData.filter((f) => 
        f.frequency === "daily" || f.frequency === "weekly" || f.frequency === "monthly"
      );
      
      const now = new Date();
      const missing: typeof missingSubmissions = [];
      
      for (const form of requiredForms) {
        let periodStart: Date;
        let periodLabel: string;
        
        if (form.frequency === "daily") {
          periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          periodLabel = "Today";
        } else if (form.frequency === "weekly") {
          // Start of current week (Monday)
          const dayOfWeek = now.getDay();
          const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
          periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
          periodLabel = "This week";
        } else {
          // Start of current month
          periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
          periodLabel = "This month";
        }
        
        for (const driver of activeDrivers) {
          // Check if driver has a completed submission for this form in the period
          const hasSubmission = submissionsData.some((sub) => 
            sub.driver_id === driver.id &&
            sub.form_template_id === form.id &&
            sub.status === "completed" &&
            new Date(sub.created_at) >= periodStart
          );
          
          if (!hasSubmission) {
            missing.push({
              driver,
              form,
              periodStart,
              periodLabel,
            });
          }
        }
      }
      
      setMissingSubmissions(missing);
    }

    setLoading(false);
  };

  const filteredSubmissions = submissions.filter((submission) => {
    // Search term filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesDriver = submission.driver?.name?.toLowerCase().includes(search);
      const matchesForm = submission.form_template?.name?.toLowerCase().includes(search);
      if (!matchesDriver && !matchesForm) return false;
    }

    // Driver filter
    if (selectedDriver !== "all" && submission.driver_id !== selectedDriver) {
      return false;
    }

    // Form filter
    if (selectedForm !== "all" && submission.form_template_id !== selectedForm) {
      return false;
    }

    // Status filter
    if (selectedStatus !== "all" && submission.status !== selectedStatus) {
      return false;
    }

    // Frequency filter
    if (selectedFrequency !== "all" && submission.form_template?.frequency !== selectedFrequency) {
      return false;
    }

    // Vehicle filter
    if (selectedVehicle !== "all" && submission.vehicle_id !== selectedVehicle) {
      return false;
    }

    // Date range filter
    if (dateFrom) {
      const submissionDate = new Date(submission.created_at).toISOString().split("T")[0];
      if (submissionDate < dateFrom) return false;
    }
    if (dateTo) {
      const submissionDate = new Date(submission.created_at).toISOString().split("T")[0];
      if (submissionDate > dateTo) return false;
    }

    // Shared vehicle filter
    if (showSharedVehiclesOnly && !submission.sharedVehicle) {
      return false;
    }

    return true;
  });

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedDriver("all");
    setSelectedForm("all");
    setSelectedStatus("all");
    setSelectedFrequency("all");
    setSelectedVehicle("all");
    setDateFrom("");
    setDateTo("");
    setShowSharedVehiclesOnly(false);
    setShowMissingOnly(false);
  };

  const hasActiveFilters = searchTerm || selectedDriver !== "all" || selectedForm !== "all" || 
    selectedStatus !== "all" || selectedFrequency !== "all" || selectedVehicle !== "all" || 
    dateFrom || dateTo || showSharedVehiclesOnly;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    return status === "completed" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400";
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

  const exportToExcel = () => {
    // Create CSV string with proper escaping
    const escapeCSV = (value: string) => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    // SECTION 1: Completed Submissions
    const submissionsHeaders = [
      "Date",
      "Time",
      "Driver",
      "Form",
      "Frequency",
      "Status",
      "Vehicle",
      "Shared Vehicle",
      "Other Drivers",
    ];

    const submissionsRows = filteredSubmissions.map((submission) => {
      const date = new Date(submission.created_at);
      const otherDrivers = submission.otherDriverUsages
        ?.map((u) => `${u.driverName} (${u.formName})`)
        .join("; ") || "";
      
      return [
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        submission.driver?.name || "",
        submission.form_template?.name || "",
        FORM_FREQUENCY_LABELS[submission.form_template?.frequency as keyof typeof FORM_FREQUENCY_LABELS] || "",
        submission.status,
        submission.vehicle?.plate_number || "",
        submission.sharedVehicle ? "Yes" : "No",
        otherDrivers,
      ];
    });

    // SECTION 2: Missing Submissions
    const missingHeaders = [
      "Driver",
      "Form",
      "Frequency",
      "Period",
      "Status",
    ];

    const missingRows = missingSubmissions.map((missing) => {
      return [
        missing.driver.name,
        missing.form.name,
        FORM_FREQUENCY_LABELS[missing.form.frequency as keyof typeof FORM_FREQUENCY_LABELS] || "",
        missing.periodLabel,
        "NOT COMPLETED",
      ];
    });

    // Combine both sections with a separator
    const csvLines = [
      "=== FORM SUBMISSIONS ===",
      "",
      submissionsHeaders.map(escapeCSV).join(","),
      ...submissionsRows.map((row) => row.map(escapeCSV).join(",")),
      "",
      "",
      "=== MISSING SUBMISSIONS (Drivers who have not completed required forms) ===",
      "",
      missingHeaders.map(escapeCSV).join(","),
      ...missingRows.map((row) => row.map(escapeCSV).join(",")),
    ];

    const csvContent = csvLines.join("\n");

    // Add BOM for Excel to recognize UTF-8
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `form-submissions-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Group submissions by date
  const groupedSubmissions = filteredSubmissions.reduce((acc, submission) => {
    const date = new Date(submission.created_at).toLocaleDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(submission);
    return acc;
  }, {} as Record<string, SubmissionWithDetails[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("forms.title")}</h1>
          <p className="text-muted-foreground">
            {t("forms.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {filteredSubmissions.length} {filteredSubmissions.length !== 1 ? t("forms.submissionsCount") : t("forms.submissionCount")}
          </Badge>
          {(adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["forms:types:manage"]) && (
            <Button 
              variant="outline" 
              className="bg-transparent"
              onClick={() => router.push("/admin/form-types")}
            >
              <ClipboardList className="h-4 w-4 mr-2" />
              {t("forms.formTypes")}
            </Button>
          )}
          {(adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["forms:export"]) && (
            <Button 
              variant="outline" 
              className="bg-transparent"
              onClick={exportToExcel}
              disabled={filteredSubmissions.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              {t("forms.export")}
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("forms.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button 
            variant={showMissingOnly ? "default" : "outline"} 
            className={showMissingOnly ? "" : "bg-transparent"}
            onClick={() => {
              setShowMissingOnly(!showMissingOnly);
              if (!showMissingOnly) setShowSharedVehiclesOnly(false);
            }}
          >
            <UserX className="h-4 w-4 mr-2" />
            {t("forms.missing")}
            {missingSubmissions.length > 0 && (
              <Badge className="ml-2 bg-red-500/20 text-red-400">{missingSubmissions.length}</Badge>
            )}
          </Button>
          <Button 
            variant={showSharedVehiclesOnly ? "default" : "outline"} 
            className={showSharedVehiclesOnly ? "" : "bg-transparent"}
            onClick={() => {
              setShowSharedVehiclesOnly(!showSharedVehiclesOnly);
              if (!showSharedVehiclesOnly) setShowMissingOnly(false);
            }}
          >
            <Users className="h-4 w-4 mr-2" />
            {t("forms.sharedVehicles")}
            {showSharedVehiclesOnly && (
              <Badge className="ml-2 bg-yellow-500/20 text-yellow-400">{t("forms.on")}</Badge>
            )}
          </Button>
          <Button 
            variant="outline" 
            className="bg-transparent"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            {t("forms.filters")}
            {hasActiveFilters && (
              <Badge className="ml-2 bg-primary text-primary-foreground">{t("forms.active")}</Badge>
            )}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters}>
              <X className="h-4 w-4 mr-2" />
              {t("forms.clear")}
            </Button>
          )}
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label>{t("forms.driver")}</Label>
                  <SearchableSelect
                    value={selectedDriver}
                    onValueChange={setSelectedDriver}
                    placeholder={t("forms.allDrivers")}
                    searchPlaceholder={t("forms.searchDrivers")}
                    emptyText={t("forms.noDriverFound")}
                    options={[
                      { value: "all", label: t("forms.allDrivers") },
                      ...drivers.map((driver) => ({
                        value: driver.id,
                        label: driver.name,
                        sublabel: driver.email || undefined,
                      })),
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t("forms.form")}</Label>
                  <Select value={selectedForm} onValueChange={setSelectedForm}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("forms.allForms")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("forms.allForms")}</SelectItem>
                      {formTemplates.map((form) => (
                        <SelectItem key={form.id} value={form.id}>
                          {form.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("forms.status")}</Label>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("forms.allStatuses")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("forms.allStatuses")}</SelectItem>
                      <SelectItem value="completed">{t("forms.completed")}</SelectItem>
                      <SelectItem value="in_progress">{t("forms.inProgress")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("forms.frequency")}</Label>
                  <Select value={selectedFrequency} onValueChange={setSelectedFrequency}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("forms.allTypes")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("forms.allTypes")}</SelectItem>
                      <SelectItem value="daily">{t("forms.daily")}</SelectItem>
                      <SelectItem value="weekly">{t("forms.weekly")}</SelectItem>
                      <SelectItem value="monthly">{t("forms.monthly")}</SelectItem>
                      <SelectItem value="on_demand">{t("forms.onDemand")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("forms.vehicle")}</Label>
                  <SearchableSelect
                    value={selectedVehicle}
                    onValueChange={setSelectedVehicle}
                    placeholder={t("forms.allVehicles")}
                    searchPlaceholder={t("forms.searchVehicles")}
                    emptyText={t("forms.noVehicleFound")}
                    options={[
                      { value: "all", label: t("forms.allVehicles") },
                      ...vehicles.map((vehicle) => ({
                        value: vehicle.id,
                        label: vehicle.plate_number,
                        sublabel: vehicle.model || undefined,
                      })),
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t("forms.fromDate")}</Label>
                  <Input 
                    type="date" 
                    value={dateFrom} 
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t("forms.toDate")}</Label>
                  <Input 
                    type="date" 
                    value={dateTo} 
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Missing Submissions View */}
      {showMissingOnly ? (
        loading ? (
          <div className="text-center py-8 text-muted-foreground">{t("forms.loading")}</div>
        ) : missingSubmissions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <p className="text-green-500 font-medium">{t("forms.allUpToDate")}</p>
              <p className="text-muted-foreground text-sm mt-1">
                {t("forms.allUpToDateDesc")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Group by form */}
            {formTemplates
              .filter((f) => f.frequency === "daily" || f.frequency === "weekly" || f.frequency === "monthly")
              .map((form) => {
                const formMissing = missingSubmissions.filter((m) => m.form.id === form.id);
                if (formMissing.length === 0) return null;
                
                const periodLabel = formMissing[0]?.periodLabel || "";
                
                return (
                  <div key={form.id}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {form.name}
                      <Badge className={getFrequencyColor(form.frequency)}>
                        {FORM_FREQUENCY_LABELS[form.frequency as keyof typeof FORM_FREQUENCY_LABELS]}
                      </Badge>
                      <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
                        {formMissing.length} {t("forms.missingLabel")} {periodLabel.toLowerCase()}
                      </Badge>
                    </h3>
                    <div className="grid gap-2">
                      {formMissing.map((missing) => (
                        <Card key={`${missing.form.id}-${missing.driver.id}`} className="border-red-500/20">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20">
                                <UserX className="h-5 w-5 text-red-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium">{missing.driver.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {t("forms.hasNotCompleted")} <span className="text-red-400">{missing.form.name}</span> {missing.periodLabel.toLowerCase()}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-red-400">
                                {t("forms.missing")}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )
      ) : (
      /* Regular Submissions List */
      loading ? (
        <div className="text-center py-8 text-muted-foreground">{t("forms.loadingSubmissions")}</div>
      ) : filteredSubmissions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {hasActiveFilters 
                ? t("forms.noMatchFilters")
                : t("forms.noneYet")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedSubmissions).map(([date, dateSubmissions]) => {
            const sharedCount = dateSubmissions.filter((s) => s.sharedVehicle).length;
            return (
            <div key={date}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {date}
                <Badge variant="outline" className="ml-2">{dateSubmissions.length}</Badge>
                {sharedCount > 0 && (
                  <Badge className="bg-yellow-500/20 text-yellow-400 ml-1">
                    <Users className="h-3 w-3 mr-1" />
                    {sharedCount} {t("forms.shared")}
                  </Badge>
                )}
              </h3>
              <div className="space-y-2">
                {dateSubmissions.map((submission) => (
                  <Card 
                    key={submission.id}
                    className={`hover:shadow-md transition-shadow cursor-pointer ${
                      submission.sharedVehicle ? "ring-2 ring-yellow-500/50" : ""
                    }`}
                    onClick={() => router.push(`/admin/forms/${submission.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                            submission.sharedVehicle ? "bg-yellow-500/20" : "bg-primary/20"
                          }`}>
                            {submission.sharedVehicle ? (
                              <AlertTriangle className="h-5 w-5 text-yellow-400" />
                            ) : (
                              <FileText className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{submission.form_template?.name}</span>
                              <Badge className={getFrequencyColor(submission.form_template?.frequency || "")}>
                                {FORM_FREQUENCY_LABELS[submission.form_template?.frequency as keyof typeof FORM_FREQUENCY_LABELS] || submission.form_template?.frequency}
                              </Badge>
                              <Badge className={getStatusColor(submission.status)}>
                                {submission.status === "completed" ? t("forms.completed") : t("forms.inProgress")}
                              </Badge>
                              {submission.sharedVehicle && (
                                <Badge className="bg-yellow-500/20 text-yellow-400">
                                  {t("forms.sharedVehicle")}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
                              <User className="h-3 w-3" />
                              <span>{submission.driver?.name}</span>
                              {submission.vehicle && (
                                <>
                                  <span>•</span>
                                  <Car className="h-3 w-3" />
                                  <span>{submission.vehicle.plate_number}</span>
                                </>
                              )}
                              <span>•</span>
                              <span>{new Date(submission.created_at).toLocaleTimeString()}</span>
                            </div>
                            {submission.sharedVehicle && submission.otherDriverUsages && submission.otherDriverUsages.length > 0 && (
                              <div className="text-xs text-yellow-400 mt-1">
                                {t("forms.alsoUsedBy")} {submission.otherDriverUsages.map((u, i) => (
                                  <span key={i}>
                                    {i > 0 && ", "}
                                    <span className="font-medium">{u.driverName}</span>
                                    <span className="text-yellow-400/70"> ({u.formName})</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
          })}
        </div>
      )
      )}
    </div>
  );
}
