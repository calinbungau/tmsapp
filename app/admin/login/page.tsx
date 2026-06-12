"use client";

import React, { useRef, useCallback } from "react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, ArrowRight, MapPin, Truck, Shield, BarChart3, Package } from "lucide-react";
import Image from "next/image";
import { Suspense } from "react";
import Loading from "./loading";
import { getStoredCarrierSession } from "@/hooks/use-carrier-session";

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
      W = canvas.parentElement!.clientWidth;
      H = canvas.parentElement!.clientHeight;
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

    /* ----------  route network  ---------- */
    interface Node { x: number; y: number }
    interface Edge { a: number; b: number }
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const NODE_COUNT = 14;
    for (let i = 0; i < NODE_COUNT; i++) {
      nodes.push({ x: Math.random() * W, y: Math.random() * H });
    }
    // Connect nodes to nearest neighbours to form route network
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

    /* ----------  pulsing waypoints  ---------- */
    interface Pulse { x: number; y: number; phase: number; maxR: number }
    const pulses: Pulse[] = nodes.slice(0, 6).map((n) => ({
      x: n.x, y: n.y, phase: Math.random() * Math.PI * 2, maxR: 12 + Math.random() * 8,
    }));

    /* ----------  floating particles  ---------- */
    interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }
    const particles: Particle[] = Array.from({ length: 30 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      life: Math.random() * 200, maxLife: 200 + Math.random() * 200,
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
        // head character – bright gold
        const ch = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0.35)`;
        ctx.fillText(ch, x, y);
        // trailing chars – fading
        for (let j = 1; j < 6; j++) {
          const tc = chars[Math.floor(Math.random() * chars.length)];
          const a = 0.12 - j * 0.02;
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
        ctx.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0.06)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // dashed overlay for "road" feel
        ctx.save();
        ctx.setLineDash([4, 8]);
        ctx.lineDashOffset = -t * 0.3;
        ctx.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0.04)`;
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
        const alpha = 0.08 * (1 - r / p.maxR);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        // center dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0.15)`;
        ctx.fill();
      }

      /* -- vehicles -- */
      for (const v of vehicles) {
        const edge = edges[v.edge];
        const a = nodes[edge.a], b = nodes[edge.b];
        v.t += v.speed;
        if (v.t >= 1) {
          v.t = 0;
          // pick a connected edge from destination node
          const dest = edge.b;
          const connected = edges
            .map((e, i) => ({ i, e }))
            .filter(({ e }) => e.a === dest || e.b === dest);
          if (connected.length > 0) {
            const next = connected[Math.floor(Math.random() * connected.length)];
            v.edge = next.i;
            // Make sure we travel from dest
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

        // glow
        const grad = ctx.createRadialGradient(vx, vy, 0, vx, vy, 18);
        grad.addColorStop(0, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0.15)`);
        grad.addColorStop(1, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(vx - 18, vy - 18, 36, 36);

        // vehicle triangle
        ctx.save();
        ctx.translate(vx, vy);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(v.size + 2, 0);
        ctx.lineTo(-v.size, -v.size * 0.6);
        ctx.lineTo(-v.size, v.size * 0.6);
        ctx.closePath();
        ctx.fillStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0.6)`;
        ctx.fill();
        ctx.restore();

        // trail
        const trailLen = 25;
        for (let i = 1; i <= 5; i++) {
          const tt = v.t - i * 0.015;
          if (tt < 0) continue;
          const tx = a.x + (b.x - a.x) * tt;
          const ty = a.y + (b.y - a.y) * tt;
          ctx.beginPath();
          ctx.arc(tx, ty, 1, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${0.15 - i * 0.03})`;
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
        ctx.fillStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${fade * 0.12})`;
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
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "none" }}
    />
  );
}

interface GPSSessionResponse {
  id: number;
  name: string;
  email: string;
  attributes: {
    driverInspection?: string;
    [key: string]: unknown;
  };
}

