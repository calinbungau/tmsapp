"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { useTranslation } from "@/components/i18n/i18n-provider"
import { cn } from "@/lib/utils"

/**
 * Segmented Light / Dark control. Writes to next-themes; the ThemeSync
 * component persists the choice to user_preferences.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — theme is only known on the client.
  useEffect(() => setMounted(true), [])

  const current = mounted ? theme : "dark"

  const options = [
    { value: "light", label: t("theme.light", "Light"), icon: Sun },
    { value: "dark", label: t("theme.dark", "Dark"), icon: Moon },
  ] as const

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1",
        className,
      )}
      role="radiogroup"
      aria-label={t("theme.toggle", "Toggle theme")}
    >
      {options.map((opt) => {
        const Icon = opt.icon
        const active = current === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
