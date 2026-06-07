"use client"

import { useLanguage } from "./language-provider"

export function LandingStats() {
  const { t } = useLanguage()

  const stats = [
    { value: "12+", label: t.stats.modules },
    { value: "99.9%", label: t.stats.uptime },
    { value: "24/7", label: t.stats.realtime },
    { value: "30+", label: t.stats.countries },
  ]

  return (
    <section className="border-y border-border bg-card/40">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px overflow-hidden px-4 py-10 sm:px-6 lg:grid-cols-4 lg:px-8">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center justify-center px-2 py-4 text-center">
            <span className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">{s.value}</span>
            <span className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
