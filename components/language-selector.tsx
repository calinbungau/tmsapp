"use client"

import { Check, Globe } from "lucide-react"
import { useTranslation } from "@/components/i18n/i18n-provider"
import { APP_LOCALES, type AppLocale } from "@/lib/i18n/dictionaries"
import { cn } from "@/lib/utils"

/**
 * Language selector. Reads/writes the locale from the I18nProvider, which
 * persists it to user_preferences (key: ui.language).
 *
 * variant="segmented" renders inline radio-style buttons (good for settings
 * panels); variant="list" renders a vertical list (good inside dropdowns).
 */
export function LanguageSelector({
  variant = "segmented",
  className,
}: {
  variant?: "segmented" | "list"
  className?: string
}) {
  const { locale, setLocale } = useTranslation()

  if (variant === "list") {
    return (
      <div className={cn("flex flex-col", className)} role="radiogroup" aria-label="Language">
        {APP_LOCALES.map((opt) => {
          const active = locale === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setLocale(opt.value as AppLocale)}
              className={cn(
                "flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                active
                  ? "bg-accent/15 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden>{opt.flag}</span>
                {opt.label}
              </span>
              {active ? <Check className="h-4 w-4 text-primary" /> : null}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1",
        className,
      )}
      role="radiogroup"
      aria-label="Language"
    >
      <Globe className="ml-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
      {APP_LOCALES.map((opt) => {
        const active = locale === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLocale(opt.value as AppLocale)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span aria-hidden>{opt.flag}</span>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
