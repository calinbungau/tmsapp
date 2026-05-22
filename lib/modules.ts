/**
 * ENABLED_MODULES system
 *
 * Controls which modules are visible and accessible per deployment.
 * Set NEXT_PUBLIC_ENABLED_MODULES env var as a comma-separated list.
 *
 * Examples:
 *   NEXT_PUBLIC_ENABLED_MODULES=tms,fsm,forms,email,chat,documents,maintenance,hr,masterdata,settings,logs
 *   NEXT_PUBLIC_ENABLED_MODULES=fsm,forms
 *
 * If the env var is not set or empty, ALL modules are enabled (backwards compatible).
 */

// All available modules in the system
export const ALL_MODULES = [
  "tms",
  "fsm",
  "telematic",
  "forms",
  "documents",
  "maintenance",
  "hr",
  "finance",
  "masterdata",
  "email",
  "chat",
  "settings",
  "logs",
] as const;

export type ModuleKey = (typeof ALL_MODULES)[number];

// Parse the env var once
const envModules = typeof window !== "undefined"
  ? process.env.NEXT_PUBLIC_ENABLED_MODULES
  : process.env.NEXT_PUBLIC_ENABLED_MODULES;

const parsedModules: Set<string> | null = envModules
  ? new Set(envModules.split(",").map((m) => m.trim().toLowerCase()).filter(Boolean))
  : null; // null means "all enabled" (no restriction)

/**
 * Check if a specific module is enabled for this deployment.
 * If NEXT_PUBLIC_ENABLED_MODULES is not set, everything is enabled.
 * "core" is always enabled (dashboard, profile, auth).
 */
export function isModuleEnabled(module: string): boolean {
  // Core features are always accessible
  if (module === "core") return true;

  // If env var not set, everything is enabled (backwards compatible)
  if (!parsedModules) return true;

  return parsedModules.has(module.toLowerCase());
}

/**
 * Get the list of enabled modules.
 * Returns null if all modules are enabled (no restriction).
 */
export function getEnabledModules(): string[] | null {
  if (!parsedModules) return null; // all enabled
  return Array.from(parsedModules);
}

/**
 * Route-to-module mapping for middleware/route protection.
 * Maps route prefixes to their parent module.
 */
export const ROUTE_MODULE_MAP: Record<string, ModuleKey> = {
  "/admin/tms": "tms",
  "/admin/orders": "tms", // legacy route alias
  "/admin/fsm": "fsm",
  "/admin/telematic": "telematic",
  "/admin/forms": "forms",
  "/admin/documents": "documents",
  "/admin/maintenance": "maintenance",
  "/admin/hr": "hr",
  "/admin/finance": "finance",
  "/admin/drivers": "masterdata",
  "/admin/vehicles": "masterdata",
  "/admin/trailers": "masterdata",
  "/admin/employees": "masterdata",
  "/admin/departments": "masterdata",
  "/admin/business-partners": "masterdata",
  "/admin/email": "email",
  "/admin/chat": "chat",
  "/admin/settings": "settings",
  "/admin/logs": "logs",
};

/**
 * Check if a route is accessible based on enabled modules.
 * Returns true if accessible, false if blocked.
 */
export function isRouteAccessible(pathname: string): boolean {
  // If no restrictions, everything is accessible
  if (!parsedModules) return true;

  // Core routes always accessible
  if (pathname === "/admin" || pathname === "/admin/notifications" || pathname === "/admin/profile") {
    return true;
  }

  // Find matching module for this route
  for (const [prefix, module] of Object.entries(ROUTE_MODULE_MAP)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return parsedModules.has(module);
    }
  }

  // Unknown routes are accessible (safe default)
  return true;
}
