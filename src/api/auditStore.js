// Audit log — MFDS UC-04 (logging), UC-05 (failure handling), UC-06 (timestamps), UC-07 (non-repudiation)
import { secDbg, SECURITY_DEBUG } from '@/lib/securityDebug';
// Entries are append-only; never modified or deleted via the UI.

import { getSession } from './authStore';
import { sha256Hex, stableStringify } from '@/lib/crypto';

const AUDIT_KEY = 'dibh_audit_log';
const MAX_ENTRIES = 10_000;
const LS_WARN_BYTES = 4 * 1024 * 1024; // 4 MB — warn before typical WebView 5 MB quota
const GENESIS_HASH = '0'.repeat(64); // prevHash for the first hash-chained entry ever written

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

/** Hash-chain helper — computes an entry's `hash` from its content (including `prevHash`). */
async function computeEntryHash(entry, options) {
  return sha256Hex(new TextEncoder().encode(stableStringify(entry)).buffer, options);
}

// Serializes writeAuditLog calls so concurrent callers (e.g. Promise.all([...].map(verifyRecord)))
// can never interleave a loadLog()/setItem() read-modify-write pair — otherwise the second writer's
// setItem would silently overwrite the first writer's entry with no trace (UC-04/UC-07 violation).
let writeQueue = Promise.resolve();

/**
 * Write an audit entry. Throws if localStorage is unavailable (UC-05 — caller must handle).
 *
 * @param {{ action: string, targetType?: string, targetId?: string, detail?: string }} params
 */
export function writeAuditLog(params) {
  const task = writeQueue.then(() => doWriteAuditLog(params));
  writeQueue = task.then(() => {}, () => {}); // keep the queue alive even if this write rejects
  return task;
}

async function doWriteAuditLog({ action, targetType = null, targetId = null, detail = null }) {
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
  const previous = log[log.length - 1];
  entry.prevHash = previous?.hash || GENESIS_HASH;
  // Hash covers the entry's own content plus prevHash (already a field on entry at this point) —
  // any edit, deletion, or reordering of a prior entry changes every hash after it (UC-07).
  entry.hash = await computeEntryHash(entry);

  log.push(entry);
  if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES);

  secDbg('UC-04/UC-06/UC-07', '감사 로그 항목 기록 — Audit Log Entry Written', {
    설명: '보안 이벤트를 감사 로그에 기록합니다. 사용자 ID·타임스탬프·액션 코드와 해시체인(prevHash/hash)을 포함하여 부인 방지(UC-07) 및 추적성(UC-04)을 보장합니다.',
    description: 'Records a security event to the audit log. Includes userId, timestamp, action code, and a hash-chain link (prevHash/hash) for non-repudiation (UC-07) and traceability (UC-04).',
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
export async function tryWriteAuditLog(params) {
  try {
    await writeAuditLog(params);
  } catch (err) {
    console.error('[AuditLog] Write failed:', err);
  }
}

/**
 * Debug-only: append `count` synthetic entries in one bulk write, respecting the
 * existing MAX_ENTRIES FIFO trim. Bypasses per-entry writeAuditLog() to avoid
 * O(n^2) re-serialization of the growing array on every single call — but still
 * participates properly in the hash-chain (each entry's prevHash/hash carried
 * forward from the previous one, real or seeded) so verifyAuditChain() never
 * reports a false "tampered" just because debug seeding ran after real entries
 * already existed (SECURITY_DEBUG-only tooling, used during QA/audit sessions).
 * Throws unless SECURITY_DEBUG is true — structurally cannot run in a production build.
 */
export async function seedDebugAuditEntries(count = 10_000) {
  if (!SECURITY_DEBUG) throw new Error('seedDebugAuditEntries is only available in debug builds');
  const log = loadLog();
  const now = Date.now();
  let prevHash = log[log.length - 1]?.hash || GENESIS_HASH;
  for (let i = 0; i < count; i++) {
    const entry = {
      id: `debug-${now}-${i}`,
      userId: 'system',
      username: 'system',
      action: 'DEBUG_SEED_ENTRY',
      targetType: 'debug',
      targetId: null,
      detail: 'QA 테스트용 자동 생성 항목 (디버그 빌드 전용)',
      timestamp: new Date(now + i).toISOString(),
      prevHash,
    };
    entry.hash = await computeEntryHash(entry, { quiet: true });
    prevHash = entry.hash;
    log.push(entry);
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

/**
 * Walk the audit log in order and verify the hash-chain (UC-07). Entries written
 * before this feature shipped have no `hash` field — they're skipped as legacy/
 * unverified rather than counted as tampered. Verification starts from the first
 * hash-bearing entry and checks every entry after it.
 */
export async function verifyAuditChain() {
  const log = loadLog();
  const firstHashedIndex = log.findIndex((e) => !!e.hash);
  if (firstHashedIndex === -1) {
    return { valid: true, checkedCount: 0, brokenAtIndex: null, brokenAtId: null };
  }

  let prevHash = log[firstHashedIndex].prevHash ?? GENESIS_HASH;
  let checkedCount = 0;
  for (let i = firstHashedIndex; i < log.length; i++) {
    const entry = log[i];
    if (entry.prevHash !== prevHash) {
      return { valid: false, checkedCount, brokenAtIndex: i, brokenAtId: entry.id };
    }
    const { hash, ...rest } = entry;
    const expected = await computeEntryHash(rest, { quiet: true });
    if (expected !== hash) {
      return { valid: false, checkedCount, brokenAtIndex: i, brokenAtId: entry.id };
    }
    checkedCount++;
    prevHash = hash;
  }
  return { valid: true, checkedCount, brokenAtIndex: null, brokenAtId: null };
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
  BACKUP_CREATE_FAILED: 'BACKUP_CREATE_FAILED',       // UC-04: failure outcome, distinct from BACKUP_CREATED
  BACKUP_RESTORED: 'BACKUP_RESTORED',
  BACKUP_RESTORE_FAILED: 'BACKUP_RESTORE_FAILED',     // UC-04: failure outcome, distinct from BACKUP_RESTORED
  DEIDENTIFIED_EXPORT: 'DEIDENTIFIED_EXPORT', // UC-04: de-identified CSV export
  DEIDENTIFIED_EXPORT_FAILED: 'DEIDENTIFIED_EXPORT_FAILED', // UC-04: failure outcome, distinct from DEIDENTIFIED_EXPORT
  DEBUG_SEED_ENTRY: 'DEBUG_SEED_ENTRY', // debug-build only — never appears in a production audit log
  USAGE_NOTICE_UPDATED: 'USAGE_NOTICE_UPDATED',
  INTEGRITY_CHECK_FAILED: 'INTEGRITY_CHECK_FAILED', // SI-04: app bundle tamper detected at startup, before login
  DATA_INTEGRITY_FAILED: 'DATA_INTEGRITY_FAILED', // stored record hash mismatch detected on read (training session / calibration)
};
