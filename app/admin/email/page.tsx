"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Mail, Inbox, Send, Star, Trash2, RefreshCw, Search, Settings2,
  ChevronLeft, Paperclip, X, Loader2, Check, AlertCircle,
  Reply, ReplyAll, Forward, FileText, Package, MoreVertical, Plus,
  FolderOpen, Eye, EyeOff, Archive, Download, Stamp, PenTool, SendHorizontal, CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { RichTextEditor } from "@/components/email/rich-text-editor";
import { EmailTemplatesManager } from "@/components/email/email-templates-manager";

interface EmailMeta {
  id: string;
  message_id: string;
  uid: number;
  mailbox: string;
  subject: string;
  from_address: string;
  from_name: string;
  to_addresses: string[];
  cc_addresses: string[];
  date: string;
  snippet: string;
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
}

interface EmailFull extends EmailMeta {
  body_html: string;
  body_text: string;
  attachments: {
    filename: string;
    contentType: string;
    size: number;
    content: string;
    contentId?: string;
  }[];
}

interface EmailSettings {
  id?: string;
  email_address: string;
  display_name: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_user: string;
  imap_password: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password: string;
  signature_html: string;
  is_active: boolean;
  last_sync_at: string | null;
}

const DEFAULT_SETTINGS: EmailSettings = {
  email_address: "", display_name: "", imap_host: "", imap_port: 993, imap_secure: true,
  imap_user: "", imap_password: "", smtp_host: "", smtp_port: 587, smtp_secure: true,
  smtp_user: "", smtp_password: "", signature_html: "", is_active: true,
  last_sync_at: null,
};

const FOLDERS = [
  { key: "INBOX", label: "Inbox", icon: Inbox },
  { key: "Sent", label: "Sent", icon: Send },
  { key: "Starred", label: "Starred", icon: Star },
  { key: "Trash", label: "Trash", icon: Trash2 },
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const isThisYear = d.getFullYear() === now.getFullYear();
  if (isThisYear) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

/** Safely parse a fetch Response as JSON, handling plain-text error responses */
async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Server returned non-JSON (e.g. plain "Internal Server Error")
    return { error: text || `HTTP ${res.status}` };
  }
}

