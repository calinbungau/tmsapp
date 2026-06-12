"use client"

import { Languages, Palette } from "lucide-react"
import { useTranslation } from "@/components/i18n/i18n-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSelector } from "@/components/language-selector"

/**
 * Self-contained Appearance settings block: theme + language.
 * Both controls persist to user_preferences automatically.
 * Drop into any settings page across portals.
 */
export function AppearanceSettings() {
  const { t } = useTranslation()

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Palette className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold text-card-foreground">
          {t("settings.appearance", "Appearance")}
        </h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("settings.appearanceDesc", "Customise how the app looks on this device.")}
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-card-foreground">
              {t("settings.theme", "Theme")}
            </p>
          </div>
          <ThemeToggle />
        </div>

        <div className="h-px bg-border" />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-card-foreground">
                {t("settings.language", "Language")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings.languageDesc", "Choose the language used across the app.")}
              </p>
            </div>
          </div>
          <LanguageSelector />
        </div>
      </div>
    </div>
  )
}
