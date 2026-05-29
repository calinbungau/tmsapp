/**
 * Admin CRUD for server-to-server API credentials (api_credentials).
 *
 *   GET    /api/admin/api-credentials?admin_id=...      list (no secrets)
 *   POST   /api/admin/api-credentials                   create -> returns plaintext secret ONCE
 *   PATCH  /api/admin/api-credentials                   toggle is_active
 *   DELETE /api/admin/api-credentials?id=...&admin_id=  revoke
 *
 * The plaintext secret is returned only in the POST response and never stored.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { generateCredentialMaterial, hashSecret } from "@/lib/api-auth"

export const runtime = "nodejs"

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const ALLOWED_SCOPES = ["saga:read", "saga:write", "saga:import"]

export async function GET(req: NextRequest) {
  const adminId = req.nextUrl.searchParams.get("admin_id")
  if (!adminId) return NextResponse.json({ credentials: [] })

  const supabase = service()
  const { data, error } = await supabase
    .from("api_credentials")
    .select("id, name, key_id, username, scopes, is_active, last_used_at, expires_at, created_at")
    .eq("admin_id", adminId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ credentials: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { admin_id, name, username, scopes, created_by, expires_at } = body
  if (!admin_id || !name || !username) {
    return NextResponse.json({ error: "admin_id, name and username are required" }, { status: 400 })
  }

  const requestedScopes: string[] = Array.isArray(scopes) ? scopes : []
  const validScopes = requestedScopes.filter((s) => ALLOWED_SCOPES.includes(s))
  if (validScopes.length === 0) {
    return NextResponse.json({ error: "At least one valid scope is required" }, { status: 400 })
  }

  const { keyId, secret } = generateCredentialMaterial()
  const secretHash = await hashSecret(secret)

  const supabase = service()
  const { data, error } = await supabase
    .from("api_credentials")
    .insert({
      admin_id,
      name,
      username,
      key_id: keyId,
      secret_hash: secretHash,
      scopes: validScopes,
      created_by: created_by ?? null,
      expires_at: expires_at ?? null,
    })
    .select("id, name, key_id, username, scopes, is_active, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Plaintext secret returned ONLY here — never stored or shown again.
  return NextResponse.json({ credential: data, secret, keyId, username })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, admin_id, is_active } = body
  if (!id || !admin_id) return NextResponse.json({ error: "id and admin_id required" }, { status: 400 })

  const supabase = service()
  const { error } = await supabase
    .from("api_credentials")
    .update({ is_active: !!is_active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("admin_id", admin_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  const adminId = req.nextUrl.searchParams.get("admin_id")
  if (!id || !adminId) return NextResponse.json({ error: "id and admin_id required" }, { status: 400 })

  const supabase = service()
  const { error } = await supabase.from("api_credentials").delete().eq("id", id).eq("admin_id", adminId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