export default function EmailPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Email state
  const [folder, setFolder] = useState("INBOX");
  const [emails, setEmails] = useState<EmailMeta[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [openEmail, setOpenEmail] = useState<EmailFull | null>(null);
  const [openLoading, setOpenLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [totalEmails, setTotalEmails] = useState(0);

  // Compose
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeInReplyTo, setComposeInReplyTo] = useState("");
  const [composeReferences, setComposeReferences] = useState("");
  const [composeAttachments, setComposeAttachments] = useState<{ filename: string; content: string; contentType: string; size: number }[]>([]);
  const composeFileRef = React.useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);

  // Preview
  const [previewAttachment, setPreviewAttachment] = useState<EmailFull["attachments"][0] | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Sign & Send
  const [signing, setSigning] = useState(false);
  const [signSendTo, setSignSendTo] = useState("");
  const [signSendSubject, setSignSendSubject] = useState("");
  const [signSendBody, setSignSendBody] = useState("");
  const [companyStampUrl, setCompanyStampUrl] = useState<string | null>(null);
  const [companySignatureUrl, setCompanySignatureUrl] = useState<string | null>(null);
  // PDF rendered page images (data URLs); null = loading, empty = failed/not PDF
  const [pdfPageImages, setPdfPageImages] = useState<string[] | null>(null);
  // Placement: { x, y (%) relative to page, page (0-indexed) }
  const [stampPlacement, setStampPlacement] = useState<{ x: number; y: number; page: number } | null>(null);
  const [signaturePlacement, setSignaturePlacement] = useState<{ x: number; y: number; page: number } | null>(null);
  const [placingItem, setPlacingItem] = useState<"stamp" | "signature" | null>(null);
  // Track signed document info after sign-and-send
  const [signedInfo, setSignedInfo] = useState<{ url: string; filename: string } | null>(null);

  // Mobile
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const headers = useCallback(() => {
    return {
      "Content-Type": "application/json",
      "x-admin-id": session?.id || "",
      "x-user-id": session?.user_id || "",
    };
  }, [session]);

  // Load session
  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (stored) setSession(JSON.parse(stored));
    setLoading(false);
  }, []);

  // Load settings
  useEffect(() => {
    if (!session) return;
    fetch("/api/email/settings", { headers: headers() })
      .then((r) => safeJson(r))
      .then((d) => {
        if (d.settings) setSettings(d.settings);
        setSettingsLoaded(true);
        if (!d.settings) setShowSettings(true);
      })
      .catch(() => setSettingsLoaded(true));
  }, [session, headers]);

  // Load emails when folder changes or after sync
  const fetchEmails = useCallback(async () => {
    if (!session || !settingsLoaded) return;
    setEmailsLoading(true);
    try {
      const params = new URLSearchParams({ folder, limit: "50" });
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/email/messages?${params}`, { headers: headers() });
      const data = await safeJson(res);
      setEmails(data.emails || []);
      setTotalEmails(data.total || 0);
    } catch { /* ignore */ }
    setEmailsLoading(false);
  }, [session, settingsLoaded, folder, searchQuery, headers]);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  // Auto-sync emails every 2 minutes in background (no loading spinner)
  useEffect(() => {
    if (!session || !settingsLoaded) return;
    const autoSync = async () => {
      try {
        await fetch("/api/email/sync", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ folder }),
        });
        fetchEmails();
      } catch { /* silent */ }
    };
    // Initial sync on mount
    autoSync();
    const interval = setInterval(autoSync, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [session, settingsLoaded, folder, headers, fetchEmails]);

  // Realtime: listen for new emails via Supabase postgres_changes
  useEffect(() => {
    if (!session) return;
    const sb = createClient();
    const channel = sb
      .channel("email-inbox-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_emails",
          filter: `admin_id=eq.${session.id}`,
        },
        () => {
          // Re-fetch the email list on any change
          fetchEmails();
        }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [session, fetchEmails]);

  // Escape key closes preview
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showPreview) {
        setShowPreview(false);
        setPreviewAttachment(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showPreview]);

  // Sync emails from IMAP
  const syncEmails = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/email/sync", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ folder }),
      });
      const data = await safeJson(res);
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`Synced ${data.synced} new emails`);
        fetchEmails();
      }
    } catch {
      toast.error("Sync failed");
    }
    setSyncing(false);
  };

  // Open email (fetch full body)
  const openEmailDetail = async (email: EmailMeta) => {
    setSelectedEmailId(email.id);
    setMobileView("detail");
    setOpenLoading(true);
    setOpenEmail(null);
    try {
      const res = await fetch(`/api/email/messages/${email.id}`, { headers: headers() });
      const data = await safeJson(res);
      if (data.error) {
        toast.error(data.error);
      } else if (data.email) {
        setOpenEmail(data.email);
        // Mark as read locally
        setEmails((prev) => prev.map((e) => e.id === email.id ? { ...e, is_read: true } : e));
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load email");
    }
    setOpenLoading(false);
  };

  // Save settings
  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/email/settings", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(settings),
      });
      const data = await safeJson(res);
      if (data.success) {
        toast.success("Email settings saved");
        setShowSettings(false);
        syncEmails();
      } else {
        toast.error(data.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save settings");
    }
    setSavingSettings(false);
  };

  // Test connection
  const testConnection = async () => {
    setTestingConn(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/email/test-connection", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(settings),
      });
      const data = await safeJson(res);
      setTestResult(data);
    } catch {
      setTestResult({ imap: false, smtp: false, imapError: "Request failed", smtpError: "Request failed" });
    }
    setTestingConn(false);
  };

  // Send email
  const sendEmail = async () => {
    if (!composeTo || !composeSubject) {
      toast.error("To and Subject are required");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          to: composeTo,
          cc: composeCc || undefined,
          subject: composeSubject,
          html: `<div style="font-family:sans-serif;font-size:14px">${composeBody}</div>`,
          text: composeBody.replace(/<[^>]*>/g, ""),
          inReplyTo: composeInReplyTo || undefined,
          references: composeReferences || undefined,
          attachments: composeAttachments.length > 0
            ? composeAttachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType }))
            : undefined,
        }),
      });
      const data = await safeJson(res);
      if (data.success) {
        toast.success("Email sent");
        setShowCompose(false);
        resetCompose();
      } else {
        toast.error(data.error || "Failed to send");
      }
    } catch {
      toast.error("Failed to send email");
    }
    setSending(false);
  };

  const resetCompose = () => {
    setComposeTo("");
    setComposeCc("");
    setComposeSubject("");
    setComposeBody("");
    setComposeInReplyTo("");
    setComposeReferences("");
    setComposeAttachments([]);
  };

  // Handle file attachment selection
  const handleAttachFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        setComposeAttachments((prev) => [
          ...prev,
          { filename: file.name, content: base64, contentType: file.type || "application/octet-stream", size: file.size },
        ]);
      };
      reader.readAsDataURL(file);
    });
    // Reset file input
    if (composeFileRef.current) composeFileRef.current.value = "";
  };

  const removeAttachment = (idx: number) => {
    setComposeAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // Reply / Forward helpers
  const handleReply = (email: EmailFull, all = false) => {
    setComposeTo(email.from_address);
    if (all) {
      const others = [...email.to_addresses, ...email.cc_addresses].filter((a) => a !== settings.email_address);
      setComposeCc(others.join(", "));
    }
    setComposeSubject(`Re: ${email.subject.replace(/^Re:\s*/i, "")}`);
    setComposeBody(`\n\n---\nOn ${new Date(email.date).toLocaleString()}, ${email.from_name} wrote:\n> ${(email.body_text || "").split("\n").join("\n> ")}`);
    setComposeInReplyTo(email.message_id);
    setComposeReferences(email.message_id);
    setShowCompose(true);
  };

  const handleForward = (email: EmailFull) => {
    setComposeTo("");
    setComposeSubject(`Fwd: ${email.subject.replace(/^Fwd:\s*/i, "")}`);
    setComposeBody(`\n\n---\nForwarded message:\nFrom: ${email.from_name} <${email.from_address}>\nDate: ${new Date(email.date).toLocaleString()}\nSubject: ${email.subject}\n\n${email.body_text || ""}`);
    setShowCompose(true);
  };

  // Attachment helpers
  const getAttachmentBlobUrl = (att: EmailFull["attachments"][0]) => {
    const blob = new Blob([Uint8Array.from(atob(att.content), c => c.charCodeAt(0))], { type: att.contentType });
    return URL.createObjectURL(blob);
  };

  const downloadAttachment = (att: EmailFull["attachments"][0]) => {
    const url = getAttachmentBlobUrl(att);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openPreview = async (att: EmailFull["attachments"][0]) => {
    setPreviewAttachment(att);
    setShowPreview(true);
    setStampPlacement(null);
    setSignaturePlacement(null);
    setPlacingItem(null);
    setPdfPageImages(null);
    // Load existing signed info from email DB record, or reset
    if (openEmail?.signed_document_url) {
      setSignedInfo({ url: openEmail.signed_document_url, filename: openEmail.signed_filename || att.filename });
    } else {
      setSignedInfo(null);
    }
    // Pre-fill sign & send fields from the current email
    if (openEmail) {
      setSignSendTo(openEmail.from_address || "");
      setSignSendSubject(`Re: ${openEmail.subject || "Signed document"}`);
      setSignSendBody("Please find the signed and confirmed document attached.");
    }
    // Fetch company stamp/signature urls
    try {
      const res = await fetch("/api/company/stamp-info", { headers: headers() });
      const data = await safeJson(res);
      setCompanyStampUrl(data.stamp_url || null);
      setCompanySignatureUrl(data.signature_url || null);
    } catch { /* ignore */ }
    // Render PDF pages as images client-side using pdfjs-dist
    if (att.contentType?.includes("pdf")) {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const raw = Uint8Array.from(atob(att.content), c => c.charCodeAt(0));
        const pdf = await pdfjsLib.getDocument({ data: raw }).promise;
        const images: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const scale = 1.5;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          images.push(canvas.toDataURL("image/png"));
        }
        setPdfPageImages(images);
      } catch (err) {
        console.error("[v0] PDF render failed, falling back to iframe:", err);
        setPdfPageImages([]); // empty = fallback to iframe
      }
    } else {
      setPdfPageImages([]); // not a PDF
    }
  };

  // Sign & Send to customer
  const handleSignAndSend = async () => {
    if (!previewAttachment || !signSendTo) return;
    setSigning(true);
    try {
      const res = await fetch("/api/email/sign-and-send", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          to: signSendTo,
          subject: signSendSubject || `Signed: ${previewAttachment.filename}`,
          body: signSendBody || "Please find the signed document attached.",
          attachment: {
            filename: previewAttachment.filename,
            content: previewAttachment.content,
            contentType: previewAttachment.contentType,
          },
          stampPosition: stampPlacement, // { x, y (%), page (0-indexed) }
          signaturePosition: signaturePlacement,
          emailId: openEmail?.id || null,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to sign and send");
      toast.success(`Signed document sent to ${signSendTo}`);
      // Track that this email was signed -- store the signed URL/filename for Convert to Order
      if (data.signed_document_url) {
        setSignedInfo({ url: data.signed_document_url, filename: data.signed_filename || previewAttachment.filename });
      }
      setSigning(false);
      setSignSendTo("");
      setSignSendSubject("");
      setSignSendBody("");
    } catch (err: any) {
      toast.error(err.message || "Failed to sign and send");
      setSigning(false);
    }
  };

  // Convert attachment to order -- uses signed version if already signed & sent
  const convertToOrder = async (attachment: EmailFull["attachments"][0]) => {
    const isSigned = !!signedInfo?.url;
    let dataUrl = `data:${attachment.contentType};base64,${attachment.content}`;
    let fileName = attachment.filename;

    // If signed, fetch the signed PDF from storage to use as the actual content
    if (isSigned && signedInfo!.url) {
      try {
        const res = await fetch(signedInfo!.url);
        if (res.ok) {
          const blob = await res.blob();
          const reader = new FileReader();
          const signedDataUrl: string = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          dataUrl = signedDataUrl;
          fileName = signedInfo!.filename || attachment.filename;
        }
      } catch {
        // Fall back to original content
      }
    }

    const payload: Record<string, any> = {
      fileName,
      dataUrl,
      emailSubject: openEmail?.subject || "",
      emailFrom: openEmail?.from_address || "",
      emailId: openEmail?.id || null,
    };
    if (isSigned) {
      payload.signed = true;
      payload.signedDocumentUrl = signedInfo!.url;
    }
    sessionStorage.setItem("email_attachment_for_order", JSON.stringify(payload));
    router.push("/admin/tms/orders/new?from=email");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-[calc(100vh-3.5rem-3rem)]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!session) {
    return <div className="flex items-center justify-center h-[calc(100vh-3.5rem-3rem)]"><p className="text-muted-foreground">Please log in.</p></div>;
  }

  const unreadCount = emails.filter((e) => !e.is_read).length;

  return (
    <div className="h-[calc(100vh-3.5rem-3rem)] -m-6 flex bg-background overflow-hidden rounded-lg border border-border/30">
      {/* -- Left: Folder sidebar -- */}
      <div className="w-[200px] flex-shrink-0 border-r border-border/40 bg-card/40 flex flex-col hidden md:flex">
        <div className="p-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Mail</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSettings(true)}>
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="px-2 pb-2">
          <Button size="sm" className="w-full justify-start gap-2 h-8 text-xs" onClick={() => { resetCompose(); setShowCompose(true); }}>
            <Plus className="h-3.5 w-3.5" /> Compose
          </Button>
        </div>
        <nav className="flex-1 px-1.5 space-y-0.5 overflow-y-auto">
          {FOLDERS.map((f) => (
            <button
              key={f.key}
              onClick={() => { setFolder(f.key); setSelectedEmailId(null); setOpenEmail(null); }}
              className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
                folder === f.key
                  ? "text-primary bg-primary/10 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <f.icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left text-[13px]">{f.label}</span>
              {f.key === "INBOX" && unreadCount > 0 && (
                <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">{unreadCount}</Badge>
              )}
            </button>
          ))}
        </nav>
        <div className="px-2 pt-2 border-t border-border/40">
          <Link
            href="/admin/email/templates"
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <FileText className="h-4 w-4 flex-shrink-0" />
            <span className="text-[13px]">Templates</span>
          </Link>
        </div>
        <div className="px-3 py-2 border-t border-border/40">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Auto-sync on{settings.last_sync_at ? ` \u00B7 ${formatDate(settings.last_sync_at)}` : ""}
          </p>
        </div>
      </div>

      {/* -- Middle: Email list -- */}
      <div className={`w-[340px] flex-shrink-0 border-r border-border/40 flex flex-col ${mobileView === "detail" ? "hidden md:flex" : "flex flex-1 md:flex-none md:w-[340px]"}`}>
        {/* List header */}
        <div className="h-12 flex items-center gap-2 px-3 border-b border-border/40 flex-shrink-0">
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-7 text-xs bg-muted/30 border-border/40"
            />
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={syncEmails} disabled={syncing} title="Sync now">
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* List body */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {emailsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Mail className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No emails</p>
              <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={syncEmails}>
                Sync now
              </Button>
            </div>
          ) : (
            emails.map((email) => (
              <button
                key={email.id}
                onClick={() => openEmailDetail(email)}
                className={`w-full text-left px-3 py-2.5 border-b border-border/20 transition-colors ${
                  selectedEmailId === email.id
                    ? "bg-primary/5 border-l-2 border-l-primary"
                    : "hover:bg-muted/30"
                } ${!email.is_read ? "bg-primary/[0.02]" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {!email.is_read && <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
                      <span className={`text-[13px] truncate ${!email.is_read ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {email.from_name || email.from_address}
                      </span>
                    </div>
                    <p className={`text-[12px] truncate mt-0.5 ${!email.is_read ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {email.subject}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <span className="text-[10px] text-muted-foreground">{formatDate(email.date)}</span>
                    <div className="flex items-center gap-1">
                      {email.has_attachments && <Paperclip className="h-3 w-3 text-muted-foreground/60" />}
                      {email.is_starred && <Star className="h-3 w-3 text-amber-400 fill-amber-400" />}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* -- Right: Email viewer / empty state -- */}
      <div className={`flex-1 flex flex-col min-w-0 ${mobileView === "list" ? "hidden md:flex" : "flex"}`}>
        {openLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : openEmail ? (
          <>
            {/* Email header bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 flex-shrink-0 bg-card/30">
              <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => { setMobileView("list"); setSelectedEmailId(null); }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-foreground truncate">{openEmail.subject}</h2>
                <p className="text-[11px] text-muted-foreground truncate">
                  {openEmail.from_name} {"<"}{openEmail.from_address}{">"}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Reply" onClick={() => handleReply(openEmail)}>
                  <Reply className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Reply All" onClick={() => handleReply(openEmail, true)}>
                  <ReplyAll className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Forward" onClick={() => handleForward(openEmail)}>
                  <Forward className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Email meta */}
            <div className="px-4 py-2 text-[11px] text-muted-foreground border-b border-border/20 flex-shrink-0">
              <div className="flex gap-2 flex-wrap">
                <span>To: {openEmail.to_addresses.join(", ")}</span>
                {openEmail.cc_addresses.length > 0 && <span>CC: {openEmail.cc_addresses.join(", ")}</span>}
                <span className="ml-auto">{new Date(openEmail.date).toLocaleString()}</span>
              </div>
            </div>

            {/* Attachments bar */}
            {openEmail.attachments.length > 0 && (
              <div className="px-4 py-2 border-b border-border/20 flex-shrink-0 bg-muted/20">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  {openEmail.attachments.map((att, i) => (
                    <DropdownMenu key={i}>
                      <DropdownMenuTrigger asChild>
                        <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background border border-border/40 text-[11px] hover:bg-muted transition-colors group">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate max-w-[150px] font-medium">{att.filename}</span>
                          <span className="text-muted-foreground/60">{formatBytes(att.size)}</span>
                          <MoreVertical className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground ml-0.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-52">
                        <DropdownMenuItem onClick={() => downloadAttachment(att)}>
                          <Download className="h-3.5 w-3.5 mr-2" /> Download
                        </DropdownMenuItem>
                        {(att.contentType.includes("pdf") || att.contentType.includes("image")) && (
                          <>
                            <DropdownMenuItem onClick={() => openPreview(att)}>
                              <Eye className="h-3.5 w-3.5 mr-2" /> Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => convertToOrder(att)} className="text-primary focus:text-primary">
                              <Package className="h-3.5 w-3.5 mr-2" /> Convert to Order
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ))}
                </div>
              </div>
            )}

            {/* Email body */}
            <div className="flex-1 overflow-y-auto p-4">
              {openEmail.body_html ? (
                <div
                  className="prose prose-sm prose-invert max-w-none text-foreground [&_a]:text-primary [&_img]:max-w-full [&_img]:h-auto"
                  dangerouslySetInnerHTML={{ __html: openEmail.body_html }}
                />
              ) : (
                <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">{openEmail.body_text}</pre>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <Mail className="h-12 w-12 opacity-20 mb-3" />
            <p className="text-sm">Select an email to read</p>
          </div>
        )}
      </div>

      {/* ─── Compose Dialog ─── */}
      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">
              {composeInReplyTo ? "Reply" : "New Email"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-3 overflow-y-auto">
            <div className="space-y-2">
              <Input placeholder="To" value={composeTo} onChange={(e) => setComposeTo(e.target.value)} className="text-sm" />
              <Input placeholder="CC" value={composeCc} onChange={(e) => setComposeCc(e.target.value)} className="text-sm" />
              <Input placeholder="Subject" value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} className="text-sm" />
            </div>
            <RichTextEditor
              content={composeBody}
              onChange={(html) => setComposeBody(html)}
              placeholder="Write your message..."
              minHeight="200px"
            />
            {/* Attachments */}
            {composeAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {composeAttachments.map((att, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted border border-border/40 text-[11px]">
                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate max-w-[150px] font-medium">{att.filename}</span>
                    <span className="text-muted-foreground/60">{formatBytes(att.size)}</span>
                    <button onClick={() => removeAttachment(idx)} className="text-muted-foreground hover:text-destructive ml-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-border/40">
            <div className="flex items-center gap-2">
              <input
                ref={composeFileRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleAttachFiles}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => composeFileRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5" /> Attach
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowCompose(false)}>Cancel</Button>
              <Button onClick={sendEmail} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Settings Dialog ─── */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Email Settings</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
              <TabsTrigger value="imap" className="text-xs">IMAP (Receive)</TabsTrigger>
              <TabsTrigger value="smtp" className="text-xs">SMTP (Send)</TabsTrigger>
            </TabsList>

            {(settings as any).is_legacy_fallback && (
              <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <strong>Tenant-wide mailbox detected.</strong> These credentials were configured before per-user mailboxes were introduced and are currently shared by everyone in your tenant. The next time you press <em>Save</em>, this mailbox will be claimed as <em>yours only</em>. Other users will need to configure their own.
              </div>
            )}

            <TabsContent value="general" className="space-y-3 mt-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Email Address</label>
                <Input value={settings.email_address} onChange={(e) => setSettings({ ...settings, email_address: e.target.value })} placeholder="you@company.com" className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Display Name</label>
                <Input value={settings.display_name} onChange={(e) => setSettings({ ...settings, display_name: e.target.value })} placeholder="John Doe" className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Signature (HTML)</label>
                <textarea
                  className="w-full min-h-[80px] p-2 text-sm rounded-md border border-border bg-background resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                  value={settings.signature_html}
                  onChange={(e) => setSettings({ ...settings, signature_html: e.target.value })}
                  placeholder="<p>Best regards,<br/>John Doe</p>"
                />
              </div>
            </TabsContent>

            <TabsContent value="imap" className="space-y-3 mt-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">IMAP Host</label>
                  <Input value={settings.imap_host} onChange={(e) => setSettings({ ...settings, imap_host: e.target.value })} placeholder="imap.gmail.com" className="text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Port</label>
                  <Input type="number" value={settings.imap_port} onChange={(e) => setSettings({ ...settings, imap_port: parseInt(e.target.value) || 993 })} className="text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Username</label>
                <Input value={settings.imap_user} onChange={(e) => setSettings({ ...settings, imap_user: e.target.value })} placeholder="you@company.com" className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Password</label>
                <Input type="password" value={settings.imap_password} onChange={(e) => setSettings({ ...settings, imap_password: e.target.value })} placeholder="App password" className="text-sm" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.imap_secure} onChange={(e) => setSettings({ ...settings, imap_secure: e.target.checked })} className="rounded" />
                <span className="text-xs text-muted-foreground">Use SSL/TLS</span>
              </label>
            </TabsContent>

            <TabsContent value="smtp" className="space-y-3 mt-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">SMTP Host</label>
                  <Input value={settings.smtp_host} onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })} placeholder="smtp.gmail.com" className="text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Port</label>
                  <Input type="number" value={settings.smtp_port} onChange={(e) => setSettings({ ...settings, smtp_port: parseInt(e.target.value) || 587 })} className="text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Username</label>
                <Input value={settings.smtp_user} onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })} placeholder="you@company.com" className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Password</label>
                <Input type="password" value={settings.smtp_password} onChange={(e) => setSettings({ ...settings, smtp_password: e.target.value })} placeholder="App password" className="text-sm" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.smtp_secure} onChange={(e) => setSettings({ ...settings, smtp_secure: e.target.checked })} className="rounded" />
                <span className="text-xs text-muted-foreground">Use SSL/TLS</span>
              </label>
            </TabsContent>
          </Tabs>

          {/* Test results */}
          {testResult && (
            <div className="rounded-lg border border-border/40 p-3 bg-muted/20 space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                {testResult.imap ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
                <span className={testResult.imap ? "text-emerald-400" : "text-red-400"}>
                  IMAP: {testResult.imap ? "Connected" : testResult.imapError}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {testResult.smtp ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
                <span className={testResult.smtp ? "text-emerald-400" : "text-red-400"}>
                  SMTP: {testResult.smtp ? "Connected" : testResult.smtpError}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-border/40">
            <Button variant="outline" size="sm" onClick={testConnection} disabled={testingConn}>
              {testingConn ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
              Test Connection
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
              <Button onClick={saveSettings} disabled={savingSettings}>
                {savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Fullscreen Attachment Preview ─── */}
      {showPreview && previewAttachment && (
        <div className="fixed inset-0 z-[200] bg-background flex flex-col" style={{ zIndex: 200 }}>
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-card flex-shrink-0 relative z-10">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5 font-medium"
                onClick={() => { setShowPreview(false); setPreviewAttachment(null); }}
              >
                <X className="h-3.5 w-3.5" />
                Close
              </Button>
              <div className="h-5 w-px bg-border/60" />
              <FileText className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-sm font-semibold truncate block">{previewAttachment.filename}</span>
                <span className="text-[11px] text-muted-foreground">{formatBytes(previewAttachment.size)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => downloadAttachment(previewAttachment)}>
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { convertToOrder(previewAttachment); setShowPreview(false); }}>
                <Package className="h-3.5 w-3.5" />
                Convert to Order
              </Button>
            </div>
          </div>

          {/* Main content: PDF/image viewer on left, Sign & Send panel on right */}
          <div className="flex-1 flex overflow-hidden">
            {/* Document viewer */}
            <div className="flex-1 overflow-auto bg-neutral-800/90">
              {previewAttachment.contentType.includes("pdf") ? (
                /* PDF: show rendered page images if available, else iframe fallback */
                pdfPageImages === null ? (
                  /* Still loading */
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">Loading document...</p>
                    </div>
                  </div>
                ) : pdfPageImages.length > 0 ? (
                  /* Rendered pages -- user can click to place stamps directly on pages */
                  <div className="flex flex-col items-center py-6 gap-4 px-4">
                    {/* Placing mode banner */}
                    {placingItem && (
                      <div className="sticky top-0 z-20 bg-primary text-primary-foreground text-sm px-4 py-2 rounded-full shadow-xl flex items-center gap-2">
                        <span>Click on the document to place the {placingItem}</span>
                        <button onClick={() => setPlacingItem(null)} className="ml-1 underline text-xs opacity-80 hover:opacity-100">Cancel</button>
                      </div>
                    )}
                    {pdfPageImages.map((dataUrl, pageIdx) => (
                      <div
                        key={pageIdx}
                        className={`relative shadow-xl ${placingItem ? "cursor-crosshair ring-2 ring-primary/30 hover:ring-primary/60" : ""}`}
                        style={{ maxWidth: 800, width: "100%" }}
                        onClick={(e) => {
                          if (!placingItem) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const xPct = ((e.clientX - rect.left) / rect.width) * 100;
                          const yPct = ((e.clientY - rect.top) / rect.height) * 100;
                          if (placingItem === "stamp") {
                            setStampPlacement({ x: xPct, y: yPct, page: pageIdx });
                          } else {
                            setSignaturePlacement({ x: xPct, y: yPct, page: pageIdx });
                          }
                          setPlacingItem(null);
                        }}
                      >
                        {/* Rendered page image */}
                        <img
                          src={dataUrl}
                          alt={`Page ${pageIdx + 1}`}
                          className="block w-full h-auto select-none"
                          draggable={false}
                        />

                        {/* Stamp overlay on this page */}
                        {stampPlacement && stampPlacement.page === pageIdx && companyStampUrl && (
                          <div
                            className="absolute z-10 group"
                            style={{
                              left: `${stampPlacement.x}%`,
                              top: `${stampPlacement.y}%`,
                              transform: "translate(-50%, -50%)",
                            }}
                          >
                            <img src={companyStampUrl} alt="Stamp" className="w-28 h-auto opacity-80 drop-shadow-lg" crossOrigin="anonymous" />
                            <button
                              className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                              onClick={(e) => { e.stopPropagation(); setStampPlacement(null); }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}

                        {/* Signature overlay on this page */}
                        {signaturePlacement && signaturePlacement.page === pageIdx && companySignatureUrl && (
                          <div
                            className="absolute z-10 group"
                            style={{
                              left: `${signaturePlacement.x}%`,
                              top: `${signaturePlacement.y}%`,
                              transform: "translate(-50%, -50%)",
                            }}
                          >
                            <img src={companySignatureUrl} alt="Signature" className="w-24 h-auto opacity-85 drop-shadow-lg" crossOrigin="anonymous" />
                            <button
                              className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                              onClick={(e) => { e.stopPropagation(); setSignaturePlacement(null); }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}

                        {/* Page number */}
                        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded pointer-events-none">
                          {pageIdx + 1} / {pdfPageImages.length}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* pdfjs failed -- fallback to iframe */
                  <div className="h-full relative">
                    <iframe
                      src={`data:application/pdf;base64,${previewAttachment.content}#toolbar=1&navpanes=0&view=FitH`}
                      className="w-full h-full border-0"
                      title={previewAttachment.filename}
                    />
                    {/* Overlay for stamp placement on iframe fallback */}
                    {placingItem && (
                      <div
                        className="absolute inset-0 z-10 cursor-crosshair"
                        style={{ background: "rgba(0,0,0,0.08)" }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const xPct = ((e.clientX - rect.left) / rect.width) * 100;
                          const yPct = ((e.clientY - rect.top) / rect.height) * 100;
                          if (placingItem === "stamp") {
                            setStampPlacement({ x: xPct, y: yPct, page: 0 });
                          } else {
                            setSignaturePlacement({ x: xPct, y: yPct, page: 0 });
                          }
                          setPlacingItem(null);
                        }}
                      >
                        <div className="absolute inset-0 border-2 border-dashed border-primary/50 pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                          <span className="bg-primary text-primary-foreground text-sm px-4 py-2 rounded-full font-medium shadow-xl">
                            Click to place {placingItem}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              ) : previewAttachment.contentType.includes("image") ? (
                <div className="flex items-center justify-center h-full p-8">
                  <img
                    src={`data:${previewAttachment.contentType};base64,${previewAttachment.content}`}
                    alt={previewAttachment.filename}
                    className="max-w-full max-h-full object-contain rounded-md"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <FileText className="h-16 w-16 mx-auto mb-4 opacity-20" />
                    <p className="text-sm mb-3">Preview not available</p>
                    <Button variant="outline" size="sm" onClick={() => downloadAttachment(previewAttachment)}>
                      Download instead
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Sign & Send panel */}
            <div className="w-[360px] border-l border-border/40 bg-card flex flex-col flex-shrink-0">
              <div className="px-4 py-3 border-b border-border/20">
                <div className="flex items-center gap-2 mb-1">
                  <Stamp className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Sign & Send to Customer</h3>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Place your stamp and signature on the document, then send it back.
                </p>
              </div>

              <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
                {/* Already signed badge */}
                {signedInfo && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-green-400">Document Signed & Sent</p>
                      <p className="text-[10px] text-muted-foreground truncate">{signedInfo.filename}</p>
                    </div>
                  </div>
                )}
                {/* Stamp placement */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Document Signing</label>
                  <div className="space-y-1.5">
                    {companyStampUrl ? (
                      <button
                        onClick={() => {
                          setPlacingItem(placingItem === "stamp" ? null : "stamp");
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all text-xs ${
                          placingItem === "stamp"
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                            : stampPlacement
                            ? "border-green-500/40 bg-green-500/5"
                            : "border-border hover:border-primary/40 hover:bg-muted/50"
                        }`}
                      >
                        <img src={companyStampUrl} alt="Stamp" className="w-10 h-10 object-contain rounded bg-white p-0.5 border border-border/30" crossOrigin="anonymous" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block">Company Stamp</span>
                          <span className="text-muted-foreground text-[10px]">
                            {placingItem === "stamp"
                              ? "Select a page to place stamp..."
                              : stampPlacement
                              ? `Placed on page ${stampPlacement.page + 1} -- click to move`
                              : "Click to place on document"}
                          </span>
                        </div>
                        {stampPlacement && (
                          <button onClick={(e) => { e.stopPropagation(); setStampPlacement(null); }} className="text-muted-foreground hover:text-destructive p-1">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                        <Stamp className="h-4 w-4 opacity-40" />
                        <span>No stamp uploaded. Go to Settings &gt; Company.</span>
                      </div>
                    )}

                    {companySignatureUrl ? (
                      <button
                        onClick={() => {
                          setPlacingItem(placingItem === "signature" ? null : "signature");
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all text-xs ${
                          placingItem === "signature"
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                            : signaturePlacement
                            ? "border-green-500/40 bg-green-500/5"
                            : "border-border hover:border-primary/40 hover:bg-muted/50"
                        }`}
                      >
                        <img src={companySignatureUrl} alt="Signature" className="w-10 h-10 object-contain rounded bg-white p-0.5 border border-border/30" crossOrigin="anonymous" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block">Authorized Signature</span>
                          <span className="text-muted-foreground text-[10px]">
                            {placingItem === "signature"
                              ? "Select a page to place signature..."
                              : signaturePlacement
                              ? `Placed on page ${signaturePlacement.page + 1} -- click to move`
                              : "Click to place on document"}
                          </span>
                        </div>
                        {signaturePlacement && (
                          <button onClick={(e) => { e.stopPropagation(); setSignaturePlacement(null); }} className="text-muted-foreground hover:text-destructive p-1">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                        <PenTool className="h-4 w-4 opacity-40" />
                        <span>No signature uploaded. Go to Settings &gt; Company.</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="h-px bg-border/30" />

                {/* To */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Send To</label>
                  <Input
                    value={signSendTo}
                    onChange={(e) => setSignSendTo(e.target.value)}
                    placeholder={openEmail?.from_address || "customer@email.com"}
                    className="h-8 text-xs"
                  />
                </div>

                {/* Subject */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Subject</label>
                  <Input
                    value={signSendSubject}
                    onChange={(e) => setSignSendSubject(e.target.value)}
                    placeholder={`Re: ${openEmail?.subject || "Signed document"}`}
                    className="h-8 text-xs"
                  />
                </div>

                {/* Message */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Message</label>
                  <textarea
                    value={signSendBody}
                    onChange={(e) => setSignSendBody(e.target.value)}
                    placeholder="Please find the signed and confirmed document attached."
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="px-4 py-3 border-t border-border/20 space-y-2">
                <Button
                  className="w-full h-9 text-xs gap-2"
                  disabled={signing || !signSendTo || (!stampPlacement && !signaturePlacement)}
                  onClick={handleSignAndSend}
                >
                  {signing ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Signing & Sending...</>
                  ) : (
                    <><SendHorizontal className="h-3.5 w-3.5" /> Sign & Send Document</>
                  )}
                </Button>
                {(!stampPlacement && !signaturePlacement) && (
                  <p className="text-[10px] text-center text-muted-foreground">Place at least one stamp or signature to continue</p>
                )}
                <Button
                  variant="outline"
                  className="w-full h-9 text-xs gap-2"
                  onClick={() => { convertToOrder(previewAttachment); setShowPreview(false); }}
                >
                  <Package className="h-3.5 w-3.5" /> {signedInfo ? "Create Order (Signed)" : "Convert to Order Instead"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
