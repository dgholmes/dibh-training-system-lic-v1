// Audit log — MFDS UC-04 (logging), UC-05 (failure handling), UC-06 (timestamps), UC-07 (non-repudiation)
import { secDbg, SECURITY_DEBUG } from '@/lib/securityDebug';
// Entries are append-only; never modified or deleted via the UI.

import { getSession } from './authStore';

const AUDIT_KEY = 'dibh_audit_log';
const MAX_ENTRIES = 10_000;
const LS_WARN_BYTES = 4 * 1024 * 1024; // 4 MB — warn before typical WebView 5 MB quota

function estimateAuditLogBytes() {
  const raw = localStorage.getItem(AUDIT_KEY);
  return raw ? raw.length * 2 : 0; // UTF-16: ~2 bytes per char
}

function estimateTotalLocalStorageBytes() {
  let total = 0;
  try {
    for (const key of Object.keys(localStorage)) {
      total += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
    }
  } catch { /* quota already exceeded — estimation incomplete */ }
  return total;
}

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

  secDbg('UC-04/UC-06/UC-07', '감사 로그 항목 기록 — Audit Log Entry Written', {
    설명: '보안 이벤트를 감사 로그에 기록합니다. 사용자 ID·타임스탬프·액션 코드를 포함하여 부인 방지(UC-07) 및 추적성(UC-04)을 보장합니다.',
    description: 'Records a security event to the audit log. Includes userId, timestamp, and action code for non-repudiation (UC-07) and traceability (UC-04).',
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
  // UC-05 — attempt write; on QuotaExceededError, emergency-trim oldest 20% and retry once
  const serialized = JSON.stringify(log);
  try {
    localStorage.setItem(AUDIT_KEY, serialized);
  } catch (e) {
    const isQuota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    if (isQuota) {
      secDbg('UC-05', '저장소 용량 초과 긴급 조치 — QuotaExceededError Emergency Trim', {
        설명: 'localStorage 용량 초과 시 오래된 감사 로그 20%를 삭제하고 쓰기를 재시도합니다. 최신 기록을 보존하기 위한 긴급 조치입니다.',
        description: 'On localStorage QuotaExceededError, drops the oldest 20% of audit entries and retries the write to preserve the most recent records.',
        entries_before: log.length,
      });
      const trimmed = log.slice(Math.floor(log.length * 0.2));
      try {
        localStorage.setItem(AUDIT_KEY, JSON.stringify(trimmed));
      } catch {
        throw e; // still full — propagate; tryWriteAuditLog will surface to console
      }
    } else {
      throw e;
    }
  }
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
 * Debug-only: append `count` synthetic entries in one bulk write, respecting the
 * existing MAX_ENTRIES FIFO trim. Bypasses per-entry writeAuditLog() to avoid
 * O(n^2) re-serialization of the growing array on every single call.
 * Throws unless SECURITY_DEBUG is true — structurally cannot run in a production build.
 */
export function seedDebugAuditEntries(count = 10_000) {
  if (!SECURITY_DEBUG) throw new Error('seedDebugAuditEntries is only available in debug builds');
  const log = loadLog();
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    log.push({
      id: `debug-${now}-${i}`,
      userId: 'system',
      username: 'system',
      action: 'DEBUG_SEED_ENTRY',
      targetType: 'debug',
      targetId: null,
      detail: 'QA 테스트용 자동 생성 항목 (디버그 빌드 전용)',
      timestamp: new Date(now + i).toISOString(),
    });
  }
  const trimmed = log.length > MAX_ENTRIES ? log.slice(log.length - MAX_ENTRIES) : log;
  localStorage.setItem(AUDIT_KEY, JSON.stringify(trimmed));
  return { generated: count, totalAfterTrim: trimmed.length };
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
  const auditBytes = estimateAuditLogBytes();
  const totalBytes = estimateTotalLocalStorageBytes();
  const storagePct = Math.min(100, Math.round((totalBytes / LS_WARN_BYTES) * 100));
  return { count, max: MAX_ENTRIES, pct, auditBytes, totalBytes, storagePct };
}

// ── Action constants (keep consistent across the app) ────────────────────────
export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  SESSION_TIMEOUT: 'SESSION_TIMEOUT',      // UC-04: auto-logout distinguished from manual
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
  DEIDENTIFIED_EXPORT: 'DEIDENTIFIED_EXPORT', // UC-04: de-identified CSV export
  DEBUG_SEED_ENTRY: 'DEBUG_SEED_ENTRY', // debug-build only — never appears in a production audit log
  USAGE_NOTICE_UPDATED: 'USAGE_NOTICE_UPDATED',
};
