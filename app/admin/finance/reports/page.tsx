"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Calendar,
  PieChart,
  TrendingUp,
  Truck,
  User,
} from "lucide-react";
import Link from "next/link";

const REPORT_TYPES = [
  {
    id: "forwarding-pnl",
    name: "Forwarding Orders P&L",
    description:
      "Per parent order: revenue, costs (internal + subcontract), profit, execution mix (internal/subcontracted/mixed), and customer + carrier invoice status.",
    icon: TrendingUp,
    ready: true,
    href: "/admin/finance/reports/forwarding-pnl",
  },
  {
    id: "internal-fleet-pnl",
    name: "Internal Fleet P&L",
    description:
      "Per trip: revenue (allocated to internal legs), actual costs (fuel, tolls, driver, other), optional planned costs from budgets, profit, margin and EUR/km — with orders and legs nested.",
    icon: Truck,
    ready: true,
    href: "/admin/finance/reports/internal-fleet-pnl",
  },
  {
    id: "cost-summary",
    name: "Cost Summary Report",
    description: "Summary of all costs by group and category for a selected period",
    icon: PieChart,
    ready: false,
  },
  {
    id: "pnl-statement",
    name: "P&L Statement",
    description: "Profit and loss statement with revenue, costs, and margin breakdown",
    icon: TrendingUp,
    ready: false,
  },
  {
    id: "vehicle-costs",
    name: "Vehicle Cost Analysis",
    description: "Detailed cost breakdown per vehicle with cost per km analysis",
    icon: Truck,
    ready: false,
  },
  {
    id: "driver-costs",
    name: "Driver Cost Analysis",
    description: "Cost analysis per driver including wages, per diem, and allocations",
    icon: User,
    ready: false,
  },
  {
    id: "budget-variance",
    name: "Budget Variance Report",
    description: "Compare actual spending against budget with variance analysis",
    icon: BarChart3,
    ready: false,
  },
  {
    id: "trip-profitability",
    name: "Trip Profitability Report",
    description: "Profitability analysis for individual trips and routes",
    icon: TrendingUp,
    ready: false,
  },
];

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Finance Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate financial reports and export data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Calendar className="h-4 w-4 mr-2" />
            Schedule Report
          </Button>
          <Button variant="outline">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export All Data
          </Button>
        </div>
      </div>

      {/* Status Notice */}
      <Card className="bg-emerald-500/5 border-emerald-500/20">
        <CardContent className="p-4">
          <p className="text-sm text-emerald-700 dark:text-emerald-500">
            <strong>New:</strong> The Forwarding Orders P&amp;L report is now
            live. More reports are on the way.
          </p>
        </CardContent>
      </Card>

      {/* Report Types */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORT_TYPES.map((report) => (
          <Card key={report.id} className={report.ready ? "" : "opacity-60"}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500/10">
                  <report.icon className="h-5 w-5 text-blue-500" />
                </div>
                {!report.ready && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    Coming Soon
                  </span>
                )}
              </div>
              <CardTitle className="text-base mt-3">{report.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {report.description}
              </p>
              {report.ready && (report as any).href ? (
                <Link href={(report as any).href}>
                  <Button variant="default" className="w-full">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Open Report
                  </Button>
                </Link>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!report.ready}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Generate Report
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Export</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/finance/cost-entries">
              <Button variant="outline">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Cost Entries
              </Button>
            </Link>
            <Link href="/admin/finance/cost-catalog">
              <Button variant="outline">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Cost Catalog
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
