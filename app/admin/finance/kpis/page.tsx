"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, Plus, TrendingUp, Gauge, BarChart3 } from "lucide-react";
import Link from "next/link";

export default function KPIsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6" />
            KPIs
          </h1>
          <p className="text-sm text-muted-foreground">
            Define and track key performance indicators
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Define KPI
        </Button>
      </div>

      {/* Coming Soon */}
      <Card>
        <CardContent className="p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-4">
            <Target className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold mb-2">KPI Management Coming Soon</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Define custom KPIs like cost per kilometer, margin percentage,
            or fuel efficiency. Set targets and track performance
            across vehicles, drivers, and routes.
          </p>
          <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span>Performance tracking</span>
            </div>
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              <span>Real-time dashboards</span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span>Trend analysis</span>
            </div>
          </div>
          <div className="mt-8">
            <Link href="/admin/finance/dashboard">
              <Button variant="outline">
                View Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Sample KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { name: "Cost per Kilometer", target: "€0.85/km", description: "Total operating cost divided by kilometers driven" },
          { name: "Gross Margin %", target: "15%", description: "Revenue minus costs as percentage of revenue" },
          { name: "Fuel Efficiency", target: "30 L/100km", description: "Average fuel consumption per 100 kilometers" },
          { name: "Driver Productivity", target: "8,000 km/month", description: "Average kilometers per driver per month" },
          { name: "Vehicle Utilization", target: "85%", description: "Percentage of time vehicles are in productive use" },
          { name: "On-Time Delivery", target: "95%", description: "Percentage of deliveries completed on schedule" },
        ].map((kpi, i) => (
          <Card key={i} className="opacity-60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{kpi.name}</span>
                <span className="text-xs text-muted-foreground">Target: {kpi.target}</span>
              </div>
              <p className="text-xs text-muted-foreground">{kpi.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
