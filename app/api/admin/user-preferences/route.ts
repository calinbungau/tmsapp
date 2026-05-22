import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * /api/admin/user-preferences
 *
 * Per-user JSONB preferences bag (preferred map tile, sidebar layout,
 * table column widths, etc.). Authenticated callers identify themselves
 * via `?userId=<uuid>` — the same admin/users UUID surfaced by the
 * `useAdminSession()` hook on the client.
 *
 * GET   → { preferences: Record<string, unknown> }
 * PATCH → merges body.patch (shallow, top-level keys) into existing
 *         preferences and returns the resulting object.
 *
 * The route uses the service role key (server-side only) and sits behind
 * the admin-session cookie wall, mirroring how the rest of /api/admin/*
 * is gated.
 */

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role env vars are not configured");
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId || !isUuid(userId)) {
    return NextResponse.json({ error: "Valid userId required" }, { status: 400 });
  }

  try {
    const s = service();
    const { data, error } = await s
      .from("user_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ preferences: data?.preferences ?? {} });
  } catch (err: any) {
    console.log("[v0] user-preferences GET failed", err?.message);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId || !isUuid(userId)) {
    return NextResponse.json({ error: "Valid userId required" }, { status: 400 });
  }

  let body: { patch?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch = body.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return NextResponse.json({ error: "body.patch must be an object" }, { status: 400 });
  }

  try {
    const s = service();
    // Read-then-merge keeps the JSONB shallow-merged. If we expected
    // heavy write contention we'd switch to `jsonb_strip_nulls(prefs || patch)`
    // via an RPC, but per-user prefs only update on user interaction so
    // a 2-step merge is fine and keeps the code readable.
    const { data: existing, error: readErr } = await s
      .from("user_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) throw readErr;

    const current = (existing?.preferences ?? {}) as Record<string, unknown>;
    const merged = { ...current, ...patch };

    const { data, error } = await s
      .from("user_preferences")
      .upsert({ user_id: userId, preferences: merged }, { onConflict: "user_id" })
      .select("preferences")
      .single();
    if (error) throw error;

    return NextResponse.json({ preferences: data.preferences });
  } catch (err: any) {
    console.log("[v0] user-preferences PATCH failed", err?.message);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
