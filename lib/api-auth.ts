import { createClient } from "@supabase/supabase-js"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import type { NextRequest } from "next/server"

/**
 * Server-to-server API authentication for external agents (e.g. the Saga
 * accountant agent). Credentials live in the `api_credentials` table:
 *   - key_id      public identifier, sent in the `x-api-key` header
 *   - username    sent in the `x-api-username` header
 *   - secret_hash bcrypt hash of the secret, compared against `x-api-secret`
 *
 * The plaintext secret is only ever shown once, at creation time.
 */

export type ApiScope = "saga:read" | "saga:write" | "saga:import"

export interface ApiCredentialRow {
  id: string
  admin_id: string
  name: string
  key_id: string
  username: string
  secret_hash: string
  scopes: string[]
  is_active: boolean
  expires_at: string | null
}

export interface AuthResult {
  ok: boolean
  status: number
  error?: string
  credential?: ApiCredentialRow
}

/** Service-role Supabase client — bypasses RLS, for trusted server routes only. */
export function getServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("Supabase service role credentials are not configured")
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Generates a fresh credential triple. Secret is returned ONLY here. */
export function generateCredentialMaterial() {
  const keyId = `tms_${randomBytes(12).toString("hex")}`
  const secret = randomBytes(32).toString("base64url")
  return { keyId, secret }
}

export async function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, 12)
}

/**
 * Authenticates an incoming request against `api_credentials`.
 * Requires headers: x-api-key, x-api-username, x-api-secret.
 * Optionally enforces that the credential carries `requiredScope`.
 */
export async function authenticateApiRequest(
  req: NextRequest,
  requiredScope?: ApiScope,
): Promise<AuthResult> {
  const keyId = req.headers.get("x-api-key")?.trim()
  const username = req.headers.get("x-api-username")?.trim()
  const secret = req.headers.get("x-api-secret")?.trim()

  if (!keyId || !username || !secret) {
    return { ok: false, status: 401, error: "Missing API credentials" }
  }

  const supabase = getServiceClient()
  const { data: cred, error } = await supabase
    .from("api_credentials")
    .select("id, admin_id, name, key_id, username, secret_hash, scopes, is_active, expires_at")
    .eq("key_id", keyId)
    .maybeSingle()

  if (error || !cred) {
    return { ok: false, status: 401, error: "Invalid API key" }
  }
  if (!cred.is_active) {
    return { ok: false, status: 403, error: "API key is disabled" }
  }
  if (cred.expires_at && new Date(cred.expires_at) < new Date()) {
    return { ok: false, status: 403, error: "API key has expired" }
  }
  if (cred.username !== username) {
    return { ok: false, status: 401, error: "Invalid credentials" }
  }

  const secretOk = await bcrypt.compare(secret, cred.secret_hash)
  if (!secretOk) {
    return { ok: false, status: 401, error: "Invalid credentials" }
  }

  if (requiredScope && !cred.scopes?.includes(requiredScope)) {
    return { ok: false, status: 403, error: `Missing required scope: ${requiredScope}` }
  }

  // Best-effort last-used timestamp; ignore failures.
  await supabase
    .from("api_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", cred.id)

  return { ok: true, status: 200, credential: cred as ApiCredentialRow }
}
