export type Language = "en" | "hu" | "ro" | "de" | "pl";

export interface Admin {
  id: string;
  email: string;
  password_hash: string;
  company_name: string | null;
  storage_path: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  name: string;
  pin_code: string;
  email: string | null;
  phone: string | null;
  language: Language;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Inspection {
  id: string;
  driver_id: string;
  vehicle_id: string;
  status: "in_progress" | "completed";
  photo_front_right_url: string | null;
  photo_front_left_url: string | null;
  photo_back_right_url: string | null;
  photo_back_left_url: string | null;
  photo_interior_url: string | null;
  photo_license_front_url: string | null;
  photo_license_back_url: string | null;
  photo_gisa_url: string | null;
  signature_url: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  location_timestamp: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  driver?: Driver;
  vehicle?: Vehicle;
}

export type PhotoPosition = "front_right" | "front_left" | "back_right" | "back_left" | "interior" | "license_front" | "license_back" | "gisa";

export interface InspectionWithVehicle extends Inspection {
  vehicles: { plate_number: string; make: string | null; model: string | null } | null;
}

// Multi-language translations
export const TRANSLATIONS: Record<Language, {
  title: string;
  subtitle: string;
  step: string;
  of: string;
  tapToTake: string;
  captured: string;
  next: string;
  back: string;
  submit: string;
  submitting: string;
  cancel: string;
  cancelConfirm: string;
  signature: {
    title: string;
    instruction: string;
    clear: string;
    confirm: string;
  };
  cameraOnly: string;
  photos: {
    front_right: { label: string; instruction: string };
    front_left: { label: string; instruction: string };
    back_right: { label: string; instruction: string };
    back_left: { label: string; instruction: string };
    interior: { label: string; instruction: string };
    license_front: { label: string; instruction: string };
    license_back: { label: string; instruction: string };
    gisa: { label: string; instruction: string };
  };
}> = {
  en: {
    title: "Vehicle Inspection",
    subtitle: "Please upload clear photos taken in good lighting",
    step: "Step",
    of: "of",
    tapToTake: "Tap to take photo",
    captured: "Captured",
    next: "Next",
    back: "Back",
    submit: "Submit Inspection",
    submitting: "Submitting...",
    cancel: "Cancel Inspection",
    cancelConfirm: "Are you sure you want to cancel this inspection?",
    signature: {
      title: "Signature",
      instruction: "Please sign below to confirm the inspection",
      clear: "Clear Signature",
      confirm: "I confirm all photos are accurate",
    },
    cameraOnly: "Please use the camera to take a photo. Gallery photos are not allowed.",
    photos: {
      front_right: { label: "Front Right", instruction: "Take a photo of the vehicle - front right" },
      front_left: { label: "Front Left", instruction: "Take a photo of the vehicle - front left" },
      back_right: { label: "Back Right", instruction: "Take a photo of the vehicle - back right" },
      back_left: { label: "Back Left", instruction: "Take a photo of the vehicle - back left" },
      interior: { label: "Interior", instruction: "Take a photo of the vehicle interior" },
      license_front: { label: "License (Front)", instruction: "Take a photo of your driver's license - FRONT side" },
      license_back: { label: "License (Back)", instruction: "Take a photo of your driver's license - BACK side" },
      gisa: { label: "GISA License", instruction: "Take a photo of the GISA transport license" },
    },
  },
  hu: {
    title: "Jarmu Ellenorzes",
    subtitle: "Kerem, toltsOn fel jo vilagitasban keszult tiszta fenykepeket",
    step: "Lepes",
    of: "/",
    tapToTake: "Koppintson a fenykepezes",
    captured: "Rogzitve",
    next: "Kovetkezo",
    back: "Vissza",
    submit: "Ellenorzes Bekuldese",
    submitting: "Kuldes...",
    cancel: "Ellenorzes Megszakitasa",
    cancelConfirm: "Biztosan meg akarja szakitani az ellenorzest?",
    signature: {
      title: "Alairas",
      instruction: "Kerem, irja ala alul az ellenorzes megerositesere",
      clear: "Alairas Torlese",
      confirm: "Megerositem, hogy minden fenykep pontos",
    },
    cameraOnly: "Kerem, hasznalja a kamerat. A galeria fotokepe nem engedelyezett.",
    photos: {
      front_right: { label: "Elso Jobb", instruction: "Poza autovehicul - fata dreapta" },
      front_left: { label: "Elso Bal", instruction: "Poza autovehicul - fata stanga" },
      back_right: { label: "Hatso Jobb", instruction: "Poza autovehicul - spate dreapta" },
      back_left: { label: "Hatso Bal", instruction: "Poza autovehicul - spate stanga" },
      interior: { label: "Belso Ter", instruction: "Poza interior autovehicul" },
      license_front: { label: "Jogositvany (Eleje)", instruction: "Poza Permis de conducere - Fata" },
      license_back: { label: "Jogositvany (Hatoldal)", instruction: "Poza Permis de conducere - Spate" },
      gisa: { label: "GISA Engedly", instruction: "Poza licenta de transport GISA" },
    },
  },
  ro: {
    title: "Inspectia Vehiculului",
    subtitle: "Va rugam sa incarcati fotografii clare, realizate in lumina buna",
    step: "Pasul",
    of: "din",
    tapToTake: "Apasati pentru a face fotografie",
    captured: "Capturat",
    next: "Urmatorul",
    back: "Inapoi",
    submit: "Trimite Inspectia",
    submitting: "Se trimite...",
    cancel: "Anuleaza Inspectia",
    cancelConfirm: "Sunteti sigur ca doriti sa anulati aceasta inspectie?",
    signature: {
      title: "Semnatura",
      instruction: "Va rugam sa semnati mai jos pentru a confirma inspectia",
      clear: "Sterge Semnatura",
      confirm: "Confirm ca toate fotografiile sunt corecte",
    },
    cameraOnly: "Va rugam sa folositi camera. Fotografiile din galerie nu sunt permise.",
    photos: {
      front_right: { label: "Fata Dreapta", instruction: "Poza autovehicul - fata dreapta" },
      front_left: { label: "Fata Stanga", instruction: "Poza autovehicul - fata stanga" },
      back_right: { label: "Spate Dreapta", instruction: "Poza autovehicul - spate dreapta" },
      back_left: { label: "Spate Stanga", instruction: "Poza autovehicul - spate stanga" },
      interior: { label: "Interior", instruction: "Poza interior autovehicul" },
      license_front: { label: "Permis (Fata)", instruction: "Poza Permis de conducere - Fata" },
      license_back: { label: "Permis (Spate)", instruction: "Poza Permis de conducere - Spate" },
      gisa: { label: "Licenta GISA", instruction: "Poza licenta de transport GISA" },
    },
  },
  de: {
    title: "Fahrzeuginspektion",
    subtitle: "Bitte laden Sie klare Fotos hoch, die bei gutem Licht aufgenommen wurden",
    step: "Schritt",
    of: "von",
    tapToTake: "Tippen Sie, um ein Foto aufzunehmen",
    captured: "Aufgenommen",
    next: "Weiter",
    back: "Zuruck",
    submit: "Inspektion Einreichen",
    submitting: "Wird gesendet...",
    cancel: "Inspektion Abbrechen",
    cancelConfirm: "Sind Sie sicher, dass Sie diese Inspektion abbrechen mochten?",
    signature: {
      title: "Unterschrift",
      instruction: "Bitte unterschreiben Sie unten, um die Inspektion zu bestatigen",
      clear: "Unterschrift loschen",
      confirm: "Ich bestatige, dass alle Fotos korrekt sind",
    },
    cameraOnly: "Bitte verwenden Sie die Kamera. Galeriefotos sind nicht erlaubt.",
    photos: {
      front_right: { label: "Vorne Rechts", instruction: "Foto des Fahrzeugs - vorne rechts" },
      front_left: { label: "Vorne Links", instruction: "Foto des Fahrzeugs - vorne links" },
      back_right: { label: "Hinten Rechts", instruction: "Foto des Fahrzeugs - hinten rechts" },
      back_left: { label: "Hinten Links", instruction: "Foto des Fahrzeugs - hinten links" },
      interior: { label: "Innenraum", instruction: "Foto des Fahrzeuginnenraums" },
      license_front: { label: "Fuhrerschein (Vorne)", instruction: "Foto des Fuhrerscheins - Vorderseite" },
      license_back: { label: "Fuhrerschein (Hinten)", instruction: "Foto des Fuhrerscheins - Ruckseite" },
      gisa: { label: "GISA Lizenz", instruction: "Foto der GISA Transportlizenz" },
    },
  },
  pl: {
    title: "Inspekcja Pojazdu",
    subtitle: "Prosimy o przeslanie wyraznych zdjec wykonanych w dobrym oswietleniu",
    step: "Krok",
    of: "z",
    tapToTake: "Dotknij, aby zrobic zdjecie",
    captured: "Przechwycono",
    next: "Dalej",
    back: "Wstecz",
    submit: "Wyslij Inspekcje",
    submitting: "Wysylanie...",
    cancel: "Anuluj Inspekcje",
    cancelConfirm: "Czy na pewno chcesz anulowac te inspekcje?",
    signature: {
      title: "Podpis",
      instruction: "Prosimy o podpisanie ponizej w celu potwierdzenia inspekcji",
      clear: "Wyczysc Podpis",
      confirm: "Potwierdzam, ze wszystkie zdjecia sa poprawne",
    },
    cameraOnly: "Prosimy o uzycie aparatu. Zdjecia z galerii nie sa dozwolone.",
    photos: {
      front_right: { label: "Przod Prawy", instruction: "Zdjecie pojazdu - przod prawy" },
      front_left: { label: "Przod Lewy", instruction: "Zdjecie pojazdu - przod lewy" },
      back_right: { label: "Tyl Prawy", instruction: "Zdjecie pojazdu - tyl prawy" },
      back_left: { label: "Tyl Lewy", instruction: "Zdjecie pojazdu - tyl lewy" },
      interior: { label: "Wnetrze", instruction: "Zdjecie wnetrza pojazdu" },
      license_front: { label: "Prawo Jazdy (Przod)", instruction: "Zdjecie prawa jazdy - przod" },
      license_back: { label: "Prawo Jazdy (Tyl)", instruction: "Zdjecie prawa jazdy - tyl" },
      gisa: { label: "Licencja GISA", instruction: "Zdjecie licencji transportowej GISA" },
    },
  },
};

export const PHOTO_POSITIONS: PhotoPosition[] = [
  "front_right",
  "front_left", 
  "back_right",
  "back_left",
  "interior",
  "license_front",
  "license_back",
  "gisa",
];

export const LANGUAGE_OPTIONS: { code: Language; name: string; flag: string }[] = [
  { code: "en", name: "English", flag: "GB" },
  { code: "hu", name: "Magyar", flag: "HU" },
  { code: "ro", name: "Romana", flag: "RO" },
  { code: "de", name: "Deutsch", flag: "DE" },
  { code: "pl", name: "Polski", flag: "PL" },
];

// Alias for backwards compatibility
export const translations = TRANSLATIONS;

// Forms System Types
export type FormFrequency = "daily" | "weekly" | "monthly" | "on_demand";
export type QuestionType = "yes_no" | "photo" | "text" | "number" | "signature";

export interface FormTemplate {
  id: string;
  admin_id: string;
  name: string;
  description: string | null;
  frequency: FormFrequency;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  questions?: FormQuestion[];
}

export interface FormQuestion {
  id: string;
  form_template_id: string;
  question_text: string;
  question_type: QuestionType;
  is_required: boolean;
  order_index: number;
  options: Record<string, unknown> | null;
  created_at: string;
}

export interface FormSubmission {
  id: string;
  form_template_id: string;
  driver_id: string;
  vehicle_id: string | null;
  admin_id: string;
  status: "in_progress" | "completed";
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  submitted_at: string | null;
  created_at: string;
  form_template?: FormTemplate;
  driver?: Driver;
  vehicle?: Vehicle;
  answers?: FormAnswer[];
}

export interface FormAnswer {
  id: string;
  submission_id: string;
  question_id: string;
  answer_text: string | null;
  answer_boolean: boolean | null;
  answer_number: number | null;
  answer_photo_url: string | null;
  created_at: string;
  question?: FormQuestion;
}

export const FORM_FREQUENCY_LABELS: Record<FormFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  on_demand: "On Demand",
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  yes_no: "Yes/No",
  photo: "Photo",
  text: "Text",
  number: "Number",
  signature: "Signature",
};

