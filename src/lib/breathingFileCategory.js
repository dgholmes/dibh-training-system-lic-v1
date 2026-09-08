/**
 * Reads the breathing-data category out of an incoming filename.
 *
 * Hospital exports carry a category token (TYPE_A_GEN_20260508.csv,
 * synth_patient_1_dibh.vxp), and uploading a file into the wrong category
 * changes the resulting DIBH type — see RM-DBF-010. This detector feeds the
 * mismatch warning on the upload screen.
 *
 * It never guesses: an ambiguous or token-free name returns null, and the
 * caller stays silent rather than warning on a coin flip.
 */

const GENERAL_TOKENS = ['GEN', 'GENERAL', 'NORMAL', 'FREE'];
const DIBH_TOKENS = ['DIBH'];

/** Token must stand alone — bounded by a non-alphanumeric or a string edge. */
function hasToken(name, token) {
  return new RegExp(`(^|[^A-Za-z0-9])${token}([^A-Za-z0-9]|$)`, 'i').test(name);
}

/**
 * @param {string} name incoming filename (not the stored name)
 * @returns {'general'|'dibh'|null}
 */
export function detectCategoryFromFileName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  const isGeneral = GENERAL_TOKENS.some((t) => hasToken(trimmed, t));
  const isDibh = DIBH_TOKENS.some((t) => hasToken(trimmed, t));

  // Both or neither — no confident reading.
  if (isGeneral === isDibh) return null;
  return isDibh ? 'dibh' : 'general';
}

/**
 * Pairs each picked file with the category it is headed for and the category
 * its filename suggests. Kept pure so the confirmation gate's decision is
 * unit-testable — it guards a safety control (RM-DBF-010), not just a prompt.
 *
 * @param {Array<{name: string}>} files
 * @param {'general'|'dibh'} category destination the operator dropped them on
 * @returns {Array<{name: string, category: 'general'|'dibh', detected: 'general'|'dibh'|null}>}
 */
export function buildUploadConfirmItems(files, category) {
  return Array.from(files ?? []).map((f) => ({
    name: f.name,
    category,
    detected: detectCategoryFromFileName(f.name),
  }));
}

/**
 * How many staged files have a filename that contradicts their destination.
 * An unreadable filename (`detected === null`) is never a mismatch, so the
 * warning stays meaningful.
 *
 * @param {Array<{category: string, detected: string|null}>} items
 * @returns {number}
 */
export function countCategoryMismatches(items) {
  return (items ?? []).filter((i) => i.detected && i.detected !== i.category).length;
}
