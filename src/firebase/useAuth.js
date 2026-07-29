import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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
    let unsub;
    let safetyTimer;
    try {
      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        clearTimeout(safetyTimer);
        setUser(firebaseUser);
        if (firebaseUser) {
          try {
            const ref = doc(db, "users", firebaseUser.uid);
            const snap = await getDoc(ref);
            setUserDoc(snap.exists() ? snap.data() : null);
          } catch (e) {
            console.error("[useAuth] Failed to fetch user doc:", e);
            setUserDoc(null);
          }
        } else {
          // Check for redirect result (Capacitor/WebView Google sign-in)
          try {
            const result = await getRedirectResult(auth);
            if (result?.user) {
              const ref = doc(db, "users", result.user.uid);
              const snap = await getDoc(ref);
              if (!snap.exists()) {
                await createUserProfile(result.user, {
                  email: result.user.email,
                  username: result.user.email.split("@")[0],
                  displayName: result.user.displayName || "New User",
                });
              }
              setUserDoc(snap.exists() ? snap.data() : null);
              setUser(result.user);
            }
          } catch (e) {
            console.error("[useAuth] Redirect result error:", e);
          }
          setUserDoc(null);
        }
        setLoading(false);
      });
      // Fallback: if auth never resolves in 8 seconds, stop loading
      // so the user at least sees the login screen instead of a blank screen.
      safetyTimer = setTimeout(() => {
        console.warn("[useAuth] ⚠️ Auth timed out after 8s — onAuthStateChanged never fired. Showing login screen.");
        setUser(null);
        setUserDoc(null);
        setLoading(false);
      }, 8000);
    } catch (e) {
      console.error("[useAuth] onAuthStateChanged failed:", e);
      setLoading(false);
    }
    return () => { clearTimeout(safetyTimer); unsub && unsub(); };
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
    try {
      const isCapacitor = window.location.hostname === 'localhost';
      if (isCapacitor) {
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
      } else {
        await signInWithRedirect(auth, googleProvider);
        return null;
      }
    } catch (e) {
      console.error("[useAuth] Google sign-in error:", e);
      throw e;
    }
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
