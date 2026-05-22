"use client";

import { useEffect, useState } from "react";
import { Loader2, FileText, ExternalLink, Upload, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";

interface Doc {
  id: string;
  name: string | null;
  file_name: string | null;
  file_url: string | null;
  document_type_id: string | null;
  document_type?: { id: string; name: string; code: string } | null;
  expiry_date: string | null;
  trip_id: string | null;
  order_id: string | null;
  created_at: string;
}

interface Props { tripId: string; linkedOrders: any[] }

export function TabDocuments({ tripId, linkedOrders }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const supabase = createClient();

  async function load() {
    setLoading(true);
    const orderIds = linkedOrders.map((o: any) => o.id);
    const filters: string[] = [`trip_id.eq.${tripId}`];
    if (orderIds.length) filters.push(`order_id.in.(${orderIds.join(",")})`);
    const { data, error } = await supabase
      .from("documents")
      .select("id, name, file_name, file_url, document_type_id, expiry_date, trip_id, order_id, created_at, document_type:document_types(id, name, code)")
      .or(filters.join(","))
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load documents", description: error.message, variant: "destructive" });
    } else {
      setDocs((data ?? []) as any);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [tripId, linkedOrders.length]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `trips/${tripId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
      const { error: insErr } = await supabase.from("documents").insert({
        name: file.name,
        file_name: file.name,
        file_url: pub.publicUrl,
        trip_id: tripId,
      });
      if (insErr) throw insErr;
      await supabase.from("trip_events").insert({
        trip_id: tripId,
        event_type: "document_uploaded",
        severity: "info",
        title: `Document uploaded: ${file.name}`,
        actor_type: "admin",
      });
      toast({ title: "Document uploaded" });
      load();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this document?")) return;
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (!error) load();
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">Trip Documents</span>
        <span className="text-[10px] text-muted-foreground">CMR · POD · delivery notes · receipts</span>
        <label className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 cursor-pointer">
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          Upload
          <input type="file" className="hidden" onChange={onUpload} disabled={uploading} />
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
      ) : docs.length === 0 ? (
        <div className="text-[11px] text-muted-foreground p-4 rounded-md bg-muted/20 border border-border/40 text-center">
          No documents attached. Upload CMR, POD, or other paperwork above.
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {docs.map(d => {
            const expired = d.expiry_date && new Date(d.expiry_date) < new Date();
            const expiringSoon = d.expiry_date && !expired && new Date(d.expiry_date) < new Date(Date.now() + 30 * 86400000);
            const scope = d.trip_id ? "Trip" : d.order_id ? `Order ${linkedOrders.find((o: any) => o.id === d.order_id)?.reference_number ?? ""}` : "—";
            return (
              <li key={d.id} className="flex items-start gap-2 p-2 rounded-md border border-border/40 bg-muted/20">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-medium truncate">{d.name || d.file_name || "document"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground flex-wrap">
                    <span>{d.document_type?.name || "Untyped"}</span>
                    <span>·</span>
                    <span>{scope}</span>
                    {d.expiry_date && (
                      <>
                        <span>·</span>
                        <span className={expired ? "text-red-400" : expiringSoon ? "text-amber-400" : ""}>
                          {expired ? "Expired " : expiringSoon ? "Expires " : "Valid until "}
                          {new Date(d.expiry_date).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {d.file_url && (
                    <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-muted text-muted-foreground" title="Open">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <button onClick={() => remove(d.id)} className="p-1 rounded hover:bg-red-500/20 text-red-400" title="Delete">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