function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [redirectingCarrier, setRedirectingCarrier] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // When the native BNG Tracking / Traccar shell opens the app from a carrier
  // push notification, it always loads its configured home URL (which resolves
  // to this admin login page) rather than the push's actionUrl — the shell does
  // not deep-link. So a logged-in carrier would otherwise get stranded on the
  // admin sign-in screen and have to tap "Carrier" to re-enter. Detect that
  // case here and bounce them straight into their carrier portal. We only do
  // this when there is NO admin session (an admin sitting on the login screen
  // is intentionally here), so genuine admin sign-in is never hijacked.
  useEffect(() => {
    try {
      const hasAdminSession = !!localStorage.getItem("admin_session");
      const hasCarrierSession = !!getStoredCarrierSession();
      if (!hasAdminSession && hasCarrierSession) {
        setRedirectingCarrier(true);
        router.replace("/carrier-dashboard");
        return;
      }
    } catch {
      /* ignore storage access errors */
    }

    const token = searchParams.get("token");
    if (token) {
      handleSSOLogin(token);
    }
  }, [searchParams, router]);

  const handleSSOLogin = async (token: string) => {
    setSsoLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/sso/validate?token=${token}`);

      if (!response.ok) {
        setError("Invalid or expired token.");
        setSsoLoading(false);
        return;
      }

      const sessionData: GPSSessionResponse = await response.json();
      const adminEmail = sessionData.attributes?.driverInspection;

      if (!adminEmail) {
        setError("No driver inspection access configured for this account.");
        setSsoLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: admin, error: dbError } = await supabase
        .from("admins")
        .select("*")
        .eq("email", adminEmail.toLowerCase().trim())
        .eq("is_active", true)
        .single();

      if (dbError || !admin) {
        setError("Admin account not found. Please contact support.");
        setSsoLoading(false);
        return;
      }

      localStorage.setItem("admin_session", JSON.stringify({
        id: admin.id,
        email: admin.email,
        company_name: admin.company_name,
        storage_path: admin.storage_path,
        sso_user: sessionData.name,
        sso_email: sessionData.email,
      }));

      router.push("/admin");
    } catch {
      setError("Failed to authenticate. Please try again.");
      setSsoLoading(false);
    }
  };

  const handleAltLogin = (url: string) => {
    const w = window as any;
    if (w.webkit?.messageHandlers?.appInterface) {
      w.webkit.messageHandlers.appInterface.postMessage(`server|${url}`);
    } else if (w.appInterface) {
      w.appInterface.postMessage(`server|${url}`);
    } else {
      window.location.replace(url);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || "Invalid email or password.");
        setLoading(false);
        return;
      }

      localStorage.setItem("admin_session", JSON.stringify(result.session));
      router.push("/admin");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (ssoLoading || redirectingCarrier) {
    return (
      <div className="dark min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <div className="relative h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </div>
          <p className="text-lg font-medium text-foreground">
            {redirectingCarrier ? "Opening carrier portal..." : "Authenticating..."}
          </p>
          <p className="text-sm text-muted-foreground">
            {redirectingCarrier ? "Taking you to your offers" : "Verifying your session"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen flex bg-background text-foreground">
      {/* Left panel - Branding */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-[#060811]">
        {/* Base gradient layer */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#080A14] via-[#0B0D1A] to-[#060811]" />

        {/* Canvas animation - routes, vehicles, data rain */}
        <AnimatedBackground />

        {/* Vignette overlay for depth */}
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse at 30% 50%, transparent 30%, rgba(6,8,17,0.4) 100%)",
        }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div>
            <Image
              src="/images/logo-full-bng.png"
              alt="BNG Tracking"
              width={220}
              height={85}
              className="mb-2"
              priority
            />
          </div>

          {/* Central hero text */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <h1 className="text-4xl font-bold text-foreground leading-tight tracking-tight text-balance mb-6">
              One Platform.
              <br />
              <span className="text-primary">Complete Control.</span>
            </h1>
            <p className="text-muted-foreground leading-relaxed text-base mb-10">
              Telematic, TMS and FSM unified in a single platform. Monitor your fleet
              in real-time, manage transport operations, and coordinate field services
              from one powerful dashboard.
            </p>

            {/* Feature highlights */}
            <div className="grid grid-cols-2 gap-4">
              <FeatureCard icon={MapPin} title="Telematic" description="Real-time GPS tracking, live map view, geofencing and route history for your entire fleet" />
              <FeatureCard icon={Truck} title="TMS" description="Transport management with order dispatch, route planning, delivery tracking and proof of delivery" />
              <FeatureCard icon={Shield} title="FSM" description="Field service management with task scheduling, driver assignments, inspections and compliance" />
              <FeatureCard icon={BarChart3} title="Smart Reports" description="Advanced analytics with automated route sheets, fuel reports, driver scorecards and cost analysis" />
            </div>
          </div>

          {/* Bottom tagline */}
          <p className="text-muted-foreground/40 text-xs">
            BNG Tracking - Professional Fleet Management Solutions
          </p>
        </div>

        {/* Decorative right edge line */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-primary/20 to-transparent" />
      </div>

      {/* Right panel - Login form */}
      <div className="flex-1 flex items-center justify-center p-5 sm:p-8 bg-background relative overflow-hidden">
        {/* Mobile-only immersive backdrop: deep gradient + animated routes */}
        <div className="lg:hidden absolute inset-0 bg-gradient-to-b from-[#080A14] via-[#0A0C18] to-[#06080F]" />
        <div className="lg:hidden absolute inset-0">
          <AnimatedBackground />
        </div>
        {/* Mobile-only golden aurora glow behind the logo */}
        <div
          className="lg:hidden absolute -top-32 left-1/2 -translate-x-1/2 w-[150%] h-80 rounded-[50%] blur-3xl"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(252,191,1,0.18) 0%, rgba(252,191,1,0.05) 40%, transparent 70%)",
          }}
        />
        {/* Mobile-only bottom fade for grounding */}
        <div className="lg:hidden absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#06080F] to-transparent" />

        {/* Desktop subtle background texture */}
        <div className="hidden lg:block absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(252,191,1,0.4) 1px, transparent 0)`,
            backgroundSize: "32px 32px",
          }}
        />

        {/* Glassmorphic card on mobile, transparent on desktop */}
        <div className="relative z-10 w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-6 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)] lg:rounded-none lg:border-0 lg:bg-transparent lg:backdrop-blur-none lg:p-0 lg:shadow-none">
          {/* Mobile logo with glow */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="relative">
              <div className="absolute -inset-5 rounded-full bg-primary/20 blur-2xl" />
              <Image
                src="/images/logo-full-bng.png"
                alt="BNG Tracking"
                width={190}
                height={73}
                className="relative"
                priority
              />
            </div>
          </div>

          {/* Form header */}
          <div className="mb-8 text-center lg:text-left">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Welcome back</h2>
            <p className="text-muted-foreground text-sm mt-1.5">Sign in to your admin dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 bg-card border-border/60 focus:border-primary/60 transition-colors"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 bg-card border-border/60 focus:border-primary/60 pr-10 transition-colors"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 font-semibold text-sm group"
              disabled={loading || !email || !password}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-border/40" />
          </div>

          {/* Secondary portals */}
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => handleAltLogin("https://gps.bngtracking.ro/")}
              className="group flex items-center justify-center gap-2 h-11 rounded-xl border border-border/40 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card/50 transition-all"
            >
              <MapPin className="h-4 w-4 group-hover:text-primary transition-colors" />
              Telematic
            </button>
            <button
              type="button"
              onClick={() => handleAltLogin(`${window.location.origin}/driver`)}
              className="group flex items-center justify-center gap-2 h-11 rounded-xl border border-border/40 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card/50 transition-all"
            >
              <Truck className="h-4 w-4 group-hover:text-primary transition-colors" />
              Driver
            </button>
            <button
              type="button"
              onClick={() => handleAltLogin(`${window.location.origin}/carrier`)}
              className="group flex items-center justify-center gap-2 h-11 rounded-xl border border-border/40 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card/50 transition-all"
            >
              <Package className="h-4 w-4 group-hover:text-primary transition-colors" />
              Carrier
            </button>
          </div>

          {/* Footer */}
          <p className="text-center text-[11px] text-muted-foreground/30 mt-8">
            BNG Tracking v2.0
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="group p-4 rounded-xl bg-card/20 border border-border/15 hover:bg-card/40 hover:border-primary/20 transition-all duration-300 backdrop-blur-sm">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 group-hover:bg-primary/15 flex items-center justify-center flex-shrink-0 transition-colors">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground/70">{description}</p>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AdminLoginForm />
    </Suspense>
  );
}
