"use client"

import Image from "next/image"
import Link from "next/link"
import { useLanguage } from "./language-provider"

export function LandingFooter() {
  const { t } = useLanguage()
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Image
              src="/images/logo-full-bng.png"
              alt="BNG Tracking"
              width={160}
              height={50}
              className="h-8 w-auto"
            />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t.footer.tagline}</p>
          </div>

          <div className="flex flex-wrap gap-10">
            <nav className="flex flex-col gap-3">
              <span className="text-sm font-semibold text-foreground">{t.footer.product}</span>
              <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                {t.nav.features}
              </a>
              <a href="#platform" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                {t.nav.platform}
              </a>
              <Link href="/admin/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                {t.nav.login}
              </Link>
            </nav>
            <nav className="flex flex-col gap-3">
              <span className="text-sm font-semibold text-foreground">{t.footer.company}</span>
              <a href="#contact" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                {t.nav.contact}
              </a>
            </nav>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            {"\u00A9"} {year} BNG Tracking. {t.footer.rights}
          </p>
        </div>
      </div>
    </footer>
  )
}
