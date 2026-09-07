/**
 * Credential change cycle — MFDS IA-04 (인증정보 변경주기).
 *
 * The operator must change their password on a fixed cycle, and must be told before the
 * deadline rather than being surprised by it. Both thresholds live here so the certification
 * document and the running code quote the same numbers.
 *
 * Behaviour driven by these values:
 *   - within the warning window → the login flow shows a notice with the days remaining
 *   - past the maximum age      → the password change screen is forced, exactly as it is for
 *                                 an initial (admin-issued) password
 *
 * Note this is an age limit, not an inactivity timeout — session inactivity is a separate
 * control (UC-04, 30 minutes, in AuthContext).
 */

/** Maximum password age. Past this, the operator must change it before continuing. */
export const PASSWORD_MAX_AGE_DAYS = 90;

/** How many days before expiry the operator starts being warned at login. */
export const PASSWORD_WARN_BEFORE_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Age of a password in whole days.
 *
 * `changedAt` is the record's `passwordChangedAt`. Records written before this feature
 * existed have none, so the caller falls back to `createdAt` — an account whose password has
 * never been changed is exactly as old as the account.
 *
 * @returns {number|null} whole days, or null when no usable timestamp exists.
 */
export function passwordAgeDays(changedAt, now = Date.now()) {
  if (!changedAt) return null;
  const then = new Date(changedAt).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now - then) / MS_PER_DAY);
}

/**
 * Classify a password's age against the policy.
 *
 * @returns {{ ageDays: number|null, expired: boolean, expiresInDays: number|null, warn: boolean }}
 *   `expired` forces a change; `warn` only asks for one. An unusable timestamp yields neither,
 *   so a malformed record can never lock an operator out of the system.
 */
export function passwordAgeStatus(changedAt, now = Date.now()) {
  const ageDays = passwordAgeDays(changedAt, now);
  if (ageDays === null) {
    return { ageDays: null, expired: false, expiresInDays: null, warn: false };
  }
  const expiresInDays = PASSWORD_MAX_AGE_DAYS - ageDays;
  return {
    ageDays,
    expired: expiresInDays <= 0,
    expiresInDays,
    warn: expiresInDays > 0 && expiresInDays <= PASSWORD_WARN_BEFORE_DAYS,
  };
}
