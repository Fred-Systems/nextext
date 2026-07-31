// Firebase initialization for NexText
import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, indexedDBLocalPersistence, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { Capacitor } from "@capacitor/core";

const firebaseConfig = {
  apiKey: "AIzaSyCAYHwJ9UyUDyhPVU0Bj32N2fCTuMXXAG0",
  authDomain: "nextext-ddf38.firebaseapp.com",
  projectId: "nextext-ddf38",
  storageBucket: "nextext-ddf38.firebasestorage.app",
  messagingSenderId: "406410965292",
  appId: "1:406410965292:web:c0e03eb6cf8439ec853c89",
  measurementId: "G-FEGWEPY4SX",
};

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  console.error("[firebase/config] initializeApp failed:", e);
}

let auth;
try {
  if (Capacitor.isNativePlatform()) {
    auth = initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
    });
  } else {
    auth = getAuth(app);
  }
} catch (e) {
  console.error("[firebase/config] Auth init failed, falling back to getAuth:", e);
  try { auth = getAuth(app); } catch (e2) { console.error("[firebase/config] getAuth fallback also failed:", e2); }
}

let db;
try {
  db = getFirestore(app);
} catch (e) {
  console.error("[firebase/config] getFirestore failed:", e);
}

let storage;
try {
  storage = getStorage(app);
} catch (e) {
  console.error("[firebase/config] getStorage failed:", e);
}

export const serverClientId = "406410965292-jlh37tmtcsnucerqbv4ofp9je24mkeok.apps.googleusercontent.com";

export { app, auth };
export default app;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});
export { db, storage };

const RECAPTCHA_SITE_KEY = "REPLACE_WITH_RECAPTCHA_SITE_KEY";

if (RECAPTCHA_SITE_KEY !== "REPLACE_WITH_RECAPTCHA_SITE_KEY") {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    console.error("[firebase/config] App Check init failed:", e);
  }
}
