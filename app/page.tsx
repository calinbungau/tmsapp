import type { Metadata } from "next"
import { LanguageProvider } from "@/components/landing/language-provider"
import { LandingNavbar } from "@/components/landing/landing-navbar"
import { LandingHero } from "@/components/landing/landing-hero"
import { LandingStats } from "@/components/landing/landing-stats"
import { LandingFeatures } from "@/components/landing/landing-features"
import { LandingPlatform } from "@/components/landing/landing-platform"
import { LandingContact } from "@/components/landing/landing-contact"
import { LandingFooter } from "@/components/landing/landing-footer"

export const metadata: Metadata = {
  title: "BNG Tracking — Transport & Fleet Management Platform",
  description:
    "BNG Tracking unifies fleet GPS tracking, transport management, freight exchange, invoicing and cost control into one intelligent platform for carriers and freight forwarders.",
  openGraph: {
    title: "BNG Tracking — Transport & Fleet Management Platform",
    description:
      "Fleet GPS tracking, TMS, freight exchange, invoicing and cost control in one intelligent platform.",
  },
}

export default function HomePage() {
  return (
    <LanguageProvider>
      <div className="min-h-svh bg-background">
        <LandingNavbar />
        <main>
          <LandingHero />
          <LandingStats />
          <LandingFeatures />
          <LandingPlatform />
          <LandingContact />
        </main>
        <LandingFooter />
      </div>
    </LanguageProvider>
  )
}
