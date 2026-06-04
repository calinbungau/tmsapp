import { redirect } from "next/navigation";

/**
 * Notification deep-link landing route.
 *
 * The native Traccar Manager shell (traccar/traccar-manager → main_screen.dart)
 * navigates the WebView to `${server}/event/${eventId}` when a push notification
 * is tapped — on cold start via `getInitialMessage()` and on warm resume via
 * `onMessageOpenedApp`. It reads the `eventId` field from the FCM data payload.
 *
 * For carrier freight-exchange notifications we set `eventId` to the recipient's
 * portal token (see lib/notifications.ts), so the shell lands here at
 * `/event/{token}`. We forward to the public, login-free offer portal at
 * `/exchange/o/{token}`, which auto-unlocks via session bypass when the carrier
 * is already logged in, or shows that offer's PIN screen otherwise. This is the
 * same destination the offer email link uses.
 */
export default async function NotificationEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  // Carrier offer tokens are the only event ids we currently emit. Forward to
  // the public offer portal keyed by that token.
  redirect(`/exchange/o/${encodeURIComponent(eventId)}`);
}
