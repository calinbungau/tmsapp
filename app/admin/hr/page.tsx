"use client";

import React from "react";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Users,
  CalendarDays,
  FileText,
  Search,
  Loader2,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useTranslation } from "@/components/i18n/i18n-provider";

interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  start_half_day: string | null;
  end_half_day: string | null;
  total_days: number;
  reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  employee: { first_name: string; last_name: string; employee_type: string } | null;
  leave_type: { name: string; color: string; code: string } | null;
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_paid: boolean;
  requires_approval: boolean;
  requires_document: boolean;
  document_required_after_days: number | null;
  max_days_per_year: number | null;
  color: string;
  is_active: boolean;
  display_order: number;
}

interface LeavePolicy {
  id: string;
  name: string;
  base_annual_days: number;
  seniority_bonus_days: number | null;
  seniority_bonus_years: number | null;
  max_annual_days: number | null;
  carry_over_max_days: number | null;
  carry_over_expiry_months: number | null;
  probation_months: number | null;
  accrual_method: string;
  is_default: boolean;
  is_active: boolean;
}

interface PublicHoliday {
  id: string;
  name: string;
  date: string;
  year: number;
  is_recurring: boolean;
  country: string | null;
}

interface LeaveEntitlement {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  total_entitled_days: number;
  carried_over_days: number;
  used_days: number;
  pending_days: number;
  employee: { first_name: string; last_name: string } | null;
  leave_type: { name: string; color: string } | null;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  hire_date: string | null;
  employee_type: string;
}

