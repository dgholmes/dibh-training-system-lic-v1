// Audit log — MFDS UC-04 (logging), UC-05 (failure handling), UC-06 (timestamps), UC-07 (non-repudiation)
import { secDbg } from '@/lib/securityDebug';
// Entries are append-only; never modified or deleted via the UI.

import { getSession } from './authStore';

const AUDIT_KEY = 'dibh_audit_log';
const MAX_ENTRIES = 10_000;

function loadLog() {
  try {
    return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Write an audit entry. Throws if localStorage is unavailable (UC-05 — caller must handle).
 *
 * @param {{ action: string, targetType?: string, targetId?: string, detail?: string }} params
 */
export function writeAuditLog({ action, targetType = null, targetId = null, detail = null }) {
  const session = getSession();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: session?.userId ?? 'system',
    username: session?.username ?? 'system',
    action,
    targetType,
    targetId: targetId ? String(targetId) : null,
    detail,
    timestamp: new Date().toISOString(), // UC-06 ISO 8601
  };

  const log = loadLog();
  log.push(entry);
  if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES);

  secDbg('UC-04/UC-06/UC-07', 'Audit Log Entry Written', {
    action: entry.action,
    userId: entry.userId,
    username: entry.username,
    targetType: entry.targetType,
    targetId: entry.targetId,
    detail: entry.detail,
    timestamp: entry.timestamp,
    total_entries: log.length,
    max_entries: MAX_ENTRIES,
  });
  // UC-05 — let the storage error propagate so the caller can alert the admin
  localStorage.setItem(AUDIT_KEY, JSON.stringify(log));
  return entry;
}

/** Safe wrapper — logs to console if write fails instead of crashing non-critical paths. */
export function tryWriteAuditLog(params) {
  try {
    writeAuditLog(params);
  } catch (err) {
    console.error('[AuditLog] Write failed:', err);
  }
}

/**
 * Read audit entries, newest first.
 * @returns {{ entries: object[], total: number }}
 */
export function getAuditLogEntries({ search = '', limit = 50, offset = 0 } = {}) {
  const log = [...loadLog()].reverse();
  const term = search.trim().toLowerCase();
  const filtered = term
    ? log.filter(
        (e) =>
          e.username?.toLowerCase().includes(term) ||
          e.action?.toLowerCase().includes(term) ||
          e.detail?.toLowerCase().includes(term) ||
          e.timestamp?.includes(term) ||
          e.targetType?.toLowerCase().includes(term)
      )
    : log;
  return { entries: filtered.slice(offset, offset + limit), total: filtered.length };
}

/**
 * UC-05 — Audit log capacity status.
 * Returns current count, max, and usage percentage so the admin UI
 * can warn when the log is nearing its limit.
 */
export function getAuditLogCapacity() {
  const log = loadLog();
  const count = log.length;
  const pct = Math.round((count / MAX_ENTRIES) * 100);
  return { count, max: MAX_ENTRIES, pct };
}

// ── Action constants (keep consistent across the app) ────────────────────────
export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  USER_CREATED: 'USER_CREATED',
  USER_DELETED: 'USER_DELETED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_UNLOCKED: 'USER_UNLOCKED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_BY_ADMIN: 'PASSWORD_RESET_BY_ADMIN',
  PATIENT_CREATED: 'PATIENT_CREATED',
  PATIENT_UPDATED: 'PATIENT_UPDATED',
  PATIENT_DELETED: 'PATIENT_DELETED',
  FILE_UPLOADED: 'FILE_UPLOADED',
  FILE_DELETED: 'FILE_DELETED',
  ANALYSIS_RUN: 'ANALYSIS_RUN',
  CALIBRATION_DELETED: 'CALIBRATION_DELETED',
  BACKUP_CREATED: 'BACKUP_CREATED',
  BACKUP_RESTORED: 'BACKUP_RESTORED',
};
