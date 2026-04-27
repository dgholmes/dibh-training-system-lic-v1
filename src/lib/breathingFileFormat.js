/**
 * Uploads: hospital may provide CSV and/or VXP exports.
 * Analysis pipeline (`analyzeFiles`) currently parses CSV only; VXP decode is not implemented yet.
 * Stored names may be normalized (e.g. CODE_GEN_20260101.csv) — rely on extension only.
 */

/** @param {string} [name] */
export function isCsvBreathingFileName(name) {
  if (!name || typeof name !== 'string') return false;
  return /\.csv$/i.test(name.trim());
}

/** @param {string} [name] */
export function isVxpBreathingFileName(name) {
  if (!name || typeof name !== 'string') return false;
  return /\.vxp$/i.test(name.trim());
}

/** CSV or VXP — allowed for upload / storage */
export function isAllowedBreathingUploadFileName(name) {
  return isCsvBreathingFileName(name) || isVxpBreathingFileName(name);
}

/** @param {File} file */
export function isCsvBreathingFile(file) {
  return file instanceof File && isCsvBreathingFileName(file.name);
}

/** @param {File} file */
export function isVxpBreathingFile(file) {
  return file instanceof File && isVxpBreathingFileName(file.name);
}

/** @param {File} file */
export function isAllowedBreathingUploadFile(file) {
  return file instanceof File && isAllowedBreathingUploadFileName(file.name);
}
