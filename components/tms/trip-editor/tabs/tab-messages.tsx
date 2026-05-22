"use client"

import { TripChat } from "@/components/chat/trip-chat"
import { Spinner } from "@/components/ui/spinner"
import { useAdminSession } from "@/hooks/use-admin-session"

interface TabMessagesProps {
  tripId: string
  /** Owner of the trip — fallback only; we prefer the *live* admin session. */
  adminId?: string
  /** Optional: trip reference for display */
  tripReference?: string
  /** Optional: driver info for conversation participant */
  driverId?: string | null
  driverName?: string | null
}

/**
 * TabMessages: Trip-level messaging in the trip editor drawer.
 *
 * Source of truth for "who am I" is the canonical `useAdminSession()` hook —
 * the same one every other admin page uses. It hydrates from
 * `localStorage.admin_session` (`{ id, email, company_name, ... }`) which the
 * admin login page populates after a successful sign-in. We pass that admin
 * id/name down to the unified chat system so messages are visible to both
 * the dispatcher and the driver of the same trip.
 *
 * The `adminId` prop is kept only as a defensive fallback for pages that
 * might mount this component before localStorage is read (SSR edge cases).
 */
export function TabMessages({
  tripId,
  adminId,
  tripReference,
  driverId,
  driverName,
}: TabMessagesProps) {
  const { session, loading } = useAdminSession()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-12">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  // Prefer the live session; fall back to the trip's stored admin_id only if
  // there is genuinely no session at all.
  const userId = session?.id || adminId || ""
  const userName =
    session?.email?.split("@")[0] || session?.company_name || "Dispatcher"

  if (!userId) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Sign in again to view trip messages.
      </div>
    )
  }

  return (
    <div className="h-full min-h-0">
      <TripChat
        tripId={tripId}
        tripReference={tripReference || `Trip ${tripId.slice(0, 8)}`}
        currentUserId={userId}
        currentUserType="admin"
        currentUserName={userName}
        driverId={driverId}
        driverName={driverName}
      />
    </div>
  )
}
