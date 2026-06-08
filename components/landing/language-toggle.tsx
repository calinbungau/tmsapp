"use client"

import { useLanguage } from "./language-provider"
import type { Locale } from "@/lib/landing/translations"

export function LanguageToggle() {
  const { locale, setLocale } = useLanguage()
  const options: { value: Locale; label: string }[] = [
    { value: "ro", label: "RO" },
    { value: "en", label: "EN" },
  ]

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-secondary/60 p-0.5" role="group" aria-label="Language">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setLocale(o.value)}
          aria-pressed={locale === o.value}
          className={`inline-flex h-8 min-w-9 items-center justify-center rounded-md px-2 text-xs font-bold transition-colors ${
            locale === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
