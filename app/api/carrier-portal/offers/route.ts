import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Offers visible to a logged-in carrier account. We read the carrier id from
 * the `x-carrier-id` header (set by the dashboard from localStorage). All
 * recipient rows linked to that account — directly or via its partner_id —
 * are returned with the joined offer summary.
 */
export async function GET(request: NextRequest) {
  try {
    const carrierId = request.headers.get("x-carrier-id");
    if (!carrierId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    // Resolve the account + its partner link so we can match older offers
    // that were sent to the partner before the account existed.
    const { data: account } = await supabase
      .from("carrier_accounts")
      .select("id, partner_id")
      .eq("id", carrierId)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    let query = supabase
      .from("freight_offer_recipients")
      .select(
        "id, token, response, responded_at, quote_amount, quote_currency, first_viewed_at, expires_at, " +
          "offer:freight_offers(id, reference, title, status, origin_city, origin_country, dest_city, " +
          "dest_country, load_date_from, unload_date_from, vehicle_type, weight_kg, pricing_mode, " +
          "price_amount, currency, expires_at)"
      )
      .order("created_at", { ascending: false });

    if (account.partner_id) {
      query = query.or(`carrier_account_id.eq.${carrierId},partner_id.eq.${account.partner_id}`);
    } else {
      query = query.eq("carrier_account_id", carrierId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[carrier-portal/offers] query failed", error);
      return NextResponse.json({ error: "Failed to load offers" }, { status: 500 });
    }

    // De-dupe by offer id (a carrier may match via both account and partner).
    const rows = (data || []) as unknown as Array<Record<string, unknown>>;
    const seen = new Set<string>();
    const offers = rows.filter((row) => {
      const offer = row.offer as { id?: string } | null;
      const id = offer?.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    return NextResponse.json({ offers });
  } catch (error) {
    console.error("[carrier-portal/offers] error", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
