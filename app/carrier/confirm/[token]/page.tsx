"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Upload, CheckCircle, AlertTriangle, FileText, Loader2,
  X, Shield, Plus, Receipt, FileCheck2, Lock,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Two-step carrier upload portal
// ─────────────────────────────────────────────────────────────────────────────
// The portal supports three token flavours:
//   • legacy "order_confirmation" — single signed PDF, one-shot
//   • "cmr_pod" + step="cmr_pod"  — CMR/POD scans (multi-file)
//   • "cmr_pod" + step="invoice"  — carrier's freight invoice (single file)
//
// When the carrier lands on the page for a cmr_pod token, both steps
// are shown as separate cards. Each card is independent — they can do
// step 1 today and step 2 next week from the same emailed link. Once
// both are submitted the link is closed and a thank-you state is shown.
// ─────────────────────────────────────────────────────────────────────────────

type PageState = "loading" | "valid" | "expired" | "used" | "error" | "completed";
type TokenType = "order_confirmation" | "cmr_pod";
type UploadStep = "cmr_pod" | "invoice" | "confirmation";

interface TokenInfo {
  tokenType: TokenType;
  carrierName: string;
  carrierEmail: string;
  orderReference: string;
  orderId: string;
  cmrPodUploaded: boolean;
  invoiceUploaded: boolean;
  completed: boolean;
  previouslyUploaded?: boolean;
  message?: string;
}

