import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET: List all templates for the admin
export async function GET(request: Request) {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: templates, error } = await supabase
    .from("email_templates")
    .select(`
      *,
      email_template_translations ( id, language_code, subject )
    `)
    .eq("admin_id", adminId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ templates: templates || [] });
}

// POST: Create a new template with translations
export async function POST(request: Request) {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, trigger_event, category, is_active, translations } = body;

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const supabase = await createClient();

  // Create template
  const { data: template, error: tplErr } = await supabase
    .from("email_templates")
    .insert({
      admin_id: adminId,
      name,
      trigger_event: trigger_event || null,
      category: category || "general",
      is_active: is_active !== false,
    })
    .select()
    .single();

  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });

  // Insert translations if provided
  if (translations && Array.isArray(translations) && translations.length > 0) {
    const translationRows = translations.map((t: any) => ({
      template_id: template.id,
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

  return NextResponse.json({ template }, { status: 201 });
}

// PUT: Update a template and its translations
export async function PUT(request: Request) {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, name, trigger_event, category, is_active, variables, translations } = body;

  if (!id) return NextResponse.json({ error: "Template id required" }, { status: 400 });

  const supabase = await createClient();

  // Update template metadata
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (trigger_event !== undefined) updates.trigger_event = trigger_event;
  if (category !== undefined) updates.category = category;
  if (is_active !== undefined) updates.is_active = is_active;
  if (variables !== undefined) updates.variables = variables;

  const { error: updErr } = await supabase
    .from("email_templates")
    .update(updates)
    .eq("id", id)
    .eq("admin_id", adminId);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Upsert translations
  if (translations && Array.isArray(translations)) {
    for (const t of translations) {
      if (t.id) {
        await supabase
          .from("email_template_translations")
          .update({
            subject: t.subject,
            body_html: t.body_html,
            body_text: t.body_text || t.body_html?.replace(/<[^>]*>/g, "") || "",
            language_code: t.language_code,
            updated_at: new Date().toISOString(),
          })
          .eq("id", t.id);
      } else if (t._delete && t.id) {
        await supabase.from("email_template_translations").delete().eq("id", t.id);
      } else {
        await supabase.from("email_template_translations").insert({
          template_id: id,
          language_code: t.language_code,
          subject: t.subject,
          body_html: t.body_html,
          body_text: t.body_text || t.body_html?.replace(/<[^>]*>/g, "") || "",
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE: Remove a template (cascades translations)
export async function DELETE(request: Request) {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Template id required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .delete()
    .eq("id", id)
    .eq("admin_id", adminId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
