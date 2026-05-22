/**
 * Shared Leaflet tile-layer definitions and helper.
 *
 * Several maps in the app need the same set of base layers (Dispatch Board,
 * Telematic Live, Trip Editor map). Centralising the URL/zoom config + the
 * "swap tiles on a live map" helper avoids drift and makes a layer-switcher
 * trivial to drop into any Leaflet map.
 *
 * NOTE: The Google Maps tile URLs are unofficial endpoints. They work today
 * because Traccar uses them, but Google ToS technically requires the JS API
 * for production use; treat these as best-effort fallbacks.
 */
import L from "leaflet"

export type TileKey = "dark" | "osm" | "googleRoad" | "googleSatellite" | "googleHybrid" | "googleTerrain"

export interface TileLayerConfig {
  name: string
  url: string
  maxZoom: number
  /** Subdomains for {s} placeholder, when the URL uses {s}. */
  subdomains?: string
}

export const TILE_LAYERS: Record<TileKey, TileLayerConfig> = {
  dark: {
    name: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    maxZoom: 19,
    subdomains: "abcd",
  },
  osm: {
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
  },
  googleRoad: {
    name: "Google Roads",
    url: "https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
    maxZoom: 20,
  },
  googleSatellite: {
    name: "Google Satellite",
    url: "https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}",
    maxZoom: 20,
  },
  googleHybrid: {
    name: "Google Hybrid",
    url: "https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}",
    maxZoom: 20,
  },
  googleTerrain: {
    name: "Google Terrain",
    url: "https://mt0.google.com/vt/lyrs=p&hl=en&x={x}&y={y}&z={z}",
    maxZoom: 20,
  },
}

/** Iterable [key, config] pairs in display order. */
export const TILE_LAYER_ENTRIES: Array<[TileKey, TileLayerConfig]> =
  Object.entries(TILE_LAYERS) as Array<[TileKey, TileLayerConfig]>

/**
 * Add a tile layer to a Leaflet map and return the layer instance so callers
 * can remove it later when swapping. If `previous` is supplied, it is
 * removed from the map first to avoid stacking layers on each switch.
 */
export function applyTileLayer(
  map: L.Map,
  key: TileKey,
  previous?: L.TileLayer | null,
): L.TileLayer {
  const cfg = TILE_LAYERS[key] ?? TILE_LAYERS.dark
  if (previous) {
    try { map.removeLayer(previous) } catch {}
  }
  const layer = L.tileLayer(cfg.url, {
    maxZoom: cfg.maxZoom,
    ...(cfg.subdomains ? { subdomains: cfg.subdomains } : {}),
  })
  layer.addTo(map)
  // Keep base tiles below all overlays/markers
  layer.bringToBack()
  return layer
}

/** Validate a string before treating it as a TileKey. Returns null on miss. */
export function asTileKey(value: string | null | undefined): TileKey | null {
  if (!value) return null
  return value in TILE_LAYERS ? (value as TileKey) : null
}

/** localStorage helpers — keep tile preference per page so each map can have its own. */
export function readTilePref(storageKey: string, fallback: TileKey = "dark"): TileKey {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(storageKey)
    return asTileKey(raw) ?? fallback
  } catch {
    return fallback
  }
}

export function writeTilePref(storageKey: string, key: TileKey): void {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(storageKey, key) } catch {}
}
