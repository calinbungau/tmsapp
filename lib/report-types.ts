// Report Type Registry -- scalable pattern for adding new report types
// Each report type defines its metadata, Traccar endpoint, columns, and translations.

export type Locale = "en" | "ro";

export type ReportCategory = "activity" | "landmarks" | "safety" | "vehicle_usage";

export interface ReportColumnDef {
  key: string;
  labelEn: string;
  labelRo: string;
  type: "text" | "number" | "distance" | "speed" | "duration" | "datetime" | "address" | "percent";
  /** Optional: unit string like "km", "km/h" */
  unit?: string;
  /** Whether to include in summary row */
  summable?: boolean;
}

export interface ReportTypeDef {
  id: string;
  nameEn: string;
  nameRo: string;
  descriptionEn: string;
  descriptionRo: string;
  category: ReportCategory;
  /** Which Traccar report endpoint to call: "trips", "route", "stops", "summary", "events" */
  traccarEndpoint: string;
  /** Columns for the data table */
  columns: ReportColumnDef[];
  /** Whether this report supports "show summary" */
  hasSummary: boolean;
  /** Whether each device gets its own section/page */
  perDevice: boolean;
  /** Icon name (lucide) */
  icon: string;
  /** Whether it's available now or coming soon */
  available: boolean;
}

export const REPORT_CATEGORIES: Record<ReportCategory, { labelEn: string; labelRo: string }> = {
  activity: { labelEn: "Activity", labelRo: "Activitate" },
  landmarks: { labelEn: "Landmarks", labelRo: "Puncte de reper" },
  safety: { labelEn: "Safety & Security", labelRo: "Siguranta si securitate" },
  vehicle_usage: { labelEn: "Vehicle Usage", labelRo: "Utilizarea transportului" },
};

// ---- REPORT TYPES ----

