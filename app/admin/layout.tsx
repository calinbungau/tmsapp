"use client";

import React from "react";
import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Car, Users, LogOut, Settings, ClipboardList, FileText, Wrench,
  ScrollText, Database, UserCircle, Building2, Handshake, CalendarDays,
  MapPin, ListTodo, Shapes, Route, Plus, ChevronRight, Radio,
  Menu, X, Search, ChevronDown, MessageSquare, Mail,
  Truck, Package, CalendarRange, BarChart3, Sparkles, Calculator, ArrowLeftRight, Globe,
  Satellite, Gauge, History, FolderKanban, BellRing, Wallet, Receipt, PiggyBank,
  Target, LineChart, BookOpen, AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AdminNotificationsBell } from "@/components/admin-notifications-bell";
import { PERMISSION_KEYS } from "@/hooks/use-permissions";
import { isModuleEnabled, isRouteAccessible } from "@/lib/modules";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AdminSession {
  id: string;
  user_id?: string;
  email: string;
  company_name: string | null;
  role?: string | null;
  permissions?: Record<string, boolean>;
  isOwner?: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
  module?: string;
  children?: Array<
    | { href: string; label: string; icon: React.ElementType; badge?: number }
    | { label: string; icon: React.ElementType; group: true; key: string; items: { href: string; label: string; icon: React.ElementType; badge?: number }[] }
  >;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [documentAlerts, setDocumentAlerts] = useState(0);
  const [maintenanceAlerts, setMaintenanceAlerts] = useState(0);
  const [actionCenterAlerts, setActionCenterAlerts] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [emailUnread, setEmailUnread] = useState(0);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedSubGroup, setExpandedSubGroup] = useState<string | null>(null);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Detect touch devices (tablets, phones)
  useEffect(() => {
    const checkTouch = () => {
      setIsTouch(
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia("(pointer: coarse)").matches
      );
    };
    checkTouch();
    window.addEventListener("resize", checkTouch);
    return () => window.removeEventListener("resize", checkTouch);
  }, []);

  // Close sidebar on route change (tablet/mobile)
  useEffect(() => {
  if (isTouch) setSidebarOpen(false);
  }, [pathname, isTouch]);

  // Route protection: redirect if module is disabled for this deployment
  useEffect(() => {
    if (pathname && !isRouteAccessible(pathname)) {
      router.replace("/admin");
    }
  }, [pathname, router]);

  const hasFullAccess = useCallback((): boolean => {
    if (!adminSession) return false;
    if (adminSession.isOwner) return true;
    if (!adminSession.user_id) return true;
    if (adminSession.permissions && Object.keys(adminSession.permissions).length === 0 && adminSession.role) return true;
    // A role explicitly named "All" / "Full Access" / "Administrator" is treated as full access,
    // even if its permission set hasn't been backfilled with newer module keys yet.
    if (adminSession.role && /^(all|full[\s_-]?access|administrator|admin)$/i.test(adminSession.role.trim())) return true;
    return false;
  }, [adminSession]);

  const canAccess = useCallback((module: string): boolean => {
  // First check if the module is enabled for this deployment
  if (!isModuleEnabled(module)) return false;
  if (!adminSession) return false;
  if (hasFullAccess()) return true;
  const modulePrefix = module.toLowerCase().replace(/\s+/g, "_");
  return Object.entries(adminSession.permissions || {}).some(
  ([key, value]) => key.startsWith(`${modulePrefix}:`) && value
  );
  }, [adminSession, hasFullAccess]);

  useEffect(() => {
    if (pathname === "/admin/login") { setIsAuthenticated(true); return; }
    const loadSession = async () => {
      const sessionStr = localStorage.getItem("admin_session");
      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          if (session.id && session.email) {
            if (session.user_id) {
              const supabase = createClient();
              const { data: user } = await supabase
                .from("users")
                .select("id, is_owner, role_id, role:roles(id, name, permissions)")
                .eq("id", session.user_id)
                .single();
              if (user) {
                const role = user.role as { id: string; name: string; permissions: Record<string, boolean> } | null;
                const { data: overrides } = await supabase
                  .from("user_permission_overrides")
                  .select("permission_key, granted")
                  .eq("user_id", session.user_id);
                const overrideMap: Record<string, boolean> = {};
                overrides?.forEach((o: { permission_key: string; granted: boolean }) => { overrideMap[o.permission_key] = o.granted; });
                setAdminSession({ ...session, role: role?.name || null, permissions: { ...(role?.permissions || {}), ...overrideMap }, isOwner: user.is_owner });
              } else {
                setAdminSession({ ...session, isOwner: false, permissions: {} });
              }
            } else {
              setAdminSession({ ...session, isOwner: true, permissions: {} });
            }
            setIsAuthenticated(true);
            return;
          }
        } catch { /* invalid */ }
      }
      router.push("/admin/login");
    };
    loadSession();
  }, [pathname, router]);

  // Setup global function for native app (Flutter WebView) to pass FCM token - same as driver
  useEffect(() => {
    if (!adminSession?.id) return;

    (window as any).updateNotificationToken = (token: string) => {
      if (token) {
        localStorage.setItem("fcm_token", token);
        fetch("/api/admin/register-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_id: adminSession.user_id ? undefined : adminSession.id,
            user_id: adminSession.user_id || undefined,
            fcm_token: token,
            device_info: {
              platform: navigator.platform,
              userAgent: navigator.userAgent,
              language: navigator.language,
            },
          }),
        }).catch(console.error);
      }
    };

    // If token was already stored by native app before this effect ran, register it
    const existingToken = localStorage.getItem("fcm_token");
    if (existingToken) {
      (window as any).updateNotificationToken(existingToken);
    }

    // Tell native app we're authenticated
    const appInterface = (window as any).appInterface;
    if (appInterface?.postMessage) {
      appInterface.postMessage("authenticated");
      setTimeout(() => {
        appInterface.postMessage("login");
      }, 500);
    }

    return () => {
      delete (window as any).updateNotificationToken;
    };
  }, [adminSession?.id, adminSession?.user_id]);

  const handleLogout = () => {
    localStorage.removeItem("admin_session");
    localStorage.removeItem("fcm_token");
    router.push("/admin/login");
  };

  useEffect(() => {
    if (!adminSession?.id) return;
    const supabase = createClient();
    const fetchAlertCounts = async () => {
      const today = new Date();
      const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const { data: docs } = await supabase
        .from("documents")
        .select("expiry_date, document_type:document_types(requires_expiry)")
        .eq("admin_id", adminSession.id)
        .not("expiry_date", "is", null);
      if (docs) {
        const alertDocs = docs.filter((doc) => {
          const docType = doc.document_type as { requires_expiry: boolean } | null;
          if (!docType?.requires_expiry || !doc.expiry_date) return false;
          return new Date(doc.expiry_date) <= thirtyDaysFromNow;
        });
        setDocumentAlerts(alertDocs.length);
      }
      const { data: maintenance } = await supabase
        .from("maintenance_records")
        .select("status")
        .eq("admin_id", adminSession.id)
        .in("status", ["reported", "due", "expired"]);
      if (maintenance) setMaintenanceAlerts(maintenance.length);

  // Fetch chat unread count
  const chatUserId = adminSession.user_id || adminSession.id;
  try {
  const chatRes = await fetch(`/api/chat/unread?userId=${chatUserId}&userType=admin`);
  const chatData = await chatRes.json();
  setChatUnread(chatData.total_unread || 0);
  } catch {}

  // Fetch email unread count
  try {
      const emailRes = await fetch("/api/email/unread-count", {
        headers: { "x-admin-id": adminSession.id, "x-user-id": adminSession.user_id || "" },
      });
  const emailData = await emailRes.json();
  setEmailUnread(emailData.count || 0);
  } catch {}

  // Fetch action center stats
  try {
    const acParams = new URLSearchParams({ admin_id: adminSession.id });
    if (adminSession.user_id) acParams.set("user_id", adminSession.user_id);
    const acRes = await fetch(`/api/admin/action-center/stats?${acParams}`);
    const acData = await acRes.json();
    // Count critical + high severity items as "alerts"
    const acCount = (acData.stats?.by_severity?.critical || 0) + (acData.stats?.by_severity?.high || 0);
    setActionCenterAlerts(acCount);
  } catch {}

  // Background email sync (fire-and-forget) so new emails appear in DB
    fetch("/api/email/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-id": adminSession.id,
        "x-user-id": adminSession.user_id || "",
      },
      body: JSON.stringify({ folder: "INBOX" }),
    }).then(async () => {
      // Re-fetch unread count after sync completes
      try {
        const res = await fetch("/api/email/unread-count", {
          headers: { "x-admin-id": adminSession.id, "x-user-id": adminSession.user_id || "" },
        });
      const data = await res.json();
      setEmailUnread(data.count || 0);
    } catch {}
  }).catch(() => {});
    };
    fetchAlertCounts();
    const interval = setInterval(fetchAlertCounts, 60 * 1000);

    // Realtime: update chat badge instantly on new messages
    const chatUserId = adminSession?.user_id || adminSession?.id;
    const chatChannel = supabase
      .channel("chat-unread-badge")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = payload.new as any;
          // If the message is NOT from us, bump unread
          if (msg.sender_id !== chatUserId || msg.sender_type !== "admin") {
            setChatUnread(prev => prev + 1);
          }
        }
      )
      .subscribe();

  // Realtime: update email badge instantly on new emails
  const emailChannel = supabase
  .channel("email-unread-badge")
  .on(
  "postgres_changes",
  {
    event: "INSERT",
    schema: "public",
    table: "user_emails",
    filter: `admin_id=eq.${adminSession?.id}`,
  },
  (payload) => {
    const email = payload.new as any;
    if (email.mailbox === "INBOX" && !email.is_read) {
      setEmailUnread(prev => prev + 1);
    }
  }
  )
  .on(
  "postgres_changes",
  {
    event: "UPDATE",
    schema: "public",
    table: "user_emails",
    filter: `admin_id=eq.${adminSession?.id}`,
  },
  (payload) => {
    const oldRow = payload.old as any;
    const newRow = payload.new as any;
    // Mark read: decrement
    if (!oldRow.is_read && newRow.is_read && newRow.mailbox === "INBOX") {
      setEmailUnread(prev => Math.max(0, prev - 1));
    }
    // Mark unread: increment
    if (oldRow.is_read && !newRow.is_read && newRow.mailbox === "INBOX") {
      setEmailUnread(prev => prev + 1);
    }
  }
  )
  .subscribe();

  // Realtime: update action center badge on item changes
  const acChannel = supabase
    .channel("action-center-badge")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "action_center_items",
        filter: `admin_id=eq.${adminSession?.id}`,
      },
      async () => {
        // Re-fetch action center stats
        try {
          const acParams = new URLSearchParams({ admin_id: adminSession.id });
          if (adminSession.user_id) acParams.set("user_id", adminSession.user_id);
          const acRes = await fetch(`/api/admin/action-center/stats?${acParams}`);
          const acData = await acRes.json();
          const acCount = (acData.stats?.by_severity?.critical || 0) + (acData.stats?.by_severity?.high || 0);
          setActionCenterAlerts(acCount);
        } catch {}
      }
    )
    .subscribe();

  return () => {
  clearInterval(interval);
  supabase.removeChannel(chatChannel);
  supabase.removeChannel(emailChannel);
  supabase.removeChannel(acChannel);
  };
  }, [adminSession?.id]);

  if (isAuthenticated === null) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  }
  if (pathname === "/admin/login") return <>{children}</>;

  const isFsmFullscreen = pathname.startsWith("/admin/fsm/tasks/new") || pathname.startsWith("/admin/tms/orders/new") || pathname.startsWith("/admin/tms/planning") || pathname.startsWith("/admin/tms/forwarding") || pathname.startsWith("/admin/settings/forwarding/template") || pathname.startsWith("/admin/telematic/live") || pathname.startsWith("/admin/telematic/notifications") || pathname.startsWith("/admin/telematic/reports") || pathname.match(/\/admin\/fsm\/forms\/.*\/edit/) || pathname.match(/\/admin\/tms\/trips\/.*\/edit/) || pathname.match(/\/admin\/tms\/orders\/[^/]+$/);
  const companyName = adminSession?.company_name || "Admin";
  const initials = companyName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const userEmail = adminSession?.email || "";
  const userInitials = userEmail.split("@")[0].slice(0, 2).toUpperCase();

  // ── Breadcrumb builder ──
  const getBreadcrumbs = () => {
    const segments = pathname.replace("/admin", "").split("/").filter(Boolean);
    const crumbs: { label: string; href: string }[] = [];
    const labelMap: Record<string, string> = {
      tms: "TMS", orders: "Orders", planning: "Planning", forwarding: "Forwarder Board", reports: "Reports", "ai-usage": "AI Usage", exchange: "Freight Exchange", "carrier-groups": "Carrier Groups",
      fsm: "FSM", tasks: "Tasks", forms: "Forms", "live-map": "Live Map", chat: "Chat",
      geofences: "Geofences", drivers: "Drivers", vehicles: "Vehicles", trailers: "Trailers",
      documents: "Documents", maintenance: "Maintenance", hr: "HR",
      finance: "Finance", dashboard: "Dashboard", invoices: "Invoices", "cost-catalog": "Cost Catalog", "cost-entries": "Cost Entries", budgets: "Budgets", kpis: "KPIs",
      settings: "Settings", company: "Company Profile", template: "Template Builder", logs: "Logs", employees: "Employees",
      departments: "Departments", "business-partners": "Partners",
      notifications: "Notifications", new: "New", email: "Email",
      telematic: "Telematic", live: "Live", history: "History", groups: "Groups", notifications: "Notifications", reports: "Reports",
      "action-center": "Action Center",
    };
    let path = "/admin";
    for (const seg of segments) {
      path += `/${seg}`;
      const label = labelMap[seg] || seg.charAt(0).toUpperCase() + seg.slice(1);
      crumbs.push({ label, href: path });
    }
    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();
  const pageTitle = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : "Dashboard";

  // Navigation items — ordered: TMS, FSM, FORMS, DOCUMENTS, MAINTENANCE, HR, MASTER DATA
  // isModuleEnabled() is checked FIRST to enforce deployment-level restrictions,
  // then canAccess()/hasFullAccess() checks role-based permissions within enabled modules.
  const navItems: NavItem[] = [
    ...(isModuleEnabled("tms") && (canAccess("tms") || hasFullAccess()) ? [{
      href: "/admin/tms/orders",
      label: "TMS",
      icon: Truck,
      module: "tms",
      children: [
        { href: "/admin/tms/orders", label: "Orders", icon: Package },
        { href: "/admin/tms/orders/new", label: "New Order", icon: Plus },
        { href: "/admin/tms/planning", label: "Dispatch Board", icon: Radio },
        { href: "/admin/tms/forwarding", label: "Forwarder Board", icon: ArrowLeftRight },
        { href: "/admin/tms/exchange", label: "Freight Exchange", icon: Globe },
        { href: "/admin/tms/exchange/carrier-groups", label: "Carrier Groups", icon: Users },
        { href: "/admin/action-center", label: "Action Center", icon: AlertCircle, badge: actionCenterAlerts },
        ...(isModuleEnabled("finance") && (canAccess("finance") || hasFullAccess()) ? [{
          group: true as const,
          key: "finance",
          label: "Finance",
          icon: Wallet,
          items: [
            { href: "/admin/finance/dashboard", label: "Dashboard", icon: LineChart },
            { href: "/admin/finance/review", label: "Review Queue", icon: Sparkles },
            { href: "/admin/finance/invoices", label: "Invoices", icon: FileText },
            { href: "/admin/finance/cost-catalog", label: "Cost Catalog", icon: BookOpen },
            { href: "/admin/finance/cost-entries", label: "Cost Entries", icon: Receipt },
            { href: "/admin/finance/budgets", label: "Budgets", icon: PiggyBank },
            { href: "/admin/finance/kpis", label: "KPIs", icon: Target },
            { href: "/admin/finance/reports", label: "Reports", icon: BarChart3 },
          ],
        }] : []),
        { href: "/admin/tms/toll-rates", label: "Toll Rates", icon: Calculator },
        { href: "/admin/tms/reports", label: "Reports", icon: BarChart3 },
        { href: "/admin/tms/ai-usage", label: "AI Usage", icon: Sparkles },
      ],
    }] : []),
    ...(isModuleEnabled("telematic") && (canAccess("telematic") || hasFullAccess()) ? [{
      href: "/admin/telematic/live",
      label: "Telematic",
      icon: Satellite,
      module: "telematic",
      children: [
        { href: "/admin/telematic/live", label: "Live", icon: Radio },
        { href: "/admin/telematic/reports", label: "Reports", icon: BarChart3 },
        { href: "/admin/telematic/history", label: "History", icon: History },
        { href: "/admin/telematic/groups", label: "Groups", icon: FolderKanban },
        { href: "/admin/telematic/geofences", label: "Geofences", icon: MapPin },
        { href: "/admin/telematic/notifications", label: "Notifications", icon: BellRing },
      ],
    }] : []),
    ...(isModuleEnabled("fsm") && (canAccess("fsm") || hasFullAccess()) ? [{
      href: "/admin/fsm/tasks",
      label: "FSM",
      icon: Route,
      module: "fsm",
      children: [
        { href: "/admin/fsm/tasks", label: "Tasks", icon: ListTodo },
        { href: "/admin/fsm/tasks/new", label: "New Task", icon: Plus },
        { href: "/admin/fsm/live-map", label: "Live Map", icon: Radio },
        { href: "/admin/fsm/geofences", label: "Geofences", icon: MapPin },
        { href: "/admin/fsm/forms", label: "Task Forms", icon: Shapes },
      ],
    }] : []),
    ...(isModuleEnabled("forms") && (canAccess("forms") || hasFullAccess()) ? [{ href: "/admin/forms", label: "Forms", icon: ClipboardList, module: "forms" }] : []),
    ...(isModuleEnabled("documents") && (canAccess("documents") || hasFullAccess()) ? [{ href: "/admin/documents", label: "Documents", icon: FileText, module: "documents", badge: documentAlerts }] : []),
    ...(isModuleEnabled("maintenance") && (canAccess("maintenance") || hasFullAccess()) ? [{ href: "/admin/maintenance", label: "Maintenance", icon: Wrench, module: "maintenance", badge: maintenanceAlerts }] : []),
    ...(isModuleEnabled("hr") && (canAccess("hr") || hasFullAccess()) ? [{ href: "/admin/hr", label: "HR", icon: CalendarDays, module: "hr" }] : []),
    ...(isModuleEnabled("masterdata") && (canAccess("vehicles") || canAccess("drivers") || canAccess("employees") || hasFullAccess()) ? [{
      href: "/admin/drivers",
      label: "Master Data",
      icon: Database,
      module: "masterdata",
      children: [
        ...(canAccess("vehicles") || hasFullAccess() ? [{ href: "/admin/vehicles", label: "Vehicles", icon: Car }] : []),
        ...(canAccess("vehicles") || hasFullAccess() ? [{ href: "/admin/trailers", label: "Trailers", icon: Truck }] : []),
        ...(canAccess("drivers") || hasFullAccess() ? [{ href: "/admin/drivers", label: "Drivers", icon: Users }] : []),
        ...(canAccess("vehicles") || canAccess("drivers") || hasFullAccess() ? [{ href: "/admin/fleet-groups", label: "Fleet Groups", icon: FolderKanban }] : []),
        { href: "/admin/business-partners", label: "Partners", icon: Handshake },
        ...(canAccess("employees") || hasFullAccess() ? [{ href: "/admin/employees", label: "Employees", icon: UserCircle }] : []),
        ...(canAccess("employees") || hasFullAccess() ? [{ href: "/admin/departments", label: "Departments", icon: Building2 }] : []),
      ],
    }] : []),
  ];

  const isActive = (href: string) => {
    if (href === "/admin/drivers") return pathname === href || pathname.startsWith("/admin/drivers/");
    if (href === "/admin/fsm/tasks") return pathname === href;
    if (href === "/admin/tms/orders") return pathname === href || pathname === "/admin/tms/orders";
    return pathname.startsWith(href);
  };

  const isGroupActive = (item: NavItem) => {
    if (item.children) return item.children.some(c => "group" in c && c.group ? c.items.some(i => isActive(i.href)) : isActive((c as any).href));
    return isActive(item.href);
  };

  const sidebarExpanded = sidebarPinned || (isTouch && sidebarOpen);

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* ─── Touch overlay backdrop ─── */}
      {isTouch && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[999] transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── Sidebar ─── */}
      <aside
        className={`group/sidebar h-full flex flex-col border-r border-border/50 backdrop-blur-sm transition-all duration-300 ease-in-out z-[1000] flex-shrink-0 ${
          isTouch
            ? `fixed top-0 left-0 w-[240px] shadow-2xl ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`
            : sidebarPinned ? "w-[220px]" : "w-[52px] hover:w-[220px]"
        }`}
        style={{
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(10, 12, 24, 0.99) 40%, rgba(8, 10, 18, 1) 100%)",
          boxShadow: "inset -1px 0 0 rgba(59, 130, 246, 0.08), inset 0 1px 0 rgba(59, 130, 246, 0.05)",
        }}
        onMouseLeave={() => { if (!sidebarPinned && !isTouch) setExpandedGroup(null); }}
      >
        {/* BNG Tracking logo */}
        <div className="h-14 flex items-center px-2 border-b border-border/40 flex-shrink-0 overflow-hidden">
          <Link href="/admin" className="flex items-center flex-shrink-0 h-full">
            {/* Collapsed: Owl icon only */}
            <img 
              src="/images/bng-owl.svg" 
              alt="BNG" 
              className={`h-8 w-8 flex-shrink-0 transition-all duration-200 ${sidebarExpanded ? "hidden" : "block group-hover/sidebar:hidden"}`}
            />
            {/* Expanded: Full logo with owl + text */}
            <img 
              src="/images/logo-full-bng.png" 
              alt="BNG Tracking" 
              className={`h-10 object-contain transition-all duration-200 ${sidebarExpanded ? "block" : "hidden group-hover/sidebar:block"}`}
            />
          </Link>
          {isTouch && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-auto h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-2 px-1.5 space-y-0.5 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: "none" }}>
          {navItems.map((item) => {
            const hasChildren = item.children && item.children.length > 0;
            const groupActive = isGroupActive(item);
            const isExpanded = expandedGroup === item.module;

            if (hasChildren) {
              return (
                <div key={item.module}>
                  <button
                    onClick={() => setExpandedGroup(isExpanded ? null : item.module!)}
                    className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors ${
                      groupActive
                        ? "text-primary bg-primary/10 font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <item.icon className="h-4.5 w-4.5 flex-shrink-0" />
                    <span className={`flex-1 text-left truncate whitespace-nowrap transition-opacity duration-200 ${sidebarExpanded ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"}`}>
                      {item.label}
                    </span>
                    <ChevronRight className={`h-3 w-3 flex-shrink-0 transition-all duration-200 ${sidebarExpanded ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"} ${isExpanded ? "rotate-90" : ""}`} />
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"}`}>
                    <div className="pl-3 pt-0.5 space-y-0.5">
                      {item.children!.map((child) => {
                        // Nested sub-group (e.g. Finance under TMS)
                        if ("group" in child && child.group) {
                          const subActive = child.items.some((i) => isActive(i.href));
                          const subExpanded = expandedSubGroup === child.key || subActive;
                          return (
                            <div key={child.key} className="space-y-0.5">
                              <button
                                onClick={() => setExpandedSubGroup(subExpanded && expandedSubGroup === child.key ? null : child.key)}
                                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                                  subActive
                                    ? "text-primary bg-primary/8 font-medium"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                }`}
                              >
                                <child.icon className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className={`flex-1 text-left truncate whitespace-nowrap transition-opacity duration-200 ${sidebarExpanded ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"}`}>
                                  {child.label}
                                </span>
                                <ChevronRight className={`h-3 w-3 flex-shrink-0 transition-all duration-200 ${sidebarExpanded ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"} ${subExpanded ? "rotate-90" : ""}`} />
                              </button>
                              <div className={`overflow-hidden transition-all duration-200 ${subExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}>
                                <div className="pl-3 space-y-0.5">
                                  {child.items.map((sub) => (
                                    <Link
                                      key={sub.href}
                                      href={sub.href}
                                      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[12.5px] transition-colors ${
                                        isActive(sub.href)
                                          ? "text-primary bg-primary/8 font-medium"
                                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                      }`}
                                    >
                                      <sub.icon className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span className={`flex-1 truncate whitespace-nowrap transition-opacity duration-200 ${sidebarExpanded ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"}`}>
                                        {sub.label}
                                      </span>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        // Regular leaf child
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                              isActive(child.href)
                                ? "text-primary bg-primary/8 font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                            }`}
                          >
                            <child.icon className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className={`flex-1 truncate whitespace-nowrap transition-opacity duration-200 ${sidebarExpanded ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"}`}>
                              {child.label}
                            </span>
                            {child.badge && child.badge > 0 ? (
                              <span className={`flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center transition-opacity duration-200 ${sidebarExpanded ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"}`}>
                                {child.badge > 99 ? "99+" : child.badge}
                              </span>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors ${
                  groupActive
                    ? "text-primary bg-primary/10 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="h-4.5 w-4.5 flex-shrink-0" />
                <span className={`truncate whitespace-nowrap transition-opacity duration-200 ${sidebarExpanded ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"}`}>
                  {item.label}
                </span>
                {item.badge && item.badge > 0 ? (
                  <span className="absolute top-1 left-6 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-medium text-white">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border/40 py-2 px-1.5 space-y-0.5">
          {isModuleEnabled("email") && (
          <Link
            href="/admin/email"
            className={`flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors ${
              isActive("/admin/email")
                ? "text-primary bg-primary/10 font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
  <span className="relative">
  <Mail className="h-4.5 w-4.5 flex-shrink-0" />
  {emailUnread > 0 && (
  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
  {emailUnread > 99 ? "99+" : emailUnread}
  </span>
  )}
  </span>
  <span className={`truncate whitespace-nowrap transition-opacity duration-200 ${sidebarExpanded ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"}`}>
  Email
  </span>
  {emailUnread > 0 && sidebarExpanded && (
  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
  {emailUnread > 99 ? "99+" : emailUnread}
  </span>
  )}
  </Link>
          )}
          {isModuleEnabled("settings") && canAccess("settings") && (
            <Link
              href="/admin/settings"
              className={`flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors ${
                isActive("/admin/settings")
                  ? "text-primary bg-primary/10 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Settings className="h-4.5 w-4.5 flex-shrink-0" />
              <span className={`truncate whitespace-nowrap transition-opacity duration-200 ${sidebarExpanded ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"}`}>
                Settings
              </span>
            </Link>
          )}
          {isModuleEnabled("logs") && canAccess("logs") && (
            <Link
              href="/admin/logs"
              className={`flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors ${
                isActive("/admin/logs")
                  ? "text-primary bg-primary/10 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <ScrollText className="h-4.5 w-4.5 flex-shrink-0" />
              <span className={`truncate whitespace-nowrap transition-opacity duration-200 ${sidebarExpanded ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"}`}>
                Logs
              </span>
            </Link>
          )}
        </div>
      </aside>

      {/* ─── Right side: Header + Content ─── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* ─── Sticky Header ───
            Always visible so the user has the same navigation (hamburger,
            breadcrumbs, chat, notifications, avatar) on every admin page,
            including dispatch board / forwarder / trip editor / orders.
            `isFsmFullscreen` now only controls main-content padding. */}
        {true && (
          <header className="sticky top-0 z-[100] h-14 flex-shrink-0 border-b border-border/40 bg-background/80 backdrop-blur-md">
            <div className="h-full flex items-center justify-between px-4 gap-4">
              {/* Left: Hamburger (touch) + Breadcrumbs */}
              <div className="flex items-center gap-3 min-w-0">
                {isTouch && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
                  >
                    <Menu className="h-[18px] w-[18px]" />
                  </button>
                )}
                {/* Breadcrumbs */}
                <nav className="flex items-center gap-1 text-sm min-w-0">
                  {breadcrumbs.map((crumb, i) => (
                    <React.Fragment key={crumb.href}>
                      {i > 0 && (
                        <ChevronRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                      )}
                      {i === breadcrumbs.length - 1 ? (
                        <span className="font-semibold text-foreground truncate">
                          {crumb.label}
                        </span>
                      ) : (
                        <Link
                          href={crumb.href}
                          className="text-muted-foreground hover:text-foreground transition-colors truncate"
                        >
                          {crumb.label}
                        </Link>
                      )}
                    </React.Fragment>
                  ))}
                </nav>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-1">
                {/* Chat */}
                {isModuleEnabled("chat") && (
                <Link
                  href="/admin/chat"
                  className="relative h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <MessageSquare className="h-[18px] w-[18px]" />
                  {chatUnread > 0 && (
                    <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {chatUnread > 99 ? "99+" : chatUnread}
                    </span>
                  )}
                </Link>
                )}

                {/* Notifications Bell */}
                <AdminNotificationsBell userId={adminSession?.id} />

                {/* User Avatar Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold flex-shrink-0 ring-1 ring-border/50">
                        {userInitials}
                      </div>
                      <span className="hidden md:block truncate max-w-[120px] text-[13px]">
                        {userEmail.split("@")[0]}
                      </span>
                      <ChevronDown className="h-3 w-3 flex-shrink-0 hidden md:block" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 z-[1100]">
                    <div className="px-3 py-2">
                      <p className="text-sm font-medium truncate">{userEmail}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {adminSession?.role || (adminSession?.isOwner ? "Owner" : "Admin")}
                      </p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/admin/settings" className="cursor-pointer">
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/admin/notifications" className="cursor-pointer">
                        <ClipboardList className="h-4 w-4 mr-2" />
                        All Notifications
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/admin/logs" className="cursor-pointer">
                        <ScrollText className="h-4 w-4 mr-2" />
                        Activity Logs
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive cursor-pointer"
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>
        )}

        {/* ─── Main Content ─── */}
        <main className={`flex-1 min-w-0 overflow-auto ${isFsmFullscreen ? "" : "p-6"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
