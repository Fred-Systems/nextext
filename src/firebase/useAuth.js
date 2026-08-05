import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { SocialLogin as CapgoSocialLogin } from "@capgo/capacitor-social-login";
import { auth, googleProvider, db } from "../firebase/config";
import { changeNames } from "../firebase/names";

const LegacyGoogleSignIn = registerPlugin("LegacyGoogleSignIn");

// Rejects the promise if it hasn't settled within ms, so a broken native
// Google sign-in can never leave the UI stuck on "Please wait…" forever.
const withTimeout = (promise, ms, message) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

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

  async function signUpWithEmail(email, password, username, displayName, phone) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await createUserProfile(cred.user, { email, username, displayName }, true);
    if (phone && phone.trim()) {
      const digits = String(phone).replace(/[^\d+]/g, "");
      await updateDoc(doc(db, "users", cred.user.uid), {
        phoneNumber: phone.trim(),
        phoneNumberNormalized: digits || null,
      });
    }
    return cred.user;
  }

  async function signInWithEmail(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function signInWithGoogle(markProfileComplete = false) {
    // Creates the Firestore profile for a brand-new Google account and marks it
    // complete when this was the sign-up flow (which already collected names).
    const ensureProfile = async (user, extra) => {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await createUserProfile(user, {
          email: user.email,
          username: user.email ? user.email.split("@")[0] : `user-${user.uid.slice(0, 6)}`,
          displayName: user.displayName || extra?.displayName || "New User",
          photoURL: user.photoURL || extra?.photoUrl || extra?.photoURL || null,
        });
        if (markProfileComplete) await updateDoc(ref, { profileComplete: true });
      }
      return user;
    };

    // Native (Capacitor) builds use the real Google Sign-In plugin — no popup
    // or redirect, which do not work reliably inside the Android WebView.
    if (Capacitor.isNativePlatform()) {
      let lastError = null;
      // 1) Legacy GoogleSignInClient flow: works on devices with older Google
      //    Play Services and returns precise error codes.
      try {
        const legacy = await withTimeout(
          LegacyGoogleSignIn.signIn(),
          8000,
          "Google Play Services didn't respond on this device. It may be missing, disabled, or outdated. Update Google Play Services and add a Google account, then try again — or use Email/phone sign-in."
        );
        const legacyToken = legacy?.idToken;
        if (!legacyToken) throw new Error("Google sign-in did not return an ID token.");
        const legacyUser = await signInWithCredential(auth, GoogleAuthProvider.credential(legacyToken));
        return await ensureProfile(legacyUser, legacy);
      } catch (legacyErr) {
        lastError = legacyErr;
        if (legacyErr?.code === "CANCELLED") throw legacyErr;
        // Anything else: fall through to the modern Credential Manager path.
      }

      // 2) CapGo's Google provider (Credential Manager on Android 13+,
      //    GoogleSignInClient fallback on older devices). Never blocks the UI —
      //    bounded by a timeout so it surfaces a clear error instead of hanging.
      try {
        const capgoRes = await withTimeout(
          CapgoSocialLogin.login({ provider: "google", options: { scopes: ["email", "openid", "profile"] } }),
          8000,
          "Google Play Services didn't respond on this device. It may be missing, disabled, or outdated. Update Google Play Services and add a Google account, then try again — or use Email/phone sign-in."
        );
        const capgoToken = capgoRes?.response?.idToken;
        if (!capgoToken) throw new Error("Google sign-in did not return an ID token.");
        const capgoUser = await signInWithCredential(auth, GoogleAuthProvider.credential(capgoToken));
        return await ensureProfile(capgoUser, capgoRes?.response);
      } catch (capgoErr) {
        const msg = String((lastError && lastError.message) || capgoErr?.message || "");
        const enriched = new Error(
          msg.startsWith("Google sign-in failed")
            ? `${msg} (alternate sign-in method also failed)`
            : `Google sign-in failed: ${msg || "unknown error"}`
        );
        enriched.code = capgoErr?.code || lastError?.code;
        enriched.native = capgoErr || lastError;
        throw enriched;
      }
    }

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const ref = doc(db, "users", cred.user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await createUserProfile(cred.user, {
          email: cred.user.email,
          username: cred.user.email.split("@")[0],
          displayName: cred.user.displayName || "New User",
          photoURL: cred.user.photoURL || null,
        });
        if (markProfileComplete) await updateDoc(ref, { profileComplete: true });
      }
      return cred.user;
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/popup-closed-by-user" || e.code === "auth/unauthorized-domain") {
        await signInWithRedirect(auth, googleProvider);
        return null;
      }
      throw e;
    }
  }

  async function completeGoogleSignup(username, displayName, usernameLower, phone) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not signed in.");
    await changeNames(uid, { username, displayName, phone });
    const snap = await getDoc(doc(db, "users", uid));
    setUserDoc(snap.exists() ? snap.data() : null);
  }

  async function completeProfile(username, displayName, phone) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not signed in.");
    await changeNames(uid, { username, displayName, phone });
    const snap = await getDoc(doc(db, "users", uid));
    setUserDoc(snap.exists() ? snap.data() : null);
  }

  async function createUserProfile(fbUser, { email, username, displayName, photoURL }, profileComplete = false) {
    await setDoc(doc(db, "users", fbUser.uid), {
      email,
      emailLower: email.toLowerCase(),
      username,
      usernameLower: username.toLowerCase(),
      displayName,
      photoURL: photoURL || null,
      profileComplete,
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

  return { user, userDoc, loading, signUpWithEmail, signInWithEmail, signInWithGoogle, completeGoogleSignup, completeProfile, logOut };
}
