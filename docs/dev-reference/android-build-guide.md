# Android Build & Release Guide

How to go from a clean checkout to an installable APK of DIBH - Flow (`com.thepict.dibhtraining`).

Covers the debug build (for testing on a device) and the release build (for hospital install / MFDS-KTC submission), including the signing step that is **not yet configured** in this repo.

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
| Android Gradle Plugin | 8.13.0 | `android/build.gradle` |
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
cd android && ./gradlew assembleRelease     # -> app-release-unsigned.apk
#   ...or: npm run cap:android              # opens Android Studio instead

# 5. SIGN IT — see "Signing" below. An unsigned APK cannot be installed.
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
| Tests pass | `npm test` | 17 files / 79 tests |
| Lint | `npm run lint` | note: the repo has a large pre-existing error backlog — compare, don't expect zero |
| SBOM current | `npm run sbom` | regenerates `docs/submission/sbom.cdx.json`; required if any dependency changed |

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
./gradlew assembleRelease    # release APK, UNSIGNED (see Signing)
./gradlew clean              # if a build goes weird
```

Outputs (git-ignored):

| Build | Path | Size (v1.1.4) |
|---|---|---|
| debug | `android/app/build/outputs/apk/debug/app-debug.apk` | ~11.5 MB |
| release | `android/app/build/outputs/apk/release/app-release-unsigned.apk` | ~10.3 MB |

Both were built successfully on 2026-08-31 (debug 1m 24s cold, release 35s warm).

### Option B — Android Studio

```bash
npm run cap:android    # builds, syncs, then opens the android/ project
```

Then **Build → Build Bundle(s) / APK(s) → Build APK(s)**, or ▶ Run to deploy straight onto a connected device. Studio uses its own bundled JDK, so `JAVA_HOME` doesn't matter on this path.

---

## Step 5 — Signing ⚠️ not configured

`android/app/build.gradle` has **no `signingConfigs` block**, and there is **no keystore in this repo**. `assembleRelease` therefore produces `app-release-unsigned.apk`, which Android will refuse to install.

Two ways to sign — pick one and stick with it.

### Option A — wire signing into Gradle (recommended for repeat builds)

1. Create a keystore once, and **back it up somewhere safe**:

```bash
keytool -genkey -v -keystore dibh-release.jks -alias dibh \
        -keyalg RSA -keysize 4096 -validity 10000
```

2. Put its coordinates in `android/keystore.properties` (**never commit this**):

```properties
storeFile=C:/secure/dibh-release.jks
storePassword=<...>
keyAlias=dibh
keyPassword=<...>
```

3. Add to `android/app/build.gradle`:

```groovy
def keystorePropertiesFile = rootProject.file('keystore.properties')
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

`assembleRelease` then emits a signed `app-release.apk`.

### Option B — sign the unsigned APK by hand

```bash
SDK="$HOME/AppData/Local/Android/Sdk"
BT="$SDK/build-tools/36.1.0"

"$BT/zipalign" -v -p 4 app-release-unsigned.apk app-release-aligned.apk
"$BT/apksigner" sign --ks dibh-release.jks --out app-release.apk app-release-aligned.apk
"$BT/apksigner" verify --print-certs app-release.apk
```

### Signing rules that bite

- ⚠️ **`*.jks` and `*.keystore` are NOT git-ignored here.** Those two lines are commented out in `android/.gitignore` (the stock Android template ships them disabled) and `keystore.properties` is not listed at all. Uncomment them and add `keystore.properties` **before** putting any key in the tree, or you will commit a signing key.
- **The same key forever.** An APK signed with a different key cannot install over an existing one — the user has to uninstall first, which wipes all local data (this app is offline-only; localStorage + IndexedDB go with it). Losing the keystore means no more updates, ever.
- Keep the keystore and its passwords out of the repo and in whatever secret store the team already uses.

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

Chrome DevTools attach instructions: [android-debug-guide.md](./android-debug-guide.md).

---

## Gotchas checklist

| ⚠️ | Detail |
|---|---|
| Building never bumps the version | `npm version` first, or you ship two different APKs numbered the same |
| `.env` is invisible in git | `VITE_DEBUG_MODE=true` silently produces a debug-flavoured "release" |
| Web assets aren't committed | always `cap sync` (or `npm run cap:build`) after a fresh clone or a web change |
| Release APK is unsigned | out of the box it cannot be installed at all |
| Keystores aren't git-ignored | uncomment `*.jks` / `*.keystore` in `android/.gitignore` first |
| Never edit synced assets | breaks the SI-04 integrity check and blocks app startup |
| Pre-release version strings | `1.2.0-rc.1` fails the `versionCode` derivation at configure time |
| JDK on PATH is 25 | keep `JAVA_HOME` on the Android Studio JBR (21) for CLI builds |
