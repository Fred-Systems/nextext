package com.nextext.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import android.view.View;
import androidx.core.app.ActivityCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "NextextNative",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera")
    }
)
public class NextextNativePlugin extends Plugin {

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent intent = new Intent(Settings.ACTION_SETTINGS);
                getActivity().startActivity(intent);
                call.resolve();
            } catch (Exception ex) {
                call.reject("Unable to open app settings");
            }
        }
    }

    @PluginMethod
    public void getMicrophonePermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", micGranted());
        call.resolve(ret);
    }

    @PluginMethod
    public void testMicrophone(final PluginCall call) {
        // Runs a real native AudioRecord/MediaRecorder probe off the UI thread.
        // If this succeeds while the WebView's getUserMedia throws
        // NotReadableError, the problem is the WebView media path (fix: record
        // natively). If this also fails, the OS-level mic is busy/unavailable.
        new Thread(() -> {
            JSObject ret = new JSObject();
            ret.put("osGranted", micGranted());
            if (!micGranted()) {
                ret.put("works", false);
                ret.put("reason", "os_permission_not_granted");
                call.resolve(ret);
                return;
            }
            android.media.MediaRecorder recorder = null;
            try {
                String file = getContext().getCacheDir() + "/nextext_mic_probe.m4a";
                recorder = new android.media.MediaRecorder();
                recorder.setAudioSource(android.media.MediaRecorder.AudioSource.MIC);
                recorder.setOutputFormat(android.media.MediaRecorder.OutputFormat.MPEG_4);
                recorder.setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AAC);
                recorder.setAudioEncodingBitRate(128000);
                recorder.setAudioSamplingRate(44100);
                recorder.setOutputFile(file);
                recorder.prepare();
                recorder.start();
                Thread.sleep(300);
                recorder.stop();
                recorder.release();
                recorder = null;
                ret.put("works", true);
            } catch (Exception e) {
                ret.put("works", false);
                ret.put("reason", String.valueOf(e));
            } finally {
                if (recorder != null) {
                    try { recorder.release(); } catch (Exception ignored) {}
                }
            }
            call.resolve(ret);
        }).start();
    }

    @PluginMethod
    public void getCameraPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", camGranted());
        call.resolve(ret);
    }

    @PluginMethod
    public void getSystemInsets(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            View decorView = getActivity().getWindow().getDecorView();
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decorView);
            int top = 0;
            int bottom = 0;
            if (insets != null) {
                androidx.core.graphics.Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                // Only report insets the app ACTUALLY draws under (edge-to-edge).
                // When the window is not edge-to-edge the system lays the WebView
                // out below the status bar / above the nav bar, so the app does
                // not need to pad for them (padding them again would create gaps).
                android.graphics.Rect frame = new android.graphics.Rect();
                decorView.getWindowVisibleDisplayFrame(frame);
                if (frame.top <= 0) top = sys.top;          // content reaches under the status bar
                if (frame.bottom >= decorView.getHeight()) bottom = sys.bottom; // content reaches under the nav bar
            }
            ret.put("top", top);
            ret.put("bottom", bottom);
            call.resolve(ret);
        } catch (Exception e) {
            ret.put("top", 0);
            ret.put("bottom", 0);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void requestMicrophone(PluginCall call) {
        if (micGranted()) {
            resolveGranted(call, true);
            return;
        }
        requestPermissionForAlias("microphone", call, "micPermissionResult");
    }

    @PluginMethod
    public void requestCamera(PluginCall call) {
        if (camGranted()) {
            resolveGranted(call, true);
            return;
        }
        requestPermissionForAlias("camera", call, "cameraPermissionResult");
    }

    @PermissionCallback
    private void micPermissionResult(PluginCall call) {
        resolveGranted(call, micGranted());
    }

    @PermissionCallback
    private void cameraPermissionResult(PluginCall call) {
        resolveGranted(call, camGranted());
    }

    private boolean micGranted() {
        return getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean camGranted() {
        return getContext().checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private void resolveGranted(PluginCall call, boolean granted) {
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }
}
