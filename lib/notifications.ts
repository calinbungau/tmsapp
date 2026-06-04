import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { SignJWT, importPKCS8 } from "jose";

// Service-role client for contexts (exchange / portal routes) that authenticate
// via custom headers rather than a Supabase cookie session.
function getNotificationsServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Firebase Admin SDK initialization
// You'll need to set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY env vars

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface SendNotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Get Firebase access token using service account (jose library for edge-compatible JWT)
async function getFirebaseAccessToken(): Promise<string | null> {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  
  if (!clientEmail || !privateKey) {
    console.error("Firebase credentials not configured");
    return null;
  }

  try {
    const key = await importPKCS8(privateKey, "RS256");

    const jwt = await new SignJWT({
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(clientEmail)
      .setSubject(clientEmail)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

    // Exchange JWT for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  } catch (error) {
    console.error("Error getting Firebase access token:", error);
    return null;
  }
}

// Send notification to a single FCM token
export async function sendPushNotification(
  fcmToken: string,
  notification: NotificationPayload
): Promise<SendNotificationResult> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  
  if (!projectId) {
    return { success: false, error: "Firebase project ID not configured" };
  }

  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) {
    return { success: false, error: "Failed to get Firebase access token" };
  }

  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification: {
              title: notification.title,
              body: notification.body,
            },
            data: notification.data || {},
            android: {
              priority: "high",
              notification: {
                sound: "default",
                click_action: "FLUTTER_NOTIFICATION_CLICK",
              },
            },
          },
        }),
      }
    );

    const result = await response.json();

    if (response.ok) {
      return { success: true, messageId: result.name };
    } else {
      return { success: false, error: result.error?.message || "Unknown error" };
    }
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Send notification to a driver by their ID
export async function sendNotificationToDriver(
  driverId: string,
  notification: NotificationPayload
): Promise<SendNotificationResult> {
  const supabase = await createClient();
  
  const { data: driver, error } = await supabase
    .from("drivers")
    .select("fcm_token, name")
    .eq("id", driverId)
    .single();

  if (error || !driver) {
    return { success: false, error: "Driver not found" };
  }

  if (!driver.fcm_token) {
    return { success: false, error: "Driver has no FCM token registered" };
  }

  return sendPushNotification(driver.fcm_token, notification);
}

// Send notification to a driver by their PIN
export async function sendNotificationToDriverByPin(
  pinCode: string,
  notification: NotificationPayload
): Promise<SendNotificationResult> {
  const supabase = await createClient();
  
  const { data: driver, error } = await supabase
    .from("drivers")
    .select("fcm_token, name")
    .eq("pin_code", pinCode)
    .single();

  if (error || !driver) {
    return { success: false, error: "Driver not found" };
  }

  if (!driver.fcm_token) {
    return { success: false, error: "Driver has no FCM token registered" };
  }

  return sendPushNotification(driver.fcm_token, notification);
}

// Send notification to multiple drivers
export async function sendNotificationToDrivers(
  driverIds: string[],
  notification: NotificationPayload
): Promise<{ results: Record<string, SendNotificationResult> }> {
  const results: Record<string, SendNotificationResult> = {};

  for (const driverId of driverIds) {
    results[driverId] = await sendNotificationToDriver(driverId, notification);
  }

  return { results };
}

// Send notification to all drivers of an admin
export async function sendNotificationToAllDrivers(
  adminId: string,
  notification: NotificationPayload
): Promise<{ sent: number; failed: number; results: Record<string, SendNotificationResult> }> {
  const supabase = await createClient();
  
  const { data: drivers, error } = await supabase
    .from("drivers")
    .select("id, fcm_token, name")
    .eq("admin_id", adminId)
    .not("fcm_token", "is", null);

  if (error || !drivers) {
    return { sent: 0, failed: 0, results: {} };
  }

  const results: Record<string, SendNotificationResult> = {};
  let sent = 0;
  let failed = 0;

  for (const driver of drivers) {
    if (driver.fcm_token) {
      const result = await sendPushNotification(driver.fcm_token, notification);
      results[driver.id] = result;
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }
  }

  return { sent, failed, results };
}

// ─── Carrier push (BNG Tracking carrier app) ───────────────────────────────
// Carriers register their device FCM token in `carrier_devices` (keyed by
// carrier_account_id). These helpers fan a notification out to every device a
// carrier has registered, mirroring the driver helpers above.

/**
 * Resolve the set of carrier_account ids to notify, given either a direct
 * carrier_account_id (the recipient is already linked to a logged-in account)
 * and/or a business partner id (the carrier may have an account linked to that
 * partner). Either field may be null.
 */
export async function resolveCarrierAccountIds(opts: {
  carrierAccountId?: string | null;
  partnerId?: string | null;
}): Promise<string[]> {
  const ids = new Set<string>();
  if (opts.carrierAccountId) ids.add(opts.carrierAccountId);

  if (opts.partnerId) {
    const supabase = getNotificationsServiceClient();
    const { data } = await supabase
      .from("carrier_accounts")
      .select("id")
      .eq("partner_id", opts.partnerId)
      .eq("status", "active");
    for (const row of data || []) ids.add(row.id);
  }

  return Array.from(ids);
}

