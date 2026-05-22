"use client";

/**
 * EmailRecipientInput
 *
 * Reusable chip-style multi-email input with autocomplete suggestions
 * powered by `lib/email-recipients`. Drop it into ANY dialog that
 * needs to collect one-or-more email recipients (Send to Carrier,
 * Send Docs to Customer, Share Tracking, Request CMR/POD, …).
 *
 * Behavior summary:
 *   - Chips are committed on Enter / comma / semicolon / space / Tab.
 *   - Backspace on an empty input removes the last chip.
 *   - Paste of a comma/semicolon/whitespace-separated list bulk-adds.
 *   - As the user types (debounced 150ms) a dropdown surfaces
 *     suggestions merged from BP contacts + per-user history.
 *   - Each suggestion row shows name + email + a small source badge
 *     ("Contact" / "Primary" / "History").
 *   - If the operator typed a brand new email AND a businessPartnerId
 *     was provided, a "Save as contact for <BP>" affordance appears
 *     at the bottom of the dropdown so they can promote the ad-hoc
 *     address into a proper BP contact in one click.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mail, X, Plus, User, Star } from "lucide-react";
import {
  searchEmailRecipients,
  isValidEmail,
  quickCreateBpContact,
  type RecipientSuggestion,
} from "@/lib/email-recipients";

export interface EmailRecipientInputProps {
  /** Current chip list. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Required to query autocomplete sources. */
  adminId: string;
  /** Current operator id — drives the per-user history slice. */
  userId: string | null;
  /**
   * Optional BP context. When set, BP contacts of THIS partner
   * are boosted in the dropdown and the "Save as contact" inline
   * action becomes available for unsaved typed emails.
   */
  businessPartnerId?: string | null;
  /** Friendly name shown inside the "Save as contact for X" CTA. */
  businessPartnerName?: string | null;
  placeholder?: string;
  /** Soft-error message displayed beneath the chip box. */
  errorText?: string;
  /** Optional className applied to the chip wrapper. */
  className?: string;
  /** Disable the input entirely (e.g. while a send is in flight). */
  disabled?: boolean;
}

