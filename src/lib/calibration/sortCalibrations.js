/**
 * Ordering helpers for Calibration records.
 *
 * `calibration_date` is stored as a date-only string (YYYY-MM-DD, see
 * CalibrationSession.complete() in localStore.js), so multiple calibrations
 * done on the same day compare equal on that field alone. `created_at` is a
 * full ISO timestamp and always breaks same-day ties correctly.
 */

/**
 * Descending comparator: most recent calibration first.
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
export function compareCalibrationsDesc(a, b) {
  return (
    new Date(b.calibration_date || b.created_at || 0) - new Date(a.calibration_date || a.created_at || 0) ||
    new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
}

/**
 * @param {object[]} calibrations
 * @returns {object[]} new array, most recent first
 */
export function sortCalibrationsDesc(calibrations) {
  return [...(calibrations || [])].sort(compareCalibrationsDesc);
}

/**
 * @param {object[]} calibrations
 * @returns {object|null} the most recent calibration, or null if empty
 */
export function getLatestCalibration(calibrations) {
  if (!calibrations || !calibrations.length) return null;
  return sortCalibrationsDesc(calibrations)[0];
}
