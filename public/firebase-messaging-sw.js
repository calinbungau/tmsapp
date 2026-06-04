/* Firebase Cloud Messaging service worker for the carrier portal (browser push).
 *
 * The web app registers this SW with the public Firebase config passed as query
 * params (a service worker cannot read process.env). It uses the compat build
 * from the CDN so no bundling step is required for the worker itself.
 */
/* eslint-disable no-undef */

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

const params = new URL(self.location).searchParams;
const firebaseConfig = {
  apiKey: params.get("apiKey"),
  projectId: params.get("projectId"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
  authDomain: `${params.get("projectId")}.firebaseapp.com`,
  storageBucket: `${params.get("projectId")}.appspot.com`,
};

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = (payload.notification && payload.notification.title) || "BNG Tracking";
    const options = {
      body: (payload.notification && payload.notification.body) || "",
      icon: "/images/logo-full-bng.png",
      badge: "/images/logo-full-bng.png",
      data: payload.data || {},
      tag: (payload.data && payload.data.offer_id) || undefined,
    };
    self.registration.showNotification(title, options);
  });
}

// Focus/open the relevant offer when the carrier taps a notification.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  // The carrier offer route is keyed by the portal token, not the offer id.
  // Fall back to the relevant dashboard tab when no token is present.
  const token = data.token;
  const type = data.type || "";
  let url = "/carrier-dashboard";
  if (token) url = `/carrier-dashboard/offers/${token}`;
  else if (type === "chat_message") url = "/carrier-dashboard/chat";
  else if (type.startsWith("freight_offer")) url = "/carrier-dashboard/responses";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/carrier-dashboard") && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