export default function HRDashboardPage() {
  const { session: adminSession } = useAdminSession();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("requests");
  const [loading, setLoading] = useState(true);

  // Leave requests
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [requestFilter, setRequestFilter] = useState("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewingRequest, setReviewingRequest] = useState<LeaveRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");

  // Leave types
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<LeaveType | null>(null);
  const [typeForm, setTypeForm] = useState({
    name: "", code: "", description: "", is_paid: true,
    requires_approval: true, requires_document: false,
    document_required_after_days: "", max_days_per_year: "",
    color: "#3b82f6", display_order: "0",
  });

  // Policies
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicy | null>(null);
  const [policyForm, setPolicyForm] = useState({
    name: "Default Policy", base_annual_days: "21",
    seniority_bonus_days: "1", seniority_bonus_years: "2",
    max_annual_days: "30", carry_over_max_days: "5",
    carry_over_expiry_months: "3", probation_months: "0",
    accrual_method: "yearly", is_default: false,
  });

  // Public holidays
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<PublicHoliday | null>(null);
  const [holidayForm, setHolidayForm] = useState({
    name: "", date: "", is_recurring: false, country: "",
  });

  // Entitlements
  const [entitlements, setEntitlements] = useState<LeaveEntitlement[]>([]);
  const [entitlementYear, setEntitlementYear] = useState(new Date().getFullYear());

  // Stats
  const [stats, setStats] = useState({
    pendingCount: 0, approvedThisMonth: 0,
    employeesOnLeaveToday: 0, totalEmployees: 0,
  });

  const fetchData = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const supabase = createClient();

    // Fetch leave requests
    const { data: reqData } = await supabase
      .from("leave_requests")
      .select("*, employee:employees(first_name, last_name, employee_type), leave_type:leave_types(name, color, code)")
      .eq("admin_id", adminSession.id)
      .order("created_at", { ascending: false });
    if (reqData) setRequests(reqData as LeaveRequest[]);

    // Fetch leave types
    const { data: typesData } = await supabase
      .from("leave_types")
      .select("*")
      .eq("admin_id", adminSession.id)
      .order("display_order");
    if (typesData) setLeaveTypes(typesData);

    // Fetch policies
    const { data: policiesData } = await supabase
      .from("leave_policies")
      .select("*")
      .eq("admin_id", adminSession.id)
      .order("name");
    if (policiesData) setPolicies(policiesData);

    // Fetch public holidays
    const { data: holidaysData } = await supabase
      .from("public_holidays")
      .select("*")
      .eq("admin_id", adminSession.id)
      .order("date", { ascending: true });
    if (holidaysData) setHolidays(holidaysData);

    // Fetch entitlements
    const { data: entData } = await supabase
      .from("leave_entitlements")
      .select("*, employee:employees(first_name, last_name), leave_type:leave_types(name, color)")
      .eq("admin_id", adminSession.id)
      .eq("year", entitlementYear)
      .order("employee_id");
    if (entData) setEntitlements(entData as LeaveEntitlement[]);

    // Calculate stats
    const today = new Date().toISOString().split("T")[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    const pending = reqData?.filter(r => r.status === "pending").length || 0;
    const approvedMonth = reqData?.filter(r => r.status === "approved" && r.reviewed_at && r.reviewed_at >= monthStart).length || 0;
    const onLeaveToday = reqData?.filter(r => r.status === "approved" && r.start_date <= today && r.end_date >= today).length || 0;

    const { count: empCount } = await supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", adminSession.id)
      .eq("status", "active");

    setStats({
      pendingCount: pending,
      approvedThisMonth: approvedMonth,
      employeesOnLeaveToday: onLeaveToday,
      totalEmployees: empCount || 0,
    });

    setLoading(false);
  }, [adminSession?.id, entitlementYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- Review leave request ---
  const openReview = (request: LeaveRequest, action: "approved" | "rejected") => {
    setReviewingRequest(request);
    setReviewAction(action);
    setReviewNotes("");
    setReviewDialogOpen(true);
  };

  const handleReview = async () => {
    if (!reviewingRequest || !adminSession) return;
    const supabase = createClient();

    await supabase.from("leave_requests").update({
      status: reviewAction,
      reviewed_by: adminSession.user_id || null,
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes || null,
      updated_at: new Date().toISOString(),
    }).eq("id", reviewingRequest.id);

    // Update entitlement if approved
    if (reviewAction === "approved") {
      const year = new Date(reviewingRequest.start_date).getFullYear();
      const { data: ent } = await supabase
        .from("leave_entitlements")
        .select("id, used_days, pending_days")
        .eq("employee_id", reviewingRequest.employee_id)
        .eq("leave_type_id", reviewingRequest.leave_type_id)
        .eq("year", year)
        .single();

      if (ent) {
        await supabase.from("leave_entitlements").update({
          used_days: Number(ent.used_days) + Number(reviewingRequest.total_days),
          pending_days: Math.max(0, Number(ent.pending_days) - Number(reviewingRequest.total_days)),
          updated_at: new Date().toISOString(),
        }).eq("id", ent.id);
      }
    } else {
      // If rejected, remove from pending
      const year = new Date(reviewingRequest.start_date).getFullYear();
      const { data: ent } = await supabase
        .from("leave_entitlements")
        .select("id, pending_days")
        .eq("employee_id", reviewingRequest.employee_id)
        .eq("leave_type_id", reviewingRequest.leave_type_id)
        .eq("year", year)
        .single();
      if (ent) {
        await supabase.from("leave_entitlements").update({
          pending_days: Math.max(0, Number(ent.pending_days) - Number(reviewingRequest.total_days)),
          updated_at: new Date().toISOString(),
        }).eq("id", ent.id);
      }
    }

    // Send push notification to driver
    try {
      // Find the driver linked to this employee
      const { data: driverRecord } = await supabase
        .from("drivers")
        .select("id")
        .eq("employee_id", reviewingRequest.employee_id)
        .single();

      if (driverRecord) {
        const leaveTypeName = reviewingRequest.leave_type?.name || "Leave";
        const startDate = new Date(reviewingRequest.start_date).toLocaleDateString();
        const endDate = new Date(reviewingRequest.end_date).toLocaleDateString();
        
        const notifTitle = reviewAction === "approved" 
          ? "Leave Request Approved" 
          : "Leave Request Rejected";
        const notifBody = reviewAction === "approved"
          ? `Your ${leaveTypeName} request (${startDate} - ${endDate}, ${reviewingRequest.total_days} days) has been approved.${reviewNotes ? ` Note: ${reviewNotes}` : ""}`
          : `Your ${leaveTypeName} request (${startDate} - ${endDate}, ${reviewingRequest.total_days} days) has been rejected.${reviewNotes ? ` Reason: ${reviewNotes}` : ""}`;

        await fetch("/api/notifications/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_id: adminSession.id,
            driver_id: driverRecord.id,
            title: notifTitle,
            body: notifBody,
            data: {
              type: "leave_request_update",
              request_id: reviewingRequest.id,
              status: reviewAction,
            },
          }),
        });
      }
    } catch (err) {
      console.error("Failed to send leave notification:", err);
    }

    setReviewDialogOpen(false);
    fetchData();
  };

  // --- Leave Type CRUD ---
  const resetTypeForm = () => {
    setTypeForm({ name: "", code: "", description: "", is_paid: true, requires_approval: true, requires_document: false, document_required_after_days: "", max_days_per_year: "", color: "#3b82f6", display_order: "0" });
    setEditingType(null);
  };

  const openTypeDialog = (type?: LeaveType) => {
    if (type) {
      setEditingType(type);
      setTypeForm({
        name: type.name, code: type.code, description: type.description || "",
        is_paid: type.is_paid, requires_approval: type.requires_approval,
        requires_document: type.requires_document,
        document_required_after_days: type.document_required_after_days?.toString() || "",
        max_days_per_year: type.max_days_per_year?.toString() || "",
        color: type.color, display_order: type.display_order.toString(),
      });
    } else { resetTypeForm(); }
    setTypeDialogOpen(true);
  };

  const saveType = async () => {
    const supabase = createClient();
    const data = {
      name: typeForm.name, code: typeForm.code, description: typeForm.description || null,
      is_paid: typeForm.is_paid, requires_approval: typeForm.requires_approval,
      requires_document: typeForm.requires_document,
      document_required_after_days: typeForm.document_required_after_days ? parseInt(typeForm.document_required_after_days) : null,
      max_days_per_year: typeForm.max_days_per_year ? parseInt(typeForm.max_days_per_year) : null,
      color: typeForm.color, display_order: parseInt(typeForm.display_order) || 0,
      admin_id: adminSession?.id,
    };
    if (editingType) {
      await supabase.from("leave_types").update({ ...data, updated_at: new Date().toISOString() }).eq("id", editingType.id);
    } else {
      await supabase.from("leave_types").insert(data);
    }
    setTypeDialogOpen(false);
    resetTypeForm();
    fetchData();
  };

  const deleteType = async (id: string) => {
    if (!confirm("Delete this leave type?")) return;
    const supabase = createClient();
    await supabase.from("leave_types").delete().eq("id", id);
    fetchData();
  };

  // --- Policy CRUD ---
  const resetPolicyForm = () => {
    setPolicyForm({ name: "Default Policy", base_annual_days: "21", seniority_bonus_days: "1", seniority_bonus_years: "2", max_annual_days: "30", carry_over_max_days: "5", carry_over_expiry_months: "3", probation_months: "0", accrual_method: "yearly", is_default: false });
    setEditingPolicy(null);
  };

  const openPolicyDialog = (policy?: LeavePolicy) => {
    if (policy) {
      setEditingPolicy(policy);
      setPolicyForm({
        name: policy.name, base_annual_days: policy.base_annual_days.toString(),
        seniority_bonus_days: policy.seniority_bonus_days?.toString() || "0",
        seniority_bonus_years: policy.seniority_bonus_years?.toString() || "0",
        max_annual_days: policy.max_annual_days?.toString() || "",
        carry_over_max_days: policy.carry_over_max_days?.toString() || "",
        carry_over_expiry_months: policy.carry_over_expiry_months?.toString() || "",
        probation_months: policy.probation_months?.toString() || "0",
        accrual_method: policy.accrual_method, is_default: policy.is_default,
      });
    } else { resetPolicyForm(); }
    setPolicyDialogOpen(true);
  };

  const savePolicy = async () => {
    const supabase = createClient();
    const data = {
      name: policyForm.name,
      base_annual_days: parseInt(policyForm.base_annual_days),
      seniority_bonus_days: parseInt(policyForm.seniority_bonus_days) || null,
      seniority_bonus_years: parseInt(policyForm.seniority_bonus_years) || null,
      max_annual_days: policyForm.max_annual_days ? parseInt(policyForm.max_annual_days) : null,
      carry_over_max_days: policyForm.carry_over_max_days ? parseInt(policyForm.carry_over_max_days) : null,
      carry_over_expiry_months: policyForm.carry_over_expiry_months ? parseInt(policyForm.carry_over_expiry_months) : null,
      probation_months: parseInt(policyForm.probation_months) || 0,
      accrual_method: policyForm.accrual_method,
      is_default: policyForm.is_default,
      admin_id: adminSession?.id,
    };
    if (editingPolicy) {
      await supabase.from("leave_policies").update({ ...data, updated_at: new Date().toISOString() }).eq("id", editingPolicy.id);
    } else {
      await supabase.from("leave_policies").insert(data);
    }
    setPolicyDialogOpen(false);
    resetPolicyForm();
    fetchData();
  };

  // --- Public Holiday CRUD ---
  const resetHolidayForm = () => {
    setHolidayForm({ name: "", date: "", is_recurring: false, country: "" });
    setEditingHoliday(null);
  };

  const openHolidayDialog = (holiday?: PublicHoliday) => {
    if (holiday) {
      setEditingHoliday(holiday);
      setHolidayForm({ name: holiday.name, date: holiday.date, is_recurring: holiday.is_recurring, country: holiday.country || "" });
    } else { resetHolidayForm(); }
    setHolidayDialogOpen(true);
  };

  const saveHoliday = async () => {
    const supabase = createClient();
    const data = {
      name: holidayForm.name, date: holidayForm.date,
      year: new Date(holidayForm.date).getFullYear(),
      is_recurring: holidayForm.is_recurring,
      country: holidayForm.country || null,
      admin_id: adminSession?.id,
    };
    if (editingHoliday) {
      await supabase.from("public_holidays").update(data).eq("id", editingHoliday.id);
    } else {
      await supabase.from("public_holidays").insert(data);
    }
    setHolidayDialogOpen(false);
    resetHolidayForm();
    fetchData();
  };

  const deleteHoliday = async (id: string) => {
    if (!confirm("Delete this holiday?")) return;
    const supabase = createClient();
    await supabase.from("public_holidays").delete().eq("id", id);
    fetchData();
  };

  // --- Generate entitlements for all employees ---
  const generateEntitlements = async () => {
    if (!adminSession?.id) return;
    const supabase = createClient();

    if (leaveTypes.length === 0) {
      alert("Please create leave types first (e.g., Annual Leave, Medical Leave, etc.) in the Leave Types tab.");
      return;
    }

    // Get default policy
    const defaultPolicy = policies.find(p => p.is_default) || policies[0];
    if (!defaultPolicy) { 
      alert("Please create a leave policy first in the Policies tab."); 
      return; 
    }

    // Get all active employees
    const { data: employees } = await supabase
      .from("employees")
      .select("id, hire_date")
      .eq("admin_id", adminSession.id)
      .eq("status", "active");

    if (!employees || employees.length === 0) {
      alert("No active employees found.");
      return;
    }

    const year = entitlementYear;
    let created = 0;

    for (const emp of employees) {
      for (const lt of leaveTypes) {
        // Check if already exists
        const { data: existing } = await supabase
          .from("leave_entitlements")
          .select("id")
          .eq("employee_id", emp.id)
          .eq("leave_type_id", lt.id)
          .eq("year", year)
          .single();

        if (existing) continue;

        // Calculate entitled days based on leave type
        let entitledDays = 0;

        if (lt.code === "annual" || lt.code === "vacation") {
          entitledDays = defaultPolicy.base_annual_days;
        } else if (lt.code === "medical" || lt.code === "sick") {
          entitledDays = lt.max_days_per_year || 15;
        } else if (lt.max_days_per_year) {
          entitledDays = lt.max_days_per_year;
        } else {
          entitledDays = 5; // Default for types without specific max
        }

        // Prorate annual/vacation for first-year employees
        if ((lt.code === "annual" || lt.code === "vacation") && emp.hire_date) {
          const hireDate = new Date(emp.hire_date);
          const hireYear = hireDate.getFullYear();

          if (hireYear === year) {
            const monthsRemaining = 12 - hireDate.getMonth();
            entitledDays = Math.round((entitledDays * monthsRemaining / 12) * 10) / 10;
          }

          // Seniority bonus
          if (defaultPolicy.seniority_bonus_days && defaultPolicy.seniority_bonus_years) {
            const yearsOfService = year - hireYear;
            const bonusMultiplier = Math.floor(yearsOfService / defaultPolicy.seniority_bonus_years);
            entitledDays += bonusMultiplier * defaultPolicy.seniority_bonus_days;
          }

          // Cap at max
          if (defaultPolicy.max_annual_days) {
            entitledDays = Math.min(entitledDays, defaultPolicy.max_annual_days);
          }
        }

        await supabase.from("leave_entitlements").insert({
          admin_id: adminSession.id,
          employee_id: emp.id,
          leave_type_id: lt.id,
          year,
          total_entitled_days: entitledDays,
          carried_over_days: 0,
          used_days: 0,
          pending_days: 0,
        });
        created++;
      }
    }

    fetchData();
    alert(`Generated ${created} entitlements for ${employees.length} employees across ${leaveTypes.length} leave types for ${year}.`);
  };

  // --- Filtered requests ---
  const filteredRequests = requests.filter(r => {
    const matchesStatus = requestFilter === "all" || r.status === requestFilter;
    const matchesSearch = !searchTerm || 
      `${r.employee?.first_name} ${r.employee?.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.leave_type?.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">{t("hr.pending")}</Badge>;
      case "approved": return <Badge className="bg-green-500/10 text-green-600 border-green-500/30">{t("hr.approved")}</Badge>;
      case "rejected": return <Badge className="bg-red-500/10 text-red-600 border-red-500/30">{t("hr.rejected")}</Badge>;
      case "cancelled": return <Badge className="bg-muted text-muted-foreground">{t("hr.cancelled")}</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("hr.title")}</h1>
        <p className="text-muted-foreground">{t("hr.subtitle")}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pendingCount}</p>
                <p className="text-xs text-muted-foreground">{t("hr.pendingRequests")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.approvedThisMonth}</p>
                <p className="text-xs text-muted-foreground">{t("hr.approvedThisMonth")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <CalendarDays className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.employeesOnLeaveToday}</p>
                <p className="text-xs text-muted-foreground">{t("hr.onLeaveToday")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalEmployees}</p>
                <p className="text-xs text-muted-foreground">{t("hr.totalEmployees")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="requests">{t("hr.tabRequests")}</TabsTrigger>
          <TabsTrigger value="entitlements">{t("hr.tabBalances")}</TabsTrigger>
          <TabsTrigger value="types">{t("hr.tabLeaveTypes")}</TabsTrigger>
          <TabsTrigger value="policies">{t("hr.tabPolicies")}</TabsTrigger>
          <TabsTrigger value="holidays">{t("hr.tabHolidays")}</TabsTrigger>
        </TabsList>

        {/* REQUESTS TAB */}
        <TabsContent value="requests" className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("hr.searchEmployee")}
                  className="pl-9 w-64"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={requestFilter} onValueChange={setRequestFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("hr.all")}</SelectItem>
                  <SelectItem value="pending">{t("hr.pending")}</SelectItem>
                  <SelectItem value="approved">{t("hr.approved")}</SelectItem>
                  <SelectItem value="rejected">{t("hr.rejected")}</SelectItem>
                  <SelectItem value="cancelled">{t("hr.cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("hr.employee")}</TableHead>
                  <TableHead>{t("hr.leaveType")}</TableHead>
                  <TableHead>{t("hr.period")}</TableHead>
                  <TableHead>{t("hr.days")}</TableHead>
                  <TableHead>{t("hr.status")}</TableHead>
                  <TableHead>{t("hr.requested")}</TableHead>
                  <TableHead className="text-right">{t("hr.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t("hr.noRequests")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">
                        {req.employee?.first_name} {req.employee?.last_name}
                        <span className="block text-xs text-muted-foreground capitalize">{req.employee?.employee_type}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" style={{ borderColor: req.leave_type?.color, color: req.leave_type?.color }}>
                          {req.leave_type?.name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(req.start_date).toLocaleDateString()} - {new Date(req.end_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">{req.total_days}</TableCell>
                      <TableCell>{getStatusBadge(req.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {req.status === "pending" && (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="outline" className="text-green-600 border-green-500/30 hover:bg-green-500/10 bg-transparent" onClick={() => openReview(req, "approved")}>
                              <CheckCircle className="h-4 w-4 mr-1" /> {t("hr.approve")}
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 border-red-500/30 hover:bg-red-500/10 bg-transparent" onClick={() => openReview(req, "rejected")}>
                              <XCircle className="h-4 w-4 mr-1" /> {t("hr.reject")}
                            </Button>
                          </div>
                        )}
                        {req.status !== "pending" && req.review_notes && (
                          <span className="text-xs text-muted-foreground italic">{req.review_notes}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ENTITLEMENTS TAB */}
        <TabsContent value="entitlements" className="space-y-4">
          <div className="flex gap-3 items-center justify-between">
            <div className="flex gap-2 items-center">
              <Label>{t("hr.year")}</Label>
              <Select value={entitlementYear.toString()} onValueChange={(v) => setEntitlementYear(parseInt(v))}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026, 2027].map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generateEntitlements}>
              <Plus className="h-4 w-4 mr-2" /> {t("hr.generateEntitlements")}
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("hr.employee")}</TableHead>
                  <TableHead>{t("hr.leaveType")}</TableHead>
                  <TableHead className="text-center">{t("hr.entitled")}</TableHead>
                  <TableHead className="text-center">{t("hr.carryOver")}</TableHead>
                  <TableHead className="text-center">{t("hr.used")}</TableHead>
                  <TableHead className="text-center">{t("hr.pendingCol")}</TableHead>
                  <TableHead className="text-center">{t("hr.available")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entitlements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t("hr.noEntitlements").replace("{year}", entitlementYear.toString())}
                    </TableCell>
                  </TableRow>
                ) : (
                  entitlements.map((ent) => {
                    const available = Number(ent.total_entitled_days) + Number(ent.carried_over_days) - Number(ent.used_days) - Number(ent.pending_days);
                    return (
                      <TableRow key={ent.id}>
                        <TableCell className="font-medium">
                          {ent.employee?.first_name} {ent.employee?.last_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" style={{ borderColor: ent.leave_type?.color, color: ent.leave_type?.color }}>
                            {ent.leave_type?.name}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">{ent.total_entitled_days}</TableCell>
                        <TableCell className="text-center">{ent.carried_over_days}</TableCell>
                        <TableCell className="text-center font-medium">{ent.used_days}</TableCell>
                        <TableCell className="text-center text-amber-600">{ent.pending_days}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${available <= 0 ? "text-red-600" : available <= 3 ? "text-amber-600" : "text-green-600"}`}>
                            {available}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* LEAVE TYPES TAB */}
        <TabsContent value="types" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openTypeDialog()}>
              <Plus className="h-4 w-4 mr-2" /> {t("hr.addLeaveType")}
            </Button>
          </div>
          <div className="grid gap-3">
            {leaveTypes.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {t("hr.noLeaveTypes")}
                </CardContent>
              </Card>
            ) : (
              leaveTypes.map((type) => (
                <Card key={type.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: type.color }} />
                        <div>
                          <p className="font-medium">{type.name} <span className="text-xs text-muted-foreground">({type.code})</span></p>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">{type.is_paid ? t("hr.paid") : t("hr.unpaid")}</Badge>
                            {type.requires_document && <Badge variant="outline" className="text-xs">{t("hr.docRequired")}</Badge>}
                            {type.max_days_per_year && <Badge variant="outline" className="text-xs">{t("hr.maxPerYear").replace("{n}", type.max_days_per_year.toString())}</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openTypeDialog(type)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteType(type.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* POLICIES TAB */}
        <TabsContent value="policies" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openPolicyDialog()}>
              <Plus className="h-4 w-4 mr-2" /> {t("hr.addPolicy")}
            </Button>
          </div>
          <div className="grid gap-3">
            {policies.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {t("hr.noPolicies")}
                </CardContent>
              </Card>
            ) : (
              policies.map((policy) => (
                <Card key={policy.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          {policy.name}
                          {policy.is_default && <Badge className="text-xs">{t("hr.default")}</Badge>}
                        </p>
                        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                          <span>{policy.base_annual_days} {t("hr.baseDays")}</span>
                          {policy.seniority_bonus_days && <span>+{policy.seniority_bonus_days}d every {policy.seniority_bonus_years}yr</span>}
                          {policy.max_annual_days && <span>Max {policy.max_annual_days}d</span>}
                          {policy.carry_over_max_days && <span>Carry over {policy.carry_over_max_days}d</span>}
                          <span className="capitalize">{policy.accrual_method} {t("hr.accrual")}</span>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => openPolicyDialog(policy)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* HOLIDAYS TAB */}
        <TabsContent value="holidays" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openHolidayDialog()}>
              <Plus className="h-4 w-4 mr-2" /> {t("hr.addHoliday")}
            </Button>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("hr.holiday")}</TableHead>
                  <TableHead>{t("hr.date")}</TableHead>
                  <TableHead>{t("hr.day")}</TableHead>
                  <TableHead>{t("hr.recurring")}</TableHead>
                  <TableHead className="text-right">{t("hr.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidays.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {t("hr.noHolidays")}
                    </TableCell>
                  </TableRow>
                ) : (
                  holidays.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{h.name}</TableCell>
                      <TableCell>{new Date(h.date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(h.date).toLocaleDateString("en", { weekday: "long" })}</TableCell>
                      <TableCell>{h.is_recurring ? <Badge variant="outline" className="text-xs">{t("hr.yearly")}</Badge> : "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" onClick={() => openHolidayDialog(h)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteHoliday(h.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewAction === "approved" ? t("hr.approveLeaveRequest") : t("hr.rejectLeaveRequest")}</DialogTitle>
          </DialogHeader>
          {reviewingRequest && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="font-medium">{reviewingRequest.employee?.first_name} {reviewingRequest.employee?.last_name}</p>
                <p className="text-sm">{reviewingRequest.leave_type?.name}: {new Date(reviewingRequest.start_date).toLocaleDateString()} - {new Date(reviewingRequest.end_date).toLocaleDateString()}</p>
                <p className="text-sm font-medium">{reviewingRequest.total_days} {t("hr.dayCount")}</p>
                {reviewingRequest.reason && <p className="text-sm text-muted-foreground">{t("hr.reason")} {reviewingRequest.reason}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t("hr.notesOptional")}</Label>
                <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder={reviewAction === "rejected" ? t("hr.reasonForRejection") : t("hr.anyNotes")} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>{t("hr.cancel")}</Button>
            <Button onClick={handleReview} className={reviewAction === "approved" ? "" : "bg-red-600 hover:bg-red-700 text-white"}>
              {reviewAction === "approved" ? t("hr.approve") : t("hr.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Type Dialog */}
      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingType ? t("hr.editLeaveType") : t("hr.addLeaveTypeTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("hr.name")}</Label>
                <Input value={typeForm.name} onChange={(e) => setTypeForm(p => ({ ...p, name: e.target.value }))} placeholder="Annual Leave" />
              </div>
              <div className="space-y-2">
                <Label>{t("hr.code")}</Label>
                <Input value={typeForm.code} onChange={(e) => setTypeForm(p => ({ ...p, code: e.target.value }))} placeholder="annual" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("hr.description")}</Label>
              <Input value={typeForm.description} onChange={(e) => setTypeForm(p => ({ ...p, description: e.target.value }))} placeholder={t("hr.optionalDescription")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("hr.maxDaysYear")}</Label>
                <Input type="number" value={typeForm.max_days_per_year} onChange={(e) => setTypeForm(p => ({ ...p, max_days_per_year: e.target.value }))} placeholder={t("hr.unlimited")} />
              </div>
              <div className="space-y-2">
                <Label>{t("hr.color")}</Label>
                <div className="flex gap-2">
                  <Input type="color" value={typeForm.color} onChange={(e) => setTypeForm(p => ({ ...p, color: e.target.value }))} className="w-12 h-9 p-1" />
                  <Input value={typeForm.color} onChange={(e) => setTypeForm(p => ({ ...p, color: e.target.value }))} className="flex-1" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={typeForm.is_paid} onChange={(e) => setTypeForm(p => ({ ...p, is_paid: e.target.checked }))} className="rounded" />
                {t("hr.paid")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={typeForm.requires_approval} onChange={(e) => setTypeForm(p => ({ ...p, requires_approval: e.target.checked }))} className="rounded" />
                {t("hr.approval")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={typeForm.requires_document} onChange={(e) => setTypeForm(p => ({ ...p, requires_document: e.target.checked }))} className="rounded" />
                {t("hr.document")}
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialogOpen(false)}>{t("hr.cancel")}</Button>
            <Button onClick={saveType} disabled={!typeForm.name || !typeForm.code}>{editingType ? t("hr.save") : t("hr.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Policy Dialog */}
      <Dialog open={policyDialogOpen} onOpenChange={setPolicyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPolicy ? t("hr.editLeavePolicy") : t("hr.addLeavePolicy")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t("hr.policyName")}</Label>
              <Input value={policyForm.name} onChange={(e) => setPolicyForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("hr.baseAnnualDays")}</Label>
                <Input type="number" value={policyForm.base_annual_days} onChange={(e) => setPolicyForm(p => ({ ...p, base_annual_days: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("hr.maxAnnualDays")}</Label>
                <Input type="number" value={policyForm.max_annual_days} onChange={(e) => setPolicyForm(p => ({ ...p, max_annual_days: e.target.value }))} placeholder={t("hr.noCap")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("hr.seniorityBonusDays")}</Label>
                <Input type="number" value={policyForm.seniority_bonus_days} onChange={(e) => setPolicyForm(p => ({ ...p, seniority_bonus_days: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("hr.everyXYears")}</Label>
                <Input type="number" value={policyForm.seniority_bonus_years} onChange={(e) => setPolicyForm(p => ({ ...p, seniority_bonus_years: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("hr.carryOverMaxDays")}</Label>
                <Input type="number" value={policyForm.carry_over_max_days} onChange={(e) => setPolicyForm(p => ({ ...p, carry_over_max_days: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("hr.probationMonths")}</Label>
                <Input type="number" value={policyForm.probation_months} onChange={(e) => setPolicyForm(p => ({ ...p, probation_months: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("hr.accrualMethod")}</Label>
              <Select value={policyForm.accrual_method} onValueChange={(v) => setPolicyForm(p => ({ ...p, accrual_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yearly">{t("hr.yearlyAllAtOnce")}</SelectItem>
                  <SelectItem value="monthly">{t("hr.monthlyAccrual")}</SelectItem>
                  <SelectItem value="from_hire_date">{t("hr.fromHireDate")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={policyForm.is_default} onChange={(e) => setPolicyForm(p => ({ ...p, is_default: e.target.checked }))} className="rounded" />
              {t("hr.setAsDefault")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPolicyDialogOpen(false)}>{t("hr.cancel")}</Button>
            <Button onClick={savePolicy} disabled={!policyForm.name}>{editingPolicy ? t("hr.save") : t("hr.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Holiday Dialog */}
      <Dialog open={holidayDialogOpen} onOpenChange={setHolidayDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingHoliday ? t("hr.editPublicHoliday") : t("hr.addPublicHoliday")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t("hr.holidayName")}</Label>
              <Input value={holidayForm.name} onChange={(e) => setHolidayForm(p => ({ ...p, name: e.target.value }))} placeholder="Christmas Day" />
            </div>
            <div className="space-y-2">
              <Label>{t("hr.date")}</Label>
              <Input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{t("hr.countryOptional")}</Label>
              <Input value={holidayForm.country} onChange={(e) => setHolidayForm(p => ({ ...p, country: e.target.value }))} placeholder="e.g., RO, DE, US" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={holidayForm.is_recurring} onChange={(e) => setHolidayForm(p => ({ ...p, is_recurring: e.target.checked }))} className="rounded" />
              {t("hr.recurringEveryYear")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHolidayDialogOpen(false)}>{t("hr.cancel")}</Button>
            <Button onClick={saveHoliday} disabled={!holidayForm.name || !holidayForm.date}>{editingHoliday ? t("hr.save") : t("hr.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
