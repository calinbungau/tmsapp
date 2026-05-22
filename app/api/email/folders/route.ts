import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import { ImapFlow } from "imapflow";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const adminId = request.headers.get("x-admin-id");
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: settings } = await supabase
      .from("user_email_settings")
      .select("*")
      .eq("admin_id", adminId)
      .single();

    if (!settings || !settings.imap_password_encrypted) {
      return NextResponse.json({ error: "Email not configured" }, { status: 400 });
    }

    const imapPass = decrypt(settings.imap_password_encrypted);

    const client = new ImapFlow({
      host: settings.imap_host,
      port: settings.imap_port,
      secure: settings.imap_secure,
      auth: { user: settings.imap_user, pass: imapPass },
      logger: false,
      greetTimeout: 10000,
      socketTimeout: 10000,
    });

    const folders: any[] = [];

    try {
      await client.connect();
      const tree = await client.list();

      for (const item of tree) {
        folders.push({
          path: item.path,
          name: item.name,
          delimiter: item.delimiter,
          specialUse: item.specialUse || null,
          flags: Array.from(item.flags || []),
        });
      }

      await client.logout();
    } catch (connErr: any) {
      return NextResponse.json({ error: connErr.message }, { status: 500 });
    }

    return NextResponse.json({ folders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
