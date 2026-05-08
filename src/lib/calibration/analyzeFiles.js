/**
 * Offline file-based DIBH analysis.
 * Runs Stage 1 (CV from general breathing) and Stage 3 (DIBH hold detection)
 * on pre-recorded CSV files, skipping the real-time Bluetooth Stage 2.
 *
 * CSV format (from Python calibration system):
 *   t,raw,filtered,dy   (4 columns, header row skipped automatically)
 *
 * The original Stage1EnsembleRTAnalyzer and Stage3Detector algorithms are used
 * exactly as designed — we simply feed them data from the file instead of from
 * the Bluetooth sensor.
 */

import { getBreathingFileContent } from '@/api/breathingFileRepository';
import { isVxpBreathingFileName } from '@/lib/breathingFileFormat';
import { Stage1EnsembleRTAnalyzer } from './stage1Analyzer.js';
import { Stage3Detector, OnePoleLPF, DerivativeEstimator } from './stage3Detector.js';
import { determineDibhType } from './determineDibhType.js';

const YIELD_EVERY = 2000; // yield to UI every N samples
const MAX_PLAYBACK_POINTS = 500;

function downsamplePlaybackPoints(points) {
  if (!points?.length || points.length <= MAX_PLAYBACK_POINTS) return points;
  const step = points.length / MAX_PLAYBACK_POINTS;
  const out = [];
  for (let i = 0; i < MAX_PLAYBACK_POINTS; i++) {
    const idx = Math.min(Math.floor(i * step), points.length - 1);
    out.push(points[idx]);
  }
  return out;
}

function serializeCyclesForStorage(cycles) {
  return cycles.map((c) => ({
    t0: c.t0,
    tp: c.tp,
    t1: c.t1,
    trough0_val: c.trough0_val,
    peak_val: c.peak_val,
    trough1_val: c.trough1_val,
    ok: c.ok,
    matched_rise: c.matched_rise ?? null,
    matched_fall: c.matched_fall ?? null,
  }));
}

function pickStage3DisplayAttempt(attempts) {
  if (!attempts?.length) return null;
  const valid = attempts.filter((a) => a.valid);
  if (valid.length) return valid[valid.length - 1];
  return attempts[attempts.length - 1];
}

/**
 * Parse a calibration CSV. Returns an array of objects with t, raw,
 * and optionally filtered / dy if the columns exist.
 */
export function parseCsv(arrayBuffer) {
  const text = new TextDecoder().decode(arrayBuffer);
  const lines = text.split(/\r?\n/);
  const samples = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = trimmed.split(',');
    if (cols.length < 2) continue;
    const t = parseFloat(cols[0]);
    const raw = parseFloat(cols[1]);
    if (!Number.isFinite(t) || !Number.isFinite(raw)) continue;

    const entry = { t, raw };
    if (cols.length >= 3) {
      const f = parseFloat(cols[2]);
      if (Number.isFinite(f)) entry.filtered = f;
    }
    if (cols.length >= 4) {
      const d = parseFloat(cols[3]);
      if (Number.isFinite(d)) entry.dy = d;
    }
    samples.push(entry);
  }
  return samples;
}

/**
 * Parse a Varian VXP file. Returns the same shape as parseCsv: [{ t, raw }].
 * Timestamp column is in milliseconds — divided by 1000 to produce seconds.
 * All columns except amplitude and timestamp are ignored.
 */
export function parseVxp(arrayBuffer) {
  const text = new TextDecoder().decode(arrayBuffer);
  const lines = text.split(/\r?\n/);

  let ampIdx = 0;
  let tsIdx = 2;
  let inData = false;
  const samples = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === '[Data]') {
      inData = true;
      continue;
    }
    if (trimmed === '[Header]') continue;

    if (!inData) {
      if (trimmed.startsWith('Data_layout=')) {
        const cols = trimmed.slice('Data_layout='.length).split(',').map((c) => c.trim().toLowerCase());
        const ai = cols.indexOf('amplitude');
        const ti = cols.indexOf('timestamp');
        if (ai >= 0) ampIdx = ai;
        if (ti >= 0) tsIdx = ti;
      }
      continue;
    }

    const cols = trimmed.split(',');
    if (cols.length <= Math.max(ampIdx, tsIdx)) continue;
    const raw = parseFloat(cols[ampIdx]);
    const t = parseFloat(cols[tsIdx]) / 1000.0;
    if (!Number.isFinite(raw) || !Number.isFinite(t)) continue;
    samples.push({ t, raw });
  }

  if (!inData) {
    throw new Error('VXP 파일에서 [Data] 섹션을 찾을 수 없습니다.');
  }

  return samples;
}

