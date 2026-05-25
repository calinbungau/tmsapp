"use client"

/**
 * Inline cost-code picker used in the import preview table.
 *
 * Shows the currently-resolved code as a clickable button. Opening the
 * popover reveals a searchable catalog (code + description + cost line)
 * so the reviewer can override what the resolver picked before commit.
 */

import { useEffect, useMemo, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Check, ChevronDown, AlertTriangle } from "lucide-react"

export interface CatalogEntry {
  id: string
  cost_code: string
  description?: string | null
  description_en?: string | null
  cost_line?: string | null
}

interface Props {
  value: string | null
  onChange: (next: { cost_code: string; cost_catalog_id: string | null }) => void
  catalog: CatalogEntry[]
  /** When true, the trigger uses an "unresolved" amber style. */
  unresolved?: boolean
}

export function CostCodePicker({ value, onChange, catalog, unresolved }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const current = useMemo(
    () => catalog.find((c) => c.cost_code === value) || null,
    [catalog, value],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return catalog.slice(0, 50)
    return catalog
      .filter((c) => {
        const hay = [c.cost_code, c.description, c.description_en, c.cost_line]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 50)
  }, [catalog, query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted/40 transition-colors ${
            unresolved && !value
              ? "border-amber-500/40 text-amber-500"
              : "border-border/60"
          }`}
          title={current?.description || current?.description_en || "Pick cost code"}
        >
          {value || "unresolved"}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, description…"
            className="h-8 text-xs"
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-xs text-muted-foreground text-center flex flex-col items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              No matches
            </div>
          ) : (
            filtered.map((c) => {
              const desc = c.description || c.description_en || ""
              const selected = c.cost_code === value
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange({ cost_code: c.cost_code, cost_catalog_id: c.id })
                    setOpen(false)
                  }}
                  className={`w-full flex items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/40 ${
                    selected ? "bg-muted/30" : ""
                  }`}
                >
                  <Check
                    className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                      selected ? "opacity-100 text-primary" : "opacity-0"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-medium">{c.cost_code}</span>
                      {c.cost_line && (
                        <span className="text-[10px] text-muted-foreground">{c.cost_line}</span>
                      )}
                    </div>
                    {desc && (
                      <p className="text-[11px] text-muted-foreground truncate">{desc}</p>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
        <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
          Showing {filtered.length} of {catalog.length} codes
        </div>
      </PopoverContent>
    </Popover>
  )
}
