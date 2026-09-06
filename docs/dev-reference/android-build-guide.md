# Android Build & Release Guide

How to go from a clean checkout to an installable APK of DIBH - Flow (`com.thepict.dibhtraining`).

Covers the debug build (for testing on a device) and the release build (for hospital install / MFDS-KTC submission), including release signing (driven by the git-ignored `android/keystore.properties`, see Step 5).

Related: [app-versioning-guide.md](./app-versioning-guide.md) (how the version is derived) · [android-debug-guide.md](./android-debug-guide.md) (reading `[SECURITY-AUDIT]` logs off the device).

---

## Toolchain

Verified working on 2026-08-31 (Windows 11):

| Component | Version | Where it comes from |
|---|---|---|
| Node | v22.16.0 | system |
| npm | 11.5.2 | system |
| JDK | **21** (Android Studio JBR) | `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr` |
| Gradle | 8.14.3 | `android/gradle/wrapper/` (the wrapper — do not install Gradle separately) |
| Android Gradle Plugin | 8.13.2 | `android/build.gradle` |
| Capacitor | 8.3.1 | `package.json` |
| compileSdk / targetSdk | 36 | `android/variables.gradle` |
| minSdk | 24 (Android 7.0) | `android/variables.gradle` |
| SDK location | `android/local.properties` → `sdk.dir` | machine-local, git-ignored |

⚠️ **Keep `JAVA_HOME` pointed at the Android Studio JBR (JDK 21).** The JDK on this machine's `PATH` is 25, which Gradle 8.14.3 does not officially support (Java 25 support arrives in Gradle 9.x). `gradlew` reads `JAVA_HOME` first, which is why the build works — unsetting it may break the build against the PATH JDK.

The Android project (`android/`) is committed, but the built web assets inside it are **not** (`android/.gitignore` ignores `app/src/main/assets/public`). A fresh clone therefore has no web payload until you run a sync — see Step 2-3.

---

## TL;DR — release flow

```bash
# 0. pre-flight
cat .env                   # VITE_DEBUG_MODE must be false for production
npm test                   # 79 tests must pass
npm run sbom               # refresh docs/submission/sbom.cdx.json if deps changed

# 1. bump the version (building never bumps it)
npm version patch

# 2-3. build web bundle + integrity manifest, sync into the Android project
npm run cap:build

# 4. build the APK
cd android && ./gradlew assembleRelease     # -> app-release.apk (signed; needs android/keystore.properties)
#   ...or: npm run cap:android              # opens Android Studio instead

# 5. verify the signature — see "Signing" below. Expect CN=DIBH-Flow Release, never CN=Android Debug.
```

---

## Step 0 — Pre-flight

**`.env` — the debug gate.** `SECURITY_DEBUG` is compiled in from `VITE_DEBUG_MODE` at build time (`src/lib/securityDebug.js`). When true it enables verbose per-operation console logging plus admin-only QA affordances (audit-log seeding, the audit chain verify button).

```bash
# .env  — for any production or submission build
VITE_DEBUG_MODE=false
```

⚠️ `.env` is git-ignored, so its value is **per-machine and invisible in the diff**. It is currently `true` on this workstation. There is no runtime warning banner: the only way to know which flavour you built is to check `.env` before building, or open DevTools on the finished APK and look for `[SECURITY-AUDIT]` output.

**Other checks before a submission build:**

| Check | Command | Why |
|---|---|---|
| Tests pass | `npm test` | 18 files / 90 tests |
| Lint | `npm run lint` | note: the repo has a large pre-existing error backlog — compare, don't expect zero |
| SBOM current | `npm run sbom` | regenerates `docs/submission/sbom.cdx.json`; required if any dependency changed |
| Offline (SI-01) | `npm run verify:offline` | runs automatically inside `npm run build`; fails if the bundle references any external origin |

---

## Step 1 — Bump the version

`package.json` → `"version"` is the only place the version is set. `android/app/build.gradle` parses it at Gradle configure time, so `versionName` and `versionCode` follow automatically.

```bash
npm version patch                       # 1.1.4 -> 1.1.5  (also commits + tags)
npm version patch --no-git-tag-version  # bump only, no commit/tag
```

`versionCode` is derived by folding the semver parts: `((major * 100) + minor) * 100 + patch` — so `1.1.4` → `10104`. Android requires it to strictly increase for an update to install over an existing copy.

⚠️ **Numeric parts only.** A pre-release version like `1.2.0-rc.1` makes `versionName.tokenize('.').collect { it.toInteger() }` throw at Gradle configure time and the build fails. Use plain `major.minor.patch`.

See [app-versioning-guide.md](./app-versioning-guide.md) for the full picture.

---

## Step 2-3 — Build the web bundle and sync it

```bash
npm run cap:build
```

That one command chains three things:

| Stage | What it does |
|---|---|
| `vite build` | production bundle → `dist/` (sets `import.meta.env.PROD`, which is what arms the runtime integrity check) |
| `node scripts/generate-integrity.js` | SHA-256 of every `dist/assets/*.{js,css,wasm}` → `dist/integrity.json` (SI-04) |
| `npx cap sync` | copies `dist/` → `android/app/src/main/assets/public/`, regenerates `capacitor.config.json`, updates plugins |

