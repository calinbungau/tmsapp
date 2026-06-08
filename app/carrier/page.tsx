"use client";

import type React from "react";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Truck, Loader2 } from "lucide-react";
import {
  getStoredCarrierSession,
  setStoredCarrierSession,
} from "@/hooks/use-carrier-session";
import { AppPromo } from "@/components/exchange/app-promo";

function CarrierAuth() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const invite = searchParams.get("invite");
  const initialMode =
    searchParams.get("mode") === "signup" || invite ? "signup" : "login";

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (getStoredCarrierSession()) {
      router.replace("/carrier-dashboard");
    } else {
      setChecking(false);
    }
  }, [router]);

  const handleAltLogin = (url: string) => {
    const w = window as any;
    if (w.webkit?.messageHandlers?.appInterface) {
      w.webkit.messageHandlers.appInterface.postMessage(`server|${url}`);
    } else if (w.appInterface) {
      w.appInterface.postMessage(`server|${url}`);
    } else {
      window.location.replace(url);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/carrier-auth/login" : "/api/carrier-auth/signup";
      const payload =
        mode === "login"
          ? { email, password }
          : { email, password, companyName, contactName, phone, token, invite };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }
      setStoredCarrierSession(data.session);
      router.replace("/carrier-dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Truck className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl text-balance">
              {mode === "login" ? "Carrier Portal" : "Create carrier account"}
            </CardTitle>
            <CardDescription className="text-pretty">
              {mode === "login"
                ? "Sign in to view freight offers and respond instantly"
                : "Set up your account to manage offers from one place"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {mode === "signup" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company name</Label>
                    <Input
                      id="company"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Transport SRL"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact">Contact name</Label>
                    <Input
                      id="contact"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Ion Popescu"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+40 ..."
                    />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Please wait...
                  </>
                ) : mode === "login" ? (
                  "Sign in"
                ) : (
                  "Create account"
                )}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  {"Don't have an account? "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setError("");
                    }}
                    className="font-medium text-primary hover:underline"
                  >
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError("");
                    }}
                    className="font-medium text-primary hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => handleAltLogin(`${window.location.origin}/admin`)}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Admin Panel
          </button>
        </div>

        <div className="mt-6">
          <AppPromo subtitle="Get the BNG Tracking app for the full carrier experience on the go." />
        </div>
      </div>
    </div>
  );
}

export default function CarrierLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CarrierAuth />
    </Suspense>
  );
}
