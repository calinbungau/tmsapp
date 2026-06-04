import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email: string = (body.email || "").toLowerCase().trim();
    const password: string = body.password || "";
    const companyName: string | null = body.companyName?.trim() || null;
    const contactName: string | null = body.contactName?.trim() || null;
    const phone: string | null = body.phone?.trim() || null;
    const vatNumber: string | null = body.vatNumber?.trim() || null;
    // Optional portal token: when a carrier signs up directly from an offer
    // link, we link their account to the existing business_partner + recipient.
    const token: string | null = body.token || null;

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      return NextResponse.json({ success: false, error: "Adresă de e-mail invalidă" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: "Parola trebuie să aibă cel puțin 6 caractere" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Reject duplicate emails (case-insensitive).
    const { data: existing } = await supabase
      .from("carrier_accounts")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Există deja un cont cu acest e-mail. Autentificați-vă." },
        { status: 409 }
      );
    }

    // If a portal token is supplied, pull partner_id + prefill from the recipient.
    let partnerId: string | null = null;
    let prefillCompany: string | null = null;
    if (token) {
      const { data: recipient } = await supabase
        .from("freight_offer_recipients")
        .select("partner_id, carrier_name")
        .eq("token", token)
        .maybeSingle();
      if (recipient) {
        partnerId = recipient.partner_id ?? null;
        prefillCompany = recipient.carrier_name ?? null;
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { data: account, error } = await supabase
      .from("carrier_accounts")
      .insert({
        email,
        password_hash: passwordHash,
        company_name: companyName || prefillCompany,
        contact_name: contactName,
        phone,
        vat_number: vatNumber,
        partner_id: partnerId,
        status: "active",
      })
      .select("id, email, company_name, contact_name, phone, vat_number")
      .single();

    if (error || !account) {
      console.error("[carrier-auth/signup] insert failed", error);
      return NextResponse.json(
        { success: false, error: "Nu am putut crea contul. Încercați din nou." },
        { status: 500 }
      );
    }

    // Backfill: link any existing recipient rows for this partner/email to the
    // new account so the carrier immediately sees their past offers in the app.
    try {
      if (partnerId) {
        await supabase
          .from("freight_offer_recipients")
          .update({ carrier_account_id: account.id })
          .eq("partner_id", partnerId)
          .is("carrier_account_id", null);
      }
      await supabase
        .from("freight_offer_recipients")
        .update({ carrier_account_id: account.id })
        .eq("email", email)
        .is("carrier_account_id", null);
    } catch (e) {
      console.error("[carrier-auth/signup] recipient backfill failed", e);
    }

    return NextResponse.json({
      success: true,
      session: {
        id: account.id,
        email: account.email,
        company_name: account.company_name,
        contact_name: account.contact_name,
        phone: account.phone,
        vat_number: account.vat_number,
      },
    });
  } catch (error) {
    console.error("[carrier-auth/signup] error", error);
    return NextResponse.json(
      { success: false, error: "A apărut o eroare la crearea contului" },
      { status: 500 }
    );
  }
}
