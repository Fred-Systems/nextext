package com.nextext.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import android.view.View;
import androidx.core.app.ActivityCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

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
    public void downloadAndInstallApk(final PluginCall call) {
        // Downloads an APK to the app's private cache and hands it to the
        // Android package installer via FileProvider — no browser needed, so it
        // works on phones without a browser app installed.
        final String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("No download URL provided");
            return;
        }
        new Thread(() -> {
            File apk = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists()) dir.mkdirs();
                apk = new File(dir, "nextext-update.apk");
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(120000);
                conn.setRequestProperty("Accept", "application/vnd.android.package-archive");
                conn.connect();
                int code = conn.getResponseCode();
                if (code >= 400) {
                    call.reject("Download failed (HTTP " + code + ")");
                    return;
                }
                InputStream in = conn.getInputStream();
                FileOutputStream out = new FileOutputStream(apk);
                byte[] buf = new byte[8192];
                int n;
                long total = 0;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    total += n;
                }
                out.flush();
                out.close();
                in.close();
                conn.disconnect();
                if (total == 0 || apk.length() == 0) {
                    call.reject("Downloaded file is empty");
                    return;
                }
                Uri contentUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apk
                );
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(contentUri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().startActivity(intent);
                call.resolve();
            } catch (final Exception e) {
                call.reject("Download failed: " + (e.getMessage() == null ? String.valueOf(e) : e.getMessage()));
            }
        }).start();
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

    private android.media.MediaRecorder activeRecorder = null;
    private File activeRecorderFile = null;

    @PluginMethod
    public void startVoiceRecording(final PluginCall call) {
        if (!micGranted()) {
            requestPermissionForAlias("microphone", call, "micPermissionForVoice");
            return;
        }
        try {
            stopAndReleaseRecorder();
            File out = new File(getContext().getCacheDir(), "nextext_voice_" + System.currentTimeMillis() + ".m4a");
            android.media.MediaRecorder r = new android.media.MediaRecorder();
            r.setAudioSource(android.media.MediaRecorder.AudioSource.MIC);
            r.setOutputFormat(android.media.MediaRecorder.OutputFormat.MPEG_4);
            r.setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AAC);
            r.setAudioEncodingBitRate(96000);
            r.setAudioSamplingRate(44100);
            r.setOutputFile(out.getAbsolutePath());
            r.prepare();
            r.start();
            activeRecorder = r;
            activeRecorderFile = out;
            call.resolve();
        } catch (final Exception e) {
            stopAndReleaseRecorder();
            call.reject("start failed: " + (e.getMessage() == null ? String.valueOf(e) : e.getMessage()));
        }
    }

    @PermissionCallback
    private void micPermissionForVoice(PluginCall call) {
        if (!micGranted()) {
            JSObject ret = new JSObject();
            ret.put("granted", false);
            call.resolve(ret);
            return;
        }
        startVoiceRecording(call);
    }

    @PluginMethod
    public void pauseVoiceRecording(PluginCall call) {
        try {
            if (activeRecorder == null) { call.resolve(); return; }
            activeRecorder.pause();
            call.resolve();
        } catch (final Exception e) {
            call.reject("pause failed: " + (e.getMessage() == null ? String.valueOf(e) : e.getMessage()));
        }
    }

    @PluginMethod
    public void resumeVoiceRecording(PluginCall call) {
        try {
            if (activeRecorder == null) { call.resolve(); return; }
            activeRecorder.resume();
            call.resolve();
        } catch (final Exception e) {
            call.reject("resume failed: " + (e.getMessage() == null ? String.valueOf(e) : e.getMessage()));
        }
    }

    @PluginMethod
    public void stopVoiceRecording(final PluginCall call) {
        // Stop + read the recorded file off the UI thread; stop() can block for
        // a moment and base64-encoding a multi-MB file must never run on the
        // main thread.
        new Thread(() -> {
            File out = activeRecorderFile;
            android.media.MediaRecorder r = activeRecorder;
            activeRecorder = null;
            activeRecorderFile = null;
            try {
                if (r != null) {
                    try { r.stop(); } catch (Exception ignored) {}
                    try { r.release(); } catch (Exception ignored) {}
                }
                if (out == null || !out.exists() || out.length() == 0) {
                    call.reject("no recording");
                    return;
                }
                byte[] bytes = new byte[(int) out.length()];
                java.io.FileInputStream fis = new java.io.FileInputStream(out);
                try {
                    int off = 0;
                    while (off < bytes.length) {
                        int n = fis.read(bytes, off, bytes.length - off);
                        if (n < 0) break;
                        off += n;
                    }
                } finally {
                    fis.close();
                }
                out.delete();
                JSObject ret = new JSObject();
                ret.put("base64", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP));
                ret.put("mimeType", "audio/mp4");
                call.resolve(ret);
            } catch (final Exception e) {
                if (out != null) { try { out.delete(); } catch (Exception ignored) {} }
                call.reject("stop failed: " + (e.getMessage() == null ? String.valueOf(e) : e.getMessage()));
            }
        }).start();
    }

    @PluginMethod
    public void cancelVoiceRecording(PluginCall call) {
        stopAndReleaseRecorder();
        call.resolve();
    }

    private void stopAndReleaseRecorder() {
        android.media.MediaRecorder r = activeRecorder;
        activeRecorder = null;
        File out = activeRecorderFile;
        activeRecorderFile = null;
        if (r != null) {
            try { r.stop(); } catch (Exception ignored) {}
            try { r.release(); } catch (Exception ignored) {}
        }
        if (out != null) {
            try { out.delete(); } catch (Exception ignored) {}
        }
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
