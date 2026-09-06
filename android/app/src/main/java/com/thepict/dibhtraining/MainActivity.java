package com.thepict.dibhtraining;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be registered before super.onCreate() builds the bridge, otherwise the
        // web layer cannot resolve the plugin during startup key initialisation.
        registerPlugin(SecureKeyPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
