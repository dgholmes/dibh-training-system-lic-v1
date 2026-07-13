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
```

## Architecture

**DIBH (Deep Inspiration Breath Hold) training management system** — a fully offline, browser-only medical app for patient registration, breathing data uploads, and DIBH calibration analysis. UI is in Korean. No backend; all persistence is local. Targets Android via Capacitor (`com.thepict.dibhtraining`).

### Persistence (two-layer)

- **localStorage** via `src/api/localStore.js` — synchronous CRUD for `Patient`, `TrainingSession`, `Calibration`, `CalibrationSession` entities. Patient PII fields are AES-256-GCM encrypted before storage.
- **SQLite (sql.js/WASM) + IndexedDB** via `src/db/sqliteDb.js` — two tables: `breathing_files` (BLOBs, max 10 per patient per category) and `patients` (mirrored from localStorage). Initialized in `main.jsx` before React mounts; migrations run automatically.
- **React Query** wraps both stores for caching/invalidation — query functions read localStorage or SQLite directly.

### Security & compliance (MFDS cybersecurity guidelines)

- **Encryption** (`src/lib/crypto.js`) — AES-256-GCM via Web Crypto API. A random 256-bit installation key lives in localStorage; encrypted values are stored as `enc:<ivHex>:<ciphertextHex>`. SHA-256 is used for file integrity (SI-04). Unencrypted legacy records are read transparently.
- **Authentication** (`src/api/authStore.js`) — PBKDF2-SHA256 (100k iterations, 16-byte salt). Lockout after 5 failed attempts (15-min cooldown). Default admin: `admin` / `Admin@1234!` (created on first run, must be changed). Sessions in sessionStorage (cleared on tab close).
- **Session timeout** (`src/context/AuthContext.jsx`) — 30-minute inactivity timeout with warning; listens for mousedown/keydown/touchstart/scroll to reset timer.
- **Audit log** (`src/api/auditStore.js`) — append-only, max 10,000 entries (oldest trimmed). Logs: LOGIN, LOGIN_FAILED, ACCOUNT_LOCKED, USER_\*, PASSWORD_\*, PATIENT_\*, FILE_\*, ANALYSIS_\*, CALIBRATION_\*. ISO 8601 timestamps.
- **Password policy** (`src/lib/passwordUtils.js`) — min 8 chars, uppercase + lowercase + digit + special char (MFDS IA-05).
- **Startup self-check** (`src/main.jsx`) — verifies Web Crypto availability and encryption round-trip before React mounts; blocks app if security requirements fail.

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
| `/admin/backup` | AES-256 encrypted backup/restore + de-identified CSV export | Admin only |

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

Tests use Vitest with `vi.mock()` / `vi.mocked()` for the breathing file repository. Synthetic CSV data is built with fixture helpers (`buildGeneralCsv`, `buildDibhCsv`). Three test files exist under `src/lib/calibration/`:

- `parseCsv.test.js` — CSV parsing edge cases
- `determineDibhType.test.js` — A/B/C classification boundaries
- `analyzeFiles.integration.test.js` — full pipeline with a mocked repository
