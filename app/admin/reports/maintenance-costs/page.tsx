"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAdminSession } from "@/hooks/use-admin-session";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Car,
  Wrench,
  Download,
  Calendar,
  FileText,
  ArrowLeft,
  FileSpreadsheet,
  TrendingUp,
} from "lucide-react";
import type { Vehicle, MaintenanceType } from "@/lib/types";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

interface MaintenanceCostData {
  id: string;
  maintenance_record_id: string;
  description: string | null;
  cost: number;
  cost_currency: string;
  invoice_url: string | null;
  created_at: string;
  maintenance_record: {
    id: string;
    maintenance_number: number | null;
    completed_date: string | null;
    vehicle: Vehicle;
    maintenance_type: MaintenanceType | null;
  } | null;
}

export default function MaintenanceReportsPage() {
  const { session: adminSession } = useAdminSession();
  const [costs, setCosts] = useState<MaintenanceCostData[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState<MaintenanceType[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedVehicle, setSelectedVehicle] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchData = async () => {
    if (!adminSession?.id) return;

    setLoading(true);
    const supabase = createClient();

    // Fetch maintenance costs with related data
    const { data: costsData, error: costsError } = await supabase
      .from("maintenance_costs")
      .select(`
        *,
        maintenance_record:maintenance_records(
          id,
          maintenance_number,
          completed_date,
          admin_id,
          vehicle:vehicles(*),
          maintenance_type:maintenance_types(*)
        )
      `)
      .order("created_at", { ascending: false });

    if (costsData) {
      // Filter by admin_id through maintenance_records
      const filteredCosts = costsData.filter(
        (c) => c.maintenance_record?.admin_id === adminSession.id
      );
      setCosts(filteredCosts as MaintenanceCostData[]);
    }

    // Fetch vehicles
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select("*")
      .eq("admin_id", adminSession.id)
      .order("plate_number");

    if (vehiclesData) {
      setVehicles(vehiclesData);
    }

    // Fetch maintenance types
    const { data: typesData } = await supabase
      .from("maintenance_types")
      .select("*")
      .eq("admin_id", adminSession.id)
      .order("name");

    if (typesData) {
      setMaintenanceTypes(typesData);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [adminSession?.id]);

  // Filter costs based on date range and vehicle/type selection
  const filteredCosts = costs.filter((c) => {
    // Vehicle filter
    if (selectedVehicle !== "all" && c.maintenance_record?.vehicle?.id !== selectedVehicle) {
      return false;
    }
    // Type filter
    if (selectedType !== "all" && c.maintenance_record?.maintenance_type?.id !== selectedType) {
      return false;
    }
    // Date filters - use created_at if completed_date is not available
    const costDate = c.maintenance_record?.completed_date || c.created_at;
    if (dateFrom && costDate) {
      if (new Date(costDate) < new Date(dateFrom)) {
        return false;
      }
    }
    if (dateTo && costDate) {
      if (new Date(costDate) > new Date(dateTo + "T23:59:59")) {
        return false;
      }
    }
    return true;
  });

  // Calculate totals (group by currency)
  const totalsByCurrency = filteredCosts.reduce((acc, c) => {
    const currency = c.cost_currency || "EUR";
    acc[currency] = (acc[currency] || 0) + (c.cost || 0);
    return acc;
  }, {} as Record<string, number>);

  // Group by vehicle
  const costsByVehicle = filteredCosts.reduce((acc, c) => {
    const vehicleId = c.maintenance_record?.vehicle?.id;
    if (!vehicleId) return acc;
    if (!acc[vehicleId]) {
      acc[vehicleId] = {
        vehicle: c.maintenance_record!.vehicle,
        totalsByCurrency: {} as Record<string, number>,
        count: 0,
      };
    }
    const currency = c.cost_currency || "EUR";
    acc[vehicleId].totalsByCurrency[currency] = (acc[vehicleId].totalsByCurrency[currency] || 0) + (c.cost || 0);
    acc[vehicleId].count += 1;
    return acc;
  }, {} as Record<string, { vehicle: Vehicle; totalsByCurrency: Record<string, number>; count: number }>);

  // Group by type
  const costsByType = filteredCosts.reduce((acc, c) => {
    const typeId = c.maintenance_record?.maintenance_type?.id;
    if (!typeId) return acc;
    if (!acc[typeId]) {
      acc[typeId] = {
        type: c.maintenance_record!.maintenance_type!,
        totalsByCurrency: {} as Record<string, number>,
        count: 0,
      };
    }
    const currency = c.cost_currency || "EUR";
    acc[typeId].totalsByCurrency[currency] = (acc[typeId].totalsByCurrency[currency] || 0) + (c.cost || 0);
    acc[typeId].count += 1;
    return acc;
  }, {} as Record<string, { type: MaintenanceType; totalsByCurrency: Record<string, number>; count: number }>);

  // Calculate monthly costs for chart (last 12 months)
  const monthlyCosts = (() => {
    const monthlyData: Record<string, number> = {};
    const now = new Date();
    
    // Initialize last 12 months with 0
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthlyData[key] = 0;
    }
    
    // Sum costs by month (convert all to EUR for simplicity in chart)
    costs.forEach((c) => {
      const costDate = c.maintenance_record?.completed_date || c.created_at;
      if (costDate) {
        const date = new Date(costDate);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        if (monthlyData[key] !== undefined) {
          // Simple conversion rates for display (approximate)
          let amount = c.cost || 0;
          if (c.cost_currency === "RON") amount = amount / 5;
          else if (c.cost_currency === "GBP") amount = amount * 1.15;
          else if (c.cost_currency === "USD") amount = amount * 0.92;
          monthlyData[key] += amount;
        }
      }
    });
    
    return Object.entries(monthlyData).map(([month, total]) => ({
      month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      total: Math.round(total * 100) / 100,
    }));
  })();

  const chartConfig = {
    total: {
      label: "Total Cost (EUR)",
      color: "hsl(var(--primary))",
    },
  } satisfies ChartConfig;

  const formatCurrency = (amount: number, currency: string) => {
    const symbols: Record<string, string> = { EUR: "€", RON: "RON ", GBP: "£", USD: "$" };
    return `${symbols[currency] || currency + " "}${amount.toFixed(2)}`;
  };

  const formatTotalsByCurrency = (totals: Record<string, number>) => {
    return Object.entries(totals)
      .map(([currency, amount]) => formatCurrency(amount, currency))
      .join(" + ");
  };

  const exportToCSV = () => {
    const escapeCSV = (str: string) => {
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Create CSV content
    let csv = "Date,Vehicle,Model,Maintenance Type,Maintenance #,Description,Amount,Currency,Invoice URL\n";
    
    filteredCosts.forEach((c) => {
      const date = c.maintenance_record?.completed_date || c.created_at;
      csv += [
        date ? new Date(date).toLocaleDateString() : "",
        escapeCSV(c.maintenance_record?.vehicle?.plate_number || ""),
        escapeCSV((c.maintenance_record?.vehicle?.make || "") + " " + (c.maintenance_record?.vehicle?.model || "")),
        escapeCSV(c.maintenance_record?.maintenance_type?.name || "Unassigned"),
        c.maintenance_record?.maintenance_number || "",
        escapeCSV(c.description || ""),
        c.cost || 0,
        c.cost_currency || "EUR",
        escapeCSV(c.invoice_url || ""),
      ].join(",") + "\n";
    });

    // Add summary section
    csv += "\n\nSUMMARY\n";
    csv += `Report Period,${dateFrom || "All time"} - ${dateTo || "Present"}\n`;
    csv += `Vehicle Filter,${selectedVehicle === "all" ? "All Vehicles" : vehicles.find((v) => v.id === selectedVehicle)?.plate_number || ""}\n`;
    csv += `Type Filter,${selectedType === "all" ? "All Types" : maintenanceTypes.find((t) => t.id === selectedType)?.name || ""}\n`;
    csv += `Total Records,${filteredCosts.length}\n`;
    
    Object.entries(totalsByCurrency).forEach(([currency, total]) => {
      csv += `Total (${currency}),${total.toFixed(2)}\n`;
    });
    
    csv += `Vehicles with Costs,${Object.keys(costsByVehicle).length}\n`;
    csv += `Generated On,${new Date().toLocaleString()}\n`;

    // Add by vehicle summary
    csv += "\n\nCOSTS BY VEHICLE\n";
    csv += "Vehicle,Model,Total,Currency,Records\n";
    Object.values(costsByVehicle)
      .sort((a, b) => {
        const aTotal = Object.values(a.totalsByCurrency).reduce((s, v) => s + v, 0);
        const bTotal = Object.values(b.totalsByCurrency).reduce((s, v) => s + v, 0);
        return bTotal - aTotal;
      })
      .forEach((item) => {
        Object.entries(item.totalsByCurrency).forEach(([currency, total]) => {
          csv += `${escapeCSV(item.vehicle.plate_number)},${escapeCSV((item.vehicle.make || "") + " " + (item.vehicle.model || ""))},${total.toFixed(2)},${currency},${item.count}\n`;
        });
      });

    // Add by type summary
    csv += "\n\nCOSTS BY TYPE\n";
    csv += "Maintenance Type,Total,Currency,Records\n";
    Object.values(costsByType)
      .sort((a, b) => {
        const aTotal = Object.values(a.totalsByCurrency).reduce((s, v) => s + v, 0);
        const bTotal = Object.values(b.totalsByCurrency).reduce((s, v) => s + v, 0);
        return bTotal - aTotal;
      })
      .forEach((item) => {
        Object.entries(item.totalsByCurrency).forEach(([currency, total]) => {
          csv += `${escapeCSV(item.type.name)},${total.toFixed(2)},${currency},${item.count}\n`;
        });
      });

    // Download
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `maintenance-costs-${dateFrom || "all"}-to-${dateTo || "present"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSelectedVehicle("all");
    setSelectedType("all");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = selectedVehicle !== "all" || selectedType !== "all" || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link href="/admin/maintenance" className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Maintenance
          </Link>
          <h1 className="text-2xl font-bold">Maintenance Cost Reports</h1>
          <p className="text-muted-foreground">Analyze maintenance expenses by vehicle or fleet</p>
        </div>
        <Button onClick={exportToCSV} disabled={filteredCosts.length === 0}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export to CSV
        </Button>
      </div>

      {/* Monthly Cost Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Monthly Fleet Costs (Last 12 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {costs.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No cost data available
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={monthlyCosts} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="month" 
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `€${value}`}
                />
                <ChartTooltip 
                  cursor={{ fill: "hsl(var(--muted))" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="text-sm font-medium">{payload[0].payload.month}</div>
                          <div className="text-sm text-muted-foreground">
                            Total: <span className="font-medium text-foreground">€{Number(payload[0].value).toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="total" 
                  fill="hsl(var(--primary))" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
          <p className="text-xs text-muted-foreground text-center mt-2">
            All currencies converted to EUR for comparison
          </p>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/20">
                <DollarSign className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Cost</p>
                <div className="text-xl font-bold">
                  {Object.keys(totalsByCurrency).length === 0
                    ? "€0.00"
                    : Object.entries(totalsByCurrency).map(([currency, total]) => (
                        <div key={currency}>{formatCurrency(total, currency)}</div>
                      ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/20">
                <FileText className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Records</p>
                <p className="text-2xl font-bold">{filteredCosts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500/20">
                <Car className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vehicles</p>
                <p className="text-2xl font-bold">{Object.keys(costsByVehicle).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <SearchableSelect
                value={selectedVehicle}
                onValueChange={setSelectedVehicle}
                placeholder="All Vehicles"
                searchPlaceholder="Search vehicles..."
                emptyText="No vehicle found."
                options={[
                  { value: "all", label: "All Vehicles" },
                  ...vehicles.map((v) => ({
                    value: v.id,
                    label: v.plate_number,
                    sublabel: v.model || undefined,
                  })),
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label>Maintenance Type</Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {maintenanceTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} className="mt-4">
              Clear Filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Cost by Vehicle */}
      {Object.keys(costsByVehicle).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Costs by Vehicle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.values(costsByVehicle)
                .sort((a, b) => {
                  const aTotal = Object.values(a.totalsByCurrency).reduce((s, v) => s + v, 0);
                  const bTotal = Object.values(b.totalsByCurrency).reduce((s, v) => s + v, 0);
                  return bTotal - aTotal;
                })
                .map((item) => (
                  <div
                    key={item.vehicle.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                        <Car className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{item.vehicle.plate_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.vehicle.make} {item.vehicle.model}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-400">{formatTotalsByCurrency(item.totalsByCurrency)}</p>
                      <p className="text-xs text-muted-foreground">{item.count} records</p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost by Type */}
      {Object.keys(costsByType).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Costs by Maintenance Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.values(costsByType)
                .sort((a, b) => {
                  const aTotal = Object.values(a.totalsByCurrency).reduce((s, v) => s + v, 0);
                  const bTotal = Object.values(b.totalsByCurrency).reduce((s, v) => s + v, 0);
                  return bTotal - aTotal;
                })
                .map((item) => (
                  <div
                    key={item.type.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/20">
                        <Wrench className="h-4 w-4 text-orange-400" />
                      </div>
                      <p className="font-medium">{item.type.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-400">{formatTotalsByCurrency(item.totalsByCurrency)}</p>
                      <p className="text-xs text-muted-foreground">{item.count} records</p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : filteredCosts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {costs.length === 0
                ? "No maintenance costs recorded yet."
                : "No costs match your filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detailed Cost Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredCosts.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-muted/30 rounded-lg gap-2"
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{c.maintenance_record?.vehicle?.plate_number || "Unknown"}</Badge>
                      {c.maintenance_record?.maintenance_number && (
                        <span className="text-xs text-muted-foreground font-mono">
                          #{c.maintenance_record.maintenance_number}
                        </span>
                      )}
                      <span className="font-medium">
                        {c.maintenance_record?.maintenance_type?.name || "Unassigned Type"}
                      </span>
                    </div>
                    {c.description && (
                      <p className="text-sm text-muted-foreground mt-1">{c.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      <Calendar className="h-3 w-3 inline mr-1" />
                      {c.maintenance_record?.completed_date
                        ? new Date(c.maintenance_record.completed_date).toLocaleDateString()
                        : new Date(c.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg text-green-400">
                      {formatCurrency(c.cost || 0, c.cost_currency || "EUR")}
                    </p>
                    {c.invoice_url && (
                      <a
                        href={c.invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        View Invoice
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
