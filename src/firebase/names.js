import { doc, getDoc, updateDoc, serverTimestamp, query, where, getDocs, collection } from "firebase/firestore";
import { db } from "./config";

// Updates a user's display name + username (optionally phone). Pushes the
// PREVIOUS names onto the user's nameHistory so admins can see every name a
// user has ever had, and so chats can reflect "what it used to be". Marks the
// profile complete so the user can proceed past the profile-completion screen.
export async function changeNames(uid, { username, displayName, phone }) {
  if (!uid) throw new Error("Not signed in.");
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const cur = snap.exists() ? snap.data() : {};
  const historyEntry = {
    displayName: cur.displayName || null,
    username: cur.username || null,
    changedAt: serverTimestamp(),
  };
  const nameHistory = Array.isArray(cur.nameHistory)
    ? [...cur.nameHistory, historyEntry]
    : (cur.displayName || cur.username ? [historyEntry] : []);

  const update = {
    username,
    usernameLower: String(username || "").toLowerCase(),
    displayName,
    nameHistory,
    profileComplete: true,
  };
  if (phone && String(phone).trim()) {
    const digits = String(phone).replace(/[^\d+]/g, "");
    update.phoneNumber = String(phone).trim();
    update.phoneNumberNormalized = digits || null;
  }
  await updateDoc(ref, update);
}

// True when the user is globally or individually blocked from changing their
// name. globalSettings.blockNameSwitching (admin, app-wide) hides/prevents it
// for everyone; restrictions.blockNameChange (admin, per-user) blocks one user.
export function isNameChangeBlocked(userDoc, globalSettings) {
  if (globalSettings?.blockNameSwitching === true) return true;
  if (userDoc?.restrictions?.blockNameChange === true) return true;
  return false;
}

// Returns true when no OTHER user already uses the given username.
export async function isUsernameAvailable(username, excludeUid) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!normalized) return false;
  const q = query(collection(db, "users"), where("usernameLower", "==", normalized));
  const snap = await getDocs(q);
  return !snap.docs.some((d) => d.id !== excludeUid);
}
