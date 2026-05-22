"use client";

import { useState, useEffect } from "react";

export interface DriverSession {
  id: string;
  name: string;
  pin_code: string;
  admin_id: string;
  email?: string | null;
  phone?: string | null;
  language?: string;
}

export function useDriverSession() {
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const sessionStr = localStorage.getItem("driver_session");
    if (sessionStr) {
      try {
        const parsed = JSON.parse(sessionStr);
        if (parsed.id && parsed.pin_code) {
          setDriver(parsed);
        }
      } catch {
        // Invalid session
      }
    }
    setIsLoading(false);
  }, []);

  return { driver, isLoading };
}
