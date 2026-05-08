# Scan-Based DIBH Hold Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the real-time Stage3Detector state machine in the file-based analysis pipeline with a scan-based hold detector that finds inhale→hold→exhale patterns in any pre-recorded signal without requiring a controlled acquisition structure.

**Architecture:** Add `detectDibhHolds(samples, maxAmp)` to `analyzeFiles.js` alongside the existing parsers. It scans the LPF-smoothed signal for contiguous periods above `hold_th` (baseline + 80% of maxAmp), uses hysteresis on exit (release at 50%), and filters by minimum duration. The `analyzeFiles()` function replaces the `Stage3Detector` usage block with a single call to this function. Stage 1 (CV from cycles) is unchanged.

**Tech Stack:** Vanilla JS, Vitest. `OnePoleLPF` imported from the existing `stage3Detector.js` (only import kept from that module).

---

## File Map

| Action | Path | What changes |
|--------|------|--------------|
| Modify | `src/lib/calibration/analyzeFiles.js` | Add `detectDibhHolds`; replace Stage3 block in `analyzeFiles()`; update imports, results, playback |
| Modify | `src/lib/calibration/parseCsv.test.js` | Add `detectDibhHolds` test suite |

---

## Task 1: Write failing tests for `detectDibhHolds`

**Files:**
- Modify: `src/lib/calibration/parseCsv.test.js`

- [ ] **Step 1: Add the import and new describe block at the bottom of `src/lib/calibration/parseCsv.test.js`**

Append after the existing `parseBreathingFile` describe block:

```js
import { parseCsv, parseVxp, parseBreathingFile, detectDibhHolds } from './analyzeFiles.js';
```

Replace the existing import line (currently line 2) with the above.

Then append at the end of the file:

```js
describe('detectDibhHolds', () => {
  /** Build a simple flat→ramp→hold→ramp→flat signal at 25 Hz. */
  function buildHoldSignal({ baselineVal = 10, holdVal = 20, holdSec = 20 } = {}) {
    const samples = [];
    const push = (t, raw) => samples.push({ t: parseFloat(t.toFixed(6)), raw });
    // 4s baseline
    for (let i = 0; i < 100; i++) push(i * 0.04, baselineVal);
    // 2s inhale ramp
    for (let i = 0; i < 50; i++) push(4 + i * 0.04, baselineVal + (i / 49) * (holdVal - baselineVal));
    // holdSec hold
    for (let i = 0; i < Math.round(holdSec / 0.04); i++) push(6 + i * 0.04, holdVal);
    // 1s exhale ramp
    for (let i = 0; i < 25; i++) push(6 + holdSec + i * 0.04, holdVal - (i / 24) * (holdVal - baselineVal));
    // 2s tail
    for (let i = 0; i < 50; i++) push(7 + holdSec + i * 0.04, baselineVal);
    return samples;
  }

  it('detects a single valid hold and returns correct duration', async () => {
    const samples = buildHoldSignal({ holdSec: 20 });
    // maxAmp = holdVal - baselineVal = 10; hold_th = 10 + 0.8*10 = 18
    const { holds, baseline, holdTh, releaseTh } = await detectDibhHolds(samples, 10);
    expect(holds.length).toBe(1);
    expect(holds[0].hold_duration).toBeGreaterThan(15);
    expect(holds[0].valid).toBe(true);
    expect(baseline).toBeCloseTo(10, 0);
    expect(holdTh).toBeCloseTo(18, 0);
    expect(releaseTh).toBeCloseTo(15, 0);
  });

  it('detects multiple holds in one file', async () => {
    const single = buildHoldSignal({ holdSec: 15 });
    // shift second copy by 60s and concatenate
    const offset = single[single.length - 1].t + 1;
    const second = single.map(({ t, raw }) => ({ t: parseFloat((t + offset).toFixed(6)), raw }));
    const samples = [...single, ...second];
    const { holds } = await detectDibhHolds(samples, 10);
    expect(holds.length).toBe(2);
    expect(holds[0].hold_duration).toBeGreaterThan(10);
    expect(holds[1].hold_duration).toBeGreaterThan(10);
  });

  it('ignores holds shorter than 3 seconds', async () => {
    const samples = buildHoldSignal({ holdSec: 2 }); // 2s < min_hold_sec=3s
    const { holds } = await detectDibhHolds(samples, 10);
    expect(holds.length).toBe(0);
  });

  it('returns no holds when signal never crosses hold_th', async () => {
    // Sine wave peaking at 15 — hold_th=18, never reached
    const samples = [];
    for (let i = 0; i < 300; i++) {
      const t = i * 0.04;
      samples.push({ t, raw: 10 + 5 * Math.sin(2 * Math.PI * t / 5) });
    }
    const { holds } = await detectDibhHolds(samples, 10);
    expect(holds.length).toBe(0);
  });

  it('chartData covers the full signal with smoothed values', async () => {
    const samples = buildHoldSignal({ holdSec: 10 });
    const { chartData } = await detectDibhHolds(samples, 10);
    expect(chartData.length).toBe(samples.length);
    expect(chartData[0]).toHaveProperty('time');
    expect(chartData[0]).toHaveProperty('value');
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail (function not yet exported)**

```
npm test -- parseCsv.test
```

Expected: `detectDibhHolds is not a function` errors on the new suite. Existing parseCsv / parseVxp / parseBreathingFile tests must still pass.

---

## Task 2: Implement `detectDibhHolds` in `analyzeFiles.js`

**Files:**
- Modify: `src/lib/calibration/analyzeFiles.js`

- [ ] **Step 1: Update the import — keep only `OnePoleLPF`, drop `Stage3Detector` and `DerivativeEstimator`**

Find:
```js
import { Stage3Detector, OnePoleLPF, DerivativeEstimator } from './stage3Detector.js';
```

Replace with:
```js
import { OnePoleLPF } from './stage3Detector.js';
```

- [ ] **Step 2: Add `detectDibhHolds` after `estimateMaxAmpFromSignal` (before `yieldToUI`)**

Find:
```js
/** Yield to the event loop so the UI stays responsive. */
function yieldToUI() {
```

Insert before it:

```js
/**
 * Scan-based DIBH hold detector for pre-recorded files.
 *
 * Unlike Stage3Detector (real-time state machine), this makes no assumptions
 * about signal structure — it finds all sustained elevated plateaus regardless
 * of when they occur or how many there are.
 *
 * Algorithm:
 *   1. baseline  = p10 of raw samples (resting/exhale level)
 *   2. hold_th   = baseline + 0.80 * maxAmp  — enter hold when signal crosses this
 *   3. release_th = baseline + 0.50 * maxAmp — exit hold (hysteresis prevents noise exits)
 *   4. Scan LPF-smoothed signal; collect contiguous periods above hold_th
 *   5. Keep only periods >= 3 s
 *
 * @param {Array<{t: number, raw: number}>} samples
 * @param {number} maxAmp - pre-estimated amplitude (p95 - p10 of raw)
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {{ holds: Array<{hold_start_t, hold_end_t, hold_duration, valid}>, chartData, baseline, holdTh, releaseTh }}
 */
export async function detectDibhHolds(samples, maxAmp, { signal } = {}) {
  const MIN_HOLD_SEC = 3.0;

  const sorted = [...samples.map((s) => s.raw)].sort((a, b) => a - b);
  const n = sorted.length;
  const baseline = n >= 10 ? sorted[Math.floor(n * 0.10)] : (sorted[0] ?? 0);

  const holdTh = baseline + 0.80 * maxAmp;
  const releaseTh = baseline + 0.50 * maxAmp;

  const lpf = new OnePoleLPF(1.2);
  const chartData = [];
  const holds = [];
  let holdStart = null;

  for (let i = 0; i < samples.length; i++) {
    if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    const { t, raw } = samples[i];
    const y_f = lpf.update(t, raw);
    chartData.push({ time: t, value: y_f });

    if (holdStart === null) {
      if (y_f >= holdTh) holdStart = t;
    } else if (y_f < releaseTh) {
      const dur = t - holdStart;
      if (dur >= MIN_HOLD_SEC) {
        holds.push({ hold_start_t: holdStart, hold_end_t: t, hold_duration: dur, valid: true });
      }
      holdStart = null;
    }

    if (i % YIELD_EVERY === 0) await yieldToUI();
  }

  // Close any hold still active at end of file
  if (holdStart !== null) {
    const lastT = samples[samples.length - 1].t;
    const dur = lastT - holdStart;
    if (dur >= MIN_HOLD_SEC) {
      holds.push({ hold_start_t: holdStart, hold_end_t: lastT, hold_duration: dur, valid: true });
    }
  }

  return { holds, chartData, baseline, holdTh, releaseTh };
}

```

- [ ] **Step 3: Run the new test suite to confirm all `detectDibhHolds` tests pass**

```
npm test -- parseCsv.test
```

Expected: all tests in the file pass (the existing suites + the new 5 detectDibhHolds tests).

- [ ] **Step 4: Commit**

```
git add src/lib/calibration/analyzeFiles.js src/lib/calibration/parseCsv.test.js
git commit -m "feat: add scan-based detectDibhHolds for file-based DIBH analysis"
```

---

## Task 3: Replace Stage3Detector usage in `analyzeFiles()` with `detectDibhHolds`

**Files:**
- Modify: `src/lib/calibration/analyzeFiles.js`

- [ ] **Step 1: Remove the `pickStage3DisplayAttempt` helper — it is only used by Stage3 and is now dead code**

Find and delete the entire function:

```js
function pickStage3DisplayAttempt(attempts) {
  if (!attempts?.length) return null;
  const valid = attempts.filter((a) => a.valid);
  if (valid.length) return valid[valid.length - 1];
  return attempts[attempts.length - 1];
}
```

- [ ] **Step 2: Replace the Stage3 processing block inside `analyzeFiles()`**

Find this entire block (starts with the comment `// ── Stage 3`):

```js
  // ── Stage 3: DIBH hold detection using original Stage3Detector ──
  if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');

  // Use the same pre-filters as the real-time flow
  const lpf = new OnePoleLPF(1.2);
  const deriv = new DerivativeEstimator(1.8);

  const s3 = new Stage3Detector(maxAmp);
  s3.start(dibhSamples[0].t);

  const dibhChartDataFull = [];

  for (let i = 0; i < dibhSamples.length; i++) {
    if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    if (s3.is_done()) break;

    const { t, raw } = dibhSamples[i];
    const y_f = lpf.update(t, raw);
    const [, dy_s] = deriv.update(t, y_f);
    dibhChartDataFull.push({ time: t, value: y_f });
    s3.update(t, y_f, dy_s);

    if (i % YIELD_EVERY === 0) await yieldToUI();
  }
  s3.stop();

  const avgDibh = s3.get_avg_dibh();
  const validAttempts = s3.attempts.filter((a) => a.valid);

  console.log(
    `[analyzeFiles] Stage 3: ${s3.attempts.length} attempts, ${validAttempts.length} valid, avgDibh=${avgDibh}`
  );
  s3.attempts.forEach((a, i) => {
    console.log(
      `[analyzeFiles]   attempt[${i}]: valid=${a.valid}, duration=${a.hold_duration?.toFixed(1)}s, reason=${a.reason}, baseline=${a.baseline?.toFixed(2)}, hold_th=${a.hold_th?.toFixed(2)}`
    );
  });
```

Replace with:

```js
  // ── Stage 3: scan-based DIBH hold detection ──────────────────────
  const {
    holds,
    chartData: dibhChartDataFull,
    baseline: dibhBaseline,
    holdTh,
    releaseTh,
  } = await detectDibhHolds(dibhSamples, maxAmp, { signal });

  const avgDibh =
    holds.length > 0
      ? holds.reduce((acc, h) => acc + h.hold_duration, 0) / holds.length
      : null;

  console.log(
    `[analyzeFiles] DIBH holds detected: ${holds.length}, avgDibh=${avgDibh}`
  );
  holds.forEach((h, i) => {
    console.log(
      `[analyzeFiles]   hold[${i}]: duration=${h.hold_duration.toFixed(1)}s, start=${h.hold_start_t.toFixed(1)}s, end=${h.hold_end_t.toFixed(1)}s`
    );
  });
```

- [ ] **Step 3: Update the results and playback sections**

Find:

```js
  const attemptPick = pickStage3DisplayAttempt(s3.attempts);
  const durationGeneral =
    generalChartDataFull.length > 0
      ? generalChartDataFull[generalChartDataFull.length - 1].time
      : 0;
  const durationDibh =
    dibhChartDataFull.length > 0 ? dibhChartDataFull[dibhChartDataFull.length - 1].time : 0;

  const playback = {
    source: 'file_analysis',
    durationGeneral,
    durationDibh,
    general: {
      stage: 1,
      chartData: downsamplePlaybackPoints(generalChartDataFull),
      cycles: serializeCyclesForStorage(s1.cycles),
      rise_starts: [...s1.rise_starts],
      fall_starts: [...s1.fall_starts],
      hi: s1.hi,
      lo: s1.lo,
    },
    dibh: {
      stage: 3,
      chartData: downsamplePlaybackPoints(dibhChartDataFull),
      hold_th: attemptPick?.hold_th ?? s3.hold_th,
      release_th: attemptPick?.release_th ?? s3.release_th,
      target_th: attemptPick?.target_th ?? s3.target_th,
      hold_start_t: attemptPick?.hold_start_t ?? null,
      hold_end_t: attemptPick?.hold_end_t ?? null,
    },
  };

  return {
    cv: cv != null ? Math.round(cv * 10) / 10 : null,
    avgDibh: avgDibh != null ? Math.round(avgDibh * 10) / 10 : null,
    trainingType,
    algorithmResults: {
      stage1: { cv, cv_period: cvPeriod, ok_cycles_count: okCycles },
      stage2: null, // skipped — max_amp estimated from signal
      stage3: {
        avg_dibh: avgDibh,
        max_amp_estimated: maxAmp,
        attempts: s3.attempts,
        avg_hold_quality_pct: s3.get_avg_hold_quality_pct(),
      },
    },
    source: 'file_analysis',
    playback,
  };
```

Replace with:

```js
  const displayHold = holds[0] ?? null;
  const durationGeneral =
    generalChartDataFull.length > 0
      ? generalChartDataFull[generalChartDataFull.length - 1].time
      : 0;
  const durationDibh =
    dibhChartDataFull.length > 0 ? dibhChartDataFull[dibhChartDataFull.length - 1].time : 0;

  const playback = {
    source: 'file_analysis',
    durationGeneral,
    durationDibh,
    general: {
      stage: 1,
      chartData: downsamplePlaybackPoints(generalChartDataFull),
      cycles: serializeCyclesForStorage(s1.cycles),
      rise_starts: [...s1.rise_starts],
      fall_starts: [...s1.fall_starts],
      hi: s1.hi,
      lo: s1.lo,
    },
    dibh: {
      stage: 3,
      chartData: downsamplePlaybackPoints(dibhChartDataFull),
      hold_th: holdTh,
      release_th: releaseTh,
      target_th: dibhBaseline + 0.85 * maxAmp,
      hold_start_t: displayHold?.hold_start_t ?? null,
      hold_end_t: displayHold?.hold_end_t ?? null,
    },
  };

  return {
    cv: cv != null ? Math.round(cv * 10) / 10 : null,
    avgDibh: avgDibh != null ? Math.round(avgDibh * 10) / 10 : null,
    trainingType,
    algorithmResults: {
      stage1: { cv, cv_period: cvPeriod, ok_cycles_count: okCycles },
      stage2: null,
      stage3: {
        avg_dibh: avgDibh,
        max_amp_estimated: maxAmp,
        holds,
        baseline: dibhBaseline,
        hold_th: holdTh,
        release_th: releaseTh,
      },
    },
    source: 'file_analysis',
    playback,
  };
```

- [ ] **Step 4: Run the full test suite — all tests must pass**

```
npm test
```

Expected output (all green):
```
Test Files  3 passed (3)
Tests       18 passed (18)
```

(13 existing + 5 new detectDibhHolds tests)

- [ ] **Step 5: Commit**

```
git add src/lib/calibration/analyzeFiles.js
git commit -m "feat: replace Stage3Detector with scan-based detectDibhHolds in analyzeFiles"
```

---

## Self-Review

**Spec coverage:**
- Scan-based hold detection (no PREP/REST required) → `detectDibhHolds` ✓
- Baseline from signal (p10) → inside `detectDibhHolds` ✓
- hold_th = baseline + 80% maxAmp, release_th = 50% (hysteresis) → ✓
- Min 3s hold duration filter → `MIN_HOLD_SEC = 3.0` ✓
- avgDibh = mean of detected holds → ✓
- Chart data still populated → `chartData` returned and used ✓
- Playback structure backward-compatible (hold_th, release_th, hold_start_t, hold_end_t) → ✓
- Stage 1 (CV) unchanged → ✓
- `OnePoleLPF` import kept, `Stage3Detector`/`DerivativeEstimator` dropped → ✓

**Placeholder scan:** No TBDs. All code complete. ✓

**Type consistency:**
- `detectDibhHolds` returns `{ holds, chartData, baseline, holdTh, releaseTh }` — same names used in Task 2 and Task 3 ✓
- `holds[i]` has `{ hold_start_t, hold_end_t, hold_duration, valid }` — same names in tests and in results ✓
- `displayHold` uses `hold_start_t`/`hold_end_t` — match the shape ✓
