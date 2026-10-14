/**
 * Birth-date entry. All five formative-evaluation testers found the
 * calendar-only picker inconvenient (lowest-scoring task), so the field now
 * accepts typing. The primary form is 8 digits — 19900512 — with separators
 * tolerated.
 *
 * Storage format is unchanged: yyyy-MM-dd.
 */

export const MIN_BIRTH_YEAR = 1900;

/**
 * @param {string} input what the operator typed
 * @param {Date} [today] injectable for tests
 * @returns {string|null} yyyy-MM-dd, or null if not a usable date
 */
export function normalizeBirthDateInput(input, today = new Date()) {
  if (typeof input !== 'string') return null;
  const digits = input.trim().replace(/[.\-/\s]/g, '');
  if (!/^\d{8}$/.test(digits)) return null;

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));

  if (year < MIN_BIRTH_YEAR) return null;

  // Round-trip through Date to reject dates that do not exist (Feb 31 etc.).
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }

  // Compare at local midnight so "today" is accepted but tomorrow is not.
  const midnightToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (dt.getTime() > midnightToday.getTime()) return null;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** @param {string} iso stored yyyy-MM-dd @returns {string} */
export function formatBirthDateForDisplay(iso) {
  if (typeof iso !== 'string') return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
}
