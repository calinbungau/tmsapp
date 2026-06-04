"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface CarrierSession {
  id: string;
  email: string;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  vat_number: string | null;
}

const STORAGE_KEY = "carrier_session";

export function getStoredCarrierSession(): CarrierSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CarrierSession) : null;
  } catch {
    return null;
  }
}

export function setStoredCarrierSession(session: CarrierSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredCarrierSession() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Carrier auth session, mirroring the driver-session pattern. When `redirect`
 * is true the hook bounces unauthenticated visitors to the /carrier login page.
 */
export function useCarrierSession(options: { redirect?: boolean } = {}) {
  const { redirect = true } = options;
  const router = useRouter();
  const [session, setSession] = useState<CarrierSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredCarrierSession();
    if (stored) {
      setSession(stored);
    } else if (redirect) {
      router.replace("/carrier");
    }
    setLoading(false);
  }, [redirect, router]);

  const logout = useCallback(() => {
    clearStoredCarrierSession();
    setSession(null);
    router.replace("/carrier");
  }, [router]);

  return { session, loading, logout };
}