/**
 * Send a push notification to every device registered by the given carrier
 * accounts. Tokens are de-duplicated so a carrier with the offer open on
 * multiple surfaces only receives one push per device.
 */
export async function sendNotificationToCarrierAccounts(
  carrierAccountIds: string[],
  notification: NotificationPayload
): Promise<{ sent: number; failed: number }> {
  if (!carrierAccountIds.length) return { sent: 0, failed: 0 };

  const supabase = getNotificationsServiceClient();
  const { data: devices } = await supabase
    .from("carrier_devices")
    .select("fcm_token")
    .in("carrier_account_id", carrierAccountIds)
    .not("fcm_token", "is", null);

  const tokens = Array.from(
    new Set((devices || []).map((d) => d.fcm_token).filter(Boolean) as string[])
  );

  let sent = 0;
  let failed = 0;
  for (const token of tokens) {
    const result = await sendPushNotification(token, notification);
    if (result.success) sent++;
    else failed++;
  }
  return { sent, failed };
}

/**
 * Convenience helper for the freight-exchange flows: notify a carrier given a
 * recipient row's identifiers. Resolves devices via the linked carrier account
 * (direct id and/or partner id) and pushes to all of them. No-op when the
 * carrier has not registered the app yet (they still receive email).
 */
export async function sendNotificationToCarrier(
  ref: { carrierAccountId?: string | null; partnerId?: string | null },
  notification: NotificationPayload
): Promise<{ sent: number; failed: number }> {
  const accountIds = await resolveCarrierAccountIds({
    carrierAccountId: ref.carrierAccountId,
    partnerId: ref.partnerId,
  });
  return sendNotificationToCarrierAccounts(accountIds, notification);
}

// Notification templates for common events
export const NotificationTemplates = {
  maintenanceDue: (vehiclePlate: string, maintenanceType: string) => ({
    title: "Maintenance Due",
    body: `${maintenanceType} is due for vehicle ${vehiclePlate}`,
    data: { type: "maintenance_due", vehicle: vehiclePlate },
  }),
  
  maintenanceReminder: (vehiclePlate: string, maintenanceType: string, daysUntil: number) => ({
    title: "Maintenance Reminder",
    body: `${maintenanceType} for ${vehiclePlate} is due in ${daysUntil} days`,
    data: { type: "maintenance_reminder", vehicle: vehiclePlate },
  }),
  
  formAssigned: (formTitle: string) => ({
    title: "New Form Assigned",
    body: `You have been assigned a new form: ${formTitle}`,
    data: { type: "form_assigned" },
  }),
  
  inspectionReminder: (vehiclePlate: string) => ({
    title: "Inspection Reminder",
    body: `Please complete your daily inspection for ${vehiclePlate}`,
    data: { type: "inspection_reminder", vehicle: vehiclePlate },
  }),
  
  custom: (title: string, body: string, data?: Record<string, string>) => ({
    title,
    body,
    data,
  }),

  // ─── Carrier (freight exchange) events ───────────────────────────────────
  // `token` is the recipient's portal token, used by the carrier service worker
  // to deep-link straight to /carrier-dashboard/offers/[token].
  newFreightOffer: (route: string, reference: string, offerId: string, token?: string | null) => ({
    title: "New freight offer",
    body: `${route} · ref ${reference}`,
    data: cleanData({ type: "freight_offer_new", offer_id: offerId, token }),
  }),

  quoteAccepted: (reference: string, offerId: string, token?: string | null) => ({
    title: "Offer awarded to you",
    body: `You have been awarded offer ${reference}. The dispatcher will follow up with the transport order.`,
    data: cleanData({ type: "freight_offer_awarded", offer_id: offerId, token }),
  }),

  quoteDeclined: (reference: string, offerId: string, token?: string | null) => ({
    title: "Response declined",
    body: `The dispatcher has declined your response to offer ${reference}.`,
    data: cleanData({ type: "freight_offer_declined", offer_id: offerId, token }),
  }),

  offerReopened: (reference: string, offerId: string, token?: string | null) => ({
    title: "Offer re-opened",
    body: `The dispatcher has re-opened offer ${reference}.`,
    data: cleanData({ type: "freight_offer_reopened", offer_id: offerId, token }),
  }),

  carrierChatMessage: (
    senderName: string,
    preview: string,
    offerId: string,
    recipientId: string,
    token?: string | null
  ) => ({
    title: `Message from ${senderName}`,
    body: preview,
    data: cleanData({ type: "chat_message", offer_id: offerId, recipient_id: recipientId, token }),
  }),
};

// FCM data values must all be strings; drop null/undefined entries.
function cleanData(obj: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v != null) out[k] = String(v);
  }
  return out;
}
