"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useRouter } from "next/navigation";
import {
  Route, CircleStop, ArrowLeftRight, MapPin, ShieldAlert, Gauge, Fuel,
  Search, Check, ChevronLeft, ChevronRight, Calendar, Clock, FileText,
  Download, Mail, Repeat, Loader2, X, BarChart3,
  Truck, FileBarChart, Plus, Trash2, Eye, Settings2, CalendarClock,
  Wand2,
} from "lucide-react";
// Advanced Reports module — self-contained panel (renders its own
// Panel 2 + Panel 3 contents) shown only when the user picks the
// "Advanced Reports" entry in Panel 1.
import DoorTempReportPanel from "@/components/telematic/door-temp-report-panel";
import {
  REPORT_TYPES, REPORT_CATEGORIES, getReportsByCategory,
  formatDuration, formatDistance,
  type ReportTypeDef, type ReportCategory, type Locale,
} from "@/lib/report-types";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Route, CircleStop, ArrowLeftRight, MapPin, ShieldAlert, Gauge, Fuel, BarChart3,
};

// ── Module definitions (Panel 1) ──
// `advanced_reports` is a separate workflow from the mass/scheduled
// flows: it renders its own Panel-2 (list of advanced report types) and
// Panel-3 (configuration form) via the DoorTempReportPanel component,
// so the existing mass/scheduled state machinery is untouched.
const REPORT_MODULES = [
  { id: "mass_reports", label: "Mass Reports", description: "Generate reports for multiple vehicles", icon: FileBarChart },
  { id: "scheduled_reports", label: "Scheduled Reports", description: "Recurring auto-generated reports", icon: CalendarClock },
  { id: "advanced_reports", label: "Advanced Reports", description: "Custom reports", icon: Wand2 },
];

// ── Interfaces ──
interface Vehicle { id: string; plate: string; brand: string | null; model: string | null; traccarDeviceId: number; groupId: number; }
interface VehicleGroup { id: number; name: string; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Trip = Record<string, any>;
interface DeviceReport {
  vehicleId: string; plate: string; brand: string | null; model: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trips: Trip[]; summary: Record<string, any> | null;
  // New report type data arrays
  events?: Trip[]; fuelData?: Trip[]; summaryRows?: Trip[];
  error?: string;
  }
interface SavedReport {
  id: string; report_type: string; name: string; config: Record<string, unknown>;
  report_data: { devices: DeviceReport[] }; status: string; created_at: string;
  date_from: string; date_to: string; device_ids: string[]; device_names: Record<string, string>;
  locale: string; configuration_id?: string;
}
interface ScheduleConfig {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  dayOfMonth?: number;
  dayOfWeek?: number;
  emailRecipients: string[];
  format: "pdf" | "csv";
  autoRange: "previous_day" | "previous_week" | "previous_month";
}
interface ScheduledConfig {
  id: string; report_type: string; name: string; is_recurring: boolean;
  recurrence_range: string | null; recurrence_cron: string | null;
  email_recipients: string[]; output_format: string; device_ids: string[];
  all_devices: boolean; config: Record<string, unknown>; locale: string;
  created_at: string; updated_at: string;
}

type Panel2View = "saved_list" | "create_new";

export default function TelematicReportsPage() {
  const router = useRouter();
  const [adminSession, setAdminSession] = useState<{ id: string } | null>(null);
  const [locale, setLocale] = useState<Locale>("en");

  // Panel 1
  const [selectedModule, setSelectedModule] = useState("mass_reports");

  // Panel 2
  const [panel2View, setPanel2View] = useState<Panel2View>("saved_list");
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [selectedSavedReportId, setSelectedSavedReportId] = useState<string | null>(null);
  
  // Scheduled configurations
  const [scheduledConfigs, setScheduledConfigs] = useState<ScheduledConfig[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);

  // Create new flow
  const [selectedReportType, setSelectedReportType] = useState<string | null>(null);
  const [reportSearch, setReportSearch] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [groups, setGroups] = useState<VehicleGroup[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<Set<string>>(new Set());
  const [deviceSearch, setDeviceSearch] = useState("");

  // Panel 3
  const [reportTitle, setReportTitle] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showSummary, setShowSummary] = useState(true);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [controlDays, setControlDays] = useState<number[]>([1, 2, 3, 4, 5]);

  // Schedule config
  const [schedule, setSchedule] = useState<ScheduleConfig>({
    enabled: false, frequency: "monthly", dayOfMonth: 1, dayOfWeek: 1,
    emailRecipients: [], format: "pdf", autoRange: "previous_month",
  });
  const [newEmail, setNewEmail] = useState("");

  // Report data
  const [generating, setGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<"configure" | "preview">("configure");
  const [reportData, setReportData] = useState<DeviceReport[]>([]);
  const [activeDeviceIndex, setActiveDeviceIndex] = useState(0);

  // Admin session
  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (!stored) { router.push("/admin/login"); return; }
    try { setAdminSession(JSON.parse(stored)); } catch { router.push("/admin/login"); }
  }, [router]);