// Maintenance System Types
export type MaintenanceStatus = "reported" | "diagnose" | "scheduled" | "due" | "in_progress" | "completed" | "expired";
export type ServiceIntervalType = "date" | "mileage" | "engine_hours";

export interface MaintenanceType {
  id: string;
  admin_id: string;
  name: string;
  description: string | null;
  service_interval_types: ServiceIntervalType[];
  interval_days: number | null;
  remind_days_before: number | null;
  interval_mileage: number | null;
  remind_mileage_before: number | null;
  interval_engine_hours: number | null;
  remind_engine_hours_before: number | null;
  auto_repeat: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  notification_emails?: MaintenanceNotificationEmail[];
}

export interface MaintenanceNotificationEmail {
  id: string;
  maintenance_type_id: string;
  email: string;
  created_at: string;
}

export interface MaintenanceRecord {
  id: string;
  admin_id: string;
  vehicle_id: string;
  maintenance_type_id: string;
  status: MaintenanceStatus;
  scheduled_date: string | null;
  due_mileage: number | null;
  due_engine_hours: number | null;
  completed_date: string | null;
  completed_mileage: number | null;
  completed_engine_hours: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vehicle?: Vehicle;
  maintenance_type?: MaintenanceType;
  costs?: MaintenanceCost[];
}

export interface MaintenanceCost {
  id: string;
  maintenance_record_id: string;
  description: string | null;
  amount: number;
  invoice_url: string | null;
  created_at: string;
}

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  reported: "Driver Reported",
  diagnose: "Diagnosis",
  scheduled: "Scheduled",
  due: "Due",
  in_progress: "In Progress",
  completed: "Completed",
  expired: "Expired",
};

export const SERVICE_INTERVAL_LABELS: Record<ServiceIntervalType, string> = {
  date: "By Date",
  mileage: "By Mileage",
  engine_hours: "By Engine Hours",
};
