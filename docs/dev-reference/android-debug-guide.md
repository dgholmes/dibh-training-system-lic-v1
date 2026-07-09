# Android Debug Guide — Security Audit Logs

How to view `[SECURITY-AUDIT]` console output from the DIBH app running on an Android device.

---

## Build & Open Commands

```bash
npm run cap:build    # Production build + sync dist/ to Android project
npm run cap:sync     # Sync dist/ to Android project (no rebuild)
npm run cap:android  # Open Android Studio
```

Typical flow before a demo:

```bash
npm run cap:build
npm run cap:android
```

Then run the app from Android Studio onto the device or emulator.

---

## Option 1 — Chrome Remote DevTools (Recommended)

Full DevTools experience. The collapsible `console.groupCollapsed` groups that `secDbg()` uses render exactly as in a desktop browser.

### Setup

1. On the Android device: **Settings → Developer options → USB debugging → ON**
2. Connect the device to the PC via USB cable
3. Launch the DIBH app on the device
4. On the PC, open Chrome and navigate to:

```
chrome://inspect/#devices
```

5. Your device and the app WebView will appear under **Remote Target**
6. Click **Inspect** — full Chrome DevTools opens

### Viewing the logs

- Go to the **Console** tab
- Each security event appears as a collapsible group labelled `[SECURITY-AUDIT] <CODE> — <Label>`
- Expand a group to see all key/value fields (Korean 설명 + English description)

**Example output:**

```
▶ [SECURITY-AUDIT] IA-07 — 계정 잠금 처리 — Account Locked
    설명: 5회 연속 실패로 계정이 잠금 처리되었습니다...
    description: Account locked after 5 consecutive failures...
    username: admin
    failed_attempt: 5
    account_locked: true
    lockout_ticks: 90
    lockout_duration_min: 15
```

### Filter by requirement code

In the Console filter box, type the code to scope the output:

| Filter | Shows |
|--------|-------|
| `SECURITY-AUDIT` | All security events |
| `DC-01` | Encryption / key load |
| `IA-07` | Lockout events |
| `UC-04` | Audit log writes, SESSION_TIMEOUT, DEIDENTIFIED_EXPORT |
| `UC-05` | Storage capacity / QuotaExceededError |
| `SI-03` | Startup self-checks |
| `SI-04` | File integrity checks |
| `IA-SESSION` | Session timeout / auto-logout |

---

## Option 2 — `adb logcat` (No Chrome required)

Capacitor forwards all `console.*` calls to Android Logcat tagged `Capacitor/Console`. The grouped structure is lost but all data is present as flat text.

```bash
# All Capacitor console output
adb logcat -s "Capacitor/Console"

# Filter to SECURITY-AUDIT lines only
adb logcat | grep "SECURITY-AUDIT"

# Filter to a specific requirement code
adb logcat | grep "UC-05"
```

Requires `adb` in PATH (comes with Android Studio platform-tools).

---

## Important — Production Build

`SECURITY_DEBUG` in `src/lib/securityDebug.js` **must be `false`** before any production build or APK submission to MFDS/KTC.

```js
// src/lib/securityDebug.js
export const SECURITY_DEBUG = true;  // ← KTC AUDIT DEMO ONLY
// Change back to false before: npm run cap:build (production)
```
