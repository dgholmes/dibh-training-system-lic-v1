// MFDS Cybersecurity Audit — Security Debug Logger
//
// Set SECURITY_DEBUG = true ONLY during the KTC audit session.
// Must remain false in all production / submission builds.
//
// Usage: import { secDbg } from '@/lib/securityDebug'
//        secDbg('DC-01', 'AES-256-GCM Encrypt', { iv_hex: '...', ... })
//
// Output appears in the browser DevTools console grouped by requirement code.

export const SECURITY_DEBUG = true; // KTC AUDIT DEMO — set back to false before production build

const PREFIX = '[SECURITY-AUDIT]';

/**
 * Emit a labelled console group for the audit session.
 * @param {string} code   MFDS requirement code, e.g. 'DC-01'
 * @param {string} label  Human-readable operation label
 * @param {object} data   Key-value pairs to display (no secrets)
 */
export function secDbg(code, label, data = {}) {
  if (!SECURITY_DEBUG) return;
  console.groupCollapsed(`${PREFIX} ${code} — ${label}`);
  for (const [k, v] of Object.entries(data)) {
    console.log(`  ${k}:`, v);
  }
  console.groupEnd();
}
