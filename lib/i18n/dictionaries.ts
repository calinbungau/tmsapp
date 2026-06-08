// App-wide i18n dictionaries (separate from the marketing/landing translations).
//
// This is the shared infrastructure for translating the authenticated app
// shell (admin / driver / carrier dashboards). Strings are organised by
// feature area and looked up with dot-paths via the `t()` helper returned by
// `useTranslation()`, e.g. `t("common.save")` or `t("nav.dashboard")`.
//
// Screens are migrated to these keys incrementally. When a key is missing the
// `t()` helper falls back to the key itself so untranslated UI still renders.

export type AppLocale = "ro" | "en"

export const APP_LOCALES: { value: AppLocale; label: string; flag: string }[] = [
  { value: "ro", label: "Română", flag: "🇷🇴" },
  { value: "en", label: "English", flag: "🇬🇧" },
]

type Dict = Record<string, unknown>

const en: Dict = {
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    create: "Create",
    update: "Update",
    close: "Close",
    confirm: "Confirm",
    search: "Search",
    filter: "Filter",
    loading: "Loading...",
    noResults: "No results found",
    actions: "Actions",
    status: "Status",
    yes: "Yes",
    no: "No",
    back: "Back",
    next: "Next",
    previous: "Previous",
    all: "All",
    today: "Today",
    settings: "Settings",
    logout: "Log out",
    profile: "Profile",
  },
  nav: {
    dashboard: "Dashboard",
    dispatch: "Dispatch",
    fleet: "Fleet",
    orders: "Orders",
    trips: "Trips",
    invoices: "Invoices",
    expenses: "Expenses",
    drivers: "Drivers",
    vehicles: "Vehicles",
    customers: "Customers",
    reports: "Reports",
    exchange: "Freight Exchange",
    settings: "Settings",
  },
  settings: {
    title: "Settings",
    appearance: "Appearance",
    appearanceDesc: "Customise how the app looks on this device.",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    themeSystem: "System",
    language: "Language",
    languageDesc: "Choose the language used across the app.",
  },
  theme: {
    toggle: "Toggle theme",
    light: "Light",
    dark: "Dark",
  },
}

const ro: Dict = {
  common: {
    save: "Salvează",
    cancel: "Anulează",
    delete: "Șterge",
    edit: "Editează",
    add: "Adaugă",
    create: "Creează",
    update: "Actualizează",
    close: "Închide",
    confirm: "Confirmă",
    search: "Caută",
    filter: "Filtrează",
    loading: "Se încarcă...",
    noResults: "Niciun rezultat",
    actions: "Acțiuni",
    status: "Stare",
    yes: "Da",
    no: "Nu",
    back: "Înapoi",
    next: "Următorul",
    previous: "Anteriorul",
    all: "Toate",
    today: "Astăzi",
    settings: "Setări",
    logout: "Deconectare",
    profile: "Profil",
  },
  nav: {
    dashboard: "Tablou de bord",
    dispatch: "Dispecerat",
    fleet: "Flotă",
    orders: "Comenzi",
    trips: "Curse",
    invoices: "Facturi",
    expenses: "Cheltuieli",
    drivers: "Șoferi",
    vehicles: "Vehicule",
    customers: "Clienți",
    reports: "Rapoarte",
    exchange: "Bursa de transport",
    settings: "Setări",
  },
  settings: {
    title: "Setări",
    appearance: "Aspect",
    appearanceDesc: "Personalizează modul în care arată aplicația pe acest dispozitiv.",
    theme: "Temă",
    themeDark: "Întunecat",
    themeLight: "Luminos",
    themeSystem: "Sistem",
    language: "Limbă",
    languageDesc: "Alege limba folosită în aplicație.",
  },
  theme: {
    toggle: "Schimbă tema",
    light: "Luminos",
    dark: "Întunecat",
  },
}

export const dictionaries: Record<AppLocale, Dict> = { ro, en }

// Resolve a dot-path ("settings.theme") against a dictionary object.
export function resolvePath(dict: Dict, path: string): string | undefined {
  const parts = path.split(".")
  let current: unknown = dict
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Dict)) {
      current = (current as Dict)[part]
    } else {
      return undefined
    }
  }
  return typeof current === "string" ? current : undefined
}