`npm run build` also runs `scripts/verify-offline.js`, which fails the build if `dist/` would load a font, script or stylesheet from outside the bundle (MFDS SI-01). If it trips, the fix is to bundle the asset — never to re-add an external origin to the CSP.

⚠️ **Never hand-edit anything under `android/app/src/main/assets/public/` after this.** `main.jsx` re-hashes every listed asset against `integrity.json` on startup in production builds; a mismatch logs `INTEGRITY_CHECK_FAILED` and blocks the app from mounting with a 무결성 검사 실패 screen. Rebuild instead — the manifest regenerates with it.

Variants:

```bash
npm run cap:sync     # sync only, no rebuild (use after `npm run build`)
npm run cap:android  # build + sync + open Android Studio
```

---

## Step 4 — Build the APK

### Option A — Gradle CLI

```bash
cd android
./gradlew assembleDebug      # debug APK, auto-signed with the local debug key
./gradlew assembleRelease    # release APK, signed with the release key (see Signing)
./gradlew clean              # if a build goes weird
```

Outputs (git-ignored):

| Build | Path | Size (v1.1.4) |
|---|---|---|
| debug | `android/app/build/outputs/apk/debug/app-debug.apk` | ~11.5 MB |
| release | `android/app/build/outputs/apk/release/app-release.apk` (`app-release-unsigned.apk` if `keystore.properties` is missing) | ~10.3 MB |

Both were built successfully on 2026-08-31 (debug 1m 24s cold, release 35s warm).

### Option B — Android Studio

```bash
npm run cap:android    # builds, syncs, then opens the android/ project
```

Then **Build → Build Bundle(s) / APK(s) → Build APK(s)**, or ▶ Run to deploy straight onto a connected device. Studio uses its own bundled JDK, so `JAVA_HOME` doesn't matter on this path.

---

## Step 5 — Signing

`android/app/build.gradle` has a `signingConfigs.release` block driven by **`android/keystore.properties`** (git-ignored). When that file exists, `assembleRelease` emits a signed `app-release.apk`. When it is missing, the build falls back to `app-release-unsigned.apk`, which Android refuses to install — so a machine without the key can still build, but cannot produce a shippable APK.

### The release key

| | |
|---|---|
| Keystore | `C:/Users/user_/secure/dibh-release.jks` on the build workstation (PKCS12, **outside the repo**) |
| Alias | `dibh` |
| Key | RSA 4096, valid 10000 days, created 2026-09-03 |
| Certificate DN | `CN=DIBH-Flow Release, OU=Medical Software, O=THEPICT Inc., C=KR` |
| Certificate SHA-256 | `b1f79136a02aa91d9a8061cf845dc0d91c10a82da749cb2ae815296fbd93cc1d` |

The passwords live in `android/keystore.properties` on the build workstation and in the team's secret store — never in this document or the repo.

`android/keystore.properties`:

```properties
storeFile=C:/Users/user_/secure/dibh-release.jks
storePassword=<...>
keyAlias=dibh
keyPassword=<...>
```

### Setting up another build machine

1. Copy `dibh-release.jks` from the secret store to a location outside the repo.
2. Create `android/keystore.properties` as above, pointing `storeFile` at that location.
3. `cd android && ./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk`.

### Verify what you built — every time

```bash
BT="$HOME/AppData/Local/Android/Sdk/build-tools/36.1.0"
"$BT/apksigner" verify --print-certs -v app-release.apk       # Verifies; CN=DIBH-Flow Release; SHA-256 b1f79136…
"$BT/aapt2" dump badging app-release.apk | grep -E "^package|debuggable"   # expected versionCode/versionName; NO "application-debuggable" line
```

If the signer is `CN=Android Debug` or an `application-debuggable` line appears, you are holding a debug build, not a release — do not hand it to anyone as one.

### Option B — sign an unsigned APK by hand

Only needed when building on a machine without `keystore.properties`:

```bash
"$BT/zipalign" -v -p 4 app-release-unsigned.apk app-release-aligned.apk
"$BT/apksigner" sign --ks C:/Users/user_/secure/dibh-release.jks --ks-key-alias dibh --out app-release.apk app-release-aligned.apk
"$BT/apksigner" verify --print-certs app-release.apk
```

### Signing rules that bite

- **The same key forever.** An APK signed with a different key cannot install over an existing one — the user has to uninstall first, which wipes all local data (this app is offline-only; localStorage + IndexedDB go with it). Losing the keystore means no more updates, ever. Back it up in the team's secret store.
- `*.jks`, `*.keystore` and `keystore.properties` are git-ignored via `android/.gitignore`. Keep the keystore outside the repo anyway.
- Debug builds (`assembleDebug`) are signed with `~/.android/debug.keystore` (`CN=Android Debug`) and are `debuggable`. They are fine as the "debug" sample for the reviewer and for device testing, nothing else.

