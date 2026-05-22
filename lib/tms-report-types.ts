// TMS Report Type Registry -- scalable pattern for adding new report types
// Each report type defines its metadata, data source, columns, and translations.

export type Locale = "en" | "ro";

export type TMSReportCategory = "orders" | "financial" | "performance" | "partners";

export interface TMSReportColumnDef {
  key: string;
  labelEn: string;
  labelRo: string;
  type: "text" | "number" | "currency" | "date" | "percent" | "duration" | "status";
  unit?: string;
  summable?: boolean;
}

export interface TMSReportTypeDef {
  id: string;
  nameEn: string;
  nameRo: string;
  descriptionEn: string;
  descriptionRo: string;
  category: TMSReportCategory;
  columns: TMSReportColumnDef[];
  hasSummary: boolean;
  icon: string;
  available: boolean;
  filters?: string[];
}

export const TMS_REPORT_CATEGORIES: Record<TMSReportCategory, { labelEn: string; labelRo: string; icon: string }> = {
  orders: { labelEn: "Orders", labelRo: "Comenzi", icon: "Package" },
  financial: { labelEn: "Financial", labelRo: "Financiar", icon: "DollarSign" },
  performance: { labelEn: "Performance", labelRo: "Performanta", icon: "TrendingUp" },
  partners: { labelEn: "Partners", labelRo: "Parteneri", icon: "Users" },
};

