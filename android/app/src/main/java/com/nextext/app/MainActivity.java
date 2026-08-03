package com.nextext.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.PermissionRequest;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private boolean keepSplash = true;
    private NextextWebChromeClient chromeClient;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Custom plugin: legacy GoogleSignInClient flow as a fallback for
        // devices where Google Credential Manager is unavailable
        // ("getCredentialAsync no provider dependencies found").
        // Must be registered BEFORE super.onCreate: BridgeActivity creates the
        // bridge inside onCreate, consuming the plugin builder; adding plugins
        // afterwards silently never registers them.
        try {
            this.registerPlugin(LegacyGoogleSignInPlugin.class);
            this.registerPlugin(NextextNativePlugin.class);
        } catch (Exception ignored) { /* plugin registers via annotation scan as fallback */ }

        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> keepSplash);
        super.onCreate(savedInstanceState);

        // Replace the default WebChromeClient with one that manages the WebView
        // media permission request. When the OS-level RECORD_AUDIO/CAMERA
        // permission is not granted yet, it requests it on behalf of the
        // WebView instead of denying the request outright (a denied WebView
        // media request surfaces as NotReadableError "Could not start audio
        // source" and Android keeps a per-session denial for the origin).
        try {
            if (bridge != null && bridge.getWebView() != null) {
                chromeClient = new NextextWebChromeClient(bridge, this);
                bridge.getWebView().setWebChromeClient(chromeClient);
            }
        } catch (Exception ignored) { /* keep default client on any failure */ }

        // Dismiss splash once the Capacitor bridge is fully initialized
        new Handler(Looper.getMainLooper()).postDelayed(() -> keepSplash = false, 1500);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (chromeClient != null && chromeClient.onActivityPermissionResult(requestCode, grantResults)) {
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    private static class NextextWebChromeClient extends BridgeWebChromeClient {
        private static final int NEXTTEXT_WEBVIEW_PERMS = 7142;
        private final MainActivity activity;
        private PermissionRequest pendingPermissionRequest;

        NextextWebChromeClient(Bridge bridge, MainActivity activity) {
            super(bridge);
            this.activity = activity;
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            android.util.Log.d("NextextMic", "onPermissionRequest resources=" + android.text.TextUtils.join(",", request.getResources()));
            String[] resources = request.getResources();
            if (resources == null || resources.length == 0) {
                android.util.Log.w("NextextMic", "empty permission request -> deny");
                request.deny();
                return;
            }

            boolean needAudio = false;
            boolean needVideo = false;
            boolean needOther = false;
            for (String resource : resources) {
                if ("android.webkit.resource.AUDIO_CAPTURE".equals(resource)) {
                    needAudio = true;
                } else if ("android.webkit.resource.VIDEO_CAPTURE".equals(resource)) {
                    needVideo = true;
                } else {
                    needOther = true;
                }
            }

            if (needOther) {
                // Unknown resource types: let the framework decide.
                super.onPermissionRequest(request);
                return;
            }

            boolean audioGranted = !needAudio
                    || activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
            boolean videoGranted = !needVideo
                    || activity.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;

            android.util.Log.d("NextextMic", "audioGranted=" + audioGranted + " videoGranted=" + videoGranted);
            if (audioGranted && videoGranted) {
                request.grant(request.getResources());
                return;
            }

            if (pendingPermissionRequest != null) {
                // A permission prompt is already in flight; do not stack another.
                super.onPermissionRequest(request);
                return;
            }

            // Trigger the OS runtime permission prompt so the WebView media
            // request can actually succeed instead of being denied silently.
            pendingPermissionRequest = request;
            List<String> missing = new ArrayList<>();
            if (!audioGranted) missing.add(Manifest.permission.RECORD_AUDIO);
            if (!videoGranted) missing.add(Manifest.permission.CAMERA);
            activity.requestPermissions(missing.toArray(new String[0]), NEXTTEXT_WEBVIEW_PERMS);
        }

        boolean onActivityPermissionResult(int requestCode, int[] grantResults) {
            if (requestCode != NEXTTEXT_WEBVIEW_PERMS || pendingPermissionRequest == null) {
                return false;
            }
            PermissionRequest pr = pendingPermissionRequest;
            pendingPermissionRequest = null;
            boolean allGranted = grantResults != null;
            if (allGranted) {
                for (int r : grantResults) {
                    if (r != PackageManager.PERMISSION_GRANTED) {
                        allGranted = false;
                        break;
                    }
                }
            }
            android.util.Log.d("NextextMic", "permission result allGranted=" + allGranted);
            if (allGranted) {
                pr.grant(pr.getResources());
            } else {
                pr.deny();
            }
            return true;
        }
    }
}
