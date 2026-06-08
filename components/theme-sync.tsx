"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { useUserPreference } from "@/hooks/use-user-preference"

/**
 * Bridges `next-themes` with the server-backed `user_preferences` row so a
 * user's chosen theme follows them across devices (key: `ui.theme`).
 *
 * next-themes already persists to localStorage for instant, flash-free first
 * paint. This component reconciles that local value with the per-user
 * preference: on load it applies the stored server value, and whenever the
 * user toggles the theme it writes the new value back.
 *
 * Mount once inside an authenticated shell (admin/driver/carrier layouts).
 */
export function ThemeSync() {
  const { theme, setTheme } = useTheme()
  const [storedTheme, setStoredTheme, { loaded }] = useUserPreference<"light" | "dark">(
    "ui.theme",
    "dark",
  )
  const appliedRemote = useRef(false)

  // Once the server value is loaded, apply it to next-themes (one time).
  useEffect(() => {
    if (!loaded || appliedRemote.current) return
    appliedRemote.current = true
    if (storedTheme && storedTheme !== theme) {
      setTheme(storedTheme)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, storedTheme])

  // After the initial reconcile, persist any local theme changes.
  useEffect(() => {
    if (!appliedRemote.current) return
    if (theme === "light" || theme === "dark") {
      if (theme !== storedTheme) setStoredTheme(theme)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  return null
}