export const TMS_REPORT_TYPES: TMSReportTypeDef[] = [
  // === ORDERS ===
  {
    id: "orders_summary",
    nameEn: "Orders Summary",
    nameRo: "Sumar Comenzi",
    descriptionEn: "Overview of all orders with status breakdown and key metrics",
    descriptionRo: "Prezentare generala a tuturor comenzilor cu defalcare pe status si metrici cheie",
    category: "orders",
    columns: [
      { key: "reference_number", labelEn: "Reference", labelRo: "Referinta", type: "text" },
      { key: "order_type", labelEn: "Type", labelRo: "Tip", type: "text" },
      { key: "status", labelEn: "Status", labelRo: "Status", type: "status" },
      { key: "customer_name", labelEn: "Customer", labelRo: "Client", type: "text" },
      { key: "route", labelEn: "Route", labelRo: "Ruta", type: "text" },
      { key: "created_at", labelEn: "Created", labelRo: "Creat", type: "date" },
      { key: "customer_price", labelEn: "Revenue", labelRo: "Venit", type: "currency", summable: true },
      { key: "carrier_cost", labelEn: "Cost", labelRo: "Cost", type: "currency", summable: true },
      { key: "margin", labelEn: "Margin", labelRo: "Marja", type: "currency", summable: true },
    ],
    hasSummary: true,
    icon: "Package",
    available: true,
    filters: ["order_type", "status", "customer", "carrier"],
  },
  {
    id: "orders_by_status",
    nameEn: "Orders by Status",
    nameRo: "Comenzi pe Status",
    descriptionEn: "Order breakdown by current status with transition times",
    descriptionRo: "Defalcarea comenzilor pe status curent cu timpii de tranzitie",
    category: "orders",
    columns: [
      { key: "status", labelEn: "Status", labelRo: "Status", type: "status" },
      { key: "count", labelEn: "Count", labelRo: "Numar", type: "number", summable: true },
      { key: "total_revenue", labelEn: "Total Revenue", labelRo: "Venit Total", type: "currency", summable: true },
      { key: "avg_processing_time", labelEn: "Avg Processing Time", labelRo: "Timp Mediu Procesare", type: "duration" },
      { key: "percentage", labelEn: "% of Total", labelRo: "% din Total", type: "percent" },
    ],
    hasSummary: true,
    icon: "BarChart3",
    available: true,
  },
  {
    id: "delivery_performance",
    nameEn: "Delivery Performance",
    nameRo: "Performanta Livrari",
    descriptionEn: "On-time delivery rates, delays, and delivery efficiency",
    descriptionRo: "Rate de livrare la timp, intarzieri si eficienta livrarilor",
    category: "orders",
    columns: [
      { key: "reference_number", labelEn: "Order", labelRo: "Comanda", type: "text" },
      { key: "route", labelEn: "Route", labelRo: "Ruta", type: "text" },
      { key: "planned_date", labelEn: "Planned", labelRo: "Planificat", type: "date" },
      { key: "actual_date", labelEn: "Actual", labelRo: "Actual", type: "date" },
      { key: "delay_hours", labelEn: "Delay (h)", labelRo: "Intarziere (h)", type: "number" },
      { key: "on_time", labelEn: "On Time", labelRo: "La Timp", type: "text" },
    ],
    hasSummary: true,
    icon: "Clock",
    available: true,
  },

  // === FINANCIAL ===
  {
    id: "revenue_report",
    nameEn: "Revenue Report",
    nameRo: "Raport Venituri",
    descriptionEn: "Detailed revenue breakdown by period, customer, and order type",
    descriptionRo: "Defalcarea detaliata a veniturilor pe perioada, client si tip comanda",
    category: "financial",
    columns: [
      { key: "period", labelEn: "Period", labelRo: "Perioada", type: "text" },
      { key: "order_count", labelEn: "Orders", labelRo: "Comenzi", type: "number", summable: true },
      { key: "total_revenue", labelEn: "Revenue", labelRo: "Venituri", type: "currency", summable: true },
      { key: "total_cost", labelEn: "Costs", labelRo: "Costuri", type: "currency", summable: true },
      { key: "gross_margin", labelEn: "Gross Margin", labelRo: "Marja Bruta", type: "currency", summable: true },
      { key: "margin_percent", labelEn: "Margin %", labelRo: "Marja %", type: "percent" },
    ],
    hasSummary: true,
    icon: "DollarSign",
    available: true,
    filters: ["group_by"],
  },
  {
    id: "margin_analysis",
    nameEn: "Margin Analysis",
    nameRo: "Analiza Marjelor",
    descriptionEn: "Profit margin analysis per order, customer, and carrier",
    descriptionRo: "Analiza marjei de profit per comanda, client si transportator",
    category: "financial",
    columns: [
      { key: "entity_name", labelEn: "Entity", labelRo: "Entitate", type: "text" },
      { key: "order_count", labelEn: "Orders", labelRo: "Comenzi", type: "number", summable: true },
      { key: "total_revenue", labelEn: "Revenue", labelRo: "Venituri", type: "currency", summable: true },
      { key: "total_cost", labelEn: "Costs", labelRo: "Costuri", type: "currency", summable: true },
      { key: "margin", labelEn: "Margin", labelRo: "Marja", type: "currency", summable: true },
      { key: "margin_percent", labelEn: "Margin %", labelRo: "Marja %", type: "percent" },
      { key: "avg_order_value", labelEn: "Avg Order Value", labelRo: "Valoare Medie Comanda", type: "currency" },
    ],
    hasSummary: true,
    icon: "TrendingUp",
    available: true,
    filters: ["group_by"],
  },
  {
    id: "receivables_aging",
    nameEn: "Receivables Aging",
    nameRo: "Vechime Creante",
    descriptionEn: "Outstanding invoices grouped by aging buckets",
    descriptionRo: "Facturi neincasate grupate pe intervale de vechime",
    category: "financial",
    columns: [
      { key: "customer_name", labelEn: "Customer", labelRo: "Client", type: "text" },
      { key: "current", labelEn: "Current", labelRo: "Curent", type: "currency", summable: true },
      { key: "days_30", labelEn: "1-30 Days", labelRo: "1-30 Zile", type: "currency", summable: true },
      { key: "days_60", labelEn: "31-60 Days", labelRo: "31-60 Zile", type: "currency", summable: true },
      { key: "days_90", labelEn: "61-90 Days", labelRo: "61-90 Zile", type: "currency", summable: true },
      { key: "over_90", labelEn: "90+ Days", labelRo: "90+ Zile", type: "currency", summable: true },
      { key: "total", labelEn: "Total", labelRo: "Total", type: "currency", summable: true },
    ],
    hasSummary: true,
    icon: "Receipt",
    available: true,
  },

  // === PERFORMANCE ===
  {
    id: "carrier_performance",
    nameEn: "Carrier Performance",
    nameRo: "Performanta Transportatori",
    descriptionEn: "Carrier ratings, on-time rates, issues, and cost analysis",
    descriptionRo: "Evaluari transportatori, rate la timp, probleme si analiza costuri",
    category: "performance",
    columns: [
      { key: "carrier_name", labelEn: "Carrier", labelRo: "Transportator", type: "text" },
      { key: "order_count", labelEn: "Orders", labelRo: "Comenzi", type: "number", summable: true },
      { key: "on_time_rate", labelEn: "On-Time %", labelRo: "La Timp %", type: "percent" },
      { key: "avg_cost", labelEn: "Avg Cost", labelRo: "Cost Mediu", type: "currency" },
      { key: "total_cost", labelEn: "Total Cost", labelRo: "Cost Total", type: "currency", summable: true },
      { key: "issues", labelEn: "Issues", labelRo: "Probleme", type: "number", summable: true },
      { key: "rating", labelEn: "Rating", labelRo: "Evaluare", type: "number" },
    ],
    hasSummary: true,
    icon: "Truck",
    available: true,
  },
  {
    id: "route_analysis",
    nameEn: "Route Analysis",
    nameRo: "Analiza Rute",
    descriptionEn: "Most frequent routes, distances, average times, and profitability",
    descriptionRo: "Cele mai frecvente rute, distante, timpi medii si profitabilitate",
    category: "performance",
    columns: [
      { key: "route", labelEn: "Route", labelRo: "Ruta", type: "text" },
      { key: "frequency", labelEn: "Frequency", labelRo: "Frecventa", type: "number", summable: true },
      { key: "avg_distance", labelEn: "Avg Distance", labelRo: "Distanta Medie", type: "number" },
      { key: "avg_duration", labelEn: "Avg Duration", labelRo: "Durata Medie", type: "duration" },
      { key: "total_revenue", labelEn: "Revenue", labelRo: "Venituri", type: "currency", summable: true },
      { key: "avg_margin", labelEn: "Avg Margin", labelRo: "Marja Medie", type: "percent" },
    ],
    hasSummary: true,
    icon: "Route",
    available: true,
  },
  {
    id: "operational_kpis",
    nameEn: "Operational KPIs",
    nameRo: "KPI Operationali",
    descriptionEn: "Key performance indicators dashboard with trends",
    descriptionRo: "Tablou de bord indicatori cheie de performanta cu tendinte",
    category: "performance",
    columns: [
      { key: "kpi_name", labelEn: "KPI", labelRo: "KPI", type: "text" },
      { key: "current_value", labelEn: "Current", labelRo: "Curent", type: "number" },
      { key: "previous_value", labelEn: "Previous", labelRo: "Anterior", type: "number" },
      { key: "change", labelEn: "Change", labelRo: "Variatie", type: "percent" },
      { key: "target", labelEn: "Target", labelRo: "Tinta", type: "number" },
      { key: "achievement", labelEn: "Achievement", labelRo: "Realizare", type: "percent" },
    ],
    hasSummary: false,
    icon: "Gauge",
    available: true,
  },

  // === PARTNERS ===
  {
    id: "customer_analysis",
    nameEn: "Customer Analysis",
    nameRo: "Analiza Clienti",
    descriptionEn: "Customer breakdown by revenue, order volume, and trends",
    descriptionRo: "Defalcarea clientilor pe venituri, volum comenzi si tendinte",
    category: "partners",
    columns: [
      { key: "customer_name", labelEn: "Customer", labelRo: "Client", type: "text" },
      { key: "order_count", labelEn: "Orders", labelRo: "Comenzi", type: "number", summable: true },
      { key: "total_revenue", labelEn: "Revenue", labelRo: "Venituri", type: "currency", summable: true },
      { key: "avg_order_value", labelEn: "Avg Order", labelRo: "Comanda Medie", type: "currency" },
      { key: "margin_percent", labelEn: "Margin %", labelRo: "Marja %", type: "percent" },
      { key: "payment_days", labelEn: "Avg Payment Days", labelRo: "Zile Plata Medie", type: "number" },
      { key: "last_order", labelEn: "Last Order", labelRo: "Ultima Comanda", type: "date" },
    ],
    hasSummary: true,
    icon: "Users",
    available: true,
  },
  {
    id: "carrier_ranking",
    nameEn: "Carrier Ranking",
    nameRo: "Clasament Transportatori",
    descriptionEn: "Top carriers by performance, reliability, and cost efficiency",
    descriptionRo: "Top transportatori dupa performanta, fiabilitate si eficienta costuri",
    category: "partners",
    columns: [
      { key: "rank", labelEn: "Rank", labelRo: "Rang", type: "number" },
      { key: "carrier_name", labelEn: "Carrier", labelRo: "Transportator", type: "text" },
      { key: "score", labelEn: "Score", labelRo: "Scor", type: "number" },
      { key: "order_count", labelEn: "Orders", labelRo: "Comenzi", type: "number", summable: true },
      { key: "on_time_rate", labelEn: "On-Time %", labelRo: "La Timp %", type: "percent" },
      { key: "avg_cost_per_km", labelEn: "Cost/km", labelRo: "Cost/km", type: "currency" },
      { key: "issues", labelEn: "Issues", labelRo: "Probleme", type: "number" },
    ],
    hasSummary: true,
    icon: "Award",
    available: true,
  },
  {
    id: "partner_activity",
    nameEn: "Partner Activity",
    nameRo: "Activitate Parteneri",
    descriptionEn: "Recent activity log for all business partners",
    descriptionRo: "Jurnal de activitate recent pentru toti partenerii de afaceri",
    category: "partners",
    columns: [
      { key: "partner_name", labelEn: "Partner", labelRo: "Partener", type: "text" },
      { key: "partner_type", labelEn: "Type", labelRo: "Tip", type: "text" },
      { key: "last_activity", labelEn: "Last Activity", labelRo: "Ultima Activitate", type: "date" },
      { key: "orders_30d", labelEn: "Orders (30d)", labelRo: "Comenzi (30z)", type: "number" },
      { key: "revenue_30d", labelEn: "Revenue (30d)", labelRo: "Venituri (30z)", type: "currency" },
      { key: "status", labelEn: "Status", labelRo: "Status", type: "status" },
    ],
    hasSummary: true,
    icon: "Activity",
    available: true,
  },
];

