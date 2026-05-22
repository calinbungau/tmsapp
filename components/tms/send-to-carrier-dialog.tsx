"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDown, Send, Printer, Globe, LayoutTemplate, Loader2, CheckCircle2, Link2, Copy, Check, Mail } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { EmailRecipientInput } from "@/components/tms/email-recipient-input";
import { recordEmailRecipients } from "@/lib/email-recipients";
import {
  fetchOrderData, fetchCompanyProfile, fetchOrderTemplates,
  renderOrderHtml, parseTemplate, openPrintWindow,
  PRINT_OVERRIDE_CSS,
  SUPPORTED_LANGUAGES, type OrderTemplate,
} from "@/lib/pdf/generate-forwarding-order";

interface SendToCarrierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  adminId: string;
  adminName?: string;
  onSent?: () => void;
}

// PRINT_OVERRIDE_CSS is imported from lib/pdf/generate-forwarding-order
// so the email-attach path, the in-dialog print path, and the standalone
// openPrintWindow path all share the EXACT same A4-locked CSS. Earlier
// each path had its own local copy which drifted out of sync — the
// download looked one way, the emailed PDF another.

// Render the on-screen preview into a multi-page A4 PDF using the
// browser's native print pipeline. We DO NOT use html2canvas any more —
// it always introduced visual drift on the antet gradient.
//
// Flow:
//   1. inject PRINT_OVERRIDE_CSS into the preview iframe's <head>
//   2. focus the iframe
//   3. call contentWindow.print() — the browser opens its native print
//      dialog where the operator can pick "Save as PDF"
//
// Trade-off: the user sees the OS print dialog instead of getting an
// instant file download. That's the price of pixel-perfect output.
function printPreviewIframe(iframe: HTMLIFrameElement | null): boolean {
  if (!iframe?.contentWindow || !iframe.contentDocument) return false;
  const doc = iframe.contentDocument;
  // Remove any previously-injected override (so re-printing doesn't
  // stack multiple <style> tags).
  doc.querySelectorAll("style[data-bng-print]").forEach((el) => el.remove());
  const style = doc.createElement("style");
  style.setAttribute("data-bng-print", "true");
  style.textContent = PRINT_OVERRIDE_CSS;
  doc.head.appendChild(style);
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  return true;
}

// Render the on-screen preview into a multi-page A4 PDF (base64).
//
// CRITICAL: we use `html-to-image` (NOT `html2canvas`) because
// html-to-image serializes the DOM into an SVG <foreignObject> and
// asks the browser itself to rasterize it. That means the browser's
// own CSS engine — the SAME engine that paints the preview iframe on
// screen — does the actual pixel work. Output is true 1:1 with the
// preview: gradients, box-shadows, padding, font kerning all match.
//
// html2canvas, by contrast, re-implements CSS rendering in JS and was
// the source of every "preview vs downloaded PDF looks different"
// complaint (darker antet gradient, taller header, stretched spacing).
// A4 at 96 dpi in CSS pixels. We render the capture iframe at exactly
// this size so each .page lays out as if it were on the printed sheet —
// any wider/narrower and column wrapping inside terms, tables, etc.
// would differ from what the operator saw in the preview / download.
const A4_PX_W = 794;   // 210 mm × 96 / 25.4
const A4_PX_H = 1123;  // 297 mm × 96 / 25.4