export const REPORT_TYPES: ReportTypeDef[] = [
  // === ACTIVITY ===
  {
    id: "route_sheet",
    nameEn: "Route Sheet",
    nameRo: "Foaie de parcurs",
    descriptionEn: "Detailed travel log with departure/arrival addresses, distances, speeds",
    descriptionRo: "Istoric detaliat al calatoriilor cu adrese de plecare/sosire, distante, viteze",
    category: "activity",
    traccarEndpoint: "route",  // Uses positions data, same as History
    columns: [
      { key: "startTime", labelEn: "Start Date", labelRo: "Data Inceput", type: "datetime" },
      { key: "startAddress", labelEn: "Start Location", labelRo: "Locatie Inceput", type: "address" },
      { key: "distance", labelEn: "Distance", labelRo: "Distanta", type: "distance", unit: "km", summable: true },
      { key: "duration", labelEn: "Duration", labelRo: "Durata", type: "duration", summable: true },
      { key: "endTime", labelEn: "End Date", labelRo: "Data Oprire", type: "datetime" },
      { key: "endAddress", labelEn: "End Location", labelRo: "Locatie Oprire", type: "address" },
      { key: "idleDuration", labelEn: "Idle Time", labelRo: "Timp Stationare", type: "duration", summable: true },
      { key: "averageSpeed", labelEn: "Avg Speed", labelRo: "Viteza Medie", type: "speed", unit: "km/h" },
      { key: "maxSpeed", labelEn: "Max Speed", labelRo: "Viteza Maxima", type: "speed", unit: "km/h" },
      { key: "ignitionOn", labelEn: "Ignition ON", labelRo: "Contact PORNIT", type: "duration", summable: true },
    ],
    hasSummary: true,
    perDevice: true,
    icon: "Route",
    available: true,
  },
  {
    id: "stops",
    nameEn: "Stops",
    nameRo: "Opriri",
    descriptionEn: "Detailed log of all stops with duration and location",
    descriptionRo: "Istoricul detaliat al opririlor",
    category: "activity",
    traccarEndpoint: "stops",
    columns: [
      { key: "startTime", labelEn: "Stop Start", labelRo: "Inceput Oprire", type: "datetime" },
      { key: "endTime", labelEn: "Stop End", labelRo: "Sfarsit Oprire", type: "datetime" },
      { key: "duration", labelEn: "Duration", labelRo: "Durata", type: "duration", summable: true },
      { key: "address", labelEn: "Location", labelRo: "Locatie", type: "address" },
      { key: "engineStatus", labelEn: "Engine", labelRo: "Motor", type: "text" },
    ],
    hasSummary: true,
    perDevice: true,
    icon: "CircleStop",
    available: true,
  },
  {
    id: "trips_and_stops",
    nameEn: "Trips & Stops",
    nameRo: "Calatorii si opriri in functie de ture",
    descriptionEn: "Combined trips and stops breakdown by tour",
    descriptionRo: "Defalcarea calatoriilor si opririlor in functie de ture",
    category: "activity",
    traccarEndpoint: "trips",
    columns: [],
    hasSummary: true,
    perDevice: true,
    icon: "ArrowLeftRight",
    available: false,
  },

  // === LANDMARKS ===
  {
    id: "geofence_visits",
    nameEn: "Geofence Visits",
    nameRo: "Vizite Geozone",
    descriptionEn: "Detailed info on geofence entries and exits",
    descriptionRo: "Informatii detaliate despre intrare si iesire geozona",
    category: "landmarks",
    traccarEndpoint: "events",
    columns: [
      { key: "eventTime", labelEn: "Time", labelRo: "Ora", type: "datetime" },
      { key: "geofenceName", labelEn: "Geofence", labelRo: "Geozona", type: "text" },
      { key: "type", labelEn: "Action", labelRo: "Actiune", type: "text" },
    ],
    hasSummary: true,
    perDevice: true,
    icon: "MapPin",
    available: true,
  },

  // === SAFETY ===
  {
    id: "events",
    nameEn: "All Events",
    nameRo: "Toate Evenimentele",
    descriptionEn: "Complete event log including ignition, movement, geofences, alarms",
    descriptionRo: "Jurnalul complet al evenimentelor inclusiv contact, miscare, geozone, alarme",
    category: "safety",
    traccarEndpoint: "events",
    columns: [
      { key: "eventTime", labelEn: "Time", labelRo: "Ora", type: "datetime" },
      { key: "label", labelEn: "Event", labelRo: "Eveniment", type: "text" },
      { key: "category", labelEn: "Category", labelRo: "Categorie", type: "text" },
      { key: "geofenceName", labelEn: "Geofence", labelRo: "Geozona", type: "text" },
    ],
    hasSummary: true,
    perDevice: true,
    icon: "ShieldAlert",
    available: true,
  },
  {
    id: "vehicle_security",
    nameEn: "Vehicle Security",
    nameRo: "Securitate auto",
    descriptionEn: "Alarms, tow alerts, AutoControl events, accidents",
    descriptionRo: "Alarme, alerte de remorcare, evenimente AutoControl, accidente",
    category: "safety",
    traccarEndpoint: "events",
    columns: [
      { key: "eventTime", labelEn: "Time", labelRo: "Ora", type: "datetime" },
      { key: "label", labelEn: "Event", labelRo: "Eveniment", type: "text" },
      { key: "attributes", labelEn: "Details", labelRo: "Detalii", type: "text" },
    ],
    hasSummary: true,
    perDevice: true,
    icon: "ShieldAlert",
    available: true,
  },

  // === VEHICLE USAGE ===
  {
    id: "engine_hours",
    nameEn: "Engine Hours",
    nameRo: "Ore de lucru a motorului",
    descriptionEn: "Time spent moving vs idle",
    descriptionRo: "Timpul petrecut in miscare si pe ralanti",
    category: "vehicle_usage",
    traccarEndpoint: "summary",
    columns: [
      { key: "date", labelEn: "Date", labelRo: "Data", type: "text" },
      { key: "ignitionOn", labelEn: "Ignition ON", labelRo: "Contact PORNIT", type: "duration", summable: true },
      { key: "movingTime", labelEn: "Moving Time", labelRo: "Timp Miscare", type: "duration", summable: true },
      { key: "idleTime", labelEn: "Idle Time", labelRo: "Timp Stationare", type: "duration", summable: true },
      { key: "ignitionOff", labelEn: "Ignition OFF", labelRo: "Contact OPRIT", type: "duration", summable: true },
      { key: "distance", labelEn: "Distance", labelRo: "Distanta", type: "distance", unit: "km", summable: true },
    ],
    hasSummary: true,
    perDevice: true,
    icon: "Gauge",
    available: true,
  },
  {
    id: "fuel_volume",
    nameEn: "Fuel Volume",
    nameRo: "Volumul combustibilului",
    descriptionEn: "Fuel level changes, consumption, and refueling events",
    descriptionRo: "Modificari ale nivelului combustibilului, consum si realimentare",
    category: "vehicle_usage",
    traccarEndpoint: "positions",
    columns: [
      { key: "time", labelEn: "Time", labelRo: "Ora", type: "datetime" },
      { key: "fuelLevel", labelEn: "Fuel Level", labelRo: "Nivel Combustibil", type: "number", unit: "L" },
      { key: "change", labelEn: "Change", labelRo: "Modificare", type: "number", unit: "L" },
      { key: "eventType", labelEn: "Event", labelRo: "Eveniment", type: "text" },
      { key: "distance", labelEn: "Distance", labelRo: "Distanta", type: "distance", unit: "km" },
      { key: "address", labelEn: "Location", labelRo: "Locatie", type: "address" },
    ],
    hasSummary: true,
    perDevice: true,
    icon: "Fuel",
    available: true,
  },
  {
    id: "summary",
    nameEn: "Summary",
    nameRo: "Sumar",
    descriptionEn: "Daily summary with distance, duration, fuel consumption per vehicle",
    descriptionRo: "Sumar zilnic cu distanta, durata, consum combustibil per vehicul",
    category: "vehicle_usage",
    traccarEndpoint: "summary",
    columns: [
      { key: "date", labelEn: "Date", labelRo: "Data", type: "text" },
      { key: "distance", labelEn: "Distance", labelRo: "Distanta", type: "distance", unit: "km", summable: true },
      { key: "averageSpeed", labelEn: "Avg Speed", labelRo: "Viteza Medie", type: "speed", unit: "km/h" },
      { key: "maxSpeed", labelEn: "Max Speed", labelRo: "Viteza Maxima", type: "speed", unit: "km/h" },
      { key: "engineHours", labelEn: "Engine Hours", labelRo: "Ore Motor", type: "duration", summable: true },
      { key: "fuelUsed", labelEn: "Fuel Used", labelRo: "Combustibil Consumat", type: "number", unit: "L", summable: true },
      { key: "fuelCost", labelEn: "Fuel Cost", labelRo: "Cost Combustibil", type: "number", unit: "EUR", summable: true },
    ],
    hasSummary: true,
    perDevice: true,
    icon: "BarChart3",
    available: true,
  },
];

