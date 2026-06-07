"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { translations, type Locale, type Translation } from "@/lib/landing/translations"

type LanguageContextValue = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: Translation
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ro")

  useEffect(() => {
    const stored = typeof window !== "undefined" ? (localStorage.getItem("bng_lang") as Locale | null) : null
    if (stored === "ro" || stored === "en") {
      setLocaleState(stored)
    }
  }, [])

  const setLocale = (l: Locale) => {
    setLocaleState(l)
    if (typeof window !== "undefined") localStorage.setItem("bng_lang", l)
    document.documentElement.lang = l
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t: translations[locale] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider")
  return ctx
}
