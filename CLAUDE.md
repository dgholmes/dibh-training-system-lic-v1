# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Dev server at http://localhost:5174
npm run build     # Production build
npm run lint      # ESLint
npm test          # Vitest (all tests, once)
npm test -- --watch                        # Watch mode
npm test -- src/lib/calibration            # Run tests in a folder
npm test -- determineDibhType.test         # Run a specific test file

# Mobile (Android via Capacitor)
npm run cap:build    # Build + sync to Android
npm run cap:android  # Open Android Studio
npm run cap:sync     # Sync dist/ to Android project

npm run sbom         # Regenerate docs/submission/sbom.cdx.json (cyclonedx-npm)
```

Android release builds are signed by a `keystore.properties`-driven `signingConfigs.release` block in `android/app/build.gradle`. The keystore and `android/keystore.properties` live outside git (both git-ignored; the key sits under `C:/Users/<user>/secure/` on the build workstation). When the properties file is absent, `assembleRelease` falls back to `app-release-unsigned.apk`, which cannot be installed. Debug builds are debug-keystore signed and `debuggable` — never hand one over as a release. Signing setup, verification, and the wrong-key negative-test procedure for the MFDS review are in `docs/dev-reference/android-build-guide.md` (Step 5).

## Architecture

**DIBH (Deep Inspiration Breath Hold) training management system** — a fully offline, browser-only medical app for patient registration, breathing data uploads, and DIBH calibration analysis. UI is in Korean. No backend; all persistence is local. Targets Android via Capacitor (`com.thepict.dibhtraining`).

### Persistence (two-layer)

- **localStorage** via `src/api/localStore.js` — CRUD for `Patient`, `TrainingSession`, `Calibration`, `CalibrationSession` entities. Patient PII fields are AES-256-GCM encrypted before storage. `TrainingSession` and `Calibration` are **async** (not `CalibrationSession`, which is ephemeral/deleted on completion): `create`/`update` stamp a SHA-256 `_hash` (`computeRecordHash` in `src/lib/crypto.js`) over the record; `list`/`filter`/`get` recompute and compare it on read, tagging a mismatch as `_integrityFailed: true` and logging `DATA_INTEGRITY_FAILED` rather than throwing — a missing `_hash` (pre-upgrade record) is treated as unverified, never as tampered. `migrateLegacyRecordHashes()` backfills `_hash` once at startup for records that predate this.
- **SQLite (sql.js/WASM) + IndexedDB** via `src/db/sqliteDb.js` — two tables: `breathing_files` (BLOBs, max 10 per patient per category, AES-256-GCM encrypted via `encryptBytes`/`decryptBytes` + a SHA-256 `content_hash` checked on every read; legacy unencrypted rows are marked via a `content_encrypted` column) and `patients` (encrypted mirror of localStorage). Initialized in `main.jsx` before React mounts; migrations run automatically.
- **React Query** wraps both stores for caching/invalidation — query functions read localStorage or SQLite directly, `await`ing where the underlying store call is async.

### Security & compliance (MFDS cybersecurity guidelines)

- **Encryption** (`src/lib/crypto.js`) — AES-256-GCM via Web Crypto API. A random 256-bit installation key lives in localStorage (`dibh_install_key`); encrypted values are stored as `enc:<ivHex>:<ciphertextHex>` (`encryptValue`/`decryptValue`), raw bytes as `[12-byte IV][ciphertext]` (`encryptBytes`/`decryptBytes`, used for breathing-file BLOBs). `encryptPatient`/`decryptPatient` and `encryptUserMeta`/`decryptUserMeta` follow the same pattern — pull a fixed field set into an `_enc` blob, leave the rest plaintext. `encryptUserMeta` additionally seals the record's `id` inside the encrypted payload so a swapped `_enc` blob (copied from a different user) is detected as `_decryptionFailed: true` rather than silently decrypting into someone else's role. SHA-256 (`sha256Hex`, `computeRecordHash`/`stableStringify`) is used for file/record integrity (SI-04). Unencrypted/unhashed legacy records are read transparently, never treated as tampered.
- **Decryption-failure handling is fail-closed for auth, not just non-crashing.** `decryptUserMeta` returns safe fallback fields plus `_decryptionFailed: true` on failure (so a single bad record can't crash login/account management), but `loginUser` and every `UserStore` mutator (`unlock`/`setRole`/`changePassword`/`resetPassword`) explicitly refuse to act on a `_decryptionFailed` record instead of silently persisting the fallback values as new truth. The only recovery path is delete-and-recreate the account (`UserStore.delete`, which refuses on the last remaining account).
- **Authentication** (`src/api/authStore.js`) — PBKDF2-SHA256 (100k iterations, 16-byte salt). Lockout after 5 failed attempts (15-min cooldown, two-layer: a cross-session tick-counter heartbeat + a same-session `performance.now()` check). Default admin: `admin` / `Admin@1234!` (created on first run, must be changed). Sessions in sessionStorage (cleared on tab close). `role`/`mustChangePassword`/lockout fields are AES-256-GCM encrypted (`encryptUserMeta`); `username`/`id`/`passwordHash`/`salt`/timestamps stay plaintext for lookup. Every read-modify-write against `dibh_users` (the heartbeat, `loginUser`, all `UserStore` mutators) is serialized through a module-level `mutateUsers(fn)` promise queue — add new mutators through it too, or concurrent calls can silently drop each other's writes. `migrateLegacyUserMetadata()` backfills encryption for pre-upgrade plaintext user records once at startup.
- **Session timeout** (`src/context/AuthContext.jsx`) — 30-minute inactivity timeout with warning; listens for mousedown/keydown/touchstart/scroll to reset timer. Its startup bootstrap effect also runs `ensureDefaultAdmin()` then the two legacy migrations (`migrateLegacyUserMetadata`, `migrateLegacyRecordHashes`) before restoring the session — a migration failure is caught and logged, never blocks login.
- **Audit log** (`src/api/auditStore.js`) — append-only, max 10,000 entries (oldest trimmed). Hash-chained: each entry carries `prevHash` (previous entry's `hash`, or a fixed genesis value for the first) and `hash` = SHA-256 over its own content, so edits/deletions/reordering are detectable via `verifyAuditChain()` (surfaced in `/admin/auditlog`'s "지금 검증" button, gated behind `SECURITY_DEBUG`); entries predating this feature are legacy/unverified, not counted as broken. `writeAuditLog`/`tryWriteAuditLog` are async and serialized through their own write queue for the same reason as `mutateUsers` above. Logs: LOGIN, LOGIN_FAILED, ACCOUNT_LOCKED, USER_\*, PASSWORD_\*, PATIENT_\*, FILE_\*, ANALYSIS_\*, CALIBRATION_\*, BACKUP_\*, DEIDENTIFIED_EXPORT\*, DATA_INTEGRITY_FAILED, INTEGRITY_CHECK_FAILED, LEGACY_DATA_MIGRATED, USAGE_NOTICE_UPDATED. ISO 8601 timestamps. `seedDebugAuditEntries()` (bulk QA seeding) is `SECURITY_DEBUG`-gated and structurally excluded from production builds.
- **Password policy** (`src/lib/passwordUtils.js`) — min 8 chars, uppercase + lowercase + digit + special char (MFDS IA-05).
- **Startup self-check** (`src/main.jsx`) — verifies Web Crypto availability and encryption round-trip before React mounts; blocks app if security requirements fail. A production-build asset-integrity check (`integrityCheck()`, SI-04) hashes `dist/assets/*.{js,css,wasm}` against a build-time manifest (`dist/integrity.json`, generated by `scripts/generate-integrity.js`) and logs `INTEGRITY_CHECK_FAILED` before blocking the mount on mismatch.
- **`SECURITY_DEBUG`** (`src/lib/securityDebug.js`, driven by `VITE_DEBUG_MODE` in `.env`) gates verbose per-operation console logging (`secDbg`) plus a few admin-only QA affordances (debug audit-log seeding, the audit chain verify UI) that must never appear in a production/submission build.

### Routing

Routes are defined in `src/pages/index.jsx`. All non-public routes require authentication via `ProtectedRoute`.

| Route | Page | Notes |
|---|---|---|
| `/login` | Login | Public |
| `/home` | Patient list | |
| `/newpatient` | Create patient | |
| `/patientdashboard` | Per-patient overview, calibration status | |
| `/breathingdataupload` | Upload CSV/VXP files | |
| `/analysisfileselect` | Pick general + DIBH files, trigger analysis | |
| `/calibrationreport` | Full calibration report with waveform playback | |
| `/traininghistory` | Training session history | |
| `/typedecision` | Post-analysis type confirmation | |
| `/admin/accounts` | User account management | Admin only |
| `/admin/auditlog` | Audit log viewer (page size fits viewport height, searchable) | Admin only |
| `/admin/backup` | AES-256 encrypted backup/restore + de-identified CSV export; saved via `@capacitor/filesystem` to `Directory.Documents` on native builds (falls back to a browser download on web) | Admin only |

Legacy routes (`/calibration`, `/trainingmonitor`, etc.) redirect to `/home` via `LegacyFlowRedirect`.

### Breathing analysis pipeline

Orchestrated in `src/lib/calibration/analyzeFiles.js`:

1. **CSV parsing** — 4-column format `(t, raw, [filtered], [dy])`; rows with <2 columns or non-numeric data are skipped.
2. **Stage 1** (`stage1Analyzer.js`) — `EnsembleRTAnalyzer` extracts breathing cycles and computes CV (coefficient of variation).
3. **Stage 2** — max_amp estimated from DIBH signal percentiles (10th–95th); no separate file needed.
4. **Stage 3** (`stage3Detector.js`) — `Stage3Detector` finds stable DIBH holds and outputs attempt data with durations.
5. **Type classification** (`determineDibhType.js`) — maps `(avgDibh, cv)` → type A (excellent), B (moderate), or C (poor).

File naming convention: `{PATIENT_CODE}_{GEN|DIBH}_{YYYYMMDD}[_{seq}].ext`

### Key conventions

- **Path alias:** `@` resolves to `src/`.
- **Styling:** Tailwind CSS with a dark GitHub-inspired palette (`#0D1117` bg, `#30363D` borders, `#C9D1D9` text); global overrides in `src/index.css`.
- **UI primitives:** Radix UI components wrapped in `src/components/ui/`.
- **Icons:** `lucide-react`.
- **Forms:** `react-hook-form` + `zod` for validation.
- **Toasts:** `sonner`.
- **Charts:** `recharts` for waveform/playback visualization.
- **Calibration thresholds** (recalibration interval, session counts, status colors) live in `src/config/recalibration.js`.
- **Patient codes** are auto-generated as `PT-YYYY-NNN` by `src/lib/patientCode.js`.
- **App version** is exposed as `__APP_VERSION__` via Vite `define`.
- **Vitest** runs in `node` environment (not jsdom); SQLite/WASM is mocked in tests.

### Tests

Tests use Vitest with `vi.mock()` / `vi.mocked()` for the breathing file repository. Synthetic CSV data is built with fixture helpers (`buildGeneralCsv`, `buildDibhCsv`). Calibration pipeline tests live under `src/lib/calibration/`:

- `parseCsv.test.js` — CSV parsing edge cases
- `determineDibhType.test.js` — A/B/C classification boundaries
- `analyzeFiles.integration.test.js` — full pipeline with a mocked repository
- `sortCalibrations.test.js` — latest-calibration/sort-order edge cases

Storage/crypto tests (all in `node` environment — stub `localStorage`/`sessionStorage` with `vi.stubGlobal` and `vi.resetModules()` in `beforeEach`, since `crypto.js`/`authStore.js`/`auditStore.js` hold module-level state like the crypto key cache and the lockout heartbeat interval):

- `src/lib/crypto.recordHash.test.js`, `crypto.userMeta.test.js`, `crypto.bytes.test.js` — hashing/encryption helper round-trips and tamper detection
- `src/api/localStore.integrity.test.js` — `TrainingSession`/`Calibration` hash verification and the legacy-hash migration
- `src/api/authStore.test.js` — login/lockout, encrypted metadata, the `mutateUsers` write queue (including a concurrent-write test), and the legacy-metadata migration
- `src/api/auditStore.chain.test.js`, `auditStore.test.js` — hash-chain verification (including concurrent writes and mixed legacy/hashed logs) and debug-seed FIFO trimming
- `src/pages/AdminBackup.test.js` — full backup/restore round-trip across all storage keys, including legacy (v1) backup fixtures
