"use client"

import {
  TrendingUp,
  Truck,
  Wallet,
  Percent,
  Clock,
  Check,
  MapPin,
  ArrowRight,
} from "lucide-react"
import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts"
import { useLanguage } from "./language-provider"
import { AppFrame, Redacted } from "./app-frame"

const revenueTrend = [
  { v: 32 }, { v: 38 }, { v: 35 }, { v: 44 }, { v: 41 },
  { v: 52 }, { v: 49 }, { v: 61 }, { v: 58 }, { v: 72 },
]

export function LandingTms() {
  const { t } = useLanguage()
  const tms = t.tms

  const kpis = [
    { icon: Truck, label: tms.kpis.activeTrips, value: "48", accent: "text-chart-2" },
    { icon: Wallet, label: tms.kpis.revenue, value: "€312,480", accent: "text-chart-3" },
    { icon: Percent, label: tms.kpis.margin, value: "18.4%", accent: "text-primary" },
    { icon: Clock, label: tms.kpis.onTime, value: "97.2%", accent: "text-chart-3" },
  ]

  const board = {
    planned: [
      { route: "Cluj-Napoca → München", price: "€1,840" },
      { route: "Timișoara → Wien", price: "€1,120" },
    ],
    transit: [
      { route: "București → Budapest", price: "€1,560" },
      { route: "Arad → Praha", price: "€2,210" },
      { route: "Sibiu → Milano", price: "€2,480" },
    ],
    delivered: [{ route: "Oradea → Stuttgart", price: "€1,930" }],
  }

  const columns: { key: keyof typeof board; label: string; dot: string }[] = [
    { key: "planned", label: tms.board.cols.planned, dot: "bg-muted-foreground" },
    { key: "transit", label: tms.board.cols.transit, dot: "bg-chart-2" },
    { key: "delivered", label: tms.board.cols.delivered, dot: "bg-chart-3" },
  ]

  return (
    <section id="tms" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Truck className="h-3.5 w-3.5" />
            {tms.badge}
          </span>
          <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {tms.title}
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {tms.subtitle}
          </p>
        </div>

        {/* App mockup */}
        <div className="mt-12">
          <AppFrame label={tms.previewLabel} confidentialNote={tms.confidential}>
            <div className="bg-background p-3 sm:p-5">
              {/* KPI row */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {kpis.map((k) => {
                  const Icon = k.icon
                  return (
                    <div key={k.label} className="rounded-xl border border-border bg-card p-3 sm:p-4">
                      <div className="flex items-center justify-between">
                        <Icon className={`h-4 w-4 ${k.accent}`} />
                        <TrendingUp className="h-3.5 w-3.5 text-chart-3" />
                      </div>
                      <p className="mt-3 text-lg font-bold text-foreground sm:text-2xl">{k.value}</p>
                      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{k.label}</p>
                    </div>
                  )
                })}
              </div>

              {/* Board + pricing */}
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                {/* Dispatch board */}
                <div className="rounded-xl border border-border bg-card p-3 sm:p-4 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">{tms.board.title}</h3>
                    <div className="h-12 w-28">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={revenueTrend} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="tmsRev" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.5} />
                              <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area
                            type="monotone"
                            dataKey="v"
                            stroke="var(--chart-3)"
                            strokeWidth={2}
                            fill="url(#tmsRev)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {columns.map((col) => (
                      <div key={col.key} className="flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 px-1">
                          <span className={`h-1.5 w-1.5 rounded-full ${col.dot}`} />
                          <span className="text-[11px] font-medium text-muted-foreground">{col.label}</span>
                          <span className="ml-auto text-[11px] font-semibold text-foreground">
                            {board[col.key].length}
                          </span>
                        </div>
                        {board[col.key].map((order, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-border bg-background p-2.5"
                          >
                            <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                              <MapPin className="h-3 w-3 shrink-0 text-primary" />
                              <span className="truncate">{order.route}</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                              <Redacted className="text-[10px] font-medium text-muted-foreground">
                                Transilvania Cargo SRL
                              </Redacted>
                              <span className="text-[11px] font-bold text-foreground">{order.price}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Smart pricing */}
                <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
                  <h3 className="text-sm font-semibold text-foreground">{tms.pricing.title}</h3>
                  <div className="mt-3 flex flex-col gap-2.5">
                    <PriceRow label={tms.pricing.customer} value="€2,480" />
                    <PriceRow label={tms.pricing.carrier} value="€2,025" />
                    <div className="my-1 h-px bg-border" />
                    <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2.5">
                      <span className="text-xs font-medium text-foreground">{tms.pricing.spread}</span>
                      <span className="text-sm font-bold text-primary">€455 · 18.3%</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-border bg-background px-3 py-2 text-center">
                        <p className="text-[10px] text-muted-foreground">{tms.pricing.margin}</p>
                        <p className="text-sm font-bold text-chart-3">18.3%</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background px-3 py-2 text-center">
                        <p className="text-[10px] text-muted-foreground">{tms.pricing.perKm}</p>
                        <p className="text-sm font-bold text-foreground">€1.42</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </AppFrame>
        </div>

        {/* Feature points */}
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {tms.points.map((p) => (
            <div key={p.title} className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Check className="h-5 w-5" />
              </span>
              <h3 className="font-semibold text-foreground">{p.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <a
            href="#contact"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t.hero.ctaPrimary}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  )
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  )
}
