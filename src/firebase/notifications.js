import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { app } from "./config";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "./config";

const VAPID_KEY = "BDPG3EWg1tJKh1nN_yOnWgK3BYJjQ-fpYTk1NQrGqU0EHTRZWMWhOUNyANHv52BnUvPBmZFK8ssfsOKWLtqJasA";

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
        const tag = (notification && (notification.data?.chatId || notification.id)) || "nextext-native";
        showLocalNotification(title, body, tag);
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
