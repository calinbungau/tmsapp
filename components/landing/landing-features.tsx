"use client"

import {
  Navigation,
  Truck,
  Network,
  Smartphone,
  Receipt,
  PiggyBank,
  Route,
  Wrench,
  Users,
  FileText,
  BarChart3,
  Bell,
} from "lucide-react"
import { useLanguage } from "./language-provider"

const icons = [
  Navigation,
  Truck,
  Network,
  Smartphone,
  Receipt,
  PiggyBank,
  Route,
  Wrench,
  Users,
  FileText,
  BarChart3,
  Bell,
]

export function LandingFeatures() {
  const { t } = useLanguage()

  return (
    <section id="features" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t.features.title}
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t.features.subtitle}
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.items.map((item, i) => {
            const Icon = icons[i] ?? Truck
            return (
              <div
                key={item.title}
                className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
