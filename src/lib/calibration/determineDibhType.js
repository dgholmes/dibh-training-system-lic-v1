/**
 * DIBH Type determination (ported from dibh_calibration.py).
 * TYPE A: avgDIBH >= 15s AND CV < 15%
 * TYPE C: avgDIBH < 10s OR CV >= 30% (and not TYPE A)
 * TYPE B: everything else
 */

/**
 * @param {number|null|undefined} avgDibh - average DIBH hold duration in seconds
 * @param {number|null|undefined} cv - coefficient of variation (amplitude) in percent
 * @returns {string|null} "A" | "B" | "C" or null if missing data
 */
export function determineDibhType(avgDibh, cv) {
  if (avgDibh == null || cv == null || !Number.isFinite(avgDibh) || !Number.isFinite(cv)) {
    return null;
  }

  if (avgDibh >= 15.0 && cv < 15.0) {
    return 'A';
  }
  if (avgDibh < 10.0 || cv >= 30.0) {
    return 'C';
  }
  return 'B';
}
