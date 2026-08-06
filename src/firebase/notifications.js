import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { app } from "./config";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "./config";

const VAPID_KEY = "BDPG3EWg1tJKh1nN_yOnWgK3BYJjQ-fpYTk1NQrGqU0EHTRZWMWhOUNyANHv52BnUvPBmZFK8ssfsOKWLtqJasA";

// Holds a chatId that arrived via a notification tap or background payload
// before the app was ready to route it, so it isn't lost on cold start.
let notificationTapHandler = null;
let pendingTapChatId = null;

// App registers a handler once; any chatId captured before that (cold start)
// is delivered immediately.
export function setNotificationTapHandler(handler) {
  notificationTapHandler = handler;
  if (pendingTapChatId) {
    const chatId = pendingTapChatId;
    pendingTapChatId = null;
    handler?.(chatId);
  }
}

export function triggerNotificationVibration() {
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {}
}

export function showLocalNotification(title, body, tag = "nextext-msg") {
  triggerNotificationVibration();
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title || "NexText", {
        body: body || "You have a new message.",
        icon: "/icon.png",
        badge: "/icon.png",
        tag,
        vibrate: [200, 100, 200],
      });
    }
  } catch (e) {
    console.warn("[notifications] Notification error:", e);
  }
}

export async function initNotifications(myUid) {
  if (!myUid) return null;
  try {
    if (Capacitor.isNativePlatform()) {
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === "prompt" || perm.receive === "denied") {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== "granted") return null;

      // Create a notification channel (required on Android 8+) with default
      // importance so incoming FCM messages actually show a visible
      // notification. Without a channel, the OS silently drops the
      // notification even though the plugin fires the JS event — the cause
      // of "notifications don't work on my Android 11 phone".
      try {
        await PushNotifications.createChannel({
          id: "nextext-messages",
          name: "Messages",
          description: "New chat messages",
          importance: 4,           // IMPORTANCE_HIGH (heads-up)
          visibility: 1,           // PUBLIC
          lights: true,
          vibration: true,
          vibrationPattern: [200, 100, 200],
        });
      } catch { /* older plugin versions may not support createChannel */ }

      PushNotifications.addListener("registration", ({ value }) => {
        if (value) {
          updateDoc(doc(db, "users", myUid), { fcmTokens: arrayUnion(value) }).catch(() => {});
        }
      }).catch(() => {});
      PushNotifications.addListener("registrationError", ({ err }) => {
        console.error("[notifications] FCM registration error:", err);
      }).catch(() => {});
      PushNotifications.addListener("pushNotificationReceived", (notification) => {
        triggerNotificationVibration();
        const title = (notification && (notification.title || notification.data?.title)) || "NexText";
        const body = (notification && (notification.body || notification.data?.body)) || "You have a new message";
        const chatId = notification?.data?.chatId;
        const tag = chatId || (notification && (notification.id || notification.data?.notificationId)) || "nextext-native";
        if (chatId) {
          if (notificationTapHandler) notificationTapHandler(chatId);
          else pendingTapChatId = chatId;
        }
        showLocalNotification(title, body, tag);
      }).catch(() => {});

      // Tap on a background/terminated notification → route into that chat.
      PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
        const chatId = notification?.data?.chatId;
        if (chatId) {
          if (notificationTapHandler) notificationTapHandler(chatId);
          else pendingTapChatId = chatId;
        }
      }).catch(() => {});

      await PushNotifications.register();
      return null;
    }

    if (!("Notification" in window)) return null;
    const messaging = getMessaging(app);
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY }).catch(() => null);
    if (token) {
      await updateDoc(doc(db, "users", myUid), {
        fcmTokens: arrayUnion(token),
      });
    }
    onMessage(messaging, (payload) => {
      const { notification, data } = payload;
      const title = notification?.title || data?.title || "New Message";
      const body = notification?.body || data?.body || "You received a new message";
      showLocalNotification(title, body, data?.chatId || "nextext");
    });
    return token;
  } catch {
    return null;
  }
}

export async function unregisterNotifications(myUid, token) {
  if (!myUid || !token) return;
  try {
    await updateDoc(doc(db, "users", myUid), {
      fcmTokens: arrayRemove(token),
    });
  } catch {}
}
