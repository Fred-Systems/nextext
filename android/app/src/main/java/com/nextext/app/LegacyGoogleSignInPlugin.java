package com.nextext.app;

import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;
import org.json.JSONObject;

@CapacitorPlugin(name = "LegacyGoogleSignIn")
public class LegacyGoogleSignInPlugin extends Plugin {

    private static final String DEFAULT_WEB_CLIENT_ID = "406410965292-jlh37tmtcsnucerqbv4ofp9je24mkeok.apps.googleusercontent.com";

    private String webClientId = DEFAULT_WEB_CLIENT_ID;
    private int transientRetries = 0;
    private final Handler watchdogHandler = new Handler(Looper.getMainLooper());
    private Runnable watchdogRunnable;

    private void startWatchdog(PluginCall call) {
        if (watchdogRunnable != null) watchdogHandler.removeCallbacks(watchdogRunnable);
        watchdogRunnable = () -> {
            if (call.isReleased()) return;
            try {
                call.reject("Google sign-in timed out. Google Play Services may be missing, disabled, or outdated on this device. Update Play Services or try Email/phone sign-in.", "TIMEOUT");
            } catch (Exception ignored) {
                // call already settled
            }
        };
        watchdogHandler.postDelayed(watchdogRunnable, 20000);
    }

    private void stopWatchdog() {
        if (watchdogRunnable != null) {
            watchdogHandler.removeCallbacks(watchdogRunnable);
            watchdogRunnable = null;
        }
    }

    @Override
    public void load() {
        super.load();
        try {
            String configured = getConfig().getString("webClientId");
            if (configured != null && !configured.trim().isEmpty()) {
                webClientId = configured.trim();
            }
        } catch (Exception ignored) {
            // keep the default client id
        }
    }

    private GoogleSignInClient buildClient() {
        GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(webClientId)
                .requestEmail()
                .build();
        return GoogleSignIn.getClient(getContext(), options);
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        transientRetries = 0;
        startWatchdog(call);
        try {
            startActivityForResult(call, buildClient().getSignInIntent(), "handleSignInResult");
        } catch (Exception ex) {
            stopWatchdog();
            call.reject("Could not launch Google sign-in. Google Play Services may be missing or disabled on this device.", "NO_PLAY_SERVICES");
        }
    }

    @ActivityCallback
    private void handleSignInResult(PluginCall call, ActivityResult result) {
        transientRetries = 0;
        stopWatchdog();
        if (result == null || result.getData() == null) {
            call.reject("Google sign-in was cancelled", "CANCELLED");
            return;
        }
        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(result.getData());
        try {
            GoogleSignInAccount acct = task.getResult(ApiException.class);
            JSObject ret = new JSObject();
            ret.put("idToken", acct.getIdToken());
            ret.put("accessToken", acct.getIdToken());
            ret.put("email", acct.getEmail());
            ret.put("displayName", acct.getDisplayName());
            ret.put("givenName", acct.getGivenName());
            ret.put("familyName", acct.getFamilyName());
            ret.put("photoUrl", acct.getPhotoUrl() != null ? acct.getPhotoUrl().toString() : null);
            ret.put("serverAuthCode", acct.getServerAuthCode());
            ret.put("userId", acct.getId());
            fillProfileFromToken(ret, acct.getIdToken());
            call.resolve(ret);
        } catch (ApiException e) {
            int code = e.getStatusCode();
            if ((code == 12500 || code == 12501 || code == 12502) && transientRetries < 1) {
                // transient server-side failure: reset the sign-in state and try once more
                transientRetries++;
                buildClient().signOut().addOnCompleteListener(t -> {
                    getActivity().runOnUiThread(() -> {
                        try {
                            startWatchdog(call);
                            startActivityForResult(call, buildClient().getSignInIntent(), "handleSignInResult");
                        } catch (Exception ex) {
                            stopWatchdog();
                            call.reject("Google sign-in failed (" + code + "). " + statusHint(code), String.valueOf(code));
                        }
                    });
                });
                return;
            }
            String hint = statusHint(code);
            call.reject("Google sign-in failed (" + code + "). " + hint, String.valueOf(code));
        }
    }

    private static void fillProfileFromToken(JSObject ret, String idToken) {
        if (idToken == null) return;
        try {
            String[] parts = idToken.split("\\.");
            if (parts.length < 2) return;
            byte[] decoded = Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_WRAP);
            JSONObject claims = new JSONObject(new String(decoded, "UTF-8"));
            if (!ret.has("email") || ret.getString("email") == null) ret.put("email", claims.optString("email", null));
            if (!ret.has("displayName") || ret.getString("displayName") == null) ret.put("displayName", claims.optString("name", null));
            if (!ret.has("givenName") || ret.getString("givenName") == null) ret.put("givenName", claims.optString("given_name", null));
            if (!ret.has("familyName") || ret.getString("familyName") == null) ret.put("familyName", claims.optString("family_name", null));
            if (!ret.has("photoUrl") || ret.getString("photoUrl") == null) ret.put("photoUrl", claims.optString("picture", null));
        } catch (Exception ignored) {
            // leave whatever fields the account provided
        }
    }

    private static String statusHint(int statusCode) {
        switch (statusCode) {
            case 10: return "App signature or config mismatch. Verify the APK signing SHA-1 is registered for com.nextext.app in the Firebase Console (Settings > Your apps).";
            case 7: return "Network error. Check your connection and try again.";
            case 12500: return "Google's server rejected the request. Usually the app is not fully configured: confirm the APK's SHA-1 is registered for com.nextext.app in Firebase, a support email is set under Firebase Authentication settings, and that the OAuth web client ID in the app matches the one in the Google Cloud console. Sign out and try again after fixing the config.";
            case 12501: return "Sign-in is already in progress. Please wait a moment and try again.";
            case 12502: return "No Google account is signed in on this device. Add a Google account and try again.";
            case 12599: return "Sign-in failed on this device. If it persists, try the sign-in with Email/phone instead.";
            default: return "Try again, or use Email/phone sign-in instead.";
        }
    }

    @PluginMethod
    public void getSignedInAccount(PluginCall call) {
        GoogleSignInAccount acct = GoogleSignIn.getLastSignedInAccount(getContext());
        if (acct == null) {
            call.reject("No signed-in Google account", "NOT_SIGNED_IN");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("idToken", acct.getIdToken());
        ret.put("email", acct.getEmail());
        ret.put("displayName", acct.getDisplayName());
        ret.put("photoUrl", acct.getPhotoUrl() != null ? acct.getPhotoUrl().toString() : null);
        call.resolve(ret);
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        buildClient().signOut().addOnCompleteListener(task -> call.resolve());
    }
}
