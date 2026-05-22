"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminSession } from "@/hooks/use-admin-session";

/**
 * useUserPreference
 *
 * Per-user, server-backed UI preference with an optimistic localStorage
 * cache. The hook returns immediately with the cached or default value
 * (so first paint is never blank), then reconciles with the server
 * row in `user_preferences`. Writes update the local state, the cache,
 * and PATCH the server in the background.
 *
 *   const [tile, setTile] = useUserPreference<TileKey>("map.tile.dispatch", "dark");
 *
 * Conventions:
 *  - `key` is a dotted path (`map.tile.dispatch`, `sidebar.collapsed`, …).
 *  - The same key works for both authenticated (server-persisted) and
 *    anonymous (localStorage-only) sessions, so feature code never has
 *    to branch on auth state.
 */
export function useUserPreference<T>(
  key: string,
  defaultValue: T,
): [T, (next: T) => void, { loaded: boolean }] {
  const { session } = useAdminSession();
  const userId = session?.user_id ?? session?.id ?? null;

  const cacheKey = `pref:${key}`;
  const lastSyncedJsonRef = useRef<string | null>(null);

  // Optimistic initial value: localStorage if any, otherwise the default.
  // Keeps SSR safe by guarding window access.
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (raw == null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });
  const [loaded, setLoaded] = useState(false);

  // Pull the canonical value from the server once we know who's signed in.
  // We only overwrite local state if the server value actually differs from
  // what we already have, so a quick local edit can't be clobbered by an
  // in-flight GET.
  useEffect(() => {
    if (!userId) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/user-preferences?userId=${userId}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        const remote = j?.preferences?.[key];
        if (cancelled) return;
        if (remote !== undefined) {
          const remoteJson = JSON.stringify(remote);
          if (remoteJson !== JSON.stringify(value)) {
            setValue(remote as T);
            try { window.localStorage.setItem(cacheKey, remoteJson); } catch {}
          }
          lastSyncedJsonRef.current = remoteJson;
        }
      } catch (err) {
        console.log("[v0] useUserPreference load failed", key, err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
    // We intentionally only re-run on userId/key changes; `value` is
    // omitted to avoid a feedback loop on every local edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key]);

  const update = useCallback((next: T) => {
    setValue(next);
    try { window.localStorage.setItem(cacheKey, JSON.stringify(next)); } catch {}
    if (!userId) return;

    // Best-effort fire-and-forget PATCH. If it fails, the local cache still
    // holds the value and the next session will resync it.
    const json = JSON.stringify(next);
    if (json === lastSyncedJsonRef.current) return;
    lastSyncedJsonRef.current = json;
    fetch(`/api/admin/user-preferences?userId=${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch: { [key]: next } }),
    }).catch(err => {
      console.log("[v0] useUserPreference save failed", key, err);
    });
  }, [userId, key, cacheKey]);

  return [value, update, { loaded }];
}
