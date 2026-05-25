/**
 * List all available pre-built provider templates (Toll4Europe, Shell, DKV…).
 * Used by the "Add Provider" picker so the UI can show a catalog of supported
 * suppliers without hardcoding the list on the client.
 */

import { NextResponse } from "next/server"
import { PREBUILT_TEMPLATES } from "@/lib/cost-imports/prebuilt"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({
    templates: PREBUILT_TEMPLATES.map((t) => ({
      code: t.code,
      name: t.name,
      provider_type: t.provider_type,
      file_format: t.file_format,
      default_currency: t.default_currency,
      default_cost_code: t.default_cost_code,
      rules_count: t.rules.length,
      notes: t.notes ?? null,
      // Send a preview of mapped fields so the UI can show "Maps 17 columns".
      field_count: Object.keys(t.template.fields || {}).length,
    })),
  })
}
