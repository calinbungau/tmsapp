"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { isModuleEnabled } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Search,
  Plus,
  Truck,
  Wrench,
  FileText,
  Users,
  Car,
  Container,
  Building2,
  MapPin,
  ClipboardList,
  Settings,
  Mail,
  MessageSquare,
  Activity,
  ArrowRight,
  Loader2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Animated Canvas Background – route paths + data rain + vehicle    */
/* ------------------------------------------------------------------ */
function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const GOLD = [252, 191, 1] as const;

    /* ----------  data rain columns  ---------- */
    const COL_W = 18;
    const cols = Math.ceil(W / COL_W) + 2;
    const drops: number[] = Array.from({ length: cols }, () => Math.random() * -100);
    const chars = "0123456789ABCDEF:.KMH GPS LOC LAT LNG SPD ALT".split("");

    /* ----------  route network (centered)  ---------- */
    interface Node { x: number; y: number }
    interface Edge { a: number; b: number }
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const NODE_COUNT = 14;
    const centerX = W / 2;
    const centerY = H / 2;
    const spreadX = W * 0.35;
    const spreadY = H * 0.35;
    for (let i = 0; i < NODE_COUNT; i++) {
      nodes.push({ 
        x: centerX + (Math.random() - 0.5) * spreadX * 2, 
        y: centerY + (Math.random() - 0.5) * spreadY * 2 
      });
    }
    for (let i = 0; i < NODE_COUNT; i++) {
      const dists = nodes
        .map((n, j) => ({ j, d: Math.hypot(n.x - nodes[i].x, n.y - nodes[i].y) }))
        .filter((e) => e.j !== i)
        .sort((a, b) => a.d - b.d);
      for (let k = 0; k < Math.min(2 + Math.floor(Math.random() * 2), dists.length); k++) {
        const exists = edges.some(
          (e) => (e.a === i && e.b === dists[k].j) || (e.b === i && e.a === dists[k].j)
        );
        if (!exists) edges.push({ a: i, b: dists[k].j });
      }
    }

    /* ----------  vehicles travelling edges  ---------- */
    interface Vehicle { edge: number; t: number; speed: number; size: number }
    const vehicles: Vehicle[] = Array.from({ length: 6 }, () => ({
      edge: Math.floor(Math.random() * edges.length),
      t: Math.random(),
      speed: 0.0003 + Math.random() * 0.0006,
      size: 3 + Math.random() * 2,
    }));

    /* ----------  pulsing waypoints (centered)  ---------- */
    interface Pulse { x: number; y: number; phase: number; maxR: number }
    const pulses: Pulse[] = [];
    for (let i = 0; i < 8; i++) {
      pulses.push({
        x: centerX + (Math.random() - 0.5) * spreadX * 1.5,
        y: centerY + (Math.random() - 0.5) * spreadY * 1.5,
        phase: Math.random() * Math.PI * 2,
        maxR: 15 + Math.random() * 10,
      });
    }

    /* ----------  floating particles (centered)  ---------- */
    interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }
    const particles: Particle[] = Array.from({ length: 40 }, () => ({
      x: centerX + (Math.random() - 0.5) * spreadX * 2.5,
      y: centerY + (Math.random() - 0.5) * spreadY * 2.5,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      life: Math.random() * 200,
      maxLife: 200 + Math.random() * 200,
    }));

    let t = 0;

    function draw() {
      t++;
      ctx.clearRect(0, 0, W, H);

      /* -- data rain -- */
      ctx.font = "11px monospace";
      for (let i = 0; i < cols; i++) {
        const x = i * COL_W;
        const y = drops[i];
        const ch = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0.25)`;
        ctx.fillText(ch, x, y);
        for (let j = 1; j < 6; j++) {
          const tc = chars[Math.floor(Math.random() * chars.length)];
          const a = 0.08 - j * 0.015;
          if (a > 0) {
            ctx.fillStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${a})`;
            ctx.fillText(tc, x, y - j * 14);
          }
        }
        drops[i] += 0.6 + Math.random() * 0.4;
        if (drops[i] > H + 50) drops[i] = Math.random() * -80;
      }

      /* -- route edges -- */
      for (const edge of edges) {
        const a = nodes[edge.a], b = nodes[edge.b];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0.04)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.save();
        ctx.setLineDash([4, 8]);
        ctx.lineDashOffset = -t * 0.3;
        ctx.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0.03)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }

      /* -- pulsing waypoints -- */
      for (const p of pulses) {
        const r = (Math.sin(t * 0.02 + p.phase) * 0.5 + 0.5) * p.maxR;
        const alpha = 0.06 * (1 - r / p.maxR);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0.1)`;
        ctx.fill();
      }

      /* -- vehicles -- */
      for (const v of vehicles) {
        const edge = edges[v.edge];
        const a = nodes[edge.a], b = nodes[edge.b];
        v.t += v.speed;
        if (v.t >= 1) {
          v.t = 0;
          const dest = edge.b;
          const connected = edges.map((e, i) => ({ i, e })).filter(({ e }) => e.a === dest || e.b === dest);
          if (connected.length > 0) {
            const next = connected[Math.floor(Math.random() * connected.length)];
            v.edge = next.i;
            if (edges[v.edge].a !== dest) {
              const tmp = edges[v.edge].a;
              edges[v.edge].a = edges[v.edge].b;
              edges[v.edge].b = tmp;
            }
          }
        }
        const vx = a.x + (b.x - a.x) * v.t;
        const vy = a.y + (b.y - a.y) * v.t;
        const angle = Math.atan2(b.y - a.y, b.x - a.x);

        const grad = ctx.createRadialGradient(vx, vy, 0, vx, vy, 18);
        grad.addColorStop(0, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0.12)`);
        grad.addColorStop(1, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(vx - 18, vy - 18, 36, 36);

        ctx.save();
        ctx.translate(vx, vy);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(v.size + 2, 0);
        ctx.lineTo(-v.size, -v.size * 0.6);
        ctx.lineTo(-v.size, v.size * 0.6);
        ctx.closePath();
        ctx.fillStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0.5)`;
        ctx.fill();
        ctx.restore();

        for (let i = 1; i <= 5; i++) {
          const tt = v.t - i * 0.015;
          if (tt < 0) continue;
          const tx = a.x + (b.x - a.x) * tt;
          const ty = a.y + (b.y - a.y) * tt;
          ctx.beginPath();
          ctx.arc(tx, ty, 1, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${0.12 - i * 0.02})`;
          ctx.fill();
        }
      }

      /* -- floating particles -- */
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        if (p.life > p.maxLife || p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) {
          p.x = Math.random() * W;
          p.y = Math.random() * H;
          p.life = 0;
        }
        const fade = Math.sin((p.life / p.maxLife) * Math.PI);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${fade * 0.1})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  useEffect(() => {
    const cleanup = init();
    return cleanup;
  }, [init]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
    />
  );
}

