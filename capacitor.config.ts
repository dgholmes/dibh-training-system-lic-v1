import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.thepict.dibhtraining',
  appName: 'DIBH 훈련 시스템',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Uncomment for live reload during development:
    // url: 'http://192.168.x.x:5174',
    // cleartext: true,
  },
  android: {
    // Minimum WebView version with full Web Crypto API support
    minWebViewVersion: 96,
    // Allow the app to run in fullscreen / kiosk mode
    allowMixedContent: false,
  },
  plugins: {
    // Future Bluetooth integration via @capacitor-community/bluetooth-le
    // or direct Vernier GoDirect plugin can be configured here
  },
};

export default config;
