"use client"

import {
  Fuel,
  Gauge,
  Activity,
  FileDown,
  Check,
  AlertTriangle,
  ArrowRight,
  CircleCheck,
  Clock3,
} from "lucide-react"
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
} from "recharts"
import { useLanguage } from "./language-provider"
import { AppFrame, Redacted } from "./app-frame"

const consumption = [
  { d: "Mo", v: 28.4 }, { d: "Tu", v: 27.1 }, { d: "We", v: 29.8 },
  { d: "Th", v: 26.5 }, { d: "Fr", v: 30.2 }, { d: "Sa", v: 25.9 },
  { d: "Su", v: 27.6 },
]

const tachoStatuses = [
  { key: "driving", color: "bg-chart-2", w: "w-[46%]" },
  { key: "rest", color: "bg-chart-3", w: "w-[30%]" },
  { key: "work", color: "bg-primary", w: "w-[16%]" },
  { key: "available", color: "bg-muted-foreground", w: "w-[8%]" },
] as const

export function LandingTelematics() {
  const { t } = useLanguage()
  const tel = t.telematics

  return (
    <section id="telematics" className="scroll-mt-20 border-y border-border bg-card/40 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Activity className="h-3.5 w-3.5" />
            {tel.badge}
          </span>
          <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {tel.title}
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {tel.subtitle}
          </p>
        </div>

        {/* App mockup */}
        <div className="mt-12">
          <AppFrame label="BNG Telematics · Live" confidentialNote={tel.confidential}>
            <div className="grid grid-cols-1 gap-3 bg-background p-3 sm:p-5 lg:grid-cols-2">
              {/* Fuel consumption */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Fuel className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">{tel.fuel.consumptionTitle}</h3>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {tel.fuel.avg} · 27.9 {tel.fuel.consumptionUnit}
                  </span>
                </div>
                <div className="mt-3 h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={consumption} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                      <XAxis
                        dataKey="d"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      />
                      <Bar dataKey="v" radius={[3, 3, 0, 0]} fill="var(--primary)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Fuel level + theft */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{tel.fuel.levelTitle}</h3>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold text-foreground">68%</p>
                    <p className="text-[11px] text-muted-foreground">
                      {tel.fuel.range} · 540 km
                    </p>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">408 / 600 L</p>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full w-[68%] rounded-full bg-primary" />
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                  <span className="text-[11px] font-medium text-destructive">{tel.fuel.theftAlert}</span>
                  <span className="ml-auto text-[11px] font-bold text-destructive">-82 L</span>
                </div>
              </div>

              {/* Tachograph live */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-chart-3" />
                    <h3 className="text-sm font-semibold text-foreground">{tel.tacho.liveTitle}</h3>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-chart-3/15 px-2 py-0.5 text-[10px] font-semibold text-chart-3">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-chart-3" />
                    LIVE
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">{tel.tacho.driverCard}</span>
                  <Redacted className="font-semibold text-foreground">Andrei Popescu</Redacted>
                </div>

                {/* Status timeline */}
                <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full">
                  {tachoStatuses.map((s) => (
                    <div key={s.key} className={`${s.color} ${s.w} h-full`} />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Stat label={tel.tacho.driving} value="04h 12m" dot="bg-chart-2" />
                  <Stat label={tel.tacho.rest} value="02h 45m" dot="bg-chart-3" />
                  <Stat label={tel.tacho.speed} value="82 km/h" dot="bg-primary" />
                  <Stat label={tel.tacho.remaining} value="04h 48m" dot="bg-muted-foreground" />
                </div>
              </div>

              {/* Tachograph files */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <FileDown className="h-4 w-4 text-chart-2" />
                  <h3 className="text-sm font-semibold text-foreground">{tel.tacho.filesTitle}</h3>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <FileRow type={tel.tacho.driver} name="C_Popescu_Andrei" date="12.06" status="ok" label={tel.tacho.downloaded} />
                  <FileRow type={tel.tacho.vehicle} name="M_B-203-RTC" date="12.06" status="ok" label={tel.tacho.downloaded} />
                  <FileRow type={tel.tacho.driver} name="C_Ionescu_Vlad" date="—" status="pending" label={tel.tacho.pending} />
                  <FileRow type={tel.tacho.vehicle} name="M_CJ-88-BNG" date="11.06" status="ok" label={tel.tacho.downloaded} />
                </div>
              </div>
            </div>
          </AppFrame>
        </div>

        {/* Feature points */}
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {tel.points.map((p) => (
            <div key={p.title} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
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

function Stat({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <p className="truncate text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs font-bold text-foreground">{value}</p>
      </div>
    </div>
  )
}

function FileRow({
  type,
  name,
  date,
  status,
  label,
}: {
  type: string
  name: string
  date: string
  status: "ok" | "pending"
  label: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {type}
      </span>
      <Redacted className="flex-1 truncate text-xs font-medium text-foreground">{name}.ddd</Redacted>
      <span className="text-[10px] text-muted-foreground">{date}</span>
      {status === "ok" ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-chart-3">
          <CircleCheck className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
          <Clock3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </span>
      )}
    </div>
  )
}