// Module configuration
const MODULES = [
  { key: "tms", label: "Transport", icon: Truck, href: "/admin/tms/orders", desc: "Orders & Dispatch" },
  { key: "maintenance", label: "Maintenance", icon: Wrench, href: "/admin/maintenance", desc: "Service & Repairs" },
  { key: "documents", label: "Documents", icon: FileText, href: "/admin/documents", desc: "Files & Compliance" },
  { key: "fsm", label: "Field Service", icon: ClipboardList, href: "/admin/fsm/tasks", desc: "Tasks & Jobs" },
  { key: "telematic", label: "Telematic", icon: MapPin, href: "/admin/telematic/live", desc: "GPS Tracking" },
  { key: "hr", label: "HR", icon: Users, href: "/admin/hr", desc: "Human Resources" },
  { key: "email", label: "Email", icon: Mail, href: "/admin/email", desc: "Communications" },
  { key: "chat", label: "Chat", icon: MessageSquare, href: "/admin/chat", desc: "Messaging" },
  { key: "settings", label: "Settings", icon: Settings, href: "/admin/settings", desc: "Configuration" },
  { key: "logs", label: "Activity", icon: Activity, href: "/admin/logs", desc: "System Logs" },
];

const MASTER_DATA = [
  { key: "drivers", label: "Drivers", icon: Users, href: "/admin/drivers" },
  { key: "vehicles", label: "Vehicles", icon: Car, href: "/admin/vehicles" },
  { key: "trailers", label: "Trailers", icon: Container, href: "/admin/trailers" },
  { key: "employees", label: "Employees", icon: Users, href: "/admin/employees" },
  { key: "partners", label: "Partners", icon: Building2, href: "/admin/business-partners" },
];

