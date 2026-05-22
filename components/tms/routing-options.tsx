"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Truck, Route, ShieldAlert } from "lucide-react";

export interface TruckProfile {
  height: number;
  width: number;
  length: number;
  weight: number;
  axle_load: number;
  axle_count: number;
  hazmat: boolean;
}

export type RouteStrategy = "fastest" | "shortest" | "avoid_tolls";

export interface RoutingConfig {
  strategy: RouteStrategy;
  truck: TruckProfile;
}

// Build Valhalla costing_options from our config
export function buildCostingOptions(config: RoutingConfig) {
  const { strategy, truck } = config;
  const costingOptions: Record<string, unknown> = {
    height: truck.height,
    width: truck.width,
    length: truck.length,
    weight: truck.weight,
    axle_load: truck.axle_load,
    axle_count: truck.axle_count,
    hazmat: truck.hazmat,
  };

  switch (strategy) {
    case "fastest":
      costingOptions.use_tolls = 0.5;
      costingOptions.use_highways = 1.0;
      break;
    case "avoid_tolls":
      costingOptions.use_tolls = 0.0;
      costingOptions.use_highways = 0.3;
      break;
    case "shortest":
      costingOptions.shortest = true;
      costingOptions.use_tolls = 0.5;
      break;
  }

  return { truck: costingOptions };
}

export const DEFAULT_TRUCK_PROFILE: TruckProfile = {
  height: 4.0,
  width: 2.55,
  length: 16.5,
  weight: 40.0,
  axle_load: 8.0,
  axle_count: 5,
  hazmat: false,
};

export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  strategy: "fastest",
  truck: { ...DEFAULT_TRUCK_PROFILE },
};

interface RoutingOptionsProps {
  config: RoutingConfig;
  onChange: (config: RoutingConfig) => void;
  compact?: boolean;
  className?: string;
}

export function RoutingOptions({
  config,
  onChange,
  compact = false,
  className = "",
}: RoutingOptionsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const setStrategy = (strategy: RouteStrategy) => {
    onChange({ ...config, strategy });
  };

  const setTruck = (updates: Partial<TruckProfile>) => {
    onChange({
      ...config,
      truck: { ...config.truck, ...updates },
    });
  };

  const strategies: { value: RouteStrategy; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      value: "fastest",
      label: "Fastest",
      icon: <Route className="h-4 w-4" />,
      desc: "Quickest route, may include tolls",
    },
    {
      value: "avoid_tolls",
      label: "Avoid Tolls",
      icon: <ShieldAlert className="h-4 w-4" />,
      desc: "Minimize toll roads",
    },
    {
      value: "shortest",
      label: "Shortest",
      icon: <Truck className="h-4 w-4" />,
      desc: "Shortest distance",
    },
  ];

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Route Strategy Toggle */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Route Type
        </Label>
        <div className="flex gap-1">
          {strategies.map((s) => (
            <Button
              key={s.value}
              variant={config.strategy === s.value ? "default" : "outline"}
              size="sm"
              className="flex-1 gap-1.5 text-xs"
              onClick={() => setStrategy(s.value)}
              title={s.desc}
            >
              {s.icon}
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Truck Dimensions -- collapsible advanced section */}
      {!compact && (
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-xs text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                Truck Dimensions
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  showAdvanced ? "rotate-180" : ""
                }`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Height (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  value={config.truck.height}
                  onChange={(e) =>
                    setTruck({ height: parseFloat(e.target.value) || 4.0 })
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Width (m)</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="1"
                  max="4"
                  value={config.truck.width}
                  onChange={(e) =>
                    setTruck({ width: parseFloat(e.target.value) || 2.55 })
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Length (m)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="5"
                  max="25"
                  value={config.truck.length}
                  onChange={(e) =>
                    setTruck({ length: parseFloat(e.target.value) || 16.5 })
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Weight (t)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="3.5"
                  max="44"
                  value={config.truck.weight}
                  onChange={(e) =>
                    setTruck({ weight: parseFloat(e.target.value) || 40 })
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Axle Load (t)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="2"
                  max="13"
                  value={config.truck.axle_load}
                  onChange={(e) =>
                    setTruck({ axle_load: parseFloat(e.target.value) || 8 })
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Axles</Label>
                <Input
                  type="number"
                  step="1"
                  min="2"
                  max="7"
                  value={config.truck.axle_count}
                  onChange={(e) =>
                    setTruck({ axle_count: parseInt(e.target.value) || 5 })
                  }
                  className="h-7 text-xs"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Switch
                id="hazmat"
                checked={config.truck.hazmat}
                onCheckedChange={(checked) => setTruck({ hazmat: checked })}
              />
              <Label htmlFor="hazmat" className="text-xs text-muted-foreground cursor-pointer">
                Hazardous materials
              </Label>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

/**
 * Helper to call our Valhalla routing API endpoint.
 * Used by all components that need routing.
 */
export async function fetchValhallaRoute(
  locations: Array<{ lat: number; lng: number }>,
  config: RoutingConfig = DEFAULT_ROUTING_CONFIG
) {
  const res = await fetch("/api/tms/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: locations.map((loc) => ({
        lat: loc.lat,
        lon: loc.lng,
        type: "break",
      })),
      costing: "truck",
      costing_options: buildCostingOptions(config),
      units: "kilometers",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Routing request failed" }));
    throw new Error(err.error || "Routing request failed");
  }

  return res.json();
}
