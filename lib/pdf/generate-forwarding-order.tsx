"use client";

import { createClient } from "@/lib/supabase/client";

interface TemplateBlock {
  id: string;
  type: string;
  visible: boolean;
  props: Record<string, any>;
}

interface TemplateData {
  blocks: TemplateBlock[];
  pageSettings: {
    fontSize: number;
    primaryColor: string;
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    orientation: "portrait" | "landscape";
  };
}

export interface OrderTemplate {
  id: string;
  name: string;
  template_type: string;
  html_template: any;
  is_default: boolean;
}

// ─── Multi-language labels ───────────────────────────────────
const LANG_LABELS: Record<string, Record<string, string>> = {
  en: {
    reference: "Reference", date: "Date", status: "Status", type: "Type", forwarding: "Forwarding",
    cargoDetails: "Cargo Details", weight: "Weight", pallets: "Pallets", loadingMeters: "Loading Meters",
    goodsType: "Goods Type", financialSummary: "Financial Summary", customerPrice: "Customer Price",
    carrierCost: "Carrier Cost", margin: "Margin", paymentTerms: "Payment Terms", daysUnit: "days", carrier: "Carrier",
    customer: "Customer", notes: "Special Instructions", noInstructions: "No special instructions.",
    terms: "Terms & Conditions", sender: "Sender", stamp: "Stamp", page: "Page", of: "of",
    pickup: "Pickup", delivery: "Delivery", customs: "Customs", fuel: "Fuel", rest: "Rest",
    border: "Border", transit: "Transit", nr: "#", stopType: "Type", company: "Company",
    location: "Location", time: "Time", ref: "Ref",
    vehicleInfo: "Vehicle & Driver", vehicle: "Vehicle", trailer: "Trailer", driver: "Driver", phone: "Phone",
  },
  ro: {
    reference: "Referinta", date: "Data", status: "Status", type: "Tip", forwarding: "Expeditie",
    cargoDetails: "Detalii Marfa", weight: "Greutate", pallets: "Paleti", loadingMeters: "Metri Incarcare",
    goodsType: "Tip Marfa", financialSummary: "Sumar Financiar", customerPrice: "Pret Client",
    carrierCost: "Cost Transportator", margin: "Marja", paymentTerms: "Termen de Plată", daysUnit: "zile", carrier: "Transportator",
    customer: "Client", notes: "Instructiuni Speciale", noInstructions: "Fara instructiuni speciale.",
    terms: "Termeni si Conditii", sender: "Expeditor", stamp: "Stampila", page: "Pagina", of: "din",
    pickup: "Incarcare", delivery: "Descarcare", customs: "Vama", fuel: "Alimentare", rest: "Pauza",
    border: "Frontiera", transit: "Tranzit", nr: "#", stopType: "Tip", company: "Firma",
    location: "Locatie", time: "Ora", ref: "Ref",
    vehicleInfo: "Vehicul & Șofer", vehicle: "Autovehicul", trailer: "Remorcă", driver: "Șofer", phone: "Telefon",
  },
  de: {
    reference: "Referenz", date: "Datum", status: "Status", type: "Typ", forwarding: "Spedition",
    cargoDetails: "Frachtdetails", weight: "Gewicht", pallets: "Paletten", loadingMeters: "Lademeter",
    goodsType: "Warenart", financialSummary: "Finanzubersicht", customerPrice: "Kundenpreis",
    carrierCost: "Frachtkosten", margin: "Marge", paymentTerms: "Zahlungsbedingungen", daysUnit: "Tage", carrier: "Spediteur",
    customer: "Kunde", notes: "Besondere Anweisungen", noInstructions: "Keine besonderen Anweisungen.",
    terms: "Allgemeine Geschaftsbedingungen", sender: "Absender", stamp: "Stempel", page: "Seite", of: "von",
    pickup: "Abholung", delivery: "Lieferung", customs: "Zoll", fuel: "Tanken", rest: "Pause",
    border: "Grenze", transit: "Transit", nr: "#", stopType: "Typ", company: "Firma",
    location: "Standort", time: "Zeit", ref: "Ref",
    vehicleInfo: "Fahrzeug & Fahrer", vehicle: "Fahrzeug", trailer: "Anhänger", driver: "Fahrer", phone: "Telefon",
  },
  hu: {
    reference: "Hivatkozas", date: "Datum", status: "Allapot", type: "Tipus", forwarding: "Szallitmanyozas",
    cargoDetails: "Rakomany Reszletek", weight: "Suly", pallets: "Raklapok", loadingMeters: "Rakodasi Meter",
    goodsType: "Aru Tipusa", financialSummary: "Penzugyi Osszefoglalo", customerPrice: "Ugyfeli Ar",
    carrierCost: "Fuvarozoi Koltseg", margin: "Marzs", paymentTerms: "Fizetesi Feltetelek", daysUnit: "nap", carrier: "Fuvarozo",
    customer: "Ugyfel", notes: "Kulonleges Utasitasok", noInstructions: "Nincsenek kulonleges utasitasok.",
    terms: "Szerzodesi Feltetelek", sender: "Felado", stamp: "Pecsét", page: "Oldal", of: "/",
    pickup: "Felvetel", delivery: "Kiszallitas", customs: "Vam", fuel: "Tankolas", rest: "Pihenő",
    border: "Hatar", transit: "Tranzit", nr: "#", stopType: "Tipus", company: "Ceg",
    location: "Helyszin", time: "Ido", ref: "Ref",
    vehicleInfo: "Jármű & Sofőr", vehicle: "Jármű", trailer: "Pótkocsi", driver: "Sofőr", phone: "Telefon",
  },
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", confirmed: "Confirmed", dispatched: "Allocated",
  in_transit: "In Transit", delivered: "Delivered", completed: "Completed",
  cancelled: "Cancelled",
};

