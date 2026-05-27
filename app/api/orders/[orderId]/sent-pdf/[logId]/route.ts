import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Returns a signed URL to the archived PDF that was attached to a
 * specific historical "order_sent_to_carrier" activity-log entry.
 *
 * The PDF is the *exact* file that was emailed to the carrier on that
 * date, not a re-render against current order data. This is what the
 * dispatcher needs to audit "what did we send on X date" — re-rendering
 * would be wrong because the order may have changed since (stops moved,
 * prices repriced, dates slipped).
 *
 * Auth: scoped to the admin who owns the order. We require x-admin-id
 * and verify the activity-log row belongs to an order under that admin
 * before issuing a signed URL.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ logId: string }> },
) {
  try {
    const adminId = request.headers.get("x-admin-id");
    if (!adminId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { logId } = await params;
    if (!logId) {
      return NextResponse.json({ error: "Missing logId" }, { status: 400 });
    }

    // Fetch the activity log row + the parent order's admin_id so we
    // can authorize the request.
    const { data: row, error } = await supabase
      .from("order_activity_log")
      .select("id, order_id, action, details, orders!inner(admin_id)")
      .eq("id", logId)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Supabase returns the joined `orders` as an array OR an object
    // depending on relationship cardinality — normalize.
    const ord = Array.isArray((row as any).orders)
      ? (row as any).orders[0]
      : (row as any).orders;
    if (!ord || ord.admin_id !== adminId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (row.action !== "order_sent_to_carrier") {
      return NextResponse.json({ error: "Not a send event" }, { status: 400 });
    }

    const details = (row.details as any) || {};
    const path: string | undefined = details.pdf_storage_path;
    const filename: string =
      details.pdf_filename || `Order_${row.order_id.slice(0, 8)}.pdf`;
    if (!path) {
      return NextResponse.json(
        { error: "No archived PDF for this send" },
        { status: 404 },
      );
    }

    // 5-minute signed URL with download disposition so clicking the
    // link saves the file under its original name instead of opening
    // inline in the browser.
    const { data: signed, error: signErr } = await supabase.storage
      .from("documents")
      .createSignedUrl(path, 300, { download: filename });

    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: signErr?.message || "Could not sign URL" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: signed.signedUrl, filename });
  } catch (e: any) {
    console.error("[v0] sent-pdf download error", e);
    return NextResponse.json(
      { error: e?.message || "Internal error" },
      { status: 500 },
    );
  }
}
