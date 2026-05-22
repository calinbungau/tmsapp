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
  Calendar,
  Plus,
  CalendarDays,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

interface DriverSession {
  id: string;
  name: string;
  admin_id: string;
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  color: string;
  is_paid: boolean;
  max_days_per_year: number | null;
  requires_document: boolean;
}

interface LeaveRequest {
  id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: string;
  review_notes: string | null;
  created_at: string;
  leave_type: { name: string; color: string; code: string } | null;
}

interface LeaveBalance {
  leave_type_id: string;
  total_entitled_days: number;
  carried_over_days: number;
  used_days: number;
  pending_days: number;
  leave_type: { name: string; color: string } | null;
}

interface PublicHoliday {
  date: string;
}

export default function DriverLeavePage() {
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    leave_type_id: "",
    start_date: "",
    end_date: "",
    reason: "",
  });

  // Calculate working days between two dates excluding weekends and holidays
  const calculateDays = useCallback((start: string, end: string): number => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (endDate < startDate) return 0;

    const holidayDates = new Set(holidays.map(h => h.date));
    let days = 0;
    const current = new Date(startDate);

    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      const dateStr = current.toISOString().split("T")[0];
      // Skip weekends (0=Sun, 6=Sat) and public holidays
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(dateStr)) {
        days++;
      }
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [holidays]);

  const fetchData = useCallback(async () => {
    const session = localStorage.getItem("driver_session");
    if (!session) return;
    const driverData = JSON.parse(session) as DriverSession;
    setDriver(driverData);

    const supabase = createClient();

    // Find employee record linked to this driver
    const { data: driverRecord } = await supabase
      .from("drivers")
      .select("employee_id")
      .eq("id", driverData.id)
      .single();

    if (!driverRecord?.employee_id) {
      setLoading(false);
      return;
    }
    setEmployeeId(driverRecord.employee_id);

    // Fetch leave types
    const { data: typesData } = await supabase
      .from("leave_types")
      .select("id, name, code, color, is_paid, max_days_per_year, requires_document")
      .eq("admin_id", driverData.admin_id)
      .eq("is_active", true)
      .order("display_order");
    if (typesData) setLeaveTypes(typesData);

    // Fetch my leave requests
    const { data: reqData } = await supabase
      .from("leave_requests")
      .select("*, leave_type:leave_types(name, color, code)")
      .eq("employee_id", driverRecord.employee_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (reqData) setRequests(reqData as LeaveRequest[]);

    // Fetch my balances for current year
    const year = new Date().getFullYear();
    const { data: balData } = await supabase
      .from("leave_entitlements")
      .select("leave_type_id, total_entitled_days, carried_over_days, used_days, pending_days, leave_type:leave_types(name, color)")
      .eq("employee_id", driverRecord.employee_id)
      .eq("year", year);
    if (balData) setBalances(balData as LeaveBalance[]);

    // Fetch public holidays for current and next year
    const { data: holData } = await supabase
      .from("public_holidays")
      .select("date")
      .eq("admin_id", driverData.admin_id)
      .gte("year", year);
    if (holData) setHolidays(holData);

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async () => {
    if (!driver || !employeeId || !form.leave_type_id || !form.start_date || !form.end_date) return;
    setSubmitting(true);

    const totalDays = calculateDays(form.start_date, form.end_date);
    if (totalDays <= 0) {
      alert("Invalid date range or no working days in selected period.");
      setSubmitting(false);
      return;
    }

    const supabase = createClient();

    // Create leave request
    const { error } = await supabase.from("leave_requests").insert({
      admin_id: driver.admin_id,
      employee_id: employeeId,
      leave_type_id: form.leave_type_id,
      start_date: form.start_date,
      end_date: form.end_date,
      total_days: totalDays,
      reason: form.reason || null,
      status: "pending",
    });

    if (error) {
      alert("Failed to submit leave request: " + error.message);
      setSubmitting(false);
      return;
    }

    // Update pending days in entitlement
    const year = new Date(form.start_date).getFullYear();
    const { data: ent } = await supabase
      .from("leave_entitlements")
      .select("id, pending_days")
      .eq("employee_id", employeeId)
      .eq("leave_type_id", form.leave_type_id)
      .eq("year", year)
      .single();

    if (ent) {
      await supabase.from("leave_entitlements").update({
        pending_days: Number(ent.pending_days) + totalDays,
        updated_at: new Date().toISOString(),
      }).eq("id", ent.id);
    }

    setDialogOpen(false);
    setForm({ leave_type_id: "", start_date: "", end_date: "", reason: "" });
    setSubmitting(false);
    fetchData();
  };

  const cancelRequest = async (requestId: string) => {
    if (!confirm("Cancel this leave request?")) return;
    const supabase = createClient();

    const request = requests.find(r => r.id === requestId);
    if (!request) return;

    await supabase.from("leave_requests").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", requestId);

    // Restore pending days if was pending
    if (request.status === "pending" && employeeId) {
      const year = new Date(request.start_date).getFullYear();
      const { data: ent } = await supabase
        .from("leave_entitlements")
        .select("id, pending_days")
        .eq("employee_id", employeeId)
        .eq("leave_type_id", request.leave_type_id)
        .eq("year", year)
        .single();
      if (ent) {
        await supabase.from("leave_entitlements").update({
          pending_days: Math.max(0, Number(ent.pending_days) - Number(request.total_days)),
          updated_at: new Date().toISOString(),
        }).eq("id", ent.id);
      }
    }

    fetchData();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">Pending</Badge>;
      case "approved": return <Badge className="bg-green-500/10 text-green-600 border-green-500/30">Approved</Badge>;
      case "rejected": return <Badge className="bg-red-500/10 text-red-600 border-red-500/30">Rejected</Badge>;
      case "cancelled": return <Badge className="bg-muted text-muted-foreground">Cancelled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const calculatedDays = calculateDays(form.start_date, form.end_date);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!employeeId) {
    return (
      <div className="p-4 space-y-4">
        <Link href="/driver-dashboard" className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>Your account is not linked to an employee record.</p>
            <p className="text-sm mt-2">Please contact your administrator to set up leave management.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/driver-dashboard" className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="text-xl font-bold">Leave</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Request Leave
        </Button>
      </div>

      {/* Leave Balance Overview */}
      {balances.length > 0 ? (
        <div className="space-y-3">
          {/* Summary Card */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {new Date().getFullYear()} Leave Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {(() => {
                const totals = balances.reduce(
                  (acc, bal) => ({
                    entitled: acc.entitled + Number(bal.total_entitled_days) + Number(bal.carried_over_days),
                    used: acc.used + Number(bal.used_days),
                    pending: acc.pending + Number(bal.pending_days),
                  }),
                  { entitled: 0, used: 0, pending: 0 }
                );
                const remaining = totals.entitled - totals.used - totals.pending;
                const usedPercent = totals.entitled > 0 ? Math.round((totals.used / totals.entitled) * 100) : 0;
                return (
                  <div className="space-y-3">
                    {/* Progress bar */}
                    <div className="w-full h-3 bg-muted rounded-full overflow-hidden flex">
                      <div className="h-full bg-green-500 transition-all" style={{ width: `${usedPercent}%` }} />
                      {totals.pending > 0 && (
                        <div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.round((totals.pending / totals.entitled) * 100)}%` }} />
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold">{totals.entitled}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-green-600">{totals.used}</p>
                        <p className="text-xs text-muted-foreground">Used</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-amber-600">{totals.pending}</p>
                        <p className="text-xs text-muted-foreground">Pending</p>
                      </div>
                      <div>
                        <p className={`text-lg font-bold ${remaining <= 0 ? "text-red-600" : remaining <= 5 ? "text-amber-600" : ""}`}>{remaining}</p>
                        <p className="text-xs text-muted-foreground">Remaining</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Per-type breakdown */}
          <div className="grid grid-cols-1 gap-2">
            {balances.map((bal) => {
              const total = Number(bal.total_entitled_days) + Number(bal.carried_over_days);
              const used = Number(bal.used_days);
              const pending = Number(bal.pending_days);
              const available = total - used - pending;
              const usedPct = total > 0 ? Math.round((used / total) * 100) : 0;
              const pendingPct = total > 0 ? Math.round((pending / total) * 100) : 0;
              return (
                <Card key={bal.leave_type_id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bal.leave_type?.color }} />
                        <p className="text-sm font-medium">{bal.leave_type?.name}</p>
                      </div>
                      <span className={`text-sm font-bold ${available <= 0 ? "text-red-600" : available <= 3 ? "text-amber-600" : "text-green-600"}`}>
                        {available} remaining
                      </span>
                    </div>
                    {/* Mini progress bar */}
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden flex mb-2">
                      <div className="h-full rounded-full" style={{ width: `${usedPct}%`, backgroundColor: bal.leave_type?.color || "#3b82f6" }} />
                      {pending > 0 && <div className="h-full bg-amber-400" style={{ width: `${pendingPct}%` }} />}
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Entitled: {bal.total_entitled_days}</span>
                      {Number(bal.carried_over_days) > 0 && <span>Carry-over: {bal.carried_over_days}</span>}
                      <span>Used: {used}</span>
                      {pending > 0 && <span className="text-amber-600">Pending: {pending}</span>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground">
            <p className="text-sm">No leave entitlements generated for {new Date().getFullYear()} yet.</p>
            <p className="text-xs mt-1">Please contact HR to set up your leave allowance.</p>
          </CardContent>
        </Card>
      )}

      {/* Request List */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">My Requests</h2>
        {requests.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No leave requests yet</p>
              <p className="text-sm mt-1">Tap "Request Leave" to submit your first request.</p>
            </CardContent>
          </Card>
        ) : (
          requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs" style={{ borderColor: req.leave_type?.color, color: req.leave_type?.color }}>
                        {req.leave_type?.name}
                      </Badge>
                      {getStatusBadge(req.status)}
                    </div>
                    <p className="text-sm font-medium">
                      {new Date(req.start_date).toLocaleDateString()} - {new Date(req.end_date).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-muted-foreground">{req.total_days} working day(s)</p>
                    {req.reason && <p className="text-xs text-muted-foreground mt-1">{req.reason}</p>}
                    {req.review_notes && (
                      <p className="text-xs mt-1 italic">
                        {req.status === "rejected" ? <span className="text-red-600">Rejected: </span> : <span className="text-green-600">Note: </span>}
                        {req.review_notes}
                      </p>
                    )}
                  </div>
                  {req.status === "pending" && (
                    <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => cancelRequest(req.id)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* New Leave Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={form.leave_type_id} onValueChange={(v) => setForm(p => ({ ...p, leave_type_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: type.color }} />
                        {type.name}
                        {!type.is_paid && <span className="text-xs text-muted-foreground">(unpaid)</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm(p => ({ ...p, end_date: e.target.value }))} min={form.start_date} />
              </div>
            </div>
            {calculatedDays > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-sm text-muted-foreground">Working days requested:</p>
                <p className="text-2xl font-bold">{calculatedDays}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea value={form.reason} onChange={(e) => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="Why do you need time off?" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || !form.leave_type_id || !form.start_date || !form.end_date || calculatedDays <= 0}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