export function getTMSReportType(id: string): TMSReportTypeDef | undefined {
  return TMS_REPORT_TYPES.find((r) => r.id === id);
}

export function getTMSReportsByCategory(): Record<TMSReportCategory, TMSReportTypeDef[]> {
  const result = {} as Record<TMSReportCategory, TMSReportTypeDef[]>;
  for (const cat of Object.keys(TMS_REPORT_CATEGORIES) as TMSReportCategory[]) {
    result[cat] = TMS_REPORT_TYPES.filter((r) => r.category === cat);
  }
  return result;
}

export function getTMSReportName(report: TMSReportTypeDef, locale: Locale): string {
  return locale === "ro" ? report.nameRo : report.nameEn;
}

export function getTMSReportDescription(report: TMSReportTypeDef, locale: Locale): string {
  return locale === "ro" ? report.descriptionRo : report.descriptionEn;
}

export function getTMSCategoryLabel(cat: TMSReportCategory, locale: Locale): string {
  const c = TMS_REPORT_CATEGORIES[cat];
  return locale === "ro" ? c.labelRo : c.labelEn;
}

export function getTMSColumnLabel(col: TMSReportColumnDef, locale: Locale): string {
  return locale === "ro" ? col.labelRo : col.labelEn;
}

// Helper: format currency
export function formatCurrency(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency }).format(value);
}
