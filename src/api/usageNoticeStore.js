// Admin-configurable login-screen usage notice — MFDS IA-08.
// Falls back to the default hardcoded banner (rendered in Login.jsx) when unset.

const USAGE_NOTICE_KEY = 'dibh_usage_notice';
const MAX_LENGTH = 1000;

/** Returns the admin's custom notice text, or null if none has been set (use default). */
export function getCustomUsageNotice() {
  const stored = localStorage.getItem(USAGE_NOTICE_KEY);
  return stored && stored.trim() ? stored.trim() : null;
}

/** Sets the custom notice text. Empty/whitespace-only input clears it (reverts to default). */
export function setUsageNotice(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    localStorage.removeItem(USAGE_NOTICE_KEY);
  } else {
    localStorage.setItem(USAGE_NOTICE_KEY, trimmed);
  }
}

/** Clears any custom notice text, reverting to the default banner. */
export function resetUsageNotice() {
  localStorage.removeItem(USAGE_NOTICE_KEY);
}

/** Validates candidate notice text before saving. Returns an array of error messages (empty = valid). */
export function validateUsageNotice(text) {
  const errors = [];
  if ((text ?? '').length > MAX_LENGTH) {
    errors.push(`공지 문구는 최대 ${MAX_LENGTH}자까지 입력할 수 있습니다.`);
  }
  return errors;
}
