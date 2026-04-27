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
```

## Architecture

**DIBH (Deep Inspiration Breath Hold) training management system** — a fully offline, browser-only medical app for patient registration, breathing data uploads, and DIBH calibration analysis. UI is in Korean. No backend; all persistence is local.

### Persistence (two-layer)

- **localStorage** via `src/api/localStore.js` — synchronous CRUD for `Patient`, `TrainingSession`, `Calibration`, `CalibrationSession` entities.
- **SQLite (sql.js) + IndexedDB** via `src/db/sqliteDb.js` — stores uploaded file BLOBs in the `breathing_files` table; also mirrors patients. SQLite is initialized in `main.jsx` before React mounts; migrations run automatically.
- **React Query** wraps both stores for caching/invalidation — there is no server; query functions just read localStorage or SQLite.

### Routing

Routes are defined in `src/pages/index.jsx`. Key pages:

| Route | Page |
|---|---|
| `/home` | Patient list |
| `/patientdashboard` | Per-patient overview, calibration status, history |
| `/breathingdataupload` | Upload CSV/VXP files |
| `/analysisfileselect` | Pick general + DIBH files, trigger analysis |
| `/trainingreport` | Full calibration report with waveform playback |
| `/traininghistory` | Training session history |
| `/typedecision` | Post-analysis type confirmation |

Legacy routes (Calibration, TrainingMonitor, etc.) redirect to the dashboard via `LegacyFlowRedirect`.

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
- **Styling:** Tailwind CSS with a dark GitHub-inspired palette; global overrides in `src/index.css`.
- **UI primitives:** Radix UI components wrapped in `src/components/ui/`.
- **Icons:** `lucide-react`.
- **Forms:** `react-hook-form` + `zod` for validation.
- **Toasts:** `sonner`.
- **Charts:** `recharts` for waveform/playback visualization.
- **Calibration thresholds** (recalibration interval, session counts, status colors) live in `src/config/recalibration.js`.
- **Patient codes** are auto-generated as `PT-YYYY-NNN` by `src/lib/patientCode.js`.

### Tests

Tests use Vitest with `vi.mock()` / `vi.mocked()` for the breathing file repository. Synthetic CSV data is built with fixture helpers (`buildGeneralCsv`, `buildDibhCsv`). Three test files exist under `src/lib/calibration/`:

- `parseCsv.test.js` — CSV parsing edge cases
- `determineDibhType.test.js` — A/B/C classification boundaries
- `analyzeFiles.integration.test.js` — full pipeline with a mocked repository
