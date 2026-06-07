"use client"

import Image from "next/image"
import { ArrowRight, MapPin } from "lucide-react"
import { useLanguage } from "./language-provider"

export function LandingHero() {
  const { t } = useLanguage()

  return (
    <section className="relative isolate overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/landing/hero-fleet.png"
          alt=""
          fill
          priority
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/60" />
      </div>

      <div className="mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <MapPin className="h-3.5 w-3.5" />
            {t.hero.badge}
          </span>

          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {t.hero.title}
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t.hero.subtitle}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="#contact"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t.hero.ctaPrimary}
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#features"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-secondary/50 px-6 text-base font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              {t.hero.ctaSecondary}
            </a>
          </div>

          <p className="mt-8 text-sm font-medium text-muted-foreground">{t.hero.trusted}</p>
        </div>
      </div>
    </section>
  )
}
