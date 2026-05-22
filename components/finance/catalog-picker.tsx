"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, X, Loader2 } from "lucide-react";

export interface CatalogItem {
  id: string;
  cost_code: string;
  cost_line: string;
  unit: string | null;
  nature: string | null;
  behavior: string | null;
  is_system: boolean;
  driver_allowed: boolean;
  manual_allowed: boolean;
}

interface Props {
  /** Currently selected catalog row id (uuid). */
  value: string | null;
  /** Receives the full row when one is picked, or null when cleared. */
  onChange: (item: CatalogItem | null) => void;
  /** Restrict to items a driver is allowed to submit (default false). */
  driverOnly?: boolean;
  /** Restrict to items admins can post manually (default false). */
  manualOnly?: boolean;
  /** Override placeholder text. */
  placeholder?: string;
  /** Tailwind size class set, default matches the trip-expenses inline form (h-8 text-[11px]). */
  className?: string;
  /** Disable the picker. */
  disabled?: boolean;
  /** Pre-loaded item to render the selected label without a fetch round-trip. */
  initialItem?: CatalogItem | null;
}

/**
 * Searchable cost-catalog combobox.
 *
 * Renders the selected row as `CODE · description (unit)` and opens a
 * filterable popover over `/api/admin/finance/cost-catalog`. Debounced
 * server-side search means it scales to the full chart of accounts (~300
 * rows) without shipping the whole list to the client.
 */
export function CatalogPicker({
  value,
  onChange,
  driverOnly = false,
  manualOnly = false,
  placeholder = "Pick a cost code...",
  className = "h-8 text-[11px]",
  disabled = false,
  initialItem = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<CatalogItem | null>(initialItem);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve initial item if only an id was provided
  useEffect(() => {
    if (!value) { setSelected(null); return; }
    if (selected?.id === value) return;
    if (initialItem?.id === value) { setSelected(initialItem); return; }
    // Fetch the single item by id via the search API (we filter clientside on the result list).
    let cancelled = false;
    (async () => {
      try {
        const url = new URL("/api/admin/finance/cost-catalog", window.location.origin);
        url.searchParams.set("limit", "500");
        if (driverOnly) url.searchParams.set("driver", "1");
        if (manualOnly) url.searchParams.set("manual", "1");
        const res = await fetch(url);
        const j = await res.json();
        const found = (j.items as CatalogItem[]).find(i => i.id === value);
        if (!cancelled && found) setSelected(found);
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search whenever the popover is open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const url = new URL("/api/admin/finance/cost-catalog", window.location.origin);
        if (q.trim()) url.searchParams.set("q", q.trim());
        if (driverOnly) url.searchParams.set("driver", "1");
        if (manualOnly) url.searchParams.set("manual", "1");
        url.searchParams.set("limit", "100");
        const res = await fetch(url);
        const j = await res.json();
        setItems(j.items ?? []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [open, q, driverOnly, manualOnly]);

  // Click-outside dismissal
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Group items by the first character of the cost_code (A1, A2, B1, ...) for visual scanning
  const grouped = useMemo(() => {
    const groups = new Map<string, CatalogItem[]>();
    for (const it of items) {
      const key = it.cost_code.split("-")[0] || "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }
    return Array.from(groups.entries());
  }, [items]);

  function pick(it: CatalogItem | null) {
    setSelected(it);
    onChange(it);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={wrapRef} className={`relative ${className.includes("col-span") ? className : ""}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={`w-full flex items-center gap-1.5 px-2 rounded-md border border-border/50 bg-background hover:border-border transition-colors disabled:opacity-50 ${className}`}
      >
        {selected ? (
          <>
            <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary font-mono text-[10px] font-semibold tabular-nums shrink-0">
              {selected.cost_code}
            </span>
            <span className="truncate text-foreground/90">{selected.cost_line}</span>
            {selected.unit && (
              <span className="text-muted-foreground/70 text-[10px] shrink-0">/{selected.unit}</span>
            )}
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); pick(null); }}
              className="ml-auto p-0.5 rounded hover:bg-muted text-muted-foreground/70"
              aria-label="Clear selection"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <>
            <Search className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            <span className="text-muted-foreground/70 truncate">{placeholder}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground/60 ml-auto shrink-0" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute z-50 left-0 mt-1 min-w-full w-max max-w-[440px] rounded-lg border border-border/60 bg-popover shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/40 bg-background">
            <Search className="h-3 w-3 text-muted-foreground/60" />
            <input
              ref={inputRef}
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by code (A1-001) or name (motorina, toll, parking)..."
              className="flex-1 bg-transparent outline-none text-[11px] py-0.5"
            />
            {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />}
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {!loading && items.length === 0 && (
              <div className="px-3 py-4 text-center text-[10px] text-muted-foreground/70">
                No matches. Try a different keyword.
              </div>
            )}
            {grouped.map(([prefix, list]) => (
              <div key={prefix}>
                <div className="px-2 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/50 bg-muted/30">
                  {prefix}
                </div>
                {list.map(it => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => pick(it)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/50 transition-colors ${
                      selected?.id === it.id ? "bg-primary/10" : ""
                    }`}
                  >
                    <span className="px-1.5 py-0.5 rounded bg-muted text-foreground/80 font-mono text-[10px] font-semibold tabular-nums shrink-0">
                      {it.cost_code}
                    </span>
                    <span className="flex-1 truncate text-[11px]">{it.cost_line}</span>
                    {it.unit && (
                      <span className="text-[9px] text-muted-foreground/70 shrink-0">/{it.unit}</span>
                    )}
                    {it.is_system && (
                      <span className="text-[8px] uppercase tracking-wider px-1 rounded bg-muted-foreground/10 text-muted-foreground/70">
                        sys
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