/** Dispatch to the correct parser based on file extension. */
export function parseBreathingFile(arrayBuffer, filename) {
  if (isVxpBreathingFileName(filename)) return parseVxp(arrayBuffer);
  return parseCsv(arrayBuffer);
}

/**
 * Estimate max_amp (maximum inspiration amplitude) from the DIBH signal.
 * Without Stage 2, we derive it from the signal range in the DIBH file itself.
 *
 * Uses a percentile-based approach:
 *   - baseline ≈ 10th percentile (resting/exhale level)
 *   - peak ≈ 95th percentile (deep inhale level, avoids outlier spikes)
 *   - max_amp = peak - baseline
 */
function estimateMaxAmpFromSignal(samples) {
  const vals = samples.map((s) => s.raw);
  const sorted = [...vals].sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 10) return 1.0; // fallback

  const p10 = sorted[Math.floor(n * 0.10)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const amp = p95 - p10;

  // Ensure a reasonable minimum so thresholds are meaningful
  return Math.max(amp, 0.1);
}

/** Yield to the event loop so the UI stays responsive. */
function yieldToUI() {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * Run Stage 1 + Stage 3 analysis on uploaded CSV files.
 *
 * @param {string} generalFileId - breathing_files row id for general breathing CSV
 * @param {string} dibhFileId - breathing_files row id for DIBH CSV
 * @param {{ signal?: AbortSignal }} options
 */
export async function analyzeFiles(generalFileId, dibhFileId, { signal } = {}) {
  // ── Load files from SQLite ───────────────────────────────────────
  const [generalFile, dibhFile] = await Promise.all([
    getBreathingFileContent(generalFileId),
    getBreathingFileContent(dibhFileId),
  ]);
  if (!generalFile) throw new Error('일반호흡 파일을 찾을 수 없습니다.');
  if (!dibhFile) throw new Error('DIBH 파일을 찾을 수 없습니다.');

  // ── Parse files (CSV or VXP) ─────────────────────────────────────
  const generalSamples = parseBreathingFile(generalFile.arrayBuffer, generalFile.original_name);
  const dibhSamples = parseBreathingFile(dibhFile.arrayBuffer, dibhFile.original_name);

  if (generalSamples.length === 0) {
    throw new Error('일반호흡 파일에 유효한 데이터가 없습니다.');
  }
  if (dibhSamples.length === 0) {
    throw new Error('DIBH 파일에 유효한 데이터가 없습니다.');
  }

  console.log(
    `[analyzeFiles] general: ${generalSamples.length} samples, dibh: ${dibhSamples.length} samples`
  );

  // ── Stage 1: CV from general breathing ───────────────────────────
  const s1 = new Stage1EnsembleRTAnalyzer();
  s1.start(generalSamples[0].t);

  for (let i = 0; i < generalSamples.length; i++) {
    if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    s1.update(generalSamples[i].t, generalSamples[i].raw);
    if (i % YIELD_EVERY === 0) await yieldToUI();
  }
  s1.stop();

  const generalChartDataFull = generalSamples.map((row, i) => ({
    time: row.t,
    value: row.raw,
    ...(s1.y_buf[i] != null ? { filtered: s1.y_buf[i] } : {}),
  }));

  const cv = s1.get_cv();
  const cvPeriod = s1.get_cv_period();
  const okCycles = s1.cycles.filter((c) => c.ok).length;

  console.log(
    `[analyzeFiles] Stage 1: ${okCycles} OK cycles (total: ${s1.cycles.length}), CV=${cv}, CV_period=${cvPeriod}`
  );

  // ── Estimate max_amp from DIBH signal (replaces Stage 2) ────────
  const maxAmp = estimateMaxAmpFromSignal(dibhSamples);
  console.log(`[analyzeFiles] Estimated max_amp from DIBH signal: ${maxAmp.toFixed(3)}`);

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

  // ── Determine type ──────────────────────────────────────────────
  const trainingType = determineDibhType(avgDibh ?? 0, cv ?? 0) ?? 'B';

  console.log(`[analyzeFiles] Result: type=${trainingType}, avgDibh=${avgDibh}, cv=${cv}`);

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
}
