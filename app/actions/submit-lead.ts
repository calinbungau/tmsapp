"use server"

import { createClient } from "@/lib/supabase/server"

export type LeadResult = { ok: true } | { ok: false; error: string }

export async function submitLead(formData: {
  company_name: string
  contact_name: string
  phone: string
  email: string
  message?: string
  locale?: string
}): Promise<LeadResult> {
  const company = formData.company_name?.trim()
  const name = formData.contact_name?.trim()
  const phone = formData.phone?.trim()
  const email = formData.email?.trim()

  if (!company || !name || !phone || !email) {
    return { ok: false, error: "missing_fields" }
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  if (!emailOk) return { ok: false, error: "invalid_email" }

  const supabase = await createClient()
  const { error } = await supabase.from("marketing_leads").insert({
    company_name: company,
    contact_name: name,
    phone,
    email,
    message: formData.message?.trim() || null,
    locale: formData.locale ?? "ro",
    source: "landing",
  })

  if (error) {
    console.log("[v0] submitLead error:", error.message)
    return { ok: false, error: "db_error" }
  }

  return { ok: true }
}