async function renderPreviewToPdfBase64(
  previewHtml: string,
  _liveIframe?: HTMLIFrameElement | null, // kept for backwards-compat signature
): Promise<string> {
  if (!previewHtml) throw new Error("Nothing to render");

  const [{ default: jsPDF }, htmlToImage] = await Promise.all([
    import("jspdf"),
    import("html-to-image"),
  ]);

  // Build a self-contained HTML document with PRINT_OVERRIDE_CSS baked
  // into the <head> from the start. Previously we tried to retrofit the
  // print CSS onto the live preview iframe — but that iframe's width is
  // controlled by the dialog (variable, depending on screen), so the
  // .page divs would first lay out at the dialog width and then re-flow
  // to A4 once we injected the CSS. html-to-image's foreignObject
  // raster could race that re-flow, producing the visibly-different
  // emailed PDF the operator pointed out.
  //
  // With a dedicated off-screen iframe at exactly A4 size (794×1123 px)
  // and the print CSS already in the document head, there's no re-flow
  // and no race — the .page divs lay out once at their final A4
  // dimensions, identical to what openPrintWindow produces.
  const styleTag = `<style data-bng-print="capture">${PRINT_OVERRIDE_CSS}</style>`;
  const captureHtml = previewHtml.includes("</head>")
    ? previewHtml.replace("</head>", `${styleTag}</head>`)
    : previewHtml.replace(/<html[^>]*>/i, (m) => `${m}<head>${styleTag}</head>`);

  // Create an offscreen iframe sized to A4. Position it off-screen
  // rather than display:none — display:none iframes don't lay out at
  // all, and html-to-image's foreignObject capture would produce an
  // empty image. left:-99999px keeps it out of the user's view while
  // still being part of the layout tree.
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;left:-99999px;top:0;width:${A4_PX_W}px;height:${A4_PX_H}px;border:0;background:white;`;
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Capture iframe contentDocument unavailable");
    doc.open();
    doc.write(captureHtml);
    doc.close();

    // Wait for the iframe's load event so all stylesheets, images, and
    // fonts referenced by the rendered HTML are fully ready. Without
    // this the captured image often shows fallback fonts and missing
    // logo/stamp images.
    await new Promise<void>((resolve) => {
      if (doc.readyState === "complete") return resolve();
      iframe.addEventListener("load", () => resolve(), { once: true });
    });
    try {
      // @ts-ignore — `fonts` widely supported, missing in older lib.dom
      await doc.fonts?.ready;
    } catch { /* some browsers don't expose document.fonts */ }
    // Two RAFs to ensure layout has fully settled before measurement.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const pageDivs = Array.from(doc.querySelectorAll<HTMLElement>(".page"));
    if (pageDivs.length === 0) {
      throw new Error("No .page elements found in preview HTML");
    }

    // PDF: every page is A4 portrait because PRINT_OVERRIDE_CSS hard-
    // locks each .page to 210×297mm. No letterboxing math needed —
    // each captured PNG fills the sheet edge-to-edge.
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < pageDivs.length; i++) {
      const el = pageDivs[i];
      const dataUrl = await htmlToImage.toPng(el, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff",
        // Hard-pin the capture dimensions to A4 pixels so the resulting
        // bitmap has exactly A4 aspect ratio. If we relied on the
        // element's bounding rect, sub-pixel rounding could shift the
        // ratio by a fraction of a percent which then shows up as
        // visible misalignment when stretched onto the PDF page.
        width: A4_PX_W,
        height: A4_PX_H,
        canvasWidth: A4_PX_W * 2,
        canvasHeight: A4_PX_H * 2,
      });

      if (i > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(dataUrl, "PNG", 0, 0, pdfW, pdfH, undefined, "FAST");
    }

    const dataUri = pdf.output("datauristring");
    return dataUri.substring(dataUri.indexOf(",") + 1);
  } finally {
    // Always clean up the capture iframe, even on errors, to avoid
    // leaking DOM nodes if the user opens/closes the dialog many times.
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }
}

export function SendToCarrierDialog({ open, onOpenChange, orderId, adminId, adminName, onSent }: SendToCarrierDialogProps) {
  const [loading, setLoading] = useState(true);
  const [orderData, setOrderData] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [templates, setTemplates] = useState<OrderTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("default");
  // Default to Romanian — this app is operated by a Romanian forwarder and
  // virtually every Comandă de Transport is issued in RO. The user can still
  // switch via the Language dropdown if they need EN/DE/HU for a foreign carrier.
  const [lang, setLang] = useState("ro");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [uploadLink, setUploadLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [sendError, setSendError] = useState("");
  // Recipient list — chip-style input. Seeded once per dialog-open from
  // the carrier's `email` field on the order (if it exists), but the
  // user can add more recipients manually or remove the default. This
  // also lets the operator send to carriers that don't have an email
  // saved in their profile yet, by typing one in by hand.
  const [recipients, setRecipients] = useState<string[]>([]);
  // The chip + autocomplete UI lives entirely inside
  // <EmailRecipientInput />, so we no longer need draft-state here.
  // We only keep `userId` for the per-user history slice.
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem("admin_session") : null;
      if (stored) setUserId(JSON.parse(stored)?.id || null);
    } catch { /* localStorage may be unavailable in SSR/iframe contexts */ }
  }, []);
  // Ref to the live on-screen preview iframe. Passing this directly to
  // the PDF renderer gives byte-for-byte parity between what the user
  // sees and what carriers receive (no off-screen reflow, no font
  // fallback drift, no JPEG color shift on the antet gradient).
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Fetch data when dialog opens
  const loadData = useCallback(async () => {
    if (!open || !orderId) return;
    setLoading(true);
    setSent(false);
    setUploadLink("");
    setSendError("");
    try {
      const [od, cp, tmpls] = await Promise.all([
        fetchOrderData(orderId),
        fetchCompanyProfile(adminId),
        fetchOrderTemplates(adminId),
      ]);
      setOrderData(od);
      setCompany(cp);
      setTemplates(tmpls);
      const ref = od?.order?.reference_number || "";
      // Localized default subject — matches the server fallback so what
      // the user sees in the Subject field is what carriers receive.
      if (ref && !emailSubject) {
        const subj: Record<string, string> = {
          en: `Order ${ref} - Confirmation Required`,
          ro: `Comanda ${ref} - Confirmare necesară`,
          de: `Auftrag ${ref} - Bestätigung erforderlich`,
          hu: `Megrendelés ${ref} - Visszaigazolás szükséges`,
        };
        setEmailSubject(subj[lang] || subj.en);
      }
      if (tmpls.length > 0) {
        const def = tmpls.find(t => t.is_default);
        setSelectedTemplateId(def ? def.id : "default");
      }
      // Seed the recipient chips from the carrier's saved email, but
      // only if we don't already have something in the list (avoids
      // wiping user-typed additions if the dialog re-opens). Splits on
      // common separators in case the field contains "a@x; b@y".
      const raw: string = (od?.order?.carrier?.email || "").toString();
      const seeded: string[] = raw
        .split(/[,;\s]+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
      setRecipients(seeded);
    } catch (e) {
      console.error("[v0] Failed to load order data:", e);
    }
    setLoading(false);
  }, [open, orderId, adminId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Re-seed the subject line when the operator changes the Language
  // dropdown — but only if the current value matches one of our
  // generated defaults. If the user has typed a custom subject (e.g.
  // "Re-routed via Vienna"), we leave it alone so a language switch
  // never wipes their wording.
  useEffect(() => {
    const ref = orderData?.order?.reference_number;
    if (!ref) return;
    const defaults: Record<string, string> = {
      en: `Order ${ref} - Confirmation Required`,
      ro: `Comanda ${ref} - Confirmare necesară`,
      de: `Auftrag ${ref} - Bestätigung erforderlich`,
      hu: `Megrendelés ${ref} - Visszaigazolás szükséges`,
    };
    const isDefault = Object.values(defaults).includes(emailSubject);
    if (isDefault) setEmailSubject(defaults[lang] || defaults.en);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, orderData?.order?.reference_number]);

  // Get selected template data
  const currentTemplate = useMemo(() => {
    if (selectedTemplateId === "default" || !templates.length) return null;
    const found = templates.find(t => t.id === selectedTemplateId);
    return found ? parseTemplate(found.html_template) : null;
  }, [selectedTemplateId, templates]);

  // Generate HTML for preview
  const previewHtml = useMemo(() => {
    if (!orderData?.order || !company) return "";
    return renderOrderHtml({ order: orderData.order, stops: orderData.stops, company }, currentTemplate, lang);
  }, [orderData, company, currentTemplate, lang]);

  // Preview iframe content. Strips the toolbar, kills its top padding,
  // forces a white background, and rewrites `.page` so it fills the
  // iframe cleanly without the print-grade drop shadow and 20mm outer
  // margins. This is the compact look the operator has been using since
  // day one — and crucially, it's now also the layout the PDF
  // rasterizer captures from, so what's on screen is what gets
  // downloaded / emailed.
  const previewBodyHtml = useMemo(() => {
    if (!previewHtml) return "";
  return previewHtml
  .replace(/<div class="no-print"[\s\S]*?<\/div>\s*<\/div>/, "")
  .replace('padding-top:50px;', 'padding-top:0;')
  .replace(/background:\s*#f3f4f6;/g, 'background:white;')
  // `overflow:hidden` is critical: it clips any child that would extend
  // past the .page box (long table cell, wide image). Without it,
  // html-to-image silently includes that overflow in the captured PNG,
  // producing extra whitespace baked into one edge — that's what was
  // shifting the rendered document toward the left in the downloaded
  // PDF even though our centering math was symmetric.
  .replace(/\.page\s*\{[^}]*\}/g, '.page { margin: 0 auto; box-shadow: none; overflow: hidden; }')
  .replace(/width:595px;/g, 'width:100%;max-width:595px;')
  .replace(/width:842px;/g, 'width:100%;max-width:842px;')
  .replace(/margin:\s*20px auto;/g, 'margin:0 auto;');
  }, [previewHtml]);

  // Open the order in a new browser tab/window prepared for printing.
  // The browser's own print pipeline produces the PDF — meaning the
  // exact same rendering engine that paints the preview also paints
  // the saved file. This is the only path that gives true 1:1 fidelity:
  // no rasterization library in the middle, no gradient saturation
  // drift, no padding metric approximation. The operator hits
  // Ctrl+P / Cmd+P (or the page auto-prompts), picks "Save as PDF",
  // and gets a file that looks identical to the dialog preview.
  //
  // Filename suggestion: document.title becomes the browser's default
  // filename in the Save dialog, so we set it to "VLR-1495 - CARRIER".
  const handleDownload = () => {
    if (!previewHtml) return;
    const ref = orderData?.order?.reference_number || "Order";
    const cName = (orderData?.order?.carrier?.name || "")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const title = cName ? `${ref} - ${cName}` : ref;
    openPrintWindow(previewHtml, title);
  };

  // Log activity to order_activity_log
  const logActivity = async (action: string, details: any) => {
    const supabase = createClient();
    await supabase.from("order_activity_log").insert({
      order_id: orderId,
      action,
      details,
      performed_by_type: "admin",
      performed_by_id: adminId,
    });
  };

  // Send to carrier via email with upload link
  const handleSendToCarrier = async () => {
    setSending(true);
    setSendError("");
    try {
      const cName = orderData?.order?.carrier?.name || "Unknown";

      // The chip control commits drafts on blur / Enter, so by the
      // time we're here `recipients` is the authoritative list.
      const finalRecipients = recipients;
      if (finalRecipients.length === 0) {
        setSendError("Add at least one email address before sending.");
        setSending(false);
        return;
      }

      // Render the order preview into a real PDF (base64 string) before
      // sending — carriers expect a .pdf attachment, not the legacy
      // .html document. Generation runs in the browser via html2canvas +
      // jsPDF off the same DOM that powers the on-screen preview, so the
      // attachment is pixel-identical to what the operator sees. Failure
      // is non-fatal: we still send the link-only email so the carrier
      // can complete the upload.
      let pdfBase64: string | null = null;
      try {
        // Same live-iframe capture path as the Download button so the
        // emailed attachment is byte-identical to what the user sees.
        pdfBase64 = await renderPreviewToPdfBase64(previewHtml, previewIframeRef.current);
      } catch (e) {
        console.error("[v0] PDF generation failed, falling back to link-only email:", e);
      }

      const refForFilename = orderData?.order?.reference_number || "Order";
      const carrierForFilename = (orderData?.order?.carrier?.name || "")
        .replace(/[\\/:*?"<>|]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const pdfFilename = carrierForFilename
        ? `${refForFilename} - ${carrierForFilename}.pdf`
        : `${refForFilename}.pdf`;

      const res = await fetch("/api/orders/send-to-carrier", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-id": adminId,
        },
        body: JSON.stringify({
          orderId,
          // Send the full array; the API also accepts the legacy single
          // `carrierEmail` string for backward compatibility.
          carrierEmails: finalRecipients,
          carrierEmail: finalRecipients[0],
          carrierName: cName,
          subject: emailSubject,
          message: emailMessage,
          // PDF generated client-side; if generation failed we still send
          // the HTML so the API can fall back to an .html attachment.
          orderPdfBase64: pdfBase64,
          orderPdfFilename: pdfFilename,
          orderHtml: pdfBase64 ? null : previewHtml,
          lang,
        }),
      });

      let data: any;
      const text = await res.text();
      try { data = JSON.parse(text); } catch { data = { error: text || `Server error (${res.status})` }; }
      if (!res.ok) {
        setSendError(data.error || `Failed to send email (${res.status})`);
        setSending(false);
        return;
      }

      setUploadLink(data.uploadLink || "");
      setSent(true);
      // Best-effort: stamp these recipients into the per-user
      // autocomplete history so they surface as suggestions next
      // time. Linked to the carrier BP when known. Never blocks the
      // success path even if recording fails.
      void recordEmailRecipients({
        adminId,
        userId,
        emails: finalRecipients,
        businessPartnerId: orderData?.order?.carrier?.id ?? null,
        context: "send_to_carrier",
      });
      onSent?.();
    } catch (e: any) {
      setSendError(e.message || "Failed to send to carrier");
    }
    setSending(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(uploadLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const carrierName = orderData?.order?.carrier?.name;
  const carrierEmail = orderData?.order?.carrier?.email;

  const refNumber = orderData?.order?.reference_number || "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] w-[1600px] h-[92vh] flex flex-col p-0 gap-0 bg-background border-border/50">
        <DialogHeader className="px-6 py-4 border-b border-border/50 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-bold">Send Order to Carrier</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{refNumber} {carrierName ? `- ${carrierName}` : ""}</p>
            </div>
            {sent && (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Sent
              </Badge>
            )}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !orderData?.order ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Order not found. Please check if the order exists.
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Document Preview - scaled A4 */}
            <div className="flex-1 bg-muted/20 overflow-auto p-6 flex justify-center">
              <div className="w-full max-w-[900px]">
                <iframe
                  ref={previewIframeRef}
                  srcDoc={previewBodyHtml}
                  className="w-full border border-border/30 rounded-lg shadow-lg bg-white"
                  style={{ minHeight: "calc(900px * 1.414)", height: "100%" }}
                  title="Order Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>

            {/* Right: Controls Panel */}
            <div className="w-[300px] border-l border-border/50 flex flex-col shrink-0">
              {/* Carrier Info */}
              <div className="p-4 border-b border-border/30 space-y-3">
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Carrier</label>
                  <div className="text-sm font-semibold mt-0.5">{carrierName || <span className="text-red-400">No carrier assigned</span>}</div>
                  {!carrierEmail && carrierName && (
                    <div className="text-[10px] text-amber-400/90 mt-0.5">No email saved in profile — add one below</div>
                  )}
                </div>
              </div>

              {/* Template Selection */}
              <div className="p-4 border-b border-border/30 space-y-3">
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <LayoutTemplate className="h-3 w-3" /> Template
                  </label>
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger className="mt-1.5 h-8 text-xs bg-card/50 border-border/50">
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Generic fallback only shown when there's no real
                          template (fresh install with no seed). When the
                          admin has at least one template we always pick
                          the one flagged is_default — the badge below
                          confirms which one that is. */}
                      {templates.length === 0 && (
                        <SelectItem value="default">Default Template</SelectItem>
                      )}
                      {templates.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="inline-flex items-center gap-2">
                            <span>{t.name}</span>
                            {t.is_default && (
                              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-px rounded bg-primary/15 text-primary border border-primary/30">
                                Default
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Globe className="h-3 w-3" /> Language
                  </label>
                  <Select value={lang} onValueChange={setLang}>
                    <SelectTrigger className="mt-1.5 h-8 text-xs bg-card/50 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_LANGUAGES.map(l => (
                        <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Email fields */}
              {!sent && (
                <div className="p-4 border-b border-border/30 space-y-3">
                  {/* Recipients — pre-filled from the carrier's saved
                      email if any, but the operator can add more,
                      remove them, paste a list, or pick from
                      autocomplete suggestions that merge this
                      carrier's BP contacts with the user's recent
                      send history. Typing a brand-new email also
                      surfaces a "Save as contact for <Carrier>"
                      affordance in the dropdown. */}
                  <div>
                    <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Recipients
                      {recipients.length > 0 && (
                        <span className="text-muted-foreground/70 normal-case tracking-normal font-normal">
                          ({recipients.length})
                        </span>
                      )}
                    </label>
                    <div className="mt-1.5">
                      <EmailRecipientInput
                        value={recipients}
                        onChange={setRecipients}
                        adminId={adminId}
                        userId={userId}
                        businessPartnerId={orderData?.order?.carrier?.id ?? null}
                        businessPartnerName={orderData?.order?.carrier?.name ?? null}
                        placeholder={recipients.length === 0 ? "carrier@example.com" : "add another..."}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      Type to search saved contacts and recent recipients. Press Enter, comma, or Tab to add.
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Subject</label>
                    <Input
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="mt-1 h-8 text-xs bg-card/50 border-border/50"
                      placeholder="Order confirmation subject..."
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Message to Carrier</label>
                    <Textarea
                      value={emailMessage}
                      onChange={(e) => setEmailMessage(e.target.value)}
                      className="mt-1 text-xs bg-card/50 border-border/50 min-h-[60px] resize-none"
                      placeholder="Optional message included in the email..."
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="p-4 space-y-2 mt-auto">
                <Button
                  variant="outline"
                  className="w-full h-9 text-xs gap-1.5 border-border/50"
                  onClick={handleDownload}
                  disabled={!previewHtml}
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Print / Download PDF
                </Button>
                <div className="h-px bg-border/30 my-1" />

                {sendError && (
                  <p className="text-[10px] text-red-400 text-center py-1">{sendError}</p>
                )}

                <Button
                  className="w-full h-10 text-xs gap-1.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={sending || sent || !carrierName || recipients.length === 0}
                  onClick={handleSendToCarrier}
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : sent ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                  {sending
                    ? "Sending Email..."
                    : sent
                    ? "Email Sent"
                    : recipients.length > 1
                    ? `Send to ${recipients.length} recipients`
                    : "Send Order via Email"}
                </Button>
                {!carrierName && (
                  <p className="text-[10px] text-red-400 text-center">Assign a carrier before sending</p>
                )}
                {carrierName && recipients.length === 0 && (
                  <p className="text-[10px] text-amber-400 text-center">Add at least one recipient</p>
                )}

                {/* Upload link shown after sent */}
                {sent && uploadLink && (
                  <div className="mt-3 p-3 bg-green-500/5 border border-green-500/20 rounded-lg space-y-2">
                    <div className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Email sent at {new Date().toLocaleTimeString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      The carrier will receive an email with the order attached and a unique upload link to submit their signed confirmation.
                    </p>
                    <div className="flex items-center gap-1">
                      <div className="flex-1 bg-background/50 border border-border/50 rounded px-2 py-1.5 text-[10px] text-muted-foreground truncate flex items-center gap-1">
                        <Link2 className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{uploadLink}</span>
                      </div>
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0 flex-shrink-0" onClick={copyLink}>
                        {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
