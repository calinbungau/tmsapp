"use client";

import { useState } from "react";
import {
  ChevronUp, ChevronDown, LayoutDashboard, Route, Receipt, FileText,
  Activity, MessageSquare, Wallet, Fuel,
} from "lucide-react";
import { TabOverview } from "./tabs/tab-overview";
import { TabPlannedVsActual } from "./tabs/tab-planned-vs-actual";
import { TabFuel } from "./tabs/tab-fuel";
import { TabExpenses } from "./tabs/tab-expenses";
import { TabDocuments } from "./tabs/tab-documents";
import { TabPnL } from "./tabs/tab-pnl";
import { TabActivity } from "./tabs/tab-activity";
import { TabMessages } from "./tabs/tab-messages";

export type DrawerTab =
  | "overview" | "planned-vs-actual" | "fuel" | "expenses" | "documents"
  | "pnl" | "activity" | "messages";

const TABS: { id: DrawerTab; label: string; icon: any }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "planned-vs-actual", label: "Planned vs Actual", icon: Route },
  { id: "fuel", label: "Fuel", icon: Fuel },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "pnl", label: "P&L", icon: Wallet },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "messages", label: "Messages", icon: MessageSquare },
];

interface Props {
  tripId: string;
  trip: any;
  stops: any[];
  linkedOrders: any[];
  routeInfo: { geometry: [number, number][] | null; distance_km: number; duration_hours: number; legs: any[] };
  initialTab?: DrawerTab;
  initialOpen?: boolean;
  /**
   * Optional controlled open state. When `open` + `onOpenChange` are
   * supplied, the drawer becomes a fully controlled component (parents
   * can persist the open state in user_preferences). Otherwise it falls
   * back to internal state seeded with `initialOpen`.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Left offset in pixels — used to clear the trip editor's side panels. */
  leftOffset?: number;
  onPnLChange?: () => void;
  onGpsTrackChange?: (
    track: {
      source: string;
      positions: { lat: number; lng: number; timestamp: string }[];
      hoveredSegmentIdx?: number | null;
      selectedSegmentIdx?: number | null;
      segments?: Array<{
        type: "trip" | "stop";
        color: string;
        loaded: boolean;
        from: string;
        to: string;
        distance_km: number;
        avg_speed_kmh: number;
        max_speed_kmh: number;
        start_lat: number;
        start_lng: number;
        end_lat: number;
        end_lng: number;
        positions: {
          lat: number;
          lng: number;
          timestamp: string;
          speed?: number | null;
          heading?: number | null;
        }[];
      }>;
    } | null
  ) => void;
  onOptimizeStops?: (newOrder: any[]) => void;
}

export function TripOpsDrawer({
  tripId, trip, stops, linkedOrders, routeInfo,
  initialTab = "overview", initialOpen = true, leftOffset = 340,
  open: controlledOpen, onOpenChange,
  onPnLChange, onGpsTrackChange, onOptimizeStops,
}: Props) {
  // Controlled vs uncontrolled — same pattern as Radix primitives.
  const [internalOpen, setInternalOpen] = useState(initialOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? (controlledOpen as boolean) : internalOpen;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === "function" ? (next as (p: boolean) => boolean)(open) : next;
    if (!isControlled) setInternalOpen(value);
    onOpenChange?.(value);
  };

  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const [pnlVersion, setPnlVersion] = useState(0);

  const refreshPnL = () => {
    setPnlVersion(v => v + 1);
    onPnLChange?.();
  };

  return (
    <div
      className={`
        /* Mobile: fixed bottom bar */
        fixed md:absolute
        inset-x-0 md:inset-x-auto
        bottom-0 md:bottom-3 md:right-3
        z-[550]
        flex flex-col
        bg-background/95 md:bg-background/80 backdrop-blur-xl
        rounded-t-2xl md:rounded-2xl
        shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.4)] md:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)]
        ring-1 ring-white/5 border border-border/40
        overflow-hidden
        transition-[height,left] duration-300 ease-out
        ${open ? "h-[50vh] md:h-[44vh] min-h-[280px] md:min-h-[320px]" : "h-[48px] md:h-[44px]"}
      `}
      style={{ left: typeof window !== "undefined" && window.innerWidth >= 768 ? `${leftOffset}px` : undefined }}
    >
      {/* Tabs row */}
      <div className="flex items-center gap-1 pl-2 pr-1.5 h-[44px] border-b border-border/30 shrink-0 bg-gradient-to-b from-background/40 to-transparent">
        <div className="flex items-center gap-0.5 overflow-x-auto flex-1 scrollbar-none">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTab(t.id); setOpen(true); }}
                className={`relative flex items-center gap-1.5 px-2.5 h-[30px] rounded-md text-[11px] font-medium whitespace-nowrap transition-all ${
                  active && open
                    ? "text-foreground"
                    : "text-muted-foreground/80 hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                {active && open && (
                  <span className="absolute inset-0 rounded-md bg-foreground/[0.07] ring-1 ring-foreground/10" aria-hidden />
                )}
                <Icon className={`h-3.5 w-3.5 relative ${active && open ? "text-primary" : ""}`} />
                <span className="relative tracking-tight">{t.label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="ml-1 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/80 hover:bg-foreground/5 hover:text-foreground transition-colors"
          title={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Tab content */}
      {open && (
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === "overview" && (
            <TabOverview tripId={tripId} trip={trip} stops={stops} linkedOrders={linkedOrders} routeInfo={routeInfo} onOptimizeStops={onOptimizeStops} />
          )}
          {tab === "planned-vs-actual" && (
            <TabPlannedVsActual tripId={tripId} trip={trip} stops={stops} onGpsTrackChange={onGpsTrackChange} />
          )}
          {tab === "fuel" && (
            <TabFuel tripId={tripId} trip={trip} onChange={refreshPnL} />
          )}
          {tab === "expenses" && (
            <TabExpenses tripId={tripId} trip={trip} linkedOrders={linkedOrders} onChange={refreshPnL} />
          )}
          {tab === "documents" && (
            <TabDocuments tripId={tripId} linkedOrders={linkedOrders} />
          )}
          {tab === "pnl" && (
            <TabPnL tripId={tripId} refreshKey={pnlVersion} routeInfo={routeInfo} />
          )}
          {tab === "activity" && (
            <TabActivity tripId={tripId} />
          )}
          {tab === "messages" && (
            <TabMessages 
              tripId={tripId} 
              adminId={trip?.admin_id || ""} 
              tripReference={trip?.reference_number}
              driverId={trip?.driver_id}
              driverName={trip?.driver?.name}
            />
          )}
        </div>
      )}
    </div>
  );
}
