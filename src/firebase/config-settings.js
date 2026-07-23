import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "./config";

const CONFIG_REF_PATH = ["config", "globalSettings"];

export async function ensureGlobalSettingsExist() {
  const ref = doc(db, ...CONFIG_REF_PATH);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      defaultDailyLimitBytes: null,
      mediaExpiryDays: 3, // default: auto-delete media after 3 days, admin-adjustable
      editWindowMinutes: 20,
      updatedBy: null,
      updatedAt: null,
    });
  }
}

export function useGlobalSettings() {
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    let unsub;
    try {
      unsub = onSnapshot(doc(db, ...CONFIG_REF_PATH), (snap) => setSettings(snap.data()), () => {});
    } catch { /* Firestore may not be available */ }
    return () => unsub && unsub();
  }, []);
  return settings;
}

export async function updateGlobalSettings(patch, adminUid) {
  await setDoc(doc(db, ...CONFIG_REF_PATH), { ...patch, updatedBy: adminUid, updatedAt: new Date() }, { merge: true });
}
