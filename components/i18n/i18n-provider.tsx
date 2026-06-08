"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useUserPreference } from "@/hooks/use-user-preference"
import { dictionaries, resolvePath, type AppLocale } from "@/lib/i18n/dictionaries"

export type TranslateFn = (key: string, fallback?: string) => string

type I18nContextValue = {
  locale: AppLocale
  setLocale: (l: AppLocale) => void
  t: TranslateFn
  loaded: boolean
}

const I18nContext = createContext<I18nContextValue | null>(null)

/**
 * App-wide i18n provider.
 *
 * The selected locale is persisted per-user in `user_preferences`
 * (key: `ui.language`) through the existing `useUserPreference` hook,
 * which also keeps an optimistic localStorage cache so the first paint
 * is never wrong. Default locale is English.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale, { loaded }] = useUserPreference<AppLocale>("ui.language", "en")

  // Keep <html lang> in sync for accessibility / SEO.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale
    }
  }, [locale])

  const value = useMemo<I18nContextValue>(() => {
    const t: TranslateFn = (key, fallback) => {
      const dict = dictionaries[locale] ?? dictionaries.en
      const hit = resolvePath(dict, key)
      if (hit !== undefined) return hit
      // Fall back to English, then the provided fallback, then the key.
      const enHit = resolvePath(dictionaries.en, key)
      return enHit ?? fallback ?? key
    }
    return { locale, setLocale, t, loaded }
  }, [locale, setLocale, loaded])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useTranslation() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Safe fallback so components used outside the provider (or during very
    // early renders) don't crash — they just get identity translations.
    return {
      locale: "en" as AppLocale,
      setLocale: () => {},
      t: ((key: string, fallback?: string) => fallback ?? key) as TranslateFn,
      loaded: false,
    }
  }
  return ctx
}
