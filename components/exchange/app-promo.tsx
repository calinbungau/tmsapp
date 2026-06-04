import { Apple, Play } from "lucide-react";
import { APP_LINKS, APP_NAME } from "@/lib/exchange/app-links";

/**
 * Promotes the BNG Tracking mobile app with App Store / Google Play buttons.
 * Store URLs live in lib/exchange/app-links.ts (swap placeholders when live).
 */
export function AppPromo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {!compact && (
        <>
          <p className="text-sm font-semibold text-foreground">Get the {APP_NAME} app</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Manage every offer, respond faster, and chat with dispatchers on the go.
            Create your free carrier account in the app.
          </p>
        </>
      )}
      <div className={`flex flex-col sm:flex-row gap-2 ${compact ? "" : "mt-3"}`}>
        <a
          href={APP_LINKS.appStore}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-background transition-opacity hover:opacity-90"
        >
          <Apple className="h-5 w-5" />
          <span className="text-left leading-tight">
            <span className="block text-[10px] opacity-80">Download on the</span>
            <span className="block text-sm font-semibold">App Store</span>
          </span>
        </a>
        <a
          href={APP_LINKS.googlePlay}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-background transition-opacity hover:opacity-90"
        >
          <Play className="h-5 w-5" />
          <span className="text-left leading-tight">
            <span className="block text-[10px] opacity-80">Get it on</span>
            <span className="block text-sm font-semibold">Google Play</span>
          </span>
        </a>
      </div>
    </div>
  );
}
