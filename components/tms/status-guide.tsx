"use client";

/**
 * StatusGuide — info popover that explains the v3 unified status spec.
 *
 * The TMS uses three coordinated status scopes:
 *   1. Parent (Transport Order) — the order the customer signed up for.
 *      This is what the Customer / Sales team cares about.
 *   2. Internal execution — own-fleet driver/trip lifecycle (lives on
 *      trip_legs.status, but visible to the user as a derived sub-status
 *      next to the parent).
 *   3. Forwarder execution — subcontracted carrier lifecycle (lives on the
 *      forwarder *child* order: orders.status with the fwd_ prefix).
 *
 * The parent status is **derived** by a Postgres trigger from the lowest
 * active child / leg status — see `fn_recompute_parent_status`. Manual
 * states (Ready for Invoicing, Documents and Invoice Sent, Completed,
 * Cancelled, On Hold) are never overwritten.
 *
 * This component renders a 16-row reference table modelled after the
 * spec sheet shared by ops, with translations for EN / RO / DE / HU.
 * Status codes themselves stay in English (they're the contract between
 * UI and DB) — only the *explanation* text is localized.
 */

import { Fragment, useState } from "react";
import { Info, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// i18n
// ─────────────────────────────────────────────────────────────────────

type Lang = "en" | "ro" | "de" | "hu";

const LANG_LABELS: Record<Lang, string> = {
  en: "EN",
  ro: "RO",
  de: "DE",
  hu: "HU",
};

const EXPORT_LABELS: Record<Lang, string> = {
  en: "Export PDF",
  ro: "Exportă PDF",
  de: "PDF exportieren",
  hu: "PDF exportálás",
};

const HEADER_I18N: Record<Lang, { title: string; intro: string; legend: string; cols: { hash: string; parent: string; internal: string; forwarder: string; explain: string }; roles: { parent: string; internal: string; forwarder: string } }> = {
  en: {
    title: "Status Reference Guide",
    intro: "How parent, internal-execution and forwarder-execution statuses align across the order lifecycle. Status codes are shown in English (the system uses these as canonical keys); only the explanations are localized.",
    legend: "Legend",
    cols: { hash: "#", parent: "Transport Order (Parent)", internal: "Execution — Internal", forwarder: "Execution — Forwarder", explain: "What it means" },
    roles: { parent: "Parent", internal: "Internal", forwarder: "Forwarder" },
  },
  ro: {
    title: "Ghid de referință pentru statusuri",
    intro: "Cum se aliniază statusurile părinte, execuție internă și execuție forwarder pe parcursul ciclului de viață al comenzii. Codurile statusurilor sunt afișate în engleză (sistemul le folosește ca chei canonice); doar explicațiile sunt traduse.",
    legend: "Legendă",
    cols: { hash: "#", parent: "Comandă transport (părinte)", internal: "Execuție — Intern", forwarder: "Execuție — Forwarder", explain: "Ce înseamnă" },
    roles: { parent: "Părinte", internal: "Intern", forwarder: "Forwarder" },
  },
  de: {
    title: "Status-Referenzleitfaden",
    intro: "Wie sich Eltern-, interne Ausführungs- und Forwarder-Ausführungsstatus über den Auftragslebenszyklus hinweg ausrichten. Statuscodes werden auf Englisch angezeigt (das System verwendet sie als kanonische Schlüssel); nur die Erklärungen sind lokalisiert.",
    legend: "Legende",
    cols: { hash: "#", parent: "Transportauftrag (Eltern)", internal: "Ausführung — Intern", forwarder: "Ausführung — Forwarder", explain: "Bedeutung" },
    roles: { parent: "Eltern", internal: "Intern", forwarder: "Forwarder" },
  },
  hu: {
    title: "Státusz referencia útmutató",
    intro: "Hogyan illeszkednek a szülő-, belső végrehajtási és forwarder-végrehajtási státuszok a megrendelés életciklusa során. A státuszkódok angolul jelennek meg (a rendszer ezeket használja kanonikus kulcsként); csak a magyarázatok vannak lokalizálva.",
    legend: "Jelmagyarázat",
    cols: { hash: "#", parent: "Szállítási megrendelés (Szülő)", internal: "Végrehajtás — Belső", forwarder: "Végrehajtás — Forwarder", explain: "Mit jelent" },
    roles: { parent: "Szülő", internal: "Belső", forwarder: "Forwarder" },
  },
};

// One row of the spec sheet. `parent` / `internal` / `fwd` are the
// English labels (kept stable across all locales), `explain` is the
// per-language description.
// A row either provides a single spanning explanation (`explain`) OR a
// per-column breakdown (`explainCols`) where the internal vs. forwarder
// side genuinely differ. When `explainCols` is present, each cell shows
// only the part that's relevant to its column.
interface ExplainCols {
  internal?: string;
  forwarder?: string;
}
interface Row {
  n: number | "X" | "||";
  parent: string;
  internal: string | "—";
  fwd: string | "—";
  band: "header" | "draft" | "confirmed" | "execution" | "documents" | "invoicing" | "completed" | "cancelled" | "hold";
  explain: Record<Lang, string>;
  explainCols?: Record<Lang, ExplainCols>;
}

const ROWS: Row[] = [
  {
    n: 1, parent: "Draft", internal: "—", fwd: "—", band: "draft",
    explain: {
      en: "The order has just been created (manually, by AI extraction or by upload). Nothing has been sent to the customer yet.",
      ro: "Comanda tocmai a fost creată (manual, prin extragere AI sau upload). Nimic nu a fost încă trimis clientului.",
      de: "Der Auftrag wurde gerade erstellt (manuell, per KI-Extraktion oder Upload). Es wurde noch nichts an den Kunden gesendet.",
      hu: "A megrendelés most jött létre (kézzel, AI kinyeréssel vagy feltöltéssel). Még semmi sem lett elküldve az ügyfélnek.",
    },
  },
  {
    n: 2, parent: "Customer Confirmation Required", internal: "—", fwd: "—", band: "draft",
    explain: {
      en: "Waiting for the customer to confirm the offer. The order cannot move into execution until this step is cleared.",
      ro: "Se așteaptă confirmarea clientului pentru ofertă. Comanda nu poate intra în execuție până când acest pas nu este finalizat.",
      de: "Wartet auf die Bestätigung des Auftrags durch den Kunden. Der Auftrag kann erst in die Ausführung übergehen, wenn dieser Schritt abgeschlossen ist.",
      hu: "Az ügyfél visszaigazolására várunk. A megrendelés nem mehet át végrehajtásba, amíg ez a lépés nem zárul le.",
    },
  },
  {
    n: 3, parent: "Confirmed to Customer", internal: "—", fwd: "—", band: "confirmed",
    explain: {
      en: "The customer has confirmed and the order is locked in. We can now plan the execution side (own fleet or subcontract).",
      ro: "Clientul a confirmat, iar comanda este blocată. Putem planifica acum partea de execuție (flotă proprie sau subcontract).",
      de: "Der Kunde hat bestätigt und der Auftrag ist verbindlich. Wir können nun die Ausführungsseite planen (eigene Flotte oder Subunternehmer).",
      hu: "Az ügyfél visszaigazolta, a megrendelés rögzítésre került. Most megtervezhetjük a végrehajtási oldalt (saját flotta vagy alvállalkozó).",
    },
  },
  {
    n: 4, parent: "In Execution", internal: "Unassigned", fwd: "Carrier Unassigned", band: "execution",
    explain: {
      en: "Execution has started but no resource is yet attached: no driver/vehicle on internal legs and no carrier on forwarding legs.",
      ro: "Execuția a început, dar nicio resursă nu este încă atașată: niciun șofer/vehicul pe legurile interne și niciun transportator pe legurile de forwarding.",
      de: "Die Ausführung hat begonnen, aber es ist noch keine Ressource zugeordnet: Kein Fahrer/Fahrzeug für interne Etappen und kein Frachtführer für Forwarding-Etappen.",
      hu: "A végrehajtás megkezdődött, de még semmilyen erőforrás nincs hozzárendelve: nincs sofőr/jármű a belső lábakon és nincs fuvarozó a forwarder lábakon.",
    },
  },
  {
    n: 5, parent: "In Execution", internal: "Assigned", fwd: "Assigned to Carrier", band: "execution",
    explain: {
      en: "A driver/vehicle has been picked for the internal leg, or the carrier has been chosen for the subcontract — but no formal confirmation has been sent yet.",
      ro: "A fost ales un șofer/vehicul pentru legul intern, sau a fost ales transportatorul pentru subcontract — dar nu a fost încă trimisă nicio confirmare oficială.",
      de: "Ein Fahrer/Fahrzeug wurde für die interne Etappe gewählt, bzw. der Frachtführer wurde für den Subunternehmer gewählt — es wurde aber noch keine formelle Bestätigung versendet.",
      hu: "Sofőr/jármű lett kijelölve a belső lábhoz, vagy a fuvarozó lett kiválasztva az alvállalkozói részhez — de hivatalos visszaigazolás még nem ment ki.",
    },
  },
  {
    n: 6, parent: "In Execution", internal: "Planned", fwd: "Carrier Confirmation Required", band: "execution",
    explain: {
      en: "Internal: dispatcher has slotted the trip into the schedule. Forwarder: confirmation request has been sent to the carrier and we're waiting for their reply.",
      ro: "Intern: dispecerul a programat cursa. Forwarder: cererea de confirmare a fost trimisă transportatorului și se așteaptă răspunsul.",
      de: "Intern: Disponent hat die Fahrt eingeplant. Forwarder: Bestätigungsanfrage wurde an den Frachtführer gesendet und wir warten auf Antwort.",
      hu: "Belső: a diszpécser beosztotta a fuvart. Forwarder: a visszaigazolási kérés elment a fuvarozónak, válaszra várunk.",
    },
    explainCols: {
      en: { internal: "Dispatcher has slotted the trip into the schedule.", forwarder: "Confirmation request has been sent to the carrier and we're waiting for their reply." },
      ro: { internal: "Dispecerul a programat cursa.", forwarder: "Cererea de confirmare a fost trimisă transportatorului și se așteaptă răspunsul." },
      de: { internal: "Disponent hat die Fahrt eingeplant.", forwarder: "Bestätigungsanfrage wurde an den Frachtführer gesendet und wir warten auf Antwort." },
      hu: { internal: "A diszpécser beosztotta a fuvart.", forwarder: "A visszaigazolási kérés elment a fuvarozónak, válaszra várunk." },
    },
  },
  {
    n: 7, parent: "In Execution", internal: "Dispatched to Driver", fwd: "Carrier Confirmed", band: "execution",
    explain: {
      en: "Internal: trip handed off to the driver (instructions sent). Forwarder: carrier has confirmed back — pickup is locked in.",
      ro: "Intern: cursa a fost transmisă șoferului (instrucțiuni trimise). Forwarder: transportatorul a confirmat — încărcarea este rezervată.",
      de: "Intern: Fahrt wurde an den Fahrer übergeben (Anweisungen gesendet). Forwarder: Frachtführer hat zurückbestätigt — Abholung ist fix.",
      hu: "Belső: a fuvar átadva a sofőrnek (utasítások elküldve). Forwarder: a fuvarozó visszaigazolt — a felvétel rögzítve.",
    },
    explainCols: {
      en: { internal: "Trip handed off to the driver (instructions sent).", forwarder: "Carrier has confirmed back — pickup is locked in." },
      ro: { internal: "Cursa a fost transmisă șoferului (instrucțiuni trimise).", forwarder: "Transportatorul a confirmat — încărcarea este rezervată." },
      de: { internal: "Fahrt wurde an den Fahrer übergeben (Anweisungen gesendet).", forwarder: "Frachtführer hat zurückbestätigt — Abholung ist fix." },
      hu: { internal: "A fuvar átadva a sofőrnek (utasítások elküldve).", forwarder: "A fuvarozó visszaigazolt — a felvétel rögzítve." },
    },
  },
  {
    n: 8, parent: "In Execution", internal: "Accepted by Driver", fwd: "—", band: "execution",
    explain: {
      en: "Internal only: the driver has acknowledged the dispatch on the driver app. Forwarder side has no equivalent — the carrier confirmation already covers acceptance.",
      ro: "Doar intern: șoferul a confirmat dispatch-ul în aplicație. Pe partea de forwarder nu există echivalent — confirmarea transportatorului acoperă deja acceptul.",
      de: "Nur intern: Der Fahrer hat den Dispatch in der Fahrer-App bestätigt. Forwarder-Seite hat kein Äquivalent — die Frachtführer-Bestätigung deckt bereits die Annahme ab.",
      hu: "Csak belső: a sofőr a sofőr-alkalmazásban visszaigazolta a feladatot. A forwarder oldalon ennek nincs megfelelője — a fuvarozó visszaigazolása már lefedi az elfogadást.",
    },
    explainCols: {
      en: { internal: "Driver has acknowledged the dispatch on the driver app.", forwarder: "No equivalent — the carrier confirmation already covers acceptance." },
      ro: { internal: "Șoferul a confirmat dispatch-ul în aplicație.", forwarder: "Fără echivalent — confirmarea transportatorului acoperă deja acceptul." },
      de: { internal: "Der Fahrer hat den Dispatch in der Fahrer-App bestätigt.", forwarder: "Kein Äquivalent — die Frachtführer-Bestätigung deckt bereits die Annahme ab." },
      hu: { internal: "A sofőr a sofőr-alkalmazásban visszaigazolta a feladatot.", forwarder: "Nincs megfelelője — a fuvarozó visszaigazolása már lefedi az elfogadást." },
    },
  },
  {
    n: 9, parent: "In Execution", internal: "Waiting to Start", fwd: "Waiting to Start", band: "execution",
    explain: {
      en: "Resource is locked but the loading window has not yet opened. Common state for orders that confirm days before pickup.",
      ro: "Resursa este rezervată, dar fereastra de încărcare nu s-a deschis încă. Stare obișnuită pentru comenzile confirmate cu zile înainte de încărcare.",
      de: "Ressource ist fixiert, aber das Ladefenster ist noch nicht offen. Üblicher Zustand für Aufträge, die Tage vor der Abholung bestätigt werden.",
      hu: "Az erőforrás rögzítve, de a felvételi időablak még nem nyílt meg. Gyakori állapot olyan megrendeléseknél, amelyeket napokkal a felvétel előtt erősítenek meg.",
    },
  },
  {
    n: 10, parent: "In Execution", internal: "In Progress", fwd: "In Progress", band: "execution",
    explain: {
      en: "Truck is rolling — driver is on the road (internal) or carrier reports active transit (forwarder). Live tracking applies here.",
      ro: "Camionul este în mișcare — șoferul este pe drum (intern) sau transportatorul raportează tranzit activ (forwarder). Aici se aplică tracking-ul live.",
      de: "Lkw rollt — Fahrer ist unterwegs (intern) oder Frachtführer meldet aktiven Transit (forwarder). Live-Tracking gilt hier.",
      hu: "A kamion gurul — a sofőr úton van (belső) vagy a fuvarozó aktív tranzitot jelez (forwarder). Itt érvényes az élő nyomkövetés.",
    },
    explainCols: {
      en: { internal: "Driver is on the road. Live tracking applies.", forwarder: "Carrier reports active transit. Live tracking applies." },
      ro: { internal: "Șoferul este pe drum. Tracking live activ.", forwarder: "Transportatorul raportează tranzit activ. Tracking live activ." },
      de: { internal: "Fahrer ist unterwegs. Live-Tracking aktiv.", forwarder: "Frachtführer meldet aktiven Transit. Live-Tracking aktiv." },
      hu: { internal: "A sofőr úton van. Élő nyomkövetés aktív.", forwarder: "A fuvarozó aktív tranzitot jelez. Élő nyomkövetés aktív." },
    },
  },
  {
    n: 11, parent: "In Execution", internal: "Delivered", fwd: "Delivered", band: "execution",
    explain: {
      en: "All stops are completed. Cargo has been handed over at the final unload — but the proof of delivery hasn't reached us yet.",
      ro: "Toate opririle sunt finalizate. Marfa a fost predată la ultima descărcare — dar dovada livrării nu a ajuns încă la noi.",
      de: "Alle Stopps sind abgeschlossen. Die Ware wurde am letzten Entladestopp übergeben — aber der Liefernachweis ist noch nicht bei uns eingegangen.",
      hu: "Az összes megálló teljesítve. Az áru átadásra került az utolsó lerakón — de a leszállítási igazolás még nem érkezett meg hozzánk.",
    },
  },
  {
    n: 12, parent: "In Execution", internal: "Documents Pending", fwd: "Documents Pending", band: "execution",
    explain: {
      en: "We are actively chasing the CMR / POD. Internal: driver still needs to upload. Forwarder: carrier email reminder has gone out.",
      ro: "Urmărim activ CMR/POD. Intern: șoferul mai trebuie să încarce documentele. Forwarder: a fost trimis email de reamintire transportatorului.",
      de: "Wir verfolgen aktiv das CMR/POD nach. Intern: Fahrer muss noch hochladen. Forwarder: Erinnerungs-E-Mail an Frachtführer ist raus.",
      hu: "Aktívan utánajárunk a CMR/POD-nak. Belső: a sofőrnek még fel kell töltenie. Forwarder: emlékeztető e-mail kiment a fuvarozónak.",
    },
    explainCols: {
      en: { internal: "Driver still needs to upload the CMR / POD.", forwarder: "Carrier email reminder has gone out for the CMR / POD." },
      ro: { internal: "Șoferul mai trebuie să încarce CMR/POD.", forwarder: "A fost trimis email de reamintire transportatorului pentru CMR/POD." },
      de: { internal: "Fahrer muss CMR/POD noch hochladen.", forwarder: "Erinnerungs-E-Mail an Frachtführer für CMR/POD ist raus." },
      hu: { internal: "A sofőrnek még fel kell töltenie a CMR/POD-ot.", forwarder: "Emlékeztető e-mail kiment a fuvarozónak a CMR/POD miatt." },
    },
  },
  {
    n: 13, parent: "Documents Received (auto)", internal: "Documents Received", fwd: "Documents Received", band: "documents",
    explain: {
      en: "POD/CMR has been received and validated. The parent flips automatically — no manual action needed. Triggered by file upload + admin validation.",
      ro: "POD/CMR a fost primit și validat. Părintele se schimbă automat — nu este necesară nicio acțiune manuală. Declanșat de încărcarea fișierului + validare admin.",
      de: "POD/CMR wurde empfangen und validiert. Das Eltern-Element wechselt automatisch — keine manuelle Aktion erforderlich. Ausgelöst durch Datei-Upload + Admin-Validierung.",
      hu: "A POD/CMR megérkezett és validálva lett. A szülő automatikusan átáll — nem szükséges kézi beavatkozás. Fájlfeltöltés + admin validáció váltja ki.",
    },
  },
  {
    n: 14, parent: "Ready for Invoicing (manual — POD validated)", internal: "Completed", fwd: "Carrier Invoice Pending", band: "invoicing",
    explain: {
      en: "Manual flip — accountant reviews POD first before the parent moves to invoicing.",
      ro: "Trecere manuală — contabilul verifică POD-ul mai întâi înainte ca părintele să treacă la facturare.",
      de: "Manueller Wechsel — Buchhaltung prüft zuerst den POD, bevor das Eltern-Element zur Rechnungsstellung übergeht.",
      hu: "Kézi átállítás — a könyvelő először ellenőrzi a POD-ot, mielőtt a szülő számlázásra váltana.",
    },
    explainCols: {
      en: { internal: "Trip is done, ready to invoice the customer.", forwarder: "We still owe the carrier their invoice or are waiting for it." },
      ro: { internal: "Cursa e gata, putem factura clientul.", forwarder: "Încă datorăm transportatorului factura sau o așteptăm." },
      de: { internal: "Fahrt ist fertig, bereit zur Kundenrechnung.", forwarder: "Wir schulden dem Frachtführer noch die Rechnung oder warten darauf." },
      hu: { internal: "A fuvar kész, számlázható az ügyfélnek.", forwarder: "Még tartozunk a fuvarozónak a számlával, vagy várjuk." },
    },
  },
  {
    n: 15, parent: "Documents and Invoice Sent (manual)", internal: "—", fwd: "Carrier Invoice Unpaid", band: "invoicing",
    explain: {
      en: "Customer invoice has been issued and emailed. Awaiting customer payment / processing carrier payment.",
      ro: "Factura clientului a fost emisă și trimisă pe email. Așteptăm plata clientului / procesarea plății către transportator.",
      de: "Kundenrechnung wurde ausgestellt und per E-Mail versendet. Warten auf Kundenzahlung / Bearbeitung der Frachtführer-Zahlung.",
      hu: "Az ügyfél-számla kiállítva és e-mailben elküldve. Várjuk az ügyfél fizetését / fuvarozó fizetés feldolgozása.",
    },
    explainCols: {
      en: { forwarder: "Carrier invoice received and queued for payment." },
      ro: { forwarder: "Am primit factura transportatorului și a fost pusă la plată." },
      de: { forwarder: "Frachtführer-Rechnung erhalten und zur Zahlung eingereiht." },
      hu: { forwarder: "Megkaptuk a fuvarozó számláját és fizetésre soroltuk." },
    },
  },
  {
    n: 16, parent: "Completed (customer paid + all children Completed)", internal: "—", fwd: "Completed", band: "completed",
    explain: {
      en: "Customer has paid in full AND every forwarder child is Completed. The order is fully closed — no further action expected.",
      ro: "Clientul a plătit integral ȘI fiecare copil de tip forwarder este Completed. Comanda este complet închisă — nu se mai așteaptă nicio acțiune.",
      de: "Kunde hat vollständig bezahlt UND jedes Forwarder-Child ist Completed. Der Auftrag ist vollständig abgeschlossen — keine weitere Aktion erwartet.",
      hu: "Az ügyfél teljes egészében fizetett ÉS minden forwarder-gyermek Completed. A megrendelés teljesen lezárult — nincs további várt művelet.",
    },
  },
  {
    n: "X", parent: "Cancelled", internal: "Cancelled", fwd: "Cancelled", band: "cancelled",
    explain: {
      en: "Order was killed before completion. Reason should always be captured in the status-change note. Cancelled orders are excluded from KPIs.",
      ro: "Comanda a fost anulată înainte de finalizare. Motivul trebuie întotdeauna notat în comentariul schimbării de status. Comenzile anulate sunt excluse din KPI-uri.",
      de: "Auftrag wurde vor Abschluss storniert. Der Grund sollte immer im Status-Änderungs-Vermerk erfasst werden. Stornierte Aufträge sind von KPIs ausgeschlossen.",
      hu: "A megrendelést a befejezés előtt törölték. Az okot mindig rögzíteni kell a státuszváltási megjegyzésben. A törölt megrendelések kizárva a KPI-okból.",
    },
  },
  {
    n: "||", parent: "On Hold", internal: "On Hold", fwd: "On Hold", band: "hold",
    explain: {
      en: "Execution paused (customer dispute, document blocker, payment issue, etc.). The order keeps its prior data but is excluded from active queues until resumed.",
      ro: "Execuția suspendată (litigiu cu clientul, blocaj documente, problemă de plată etc.). Comanda își păstrează datele anterioare, dar este exclusă din cozile active până la reluare.",
      de: "Ausführung pausiert (Kundenstreit, Dokument-Blocker, Zahlungsproblem etc.). Der Auftrag behält seine vorherigen Daten, ist aber bis zur Wiederaufnahme von aktiven Warteschlangen ausgeschlossen.",
      hu: "Végrehajtás felfüggesztve (ügyfél vita, dokumentum-akadály, fizetési probléma stb.). A megrendelés megőrzi korábbi adatait, de a folytatásig ki van zárva az aktív sorokból.",
    },
  },
];

// Color bands matching the spreadsheet from the brief — mapped to our
// design tokens / Tailwind palette so they look right in both light and
// dark mode. Tints are stronger than typical because they need to be
// recognizable at a glance against the dark dialog surface.
const BAND_CLASSES: Record<Row["band"], string> = {
  header: "",
  draft: "bg-slate-500/10 dark:bg-slate-400/[0.06]",
  confirmed: "bg-slate-500/10 dark:bg-slate-400/[0.06]",
  execution: "bg-blue-500/15 dark:bg-blue-400/[0.14]",
  documents: "bg-emerald-500/20 dark:bg-emerald-400/[0.18]",
  invoicing: "bg-amber-500/20 dark:bg-amber-400/[0.18]",
  completed: "bg-emerald-500/15 dark:bg-emerald-400/[0.12]",
  cancelled: "bg-red-500/20 dark:bg-red-400/[0.20]",
  hold: "bg-orange-500/20 dark:bg-orange-400/[0.20]",
};

// PDF row-band fill colors — light tints that mirror the on-screen
// BAND_CLASSES so the exported document is recognizable at a glance.
const BAND_RGB: Record<Row["band"], [number, number, number] | null> = {
  header: null,
  draft: [241, 245, 249],
  confirmed: [241, 245, 249],
  execution: [219, 234, 254],
  documents: [209, 250, 229],
  invoicing: [254, 243, 199],
  completed: [220, 252, 231],
  cancelled: [254, 226, 226],
  hold: [255, 237, 213],
};

// jsPDF's built-in Helvetica only supports CP1252/Latin-1, which lacks the
// Romanian comma-below letters (ș, ț) and others — they render as garbled
// glyphs. We strip diacritics down to ASCII so the exported text is clean.
// A couple of explicit replacements come first because NFD normalization
// alone doesn't decompose some characters the way we want.
function stripDiacritics(input: string): string {
  return input
    .replace(/ș/g, "s").replace(/Ș/g, "S")
    .replace(/ț/g, "t").replace(/Ț/g, "T")
    .replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ţ/g, "t").replace(/Ţ/g, "T")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Compose the localized explanation for the PDF's "What it means" column.
// When a row has per-column copy we prefix each fragment with its (also
// localized) role label so the single PDF column stays readable.
function composeExplainForPdf(r: Row, lang: Lang): string {
  const base = r.explain[lang];
  if (!r.explainCols) return base;
  const cols = r.explainCols[lang];
  const roles = HEADER_I18N[lang].roles;
  const parts: string[] = [];
  if (base) parts.push(base);
  if (cols.internal) parts.push(`${roles.internal}: ${cols.internal}`);
  if (cols.forwarder) parts.push(`${roles.forwarder}: ${cols.forwarder}`);
  return parts.join("\n");
}

// Builds and downloads the status guide as a landscape A4 PDF in the
// chosen language. jsPDF + jspdf-autotable are already project deps; we
// import them lazily so they only load when the user actually exports.
async function exportStatusGuidePdf(lang: Lang) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const t = HEADER_I18N[lang];
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 32;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(stripDiacritics(t.title), margin, 40);

  // Generated-at + language line
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`${LANG_LABELS[lang]} · ${stamp}`, pageWidth - margin, 40, { align: "right" });

  // Intro paragraph (wrapped)
  const introLines = doc.splitTextToSize(stripDiacritics(t.intro), pageWidth - margin * 2) as string[];
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  doc.text(introLines, margin, 58);

  const startY = 58 + introLines.length * 11 + 10;

  autoTable(doc, {
    head: [[t.cols.hash, t.cols.parent, t.cols.internal, t.cols.forwarder, t.cols.explain].map(stripDiacritics)],
    body: ROWS.map((r) => [
      String(r.n),
      stripDiacritics(r.parent),
      stripDiacritics(r.internal),
      stripDiacritics(r.fwd),
      stripDiacritics(composeExplainForPdf(r, lang)),
    ]),
    startY,
    margin: { left: margin, right: margin, bottom: 32 },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, valign: "top", lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    columnStyles: {
      0: { halign: "center", cellWidth: 26, textColor: [120, 120, 120] },
      1: { cellWidth: 150, fontStyle: "bold", textColor: [15, 23, 42] },
      2: { cellWidth: 110 },
      3: { cellWidth: 110 },
      4: { cellWidth: "auto", textColor: [90, 90, 90] },
    },
    // Tint each row by its lifecycle band, matching the on-screen colors.
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const band = ROWS[data.row.index]?.band;
      const rgb = band ? BAND_RGB[band] : null;
      if (rgb) data.cell.styles.fillColor = rgb;
    },
  });

  doc.save(`status-reference-guide-${lang}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

export interface StatusGuideProps {
  /** Visual tweak — by default the trigger is a tiny ghost button with an
   *  info icon, which is what we want next to "Change Status". */
  className?: string;
}

export function StatusGuide({ className }: StatusGuideProps) {
  const [lang, setLang] = useState<Lang>("en");
  const [exporting, setExporting] = useState(false);
  const t = HEADER_I18N[lang];

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportStatusGuidePdf(lang);
    } catch (err) {
      console.error("[v0] status guide PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open status reference guide"
          className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", className)}
        >
          <Info className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[88vh] overflow-hidden flex flex-col !p-0 gap-0 sm:rounded-lg"
        style={{ maxWidth: "min(1100px, 95vw)", width: "min(1100px, 95vw)" }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <Info className="h-4 w-4 text-primary shrink-0" />
                {t.title}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed text-pretty max-w-2xl">
                {t.intro}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Tabs value={lang} onValueChange={v => setLang(v as Lang)}>
                <TabsList className="h-8">
                  {(Object.keys(LANG_LABELS) as Lang[]).map(l => (
                    <TabsTrigger key={l} value={l} className="text-xs h-6 px-2.5">
                      {LANG_LABELS[l]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting}
                className="h-8 gap-1.5 text-xs"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {EXPORT_LABELS[lang]}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Wide spreadsheet-style table with color bands matching the brief.
            We pair each status row with a sub-row that holds the localized
            explanation spanning all columns — this keeps the at-a-glance
            mapping intact while still showing the per-status guidance. */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75">
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted-foreground py-2.5 px-4 w-12">{t.cols.hash}</th>
                <th className="text-left font-semibold text-muted-foreground py-2.5 px-4 w-[28%]">{t.cols.parent}</th>
                <th className="text-left font-semibold text-muted-foreground py-2.5 px-4 w-[26%]">{t.cols.internal}</th>
                <th className="text-left font-semibold text-muted-foreground py-2.5 px-4 w-[26%]">{t.cols.forwarder}</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, idx) => {
                const band = BAND_CLASSES[r.band];
                const isFirstOfBand = idx === 0 || ROWS[idx - 1].band !== r.band;
                return (
                  <Fragment key={idx}>
                    <tr className={cn(band, isFirstOfBand && "border-t border-border/40")}>
                      <td className="py-2.5 px-4 text-muted-foreground tabular-nums font-mono align-middle">
                        {r.n}
                      </td>
                      <td className="py-2.5 px-4 text-foreground font-semibold align-middle">
                        {r.parent}
                      </td>
                      <td className={cn(
                        "py-2.5 px-4 align-middle",
                        r.internal === "—" ? "text-muted-foreground/60" : "text-foreground/90",
                      )}>
                        {r.internal}
                      </td>
                      <td className={cn(
                        "py-2.5 px-4 align-middle",
                        r.fwd === "—" ? "text-muted-foreground/60" : "text-foreground/90",
                      )}>
                        {r.fwd}
                      </td>
                    </tr>
                    <tr className={cn(band, "border-b border-border/30")}>
                      <td />
                      {/* If the row provides per-column copy, render each
                          fragment under its own column. The shared paragraph
                          (if any) sits under the Parent column so it doesn't
                          duplicate the per-column detail. Otherwise we span
                          the explanation across all 3 content columns. */}
                      {r.explainCols ? (
                        <>
                          <td className="px-4 pb-2.5 -mt-1 text-[11px] text-muted-foreground leading-relaxed text-pretty align-top">
                            {r.explain[lang]}
                          </td>
                          <td className="px-4 pb-2.5 -mt-1 text-[11px] text-muted-foreground leading-relaxed text-pretty align-top">
                            {r.explainCols[lang].internal ?? ""}
                          </td>
                          <td className="px-4 pb-2.5 -mt-1 text-[11px] text-muted-foreground leading-relaxed text-pretty align-top">
                            {r.explainCols[lang].forwarder ?? ""}
                          </td>
                        </>
                      ) : (
                        <td colSpan={3} className="px-4 pb-2.5 -mt-1 text-[11px] text-muted-foreground leading-relaxed text-pretty">
                          {r.explain[lang]}
                        </td>
                      )}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend pinned to the bottom of the dialog so the bands are easy
            to decode at a glance regardless of which row is in view. */}
        <div className="border-t border-border/50 px-6 py-3 shrink-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
            <span className="font-medium">{t.legend}</span>
            <LegendChip className="bg-blue-500/[0.12]" label="In Execution" />
            <LegendChip className="bg-emerald-500/[0.18]" label="Documents Received" />
            <LegendChip className="bg-amber-500/[0.18]" label="Invoicing" />
            <LegendChip className="bg-red-500/[0.18]" label="Cancelled" />
            <LegendChip className="bg-orange-500/[0.18]" label="On Hold" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LegendChip({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block w-3 h-3 rounded-sm border border-border/50", className)} />
      {label}
    </span>
  );
}