export default function CarrierConfirmPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>("loading");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Per-step file buffers, error messages, and in-flight indicators.
  // Kept independent so the carrier can stage CMR scans without
  // interfering with whatever they've selected for the invoice slot.
  const [cmrFiles, setCmrFiles] = useState<File[]>([]);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [cmrUploading, setCmrUploading] = useState(false);
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [cmrError, setCmrError] = useState("");
  const [invoiceError, setInvoiceError] = useState("");
  const [confirmationFile, setConfirmationFile] = useState<File | null>(null);
  const [confirmationUploading, setConfirmationUploading] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");

  const isCmrPodFlow = tokenInfo?.tokenType === "cmr_pod";
  const cmrDone = !!tokenInfo?.cmrPodUploaded;
  const invoiceDone = !!tokenInfo?.invoiceUploaded;

  const validateToken = useCallback(async () => {
    try {
      const res = await fetch(`/api/carrier/confirm/${token}`);
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { error: text }; }

      if (res.status === 410) { setState("expired"); setErrorMsg(data.error); return; }
      if (res.status === 409) { setState("used"); setErrorMsg(data.error); return; }
      if (!res.ok) { setState("error"); setErrorMsg(data.error || "Invalid link"); return; }

      setTokenInfo(data);
      setState(data.completed ? "completed" : "valid");
    } catch {
      setState("error");
      setErrorMsg("Could not validate this link. Please try again.");
    }
  }, [token]);

  useEffect(() => { validateToken(); }, [validateToken]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  // Generic per-step uploader. Posts to the carrier confirm route
  // with `step` form-field so the API can route the file into the
  // right storage folder and document_type bucket.
  const uploadStep = async (step: UploadStep, files: File[]) => {
    const fd = new FormData();
    files.forEach(f => fd.append("file", f));
    fd.append("step", step);
    const res = await fetch(`/api/carrier/confirm/${token}`, { method: "POST", body: fd });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { error: text }; }
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  };

  const handleCmrUpload = async () => {
    if (cmrFiles.length === 0) return;
    setCmrUploading(true); setCmrError("");
    try {
      await uploadStep("cmr_pod", cmrFiles);
      setCmrFiles([]);
      await validateToken();
    } catch (e: any) {
      setCmrError(e.message || "Upload failed.");
    } finally {
      setCmrUploading(false);
    }
  };

  const handleInvoiceUpload = async () => {
    if (!invoiceFile) return;
    setInvoiceUploading(true); setInvoiceError("");
    try {
      await uploadStep("invoice", [invoiceFile]);
      setInvoiceFile(null);
      await validateToken();
    } catch (e: any) {
      setInvoiceError(e.message || "Upload failed.");
    } finally {
      setInvoiceUploading(false);
    }
  };

  const handleConfirmationUpload = async () => {
    if (!confirmationFile) return;
    setConfirmationUploading(true); setConfirmationError("");
    try {
      await uploadStep("confirmation", [confirmationFile]);
      await validateToken();
    } catch (e: any) {
      setConfirmationError(e.message || "Upload failed.");
    } finally {
      setConfirmationUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-[#d4a843] font-bold text-xl mb-2">
            <Shield className="h-6 w-6" />
            BNG Tracking
          </div>
          <p className="text-[#6b7280] text-sm">Secure Document Upload</p>
        </div>

        {state === "loading" && (
          <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#d4a843] mx-auto mb-4" />
            <p className="text-sm text-[#a0a0b0]">Validating your link...</p>
          </div>
        )}

        {(state === "expired" || state === "used" || state === "error") && (
          <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl p-10 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 mb-5">
              <AlertTriangle className="h-7 w-7 text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">
              {state === "expired" ? "Link Expired" : state === "used" ? "Already Completed" : "Invalid Link"}
            </h2>
            <p className="text-sm text-[#a0a0b0] leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {state === "completed" && tokenInfo && (
          <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl p-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-5">
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">All Documents Received</h2>
            <p className="text-sm text-[#a0a0b0] leading-relaxed">
              CMR/POD and invoice for order{" "}
              <span className="text-[#d4a843] font-medium">{tokenInfo.orderReference}</span>{" "}
              have both been received. You can close this page.
            </p>
          </div>
        )}

        {state === "valid" && tokenInfo && isCmrPodFlow && (
          <div className="space-y-4">
            {/* Order context card */}
            <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl overflow-hidden">
              <div className="bg-blue-500/10 border-b border-blue-500/20 px-6 py-4">
                <h2 className="text-base font-semibold text-white">Post-Delivery Documents</h2>
                <p className="text-xs text-[#a0a0b0] mt-1">
                  Reference: <span className="text-blue-400 font-medium">{tokenInfo.orderReference}</span>
                </p>
              </div>
              <div className="p-5 space-y-3">
                <div className="bg-[#0d0d1a] rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6b7280]">Carrier</span>
                    <span className="text-white font-medium">{tokenInfo.carrierName}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6b7280]">Email</span>
                    <span className="text-[#a0a0b0]">{tokenInfo.carrierEmail}</span>
                  </div>
                </div>
                <p className="text-xs text-[#a0a0b0] leading-relaxed">
                  Please upload your CMR/POD documents first, then come back any time
                  to upload your invoice. You can use this same link until both are
                  completed.
                </p>
              </div>
            </div>

            {/* Step 1 — CMR / POD */}
            <UploadStepCard
              stepNumber={1}
              title="CMR & Proof of Delivery"
              description="Upload signed CMR pages and/or POD scans for this delivery."
              icon={<FileCheck2 className="h-5 w-5" />}
              accent="amber"
              done={cmrDone}
              files={cmrFiles}
              onFiles={setCmrFiles}
              multi
              uploading={cmrUploading}
              error={cmrError}
              onUpload={handleCmrUpload}
              uploadLabel={`Upload ${cmrFiles.length} document${cmrFiles.length !== 1 ? "s" : ""}`}
              allowMoreAfterDone
              addMoreLabel="Add more CMR/POD pages"
              formatSize={formatSize}
            />

            {/* Step 2 — Invoice */}
            <UploadStepCard
              stepNumber={2}
              title="Carrier Invoice"
              description="Upload your freight invoice for this delivery. PDF preferred."
              icon={<Receipt className="h-5 w-5" />}
              accent="blue"
              done={invoiceDone}
              files={invoiceFile ? [invoiceFile] : []}
              onFiles={(arr) => setInvoiceFile(arr[0] || null)}
              multi={false}
              uploading={invoiceUploading}
              error={invoiceError}
              onUpload={handleInvoiceUpload}
              uploadLabel="Upload Invoice"
              formatSize={formatSize}
            />
          </div>
        )}

        {state === "valid" && tokenInfo && !isCmrPodFlow && (
          // Legacy single-file order confirmation flow, untouched.
          <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl overflow-hidden">
            <div className="bg-[#d4a843]/10 border-b border-[#d4a843]/20 px-6 py-4">
              <h2 className="text-base font-semibold text-white">Order Confirmation</h2>
              <p className="text-xs text-[#a0a0b0] mt-1">
                Reference: <span className="text-[#d4a843] font-medium">{tokenInfo.orderReference}</span>
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-[#0d0d1a] rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#6b7280]">Carrier</span>
                  <span className="text-white font-medium">{tokenInfo.carrierName}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#6b7280]">Email</span>
                  <span className="text-[#a0a0b0]">{tokenInfo.carrierEmail}</span>
                </div>
              </div>
              <UploadStepCard
                stepNumber={null}
                title="Signed Order Document"
                description="Upload the signed order document to confirm this shipment."
                icon={<FileCheck2 className="h-5 w-5" />}
                accent="amber"
                done={false}
                files={confirmationFile ? [confirmationFile] : []}
                onFiles={(arr) => setConfirmationFile(arr[0] || null)}
                multi={false}
                uploading={confirmationUploading}
                error={confirmationError}
                onUpload={handleConfirmationUpload}
                uploadLabel="Upload & Confirm Order"
                formatSize={formatSize}
                compact
              />
            </div>
          </div>
        )}

        <p className="text-center text-[10px] text-[#4a4a5a] mt-6">
          Secured by BNG Tracking. This is an automated page.
        </p>
      </div>
    </div>
  );
}

// ─── Reusable step card ─────────────────────────────────────────────────────
function UploadStepCard({
  stepNumber, title, description, icon, accent, done, files, onFiles, multi,
  uploading, error, onUpload, uploadLabel, allowMoreAfterDone, addMoreLabel,
  formatSize, compact,
}: {
  stepNumber: number | null;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: "amber" | "blue";
  done: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
  multi: boolean;
  uploading: boolean;
  error: string;
  onUpload: () => void;
  uploadLabel: string;
  allowMoreAfterDone?: boolean;
  addMoreLabel?: string;
  formatSize: (n: number) => string;
  compact?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputId = `file-input-step-${stepNumber ?? "x"}-${accent}`;

  const accentText = accent === "amber" ? "text-[#d4a843]" : "text-blue-400";
  const accentBg = accent === "amber" ? "bg-[#d4a843]" : "bg-blue-500";
  const accentBgSoft = accent === "amber" ? "bg-[#d4a843]/10" : "bg-blue-500/10";
  const accentBorder = accent === "amber" ? "border-[#d4a843]/40" : "border-blue-500/40";
  const accentHover = accent === "amber" ? "hover:bg-[#c49a3a]" : "hover:bg-blue-600";

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    if (multi) onFiles([...files, ...arr]);
    else onFiles(arr.slice(0, 1));
  };

  const isLocked = done && !allowMoreAfterDone;

  return (
    <div className={`bg-[#1a1a2e] border rounded-xl overflow-hidden ${
      done ? "border-green-500/30" : "border-[#2a2a3e]"
    }`}>
      {!compact && (
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2a2a3e]">
          <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
            done ? "bg-green-500/15 text-green-400" : `${accentBgSoft} ${accentText}`
          }`}>
            {done ? <CheckCircle className="h-4 w-4" /> : stepNumber}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={done ? "text-green-400" : accentText}>{icon}</span>
              <h3 className="text-sm font-semibold text-white">{title}</h3>
            </div>
            <p className="text-[11px] text-[#6b7280] mt-0.5">{description}</p>
          </div>
          {done && (
            <span className="text-[10px] font-medium text-green-400 uppercase tracking-wide">
              Received
            </span>
          )}
        </div>
      )}

      <div className="p-5">
        {isLocked ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-green-500/5 border border-green-500/20">
            <Lock className="h-4 w-4 text-green-400 flex-shrink-0" />
            <p className="text-xs text-[#a0a0b0]">
              This step is complete. Thank you for sending the documents.
            </p>
          </div>
        ) : (
          <>
            <div
              className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                dragOver
                  ? `${accentBorder} ${accentBgSoft}`
                  : files.length > 0
                  ? "border-green-500/40 bg-green-500/5"
                  : `border-[#2a2a3e] hover:${accentBorder} hover:${accentBgSoft}`
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
              }}
              onClick={() => document.getElementById(inputId)?.click()}
            >
              <input
                id={inputId}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                multiple={multi}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {files.length === 0 ? (
                <>
                  <Upload className="h-8 w-8 text-[#6b7280] mx-auto mb-2" />
                  <p className="text-xs text-[#a0a0b0] mb-1">
                    {done && allowMoreAfterDone
                      ? "Drop additional pages here or click to browse"
                      : multi
                      ? "Drag and drop your files here or click to browse"
                      : "Drag and drop your invoice here or click to browse"}
                  </p>
                  <p className="text-[10px] text-[#6b7280]">
                    PDF, JPG, PNG, WebP{multi ? " — multiple files allowed" : ""}
                  </p>
                </>
              ) : (
                <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 text-left">
                      <FileText className="h-5 w-5 text-green-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white font-medium truncate">{f.name}</p>
                        <p className="text-[10px] text-[#6b7280]">{formatSize(f.size)}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onFiles(files.filter((_, idx) => idx !== i));
                        }}
                        className="text-[#6b7280] hover:text-red-400 p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {multi && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        document.getElementById(inputId)?.click();
                      }}
                      className={`flex items-center gap-1.5 text-xs mt-2 mx-auto ${accentText} hover:opacity-80`}
                    >
                      <Plus className="h-3.5 w-3.5" /> {addMoreLabel || "Add another file"}
                    </button>
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

            <button
              onClick={onUpload}
              disabled={files.length === 0 || uploading}
              className={`w-full mt-4 py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${accentBg} text-[#1a1a2e] ${accentHover}`}
            >
              {uploading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                </span>
              ) : (
                done && allowMoreAfterDone ? "Upload Additional Pages" : uploadLabel
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