function fmtCur(amount: number | null, currency: string): string {
  if (amount == null) return "-";
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function infoCell(label: string, value: string | number): string {
  return `<div style="padding:5px 6px;background:#f9fafb;border-radius:3px;border:0.5px solid #e5e7eb;"><div style="font-size:9px;color:#6b7280;">${label}</div><div style="font-size:11px;font-weight:600;color:#111827;">${value}</div></div>`;
}

// Format any date-ish input to Romanian-style "dd.mm.yyyy". Accepts:
//   • ISO strings ("2026-05-10", "2026-05-10T08:30:00Z")
//   • Date objects
//   • Localized strings already in dd/mm/yyyy or dd-mm-yyyy form
//   • Empty / null → returns ""
// All printed dates across the order document funnel through this so a
// single rule controls the entire visible format (header date, stop
// planned_date, signature today, order_info Data, etc.) — previously
// the file had three different inline slicings/formats which is why
// some places showed "2026-05-10" and others "11/05/2026".
function toDDMMYYYY(input: unknown): string {
  if (!input) return "";
  if (input instanceof Date) {
    const dd = String(input.getDate()).padStart(2, "0");
    const mm = String(input.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${input.getFullYear()}`;
  }
  const s = String(input).trim();
  if (!s) return "";
  // ISO yyyy-mm-dd or yyyy-mm-ddThh:mm:ssZ
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  // dd/mm/yyyy or dd-mm-yyyy → dd.mm.yyyy
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    const yy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${dd}.${mm}.${yy}`;
  }
  // Last resort: try Date.parse and reformat
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const dd = String(parsed.getDate()).padStart(2, "0");
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${parsed.getFullYear()}`;
  }
  return s;
}

/**
 * Substitute `{{key}}` placeholders found inside template strings with real
 * order/company/customer/carrier values. Used for the Romanian Comandă de
 * Transport template (and any other localized template) so authors can write
 * narrative paragraphs that reference dynamic data without HTML editing.
 *
 * Unknown keys are intentionally replaced with an empty string so the saved
 * document never leaks raw `{{...}}` markers to the recipient.
 */
function buildSubstitutionContext(data: any) {
  const o: any = data.order || {};
  const company: any = data.company || {};
  const customer: any = o.customer || {};
  const carrier: any = o.carrier || {};

  const companyAddress = [company.address_line1, company.address_line2, company.city, company.country, company.postal_code]
    .filter(Boolean).join(", ");
  // Mailing / correspondence address — printed above the conditions
  // section. Prefers explicit mailing_* fields if the company has set
  // them, otherwise falls back to the registered address fields.
  const companyCorrespondence = [
    company.mailing_address_line1 ?? company.address_line1,
    company.mailing_city ?? company.city,
    company.mailing_country ?? company.country,
  ].filter(Boolean).join(", ");
  const customerAddress = [customer.address_line1, customer.city, customer.country].filter(Boolean).join(", ");
  const carrierAddress = [carrier.address_line1, carrier.city, carrier.country].filter(Boolean).join(", ");

  return {
    // Order
    reference_number: o.reference_number ?? "",
    order_date: toDDMMYYYY(o.created_at),
    customer_reference: o.customer_reference ?? "",
    payment_terms_carrier_days: o.payment_terms_carrier_days ?? 30,
    payment_terms_customer_days: o.payment_terms_customer_days ?? 30,
    customer_currency: o.customer_currency ?? "EUR",
    carrier_currency: o.carrier_currency ?? "EUR",
    customer_price: o.customer_price ?? "",
    carrier_cost: o.carrier_cost ?? "",
    // Free-text notes the operator types into the order. When empty we
    // leave the placeholder as an empty string so the substituted block
    // simply renders blank rather than the raw "{{...}}" marker.
    carrier_payment_notes: o.carrier_payment_notes ?? "",
    // Company (own)
    company_name: company.company_name ?? "",
    company_address: companyAddress,
    company_correspondence_address: companyCorrespondence,
    company_phone: company.phone ?? "",
    company_email: company.email ?? "",
    company_vat: company.vat_number ?? "",
    // Customer
    customer_name: customer.name ?? "",
    customer_vat: customer.vat_number ?? customer.tax_id ?? "",
    customer_address: customerAddress,
    // Carrier
    carrier_name: carrier.name ?? "Not assigned",
    carrier_vat: carrier.vat_number ?? carrier.tax_id ?? "",
    carrier_address: carrierAddress,
    carrier_contact: carrier.contact_person ?? "",
  } as Record<string, string | number>;
}

function substituteVars(text: string, ctx: Record<string, string | number>): string {
  if (!text || !text.includes("{{")) return text;
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = ctx[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

function renderBlock(block: TemplateBlock, data: any, pc: string, fs: number, lang: string): string {
  const L = LANG_LABELS[lang] || LANG_LABELS.en;
  const o = data.order;
  const company = data.company;
  const stops = data.stops;
  const customer = o.customer || {};
  const carrier = o.carrier || {};

  // Build the substitution context once per block so we can interpolate
  // {{...}} placeholders into any user-authored text in the template.
  const ctx = buildSubstitutionContext(data);
  const sub = (s: string | undefined) => substituteVars(s ?? "", ctx);

  const stopTypeLabel = (type: string) => (L as any)[type] || type;

  switch (block.type) {
    case "company_header": {
      // Stunning carrier-order header. Three-column band: logo on the
      // left, big document title centered, reference + date stacked on
      // the right. The colored accent bar at the bottom doubles as a
      // visual separator from the body. All optional template props are
      // respected (showLogo / showVat / showPhone / showEmail). Title and
      // subtitle support {{...}} substitution.
      const headerTitle    = sub(block.props.title) || "TRANSPORT ORDER";
      const headerSubtitle = sub(block.props.subtitle) || "";
      const initials = (company.company_name || "CO").trim().split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
      const logoBlock = block.props.showLogo
        ? (company.logo_url
            ? `<img src="${company.logo_url}" alt="${company.company_name || "Logo"}" crossorigin="anonymous" style="width:72px;height:72px;object-fit:contain;flex-shrink:0;" />`
            : `<div style="width:72px;height:72px;background:linear-gradient(135deg,${pc}25,${pc}10);border:1px solid ${pc}40;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:22px;font-weight:800;color:${pc};letter-spacing:-0.02em;">${initials}</span></div>`)
        : "";
      const contactBits = [
        block.props.showAddress && [company.address_line1, company.city, company.country, company.postal_code].filter(Boolean).join(", "),
        block.props.showVat && company.vat_number && `VAT ${company.vat_number}`,
        block.props.showPhone && company.phone && `Tel ${company.phone}`,
        block.props.showEmail && company.email,
      ].filter(Boolean) as string[];
      return `
        <div style="padding:0 0 12px 0;page-break-inside:avoid;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;background:linear-gradient(180deg,#ffffff 0%, ${pc}06 100%);border:1px solid ${pc}25;border-radius:10px;">
            <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;">
              ${logoBlock}
              <div style="min-width:0;">
                <div style="font-size:17px;font-weight:800;color:${pc};letter-spacing:-0.01em;line-height:1.1;">${company.company_name || "Company"}</div>
                ${contactBits.length > 0 ? `<div style="font-size:10px;color:#6b7280;margin-top:4px;line-height:1.5;">${contactBits.join(" &nbsp;·&nbsp; ")}</div>` : ""}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:11px;font-weight:600;color:${pc};letter-spacing:0.12em;text-transform:uppercase;">${headerTitle}</div>
              ${headerSubtitle ? `<div style="font-size:9px;color:#9ca3af;margin-top:2px;">${headerSubtitle}</div>` : ""}
              <div style="margin-top:6px;font-size:17px;font-weight:800;color:#111827;letter-spacing:-0.01em;">${o.reference_number || ""}</div>
              <div style="font-size:10px;color:#6b7280;">${toDDMMYYYY(o.created_at)}</div>
            </div>
          </div>
          <div style="height:3px;background:linear-gradient(90deg,${pc} 0%, ${pc}80 60%, transparent 100%);border-radius:2px;margin-top:6px;"></div>
        </div>`;
    }

    case "order_info":
      return `
        <div style="padding:8px 0;display:flex;gap:18px;align-items:center;flex-wrap:wrap;">
          <div><div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">${L.reference}</div><div style="font-size:14px;font-weight:700;color:#111827;">${o.reference_number}</div></div>
          ${block.props.showDate ? `<div><div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">${L.date}</div><div style="font-size:12px;color:#374151;">${toDDMMYYYY(o.created_at) || "-"}</div></div>` : ""}
          ${block.props.showStatus ? `<div><div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">${L.status}</div><span style="font-size:10px;background:${pc}15;color:${pc};padding:2px 6px;border-radius:4px;font-weight:600;">${STATUS_LABELS[o.status] || o.status}</span></div>` : ""}
          ${block.props.showType ? `<div><div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">${L.type}</div><div style="font-size:11px;color:#374151;">${L.forwarding}</div></div>` : ""}
        </div>`;

    case "route_summary": {
      const pickups = stops.filter((s: any) => s.stop_type === "pickup");
      const deliveries = stops.filter((s: any) => s.stop_type === "delivery");
      const origin = pickups[0] ? `${pickups[0].city || "?"}, ${pickups[0].country || ""}` : "-";
      const dest = deliveries[deliveries.length - 1] ? `${deliveries[deliveries.length - 1].city || "?"}, ${deliveries[deliveries.length - 1].country || ""}` : "-";
      return `
        <div style="padding:10px 12px;background:${pc}08;border-radius:6px;border:1px solid ${pc}20;display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:12px;font-weight:600;color:#111827;">${origin}</span>
            <span style="font-size:12px;color:${pc};">&rarr;</span>
            <span style="font-size:12px;font-weight:600;color:#111827;">${dest}</span>
          </div>
          <div style="display:flex;gap:12px;">
            ${block.props.showDistance ? `<span style="font-size:10px;color:#6b7280;">${o.estimated_distance_km ? `${Math.round(o.estimated_distance_km)} km` : "-"}</span>` : ""}
            ${block.props.showDuration ? `<span style="font-size:10px;color:#6b7280;">${o.estimated_duration_hours ? `${o.estimated_duration_hours.toFixed(1)}h` : "-"}</span>` : ""}
          </div>
        </div>`;
    }

    case "stops_table":
      return `
        <div style="padding:6px 0;">
          <table style="width:100%;border-collapse:collapse;font-size:${fs - 1}px;">
            <thead>
              <tr style="background:${pc}10;">
                <th style="padding:6px 8px;text-align:left;font-weight:600;color:${pc};border-bottom:1px solid ${pc}30;font-size:${fs - 2}px;letter-spacing:0.02em;">${L.nr}</th>
                <th style="padding:6px 8px;text-align:left;font-weight:600;color:${pc};border-bottom:1px solid ${pc}30;font-size:${fs - 2}px;letter-spacing:0.02em;">${L.stopType}</th>
                <th style="padding:6px 8px;text-align:left;font-weight:600;color:${pc};border-bottom:1px solid ${pc}30;font-size:${fs - 2}px;letter-spacing:0.02em;">${L.company}</th>
                <th style="padding:6px 8px;text-align:left;font-weight:600;color:${pc};border-bottom:1px solid ${pc}30;font-size:${fs - 2}px;letter-spacing:0.02em;">${L.location}</th>
                <th style="padding:6px 8px;text-align:left;font-weight:600;color:${pc};border-bottom:1px solid ${pc}30;font-size:${fs - 2}px;letter-spacing:0.02em;">${L.date}</th>
                ${block.props.showTimeWindow ? `<th style="padding:6px 8px;text-align:left;font-weight:600;color:${pc};border-bottom:1px solid ${pc}30;font-size:${fs - 2}px;letter-spacing:0.02em;">${L.time}</th>` : ""}
                ${block.props.showReference ? `<th style="padding:6px 8px;text-align:left;font-weight:600;color:${pc};border-bottom:1px solid ${pc}30;font-size:${fs - 2}px;letter-spacing:0.02em;">${L.ref}</th>` : ""}
              </tr>
            </thead>
            <tbody>
              ${stops.map((stop: any, i: number) => {
                const typeLabel = stopTypeLabel(stop.stop_type);
                const typeBg = stop.stop_type === "pickup" ? "#dbeafe" : stop.stop_type === "delivery" ? "#dcfce7" : "#f3f4f6";
                const typeClr = stop.stop_type === "pickup" ? "#1d4ed8" : stop.stop_type === "delivery" ? "#15803d" : "#6b7280";
                return `<tr style="border-bottom:0.5px solid #e5e7eb;">
                  <td style="padding:6px 8px;color:#6b7280;">${i + 1}</td>
                  <td style="padding:6px 8px;"><span style="font-size:${fs - 2}px;background:${typeBg};color:${typeClr};padding:2px 6px;border-radius:3px;font-weight:500;">${typeLabel}</span></td>
                  <td style="padding:6px 8px;font-weight:500;color:#111827;">${stop.company_name || "-"}</td>
                  <td style="padding:6px 8px;color:#374151;">${
                    // Locatie format: "City (postal_code), Country - address"
                    // Postal code appears in parentheses right after the city
                    // when populated, otherwise we fall back to the previous
                    // "City, Country" rendering. The address segment stays
                    // gated on the block's showAddress flag.
                    (() => {
                      const cityPart = stop.postal_code
                        ? `${stop.city || ""} (${stop.postal_code})`.trim()
                        : (stop.city || "");
                      const head = [cityPart, stop.country].filter(Boolean).join(", ");
                      const tail = block.props.showAddress && stop.address ? ` - ${stop.address}` : "";
                      return head + tail;
                    })()
                  }</td>
                  <td style="padding:6px 8px;color:#374151;">${toDDMMYYYY(stop.planned_date) || "-"}</td>
                  ${block.props.showTimeWindow ? `<td style="padding:6px 8px;color:#6b7280;">${[stop.planned_time_from, stop.planned_time_to].filter(Boolean).join(" - ") || "-"}</td>` : ""}
                  ${block.props.showReference ? `<td style="padding:6px 8px;color:#6b7280;">${stop.reference_number || "-"}</td>` : ""}
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`;

    case "cargo_details": {
      const cells: string[] = [];
      if (block.props.showWeight) cells.push(infoCell(L.weight, o.weight_kg ? `${o.weight_kg} kg` : "-"));
      if (block.props.showPallets) cells.push(infoCell(L.pallets, o.pallet_count || "-"));
      if (block.props.showVolume) cells.push(infoCell(L.loadingMeters, o.loading_meters || "-"));
      if (block.props.showGoodsType) cells.push(infoCell(L.goodsType, o.goods_type || "-"));
      return `
        <div style="padding:8px 0;">
          <div style="font-size:11px;font-weight:700;color:#111827;margin-bottom:6px;letter-spacing:0.02em;">${L.cargoDetails}</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">${cells.join("")}</div>
        </div>`;
    }

    // Vehicle / Trailer / Driver block. The data is sourced from the
    // linked trip-leg via fetchOrderData (which merges
    // subcontractor_vehicle_plate / subcontractor_trailer_plate /
    // subcontractor_driver_name / subcontractor_driver_phone — plus
    // joined own-fleet vehicle/driver/trailer for non-subcontracted
    // legs — into the order object). Renders a 3-column band so it
    // sits naturally next to the Cargo Details / Financial Summary.
    case "vehicle_info": {
      const vehiclePlate = o.vehicle_plate || "-";
      const trailerPlate = o.trailer_plate || "-";
      const drvName = o.driver_name || "-";
      const drvPhone = o.driver_phone || "";
      const driverDisplay = drvPhone && drvName !== "-" ? `${drvName} · ${drvPhone}` : drvName;

      // Hide the whole block when nothing is assigned (avoids ugly
      // "- / - / -" boxes on draft FWD orders) UNLESS the template
      // explicitly opts in via alwaysShow.
      const hasAny = (o.vehicle_plate || o.trailer_plate || o.driver_name || o.driver_phone);
      if (!hasAny && !block.props.alwaysShow) return "";

      const cells: string[] = [];
      if (block.props.showVehicle !== false) cells.push(infoCell(L.vehicle, vehiclePlate));
      if (block.props.showTrailer !== false) cells.push(infoCell(L.trailer, trailerPlate));
      if (block.props.showDriver !== false)  cells.push(infoCell(L.driver,  driverDisplay));
      return `
        <div style="padding:8px 0;page-break-inside:avoid;">
          <div style="font-size:11px;font-weight:700;color:#111827;margin-bottom:6px;letter-spacing:0.02em;">${L.vehicleInfo}</div>
          <div style="display:grid;grid-template-columns:repeat(${cells.length || 1},1fr);gap:6px;">${cells.join("")}</div>
        </div>`;
    }

    case "financial_summary": {
      // For Romanian fiscal compliance the carrier confirmation must show
      // net / VAT / gross when the cost is taxable. We render the breakdown
      // inline below the carrier-cost cell only when the type is
      // 'excluding' or 'including' and a non-zero rate is configured. For
      // exempt / reverse_charge / non_taxable rows we surface a small badge
      // instead, since those are the legally required mentions.
      const cVatType: string = o.carrier_vat_type || "excluding";
      const cVatRate: number = o.carrier_vat_rate ?? 19;
      const cVatNonTaxable = ["exempt", "reverse_charge", "non_taxable"].includes(cVatType);
      const cNet  = o.carrier_cost_without_vat ?? o.carrier_cost;
      const cVat  = o.carrier_vat_amount ?? 0;
      const cGross = o.carrier_cost_with_vat ?? o.carrier_cost;
      const cVatBadge = cVatType === "exempt" ? "Scutit de TVA"
        : cVatType === "reverse_charge" ? "Taxare inversă"
        : cVatType === "non_taxable" ? "Non-taxable" : "";
      return `
        <div style="padding:8px 0;">
          <div style="font-size:11px;font-weight:700;color:#111827;margin-bottom:6px;letter-spacing:0.02em;">${L.financialSummary}</div>
          <div style="display:flex;gap:8px;">
            ${block.props.showCustomerPrice ? `<div style="flex:1;padding:7px 8px;background:#f0fdf4;border-radius:4px;border:0.5px solid #bbf7d0;"><div style="font-size:9px;color:#6b7280;">${L.customerPrice}</div><div style="font-size:14px;font-weight:700;color:#15803d;">${fmtCur(o.customer_price, o.customer_currency || "EUR")}</div></div>` : ""}
            ${block.props.showCarrierCost ? `
              <div style="flex:1;padding:7px 8px;background:#fef2f2;border-radius:4px;border:0.5px solid #fecaca;">
                <div style="font-size:9px;color:#6b7280;">${L.carrierCost}${cVatType === "including" ? " (incl. VAT)" : cVatType === "excluding" ? " (excl. VAT)" : ""}</div>
                <div style="font-size:14px;font-weight:700;color:#dc2626;">${fmtCur(o.carrier_cost, o.carrier_currency || "EUR")}</div>
                ${cVatNonTaxable ? `<div style="font-size:9px;color:#b45309;margin-top:3px;">${cVatBadge}</div>` : `
                  <div style="font-size:9px;color:#6b7280;margin-top:3px;">VAT (${cVatRate}%): ${fmtCur(cVat, o.carrier_currency || "EUR")}</div>
                  <div style="font-size:10px;color:#111827;font-weight:600;">${cVatType === "including" ? "Net" : "Total"}: ${fmtCur(cVatType === "including" ? cNet : cGross, o.carrier_currency || "EUR")}</div>
                `}
              </div>` : ""}
            ${block.props.showMargin ? (() => {
              const margin = (o.customer_price && o.carrier_cost) ? o.customer_price - o.carrier_cost : null;
              const pct = (o.customer_price && o.carrier_cost && o.customer_price > 0) ? ((margin! / o.customer_price) * 100).toFixed(1) + "%" : "-";
              return `<div style="flex:1;padding:7px 8px;background:${pc}08;border-radius:4px;border:0.5px solid ${pc}30;"><div style="font-size:9px;color:#6b7280;">${L.margin}</div><div style="font-size:14px;font-weight:700;color:${pc};">${margin != null ? fmtCur(margin, o.customer_currency || "EUR") : "-"} (${pct})</div></div>`;
            })() : ""}
          </div>
          ${block.props.showPaymentTerms ? `<div style="font-size:11px;color:#6b7280;margin-top:6px;">${L.paymentTerms}: ${o.payment_terms_carrier_days ?? o.payment_terms ?? 30} ${(L as any).daysUnit || "days"}</div>` : ""}
        </div>`;
    }

    case "carrier_info":
      return `
        <div style="padding:8px 0;">
          <div style="font-size:11px;font-weight:700;color:#111827;margin-bottom:6px;letter-spacing:0.02em;">${L.carrier}</div>
          <div style="padding:8px 10px;background:#f9fafb;border-radius:4px;border:0.5px solid #e5e7eb;">
            <div style="font-size:12px;font-weight:600;color:#111827;">${carrier.name || "Not assigned"}</div>
            ${block.props.showContact ? `<div style="font-size:10px;color:#6b7280;margin-top:3px;">${[carrier.contact_person, carrier.phone, carrier.email].filter(Boolean).join(" | ") || "-"}</div>` : ""}
            ${block.props.showVat ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;">VAT: ${carrier.vat_number || carrier.tax_id || "-"}</div>` : ""}
          </div>
        </div>`;

    case "customer_info":
      return `
        <div style="padding:8px 0;">
          <div style="font-size:11px;font-weight:700;color:#111827;margin-bottom:6px;letter-spacing:0.02em;">${L.customer}</div>
          <div style="padding:8px 10px;background:#f9fafb;border-radius:4px;border:0.5px solid #e5e7eb;">
            <div style="font-size:12px;font-weight:600;color:#111827;">${customer.name || "-"}</div>
            ${block.props.showContact ? `<div style="font-size:10px;color:#6b7280;margin-top:3px;">${[customer.contact_person, customer.phone, customer.email].filter(Boolean).join(" | ") || "-"}</div>` : ""}
            ${block.props.showVat ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;">VAT: ${customer.vat_number || customer.tax_id || "-"}</div>` : ""}
          </div>
        </div>`;

    case "notes":
      return `
        <div style="padding:8px 0;">
          <div style="font-size:11px;font-weight:700;color:#111827;margin-bottom:4px;letter-spacing:0.02em;">${block.props.title || L.notes}</div>
          <div style="padding:8px 10px;background:#fffbeb;border-radius:4px;border:0.5px solid #fde68a;min-height:30px;font-size:10px;color:#92400e;line-height:1.5;">
            ${o.special_instructions || o.internal_notes || L.noInstructions}
          </div>
        </div>`;

    case "terms": {
      // Substitute placeholders ({{payment_terms_carrier_days}} etc.) BEFORE
      // converting newlines so the raw template text never reaches the user.
      const termsText = sub(block.props.text || "").replace(/\n/g, "<br>");
      const termsTitle = sub(block.props.title) || L.terms;
      return `
        <div style="padding:8px 0;page-break-inside:avoid;">
          <div style="font-size:9px;font-weight:700;color:#111827;margin-bottom:4px;letter-spacing:0.02em;">${termsTitle}</div>
          <div style="font-size:${block.props.fontSize || 11}px;color:#374151;line-height:1.6;">${termsText}</div>
        </div>`;
    }

    // Pseudo-block produced by the splitter below. Renders one numbered
    // section of a long terms paragraph with `page-break-inside: avoid` so
    // sections never split across pages, but ADJACENT sections may live
    // on different pages — this lets the planner fill page 1 to the
    // bottom before continuing on page 2 (no more half-empty page 1).
    case "_terms_section" as any: {
      const sectionText = sub((block.props as any).text || "").replace(/\n/g, "<br>");
      const sectionTitle = (block.props as any).isFirst ? (sub((block.props as any).title) || L.terms) : "";
      return `
        <div style="padding:${(block.props as any).isFirst ? 8 : 2}px 0 4px 0;page-break-inside:avoid;">
          ${sectionTitle ? `<div style="font-size:9px;font-weight:700;color:#111827;margin-bottom:4px;letter-spacing:0.02em;">${sectionTitle}</div>` : ""}
          <div style="font-size:${(block.props as any).fontSize || 11}px;color:#374151;line-height:1.6;">${sectionText}</div>
        </div>`;
    }

    case "signature_area": {
      // Resolve labels for both signing parties, then render the LEFT party
      // (the sender / our company) with a real stamp image when one is
      // configured under Settings → Company. The RIGHT party (carrier) keeps
      // a neutral placeholder since we don't have their stamp on file. This
      // is what the user expects on the printed Comandă de Transport.
      const leftLabel  = sub(block.props.leftLabel)  || L.sender;
      const rightLabel = sub(block.props.rightLabel) || L.carrier;
      const stampUrl: string | undefined = (data.company as any)?.stamp_url;
      const renderStamp = (side: "left" | "right") => {
        if (!block.props.showStamp) return "";
        // Stamp doubled to 200px square per user request — matches the
        // real-world ~5–6cm diameter of a company rubber stamp on paper.
        if (side === "left" && stampUrl) {
          return `<img src="${stampUrl}" alt="Company stamp" crossorigin="anonymous" style="width:200px;height:200px;object-fit:contain;margin-top:10px;" />`;
        }
        return `<div style="width:200px;height:200px;border:1px dashed #d1d5db;border-radius:8px;margin-top:10px;display:flex;align-items:center;justify-content:center;"><span style="font-size:11px;color:#9ca3af;letter-spacing:0.06em;">${L.stamp}</span></div>`;
      };
      // Auto-prefill the date for the SENDER (left) signature when the
      // template requests it — that's our company so we always know the
      // issue date. The carrier (right) box keeps the empty placeholder
      // since it gets filled when they physically sign. Uses dd.mm.yyyy
      // throughout, matching the rest of the document.
      const todayStr = toDDMMYYYY(new Date());
      const renderDate = (side: "left" | "right") => {
        if (!block.props.showDate) return "";
        if (block.props.autoFillDate && side === "left") {
          return `<div style="font-size:11px;color:#111827;font-weight:600;">${L.date}: ${todayStr}</div>`;
        }
        return `<div style="font-size:11px;color:#6b7280;font-weight:500;">${L.date}: ____.____.________</div>`;
      };
      // Compact signing band. Previously rendered an empty 65px
      // border-bottom strip BETWEEN the party label and the Data line —
      // that produced a visible blank stripe (the gap the operator
      // pointed out). We collapse that stripe to a thin underline
      // directly under the label, then place Data immediately below.
      // Physical signing happens over the stamp area or via the
      // company-stamp image we render below, so a separate empty
      // signature strip is no longer needed.
      return `
        <div style="padding:10px 0;display:flex;gap:28px;page-break-inside:avoid;">
          ${(["left", "right"] as const).map((side) => {
            const label = side === "left" ? leftLabel : rightLabel;
            return `
              <div style="flex:1;">
                <div style="font-size:11px;font-weight:700;color:#111827;margin-bottom:4px;letter-spacing:0.04em;text-transform:uppercase;border-bottom:1px solid #9ca3af;padding-bottom:6px;">${label}</div>
                <div style="margin-top:6px;">${renderDate(side)}</div>
                ${renderStamp(side)}
              </div>`;
          }).join("")}
        </div>`;
    }

    case "custom_text": {
      // Same substitution + newline pass as `terms`. If the substituted
      // body is empty (e.g. an "Observații" block with no carrier notes
      // typed into the order), we render NOTHING so the document doesn't
      // surface an empty stub box on the printed page.
      const customText = sub(block.props.text || "").replace(/\n/g, "<br>").trim();
      const customTitle = sub(block.props.title);
      if (!customText && !block.props.alwaysShow) return "";
      return `
        <div style="padding:6px 0;font-size:${block.props.fontSize || 12}px;color:#374151;font-weight:${block.props.bold ? 700 : 400};text-align:${block.props.alignment || "left"};page-break-inside:avoid;">
          ${customTitle ? `<div style="font-weight:700;margin-bottom:2px;color:#111827;">${customTitle}</div>` : ""}
          ${customText ? `<div style="line-height:1.5;color:#4b5563;background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 8px;border-radius:3px;">${customText}</div>` : ""}
        </div>`;
    }

    case "divider":
      return `<hr style="border:none;border-top:${block.props.thickness || 1}px ${block.props.style || "solid"} ${block.props.color || "#e5e7eb"};margin:6px 0;" />`;

    case "footer": {
      // Three-column footer band. The center holds the optional contact
      // line, the LEFT carries the template's customText (page numbers,
      // reference, etc.), and the RIGHT carries an always-present, very
      // subtle "generat de bngtracking.ro" attribution. The attribution
      // is hard-coded (not a placeholder) because it identifies the
      // platform — analogous to a "powered by" stamp.
      const leftText  = block.props.customText ? sub(block.props.customText) : "";
      const centerText = block.props.showContact
        ? `${company.company_name || ""} | ${company.phone || ""} | ${company.email || ""}`
        : "";
      // Footer text bumped from 7px / 6.5px to 9px / 8.5px — the old
      // size was nearly unreadable on the printed page (operator
      // feedback). The attribution stays a touch smaller than the
      // primary footer text so it reads as supporting metadata, not as
      // a peer of the order reference.
      return `
        <div style="padding:6px 0;border-top:0.5px solid #e5e7eb;margin-top:6px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <span style="font-size:9px;color:#6b7280;flex:1;text-align:left;">${leftText}</span>
          <span style="font-size:9px;color:#6b7280;flex:1;text-align:center;">${centerText}</span>
          <span style="font-size:8.5px;color:#9ca3af;font-style:italic;letter-spacing:0.02em;flex:1;text-align:right;">generat de bngtracking.ro</span>
        </div>`;
    }

    default:
      return "";
  }
}

// Approximate vertical heights (in pt) used by the page-break planner
// in `renderOrderHtml`. They don't have to be exact, just close enough
// that the planner correctly forces a new page when a long block (such
// as a multi-section `terms` paragraph) would otherwise overflow.
//
// signature_area is intentionally UNDER-estimated (220) so it gets
// packed onto page 2 alongside the terms tail instead of being bumped
// to its own near-empty page 3. `page-break-inside: avoid` on the
// signature container guarantees the two stamp boxes still render
// together even when the estimate is optimistic.
const BLOCK_HEIGHTS: Record<string, number> = {
  company_header: 90, order_info: 50, route_summary: 50, stops_table: 180,
  cargo_details: 70, vehicle_info: 70, financial_summary: 110, carrier_info: 60, customer_info: 60,
  // signature_area used to be 220 — but the real rendered height with
  // the 200px stamp box, signature line, "PENTRU BENEFICIAR/TRANSPORTATOR"
  // labels, and date line is ~330 px. The 110 px underestimate made the
  // planner kick the signature to a new page that then sat half-empty
  // (the "Pagina 2 din 3" with only signatures bug). 330 reflects what
  // actually renders so the planner correctly forces a break BEFORE
  // committing to fit a signature that won't.
  notes: 60, terms: 60, signature_area: 330, custom_text: 60, divider: 12, footer: 25,
};

const DEFAULT_TEMPLATE: TemplateData = {
  blocks: [
    { id: "1", type: "company_header", visible: true, props: { showLogo: true, showAddress: true, showVat: true, showPhone: true, showEmail: true, alignment: "left" } },
    { id: "2", type: "order_info", visible: true, props: { showDate: true, showStatus: true, showType: true } },
    { id: "3", type: "route_summary", visible: true, props: { showDistance: true, showDuration: true } },
    { id: "4", type: "stops_table", visible: true, props: { showTimeWindow: true, showReference: true, showAddress: true } },
    { id: "5", type: "cargo_details", visible: true, props: { showWeight: true, showPallets: true, showVolume: true, showGoodsType: true } },
    { id: "5b", type: "vehicle_info", visible: true, props: { showVehicle: true, showTrailer: true, showDriver: true } },
    { id: "6", type: "carrier_info", visible: true, props: { showContact: true, showVat: true } },
    { id: "7", type: "notes", visible: true, props: { title: "Special Instructions" } },
    { id: "8", type: "signature_area", visible: true, props: { leftLabel: "Sender", rightLabel: "Carrier", showDate: true, showStamp: true } },
    { id: "9", type: "footer", visible: true, props: { showContact: true, customText: "" } },
  ],
  pageSettings: { fontSize: 12, primaryColor: "#1d4ed8", marginTop: 30, marginBottom: 30, marginLeft: 30, marginRight: 30, orientation: "portrait" },
};

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ro", label: "Romana" },
  { code: "de", label: "Deutsch" },
  { code: "hu", label: "Magyar" },
];

// Fetch available templates for a given admin
export async function fetchOrderTemplates(adminId: string): Promise<OrderTemplate[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("order_templates")
    .select("id, name, template_type, html_template, is_default")
    .eq("admin_id", adminId)
    .in("template_type", ["carrier_order", "forwarding_order"])
    .order("is_default", { ascending: false });
  return data || [];
}

  // Fetch order data needed for PDF
  export async function fetchOrderData(orderId: string) {
  const supabase = createClient();
  const [orderRes, stopsRes, junctionLegsRes, directLegsRes] = await Promise.all([
  supabase
  .from("orders")
  .select(`
    *,
    customer:customer_id(id, name, address_line1, address_line2, city, country, postal_code, vat_number, tax_id, registration_number, contact_person, email, phone),
    carrier:carrier_id(id, name, address_line1, address_line2, city, country, postal_code, vat_number, tax_id, registration_number, contact_person, email, phone),
    own_vehicle:vehicle_id(plate_number),
    own_trailer:trailer_id(plate_number),
    own_driver:driver_id(name, phone)
  `)
  .eq("id", orderId)
  .maybeSingle(),
  supabase.from("order_stops").select("*").eq("order_id", orderId).order("sequence_order"),
  // FWD orders are linked to their parent trip-leg(s) via TWO
  // different conventions depending on how the FWD was created:
  //   A. Single-leg subcontract — one row in `forwarding_order_legs`
  //      (junction table). Classic case from the leg-assignment
  //      dialog.
  //   B. Consolidation       — N rows in `trip_legs` with
  //      forwarding_order_id pointing at this FWD. Created from
  //      /tms/carriers/consolidation, where multiple parent-order
  //      legs are bundled into one FWD.
  // We hit both in parallel and merge — without this, consolidation
  // FWDs render with no vehicle/trailer/driver block at all because
  // the renderer's `hasAny` gate hides it when every field is null.
  supabase
    .from("forwarding_order_legs")
    .select(`
      trip_leg:trip_leg_id(
        subcontractor_vehicle_plate,
        subcontractor_trailer_plate,
        subcontractor_driver_name,
        subcontractor_driver_phone,
        leg_vehicle:vehicle_id(plate_number),
        leg_trailer:trailer_id(plate_number),
        leg_driver:driver_id(name, phone)
      )
    `)
    .eq("forwarding_order_id", orderId),
  supabase
    .from("trip_legs")
    .select(`
      subcontractor_vehicle_plate,
      subcontractor_trailer_plate,
      subcontractor_driver_name,
      subcontractor_driver_phone,
      leg_vehicle:vehicle_id(plate_number),
      leg_trailer:trailer_id(plate_number),
      leg_driver:driver_id(name, phone),
      leg_number
    `)
    .eq("forwarding_order_id", orderId)
    .order("leg_number", { ascending: true }),
  ]);
  if (!orderRes.data) {
    console.error("[v0] fetchOrderData failed:", orderRes.error);
    return { order: null, stops: [] };
  }

  // Merge vehicle / trailer / driver from any of the three sources, in
  // priority order:
  //   1. The FWD order's own vehicle_id/driver_id/trailer_id columns
  //      (rare — only when the operator explicitly assigns own fleet
  //      directly on the FWD order itself).
  //   2. The linked parent-order trip-leg's own-fleet joins
  //      (also rare — own-fleet legs almost never become FWD orders).
  //   3. The linked trip-leg's subcontractor_* free-text fields
  //      (the typical case — entered when the operator picked
  //      "Subcontract" in the leg-assignment dialog).
  const order: any = orderRes.data;

  // Flatten the junction rows down to their trip_leg payload so we
  // can iterate uniformly with the direct (consolidation) rows. The
  // junction-side `trip_leg` arrives as an object on a 1:1 FK, but
  // Supabase occasionally wraps it in an array — handle both shapes.
  const junctionLegs: any[] = (junctionLegsRes?.data || [])
    .map((row: any) => (Array.isArray(row.trip_leg) ? row.trip_leg[0] : row.trip_leg))
    .filter(Boolean);
  const directLegs: any[] = directLegsRes?.data || [];

  // Merge both sources. Consolidation FWDs typically have many legs
  // with the SAME assigned vehicle/trailer/driver, so a "first
  // non-empty wins" strategy renders the right plate without needing
  // a leg-by-leg breakdown on the PDF.
  const allLegs: any[] = [...junctionLegs, ...directLegs];
  const pickFirst = (read: (l: any) => any) =>
    allLegs.map(read).find((v) => v != null && String(v).trim() !== "") || null;

  order.vehicle_plate =
    order.own_vehicle?.plate_number ||
    pickFirst((l) => l?.leg_vehicle?.plate_number) ||
    pickFirst((l) => l?.subcontractor_vehicle_plate) ||
    null;
  order.trailer_plate =
    order.own_trailer?.plate_number ||
    pickFirst((l) => l?.leg_trailer?.plate_number) ||
    pickFirst((l) => l?.subcontractor_trailer_plate) ||
    null;
  order.driver_name =
    order.own_driver?.name ||
    pickFirst((l) => l?.leg_driver?.name) ||
    pickFirst((l) => l?.subcontractor_driver_name) ||
    null;
  order.driver_phone =
    order.own_driver?.phone ||
    pickFirst((l) => l?.leg_driver?.phone) ||
    pickFirst((l) => l?.subcontractor_driver_phone) ||
    null;

  return { order, stops: stopsRes.data || [] };
  }
  
  export async function fetchCompanyProfile(adminId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("company_profiles").select("*").eq("admin_id", adminId).limit(1);
  if (error) console.error("[v0] fetchCompanyProfile failed:", error);
  return data?.[0] || {};
  }

// Generate the full HTML document from order data + template + language
export function renderOrderHtml(
  orderData: { order: any; stops: any[]; company: any },
  template: TemplateData | null,
  lang: string = "en"
): string {
  const t = template || DEFAULT_TEMPLATE;
  const ps = t.pageSettings;
  const pc = ps.primaryColor;
  const L = LANG_LABELS[lang] || LANG_LABELS.en;
  const visibleBlocks = t.blocks.filter(b => b.visible);

  // Expand `terms` blocks into ONE pseudo-block per numbered clause.
  // The planner then treats each clause as an atomic unit that can be
  // placed on whichever page has room for it, instead of trying to
  // estimate the height of a monolithic 4000-char terms block (which
  // is what was causing pages to half-fill before kicking the rest to
  // a new sheet).
  //
  // Split regex: matches any newline immediately followed by "<digit>.
  // " — this catches clause boundaries whether or not there's a blank
  // line between them (the previous regex required `\n\s*\n` which
  // missed clauses joined by single newlines, dumping the whole tail
  // into one giant block). We use a lookahead so the matched newline
  // is consumed but the "1.", "2." remains at the start of the next
  // piece. Intro text before clause 1 (if any) is preserved as the
  // first piece via the leading `^` anchor of the first split.
  const planBlocks: TemplateBlock[] = [];
  for (const b of visibleBlocks) {
    if (b.type === "terms") {
      const rawText: string = (b.props as any)?.text || "";
      const clauses = rawText
        .split(/\n(?=\d+\.\s)/g)
        .map(s => s.trim())
        .filter(Boolean);
      if (clauses.length <= 1) {
        planBlocks.push(b);
        continue;
      }
      clauses.forEach((clauseText, i) => {
        planBlocks.push({
          ...b,
          id: `${b.id}_c${i}`,
          type: "_terms_section" as any,
          props: {
            ...(b.props as any),
            text: clauseText,
            isFirst: i === 0,
          },
        });
      });
    } else {
      planBlocks.push(b);
    }
  }

  // A4 dimensions in CSS pixels at 96dpi — this MUST match the CSS the
  // print engine uses (`min-height: 297mm` ≈ 1123px), not the 595×842
  // PostScript-point equivalents. Using points-as-pixels here caused
  // page 1 to "end" at the 842px mark and leave the bottom ~280px of
  // the A4 sheet blank in the printed PDF.
  //
  //   210mm × (96px / 25.4mm) ≈ 794 px
  //   297mm × (96px / 25.4mm) ≈ 1123 px
  const pageW = ps.orientation === "portrait" ? 794 : 1123;
  const pageH = ps.orientation === "portrait" ? 1123 : 794;
  // CRITICAL — contentH must match the PRINT-time printable area, not the
  // on-screen one. The print stylesheet (see PRINT_OVERRIDE_CSS) forces
  // every .page to A4 (297mm) with 12mm padding on each side. At 96 dpi
  // that's:
  //   297mm × 96/25.4 ≈ 1123 px   (full sheet)
  //   12mm × 96/25.4 × 2 ≈ 91 px  (top + bottom padding)
  //   page-number footer band: ~20 px reserved at the bottom
  //   → usable content height ≈ 1123 - 91 - 20 ≈ 1012 px
  //
  // Previously this used `ps.marginTop + ps.marginBottom` (60 px on the
  // 30/30 default), which gave the planner ~1043 px of budget. The print
  // CSS then enforced a TIGHTER 1012 px, and combined with the 12 percent
  // overflow slack the planner would accept up to ~1168 px per page — so
  // the last 150 px got hard-clipped by `overflow: hidden`, which is what
  // was eating points 5-6 of CONDIȚII GENERALE in the printed output.
  const PRINT_PADDING_PX = 91;
  const FOOTER_RESERVED_PX = 20;
  const contentH = pageH - PRINT_PADDING_PX - FOOTER_RESERVED_PX;
  const pages: TemplateBlock[][] = [[]];
  let currentH = 0;

  for (const block of planBlocks) {
    let h = BLOCK_HEIGHTS[block.type] || 40;
    if (block.type === "stops_table") h = 40 + orderData.stops.length * 22;
    // Long `terms` paragraphs (the Romanian "CONDIȚII GENERALE" can be
    // 4000+ chars across 9 sections) need an estimated height proportional
    // to the text length so the planner forces a page break ahead of the
    // signature area instead of clipping a section. ~110 chars ≈ 1 line at
    // 8px font and ps.fontSize-1 line-height.
    // Heuristics calibrated for the 11px body font we render the terms
    // at: ~80 chars per line at the A4 portrait content width, ~16px
    // line-height (1.6 × 11), so each line takes ~16px of vertical room.
    if (block.type === "terms") {
      const txt: string = (block.props as any)?.text || "";
      const lines = Math.ceil(txt.length / 80) + (txt.match(/\n/g)?.length || 0);
      h = Math.max(80, 50 + lines * 16);
    }
    // Each split `_terms_section` is estimated individually so the
    // planner can pack as many sections as will fit at the bottom of
    // page 1, then continue the rest on page 2 — no more dead space.
    if ((block.type as any) === "_terms_section") {
      const txt: string = (block.props as any)?.text || "";
      // Calibrated against real renderings of single-clause blocks at
      // 11px font / 1.6 line-height inside a 670 px content column:
      //   • ~100 chars wrap to one visual line (was 72 — too conservative;
      //     a typical short clause like "8. Pentru întârzieri ... 300
      //     EUR/zi." is 110 chars and DOES render on a single line, but
      //     the old math counted it as 2 lines).
      //   • each rendered line takes ~17.6 px vertical room.
      //   • explicit newlines in the source add a hard line break.
      //   • 6 px paragraph gap between consecutive clauses (was 8).
      //   • 24 px title only on the first clause (which carries the
      //     "CONDIȚII GENERALE" heading).
      const explicitBreaks = txt.match(/\n/g)?.length || 0;
      const lines = Math.ceil(txt.length / 100) + explicitBreaks;
      const titleH = (block.props as any).isFirst ? 24 : 0;
      const CLAUSE_GAP_PX = 6;
      h = Math.max(24, titleH + lines * 17.6 + CLAUSE_GAP_PX);
    }
    // Multi-line free-text (custom_text) follows the same heuristic, but
    // we ALSO need to peek into the order to know whether the renderer
    // will actually output anything. The Observații block uses the
    // {{carrier_payment_notes}} placeholder; when the order has no notes
    // the renderer returns "" and the block collapses to zero. If we
    // didn't account for that here, the planner would reserve ~40pt of
    // ghost space and push real content onto a near-empty page 2.
    if (block.type === "custom_text") {
      const rawTxt: string = (block.props as any)?.text || "";
      const orderNotes: string = String(((orderData.order as any)?.carrier_payment_notes) ?? "").trim();
      const usesNotesPlaceholder = /\{\{\s*carrier_payment_notes\s*\}\}/.test(rawTxt);
      // Resolve the effective text the renderer will actually print:
      //   • placeholder + no notes  → empty → height 0
      //   • placeholder + has notes → use the notes for length estimate
      //   • plain literal           → use as-is
      const effective = usesNotesPlaceholder
        ? orderNotes
        : rawTxt.trim();
      if (!effective) {
        h = 0;
      } else {
        // Same calibration as terms — 80 chars/line at 12px body font,
        // ~18px line-height; bumped from prior 110×12 (10px font) to
        // match the bigger custom_text rendering.
        const lines = Math.ceil(effective.length / 80) + (effective.match(/\n/g)?.length || 0);
        h = Math.max(36, 26 + lines * 18);
      }
    }
    // ZERO overflow slack. The print CSS hard-locks .page to 297mm with
    // overflow:hidden, so any content the planner accepts beyond
    // contentH (1012 px) is silently clipped. We MUST force a page
    // break the instant currentH + h would exceed contentH. Previously
    // an 8 percent slack allowed up to 1093 px per page; the extra ~80
    // px got clipped on print which is exactly what was eating the
    // last clause of CONDIȚII GENERALE.
    if (currentH + h > contentH && pages[pages.length - 1].length > 0) {
      pages.push([]);
      // Pages 2+ get a repeated antet injected at the top during render
      // (see `repeatHeaderHtml` below). Seed currentH with the header's
      // estimated height so the planner doesn't try to cram a full A4's
      // worth of content into a page that's already missing ~90px to
      // the header band. Without this seed, the last block on page 2+
      // can overflow under the footer.
      currentH = BLOCK_HEIGHTS["company_header"] || 90;
    }
    pages[pages.length - 1].push(block);
    currentH += h;
  }

  // Render the company_header (antet) block ONCE so we can inject it
  // at the top of every subsequent page. The header block is what
  // contains the VIMAREK LOGISTIC SRL band, the COMANDĂ DE TRANSPORT
  // label, and the reference number — repeating it gives multi-page
  // orders proper "letterhead" continuity instead of leaving pages 2+
  // unbranded. We use the same renderBlock() the page-1 path uses, so
  // the markup is byte-identical to the first-page header (same
  // gradient, same metrics, same logo).
  const headerBlock = visibleBlocks.find(b => b.type === "company_header");
  const repeatHeaderHtml = headerBlock
    ? renderBlock(headerBlock, orderData, pc, ps.fontSize, lang)
    : "";

  const pagesHtml = pages.map((pageBlocks, pageIdx) => {
    const blocksHtml = pageBlocks.map(b => renderBlock(b, orderData, pc, ps.fontSize, lang)).join("");
    // Determine whether THIS page already starts with the header block.
    // Page 1 normally does (the template places company_header first);
    // pages 2+ don't — so we prepend a fresh copy of the antet there.
    // This makes every printed/saved page open with the company band,
    // matching how invoices and CMRs typically look.
    const firstBlock = pageBlocks[0];
    const alreadyHasHeader = firstBlock?.type === "company_header";
    const injectHeader = !alreadyHasHeader && repeatHeaderHtml ? repeatHeaderHtml : "";
    return `
      <div class="page" style="width:${pageW}px;min-height:${pageH}px;padding:${ps.marginTop}px ${ps.marginRight}px ${ps.marginBottom}px ${ps.marginLeft}px;box-sizing:border-box;position:relative;background:white;page-break-after:always;">
        ${injectHeader}
        ${blocksHtml}
        <div style="position:absolute;bottom:${ps.marginBottom - 14}px;left:${ps.marginLeft}px;right:${ps.marginRight}px;text-align:center;font-size:9px;color:#9ca3af;font-weight:500;">
          ${L.page} ${pageIdx + 1} ${L.of} ${pages.length}
        </div>
      </div>`;
  }).join("");

  // Build the document title in the form "VLR-1495 - ADRISER SPEDITION
  // SRL". Browsers use document.title as the suggested filename in the
  // "Save as PDF" dialog, so this is what determines the downloaded
  // PDF's filename. We sanitize the carrier name to strip Windows-
  // forbidden filename characters (\\ / : * ? " < > |) so it doesn't
  // get mangled when the user saves the file.
  const docCarrierName = (orderData.order.carrier?.name || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const docTitle = docCarrierName
    ? `${orderData.order.reference_number} - ${docCarrierName}`
    : `${orderData.order.reference_number} - Forwarding Order`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${docTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: ${ps.fontSize}px; color: #111827; background: #f3f4f6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { margin: 20px auto; box-shadow: 0 1px 3px rgba(0,0,0,0.12); overflow: hidden; }
    @media print {
      html, body { width: auto; height: auto; background: white !important; margin: 0 !important; padding: 0 !important; }
      /* In print, the .page div is sized by its CONTENT — not a fixed
         297mm min-height — because Chrome's "Default" Margins setting
         applies a ~10mm browser-margin on top of @page { margin: 0 },
         shrinking the actual printable area to ~277mm. A 297mm-tall .page
         would overflow by ~20mm and spawn a third blank physical page.
         page-break-after: always still guarantees each .page div lands on
         its own physical sheet — which is the whole point of the planner.
         page-break-inside: avoid keeps long single blocks (signature
         pair, terms section) from splitting mid-block across two sheets. */
      .page {
        width: ${ps.orientation === "portrait" ? "210mm" : "297mm"} !important;
        min-height: 0 !important;
        max-width: 100% !important;
        box-shadow: none !important;
        margin: 0 !important;
        padding: ${ps.marginTop}px ${ps.marginRight}px ${ps.marginBottom}px ${ps.marginLeft}px !important;
        page-break-after: always;
        page-break-inside: avoid;
        break-inside: avoid;
        overflow: hidden;
      }
      .page:last-child { page-break-after: auto; }
      .no-print { display: none !important; }
      /* In print mode the toolbar is hidden, so kill the 50px wrapper
         offset that exists only to clear the toolbar in screen view —
         otherwise it pushes the first page down and can spawn a tiny
         overflow onto a blank trailing page. */
      .pdf-pages-wrapper { padding-top: 0 !important; margin: 0 !important; }
    }
    @page {
      size: ${ps.orientation === "portrait" ? "A4 portrait" : "A4 landscape"};
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="no-print" style="position:fixed;top:0;left:0;right:0;z-index:50;background:#111827;padding:8px 20px;display:flex;align-items:center;justify-content:space-between;">
    <span style="color:white;font-size:13px;font-weight:600;">${orderData.order.reference_number} - Forwarding Order</span>
    <div style="display:flex;gap:8px;">
      <button onclick="window.print()" style="background:#2563eb;color:white;border:none;padding:6px 16px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Print / Save as PDF</button>
      <button onclick="window.close()" style="background:#374151;color:white;border:none;padding:6px 16px;border-radius:6px;font-size:12px;cursor:pointer;">Close</button>
    </div>
  </div>
  <div class="pdf-pages-wrapper" style="padding-top:50px;">
    ${pagesHtml}
  </div>
</body>
</html>`;
}

// Parse a stored template JSON, gracefully merging in DEFAULT_TEMPLATE
// for any missing fields. This makes the renderer tolerant of templates
// that were saved with only `{ "blocks": [...] }` (no `pageSettings`),
// which is exactly what some legacy / migrated rows look like — without
// this guard the renderer crashes with "Cannot read properties of
// undefined (reading 'primaryColor')" when it dereferences pageSettings.
export function parseTemplate(raw: any): TemplateData {
  if (!raw) return DEFAULT_TEMPLATE;
  let parsed: any;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return DEFAULT_TEMPLATE;
  }
  if (!parsed || typeof parsed !== "object") return DEFAULT_TEMPLATE;
  return {
    blocks: Array.isArray(parsed.blocks) ? parsed.blocks : DEFAULT_TEMPLATE.blocks,
    pageSettings: { ...DEFAULT_TEMPLATE.pageSettings, ...(parsed.pageSettings || {}) },
  };
}

// Print-time CSS injected into the opened tab. The rendered HTML uses
// `.page { min-height: 842px }` so each page fills a full A4 sheet
// when viewed on screen; but at print time we need to OVERRIDE that
// because some printer drivers interpret 842px (≈ 222mm at 96 dpi) as
// taller than A4's actual printable area (297mm minus margins). That
// mismatch was producing the visible "empty whitespace at the bottom
// of page 1 before page 2 starts" — the .page box was forced to its
// 842px min-height, then `page-break-after: always` pushed page 2 to
// a new sheet, but the trailing whitespace inside .page got carried
// over too.
//
// The fix:
//   • @page { size: A4; margin: 0 } — printer uses real A4 dimensions,
//     no driver-default margins stealing space.
//   • .page { min-height: 0; height: auto; padding: 12mm } — let the
//     content take its natural height, and use a clean 12mm internal
//     margin instead of whatever the on-screen rule was.
//   • page-break-after: always on every .page except the last — keeps
//     pagination intact without producing a phantom blank sheet at the
//     end (which was the original "preview shows 2 but Save-as-PDF
//     gives 3" bug).
// CSS injected into the opened print tab. The previous version scoped
// these rules under `@media print`, which meant the on-screen tab kept
// the original `.page { min-height: 842px }` layout — so every page
// showed empty whitespace below its content (the gap the operator was
// complaining about). The print tab exists solely to be printed; there
// is no good reason to maintain a different on-screen layout there.
// So the rules now apply UNCONDITIONALLY — the .page divs collapse to
// their natural content height both on screen AND in the rasterized
// PDF, and pagination is handled by `page-break-after: always`.
//
// @page declares the physical sheet size with zero browser margin so
// the .page's own 12mm padding becomes the only margin. Without this
// most drivers steal another ~10mm for their "default" margin and the
// document ends up too small.
// Exported so the email PDF path (renderPreviewToPdfBase64 in
// send-to-carrier-dialog.tsx) can inject the same rules into the live
// preview iframe before capturing each .page. Without this the
// emailed attachment was rendered against the on-screen layout
// (.page min-height:842px, content floating with extra whitespace),
// while the operator's downloaded copy used these A4-locked rules —
// producing two visibly different documents from the same source.
export const PRINT_OVERRIDE_CSS = `
@page { size: A4 portrait; margin: 0; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  background: #ffffff !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
/* Each .page div is HARD-LOCKED to A4 dimensions (210x297mm). This is
   non-negotiable for the print path because:
     • If .page can grow past 297mm, the browser splits the OVERFLOW
       onto a second physical sheet (the whitespace-gap bug).
     • page-break-after:always then forces logical page 2 onto a THIRD
       physical sheet, turning a 2-page document into 3 sheets with a
       near-empty middle one.
   The trade-off is that any content the planner accepts beyond the
   contentH budget (1012 px) gets clipped by overflow:hidden. To prevent
   that the planner uses ZERO slack and forces a page break the moment
   currentH + nextBlock would exceed contentH. */
.page {
  width: 210mm !important;
  height: 297mm !important;
  min-height: 297mm !important;
  max-height: 297mm !important;
  margin: 0 auto !important;
  padding: 12mm !important;
  box-sizing: border-box !important;
  box-shadow: none !important;
  border: 0 !important;
  background: #ffffff !important;
  page-break-after: always !important;
  break-after: page !important;
  page-break-inside: avoid !important;
  break-inside: avoid !important;
  overflow: hidden !important;
}
/* Last page uses auto to avoid a phantom trailing blank sheet
   (browsers can interpret page-break-after:always on the final element
   as "start a new sheet even though nothing follows"). */
.page:last-child {
  page-break-after: auto !important;
  break-after: auto !important;
}
`;

// Open a new browser tab containing the rendered HTML, ready for the
// user to print or "Save as PDF". We force `document.title` AFTER the
// markup is written so it overrides any cached value the browser may
// have shown briefly while the new tab loaded — Chrome's Save-as-PDF
// dialog reads from document.title at the moment the user clicks Save,
// so this is what controls the suggested filename like
// "VLR-1495 - ADRISER SPEDITION SRL.pdf".
//
// We also append a <style> tag with PRINT_OVERRIDE_CSS so that when the
// user hits Print / Ctrl+P, each `.page` collapses to its natural
// height and prints onto exactly one A4 sheet — no trailing whitespace,
// no phantom blank page, content matches the on-screen preview.
export function openPrintWindow(html: string, title?: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  if (title) {
    try {
      w.document.title = title;
    } catch { /* cross-origin or detached — fall back to <title> tag */ }
  }
  // Inject print-only overrides. We append after the document is closed
  // so the existing <style> tags in `html` are already parsed and our
  // !important rules take precedence at print time.
  try {
    const styleTag = w.document.createElement("style");
    styleTag.setAttribute("data-bng-print", "true");
    styleTag.textContent = PRINT_OVERRIDE_CSS;
    w.document.head.appendChild(styleTag);
  } catch { /* if appending fails the print will still work, just with the on-screen CSS */ }
}

// Quick one-shot: fetch + render + open (legacy)
export async function generateForwardingOrderPdf(orderId: string, adminId: string) {
  const [orderData, company, templates] = await Promise.all([
    fetchOrderData(orderId),
    fetchCompanyProfile(adminId),
    fetchOrderTemplates(adminId),
  ]);
  if (!orderData.order) throw new Error("Order not found");
  const defaultTmpl = templates.find(t => t.is_default);
  const template = defaultTmpl ? parseTemplate(defaultTmpl.html_template) : null;
  const html = renderOrderHtml({ ...orderData, company }, template, "en");
  // Mirror the same naming convention used in send-to-carrier-dialog so
  // the saved PDF is "VLR-1495 - CARRIER NAME.pdf" regardless of how
  // the print is triggered.
  const carrierName = (orderData.order.carrier?.name || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const title = carrierName
    ? `${orderData.order.reference_number} - ${carrierName}`
    : orderData.order.reference_number;
  openPrintWindow(html, title);
}
