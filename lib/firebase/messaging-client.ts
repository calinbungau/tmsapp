// Browser-side Firebase Cloud Messaging helper for the carrier portal.
//
// This runs ONLY in the browser. It initialises the Firebase web app, registers
// the messaging service worker, requests notification permission, and returns
// the device FCM token. The token is then registered against the logged-in
// carrier account (see app/carrier-dashboard/layout.tsx) and stored in
// `carrier_devices` so the existing server-side FCM send path can reach it.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  type Messaging,
} from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // Firebase derives these from the project id; including them keeps the SDK
  // happy and matches the auto-generated web config object.
  authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  storageBucket: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`,
};

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

function hasConfig(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId &&
      VAPID_KEY
  );
}

function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

// Build the SW URL carrying the public config as query params, so the service
// worker (which cannot read process.env) can initialise Firebase itself.
function buildServiceWorkerUrl(): string {
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey || "",
    projectId: firebaseConfig.projectId || "",
    messagingSenderId: firebaseConfig.messagingSenderId || "",
    appId: firebaseConfig.appId || "",
  });
  return `/firebase-messaging-sw.js?${params.toString()}`;
}

let messagingPromise: Promise<Messaging | null> | null = null;

async function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!hasConfig()) {
    console.warn("[carrier-push] Firebase web config missing — browser push disabled");
    return null;
  }
  if (!(await isSupported().catch(() => false))) return null;
  if (!("serviceWorker" in navigator)) return null;
  return getMessaging(getFirebaseApp());
}

/**
 * Request notification permission and return the device FCM token, or null if
 * the user declined, the browser is unsupported, or config is missing.
 * Safe to call repeatedly — Firebase returns the same token for a device.
 */
export async function requestCarrierWebPushToken(): Promise<string | null> {
  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return null;

    if (typeof Notification === "undefined") return null;
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return null;

    const registration = await navigator.serviceWorker.register(
      buildServiceWorkerUrl(),
      { scope: "/firebase-cloud-messaging-push-scope" }
    );

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    return token || null;
  } catch (err) {
    console.error("[carrier-push] failed to obtain web push token", err);
    return null;
  }
}

/**
 * Subscribe to foreground messages (when the carrier has the tab focused).
 * Returns an unsubscribe function. No-op when messaging is unavailable.
 */
export async function onCarrierForegroundMessage(
  handler: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void
): Promise<() => void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    handler({
      title: payload.notification?.title,
      body: payload.notification?.body,
      data: payload.data as Record<string, string> | undefined,
    });
  });
}
