/**
 * Calibration algorithm utilities (ported from dibh_calibration.py).
 * No numpy/scipy - pure JS.
 */

/**
 * Quantile of array (sort-based). Returns null if too few finite values.
 * @param {number[]} x
 * @param {number} q - quantile in [0, 1]
 * @returns {number|null}
 */
export function quantileSafe(x, q) {
  const arr = Array.isArray(x) ? x : [...x];
  const finite = arr.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (finite.length < 10) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (i - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * Simple 1st-order IIR low-pass (same as Python _iir_lowpass).
 * @param {number|null} prevY
 * @param {number} x
 * @param {number} dt
 * @param {number} fcHz
 * @returns {number}
 */
export function iirLowpass(prevY, x, dt, fcHz) {
  if (prevY == null) return x;
  if (dt <= 0) return prevY;
  const alpha = Math.exp(-2.0 * Math.PI * fcHz * dt);
  return alpha * prevY + (1.0 - alpha) * x;
}

/**
 * One-pole low-pass (same as Python one_pole_lowpass).
 * @param {number|null} prev
 * @param {number} x
 * @param {number} dt
 * @param {number} fcHz
 * @returns {number}
 */
export function onePoleLowpass(prev, x, dt, fcHz) {
  if (prev == null) return x;
  if (dt <= 0) return prev;
  if (fcHz <= 0) return x;
  const alpha = 1.0 - Math.exp(-2.0 * Math.PI * fcHz * dt);
  return prev + alpha * (x - prev);
}

/**
 * Fallback peak detection without SciPy (Python _simple_peaks).
 * Returns indices where y[i-1] < y[i] > y[i+1], with minimum distance between peaks.
 * @param {number[]} y
 * @param {number} distance - min samples between peaks
 * @returns {number[]}
 */
export function simplePeaks(y, distance = 1) {
  if (!y || y.length < 3) return [];
  const idx = [];
  for (let i = 1; i < y.length - 1; i++) {
    const dy1 = y[i] - y[i - 1];
    const dy2 = y[i] - y[i + 1];
    if (dy1 > 0 && dy2 > 0) idx.push(i);
  }
  if (distance <= 1 || idx.length === 0) return idx;
  const kept = [idx[0]];
  for (let k = 1; k < idx.length; k++) {
    if (idx[k] - kept[kept.length - 1] >= distance) kept.push(idx[k]);
  }
  return kept;
}

/**
 * Robust mean = median of array (Python robust_mean).
 * @param {number[]} xs
 * @returns {number}
 */
export function robustMean(xs) {
  if (!xs || xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[m];
  return (sorted[m - 1] + sorted[m]) / 2;
}

/**
 * Median of array.
 * @param {number[]} arr
 * @returns {number}
 */
export function median(arr) {
  if (!arr || arr.length === 0) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[m];
  return (sorted[m - 1] + sorted[m]) / 2;
}

/**
 * Median absolute deviation (Python mad).
 * @param {number[]} arr
 * @returns {number}
 */
export function mad(arr) {
  if (!arr || arr.length === 0) return NaN;
  const m = median(arr);
  const abs = arr.map((v) => Math.abs(v - m));
  return median(abs);
}

/**
 * Linear interpolation: y value at tQuery given (t[], y[]).
 * @param {number} tQuery
 * @param {number[]} t
 * @param {number[]} y
 * @returns {number}
 */
export function interpAt(tQuery, t, y) {
  if (!t?.length || !y?.length) return NaN;
  if (tQuery <= t[0]) return y[0];
  if (tQuery >= t[t.length - 1]) return y[y.length - 1];
  let i = 0;
  while (i < t.length - 1 && t[i + 1] < tQuery) i++;
  if (i >= t.length - 1) return y[y.length - 1];
  const w = (tQuery - t[i]) / (t[i + 1] - t[i]);
  return y[i] + w * (y[i + 1] - y[i]);
}
