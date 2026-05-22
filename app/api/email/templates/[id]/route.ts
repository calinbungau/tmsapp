import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET: Get a single template with all translations
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: template, error } = await supabase
    .from("email_templates")
    .select(`
      *,
      email_template_translations (*)
    `)
    .eq("id", id)
    .eq("admin_id", adminId)
    .single();

  if (error || !template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  return NextResponse.json({ template });
}

// PUT: Update template + upsert translations
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, trigger_event, category, is_active, translations } = body;

  const supabase = await createClient();

  // Verify ownership
  const { data: existing } = await supabase
    .from("email_templates")
    .select("id")
    .eq("id", id)
    .eq("admin_id", adminId)
    .single();
  if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Update template metadata
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (trigger_event !== undefined) updates.trigger_event = trigger_event || null;
  if (category !== undefined) updates.category = category;
  if (is_active !== undefined) updates.is_active = is_active;

  const { error: updateErr } = await supabase
    .from("email_templates")
    .update(updates)
    .eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Upsert translations -- delete all and re-insert for simplicity
  if (translations && Array.isArray(translations)) {
    await supabase
      .from("email_template_translations")
      .delete()
      .eq("template_id", id);

    if (translations.length > 0) {
      const translationRows = translations.map((t: any) => ({
        template_id: id,
        language_code: t.language_code,
        subject: t.subject,
        body_html: t.body_html,
        body_text: t.body_text || t.body_html?.replace(/<[^>]*>/g, "") || "",
      }));

      const { error: transErr } = await supabase
        .from("email_template_translations")
        .insert(translationRows);
      if (transErr) return NextResponse.json({ error: transErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE: Delete template and all translations (cascade)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .delete()
    .eq("id", id)
    .eq("admin_id", adminId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