// Source badge — small visual cue showing where a suggestion came from.
function SourceBadge({ s }: { s: RecipientSuggestion }) {
  if (s.source === "bp_contact") {
    return s.is_primary ? (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded bg-primary/15 text-primary border border-primary/30">
        <Star className="h-2.5 w-2.5" /> Primary
      </span>
    ) : (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded bg-secondary/40 text-secondary-foreground border border-border/50">
        <User className="h-2.5 w-2.5" /> Contact
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded bg-muted text-muted-foreground border border-border/50">
      Recent
    </span>
  );
}

export function EmailRecipientInput({
  value,
  onChange,
  adminId,
  userId,
  businessPartnerId,
  businessPartnerName,
  placeholder,
  errorText,
  className,
  disabled,
}: EmailRecipientInputProps) {
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string>("");
  const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [savingContact, setSavingContact] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Lowercased view of the current chip list — used for dedupe on
  // both keyboard-commit and suggestion-click paths.
  const lowerValue = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value]);

  // ── Suggestion fetching ─────────────────────────────────────────
  // Debounce input so we don't flood Supabase. A 150ms wait is
  // imperceptible to a human typing but eliminates 90%+ of the
  // wasted round-trips during normal typing speed.
  useEffect(() => {
    if (!adminId) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const rows = await searchEmailRecipients({
        adminId,
        userId,
        query: draft,
        businessPartnerId: businessPartnerId ?? null,
        limit: 8,
      });
      if (cancelled) return;
      // Hide anything already chipped, otherwise the dropdown shows
      // recipients the user has clearly already added.
      const filtered = rows.filter((r) => !lowerValue.has(r.email.toLowerCase()));
      setSuggestions(filtered);
      setHighlight(0);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draft, adminId, userId, businessPartnerId, lowerValue]);

  // ── Outside-click closes the dropdown ───────────────────────────
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // ── Chip helpers ────────────────────────────────────────────────
  const pushRecipients = useCallback(
    (raw: string) => {
      const tokens = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
      if (tokens.length === 0) return;
      const valid: string[] = [];
      const invalid: string[] = [];
      tokens.forEach((t) => (isValidEmail(t) ? valid.push(t) : invalid.push(t)));
      if (valid.length > 0) {
        const next = [...value];
        const lower = new Set(lowerValue);
        valid.forEach((v) => {
          if (!lower.has(v.toLowerCase())) {
            next.push(v);
            lower.add(v.toLowerCase());
          }
        });
        onChange(next);
      }
      setDraft(invalid.join(", "));
      setDraftError(invalid.length > 0 ? `Invalid: ${invalid.join(", ")}` : "");
    },
    [value, lowerValue, onChange]
  );

  const removeAt = (email: string) => {
    onChange(value.filter((v) => v !== email));
  };

  const acceptSuggestion = (s: RecipientSuggestion) => {
    if (lowerValue.has(s.email.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, s.email]);
    setDraft("");
    setDraftError("");
    // Keep dropdown open so the user can quickly add another from
    // the SAME BP — common workflow for ops/dispatch teams.
    setSuggestions((prev) => prev.filter((p) => p.email !== s.email));
    inputRef.current?.focus();
  };

  const handleSaveAsContact = async () => {
    if (!businessPartnerId || !isValidEmail(draft)) return;
    setSavingContact(true);
    try {
      const created = await quickCreateBpContact({
        adminId,
        businessPartnerId,
        email: draft.trim(),
      });
      // Whether or not the insert succeeded we still want the typed
      // email to land in the chip list — operator intent was clear.
      if (created) {
        onChange([...value, draft.trim()]);
        setDraft("");
        setDraftError("");
      } else {
        pushRecipients(draft);
      }
    } finally {
      setSavingContact(false);
    }
  };

  // ── Keyboard ────────────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Arrow keys navigate the dropdown when it's open and has rows.
    if (open && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        // Prefer the highlighted suggestion over a raw commit if one
        // is genuinely selected. We treat highlight=0 as "no explicit
        // selection yet" UNLESS the user has used arrow keys.
        const s = suggestions[highlight];
        if (s && (e.key === "Tab" || draft.trim().length > 0)) {
          e.preventDefault();
          acceptSuggestion(s);
          return;
        }
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
    }
    if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") {
      if (draft.trim()) {
        e.preventDefault();
        pushRecipients(draft);
      }
    } else if (e.key === " ") {
      // Space commits ONLY when the draft already looks like an email,
      // so the user can keep typing free-form before that.
      if (isValidEmail(draft)) {
        e.preventDefault();
        pushRecipients(draft);
      }
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      removeAt(value[value.length - 1]);
    }
  };

  // Whether to show the "Save as new contact" CTA at the bottom of
  // the dropdown. Only meaningful when (a) we have a BP context,
  // (b) what the user typed is a valid email, (c) that email isn't
  // already a saved contact in `suggestions`.
  const canSaveAsContact = useMemo(() => {
    if (!businessPartnerId) return false;
    const d = draft.trim();
    if (!isValidEmail(d)) return false;
    const lower = d.toLowerCase();
    if (lowerValue.has(lower)) return false;
    return !suggestions.some(
      (s) => s.source === "bp_contact" && s.email.toLowerCase() === lower
    );
  }, [businessPartnerId, draft, lowerValue, suggestions]);

  const dropdownVisible = open && (suggestions.length > 0 || canSaveAsContact);

  return (
    <div ref={wrapperRef} className={"relative " + (className || "")}>
      <div
        className={
          "min-h-8 rounded-md border border-border/50 bg-card/50 px-1.5 py-1 flex flex-wrap items-center gap-1 transition-colors " +
          (disabled
            ? "opacity-60 pointer-events-none"
            : "focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/30")
        }
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        {value.map((email) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-[11px] text-primary font-medium max-w-full"
          >
            <span className="truncate">{email}</span>
            <button
              type="button"
              aria-label={`Remove ${email}`}
              className="rounded-full hover:bg-primary/20 p-0.5 flex-shrink-0"
              onClick={(ev) => {
                ev.stopPropagation();
                removeAt(email);
              }}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setDraft(e.target.value);
            if (draftError) setDraftError("");
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Auto-commit a pending valid email on blur, mirroring
            // Gmail / Outlook compose behavior. We DON'T commit
            // invalid drafts — that would silently swallow typos.
            if (draft.trim() && isValidEmail(draft)) pushRecipients(draft);
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text && /[,;\s]/.test(text)) {
              e.preventDefault();
              pushRecipients(text);
            }
          }}
          placeholder={placeholder || (value.length === 0 ? "name@example.com" : "add another...")}
          className="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-xs text-foreground placeholder:text-muted-foreground/60 px-1 py-0.5"
          disabled={disabled}
        />
      </div>

      {(draftError || errorText) && (
        <p className="text-[10px] text-red-400 mt-1">{draftError || errorText}</p>
      )}

      {dropdownVisible && (
        <div
          className="absolute left-0 right-0 z-50 mt-1 max-h-[260px] overflow-auto rounded-md border border-border/60 bg-popover shadow-lg ring-1 ring-black/5"
          onMouseDown={(e) => {
            // Prevent the input's onBlur from firing before our
            // click handler — otherwise the dropdown vanishes
            // mid-click.
            e.preventDefault();
          }}
        >
          {suggestions.length > 0 ? (
            <ul role="listbox" className="py-1">
              {suggestions.map((s, idx) => (
                <li
                  key={s.key}
                  role="option"
                  aria-selected={idx === highlight}
                  className={
                    "flex items-center gap-2 px-2.5 py-1.5 cursor-pointer text-xs " +
                    (idx === highlight
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/60")
                  }
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => acceptSuggestion(s)}
                >
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      {s.name && (
                        <span className="font-medium truncate">{s.name}</span>
                      )}
                      <span className="truncate text-muted-foreground">
                        {s.email}
                      </span>
                    </div>
                    {s.position && (
                      <div className="text-[10px] text-muted-foreground/80 truncate">
                        {s.position}
                      </div>
                    )}
                  </div>
                  <SourceBadge s={s} />
                </li>
              ))}
            </ul>
          ) : null}

          {canSaveAsContact && (
            <button
              type="button"
              disabled={savingContact}
              onClick={handleSaveAsContact}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-xs border-t border-border/40 hover:bg-accent/60 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span className="truncate">
                {savingContact ? "Saving..." : "Save "}
                <span className="font-medium">{draft.trim()}</span>
                {businessPartnerName ? (
                  <>
                    {" "}as contact for{" "}
                    <span className="font-medium">{businessPartnerName}</span>
                  </>
                ) : (
                  <> as new contact</>
                )}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
