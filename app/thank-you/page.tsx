"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react"
import { LanguageProvider, useLanguage } from "@/components/landing/language-provider"
import { LanguageToggle } from "@/components/landing/language-toggle"

function ThankYouContent() {
  const { t } = useLanguage()

  return (
    <div className="relative flex min-h-svh flex-col bg-background">
      {/* subtle glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-gradient-to-b from-primary/10 to-transparent" />

      <header className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/landing" className="flex items-center gap-2" aria-label="BNG Tracking">
          <Image
            src="/images/logo-full-bng.png"
            alt="BNG Tracking"
            width={150}
            height={48}
            className="h-8 w-auto"
            priority
          />
        </Link>
        <LanguageToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="w-full max-w-lg text-center">
          <span className="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="h-10 w-10" />
          </span>

          <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {t.thankYou.badge}
          </span>

          <h1 className="mt-5 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t.thankYou.title}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-pretty text-base leading-relaxed text-muted-foreground">
            {t.thankYou.subtitle}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/landing"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              {t.thankYou.back}
            </Link>
          </div>

          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            {t.thankYou.contact}
            <a
              href="mailto:contact@bngtracking.ro"
              className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
            >
              <Mail className="h-4 w-4" />
              contact@bngtracking.ro
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}

export default function ThankYouPage() {
  return (
    <LanguageProvider>
      <ThankYouContent />
    </LanguageProvider>
  )
}
