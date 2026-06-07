export type Locale = "ro" | "en"

export const translations = {
  ro: {
    nav: {
      features: "Funcționalități",
      platform: "Platformă",
      modules: "Module",
      contact: "Contact",
      login: "Autentificare",
      cta: "Solicită o demonstrație",
    },
    hero: {
      badge: "Platformă completă de transport și flotă",
      title: "Întreaga ta operațiune de transport, într-un singur loc.",
      subtitle:
        "BNG Tracking unește urmărirea GPS a flotei, managementul comenzilor, bursa de transport, facturarea și costurile într-o singură platformă rapidă și inteligentă, construită pentru transportatorii și casele de expediții din Europa.",
      ctaPrimary: "Solicită o demonstrație",
      ctaSecondary: "Vezi funcționalitățile",
      trusted: "Construit pentru flote și case de expediții moderne",
    },
    stats: {
      modules: "Module integrate",
      uptime: "Disponibilitate platformă",
      realtime: "Urmărire GPS în timp real",
      countries: "Țări acoperite pentru taxe de drum",
    },
    features: {
      title: "O platformă. Fiecare parte a transportului.",
      subtitle:
        "De la primul kilometru până la factura finală — totul conectat, automatizat și vizibil în timp real.",
      items: [
        {
          title: "Urmărire GPS a flotei",
          desc: "Localizare în timp real a vehiculelor, istoric de rute, geofencing și partajare live a trackingului cu clienții tăi.",
        },
        {
          title: "Management transport (TMS)",
          desc: "Comenzi, curse, planificare multi-leg și execuție — cu prețuri, marje și costuri calculate automat.",
        },
        {
          title: "Bursă de transport",
          desc: "Publică oferte către transportatori, primește cotații, atribuie automat și creează comanda de subcontractare dintr-un clic.",
        },
        {
          title: "Aplicație pentru șoferi",
          desc: "Check-in la stații, CMR/POD, formulare, inspecții și navigație — direct de pe telefonul șoferului.",
        },
        {
          title: "Finanțe și facturare",
          desc: "Facturare integrată cu SmartBill, SAGA și e-Factura, urmărirea plăților, scadențe și skonto.",
        },
        {
          title: "Management costuri",
          desc: "Catalog de costuri, bugete, alocări pe cursă/vehicul/client și alerte de varianță pentru profitabilitate reală.",
        },
        {
          title: "Calcul taxe de drum",
          desc: "Taxe, viniete și taxe speciale calculate pe rută, pe clasa de emisii și pe axe, pentru zeci de țări.",
        },
        {
          title: "Mentenanță",
          desc: "Programări automate pe km, ore motor sau date, cu notificări, costuri și istoric complet pe vehicul.",
        },
        {
          title: "HR și concedii",
          desc: "Angajați, documente, expirări, politici de concediu și solicitări, toate într-un singur loc.",
        },
        {
          title: "Documente și formulare",
          desc: "Extragere automată cu AI a datelor din comenzi, gestionarea documentelor și formulare personalizate.",
        },
        {
          title: "Rapoarte și KPI",
          desc: "Tablouri de bord, indicatori de performanță, rapoarte programate și analize de profitabilitate.",
        },
        {
          title: "Notificări și chat",
          desc: "Alerte în timp real, reguli de notificare configurabile și mesagerie internă cu echipa și transportatorii.",
        },
      ],
    },
    platform: {
      title: "Inteligent acolo unde contează",
      subtitle:
        "Automatizările potrivite te ajută să câștigi timp și să crești marja pe fiecare cursă.",
      items: [
        {
          title: "Prețuri inteligente pe comandă",
          desc: "Calculează automat prețul transportatorului din prețul clientului — comută între marjă % și €/km și vezi instant spread-ul.",
        },
        {
          title: "Reflectare automată la atribuire",
          desc: "Când o ofertă este câștigată, costul, transportatorul și comanda de subcontractare se creează automat.",
        },
        {
          title: "Extragere documente cu AI",
          desc: "Trimite un email cu comanda și AI-ul completează stațiile, marfa și prețurile — fără tastare manuală.",
        },
        {
          title: "Tracking live pentru clienți",
          desc: "Un singur link partajabil cu ETA, status și stații, fără să dai acces la platformă.",
        },
      ],
    },
    cta: {
      title: "Hai să-ți punem flota pe pilot automat.",
      subtitle:
        "Lasă-ne datele tale și revenim cu o demonstrație personalizată a BNG Tracking pentru operațiunea ta.",
      company: "Numele companiei",
      name: "Numele tău",
      phone: "Telefon",
      email: "Email",
      message: "Mesaj (opțional)",
      messagePlaceholder: "Spune-ne câteva vehicule ai sau ce te interesează cel mai mult...",
      submit: "Trimite solicitarea",
      submitting: "Se trimite...",
      success: "Mulțumim! Te contactăm în cel mai scurt timp.",
      error: "A apărut o eroare. Te rugăm să încerci din nou.",
      required: "Acest câmp este obligatoriu",
      invalidEmail: "Adresă de email invalidă",
    },
    footer: {
      tagline: "Platforma completă de transport și management al flotei.",
      product: "Produs",
      company: "Companie",
      legal: "Legal",
      rights: "Toate drepturile rezervate.",
    },
  },
  en: {
    nav: {
      features: "Features",
      platform: "Platform",
      modules: "Modules",
      contact: "Contact",
      login: "Log in",
      cta: "Request a demo",
    },
    hero: {
      badge: "Complete transport & fleet platform",
      title: "Your entire transport operation, in one place.",
      subtitle:
        "BNG Tracking unifies fleet GPS tracking, order management, freight exchange, invoicing and costing into one fast, intelligent platform built for European carriers and freight forwarders.",
      ctaPrimary: "Request a demo",
      ctaSecondary: "Explore features",
      trusted: "Built for modern fleets and freight forwarders",
    },
    stats: {
      modules: "Integrated modules",
      uptime: "Platform uptime",
      realtime: "Real-time GPS tracking",
      countries: "Countries covered for tolls",
    },
    features: {
      title: "One platform. Every part of transport.",
      subtitle:
        "From the first kilometer to the final invoice — everything connected, automated and visible in real time.",
      items: [
        {
          title: "Fleet GPS Tracking",
          desc: "Real-time vehicle location, route history, geofencing and live tracking links you can share with your customers.",
        },
        {
          title: "Transport Management (TMS)",
          desc: "Orders, trips, multi-leg planning and execution — with prices, margins and costs calculated automatically.",
        },
        {
          title: "Freight Exchange",
          desc: "Publish offers to carriers, receive quotes, auto-award and create the subcontract order in a single click.",
        },
        {
          title: "Driver App",
          desc: "Stop check-ins, CMR/POD, forms, inspections and navigation — straight from the driver's phone.",
        },
        {
          title: "Finance & Invoicing",
          desc: "Invoicing integrated with SmartBill, SAGA and e-Factura, payment tracking, due dates and skonto.",
        },
        {
          title: "Cost Management",
          desc: "Cost catalog, budgets, allocations per trip/vehicle/customer and variance alerts for real profitability.",
        },
        {
          title: "Toll Calculation",
          desc: "Tolls, vignettes and special charges calculated per route, emission class and axles across dozens of countries.",
        },
        {
          title: "Maintenance",
          desc: "Automatic scheduling by km, engine hours or dates, with notifications, costs and full per-vehicle history.",
        },
        {
          title: "HR & Leave",
          desc: "Employees, documents, expirations, leave policies and requests, all in one place.",
        },
        {
          title: "Documents & Forms",
          desc: "AI-powered data extraction from orders, document management and fully customizable forms.",
        },
        {
          title: "Reports & KPIs",
          desc: "Dashboards, performance indicators, scheduled reports and profitability analytics.",
        },
        {
          title: "Notifications & Chat",
          desc: "Real-time alerts, configurable notification rules and built-in messaging with your team and carriers.",
        },
      ],
    },
    platform: {
      title: "Smart where it matters",
      subtitle: "The right automations save you time and grow the margin on every load.",
      items: [
        {
          title: "Smart per-order pricing",
          desc: "Automatically derive the carrier price from the customer price — toggle between margin % and €/km and see the spread instantly.",
        },
        {
          title: "Auto reflect-back on award",
          desc: "When an offer is won, the cost, carrier and subcontract order are created automatically.",
        },
        {
          title: "AI document extraction",
          desc: "Forward the order email and AI fills in stops, cargo and pricing — no manual typing.",
        },
        {
          title: "Live customer tracking",
          desc: "A single shareable link with ETA, status and stops, without giving access to the platform.",
        },
      ],
    },
    cta: {
      title: "Let's put your fleet on autopilot.",
      subtitle:
        "Leave us your details and we'll get back to you with a personalized BNG Tracking demo for your operation.",
      company: "Company name",
      name: "Your name",
      phone: "Phone",
      email: "Email",
      message: "Message (optional)",
      messagePlaceholder: "Tell us how many vehicles you run or what interests you most...",
      submit: "Send request",
      submitting: "Sending...",
      success: "Thank you! We'll be in touch shortly.",
      error: "Something went wrong. Please try again.",
      required: "This field is required",
      invalidEmail: "Invalid email address",
    },
    footer: {
      tagline: "The complete transport and fleet management platform.",
      product: "Product",
      company: "Company",
      legal: "Legal",
      rights: "All rights reserved.",
    },
  },
} as const

export type Translation = (typeof translations)["ro"]