  // Default dates
  useEffect(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
    setDateFrom(fmtDTLocal(todayStart));
    setDateTo(fmtDTLocal(todayEnd));
  }, []);

  // Fetch vehicles
  useEffect(() => {
    if (!adminSession?.id) return;
    setVehiclesLoading(true);
    fetch(`/api/traccar/vehicles?adminId=${adminSession.id}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d) => { if (d.vehicles) setVehicles(d.vehicles); if (d.groups) setGroups(d.groups); })
      .catch((e) => console.error("[v0] Vehicles fetch:", e))
      .finally(() => setVehiclesLoading(false));
  }, [adminSession?.id]);

  // Fetch saved reports
  const fetchSavedReports = useCallback(async () => {
    if (!adminSession?.id) return;
    setSavedLoading(true);
    try {
      const res = await fetch(`/api/reports?adminId=${adminSession.id}&type=runs`);
      const d = await res.json();
      if (res.ok) {
        setSavedReports(d.reports || []);
      }
    } catch { /* silent */ }
    setSavedLoading(false);
  }, [adminSession?.id]);

  useEffect(() => { fetchSavedReports(); }, [fetchSavedReports]);

  // Fetch scheduled configurations
  const fetchScheduledConfigs = useCallback(async () => {
    if (!adminSession?.id) return;
    setScheduledLoading(true);
    try {
      const res = await fetch(`/api/reports?adminId=${adminSession.id}&type=configs`);
      const d = await res.json();
      if (res.ok) {
        // Filter to only recurring configs
        const recurring = (d.configs || []).filter((c: ScheduledConfig) => c.is_recurring);
        setScheduledConfigs(recurring);
      }
    } catch { /* silent */ }
    setScheduledLoading(false);
  }, [adminSession?.id]);

  useEffect(() => { fetchScheduledConfigs(); }, [fetchScheduledConfigs]);

  // Delete scheduled config
  const deleteScheduledConfig = useCallback(async (id: string) => {
    await fetch(`/api/reports?id=${id}&table=configs`, { method: "DELETE" });
    setScheduledConfigs((p) => p.filter((c) => c.id !== id));
  }, []);

  // Report helpers
  const reportsByCategory = useMemo(() => getReportsByCategory(), []);
  const filteredReportTypes = useMemo(() => {
    if (!reportSearch.trim()) return null;
    const q = reportSearch.toLowerCase();
    return REPORT_TYPES.filter((r) => r.nameEn.toLowerCase().includes(q) || r.descriptionEn.toLowerCase().includes(q));
  }, [reportSearch]);
  const activeReport = useMemo(() => REPORT_TYPES.find((r) => r.id === selectedReportType) || null, [selectedReportType]);

  // Vehicles
  const filteredVehicles = useMemo(() => {
    if (!deviceSearch.trim()) return vehicles;
    const q = deviceSearch.toLowerCase();
    return vehicles.filter((v) => v.plate.toLowerCase().includes(q) || v.brand?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q));
  }, [vehicles, deviceSearch]);

  const vehiclesByGroup = useMemo(() => {
    const map = new Map<number, Vehicle[]>();
    for (const v of filteredVehicles) { const gid = v.groupId || 0; if (!map.has(gid)) map.set(gid, []); map.get(gid)!.push(v); }
    return map;
  }, [filteredVehicles]);

  const toggleVehicle = (id: string) => setSelectedVehicleIds((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelectedVehicleIds(new Set(vehicles.map((v) => v.id)));
  const deselectAll = () => setSelectedVehicleIds(new Set());
  const toggleGroup = (groupId: number) => {
    const gv = vehicles.filter((v) => (v.groupId || 0) === groupId);
    const allSel = gv.every((v) => selectedVehicleIds.has(v.id));
    setSelectedVehicleIds((p) => { const n = new Set(p); for (const v of gv) { if (allSel) n.delete(v.id); else n.add(v.id); } return n; });
  };
  const toggleDay = (day: number) => setControlDays((p) => p.includes(day) ? p.filter((d) => d !== day) : [...p, day]);

  // Generate report
  const generateReport = useCallback(async () => {
    if (!adminSession?.id || !activeReport || selectedVehicleIds.size === 0 || !dateFrom || !dateTo) return;
    setGenerating(true);
    try {
      const from = new Date(dateFrom).toISOString();
      const to = new Date(dateTo).toISOString();
      const vehicleIds = Array.from(selectedVehicleIds).join(",");

      // Determine API endpoint based on report type
      let apiUrl = "";
      const baseParams = `adminId=${adminSession.id}&vehicleIds=${vehicleIds}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      
      switch (activeReport.id) {
        case "route_sheet":
          apiUrl = `/api/traccar/reports/route-sheet?${baseParams}`;
          break;
        case "stops":
          apiUrl = `/api/traccar/reports/stops?${baseParams}`;
          break;
        case "engine_hours":
          apiUrl = `/api/traccar/reports/engine-hours?${baseParams}`;
          break;
        case "events":
        case "geofence_visits":
        case "vehicle_security":
          apiUrl = `/api/traccar/reports/events?${baseParams}`;
          break;
        case "fuel_volume":
          apiUrl = `/api/traccar/reports/fuel?${baseParams}`;
          break;
        case "summary":
          apiUrl = `/api/traccar/reports/summary?${baseParams}&groupBy=day`;
          break;
      }

      if (apiUrl) {
        const res = await fetch(apiUrl);
        if (res.ok) {
          const data = await res.json();
          const devices: DeviceReport[] = data.devices || [];
          setReportData(devices);
          setActiveDeviceIndex(0);
          setViewMode("preview");

          // Save to Supabase
          const deviceNames: Record<string, string> = {};
          for (const d of devices) { deviceNames[d.vehicleId] = d.plate; }
          await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "save_run",
              admin_id: adminSession.id,
              report_type: activeReport.id,
              title: reportTitle || activeReport.nameEn,
              date_from: from,
              date_to: to,
              device_ids: Array.from(selectedVehicleIds),
              device_names: deviceNames,
              config: { controlDays, showSummary, hideEmpty },
              report_data: { devices },
              locale,
              output_format: "preview",
            }),
          });
          fetchSavedReports();
        }
      }
    } catch (err) { console.error("[v0] Report generation:", err); }
    finally { setGenerating(false); }
  }, [adminSession?.id, activeReport, selectedVehicleIds, dateFrom, dateTo, reportTitle, controlDays, showSummary, hideEmpty, locale, fetchSavedReports]);

  // Save scheduled config
  const saveScheduledConfig = useCallback(async () => {
    if (!adminSession?.id || !activeReport) return;
    try {
      // Build cron expression from schedule
      let cron: string | null = null;
      if (schedule.enabled) {
        if (schedule.frequency === "daily") cron = "0 8 * * *";
        else if (schedule.frequency === "weekly") cron = `0 8 * * ${schedule.dayOfWeek || 1}`;
        else if (schedule.frequency === "monthly") cron = `0 8 ${schedule.dayOfMonth || 1} * *`;
      }
      await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_config",
          admin_id: adminSession.id,
          report_type: activeReport.id,
          name: reportTitle || `Scheduled ${activeReport.nameEn}`,
          device_ids: Array.from(selectedVehicleIds),
          all_devices: selectedVehicleIds.size === vehicles.length,
          config: { controlDays, showSummary, hideEmpty },
          is_recurring: schedule.enabled,
          recurrence_cron: cron,
          recurrence_range: schedule.enabled ? schedule.autoRange : null,
          email_recipients: schedule.emailRecipients,
          email_subject: `${reportTitle || activeReport.nameEn} - Auto Report`,
          output_format: schedule.format || "pdf",
          locale,
        }),
      });
      // Refresh scheduled configs list
      fetchScheduledConfigs();
    } catch { /* silent */ }
  }, [adminSession?.id, activeReport, selectedVehicleIds, reportTitle, controlDays, showSummary, hideEmpty, locale, schedule, vehicles.length, fetchScheduledConfigs]);

  // View saved report
  const viewSavedReport = useCallback((report: SavedReport) => {
    setSelectedSavedReportId(report.id);
    const rt = REPORT_TYPES.find((r) => r.id === report.report_type);
    if (rt) setSelectedReportType(rt.id);
    setReportTitle(report.name);
    const d = report.report_data?.devices || [];
    setReportData(d);
    setActiveDeviceIndex(0);
    if (report.locale) setLocale(report.locale as Locale);
    const cfg = report.config || {};
    if (cfg.showSummary !== undefined) setShowSummary(cfg.showSummary as boolean);
    if (cfg.hideEmpty !== undefined) setHideEmpty(cfg.hideEmpty as boolean);
    if (report.date_from) setDateFrom(fmtDTLocal(new Date(report.date_from)));
    if (report.date_to) setDateTo(fmtDTLocal(new Date(report.date_to)));
    setViewMode("preview");
  }, []);

  // Delete saved report
  const deleteSavedReport = useCallback(async (id: string) => {
    await fetch(`/api/reports?id=${id}&table=runs`, { method: "DELETE" });
    setSavedReports((p) => p.filter((r) => r.id !== id));
    if (selectedSavedReportId === id) { setSelectedSavedReportId(null); setViewMode("configure"); }
  }, [selectedSavedReportId]);

  // Start new report flow
  const startNewReport = () => {
    setPanel2View("create_new");
    setSelectedReportType(null);
    setSelectedSavedReportId(null);
    setViewMode("configure");
    setReportData([]);
  };

  // Back to saved list
  const backToSavedList = () => {
    setPanel2View("saved_list");
    setSelectedReportType(null);
    setSelectedSavedReportId(null);
    setViewMode("configure");
  };

  const addEmail = () => {
    const email = newEmail.trim();
    if (email && email.includes("@") && !schedule.emailRecipients.includes(email)) {
      setSchedule((p) => ({ ...p, emailRecipients: [...p.emailRecipients, email] }));
      setNewEmail("");
    }
  };
  const removeEmail = (e: string) => setSchedule((p) => ({ ...p, emailRecipients: p.emailRecipients.filter((r) => r !== e) }));

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* ══════ PANEL 1: Report Modules ══════ */}
      <div className="w-[220px] border-r border-border/40 flex flex-col bg-card/60 shrink-0">
        <div className="p-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Reports</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {REPORT_MODULES.map((mod) => {
            const Icon = mod.icon;
            const isActive = selectedModule === mod.id;
            return (
              <button key={mod.id} onClick={() => { setSelectedModule(mod.id); setPanel2View("saved_list"); }}
                className={`w-full text-left px-3 py-3 flex items-start gap-3 transition-all ${isActive ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-muted/30 border-l-2 border-transparent"}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-primary/20" : "bg-muted/40"}`}>
                  <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="min-w-0">
                  <div className={`text-xs font-semibold ${isActive ? "text-primary" : "text-foreground"}`}>{mod.label}</div>
                  <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">{mod.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ══════ PANEL 2: Saved Reports List OR Create New ══════ */}
      {selectedModule === "mass_reports" && (
        <div className="w-[320px] border-r border-border/40 flex flex-col bg-card/30 shrink-0">
          {panel2View === "saved_list" ? (
            /* ── Saved Reports List ── */
            <>
              <div className="p-3 border-b border-border/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Generated Reports</span>
                  <span className="text-[10px] text-muted-foreground">{savedReports.length}</span>
                </div>
                <button onClick={startNewReport}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Create New Report
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {savedLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : savedReports.length === 0 ? (
                  <div className="py-10 text-center px-4">
                    <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No reports generated yet</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Click &quot;Create New Report&quot; to get started</p>
                  </div>
                ) : (
                  savedReports.map((report) => {
                    const rt = REPORT_TYPES.find((r) => r.id === report.report_type);
                    const isSelected = selectedSavedReportId === report.id;
                    return (
                      <div key={report.id}
                        className={`group border-b border-border/10 transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-muted/20"}`}>
                        <button onClick={() => viewSavedReport(report)} className="w-full text-left px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="text-xs font-medium text-foreground truncate flex-1">{report.name}</div>
                            {isSelected && <Eye className="h-3 w-3 text-primary shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {rt && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">{rt.nameEn}</span>}
                            <span className="text-[10px] text-muted-foreground/60">
                              {new Date(report.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}
                              {" "}
                              {new Date(report.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </button>
                        <div className="flex items-center gap-1 px-3 pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => viewSavedReport(report)}
                            className="px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex items-center gap-1">
                            <Eye className="h-2.5 w-2.5" /> View
                          </button>
                          <button onClick={() => deleteSavedReport(report.id)}
                            className="px-2 py-1 rounded text-[10px] text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1">
                            <Trash2 className="h-2.5 w-2.5" /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            /* ── Create New: Report Type + Devices ── */
            <>
              {/* Back + header */}
              <div className="p-3 border-b border-border/30">
                <button onClick={backToSavedList} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors">
                  <ChevronLeft className="h-3 w-3" /> Back to Reports
                </button>
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Report Type</span>
                </div>
                <div className="relative mt-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
                  <input type="text" value={reportSearch} onChange={(e) => setReportSearch(e.target.value)}
                    placeholder="Search reports..." className="w-full pl-7 pr-3 py-1.5 rounded-md bg-muted/40 border border-border/30 text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 transition-colors" />
                </div>
              </div>

              {/* Report types */}
              <div className="max-h-[220px] overflow-y-auto border-b border-border/30">
                {filteredReportTypes ? (
                  filteredReportTypes.map((r) => (
                    <ReportTypeItem key={r.id} report={r} selected={selectedReportType === r.id}
                      onClick={() => { if (!r.available) return; setSelectedReportType(r.id); setReportTitle(r.nameEn); }} />
                  ))
                ) : (
                  (Object.keys(REPORT_CATEGORIES) as ReportCategory[]).map((cat) => {
                    const reports = reportsByCategory[cat];
                    if (!reports?.length) return null;
                    return (
                      <div key={cat}>
                        <div className="px-3 py-1 text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest bg-muted/10">{REPORT_CATEGORIES[cat].labelEn}</div>
                        {reports.map((r) => (
                          <ReportTypeItem key={r.id} report={r} selected={selectedReportType === r.id}
                            onClick={() => { if (!r.available) return; setSelectedReportType(r.id); setReportTitle(r.nameEn); setViewMode("configure"); }} />
                        ))}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Devices */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="p-3 pb-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Truck className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Devices</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{selectedVehicleIds.size}/{vehicles.length}</span>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
                    <input type="text" value={deviceSearch} onChange={(e) => setDeviceSearch(e.target.value)}
                      placeholder="Search devices..." className="w-full pl-7 pr-3 py-1.5 rounded-md bg-muted/40 border border-border/30 text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 transition-colors" />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <button onClick={() => selectedVehicleIds.size === vehicles.length ? deselectAll() : selectAll()}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs border-b border-border/20 hover:bg-muted/30 transition-colors">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${selectedVehicleIds.size === vehicles.length && vehicles.length > 0 ? "bg-primary border-primary" : selectedVehicleIds.size > 0 ? "bg-primary/30 border-primary/50" : "border-border/60 bg-transparent"}`}>
                      {selectedVehicleIds.size > 0 && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </div>
                    <span className="font-medium text-foreground">Select All</span>
                  </button>

                  {vehiclesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground ml-2">Loading devices...</span>
                    </div>
                  ) : vehicles.length === 0 ? (
                    <div className="py-8 text-center">
                      <Truck className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No devices found</p>
                    </div>
                  ) : (
                    Array.from(vehiclesByGroup.entries()).sort(([a], [b]) => a - b).map(([groupId, gVehicles]) => {
                      const group = groups.find((g) => g.id === groupId);
                      const allSel = gVehicles.every((v) => selectedVehicleIds.has(v.id));
                      const someSel = gVehicles.some((v) => selectedVehicleIds.has(v.id));
                      return (
                        <div key={groupId}>
                          <button onClick={() => toggleGroup(groupId)}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs bg-muted/15 border-b border-border/10 hover:bg-muted/30 transition-colors">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${allSel ? "bg-primary border-primary" : someSel ? "bg-primary/30 border-primary/50" : "border-border/60"}`}>
                              {(allSel || someSel) && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                            </div>
                            <span className="font-semibold text-foreground">{group?.name || "Main Group"}</span>
                            <span className="text-muted-foreground ml-auto">({gVehicles.length})</span>
                          </button>
                          {gVehicles.map((v) => (
                            <button key={v.id} onClick={() => toggleVehicle(v.id)}
                              className={`w-full flex items-center gap-2.5 pl-7 pr-3 py-1.5 text-xs border-b border-border/5 transition-colors ${selectedVehicleIds.has(v.id) ? "bg-primary/5" : "hover:bg-muted/15"}`}>
                              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${selectedVehicleIds.has(v.id) ? "bg-primary border-primary" : "border-border/60"}`}>
                                {selectedVehicleIds.has(v.id) && <Check className="h-2 w-2 text-primary-foreground" />}
                              </div>
                              <span className="text-foreground font-mono text-[11px]">{v.plate}</span>
                              {v.brand && <span className="text-[10px] text-muted-foreground/60 ml-auto truncate max-w-[100px]">{v.brand}{v.model ? ` ${v.model}` : ""}</span>}
                            </button>
                          ))}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}

          {/* Scheduled Reports panel rendered separately below — this
              branch of the mass_reports panel never reaches it. */}
        </div>
      )}

      {/* Scheduled Reports Panel 2 */}
      {selectedModule === "scheduled_reports" && (
        <div className="w-[320px] border-r border-border/40 flex flex-col bg-card/30 shrink-0">
          <div className="p-3 border-b border-border/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Scheduled Reports</span>
              <span className="text-[10px] text-muted-foreground">{scheduledConfigs.length}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Reports configured to run automatically on a schedule</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {scheduledLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : scheduledConfigs.length === 0 ? (
              <div className="py-10 text-center px-4">
                <CalendarClock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No scheduled reports</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  Create a report in Mass Reports and enable &quot;Set up recurring schedule&quot; to add one
                </p>
              </div>
            ) : (
              scheduledConfigs.map((config) => {
                const rt = REPORT_TYPES.find((r) => r.id === config.report_type);
                const frequencyLabel = config.recurrence_range === "previous_day" ? "Daily" 
                  : config.recurrence_range === "previous_week" ? "Weekly" 
                  : config.recurrence_range === "previous_month" ? "Monthly" : "Custom";
                return (
                  <div key={config.id} className="group border-b border-border/10 hover:bg-muted/20 transition-colors">
                    <div className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Repeat className="h-3 w-3 text-primary shrink-0" />
                        <div className="text-xs font-medium text-foreground truncate flex-1">{config.name}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-1 pl-5">
                        {rt && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">{rt.nameEn}</span>}
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{frequencyLabel}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 pl-5 text-[10px] text-muted-foreground/70">
                        <Mail className="h-2.5 w-2.5" />
                        <span>{config.email_recipients?.length || 0} recipient{(config.email_recipients?.length || 0) !== 1 ? "s" : ""}</span>
                        <span className="text-muted-foreground/30">|</span>
                        <Truck className="h-2.5 w-2.5" />
                        <span>{config.all_devices ? "All" : config.device_ids?.length || 0} vehicle{(config.device_ids?.length || 0) !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 px-3 pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => deleteScheduledConfig(config.id)}
                        className="px-2 py-1 rounded text-[10px] text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1">
                        <Trash2 className="h-2.5 w-2.5" /> Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Advanced Reports — owns Panel 2 + Panel 3 when active. The
          shared Panel 3 below is skipped in that case to avoid a fourth
          column rendering side-by-side. */}
      {selectedModule === "advanced_reports" && adminSession && (
        <DoorTempReportPanel adminSession={adminSession} />
      )}

      {/* ══════ PANEL 3: Config / Preview ══════ */}
      {selectedModule !== "advanced_reports" && (
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Empty state */}
        {!selectedReportType && panel2View === "saved_list" && !selectedSavedReportId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3 max-w-sm">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <BarChart3 className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-base font-semibold text-foreground">Select or Create a Report</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Click on a generated report to preview it, or click &quot;Create New Report&quot; to generate a fresh one.
              </p>
            </div>
          </div>
        ) : !selectedReportType && panel2View === "create_new" ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3 max-w-sm">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <FileText className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-base font-semibold text-foreground">Select a Report Type</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Choose a report type from the list, select devices, then configure and generate.
              </p>
            </div>
          </div>
        ) : viewMode === "configure" && selectedReportType ? (
          /* ── Configuration Panel ── */
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 max-w-lg">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground">{activeReport?.nameEn || ""}</h2>
                <p className="text-xs text-muted-foreground mt-1">{activeReport?.descriptionEn || ""}</p>
              </div>

              <div className="mb-5">
                <label className="text-xs font-medium text-foreground mb-1.5 block">Report Title:</label>
                <input type="text" value={reportTitle} onChange={(e) => setReportTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border/40 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors" />
              </div>

              <div className="mb-5">
                <label className="text-xs font-medium text-foreground mb-1.5 block">Date Range:</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                    <input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 rounded-lg bg-muted/40 border border-border/40 text-xs text-foreground outline-none focus:border-primary/50 transition-colors" />
                  </div>
                  <span className="text-xs text-muted-foreground">-</span>
                  <div className="relative flex-1">
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                    <input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 rounded-lg bg-muted/40 border border-border/40 text-xs text-foreground outline-none focus:border-primary/50 transition-colors" />
                  </div>
                </div>
              </div>

              <div className="mb-5">
                <label className="text-xs font-medium text-foreground mb-1.5 block">Control Days:</label>
                <div className="flex gap-1.5">
                  {DAY_LABELS.map((label, i) => (
                    <button key={i} onClick={() => toggleDay(i + 1)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${controlDays.includes(i + 1) ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground border border-border/40 hover:bg-muted/60"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-5 space-y-2.5">
                <label className="flex items-center gap-2.5 cursor-pointer" onClick={() => setHideEmpty(!hideEmpty)}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${hideEmpty ? "bg-primary border-primary" : "border-border/60"}`}>
                    {hideEmpty && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  <span className="text-xs text-foreground">Hide empty sheets</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer" onClick={() => setShowSummary(!showSummary)}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${showSummary ? "bg-primary border-primary" : "border-border/60"}`}>
                    {showSummary && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  <span className="text-xs text-foreground">Show summary</span>
                </label>
              </div>

              <div className="mb-5">
                <label className="text-xs font-medium text-foreground mb-1.5 block">Document Language:</label>
                <div className="flex gap-2">
                  {(["en", "ro"] as Locale[]).map((l) => (
                    <button key={l} onClick={() => setLocale(l)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${locale === l ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground border border-border/40"}`}>
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Language for PDF/Excel export</p>
              </div>

              {/* ── Recurring Schedule Section ── */}
              <div className="mb-6 border-t border-border/30 pt-5">
                <label className="flex items-center gap-2.5 cursor-pointer mb-3" onClick={() => setSchedule((p) => ({ ...p, enabled: !p.enabled }))}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${schedule.enabled ? "bg-primary border-primary" : "border-border/60"}`}>
                    {schedule.enabled && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  <Repeat className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground">Set up recurring schedule</span>
                </label>

                {schedule.enabled && (
                  <div className="pl-7 space-y-4">
                    {/* Frequency */}
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Frequency:</label>
                      <div className="flex gap-1.5">
                        {(["daily", "weekly", "monthly"] as const).map((f) => (
                          <button key={f} onClick={() => setSchedule((p) => ({ ...p, frequency: f }))}
                            className={`px-3 py-1.5 rounded-md text-[11px] font-medium capitalize transition-colors ${schedule.frequency === f ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground border border-border/40"}`}>
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>

                    {schedule.frequency === "monthly" && (
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Day of month:</label>
                        <select value={schedule.dayOfMonth || 1} onChange={(e) => setSchedule((p) => ({ ...p, dayOfMonth: Number(e.target.value) }))}
                          className="px-3 py-1.5 rounded-md bg-muted/40 border border-border/40 text-xs text-foreground outline-none focus:border-primary/50 w-20">
                          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    )}

                    {schedule.frequency === "weekly" && (
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Day of week:</label>
                        <div className="flex gap-1">
                          {DAY_LABELS.map((l, i) => (
                            <button key={i} onClick={() => setSchedule((p) => ({ ...p, dayOfWeek: i + 1 }))}
                              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${schedule.dayOfWeek === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground border border-border/40"}`}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Auto date range */}
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Auto date range:</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {([["previous_day", "Previous Day"], ["previous_week", "Previous Week"], ["previous_month", "Previous Month"]] as const).map(([val, label]) => (
                          <button key={val} onClick={() => setSchedule((p) => ({ ...p, autoRange: val }))}
                            className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${schedule.autoRange === val ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground border border-border/40"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Export format */}
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Export format:</label>
                      <div className="flex gap-1.5">
                        {(["pdf", "csv"] as const).map((f) => (
                          <button key={f} onClick={() => setSchedule((p) => ({ ...p, format: f }))}
                            className={`px-3 py-1.5 rounded-md text-[11px] font-medium uppercase transition-colors ${schedule.format === f ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground border border-border/40"}`}>
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Email recipients */}
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Email recipients:</label>
                      <div className="flex gap-2 mb-2">
                        <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                          placeholder="email@example.com"
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
                          className="flex-1 px-3 py-1.5 rounded-md bg-muted/40 border border-border/30 text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40" />
                        <button onClick={addEmail} className="px-3 py-1.5 rounded-md bg-muted/60 border border-border/40 text-[11px] font-medium text-foreground hover:bg-muted/80 transition-colors">Add</button>
                      </div>
                      {schedule.emailRecipients.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {schedule.emailRecipients.map((e) => (
                            <span key={e} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/40 text-[10px] text-foreground">
                              <Mail className="h-2.5 w-2.5" />{e}
                              <button onClick={() => removeEmail(e)} className="text-muted-foreground hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button onClick={backToSavedList}
                  className="px-4 py-2 rounded-lg border border-border/40 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                  Cancel
                </button>
                {schedule.enabled && (
                  <button onClick={async () => { await saveScheduledConfig(); generateReport(); }}
                    disabled={generating || selectedVehicleIds.size === 0 || !dateFrom || !dateTo}
                    className="px-4 py-2 rounded-lg bg-muted/60 border border-border/40 text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50 flex items-center gap-2">
                    <CalendarClock className="h-3.5 w-3.5" /> Save Schedule & Generate
                  </button>
                )}
                <button onClick={generateReport}
                  disabled={generating || selectedVehicleIds.size === 0 || !dateFrom || !dateTo}
                  className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  {generating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</> : <><BarChart3 className="h-3.5 w-3.5" /> Generate Report</>}
                </button>
              </div>
            </div>
          </div>
        ) : viewMode === "preview" ? (
          <ReportPreview
            data={reportData} activeIndex={activeDeviceIndex} setActiveIndex={setActiveDeviceIndex}
            report={activeReport || REPORT_TYPES[0]} locale={locale} showSummary={showSummary} hideEmpty={hideEmpty}
            onBack={() => { setViewMode("configure"); setPanel2View("saved_list"); setSelectedSavedReportId(null); }}
            title={reportTitle} dateFrom={dateFrom} dateTo={dateTo} adminId={adminSession?.id || ""}
          />
        ) : null}
      </div>
      )}
    </div>
  );
}

// ── Report Type Item ──
function ReportTypeItem({ report, selected, onClick }: { report: ReportTypeDef; selected: boolean; onClick: () => void; }) {
  const Icon = ICON_MAP[report.icon] || Route;
  return (
    <button onClick={onClick} disabled={!report.available}
      className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${selected ? "bg-primary/10 border-l-2 border-primary" : report.available ? "hover:bg-muted/20 border-l-2 border-transparent" : "opacity-35 cursor-not-allowed border-l-2 border-transparent"}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
      <div className="min-w-0 flex-1">
        <div className={`text-[11px] font-medium ${selected ? "text-primary" : "text-foreground"}`}>{report.nameEn}</div>
        <div className="text-[9px] text-muted-foreground leading-snug truncate">{report.descriptionEn}</div>
      </div>
      {!report.available && <span className="text-[8px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground/60 shrink-0">Soon</span>}
    </button>
  );
}

// ── Address Map Popup ──
function AddressMapPopup({ lat, lng, address, onClose }: {
  lat: number; lng: number; address: string; onClose: () => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapType, setMapType] = useState<"road" | "hybrid">("road");
  const mapObjRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);

  const TILES = {
    road: "https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
    hybrid: "https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}",
  };

  useEffect(() => {
    if (!mapRef.current || mapObjRef.current) return;
    const m = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView([lat, lng], 15);
    tileRef.current = L.tileLayer(TILES[mapType], { maxZoom: 20 }).addTo(m);
    L.circleMarker([lat, lng], { radius: 8, color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.9, weight: 2 }).addTo(m);
    // Also add a larger ring
    L.circleMarker([lat, lng], { radius: 16, color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.15, weight: 1 }).addTo(m);
    mapObjRef.current = m;
    return () => { m.remove(); mapObjRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  useEffect(() => {
    if (!mapObjRef.current || !tileRef.current) return;
    tileRef.current.setUrl(TILES[mapType]);
  }, [mapType]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border/40 shadow-2xl w-[500px] max-w-[90vw] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs text-foreground flex-1 truncate" title={address}>{address}</span>
          <div className="flex items-center gap-1">
            {(["road", "hybrid"] as const).map((t) => (
              <button key={t} onClick={() => setMapType(t)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${mapType === t ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`}>
                {t === "road" ? "Road" : "Hybrid"}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
        <div ref={mapRef} className="h-[300px] w-full" />
        <div className="px-4 py-2 border-t border-border/30 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
        </div>
      </div>
    </div>
  );
}

// Helper to get data array based on report type
function getReportDataArray(device: DeviceReport, reportType: string): Trip[] {
  switch (reportType) {
    case "events":
    case "geofence_visits":
    case "vehicle_security":
      return device.events || device.trips || [];
    case "fuel_volume":
      return device.fuelData || device.trips || [];
    case "summary":
      return device.summaryRows || device.trips || [];
    default:
      return device.trips || [];
  }
}

// ── Report Preview ──
function ReportPreview({ data, activeIndex, setActiveIndex, report, locale, showSummary, hideEmpty, onBack, title, dateFrom, dateTo, adminId }: {
  data: DeviceReport[]; activeIndex: number; setActiveIndex: (i: number) => void;
  report: ReportTypeDef; locale: Locale; showSummary: boolean; hideEmpty: boolean;
  onBack: () => void; title: string; dateFrom: string; dateTo: string; adminId: string;
}) {
  const filteredData = hideEmpty ? data.filter((d) => getReportDataArray(d, report.id).length > 0 || d.error) : data;
  const device = filteredData[activeIndex] || null;
  const deviceData = device ? getReportDataArray(device, report.id) : [];
  const [exporting, setExporting] = useState<string | null>(null);
  const [mapPopup, setMapPopup] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const columns = report.columns;

  // Group trips by date for route_sheet and stops
  const tripsByDate = useMemo(() => {
    if (!device || !deviceData.length) return new Map<string, { trips: Trip[]; startIdx: number }>();
    const grouped = new Map<string, { trips: Trip[]; startIdx: number }>();
    let idx = 0;
    for (const trip of deviceData) {
      const dateKey = trip.startTime ? new Date(trip.startTime).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
        : trip.eventTime ? new Date(trip.eventTime).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
        : trip.time ? new Date(trip.time).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
        : trip.date || "Unknown";
      if (!grouped.has(dateKey)) grouped.set(dateKey, { trips: [], startIdx: idx });
      grouped.get(dateKey)!.trips.push(trip);
      idx++;
    }
    return grouped;
  }, [device, deviceData]);

  const shouldGroupByDate = report.id === "route_sheet" || report.id === "stops";

  // Handle address click - open map popup
  const handleAddressClick = useCallback((trip: Trip, key: string) => {
    let lat = 0, lng = 0, addr = "";
    if (key === "startAddress") { lat = trip.startLat; lng = trip.startLng; addr = trip.startAddress; }
    else if (key === "endAddress") { lat = trip.endLat; lng = trip.endLng; addr = trip.endAddress; }
    else if (key === "address") { lat = trip.latitude; lng = trip.longitude; addr = trip.address; }
    if (lat && lng && addr) setMapPopup({ lat, lng, address: addr });
  }, []);

  const exportXLSX = async () => {
    setExporting("xlsx");
    try {
      const res = await fetch("/api/reports/export", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "xlsx", data: filteredData, title, locale, dateFrom, dateTo, reportType: report.id }) });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url;
        a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`;
        a.click(); URL.revokeObjectURL(url);
      }
    } catch { /* silent */ }
    setExporting(null);
  };

  const exportPDF = async () => {
    setExporting("pdf");
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const isRo = locale === "ro";
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.setFontSize(14); doc.text(title, 14, 15);
      doc.setFontSize(9); doc.setTextColor(100);
      doc.text(`Period: ${new Date(dateFrom).toLocaleDateString("en-GB")} - ${new Date(dateTo).toLocaleDateString("en-GB")}`, 14, 22);
      let yOff = 28;
      for (const dev of filteredData) {
        const devData = getReportDataArray(dev, report.id);
        if (devData.length === 0) continue;
        if (yOff > 170) { doc.addPage(); yOff = 15; }
        doc.setFontSize(10); doc.setTextColor(0);
        doc.text(`${dev.plate}${dev.brand ? ` - ${dev.brand}` : ""}${dev.model ? ` ${dev.model}` : ""}`, 14, yOff);
        yOff += 4;
        const headers = columns.map(c => isRo ? c.labelRo : c.labelEn);
        const rows = devData.map((t: Trip) => columns.map(c => {
          const v = t[c.key];
          if (v === undefined || v === null) return "-";
          switch (c.type) {
            case "datetime": { const d = new Date(v); return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`; }
            case "address": return String(v);
            case "distance": return `${formatDistance(v as number)} km`;
            case "duration": return formatDuration(v as number);
            case "speed": return `${v} km/h`;
            default: return String(v);
          }
        }));
        autoTable(doc, { startY: yOff, head: [["#", ...headers]], body: rows.map((r: string[], i: number) => [String(i + 1), ...r]),
          theme: "grid", styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [41, 50, 65], textColor: [255, 255, 255], fontSize: 7 }, margin: { left: 14, right: 14 } });
        yOff = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }
      doc.save(`${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`);
    } catch (err) { console.error("[v0] PDF:", err); }
    setExporting(null);
  };

  // Email dialog state
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailRecipients, setEmailRecipients] = useState<string[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);

  const addEmailRecipient = () => {
    const email = emailRecipient.trim().toLowerCase();
    if (email && email.includes("@") && !emailRecipients.includes(email)) {
      setEmailRecipients((prev) => [...prev, email]);
      setEmailRecipient("");
    }
  };

  const removeEmailRecipient = (email: string) => {
    setEmailRecipients((prev) => prev.filter((e) => e !== email));
  };

  const sendReportEmail = async () => {
    if (emailRecipients.length === 0) return;
    setSendingEmail(true);
    try {
      const res = await fetch("/api/reports/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminId,
          recipients: emailRecipients,
          reportData: filteredData,
          reportType: report.id,
          locale,
          format: "xlsx",
          dateFrom,
          dateTo,
          title,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setShowEmailDialog(false);
        setEmailRecipients([]);
        alert(locale === "ro" ? "Email trimis cu succes!" : "Email sent successfully!");
      } else {
        alert(result.error || "Failed to send email");
      }
    } catch (err) {
      console.error("Send email error:", err);
      alert("Failed to send email");
    }
    setSendingEmail(false);
  };

  // Render cell with clickable address
  const renderCell = (trip: Trip, key: string, type: string) => {
    const val = trip[key];
    if (val === undefined || val === null) return <span className="text-muted-foreground">-</span>;

    switch (type) {
      case "datetime": {
        const d = new Date(val as string);
        return <span className="text-foreground whitespace-nowrap">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>;
      }
      case "address": {
        const a = String(val);
        const hasCoords = (key === "startAddress" && trip.startLat) || (key === "endAddress" && trip.endLat) || (key === "address" && trip.latitude);
        return hasCoords ? (
          <button onClick={() => handleAddressClick(trip, key)}
            className="text-left text-primary/80 hover:text-primary hover:underline cursor-pointer max-w-[260px] block leading-snug text-[11px]" title={a}>{a}</button>
        ) : (
          <span className="text-foreground max-w-[260px] block leading-snug text-[11px]" title={a}>{a}</span>
        );
      }
      case "distance":
        return <span className="font-mono text-foreground">{formatDistance(val as number)}</span>;
      case "duration":
        return <span className="font-mono text-foreground">{formatDuration(val as number)}</span>;
      case "speed":
        return <span className="font-mono text-foreground">{val}</span>;
      case "percent":
        return <span className="font-mono text-foreground">{typeof val === "number" ? `${val.toFixed(1)}%` : val}</span>;
      case "text":
      default:
        return <span className="text-foreground">{String(val)}</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {mapPopup && <AddressMapPopup lat={mapPopup.lat} lng={mapPopup.lng} address={mapPopup.address} onClose={() => setMapPopup(null)} />}

      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-3 bg-card/50 shrink-0">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors"><ChevronLeft className="h-4 w-4" /></button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground truncate">{title}</h2>
          <p className="text-[10px] text-muted-foreground">
            {dateFrom && dateTo ? `${new Date(dateFrom).toLocaleDateString("en-GB")} ${new Date(dateFrom).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${new Date(dateTo).toLocaleDateString("en-GB")} ${new Date(dateTo).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}{" | "}{filteredData.length} vehicles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportPDF} disabled={!!exporting}
            className="px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/30 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50">
            {exporting === "pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} PDF
          </button>
          <button onClick={exportXLSX} disabled={!!exporting}
            className="px-3 py-1.5 rounded-md bg-green-500/10 border border-green-500/30 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50">
            {exporting === "xlsx" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Excel
          </button>
          <button onClick={() => setShowEmailDialog(true)} className="px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1.5">
            <Mail className="h-3 w-3" /> Email
          </button>
        </div>
      </div>

      {/* Email Dialog */}
      {showEmailDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 bg-muted/30">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{locale === "ro" ? "Trimite Raport prin Email" : "Send Report via Email"}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">{title}</p>
              </div>
              <button onClick={() => setShowEmailDialog(false)} className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">{locale === "ro" ? "Adauga destinatari" : "Add recipients"}</label>
                <div className="flex gap-2">
                  <input type="email" value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)}
                    placeholder="email@example.com"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmailRecipient(); } }}
                    className="flex-1 px-3 py-2 rounded-md bg-muted/40 border border-border/40 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50" />
                  <button onClick={addEmailRecipient} className="px-4 py-2 rounded-md bg-primary/10 border border-primary/30 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
                    {locale === "ro" ? "Adauga" : "Add"}
                  </button>
                </div>
              </div>
              {emailRecipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {emailRecipients.map((email) => (
                    <span key={email} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-[11px] text-primary font-medium">
                      <Mail className="h-3 w-3" />{email}
                      <button onClick={() => removeEmailRecipient(email)} className="text-primary/70 hover:text-destructive"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="pt-2 bg-muted/20 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{locale === "ro" ? "Format" : "Format"}</span>
                  <span className="font-medium text-foreground">Excel (.xlsx)</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{locale === "ro" ? "Vehicule" : "Vehicles"}</span>
                  <span className="font-medium text-foreground">{filteredData.length}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{locale === "ro" ? "Perioada" : "Period"}</span>
                  <span className="font-medium text-foreground">{new Date(dateFrom).toLocaleDateString("en-GB")} - {new Date(dateTo).toLocaleDateString("en-GB")}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/40 bg-muted/10">
              <button onClick={() => setShowEmailDialog(false)} className="px-4 py-2 rounded-md border border-border/40 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors">
                {locale === "ro" ? "Anuleaza" : "Cancel"}
              </button>
              <button onClick={sendReportEmail} disabled={sendingEmail || emailRecipients.length === 0}
                className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2">
                {sendingEmail ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {locale === "ro" ? "Se trimite..." : "Sending..."}</> : <><Mail className="h-3.5 w-3.5" /> {locale === "ro" ? "Trimite" : "Send"}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle tabs */}
      <div className="px-4 py-2 border-b border-border/20 flex items-center gap-1 overflow-x-auto bg-card/30 shrink-0">
        {filteredData.map((d, i) => (
          <button key={d.vehicleId} onClick={() => setActiveIndex(i)}
            className={`px-2.5 py-1 rounded-md text-xs font-mono whitespace-nowrap transition-colors flex items-center gap-1.5 ${i === activeIndex ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"}`}>
            {d.plate}{d.error && <X className="h-2.5 w-2.5 text-destructive" />}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 pl-2 shrink-0">
          <button onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))} disabled={activeIndex === 0}
            className="p-1 rounded hover:bg-muted/40 disabled:opacity-30 text-muted-foreground"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span className="text-[10px] text-muted-foreground min-w-[3rem] text-center">{activeIndex + 1} / {filteredData.length}</span>
          <button onClick={() => setActiveIndex(Math.min(filteredData.length - 1, activeIndex + 1))} disabled={activeIndex >= filteredData.length - 1}
            className="p-1 rounded hover:bg-muted/40 disabled:opacity-30 text-muted-foreground"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* Main content - SCROLLABLE */}
      <div className="flex-1 overflow-y-auto overflow-x-auto" style={{ minHeight: 0 }}>
        {!device ? (
          <div className="text-center py-10 text-sm text-muted-foreground">No data available</div>
        ) : device.error ? (
          <div className="text-center py-10 text-sm text-destructive">Error: {device.error}</div>
        ) : deviceData.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">No data in this period</div>
        ) : (
          <div>
            {/* Vehicle header */}
            <div className="px-4 py-2.5 flex items-center gap-3 border-b border-border/20 bg-background sticky top-0 z-20">
              <div className="text-xs font-semibold text-foreground">{device.plate}{device.brand && ` - ${device.brand}`}{device.model && ` ${device.model}`}</div>
              <div className="text-[10px] text-muted-foreground">{deviceData.length} {report.id === "engine_hours" ? "days" : report.id === "stops" ? "stops" : report.id === "events" ? "events" : report.id === "fuel_volume" ? "records" : report.id === "summary" ? "days" : "trips"}</div>
            </div>

            {/* Table with date grouping */}
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-[37px] z-10">
                <tr className="bg-muted">
                  <th className="px-3 py-2 text-left font-semibold text-foreground border-b border-border/40 w-8">#</th>
                  {columns.map((col) => (
                    <th key={col.key} className={`px-3 py-2 text-left font-semibold text-foreground border-b border-border/40 whitespace-nowrap ${col.type === "address" ? "min-w-[200px]" : ""}`}>
                      {col.labelEn}{col.unit && <span className="text-muted-foreground font-normal ml-0.5">({col.unit})</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shouldGroupByDate ? (<>
                  {Array.from(tripsByDate.entries()).map(([dateLabel, { trips: dayTrips, startIdx }]) => {
                    const daySummary = computeTripsSummary(dayTrips, columns);
                    return (
                      <Fragment key={dateLabel}>
                        {/* Date header */}
                        <tr>
                          <td colSpan={columns.length + 1} className="px-3 py-1.5 bg-primary/5 border-b border-border/20">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3 w-3 text-primary" />
                              <span className="text-[11px] font-semibold text-primary">{dateLabel}</span>
                              <span className="text-[10px] text-muted-foreground">({dayTrips.length} {report.id === "stops" ? "stops" : "trips"})</span>
                            </div>
                          </td>
                        </tr>
                        {/* Trips */}
                        {dayTrips.map((trip, idx) => (
                          <tr key={startIdx + idx} className="border-b border-border/10 hover:bg-muted/10 transition-colors">
                            <td className="px-3 py-2 text-muted-foreground font-mono">{startIdx + idx + 1}</td>
                            {columns.map((col) => (
                              <td key={col.key} className={`px-3 py-2 ${col.type === "address" ? "" : "whitespace-nowrap"}`}>
                                {renderCell(trip, col.key, col.type)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {/* Day summary row */}
                        <tr className="bg-muted/30 border-b border-border/30">
                          <td className="px-3 py-1.5"></td>
                          {columns.map((col) => (
                            <td key={col.key} className="px-3 py-1.5 whitespace-nowrap">
                              {daySummary[col.key] ? (
                                <span className="font-semibold text-foreground text-[11px]">
                                  {formatSummaryValue(daySummary[col.key].value, daySummary[col.key].type)}
                                </span>
                              ) : col === columns[0] ? (
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase">Day Total</span>
                              ) : null}
                            </td>
                          ))}
                        </tr>
                      </Fragment>
                    );
                  })}
                  {/* Grand total row */}
                  {(() => {
                    const grandTotal = computeTripsSummary(deviceData, columns);
                    return (
                      <tr className="bg-primary/10 border-t-2 border-primary/30">
                        <td className="px-3 py-2"></td>
                        {columns.map((col) => (
                          <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                            {grandTotal[col.key] ? (
                              <span className="font-bold text-primary text-xs">
                                {formatSummaryValue(grandTotal[col.key].value, grandTotal[col.key].type)}
                              </span>
                            ) : col === columns[0] ? (
                              <span className="text-xs font-bold text-primary uppercase">Period Total</span>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    );
                  })()}
                </>) : (<>
                  {deviceData.map((trip, idx) => (
                    <tr key={idx} className="border-b border-border/10 hover:bg-muted/10 transition-colors">
                      <td className="px-3 py-2 text-muted-foreground font-mono">{idx + 1}</td>
                      {columns.map((col) => (
                        <td key={col.key} className={`px-3 py-2 ${col.type === "address" ? "" : "whitespace-nowrap"}`}>
                          {renderCell(trip, col.key, col.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Grand total for non-grouped */}
                  {(() => {
                    const grandTotal = computeTripsSummary(deviceData, columns);
                    const hasAny = Object.keys(grandTotal).length > 0;
                    if (!hasAny) return null;
                    return (
                      <tr className="bg-primary/10 border-t-2 border-primary/30">
                        <td className="px-3 py-2"></td>
                        {columns.map((col) => (
                          <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                            {grandTotal[col.key] ? (
                              <span className="font-bold text-primary text-xs">
                                {formatSummaryValue(grandTotal[col.key].value, grandTotal[col.key].type)}
                              </span>
                            ) : col === columns[0] ? (
                              <span className="text-xs font-bold text-primary uppercase">Total</span>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    );
                  })()}
                </>)}
              </tbody>
            </table>

            {/* Summary cards */}
            {showSummary && device.summary && (
              <div className="border-t border-border/40 bg-card/50">
                <div className="px-4 py-1.5 border-b border-border/20">
                  <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Period Summary</span>
                </div>
                <div className="grid grid-cols-4 gap-px bg-border/20">
                  {renderSummary(device.summary, report.id)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SumCell({ label, value }: { label: string; value: string }) {
  return <div className="bg-card px-3 py-2"><div className="text-[10px] text-muted-foreground">{label}</div><div className="text-xs font-semibold text-foreground">{value}</div></div>;
}

function renderSummary(summary: Record<string, unknown>, reportId: string): React.ReactNode {
  if (reportId === "route_sheet") {
    return (<>
      <SumCell label="Trips" value={String(summary.totalTrips ?? 0)} />
      <SumCell label="Total Distance" value={`${formatDistance(summary.totalDistance as number)} km`} />
      <SumCell label="Drive Time" value={formatDuration(summary.totalDuration as number)} />
      <SumCell label="Avg Speed" value={`${summary.averageSpeed ?? 0} km/h`} />
      <SumCell label="Max Speed" value={`${summary.maxSpeed ?? 0} km/h`} />
      <SumCell label="Idle Time" value={formatDuration(summary.totalIdleDuration as number)} />
      <SumCell label="Ignition ON" value={formatDuration(summary.totalIgnitionOn as number)} />
      <SumCell label="Active %" value={
        (summary.totalDuration as number) > 0
          ? `${(((summary.totalIgnitionOn as number) / ((summary.totalDuration as number) + (summary.totalIdleDuration as number))) * 100).toFixed(1)}%`
          : "0%"
      } />
    </>);
  }
  if (reportId === "stops") {
    return (<>
      <SumCell label="Total Stops" value={String(summary.totalStops ?? 0)} />
      <SumCell label="Total Stop Time" value={formatDuration(summary.totalStopDuration as number)} />
      <SumCell label="Longest Stop" value={formatDuration(summary.longestStop as number)} />
      <SumCell label="Engine ON Stops" value={String(summary.engineOnStops ?? 0)} />
      <SumCell label="Engine OFF Stops" value={String(summary.engineOffStops ?? 0)} />
    </>);
  }
  if (reportId === "engine_hours") {
    return (<>
      <SumCell label="Total Days" value={String(summary.totalDays ?? 0)} />
      <SumCell label="Total Ignition ON" value={formatDuration(summary.totalIgnitionOn as number)} />
      <SumCell label="Total Moving" value={formatDuration(summary.totalMovingTime as number)} />
      <SumCell label="Total Idle" value={formatDuration(summary.totalIdleTime as number)} />
      <SumCell label="Total Ignition OFF" value={formatDuration(summary.totalIgnitionOff as number)} />
      <SumCell label="Total Distance" value={`${formatDistance(summary.totalDistance as number)} km`} />
    </>);
  }
  return null;
}

/** Compute aggregates for a list of trips based on column definitions */
function computeTripsSummary(trips: Trip[], columns: ReportTypeDef["columns"]): Record<string, { value: number; type: string }> {
  const sums: Record<string, { value: number; type: string; count: number; max: number }> = {};
  for (const col of columns) {
    if (!col.summable) continue;
    sums[col.key] = { value: 0, type: col.type, count: 0, max: 0 };
  }
  // Also track speed columns for avg/max
  for (const col of columns) {
    if (col.type === "speed" && !col.summable) {
      sums[col.key] = { value: 0, type: "speed", count: 0, max: 0 };
    }
  }
  for (const trip of trips) {
    for (const key in sums) {
      const v = trip[key];
      if (v !== undefined && v !== null && typeof v === "number") {
        sums[key].value += v;
        sums[key].count++;
        if (v > sums[key].max) sums[key].max = v;
      }
    }
  }
  const result: Record<string, { value: number; type: string }> = {};
  for (const key in sums) {
    const s = sums[key];
    if (s.type === "speed") {
      // For speed: show avg if key includes "average", max if key includes "max"
      if (key.toLowerCase().includes("max")) {
        result[key] = { value: s.max, type: s.type };
      } else {
        result[key] = { value: s.count > 0 ? Math.round(s.value / s.count) : 0, type: s.type };
      }
    } else {
      result[key] = { value: s.value, type: s.type };
    }
  }
  return result;
}

function formatSummaryValue(value: number, type: string): string {
  switch (type) {
    case "distance": return `${formatDistance(value)} km`;
    case "duration": return formatDuration(value);
    case "speed": return `${value} km/h`;
    default: return String(value);
  }
}

function fmtDTLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
