# App Versioning Guide

How the app version works, where it's displayed, and how to bump it before a build.

---

## Source of truth

`package.json` → `"version"` is the **only** place the version is set. Everything else reads from it — nothing else needs manual editing.

| Consumer | How it gets the version |
|---|---|
| Web build (`__APP_VERSION__`) | `vite.config.js` reads `package.json` at build time via Vite's `define` |
| Android (`versionName` / `versionCode`) | `android/app/build.gradle` parses the repo-root `package.json` directly at Gradle config time |
| Login page footer | `v{__APP_VERSION__}` |
| Admin pages (`/admin/accounts`, `/admin/auditlog`, `/admin/backup`) | `v{__APP_VERSION__}` next to the tab nav |
| Backup file metadata (`AdminBackup.jsx`) | `_version` field stamped into exported backup JSON |

`versionCode` (Android's internal integer version, required to always increase) is derived automatically from semver as `major*10000 + minor*100 + patch`. Example: `1.1.3` → `10103`. You never set this by hand.

---

## ⚠️ Building does NOT bump the version

Running `npm run build`, `npm run cap:build`, etc. only **stamps whatever version is currently in `package.json`**. It does not increment anything. If you build twice in a row without bumping, you get the same version twice.

**You must bump first, then build.**

---

## How to bump

```bash
npm version patch   # 1.1.3 → 1.1.4   (bug fixes, small tweaks)
npm version minor    # 1.1.3 → 1.2.0  (new features, backwards-compatible)
npm version major    # 1.1.3 → 2.0.0  (breaking changes)
```

By default `npm version` also creates a git commit + tag. If you don't want that (e.g. mid-work, not ready to commit yet), add `--no-git-tag-version`:

```bash
npm version patch --no-git-tag-version
```

To set an exact version instead of bumping relative to the current one:

```bash
npm version 1.1.3 --no-git-tag-version
```

---

## Typical release flow

```bash
npm version patch          # bump package.json (+ commit/tag if desired)
npm run cap:build          # build web assets + sync to Android
npm run cap:android        # open Android Studio, build/sign the APK
```

After bumping, the new version automatically shows up:
- in the built web bundle (`__APP_VERSION__`)
- in the Android manifest / APK (`versionName`, `versionCode`)
- on the Login page and Admin pages footer/nav

No other file needs touching.
