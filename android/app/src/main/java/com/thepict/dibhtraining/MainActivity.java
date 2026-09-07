package com.thepict.dibhtraining;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be registered before super.onCreate() builds the bridge, otherwise the
        // web layer cannot resolve the plugin during startup key initialisation.
        registerPlugin(SecureKeyPlugin.class);
        super.onCreate(savedInstanceState);
        hardenWebView();
    }

    /**
     * MFDS UC-02 — mobile code execution control.
     *
     * Capacitor enables a few WebView capabilities by default that this app never uses.
     * They are switched off explicitly rather than left at their defaults, so the WebView's
     * capability surface matches what the app actually needs. Runs after super.onCreate(),
     * which is where the bridge creates the WebView and applies its own settings.
     *
     * Note on what is deliberately left enabled:
     *   - JavaScript and DOM storage are required (the entire UI is a web bundle).
     *   - File and content access stay at Capacitor's defaults because breathing-data
     *     upload uses an <input type="file"> chooser, which resolves content:// URIs.
     */
    private void hardenWebView() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }
        WebSettings settings = webView.getSettings();
        // No feature in this app requests a position, and no location permission is
        // declared, but the capability should not be present at all.
        settings.setGeolocationEnabled(false);
        // The app is a single-window kiosk-style UI; nothing may spawn another window.
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
    }
}
