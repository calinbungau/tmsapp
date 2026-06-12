"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Building2, User, Phone, Mail, CheckCircle2, Loader2 } from "lucide-react"
import { useLanguage } from "./language-provider"
import { submitLead } from "@/app/actions/submit-lead"

type Fields = "company_name" | "contact_name" | "phone" | "email" | "message"

export function LandingContact() {
  const { t, locale } = useLanguage()
  const router = useRouter()
  const [values, setValues] = useState<Record<Fields, string>>({
    company_name: "",
    contact_name: "",
    phone: "",
    email: "",
    message: "",
  })
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({})
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")

  const set = (k: Fields, v: string) => {
    setValues((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }

  const validate = () => {
    const next: Partial<Record<Fields, string>> = {}
    if (!values.company_name.trim()) next.company_name = t.cta.required
    if (!values.contact_name.trim()) next.contact_name = t.cta.required
    if (!values.phone.trim()) next.phone = t.cta.required
    if (!values.email.trim()) next.email = t.cta.required
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = t.cta.invalidEmail
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setStatus("submitting")
    const res = await submitLead({ ...values, locale })
    if (res.ok) {
      setStatus("success")
      setValues({ company_name: "", contact_name: "", phone: "", email: "", message: "" })
      router.push("/thank-you")
    } else {
      setStatus("error")
    }
  }

  const fields: { key: Fields; label: string; type: string; icon: typeof Building2; autoComplete: string }[] = [
    { key: "company_name", label: t.cta.company, type: "text", icon: Building2, autoComplete: "organization" },
    { key: "contact_name", label: t.cta.name, type: "text", icon: User, autoComplete: "name" },
    { key: "phone", label: t.cta.phone, type: "tel", icon: Phone, autoComplete: "tel" },
    { key: "email", label: t.cta.email, type: "email", icon: Mail, autoComplete: "email" },
  ]

  return (
    <section id="contact" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border bg-secondary/40 px-6 py-8 text-center sm:px-10">
            <h2 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {t.cta.title}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              {t.cta.subtitle}
            </p>
          </div>

          <div className="px-6 py-8 sm:px-10">
            {status === "success" ? (
              <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CheckCircle2 className="h-7 w-7" />
                </span>
                <p className="max-w-sm text-pretty text-base font-medium text-foreground">{t.cta.success}</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {fields.map((f) => {
                    const Icon = f.icon
                    return (
                      <div key={f.key} className="flex flex-col gap-1.5">
                        <label htmlFor={f.key} className="text-sm font-medium text-foreground">
                          {f.label}
                        </label>
                        <div className="relative">
                          <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            id={f.key}
                            type={f.type}
                            inputMode={f.type === "tel" ? "tel" : f.type === "email" ? "email" : "text"}
                            autoComplete={f.autoComplete}
                            value={values[f.key]}
                            onChange={(e) => set(f.key, e.target.value)}
                            aria-invalid={!!errors[f.key]}
                            className={`h-12 w-full rounded-lg border bg-background pl-10 pr-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30 ${
                              errors[f.key] ? "border-destructive" : "border-input"
                            }`}
                          />
                        </div>
                        {errors[f.key] && <span className="text-xs text-destructive">{errors[f.key]}</span>}
                      </div>
                    )
                  })}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="message" className="text-sm font-medium text-foreground">
                    {t.cta.message}
                  </label>
                  <textarea
                    id="message"
                    rows={3}
                    value={values.message}
                    onChange={(e) => set("message", e.target.value)}
                    placeholder={t.cta.messagePlaceholder}
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                {status === "error" && <p className="text-sm text-destructive">{t.cta.error}</p>}

                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {status === "submitting" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t.cta.submitting}
                    </>
                  ) : (
                    <>
                      {t.cta.submit}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
