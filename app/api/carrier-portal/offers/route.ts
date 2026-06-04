import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Offers visible to a logged-in carrier account, across EVERY tenant that has
 * engaged this carrier. We read the carrier id from the `x-carrier-id` header
 * (set by the dashboard from localStorage) and resolve all linked partner ids
 * from carrier_account_partners (one row per tenant). Recipient rows are
 * matched either directly (carrier_account_id) or via any linked partner_id, so
 * a single account sees offers from all tenants it works with.
 */
export async function GET(request: NextRequest) {
  try {
    const carrierId = request.headers.get("x-carrier-id");
    if (!carrierId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    const { data: account } = await supabase
      .from("carrier_accounts")
      .select("id, partner_id")
      .eq("id", carrierId)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Resolve every tenant business partner linked to this global account.
    const { data: links } = await supabase
      .from("carrier_account_partners")
      .select("partner_id")
      .eq("carrier_account_id", carrierId);

    const partnerIds = new Set<string>();
    if (account.partner_id) partnerIds.add(account.partner_id);
    for (const l of links || []) {
      if (l.partner_id) partnerIds.add(l.partner_id);
    }

    const orFilters = [`carrier_account_id.eq.${carrierId}`];
    if (partnerIds.size > 0) {
      orFilters.push(`partner_id.in.(${Array.from(partnerIds).join(",")})`);
    }

    const { data, error } = await supabase
      .from("freight_offer_recipients")
      .select(
        "id, token, response, responded_at, quote_amount, quote_currency, first_viewed_at, expires_at, " +
          "dispatcher_decision, decided_at, admin_id, " +
          // Disambiguate: two FKs exist between these tables (offer_id and
          // awarded_recipient_id), so we must name the offer_id relationship.
          "offer:freight_offers!freight_offer_recipients_offer_id_fkey(id, reference, title, status, origin_city, origin_country, dest_city, " +
          "dest_country, load_date_from, unload_date_from, vehicle_type, weight_kg, pricing_mode, " +
          "price_amount, currency, expires_at, awarded_recipient_id)"
      )
      .or(orFilters.join(","))
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[carrier-portal/offers] query failed", error);
      return NextResponse.json({ error: "Failed to load offers" }, { status: 500 });
    }

    const rows = (data || []) as unknown as Array<Record<string, unknown>>;

    // Resolve sending-tenant company names so cards can show who sent the offer.
    const adminIds = Array.from(
      new Set(rows.map((r) => r.admin_id as string).filter(Boolean))
    );
    const tenantNames = new Map<string, string>();
    if (adminIds.length > 0) {
      const { data: tenants } = await supabase
        .from("admins")
        .select("id, company_name, name")
        .in("id", adminIds);
      for (const t of tenants || []) {
        const label = (t.company_name as string) || (t.name as string);
        if (label) tenantNames.set(t.id as string, label);
      }
    }

    // De-dupe by offer id (a carrier may match via both account and partner).
    const seen = new Set<string>();
    const offers = rows
      .filter((row) => {
        const offer = row.offer as { id?: string } | null;
        const id = offer?.id;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((row) => ({
        ...row,
        from_company: tenantNames.get(row.admin_id as string) || null,
      }));

    return NextResponse.json({ offers });
  } catch (error) {
    console.error("[carrier-portal/offers] error", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
