"use client"

import Image from "next/image"
import { Check } from "lucide-react"
import { useLanguage } from "./language-provider"

export function LandingPlatform() {
  const { t } = useLanguage()

  return (
    <section id="platform" className="scroll-mt-20 border-y border-border bg-card/40 py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <div>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t.platform.title}
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t.platform.subtitle}
          </p>

          <ul className="mt-8 flex flex-col gap-5">
            {t.platform.items.map((item) => (
              <li key={item.title} className="flex gap-4">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <Image
              src="/images/landing/dashboard-mockup.png"
              alt="BNG Tracking dashboard"
              width={1200}
              height={800}
              className="h-auto w-full"
            />
          </div>
          <div className="pointer-events-none absolute -inset-4 -z-10 rounded-3xl bg-primary/10 blur-3xl" />
        </div>
      </div>
    </section>
  )
}
