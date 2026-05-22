"use client";

import React, { useMemo } from "react";
import { Filter, X, Sparkles, Mail, Truck as TruckIcon, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

// ─── Public types ────────────────────────────────────────────
//
// `OrdersFilterValue` is the *single source of truth* for what filters the
// user has currently applied. Both the Transport Orders page and the
// Forwarder Board page own one of these in state and pass it down here so
// the popover renders/edits the same shape everywhere.
//
// All string fields use the sentinel value "all" when not filtered. We use
// strings instead of nullable values because shadcn's <Select /> doesn't
// allow an empty-string item value and we want filter URLs to look clean
// if/when we ever serialize this to the query string.

export type CreatedFromValue = "all" | "manual" | "ai_email" | "ai_upload" | "carrier_email";

export interface OrdersFilterValue {
  customerId: string;      // "all" | uuid
  carrierId: string;       // "all" | uuid
  createdById: string;     // "all" | uuid
  createdFrom: CreatedFromValue;
  // ISO date strings (YYYY-MM-DD). Empty string = no bound.
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_FILTERS: OrdersFilterValue = {
  customerId: "all",
  carrierId: "all",
  createdById: "all",
  createdFrom: "all",
  dateFrom: "",
  dateTo: "",
};

// Count of non-default filters — drives the badge on the trigger button
// and the visibility of the chip strip.
export function countActiveFilters(v: OrdersFilterValue): number {
  let n = 0;
  if (v.customerId !== "all") n++;
  if (v.carrierId !== "all") n++;
  if (v.createdById !== "all") n++;
  if (v.createdFrom !== "all") n++;
  if (v.dateFrom) n++;
  if (v.dateTo) n++;
  return n;
}

// Human-friendly labels for the created_from values. Centralized so the
// popover, the chip strip, and the table column all stay in sync.
const SOURCE_META: Record<Exclude<CreatedFromValue, "all">, { label: string; icon: React.ReactNode; tone: string }> = {
  manual:         { label: "Manual",        icon: <Pencil className="h-3 w-3" />,   tone: "text-zinc-300 border-zinc-500/30 bg-zinc-500/10" },
  ai_email:       { label: "AI · Email",    icon: <Mail className="h-3 w-3" />,     tone: "text-violet-300 border-violet-500/30 bg-violet-500/10" },
  ai_upload:      { label: "AI · Upload",   icon: <Sparkles className="h-3 w-3" />, tone: "text-violet-300 border-violet-500/30 bg-violet-500/10" },
  carrier_email:  { label: "Carrier Email", icon: <TruckIcon className="h-3 w-3" />, tone: "text-indigo-300 border-indigo-500/30 bg-indigo-500/10" },
};

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "Manual";
  const meta = SOURCE_META[source as keyof typeof SOURCE_META];
  return meta ? meta.label : source;
}

// A tiny pill badge used in the table's "Added" column.
export function SourceBadge({ source }: { source: string | null | undefined }) {
  const key = (source || "manual") as keyof typeof SOURCE_META;
  const meta = SOURCE_META[key] || SOURCE_META.manual;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0 rounded text-[9px] leading-4 border ${meta.tone}`}
      title={meta.label}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

// ─── Props ───────────────────────────────────────────────────
interface BPOption { id: string; name: string }
interface UserOption { id: string; name: string }

export interface OrdersAdvancedFiltersProps {
  value: OrdersFilterValue;
  onChange: (v: OrdersFilterValue) => void;
  customers: BPOption[];
  carriers: BPOption[];
  users: UserOption[];
  // The Forwarder Board already has a dedicated carrier dropdown in its
  // toolbar (legacy). When that's the case we hide the carrier picker
  // inside the popover to avoid two controls fighting for the same state.
  hideCarrier?: boolean;
  // Allows the parent to align trigger size (e.g. sm:h-8) with its existing
  // toolbar without us guessing.
  triggerClassName?: string;
}

// ─── Trigger + popover ───────────────────────────────────────
export function OrdersAdvancedFilters({
  value,
  onChange,
  customers,
  carriers,
  users,
  hideCarrier,
  triggerClassName = "",
}: OrdersAdvancedFiltersProps) {
  const count = countActiveFilters(value);
  const set = <K extends keyof OrdersFilterValue>(k: K, v: OrdersFilterValue[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-10 md:h-8 text-sm md:text-xs gap-1.5 relative ${triggerClassName}`}
          aria-label={count > 0 ? `Filters (${count} active)` : "Filters"}
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filters</span>
          {count > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Advanced Filters
          </span>
          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTERS)}
              className="text-[11px] text-primary hover:underline"
            >
              Reset all
            </button>
          )}
        </div>

        <div className="p-4 space-y-3">
          <FilterRow label="Customer">
            <Select value={value.customerId} onValueChange={(v) => set("customerId", v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Any customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any customer</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterRow>

          {!hideCarrier && (
            <FilterRow label="Carrier">
              <Select value={value.carrierId} onValueChange={(v) => set("carrierId", v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Any carrier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any carrier</SelectItem>
                  {carriers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
          )}

          <FilterRow label="Created by (Dispatcher)">
            <Select value={value.createdById} onValueChange={(v) => set("createdById", v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Anyone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterRow>

          <FilterRow label="Source">
            <Select
              value={value.createdFrom}
              onValueChange={(v) => set("createdFrom", v as CreatedFromValue)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Any source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any source</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="ai_email">AI · Email</SelectItem>
                <SelectItem value="ai_upload">AI · Upload</SelectItem>
                <SelectItem value="carrier_email">Carrier Email</SelectItem>
              </SelectContent>
            </Select>
          </FilterRow>

          <FilterRow label="Created date">
            {/* Two adjacent native date inputs. We use native inputs (rather
                than the shadcn <Calendar /> popover) because two stacked
                popovers feel awful, and date inputs are perfectly accessible
                + keyboard-friendly out of the box. */}
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={value.dateFrom}
                onChange={(e) => set("dateFrom", e.target.value)}
                className="h-8 text-xs"
                aria-label="From date"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                type="date"
                value={value.dateTo}
                onChange={(e) => set("dateTo", e.target.value)}
                className="h-8 text-xs"
                aria-label="To date"
              />
            </div>
          </FilterRow>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── Active filter chips (rendered next to the search bar) ──────
// We render this OUTSIDE the popover so the user can see at a glance
// what's filtered, and one-click remove any chip.

interface ChipStripProps {
  value: OrdersFilterValue;
  onChange: (v: OrdersFilterValue) => void;
  customers: BPOption[];
  carriers: BPOption[];
  users: UserOption[];
}

export function OrdersFilterChips({
  value,
  onChange,
  customers,
  carriers,
  users,
}: ChipStripProps) {
  const lookup = useMemo(() => ({
    customer: new Map(customers.map(c => [c.id, c.name])),
    carrier: new Map(carriers.map(c => [c.id, c.name])),
    user: new Map(users.map(u => [u.id, u.name])),
  }), [customers, carriers, users]);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (value.customerId !== "all") {
    chips.push({
      key: "cust",
      label: `Customer: ${lookup.customer.get(value.customerId) || "?"}`,
      clear: () => onChange({ ...value, customerId: "all" }),
    });
  }
  if (value.carrierId !== "all") {
    chips.push({
      key: "carr",
      label: `Carrier: ${lookup.carrier.get(value.carrierId) || "?"}`,
      clear: () => onChange({ ...value, carrierId: "all" }),
    });
  }
  if (value.createdById !== "all") {
    chips.push({
      key: "by",
      label: `By: ${lookup.user.get(value.createdById) || "?"}`,
      clear: () => onChange({ ...value, createdById: "all" }),
    });
  }
  if (value.createdFrom !== "all") {
    chips.push({
      key: "src",
      label: `Source: ${sourceLabel(value.createdFrom)}`,
      clear: () => onChange({ ...value, createdFrom: "all" }),
    });
  }
  if (value.dateFrom) {
    chips.push({
      key: "df",
      label: `From: ${value.dateFrom}`,
      clear: () => onChange({ ...value, dateFrom: "" }),
    });
  }
  if (value.dateTo) {
    chips.push({
      key: "dt",
      label: `To: ${value.dateTo}`,
      clear: () => onChange({ ...value, dateTo: "" }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <Badge
          key={c.key}
          variant="outline"
          className="text-[10px] gap-1 pl-2 pr-1 py-0.5 border-primary/30 bg-primary/5 text-foreground"
        >
          {c.label}
          <button
            type="button"
            onClick={c.clear}
            className="rounded-full p-0.5 hover:bg-primary/20"
            aria-label={`Remove ${c.label}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