const CREATE_OPTIONS = [
  { label: "New Order", icon: Truck, href: "/admin/tms/orders/new", module: "tms" },
  { label: "New Task", icon: ClipboardList, href: "/admin/fsm/tasks/new", module: "fsm" },
  { label: "Schedule Maintenance", icon: Wrench, href: "/admin/maintenance?action=new", module: "maintenance" },
  { label: "Add Driver", icon: Users, href: "/admin/drivers?action=new", module: "masterdata" },
  { label: "Add Vehicle", icon: Car, href: "/admin/vehicles?action=new", module: "masterdata" },
  { label: "Add Trailer", icon: Container, href: "/admin/trailers?action=new", module: "masterdata" },
];

interface SearchResult {
  id: string;
  type: "order" | "task" | "driver" | "vehicle" | "trailer" | "partner";
  title: string;
  subtitle?: string;
  href: string;
}

export default function AdminDashboard() {
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    if (!adminSession?.id) return;
    const supabase = createClient();

    try {
      const [drivers, vehicles, trailers, employees, partners] = await Promise.allSettled([
        supabase.from("drivers").select("*", { count: "exact", head: true }).eq("admin_id", adminSession.id),
        supabase.from("vehicles").select("*", { count: "exact", head: true }).eq("admin_id", adminSession.id),
        supabase.from("trailers").select("*", { count: "exact", head: true }).eq("admin_id", adminSession.id),
        supabase.from("employees").select("*", { count: "exact", head: true }).eq("admin_id", adminSession.id),
        supabase.from("business_partners").select("*", { count: "exact", head: true }).eq("admin_id", adminSession.id),
      ]);

      const get = (r: PromiseSettledResult<any>) => r.status === "fulfilled" ? (r.value.count || 0) : 0;

      setCounts({
        drivers: get(drivers),
        vehicles: get(vehicles),
        trailers: get(trailers),
        employees: get(employees),
        partners: get(partners),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [adminSession?.id]);

  // Search function
  const performSearch = useCallback(async (query: string) => {
    if (!adminSession?.id || !query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const supabase = createClient();
    const results: SearchResult[] = [];
    const q = query.toLowerCase();

    try {
      // Search orders
      if (isModuleEnabled("tms")) {
        const { data: orders } = await supabase
          .from("orders")
          .select("id, reference_number, status, customer:business_partners!customer_id(name)")
          .eq("admin_id", adminSession.id)
          .or(`reference_number.ilike.%${q}%,customer_reference.ilike.%${q}%`)
          .limit(5);
        orders?.forEach((o: any) => results.push({
          id: o.id,
          type: "order",
          title: o.reference_number || "Order",
          subtitle: o.customer?.name,
          href: `/admin/tms/orders/${o.id}`,
        }));
      }

      // Search tasks
      if (isModuleEnabled("fsm")) {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, reference_number, status")
          .eq("admin_id", adminSession.id)
          .or(`title.ilike.%${q}%,reference_number.ilike.%${q}%`)
          .limit(5);
        tasks?.forEach((t: any) => results.push({
          id: t.id,
          type: "task",
          title: t.title || t.reference_number || "Task",
          subtitle: t.status,
          href: `/admin/fsm/tasks/${t.id}`,
        }));
      }

      // Search drivers
      const { data: drivers } = await supabase
        .from("drivers")
        .select("id, name, phone")
        .eq("admin_id", adminSession.id)
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(5);
      drivers?.forEach((d: any) => results.push({
        id: d.id,
        type: "driver",
        title: d.name,
        subtitle: d.phone,
        href: `/admin/drivers/${d.id}`,
      }));

      // Search vehicles
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("id, plate_number, make, model")
        .eq("admin_id", adminSession.id)
        .or(`plate_number.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%`)
        .limit(5);
      vehicles?.forEach((v: any) => results.push({
        id: v.id,
        type: "vehicle",
        title: v.plate_number,
        subtitle: [v.make, v.model].filter(Boolean).join(" "),
        href: `/admin/vehicles/${v.id}`,
      }));

      // Search trailers
      const { data: trailers } = await supabase
        .from("trailers")
        .select("id, plate_number, trailer_type")
        .eq("admin_id", adminSession.id)
        .or(`plate_number.ilike.%${q}%,trailer_type.ilike.%${q}%`)
        .limit(5);
      trailers?.forEach((t: any) => results.push({
        id: t.id,
        type: "trailer",
        title: t.plate_number,
        subtitle: t.trailer_type,
        href: `/admin/trailers/${t.id}`,
      }));

      // Search business partners
      const { data: partners } = await supabase
        .from("business_partners")
        .select("id, name, email")
        .eq("admin_id", adminSession.id)
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(5);
      partners?.forEach((p: any) => results.push({
        id: p.id,
        type: "partner",
        title: p.name,
        subtitle: p.email,
        href: `/admin/business-partners?selected=${p.id}`,
      }));

      setSearchResults(results);
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setSearching(false);
    }
  }, [adminSession?.id]);

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, performSearch]);

  useEffect(() => {
    if (!sessionLoading) {
      if (adminSession?.id) {
        fetchData();
      } else {
        setLoading(false);
      }
    }
  }, [adminSession?.id, sessionLoading, fetchData]);

  // Focus search input when dialog opens
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [searchOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setSearchOpen(true);
      }
  if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
  e.preventDefault();
  setCreateOpen(true);
  }
      if (e.key === "m" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setModulesOpen(true);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const enabledModules = MODULES.filter((m) => isModuleEnabled(m.key));
  const enabledCreate = CREATE_OPTIONS.filter(opt => isModuleEnabled(opt.module));

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  const getTypeIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "order": return Truck;
      case "task": return ClipboardList;
      case "driver": return Users;
      case "vehicle": return Car;
      case "trailer": return Container;
      case "partner": return Building2;
    }
  };

  const getTypeColor = (type: SearchResult["type"]) => {
    switch (type) {
      case "order": return "bg-blue-500/10 text-blue-400";
      case "task": return "bg-purple-500/10 text-purple-400";
      case "driver": return "bg-green-500/10 text-green-400";
      case "vehicle": return "bg-orange-500/10 text-orange-400";
      case "trailer": return "bg-yellow-500/10 text-yellow-400";
      case "partner": return "bg-pink-500/10 text-pink-400";
    }
  };

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <AnimatedBackground />
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden">
      <AnimatedBackground />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <Image
            src="/images/logo-full-bng.png"
            alt="BNG Tracking"
            width={120}
            height={48}
            className="opacity-90"
            priority
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-4">
          {/* Search Button */}
          <button
            onClick={() => setSearchOpen(true)}
            className="group h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
            style={{
              background: "linear-gradient(145deg, #FCBF01 0%, #d9a601 100%)",
              boxShadow: "0 8px 32px rgba(252, 191, 1, 0.35), 0 4px 12px rgba(0,0,0,0.2), inset 0 2px 0 rgba(255,255,255,0.2)",
            }}
          >
            <Search className="h-5 w-5 text-black transition-transform group-hover:scale-110" />
          </button>

          {/* Create Button */}
          <button
            onClick={() => setCreateOpen(true)}
            className="group h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
            style={{
              background: "linear-gradient(145deg, #FCBF01 0%, #d9a601 100%)",
              boxShadow: "0 8px 32px rgba(252, 191, 1, 0.35), 0 4px 12px rgba(0,0,0,0.2), inset 0 2px 0 rgba(255,255,255,0.2)",
            }}
          >
            <Plus className="h-5 w-5 text-black transition-transform group-hover:scale-110 group-hover:rotate-90" />
          </button>

          {/* Modules Button */}
          <button
            onClick={() => setModulesOpen(true)}
            className="group h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
            style={{
              background: "linear-gradient(145deg, rgba(30, 32, 40, 0.95) 0%, rgba(20, 22, 28, 0.95) 100%)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.3)",
              border: "1px solid rgba(252, 191, 1, 0.2)",
            }}
          >
            <ArrowRight className="h-5 w-5 text-[#FCBF01] transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Greeting */}
        <div className="text-center">
          <p className="text-lg text-foreground/80">
            {greeting()}, <span className="text-primary font-medium">{adminSession?.company_name || "Admin"}</span>
          </p>
          <p className="text-sm text-muted-foreground mt-2 flex items-center justify-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-2 py-1 text-xs bg-muted/50 rounded-md border border-border/50 font-mono">/</kbd>
              <span>search</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-2 py-1 text-xs bg-muted/50 rounded-md border border-border/50 font-mono">c</kbd>
              <span>create</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-2 py-1 text-xs bg-muted/50 rounded-md border border-border/50 font-mono">m</kbd>
              <span>modules</span>
            </span>
          </p>
        </div>
      </div>

      {/* Search Dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden bg-card/95 backdrop-blur-xl border-border/50">
          <div className="p-4 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Search orders, tasks, drivers, vehicles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-base bg-muted/30 border-0 focus-visible:ring-1 focus-visible:ring-primary"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="max-h-[400px] overflow-y-auto p-2">
            {searchResults.length === 0 && searchQuery && !searching ? (
              <p className="text-center text-muted-foreground py-8">No results found</p>
            ) : searchResults.length === 0 && !searchQuery ? (
              <p className="text-center text-muted-foreground py-8">Start typing to search...</p>
            ) : (
              <div className="space-y-1">
                {searchResults.map((result) => {
                  const Icon = getTypeIcon(result.type);
                  return (
                    <Link
                      key={`${result.type}-${result.id}`}
                      href={result.href}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted/50 transition-colors"
                    >
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${getTypeColor(result.type)}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{result.title}</p>
                        {result.subtitle && (
                          <p className="text-sm text-muted-foreground truncate">{result.subtitle}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs capitalize shrink-0">
                        {result.type}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent 
          className="p-0 gap-0 max-w-sm overflow-hidden bg-card/95 backdrop-blur-xl border-border/50"
          onKeyDown={(e) => {
            if (e.key === "o" && isModuleEnabled("tms")) {
              e.preventDefault();
              setCreateOpen(false);
              router.push("/admin/tms/orders/new");
            }
            if (e.key === "t" && isModuleEnabled("fsm")) {
              e.preventDefault();
              setCreateOpen(false);
              router.push("/admin/fsm/tasks/new");
            }
          }}
        >
          <div className="p-4 border-b border-border/50">
            <h3 className="font-semibold">Quick Create</h3>
            <p className="text-sm text-muted-foreground">Create a new item</p>
          </div>
          <div className="p-2">
            {enabledCreate.map((opt) => {
              const shortcut = opt.label === "New Order" ? "o" : opt.label === "New Task" ? "t" : null;
              return (
                <Link
                  key={opt.href}
                  href={opt.href}
                  onClick={() => setCreateOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <div 
                    className="h-10 w-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, hsl(var(--primary)/0.15) 0%, hsl(var(--primary)/0.05) 100%)",
                    }}
                  >
                    <opt.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="font-medium flex-1">{opt.label}</span>
                  {shortcut && (
                    <kbd className="px-2 py-1 text-xs bg-muted/50 rounded-md border border-border/50 font-mono text-muted-foreground">{shortcut}</kbd>
                  )}
                </Link>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modules Dialog */}
      <Dialog open={modulesOpen} onOpenChange={setModulesOpen}>
        <DialogContent className="p-0 gap-0 max-w-2xl overflow-hidden bg-card/95 backdrop-blur-xl border-border/50">
          <div className="p-4 border-b border-border/50">
            <h3 className="font-semibold">Modules</h3>
            <p className="text-sm text-muted-foreground">Navigate to a module</p>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {enabledModules.map((m) => (
                <Link
                  key={m.key}
                  href={m.href}
                  onClick={() => setModulesOpen(false)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-muted/50 transition-all hover:scale-[1.02] group"
                >
                  <div 
                    className="h-12 w-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{
                      background: "linear-gradient(135deg, hsl(var(--primary)/0.15) 0%, hsl(var(--primary)/0.05) 100%)",
                    }}
                  >
                    <m.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-sm">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-border/50">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Master Data</p>
              <div className="flex flex-wrap gap-2">
                {MASTER_DATA.map((m) => (
                  <Link
                    key={m.key}
                    href={m.href}
                    onClick={() => setModulesOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <m.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{m.label}</span>
                    <Badge variant="secondary" className="text-xs">{counts[m.key] || 0}</Badge>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
