import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, googleProvider, db } from "../firebase/config";

// One account per email: Firebase Auth itself already prevents creating a
// second account with the same email under a different password (it'll
// throw auth/email-already-in-use). For Google Sign-In merging into an
// existing email/password account, enable "One account per email address"
// under Firebase Console -> Authentication -> Settings -> User account linking.

export function useAuth() {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const ref = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(ref);
        setUserDoc(snap.exists() ? snap.data() : null);
      } else {
        setUserDoc(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function signUpWithEmail(email, password, username, displayName) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await createUserProfile(cred.user, { email, username, displayName });
    return cred.user;
  }

  async function signInWithEmail(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function signInWithGoogle() {
    const cred = await signInWithPopup(auth, googleProvider);
    const ref = doc(db, "users", cred.user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await createUserProfile(cred.user, {
        email: cred.user.email,
        username: cred.user.email.split("@")[0],
        displayName: cred.user.displayName || "New User",
      });
    }
    return cred.user;
  }

  async function createUserProfile(fbUser, { email, username, displayName }) {
    await setDoc(doc(db, "users", fbUser.uid), {
      email,
      emailLower: email.toLowerCase(),
      username,
      usernameLower: username.toLowerCase(),
      displayName,
      photoURL: null,
      about: "",
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      isOnline: true,
      theme: "default",
      fcmTokens: [],
      role: "user",
      acceptedTermsAt: serverTimestamp(),
      acceptedTermsVersion: "1.0",
      privacy: {
        lastSeenVisibility: "contacts",
        statusVisibility: "contacts",
        statusAllowedList: [],
        statusExcludedList: [],
        readReceiptsEnabled: true,
        typingIndicatorEnabled: true,
      },
      voiceNoteSendMode: "instant",
      twoFactor: { enabled: false, totpSecretEncrypted: null, backupCodesHashed: [] },
      moderation: { banType: "none", mutedUntil: null, bannedAt: null, bannedBy: null, banReason: null },
      accountType: "standard",
      parentUid: null,
      restrictions: null,
      dataUsage: { bytesUsedToday: 0, bytesUsedDate: "", bytesUsedAllTime: 0 },
      dataLimit: { dailyLimitBytes: null },
    });
  }

  async function logOut() {
    return signOut(auth);
  }

  return { user, userDoc, loading, signUpWithEmail, signInWithEmail, signInWithGoogle, logOut };
}
