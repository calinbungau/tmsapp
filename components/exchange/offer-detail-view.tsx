"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  MapPin,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Package,
  Banknote,
  Clock,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ThumbsUp,
  Lock,
  Trophy,
} from "lucide-react";
import { AppPromo } from "@/components/exchange/app-promo";
import { PortalChat } from "@/components/exchange/portal-chat";
import { getStoredCarrierSession } from "@/hooks/use-carrier-session";
import { createClient } from "@/lib/supabase/client";

// ─── Country flag ──────────────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  hungary: "HU", germany: "DE", romania: "RO", poland: "PL", czechia: "CZ",
  "czech republic": "CZ", slovakia: "SK", austria: "AT", france: "FR",
  italy: "IT", spain: "ES", netherlands: "NL", belgium: "BE", croatia: "HR",
  slovenia: "SI", serbia: "RS", bulgaria: "BG", greece: "GR", turkey: "TR",
  ukraine: "UA", moldova: "MD", "united kingdom": "GB", uk: "GB",
  ireland: "IE", portugal: "PT", sweden: "SE", norway: "NO", denmark: "DK",
  finland: "FI", switzerland: "CH", luxembourg: "LU",
};
function getCountryCode(c?: string | null) {
  if (!c) return "";
  const u = c.trim().toUpperCase();
  if (u.length === 2 && /^[A-Z]{2}$/.test(u)) return u;
  return COUNTRY_CODES[c.trim().toLowerCase()] || "";
}
function CountryFlag({ country }: { country?: string | null }) {
  const code = getCountryCode(country);
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w20/${code.toLowerCase()}.png`}
      alt={country || ""}
      className="w-5 h-3.5 rounded-[2px] object-cover shrink-0"
      crossOrigin="anonymous"
    />
  );
}

// ─── Helpers ───────────────────────────────────────────────
function fmtCurrency(amount?: number | null, currency = "EUR") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateRange(from?: string | null, to?: string | null) {
  if (!from && !to) return "—";
  if (from === to || !to) return fmtDate(from);
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

interface Offer {
  id: string;
  reference: string;
  title: string | null;
  status: string;
  origin_city: string | null;
  origin_postal_code: string | null;
  origin_country: string | null;
  dest_city: string | null;
  dest_postal_code: string | null;
  dest_country: string | null;
  load_date_from: string | null;
  load_date_to: string | null;
  unload_date_from: string | null;
  unload_date_to: string | null;
  vehicle_type: string | null;
  body_type: string | null;
  weight_kg: number | null;
  ldm: number | null;
  pallet_count: number | null;
  adr_class: string | null;
  goods_description: string | null;
  pricing_mode: string;
  price_amount: number | null;
  currency: string;
  payment_terms_days: number | null;
  expires_at: string | null;
}
interface RecipientState {
  id: string;
  carrierName: string | null;
  email: string | null;
  response: string | null;
  respondedAt: string | null;
  quoteAmount: number | null;
  quoteCurrency: string | null;
  quoteMessage: string | null;
  dispatcherDecision: "accepted" | "declined" | null;
  decidedAt: string | null;
  isAwarded: boolean;
  offerAwarded: boolean;
  hasAccount: boolean;
}
interface ChatMessage {
  id: string;
  sender_id: string;
  sender_type: string;
  sender_name: string | null;
  content: string;
  created_at: string;
}

/**
 * Renders a freight offer detail. In standalone mode (default) it is a full
 * page with its own header and PIN gate, used for the public emailed link. In
 * `embedded` mode it renders inside the carrier dashboard chrome (no full-screen
 * wrappers, with a back button instead of the standalone header).
 */
export function OfferDetailView({
  token,
  embedded = false,
  onBack,
}: {
  token: string;
  embedded?: boolean;
  onBack?: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "pin" | "ready" | "error">("loading");
  const [meta, setMeta] = useState<{ carrierName: string | null; companyName: string | null } | null>(null);
  const [errorKind, setErrorKind] = useState<string | null>(null);

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [offer, setOffer] = useState<Offer | null>(null);
  const [company, setCompany] = useState<{ company_name: string | null; email: string | null; phone: string | null } | null>(null);
  const [recipient, setRecipient] = useState<RecipientState | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Apply a full offer payload (shared by the session bypass and PIN verify).
  const applyOfferData = useCallback((data: any) => {
    setOffer(data.offer);
    setCompany(data.company);
    setRecipient(data.recipient);
    setConversationId(data.conversationId);
    setMessages(data.messages || []);
    setPhase("ready");
  }, []);

  // On mount: fetch meta, and if the visitor already has a carrier session,
  // try to open the offer directly (no PIN). Fall back to the PIN gate.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/exchange/portal/${token}`);
        if (res.status === 404) {
          setErrorKind("not_found");
          setPhase("error");
          return;
        }
        if (res.status === 410) {
          setErrorKind("expired");
          setPhase("error");
          return;
        }
        const data = await res.json();
        setMeta({ carrierName: data.carrierName, companyName: data.companyName });

        // Logged-in carrier? Attempt a PIN-less unlock with their account id.
        const session = getStoredCarrierSession();
        if (session?.id) {
          const unlock = await fetch(`/api/exchange/portal/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ carrierAccountId: session.id, track: true }),
          });
          if (unlock.ok) {
            applyOfferData(await unlock.json());
            return;
          }
        }

        setPhase("pin");
      } catch {
        setErrorKind("network");
        setPhase("error");
      }
    })();
  }, [token, applyOfferData]);

  // Realtime subscription for live updates (when in ready phase)
  useEffect(() => {
    if (phase !== "ready" || !offer?.id) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`carrier-offer-${token}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "freight_offers", filter: `id=eq.${offer.id}` }, async () => {
        // Re-fetch offer data
        const session = getStoredCarrierSession();
        if (session?.id) {
          const unlock = await fetch(`/api/exchange/portal/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ carrierAccountId: session.id }),
          });
          if (unlock.ok) {
            applyOfferData(await unlock.json());
          }
        } else if (pin) {
          const res = await fetch(`/api/exchange/portal/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin }),
          });
          if (res.ok) {
            applyOfferData(await res.json());
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "freight_offer_recipients", filter: `offer_id=eq.${offer.id}` }, async () => {
        // Re-fetch on recipient changes (awards, decisions)
        const session = getStoredCarrierSession();
        if (session?.id) {
          const unlock = await fetch(`/api/exchange/portal/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ carrierAccountId: session.id }),
          });
          if (unlock.ok) {
            applyOfferData(await unlock.json());
          }
        } else if (pin) {
          const res = await fetch(`/api/exchange/portal/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin }),
          });
          if (res.ok) {
            applyOfferData(await res.json());
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [phase, offer?.id, token, pin, applyOfferData]);

  const verify = useCallback(async () => {
    if (pin.length < 4) {
      setPinError("Enter the 6-digit PIN from your email.");
      return;
    }
    setVerifying(true);
    setPinError(null);
    try {
      const res = await fetch(`/api/exchange/portal/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, track: true }),
      });
      if (res.status === 401) {
        setPinError("That PIN doesn't match. Please check your email and try again.");
        setVerifying(false);
        return;
      }
      if (res.status === 410) {
        setErrorKind("expired");
        setPhase("error");
        return;
      }
      if (!res.ok) {
        setPinError("Something went wrong. Please try again.");
        setVerifying(false);
        return;
      }
      applyOfferData(await res.json());
    } catch {
      setPinError("Network error. Please try again.");
    } finally {
      setVerifying(false);
    }
  }, [pin, token, applyOfferData]);

  // ─── Loading ─────────────────────────────────────────────
  if (phase === "loading") {
    if (embedded) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Error ───────────────────────────────────────────────
  if (phase === "error") {
    const errorCard = (
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-foreground">
          {errorKind === "expired" ? "This offer link has expired" : "Link not found"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {errorKind === "expired"
            ? "The freight offer is no longer available. Please contact the dispatcher for an updated offer."
            : "We couldn't find this offer. The link may be incorrect or has been removed."}
        </p>
      </div>
    );
    if (embedded) {
      return (
        <div className="p-4 max-w-md mx-auto">
          {onBack && <BackButton onBack={onBack} className="mb-4" />}
          {errorCard}
        </div>
      );
    }
    return <div className="flex min-h-screen items-center justify-center bg-background px-4">{errorCard}</div>;
  }

  // ─── PIN gate ────────────────────────────────────────────
  if (phase === "pin") {
    const pinCard = (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
            <Lock className="h-6 w-6 text-blue-600" />
          </div>
          <h1 className="mt-4 text-center text-xl font-semibold text-foreground text-balance">
            Freight offer
          </h1>
          <p className="mt-1 text-center text-sm text-muted-foreground leading-relaxed">
            {meta?.companyName ? `${meta.companyName} ` : ""}sent you a freight offer
            {meta?.carrierName ? `, ${meta.carrierName}` : ""}. Enter the PIN from your email to view it.
          </p>
          <div className="mt-6">
            <label htmlFor="pin" className="text-xs font-medium text-muted-foreground">
              6-digit PIN
            </label>
            <input
              id="pin"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && verify()}
              placeholder="••••••"
              className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-3 text-center text-2xl tracking-[0.4em] outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            {pinError && <p className="mt-2 text-sm text-red-600">{pinError}</p>}
          </div>
          <button
            onClick={verify}
            disabled={verifying}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            View offer
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure carrier access
          </p>
        </div>
        {!embedded && (
          <div className="mt-4">
            <AppPromo />
          </div>
        )}
      </div>
    );
    if (embedded) {
      return (
        <div className="p-4 flex flex-col items-center">
          {onBack && <BackButton onBack={onBack} className="self-start mb-4" />}
          {pinCard}
        </div>
      );
    }
    return <div className="flex min-h-screen items-center justify-center bg-background px-4">{pinCard}</div>;
  }

  // ─── Ready ───────────────────────────────────────────────
  const body = (
    <div className={embedded ? "mx-auto max-w-3xl px-4 py-4 flex flex-col gap-5" : "mx-auto max-w-3xl px-4 py-6 flex flex-col gap-5"}>
      {(recipient?.response || recipient?.dispatcherDecision) && (
        <ResponseSummary recipient={recipient} companyName={company?.company_name ?? null} />
      )}

      {/* Route */}
      <section className="rounded-xl border border-border bg-card p-5">
        {offer?.title && <p className="mb-3 text-sm font-medium text-foreground">{offer.title}</p>}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600 shrink-0" />
              <CountryFlag country={offer?.origin_country} />
              <span className="text-sm font-semibold text-foreground">
                {offer?.origin_city || "—"}
              </span>
            </div>
            <p className="mt-1 pl-6 text-xs text-muted-foreground">
              {[offer?.origin_postal_code, offer?.origin_country].filter(Boolean).join(", ")}
            </p>
            <p className="mt-2 pl-6 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> {fmtDateRange(offer?.load_date_from, offer?.load_date_to)}
            </p>
          </div>
          <ArrowRight className="mt-1 h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-green-600 shrink-0" />
              <CountryFlag country={offer?.dest_country} />
              <span className="text-sm font-semibold text-foreground">
                {offer?.dest_city || "—"}
              </span>
            </div>
            <p className="mt-1 pl-6 text-xs text-muted-foreground">
              {[offer?.dest_postal_code, offer?.dest_country].filter(Boolean).join(", ")}
            </p>
            <p className="mt-2 pl-6 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> {fmtDateRange(offer?.unload_date_from, offer?.unload_date_to)}
            </p>
          </div>
        </div>
      </section>

      {/* Cargo + pricing */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Package className="h-4 w-4 text-muted-foreground" /> Cargo
          </p>
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="Vehicle" value={offer?.vehicle_type} />
            <Row label="Body type" value={offer?.body_type} />
            <Row label="Weight" value={offer?.weight_kg ? `${offer.weight_kg.toLocaleString()} kg` : null} />
            <Row label="LDM" value={offer?.ldm ? `${offer.ldm} m` : null} />
            <Row label="Pallets" value={offer?.pallet_count} />
            <Row label="ADR" value={offer?.adr_class} />
          </dl>
          {offer?.goods_description && (
            <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
              {offer.goods_description}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Banknote className="h-4 w-4 text-muted-foreground" /> Pricing
          </p>
          {offer?.pricing_mode === "fixed" && offer?.price_amount != null ? (
            <p className="text-2xl font-bold text-foreground">
              {fmtCurrency(offer.price_amount, offer.currency)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Open to quotes — submit your price below.</p>
          )}
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <Row
              label="Payment terms"
              value={offer?.payment_terms_days ? `${offer.payment_terms_days} days` : null}
            />
            <Row label="Truck/Vehicle" value={offer?.vehicle_type} />
          </dl>
          {offer?.expires_at && (
            <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Offer valid until {fmtDate(offer.expires_at)}
            </p>
          )}
        </div>
      </section>

      {/* Respond — locked once the dispatcher has made a final decision */}
      {recipient?.dispatcherDecision ? (
        <LockedResponseNotice
          decision={recipient.dispatcherDecision}
          isAwarded={recipient.isAwarded}
        />
      ) : (
        <ResponsePanel
          token={token}
          pin={pin}
          carrierAccountId={getStoredCarrierSession()?.id ?? null}
          recipient={recipient!}
          defaultCurrency={offer?.currency || "EUR"}
          onUpdated={(r) => setRecipient(r)}
        />
      )}

      {/* Chat */}
      {conversationId && (
        <PortalChat
          token={token}
          pin={pin}
          carrierAccountId={getStoredCarrierSession()?.id ?? null}
          initialMessages={messages}
        />
      )}

      {/* App promo — only on the standalone public page */}
      {!embedded && <AppPromo />}

      {!embedded && (
        <p className="pb-8 text-center text-xs text-muted-foreground">
          Powered by BNG Tracking · Secure carrier portal
        </p>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div>
        <div className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Back to offers"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Freight offer</p>
              <h1 className="text-base font-semibold text-foreground truncate">{offer?.reference}</h1>
            </div>
            {company?.company_name && (
              <div className="text-right min-w-0">
                <p className="text-xs text-muted-foreground">From</p>
                <p className="text-sm font-medium text-foreground truncate">{company.company_name}</p>
              </div>
            )}
          </div>
        </div>
        {body}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Freight offer</p>
            <h1 className="text-lg font-semibold text-foreground">{offer?.reference}</h1>
          </div>
          {company?.company_name && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">From</p>
              <p className="text-sm font-medium text-foreground">{company.company_name}</p>
            </div>
          )}
        </div>
      </header>
      {body}
    </main>
  );
}

function BackButton({ onBack, className = "" }: { onBack: () => void; className?: string }) {
  return (
    <button
      onClick={onBack}
      className={`flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      <ArrowLeft className="h-4 w-4" /> Back to offers
    </button>
  );
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground text-right">{value}</dd>
    </div>
  );
}

function ResponseSummary({
  recipient,
  companyName,
}: {
  recipient: RecipientState;
  companyName: string | null;
}) {
  const who = companyName || "The dispatcher";

  // The dispatcher's decision always takes precedence over the carrier's own
  // response, since it is the latest, authoritative state of the offer.
  if (recipient.isAwarded) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-green-500/40 bg-green-500/10 p-4 text-green-700 dark:text-green-300">
        <Trophy className="h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">You won this offer!</p>
          <p className="text-xs opacity-80">
            {who} awarded the load to you and will follow up with the transport order. Use the chat
            below if you have questions.
          </p>
        </div>
      </div>
    );
  }

  if (recipient.dispatcherDecision === "declined") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-red-700 dark:text-red-300">
        <XCircle className="h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">
            {recipient.offerAwarded ? "This offer went to another carrier" : "Your response was declined"}
          </p>
          <p className="text-xs opacity-80">
            {recipient.offerAwarded
              ? `${who} awarded this load to another carrier. Thanks for quoting — you can still chat with the dispatcher below.`
              : `${who} declined your response for this load. You can still chat with the dispatcher below.`}
          </p>
        </div>
      </div>
    );
  }

  // No dispatcher decision yet → reflect the carrier's own response.
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    interested: {
      label: "You marked this offer as interested",
      cls: "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300",
      icon: <ThumbsUp className="h-5 w-5" />,
    },
    quoted: {
      label: `You submitted a quote of ${fmtCurrency(recipient.quoteAmount, recipient.quoteCurrency || "EUR")}`,
      cls: "border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-300",
      icon: <CheckCircle2 className="h-5 w-5" />,
    },
    declined: {
      label: "You declined this offer",
      cls: "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300",
      icon: <XCircle className="h-5 w-5" />,
    },
  };
  const cfg = map[recipient.response || ""];
  if (!cfg) return null;
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-4 ${cfg.cls}`}>
      {cfg.icon}
      <div>
        <p className="text-sm font-medium">{cfg.label}</p>
        <p className="text-xs opacity-80">You can update your response below or chat with the dispatcher.</p>
      </div>
    </div>
  );
}

function LockedResponseNotice({
  decision,
  isAwarded,
}: {
  decision: "accepted" | "declined";
  isAwarded: boolean;
}) {
  const awarded = decision === "accepted" || isAwarded;
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Response closed</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        {awarded
          ? "This offer has been awarded to you, so responses are now locked. The dispatcher will share the transport order shortly."
          : "The dispatcher has finalized this offer, so responses are now locked. If this changes, they can re-open it and you'll be able to respond again."}
      </p>
    </section>
  );
}

function ResponsePanel({
  token,
  pin,
  carrierAccountId,
  recipient,
  defaultCurrency,
  onUpdated,
}: {
  token: string;
  pin: string;
  carrierAccountId: string | null;
  recipient: RecipientState;
  defaultCurrency: string;
  onUpdated: (r: RecipientState) => void;
}) {
  const [showQuote, setShowQuote] = useState(recipient.response === "quoted");
  const [amount, setAmount] = useState(recipient.quoteAmount != null ? String(recipient.quoteAmount) : "");
  const [currency, setCurrency] = useState(recipient.quoteCurrency || defaultCurrency);
  const [message, setMessage] = useState(recipient.quoteMessage || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (response: "interested" | "quoted" | "declined") => {
    setBusy(response);
    setError(null);
    try {
      const res = await fetch(`/api/exchange/portal/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          carrierAccountId,
          response,
          quoteAmount: response === "quoted" ? amount : null,
          currency,
          message: response === "quoted" ? message : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "invalid_quote"
            ? "Please enter a valid quote amount."
            : "Could not save your response. Please try again."
        );
        setBusy(null);
        return;
      }
      onUpdated({
        ...recipient,
        response,
        quoteAmount: response === "quoted" ? Number(amount) : recipient.quoteAmount,
        quoteCurrency: currency,
        quoteMessage: response === "quoted" ? message : recipient.quoteMessage,
        respondedAt: new Date().toISOString(),
      });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <p className="text-sm font-semibold text-foreground">Your response</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Let the dispatcher know if you can take this load.
      </p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          onClick={() => submit("interested")}
          disabled={!!busy}
          className="flex items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-500/10 disabled:opacity-50 dark:text-blue-300"
        >
          {busy === "interested" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
          Interested
        </button>
        <button
          onClick={() => setShowQuote((v) => !v)}
          disabled={!!busy}
          className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            showQuote
              ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"
              : "border-green-500/30 bg-green-500/5 text-green-700 hover:bg-green-500/10 dark:text-green-300"
          }`}
        >
          <Banknote className="h-4 w-4" />
          Send a quote
        </button>
        <button
          onClick={() => submit("declined")}
          disabled={!!busy}
          className="flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-300"
        >
          {busy === "declined" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Decline
        </button>
      </div>

      {showQuote && (
        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Your price</label>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0.00"
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500/40"
              />
            </div>
            <div className="w-24">
              <label className="text-xs font-medium text-muted-foreground">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500/40"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="RON">RON</option>
                <option value="PLN">PLN</option>
              </select>
            </div>
          </div>
          <label className="mt-3 block text-xs font-medium text-muted-foreground">Message (optional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="Availability, equipment, notes…"
            className="mt-1 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500/40"
          />
          <button
            onClick={() => submit("quoted")}
            disabled={!!busy || !amount}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy === "quoted" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Submit quote
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
