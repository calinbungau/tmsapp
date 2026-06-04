import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Dispatcher view of an offer's recipients: who it was sent to, whether they
 * opened the link, how many times, and their response/quote. The admin id is
 * passed as `x-admin-id` (consistent with the rest of the exchange APIs) and
 * scopes the query so dispatchers only see their own offers' recipients.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: offerId } = await params;
    const adminId = request.headers.get("x-admin-id");
    if (!adminId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("freight_offer_recipients")
      .select(
        "id, carrier_name, email, response, responded_at, quote_amount, quote_currency, " +
          "quote_message, sent_at, first_viewed_at, last_viewed_at, view_count, carrier_account_id"
      )
      .eq("offer_id", offerId)
      .eq("admin_id", adminId)
      .order("responded_at", { ascending: false, nullsFirst: false })
      .order("first_viewed_at", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("[exchange/recipients] query failed", error);
      return NextResponse.json({ error: "Failed to load recipients" }, { status: 500 });
    }

    return NextResponse.json({ recipients: data || [] });
  } catch (error) {
    console.error("[exchange/recipients] error", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