### Negative-test APK (wrong key) for the MFDS/KTC review

The reviewer's third sample — "올바르지 않은 서명파일 혹은 키로 빌드한 앱 (업데이트 파일 무결성 확인용)" — is the release APK **re-signed** with a throwaway key so Android rejects it as an update. Re-signing the same file keeps every ZIP entry byte-identical; only the APK Signing Block differs, which is exactly what the test is meant to exercise.

```bash
# throwaway key — created once, kept next to the release key, never used for a real build
keytool -genkeypair -keystore C:/Users/user_/secure/dibh-WRONGKEY-test-only.jks -storetype PKCS12 \
        -alias wrongkey -keyalg RSA -keysize 2048 -validity 3650 \
        -dname "CN=WRONG KEY - TEST ONLY - DO NOT SHIP, O=THEPICT Inc., C=KR"

# same signing schemes as the Gradle release build (v2 only), so the only difference is the certificate
"$BT/apksigner" sign --ks C:/Users/user_/secure/dibh-WRONGKEY-test-only.jks --ks-key-alias wrongkey \
        --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled false --v4-signing-enabled false \
        --out dibh-Flow1.1.5_release_WRONGKEY.apk dibh-Flow1.1.5_release.apk
```

Expected device behaviour:

```bash
adb install    dibh-Flow1.1.4_release.apk           # Success
adb install -r dibh-Flow1.1.5_release.apk           # Success — normal update, same key, 10104 -> 10105
adb install -r dibh-Flow1.1.5_release_WRONGKEY.apk  # Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: ... signatures do not match ...]
```

The 2026-09-03 submission set and its per-file fingerprints are recorded in `apk builds/README_서명검증_2026-09-03.md` next to the APKs.

---

## Step 6 — Install and verify

```bash
adb install -r app-release.apk          # -r = reinstall/update in place
adb shell dumpsys package com.thepict.dibhtraining | grep versionName
```

Sanity checks on the device:

1. App mounts past the startup self-check (Web Crypto round-trip + SI-04 asset integrity).
2. Login page footer shows the expected `v<version>` and 유통표준코드(GTIN-13).
3. For a production build: DevTools console shows **no** `[SECURITY-AUDIT]` groups, and `/admin/auditlog` shows no "지금 검증" QA button. If either appears, you built with `VITE_DEBUG_MODE=true` — fix `.env` and rebuild.
4. `apksigner verify --print-certs` on the file you are about to hand over shows `CN=DIBH-Flow Release`, never `CN=Android Debug`, and `aapt2 dump badging` shows no `application-debuggable` line.

Chrome DevTools attach instructions: [android-debug-guide.md](./android-debug-guide.md).

---


## The offline guarantee — do not break it

This device is certified as offline-only. Three things enforce it, and all three are checked automatically:

| Enforcement | Where | Checked by |
|---|---|---|
| No `android.permission.INTERNET` | `android/app/src/main/AndroidManifest.xml` | `src/config/offlineCompliance.test.js` |
| No external asset in the bundle (fonts included) | `index.html`, `src/index.css` | `scripts/verify-offline.js`, run by `npm run build` |
| CSP names no external origin | `index.html` + `vite.config.js` | both of the above |

Also set for the same reason: `android:allowBackup="false"` (keeps encrypted PHI out of Google cloud backup) and the two WebView `meta-data` opt-outs for Safe Browsing and metrics, which otherwise produce traffic under the app UID during a `netstats` measurement.

If a KTC/MFDS reviewer measures traffic again, the expected result is zero bytes for this UID. Capturing that evidence:

```bash
adb shell dumpsys package com.thepict.dibhtraining | grep -A5 "requested permissions"   # INTERNET absent
UID=$(adb shell dumpsys package com.thepict.dibhtraining | grep userId= | head -1)
adb shell cat /proc/net/xt_qtaguid/stats | grep "$UID"    # or: adb shell dumpsys netstats detail | grep -A3 "$UID"
```

---
## Gotchas checklist

| ⚠️ | Detail |
|---|---|
| Building never bumps the version | `npm version` first, or you ship two different APKs numbered the same |
| `.env` is invisible in git | `VITE_DEBUG_MODE=true` silently produces a debug-flavoured "release" |
| Web assets aren't committed | always `cap sync` (or `npm run cap:build`) after a fresh clone or a web change |
| Release APK is unsigned | only when `android/keystore.properties` is missing — set it up (Step 5); an unsigned APK cannot be installed |
| A debug APK looks like a release APK | same package, same version — only `apksigner verify --print-certs` tells them apart. Check before handing anything over |
| Never edit synced assets | breaks the SI-04 integrity check and blocks app startup |
| Pre-release version strings | `1.2.0-rc.1` fails the `versionCode` derivation at configure time |
| Re-adding INTERNET or a CDN asset | breaks the SI-01 certification claim; `npm run build` and `npm test` both fail on it |
| JDK on PATH is 25 | keep `JAVA_HOME` on the Android Studio JBR (21) for CLI builds |
