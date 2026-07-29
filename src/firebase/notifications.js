import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { app } from "./config";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "./config";

const VAPID_KEY = "BDPG3EWg1tJKh1nN_yOnWgK3BYJjQ-fpYTk1NQrGqU0EHTRZWMWhOUNyANHv52BnUvPBmZFK8ssfsOKWLtqJasA";

export async function initNotifications(myUid) {
  if (!("Notification" in window) || !myUid) return null;
  try {
    const messaging = getMessaging(app);
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      await updateDoc(doc(db, "users", myUid), {
        fcmTokens: arrayUnion(token),
      });
    }
    onMessage(messaging, (payload) => {
      const { notification } = payload;
      if (notification?.title) {
        new Notification(notification.title, {
          body: notification.body,
          icon: "/icon.png",
        });
      }
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
