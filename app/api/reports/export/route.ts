import { NextRequest, NextResponse } from "next/server";
import { formatDuration, formatDistance } from "@/lib/report-types";
import ExcelJS from "exceljs";

/**
 * Export report data to XLSX with styled formatting
 * POST body: { format: "xlsx", data: DeviceReport[], title, locale, dateFrom, dateTo, reportType? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, title = "Report", locale = "en", dateFrom, dateTo, reportType = "route_sheet" } = body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "No data to export" }, { status: 400 });
    }

    return generateXLSX(data, title, locale, dateFrom, dateTo, reportType);
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

// Style constants
const BRAND_COLOR = "1a1f2e";
const ACCENT_COLOR = "f59e0b";
const HEADER_BG = "293241";
const HEADER_FG = "FFFFFF";
const DATE_GROUP_BG = "FFF8E1";
const DATE_GROUP_FG = "B45309";
const SUMMARY_BG = "F0F9FF";
const BORDER_COLOR = "D1D5DB";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
};

// Helper to extract data array based on report type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDataArray(device: any, reportType: string): Record<string, unknown>[] {
  switch (reportType) {
    case "events":
    case "geofence_visits":
    case "vehicle_security":
      return device.events || device.trips || [];
    case "fuel_volume":
      return device.fuelData || device.trips || [];
    case "summary":
      return device.summaryRows || device.trips || [];
    default:
      return device.trips || [];
  }
}

async function generateXLSX(
  data: Array<{
    plate: string; brand?: string; model?: string;
    trips: Array<Record<string, unknown>>;
    summary: Record<string, unknown> | null;
  }>,
  title: string, locale: string, dateFrom: string, dateTo: string, reportType: string
) {
  const isRo = locale === "ro";
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fleet Reports";
  wb.created = new Date();

  // Get column config based on report type
  const colConfig = getColumns(reportType, isRo);

  for (const device of data) {
    // Get the data array based on report type
    const dataArray = getDataArray(device, reportType);
    if (dataArray.length === 0) continue;
    const sheetName = (device.plate || "Unknown").substring(0, 30).replace(/[\\/*?[\]]/g, "");
    const ws = wb.addWorksheet(sheetName);

    // -- Title row --
    let row = 1;
    ws.mergeCells(row, 1, row, colConfig.length + 1);
    const titleCell = ws.getCell(row, 1);
    titleCell.value = title;
    titleCell.font = { size: 16, bold: true, color: { argb: BRAND_COLOR } };
    titleCell.alignment = { vertical: "middle" };
    ws.getRow(row).height = 28;
    row++;

    // -- Period row --
    ws.mergeCells(row, 1, row, colConfig.length + 1);
    const periodCell = ws.getCell(row, 1);
    const fmtDT = (s: string) => {
      if (!s) return "";
      const d = new Date(s);
      return `${d.toLocaleDateString(isRo ? "ro-RO" : "en-GB")} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    };
    periodCell.value = `${isRo ? "Perioada" : "Period"}: ${fmtDT(dateFrom)} - ${fmtDT(dateTo)}`;
    periodCell.font = { size: 10, color: { argb: "6B7280" } };
    row++;

    // -- Vehicle row --
    ws.mergeCells(row, 1, row, colConfig.length + 1);
    const vehicleCell = ws.getCell(row, 1);
    vehicleCell.value = `${isRo ? "Vehicul" : "Vehicle"}: ${device.plate}${device.brand ? ` - ${device.brand}` : ""}${device.model ? ` ${device.model}` : ""}`;
    vehicleCell.font = { size: 10, bold: true, color: { argb: BRAND_COLOR } };
    row++;
    row++; // blank row

    // -- Column Headers --
    const headerRow = ws.getRow(row);
    headerRow.height = 24;
    // # column
    const numCell = ws.getCell(row, 1);
    numCell.value = "#";
    numCell.font = { bold: true, size: 9, color: { argb: HEADER_FG } };
    numCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    numCell.border = thinBorder;
    numCell.alignment = { vertical: "middle", horizontal: "center" };
    ws.getColumn(1).width = 5;

    for (let c = 0; c < colConfig.length; c++) {
      const col = colConfig[c];
      const cell = ws.getCell(row, c + 2);
      cell.value = col.label;
      cell.font = { bold: true, size: 9, color: { argb: HEADER_FG } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
      cell.border = thinBorder;
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      ws.getColumn(c + 2).width = col.width;
    }
    row++;

    // -- Data rows with date grouping and daily summaries --
    const DAY_TOTAL_BG = "EEF2FF"; // light indigo for day summary
    const GRAND_TOTAL_BG = "FEF3C7"; // light amber for grand total
    let currentDate = "";
    let tripNum = 0;
    let currentDayTrips: Record<string, unknown>[] = [];
    const allTrips = dataArray;
    const useGrouping = reportType === "route_sheet" || reportType === "stops";

    const writeDaySummaryRow = () => {
      if (!useGrouping || currentDayTrips.length === 0) return;
      // compute day totals from summable columns
      const nCell = ws.getCell(row, 1);
      nCell.value = "";
      nCell.border = thinBorder;
      nCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DAY_TOTAL_BG } };

      for (let c = 0; c < colConfig.length; c++) {
        const col = colConfig[c];
        const cell = ws.getCell(row, c + 2);
        cell.border = thinBorder;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DAY_TOTAL_BG } };
        cell.font = { bold: true, size: 9 };
        cell.alignment = { vertical: "middle", horizontal: col.align || "left" };

        if (col.summable) {
          let sum = 0;
          for (const t of currentDayTrips) {
            const v = t[col.key];
            if (typeof v === "number") sum += v;
          }
          cell.value = formatCellValue({ [col.key]: sum } as Record<string, unknown>, col.key, col.type);
          if (col.type === "distance" || col.type === "speed" || col.type === "duration") {
            cell.font = { ...cell.font, name: "Consolas" };
          }
        } else if (c === 0) {
          cell.value = isRo ? "Total zi" : "Day Total";
          cell.font = { bold: true, size: 9, color: { argb: "4338CA" } };
        } else if (col.type === "speed") {
          // avg/max speed
          let sum = 0, cnt = 0, mx = 0;
          for (const t of currentDayTrips) {
            const v = t[col.key];
            if (typeof v === "number") { sum += v; cnt++; if (v > mx) mx = v; }
          }
          const val = col.key.toLowerCase().includes("max") ? mx : (cnt > 0 ? Math.round(sum / cnt) : 0);
          cell.value = formatCellValue({ [col.key]: val } as Record<string, unknown>, col.key, col.type);
          cell.font = { ...cell.font, name: "Consolas" };
        } else {
          cell.value = "";
        }
      }
      ws.getRow(row).height = 20;
      row++;
      currentDayTrips = [];
    };

    for (let ti = 0; ti < allTrips.length; ti++) {
      const trip = allTrips[ti];

      // Date grouping for route_sheet and stops
      if (useGrouping) {
        const tripDate = trip.startTime ? new Date(trip.startTime as string).toLocaleDateString(isRo ? "ro-RO" : "en-GB", {
          weekday: "long", day: "2-digit", month: "2-digit", year: "numeric"
        }) : "";
        if (tripDate && tripDate !== currentDate) {
          // Write day summary for the previous day
          if (currentDate) writeDaySummaryRow();
          currentDate = tripDate;
          ws.mergeCells(row, 1, row, colConfig.length + 1);
          const dateCell = ws.getCell(row, 1);
          dateCell.value = currentDate;
          dateCell.font = { bold: true, size: 9, color: { argb: DATE_GROUP_FG } };
          dateCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DATE_GROUP_BG } };
          dateCell.border = thinBorder;
          ws.getRow(row).height = 20;
          row++;
        }
        currentDayTrips.push(trip);
      }

      tripNum++;
      const dataRow = ws.getRow(row);
      const isEven = tripNum % 2 === 0;
      const evenBg = "F9FAFB";

      // # cell
      const nCell = ws.getCell(row, 1);
      nCell.value = tripNum;
      nCell.font = { size: 9, color: { argb: "6B7280" } };
      nCell.alignment = { vertical: "middle", horizontal: "center" };
      nCell.border = thinBorder;
      if (isEven) nCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: evenBg } };

      for (let c = 0; c < colConfig.length; c++) {
        const col = colConfig[c];
        const cell = ws.getCell(row, c + 2);
        cell.value = formatCellValue(trip, col.key, col.type);
        cell.font = { size: 9 };
        cell.alignment = { vertical: "middle", horizontal: col.align || "left", wrapText: col.type === "address" };
        cell.border = thinBorder;
        if (isEven) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: evenBg } };

        // Numeric formatting
        if (col.type === "distance" || col.type === "speed") {
          cell.alignment = { ...cell.alignment, horizontal: "right" };
          cell.font = { ...cell.font, name: "Consolas" };
        }
        if (col.type === "duration") {
          cell.font = { ...cell.font, name: "Consolas" };
        }
      }
      dataRow.height = trip.startAddress || trip.endAddress || trip.address
        ? Math.max(18, 14) : 18;
      row++;
    }

    // Write last day summary
    writeDaySummaryRow();

    // -- Grand Period Total row --
    if (useGrouping && allTrips.length > 0) {
      const gtCell = ws.getCell(row, 1);
      gtCell.value = "";
      gtCell.border = thinBorder;
      gtCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAND_TOTAL_BG } };

      for (let c = 0; c < colConfig.length; c++) {
        const col = colConfig[c];
        const cell = ws.getCell(row, c + 2);
        cell.border = thinBorder;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAND_TOTAL_BG } };
        cell.font = { bold: true, size: 10 };
        cell.alignment = { vertical: "middle", horizontal: col.align || "left" };

        if (col.summable) {
          let sum = 0;
          for (const t of allTrips) { const v = t[col.key]; if (typeof v === "number") sum += v; }
          cell.value = formatCellValue({ [col.key]: sum } as Record<string, unknown>, col.key, col.type);
          if (col.type === "distance" || col.type === "speed" || col.type === "duration") cell.font = { ...cell.font, name: "Consolas" };
        } else if (c === 0) {
          cell.value = isRo ? "TOTAL PERIOADĂ" : "PERIOD TOTAL";
          cell.font = { bold: true, size: 10, color: { argb: BRAND_COLOR } };
        } else if (col.type === "speed") {
          let sum = 0, cnt = 0, mx = 0;
          for (const t of allTrips) { const v = t[col.key]; if (typeof v === "number") { sum += v; cnt++; if (v > mx) mx = v; } }
          const val = col.key.toLowerCase().includes("max") ? mx : (cnt > 0 ? Math.round(sum / cnt) : 0);
          cell.value = formatCellValue({ [col.key]: val } as Record<string, unknown>, col.key, col.type);
          cell.font = { ...cell.font, name: "Consolas" };
        } else {
          cell.value = "";
        }
      }
      ws.getRow(row).height = 24;
      row++;
    }

    // -- Summary --
    if (device.summary) {
      row++; // blank
      ws.mergeCells(row, 1, row, colConfig.length + 1);
      const sumHeaderCell = ws.getCell(row, 1);
      sumHeaderCell.value = isRo ? "REZUMAT" : "SUMMARY";
      sumHeaderCell.font = { bold: true, size: 10, color: { argb: ACCENT_COLOR } };
      sumHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUMMARY_BG } };
      sumHeaderCell.border = thinBorder;
      ws.getRow(row).height = 22;
      row++;

      const summaryRows = getSummaryRows(device.summary, reportType, isRo);
      for (const [label, value] of summaryRows) {
        ws.mergeCells(row, 1, row, 3);
        const labelCell = ws.getCell(row, 1);
        labelCell.value = label;
        labelCell.font = { size: 9, color: { argb: "6B7280" } };
        labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUMMARY_BG } };
        labelCell.border = thinBorder;

        ws.mergeCells(row, 4, row, colConfig.length + 1);
        const valCell = ws.getCell(row, 4);
        valCell.value = value;
        valCell.font = { bold: true, size: 9 };
        valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUMMARY_BG } };
        valCell.border = thinBorder;
        row++;
      }
    }

    // Freeze pane at headers
    ws.views = [{ state: "frozen", ySplit: 5, xSplit: 0 }];

    // AutoFilter on header row
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: colConfig.length + 1 } };
  }

  // Write buffer
  const buffer = await wb.xlsx.writeBuffer();

  const filename = `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`;
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ---- Column configs per report type ----
function getColumns(reportType: string, isRo: boolean) {
  if (reportType === "route_sheet") {
    return [
      { key: "startTime", label: isRo ? "Data Inceput" : "Start Date", type: "datetime", width: 14, summable: false },
      { key: "startAddress", label: isRo ? "Locatie Inceput" : "Start Location", type: "address", width: 32, summable: false },
      { key: "distance", label: isRo ? "Distanta (km)" : "Distance (km)", type: "distance", width: 12, align: "right" as const, summable: true },
      { key: "duration", label: isRo ? "Durata" : "Duration", type: "duration", width: 10, summable: true },
      { key: "endTime", label: isRo ? "Data Oprire" : "End Date", type: "datetime", width: 14, summable: false },
      { key: "endAddress", label: isRo ? "Locatie Oprire" : "End Location", type: "address", width: 32, summable: false },
      { key: "idleDuration", label: isRo ? "Timp Stationare" : "Idle Time", type: "duration", width: 10, summable: true },
      { key: "averageSpeed", label: isRo ? "Viteza Medie" : "Avg Speed (km/h)", type: "speed", width: 10, align: "right" as const, summable: false },
      { key: "maxSpeed", label: isRo ? "Viteza Maxima" : "Max Speed (km/h)", type: "speed", width: 10, align: "right" as const, summable: false },
      { key: "ignitionOn", label: isRo ? "Contact PORNIT" : "Ignition ON", type: "duration", width: 10, summable: true },
    ];
  }
  if (reportType === "stops") {
    return [
      { key: "startTime", label: isRo ? "Inceput Oprire" : "Stop Start", type: "datetime", width: 14, summable: false },
      { key: "endTime", label: isRo ? "Sfarsit Oprire" : "Stop End", type: "datetime", width: 14, summable: false },
      { key: "duration", label: isRo ? "Durata" : "Duration", type: "duration", width: 10, summable: true },
      { key: "address", label: isRo ? "Locatie" : "Location", type: "address", width: 40, summable: false },
      { key: "engineStatus", label: isRo ? "Motor" : "Engine", type: "text", width: 10, summable: false },
    ];
  }
  if (reportType === "engine_hours") {
    return [
      { key: "date", label: isRo ? "Data" : "Date", type: "text", width: 14, summable: false },
      { key: "ignitionOn", label: isRo ? "Contact PORNIT" : "Ignition ON", type: "duration", width: 12, summable: true },
      { key: "movingTime", label: isRo ? "In miscare" : "Moving", type: "duration", width: 12, summable: true },
      { key: "idleTime", label: isRo ? "Stationare" : "Idle", type: "duration", width: 12, summable: true },
      { key: "ignitionOff", label: isRo ? "Contact OPRIT" : "Ignition OFF", type: "duration", width: 12, summable: true },
      { key: "distance", label: isRo ? "Distanta (km)" : "Distance (km)", type: "distance", width: 12, align: "right" as const, summable: true },
    ];
  }
  if (reportType === "events" || reportType === "geofence_visits" || reportType === "vehicle_security") {
    return [
      { key: "eventTime", label: isRo ? "Ora" : "Time", type: "datetime", width: 16, summable: false },
      { key: "label", label: isRo ? "Eveniment" : "Event", type: "text", width: 20, summable: false },
      { key: "category", label: isRo ? "Categorie" : "Category", type: "text", width: 12, summable: false },
      { key: "geofenceName", label: isRo ? "Geozona" : "Geofence", type: "text", width: 20, summable: false },
    ];
  }
  if (reportType === "fuel_volume") {
    return [
      { key: "time", label: isRo ? "Ora" : "Time", type: "datetime", width: 16, summable: false },
      { key: "fuelLevel", label: isRo ? "Nivel (L)" : "Level (L)", type: "number", width: 10, align: "right" as const, summable: false },
      { key: "change", label: isRo ? "Modificare (L)" : "Change (L)", type: "number", width: 12, align: "right" as const, summable: true },
      { key: "eventType", label: isRo ? "Tip" : "Type", type: "text", width: 12, summable: false },
      { key: "distance", label: isRo ? "Distanta (km)" : "Distance (km)", type: "number", width: 12, align: "right" as const, summable: true },
      { key: "address", label: isRo ? "Locatie" : "Location", type: "address", width: 30, summable: false },
    ];
  }
  if (reportType === "summary") {
    return [
      { key: "dateLabel", label: isRo ? "Data" : "Date", type: "text", width: 20, summable: false },
      { key: "distance", label: isRo ? "Distanta (km)" : "Distance (km)", type: "number", width: 12, align: "right" as const, summable: true },
      { key: "averageSpeed", label: isRo ? "Viteza Medie" : "Avg Speed", type: "speed", width: 10, align: "right" as const, summable: false },
      { key: "maxSpeed", label: isRo ? "Viteza Max" : "Max Speed", type: "speed", width: 10, align: "right" as const, summable: false },
      { key: "engineHoursFormatted", label: isRo ? "Ore Motor" : "Engine Hours", type: "text", width: 12, summable: false },
      { key: "fuelUsed", label: isRo ? "Combustibil (L)" : "Fuel (L)", type: "number", width: 12, align: "right" as const, summable: true },
      { key: "fuelCost", label: isRo ? "Cost (EUR)" : "Cost (EUR)", type: "number", width: 10, align: "right" as const, summable: true },
    ];
  }
  // Default
  return [
    { key: "startTime", label: "Start", type: "datetime", width: 14, summable: false },
    { key: "endTime", label: "End", type: "datetime", width: 14, summable: false },
    { key: "distance", label: "Distance (km)", type: "distance", width: 12, summable: true },
    { key: "duration", label: "Duration", type: "duration", width: 10, summable: true },
  ];
}

function formatCellValue(trip: Record<string, unknown>, key: string, type: string): string | number {
  const val = trip[key];
  if (val === undefined || val === null) return "-";

  switch (type) {
    case "datetime": {
      const d = new Date(val as string);
      return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    }
    case "address": return String(val || "-");
    case "distance": return Number(formatDistance(val as number));
    case "duration": return formatDuration(val as number);
    case "speed": return Number(val) || 0;
    default: return String(val || "-");
  }
}

function getSummaryRows(summary: Record<string, unknown>, reportType: string, isRo: boolean): [string, string][] {
  if (reportType === "route_sheet") {
    return [
      [isRo ? "Total calatorii" : "Total Trips", String(summary.totalTrips ?? 0)],
      [isRo ? "Distanta totala" : "Total Distance", `${formatDistance(summary.totalDistance as number)} km`],
      [isRo ? "Timp in drum" : "Drive Time", formatDuration(summary.totalDuration as number)],
      [isRo ? "Viteza medie" : "Avg Speed", `${summary.averageSpeed ?? 0} km/h`],
      [isRo ? "Viteza maxima" : "Max Speed", `${summary.maxSpeed ?? 0} km/h`],
      [isRo ? "Timp inactiv" : "Idle Time", formatDuration(summary.totalIdleDuration as number)],
      [isRo ? "Contact PORNIT" : "Ignition ON", formatDuration(summary.totalIgnitionOn as number)],
    ];
  }
  if (reportType === "stops") {
    return [
      [isRo ? "Total opriri" : "Total Stops", String(summary.totalStops ?? 0)],
      [isRo ? "Timp total oprire" : "Total Stop Time", formatDuration(summary.totalStopDuration as number)],
      [isRo ? "Cea mai lunga oprire" : "Longest Stop", formatDuration(summary.longestStop as number)],
      [isRo ? "Motor pornit" : "Engine ON Stops", String(summary.engineOnStops ?? 0)],
      [isRo ? "Motor oprit" : "Engine OFF Stops", String(summary.engineOffStops ?? 0)],
    ];
  }
  if (reportType === "engine_hours") {
    return [
      [isRo ? "Total zile" : "Total Days", String(summary.totalDays ?? 0)],
      [isRo ? "Total contact PORNIT" : "Total Ignition ON", formatDuration(summary.totalIgnitionOn as number)],
      [isRo ? "Total in miscare" : "Total Moving", formatDuration(summary.totalMovingTime as number)],
      [isRo ? "Total stationare" : "Total Idle", formatDuration(summary.totalIdleTime as number)],
      [isRo ? "Total contact OPRIT" : "Total Ignition OFF", formatDuration(summary.totalIgnitionOff as number)],
      [isRo ? "Distanta totala" : "Total Distance", `${formatDistance(summary.totalDistance as number)} km`],
    ];
  }
  if (reportType === "events" || reportType === "geofence_visits" || reportType === "vehicle_security") {
    return [
      [isRo ? "Total evenimente" : "Total Events", String(summary.totalEvents ?? 0)],
      [isRo ? "Contact PORNIT" : "Ignition ON", String(summary.ignitionOnCount ?? 0)],
      [isRo ? "Contact OPRIT" : "Ignition OFF", String(summary.ignitionOffCount ?? 0)],
      [isRo ? "Intrari geozona" : "Geofence Enter", String(summary.geofenceEnterCount ?? 0)],
      [isRo ? "Iesiri geozona" : "Geofence Exit", String(summary.geofenceExitCount ?? 0)],
      [isRo ? "Depasiri viteza" : "Overspeeds", String(summary.overspeedCount ?? 0)],
      [isRo ? "Alarme" : "Alarms", String(summary.alarmCount ?? 0)],
    ];
  }
  if (reportType === "fuel_volume") {
    return [
      [isRo ? "Nivel initial" : "Start Level", `${summary.startLevel ?? 0} L`],
      [isRo ? "Nivel final" : "End Level", `${summary.endLevel ?? 0} L`],
      [isRo ? "Total consumat" : "Total Consumed", `${summary.totalConsumed ?? 0} L`],
      [isRo ? "Total alimentat" : "Total Refueled", `${summary.totalRefueled ?? 0} L`],
      [isRo ? "Nr. alimentari" : "Refuel Count", String(summary.refuelCount ?? 0)],
      [isRo ? "Nr. scaderi suspecte" : "Suspicious Drops", String(summary.dropCount ?? 0)],
      [isRo ? "Consum mediu" : "Avg Consumption", `${summary.avgConsumption ?? 0} L/100km`],
      [isRo ? "Distanta totala" : "Total Distance", `${summary.totalDistance ?? 0} km`],
    ];
  }
  if (reportType === "summary") {
    return [
      [isRo ? "Zile cu activitate" : "Days with Activity", String(summary.daysWithActivity ?? 0)],
      [isRo ? "Distanta totala" : "Total Distance", `${summary.totalDistance ?? 0} km`],
      [isRo ? "Viteza medie" : "Average Speed", `${summary.averageSpeed ?? 0} km/h`],
      [isRo ? "Viteza maxima" : "Max Speed", `${summary.maxSpeed ?? 0} km/h`],
      [isRo ? "Ore motor total" : "Total Engine Hours", String(summary.totalEngineHoursFormatted ?? "00:00")],
      [isRo ? "Combustibil total" : "Total Fuel Used", `${summary.totalFuelUsed ?? 0} L`],
      [isRo ? "Cost total" : "Total Fuel Cost", `€${summary.totalFuelCost ?? 0}`],
      [isRo ? "Consum mediu" : "Avg Consumption", `${summary.avgFuelConsumption ?? 0} L/100km`],
    ];
  }
  return [];
}
