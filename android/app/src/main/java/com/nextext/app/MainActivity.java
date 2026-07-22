package com.nextext.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean keepSplash = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> keepSplash);
        super.onCreate(savedInstanceState);

        // Dismiss splash once the Capacitor bridge is fully initialized
        new Handler(Looper.getMainLooper()).postDelayed(() -> keepSplash = false, 1500);
    }
}
