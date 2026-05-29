/**
 * GET /api/saga/ping
 *
 * Lightweight connectivity / credential check for the Saga agent.
 * Returns the authenticated tenant id and granted scopes so the agent
 * can verify its configuration before polling.
 *
 * Auth: x-api-key / x-api-username / x-api-secret  (scope: saga:read)
 */

import { type NextRequest, NextResponse } from "next/server"
import { authenticateApiRequest } from "@/lib/api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const auth = await authenticateApiRequest(req, "saga:read")
  if (!auth.ok || !auth.credential) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }
  return NextResponse.json({
    ok: true,
    adminId: auth.credential.admin_id,
    name: auth.credential.name,
    scopes: auth.credential.scopes,
    serverTime: new Date().toISOString(),
  })
}
