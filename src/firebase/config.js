// Firebase initialization for NexText
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyCAYHwJ9UyUDyhPVU0Bj32N2fCTuMXXAG0",
  authDomain: "nextext-ddf38.firebaseapp.com",
  projectId: "nextext-ddf38",
  storageBucket: "nextext-ddf38.firebasestorage.app",
  messagingSenderId: "406410965292",
  appId: "1:406410965292:web:c0e03eb6cf8439ec853c89",
  measurementId: "G-FEGWEPY4SX",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);

// App Check — verifies requests come from the real app, not bots/scripts.
// IMPORTANT: this requires a reCAPTCHA v3 site key, generated from:
// Firebase Console -> Build -> App Check -> Apps -> Register your web app
// Leave the placeholder below until you've generated that key — App Check
// will simply be inactive (not broken) until a real key is provided.
const RECAPTCHA_SITE_KEY = "REPLACE_WITH_RECAPTCHA_SITE_KEY";

if (RECAPTCHA_SITE_KEY !== "REPLACE_WITH_RECAPTCHA_SITE_KEY") {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}