export function getReportType(id: string): ReportTypeDef | undefined {
  return REPORT_TYPES.find((r) => r.id === id);
}

export function getReportsByCategory(): Record<ReportCategory, ReportTypeDef[]> {
  const result = {} as Record<ReportCategory, ReportTypeDef[]>;
  for (const cat of Object.keys(REPORT_CATEGORIES) as ReportCategory[]) {
    result[cat] = REPORT_TYPES.filter((r) => r.category === cat);
  }
  return result;
}

// Helper: format duration in ms -> HH:MM
export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "00:00";
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Helper: format distance in meters -> km with 2 decimals
export function formatDistance(meters: number): string {
  if (!meters || meters <= 0) return "0";
  return (meters / 1000).toFixed(2);
}

// Helper: format speed in knots -> km/h
export function formatSpeed(knots: number): number {
  return Math.round(knots * 1.852);
}

// Helper: translate label based on locale
export function getLabel(col: ReportColumnDef, locale: "en" | "ro"): string {
  return locale === "ro" ? col.labelRo : col.labelEn;
}

export function getReportName(report: ReportTypeDef, locale: "en" | "ro"): string {
  return locale === "ro" ? report.nameRo : report.nameEn;
}

export function getReportDescription(report: ReportTypeDef, locale: "en" | "ro"): string {
  return locale === "ro" ? report.descriptionRo : report.descriptionEn;
}

export function getCategoryLabel(cat: ReportCategory, locale: "en" | "ro"): string {
  const c = REPORT_CATEGORIES[cat];
  return locale === "ro" ? c.labelRo : c.labelEn;
}
