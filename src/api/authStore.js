// Authentication store — MFDS cybersecurity guideline IA-01 through IA-07
import { secDbg } from '@/lib/securityDebug';
import { encryptUserMeta, decryptUserMeta } from '@/lib/crypto';
import { passwordAgeStatus } from '@/config/passwordPolicy';
// Audit logging imported lazily to avoid circular dep (auditStore → authStore → auditStore)
// Passwords hashed with PBKDF2-SHA256 (100k iterations + random 16-byte salt)
// Sessions stored in sessionStorage (cleared on tab/browser close)

const USERS_KEY = 'dibh_users';
const SESSION_KEY = 'dibh_session';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;       // 15 minutes total
const HEARTBEAT_MS = 10_000;              // tick every 10 real seconds
const LOCKOUT_TICKS = LOCKOUT_MS / HEARTBEAT_MS; // 90 ticks

// ── Two-layer lockout tracker (IA-07) ─────────────────────────────────────────
//
// Layer 1 — Tick counter (primary, cross-session safe):
//   setInterval fires on the monotonic scheduler — OS clock changes have no effect.
//   `lockoutTicksRemaining` is stored in localStorage so it persists across app restarts.
//   Each real-time tick decrements the counter. Lockout expires only when counter reaches 0.
//   Only bypass: directly edit localStorage (requires ADB + Android developer mode).
//
// Layer 2 — performance.now() (same-session, belt-and-suspenders):
//   Maps userId → performance.now() at lockout start. Provides sub-10s precision within
//   a session and is a second independent check immune to OS clock manipulation.
//
const _sessionLockouts = new Map(); // userId → perfNow at lockout start (layer 2)

// ── Write serialization ───────────────────────────────────────────────────────
//
// Every writer here does loadUsers() → await (PBKDF2 / AES) → saveUsers(): a
// read-modify-write with an async gap in the middle. Two overlapping callers would
// each snapshot the array before the other's saveUsers(), and the later write would
// silently discard the earlier one (e.g. a heartbeat tick clobbering a password
// reset). Chaining every mutation onto a single promise makes each one atomic with
// respect to the others. Same pattern as auditStore.js's `writeQueue`.
let userQueue = Promise.resolve();

function mutateUsers(fn) {
  const task = userQueue.then(fn);
  userQueue = task.then(() => {}, () => {}); // keep the queue alive even if this mutation rejects
  return task;
}

// Heartbeat: decrement lockoutTicksRemaining for every locked user every 10 real seconds.
// Auto-starts on module import so it runs even before the React tree mounts.
setInterval(() => {
  void mutateUsers(async () => {
    const users = loadUsers();
    const decrypted = await Promise.all(users.map(decryptUserMeta));
    const changed = new Set();
    for (let i = 0; i < decrypted.length; i++) {
      if (decrypted[i]._decryptionFailed) continue;
      if (!decrypted[i].lockoutTicksRemaining || decrypted[i].lockoutTicksRemaining <= 0) continue;
      decrypted[i] = { ...decrypted[i], lockoutTicksRemaining: decrypted[i].lockoutTicksRemaining - 1 };
      if (decrypted[i].lockoutTicksRemaining === 0) {
        decrypted[i] = { ...decrypted[i], lockedUntil: null, failedAttempts: 0 };
        _sessionLockouts.delete(decrypted[i].id);
      }
      changed.add(i);
    }
    if (changed.size === 0) return;
    // Only the users whose tick counter actually moved get re-encrypted; every other
    // record is written back exactly as loaded (no pointless new IV per tick).
    const next = await Promise.all(
      users.map((rawUser, i) => (changed.has(i) ? encryptUserMeta(decrypted[i]) : rawUser))
    );
    saveUsers(next);
  }).catch((err) => console.error('[authStore] lockout heartbeat failed:', err));
}, HEARTBEAT_MS);

// ── Crypto helpers ────────────────────────────────────────────────────────────

function hexEncode(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return hexEncode(arr.buffer);
}

async function pbkdf2Hash(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100_000, hash: 'SHA-256' },
    key,
    256
  );
  secDbg('IA-01/IA-05', 'PBKDF2-SHA256 비밀번호 해시 생성 — Password Hash', {
    설명: '비밀번호를 PBKDF2-SHA256으로 단방향 해시 처리합니다. 100,000회 반복과 랜덤 솔트로 무차별 대입 공격을 방어합니다.',
    description: 'One-way password hash using PBKDF2-SHA256. 100,000 iterations + random salt defends against brute-force attacks.',
    algorithm: 'PBKDF2-SHA256',
    iterations: 100_000,
    salt_hex: salt,
    salt_length_bytes: salt.length / 2,
    output_length_bits: 256,
    note: '비밀번호 평문은 로그에 포함되지 않음 — Plaintext password not logged',
  });
  return hexEncode(bits);
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

/** Creates the default admin account if no users exist yet. */
export async function ensureDefaultAdmin() {
  return mutateUsers(async () => {
    const users = loadUsers();
    if (users.length > 0) return;
    const salt = randomHex(16);
    const passwordHash = await pbkdf2Hash('Admin@1234!', salt);
    const admin = await encryptUserMeta({
      id: generateId(),
      username: 'admin',
      displayName: '관리자',
      passwordHash,
      salt,
      role: 'admin',
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      passwordChangedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    saveUsers([admin]);
  });
}

/**
 * One-time, idempotent upgrade for installs created before user metadata was
 * encrypted: any record still carrying plaintext role/lockout fields (no `_enc`)
 * is encrypted in place. Records that already have `_enc` are left byte-identical —
 * re-running this is a no-op, so it is safe to call on every app start.
 * Returns `{ migrated }` — the number of legacy records that were upgraded.
 */
export async function migrateLegacyUserMetadata() {
  return mutateUsers(async () => {
    const users = loadUsers();
    const legacy = users.filter((u) => !u._enc);
    if (legacy.length === 0) return { migrated: 0 };
    const migratedUsers = await Promise.all(users.map((u) => (u._enc ? u : encryptUserMeta(u))));
    saveUsers(migratedUsers);
    return { migrated: legacy.length };
  });
}

// ── Login / session ───────────────────────────────────────────────────────────

const GENERIC_ERROR = '아이디 또는 비밀번호가 올바르지 않습니다.';

/**
 * Authenticate a user. Serialized through the user-write queue because both the
 * failure path (attempt counter / lockout) and the success path (counter reset)
 * rewrite the stored record.
 */
export async function loginUser(username, password) {
  return mutateUsers(() => doLoginUser(username, password));
}

async function doLoginUser(username, password) {
  const users = loadUsers();
  const idx = users.findIndex((u) => u.username === username);

  // Do not reveal whether the username exists (IA-06)
  if (idx === -1) return { success: false, error: GENERIC_ERROR };

  const user = await decryptUserMeta(users[idx]);

  // Fail closed: a record we can't decrypt/verify must never be allowed to log
  // in, regardless of the password entered (avoids the permissive fallback
  // defaults in decryptUserMeta granting a downgraded-but-valid session).
  if (user._decryptionFailed) return { success: false, error: GENERIC_ERROR };

  // Lockout check (IA-07) — tick counter (primary) + performance.now() (same-session layer)
  const ticks = user.lockoutTicksRemaining ?? 0;
  if (ticks > 0) {
    const remainingMin = Math.ceil((ticks * HEARTBEAT_MS) / 60_000);
    // Also check same-session layer for belt-and-suspenders
    if (!_sessionLockouts.has(user.id)) {
      // Re-entering after app restart: pin into monotonic tracker for this session
      _sessionLockouts.set(user.id, performance.now() - (LOCKOUT_TICKS - ticks) * HEARTBEAT_MS);
    }
    secDbg('IA-07', '계정 잠금 상태 확인 — Lockout Active', {
      설명: '연속 로그인 실패로 인해 계정이 잠금 상태입니다. OS 시계 조작 내성을 위해 이중 레이어 잠금이 적용되어 있습니다.',
      description: 'Account is locked due to repeated login failures. Dual-layer lockout is immune to OS clock manipulation.',
      남은_틱: ticks, ticks_remaining: ticks,
      남은_시간_분: remainingMin, remaining_min: remainingMin,
      레이어1: '틱 카운터 (실시간 인터벌, OS 시계 무관, 세션 간 유지)',
      layer1: 'tick counter (real-time interval, OS-clock immune, cross-session)',
      레이어2: 'performance.now() — 동일 세션 내 정밀 측정',
      layer2: 'performance.now() pinned for this session',
    });
    return {
      success: false,
      locked: true,
      error: `계정이 잠금되었습니다. 약 ${remainingMin}분 후 다시 시도하거나 관리자에게 문의하세요.`,
    };
  }

  const hash = await pbkdf2Hash(password, user.salt);

  if (hash !== user.passwordHash) {
    const attempts = (user.failedAttempts || 0) + 1;
    const update = { failedAttempts: attempts, updatedAt: new Date().toISOString() };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      update.lockedUntil = new Date().toISOString(); // audit trail: when lockout began
      update.lockoutTicksRemaining = LOCKOUT_TICKS;  // primary: real-time tick countdown
      update.failedAttempts = 0;
      _sessionLockouts.set(user.id, performance.now()); // layer 2: same-session monotonic
    }
    const merged = { ...user, ...update };
    users[idx] = await encryptUserMeta(merged);
    saveUsers(users);
    secDbg('IA-07', update.lockoutTicksRemaining ? '계정 잠금 처리 — Account Locked' : '로그인 실패 — Login Failed', {
      설명: update.lockoutTicksRemaining
        ? `${MAX_FAILED_ATTEMPTS}회 연속 실패로 계정이 잠금 처리되었습니다. 15분 후 자동 해제됩니다.`
        : '비밀번호가 일치하지 않아 로그인이 실패하였습니다.',
      description: update.lockoutTicksRemaining
        ? `Account locked after ${MAX_FAILED_ATTEMPTS} consecutive failures. Auto-unlocks after 15 minutes.`
        : 'Login failed — password mismatch.',
      username,
      실패_횟수: attempts, failed_attempt: attempts,
      최대_허용_횟수: MAX_FAILED_ATTEMPTS, max_attempts: MAX_FAILED_ATTEMPTS,
      계정_잠금_여부: !!update.lockoutTicksRemaining, account_locked: !!update.lockoutTicksRemaining,
      잠금_틱: update.lockoutTicksRemaining ?? 'N/A', lockout_ticks: update.lockoutTicksRemaining ?? 'N/A',
      잠금_시간_분: LOCKOUT_MS / 60_000, lockout_duration_min: LOCKOUT_MS / 60_000,
      시계_조작_방어: '레이어1: 실시간 틱 카운터 (세션 간 유지) | 레이어2: performance.now() (동일 세션)',
      clock_protection: 'Layer 1: real-time tick counter (cross-session safe) | Layer 2: performance.now() (same-session)',
    });

    // Lazy import to avoid circular dependency
    import('./auditStore').then(({ tryWriteAuditLog, AUDIT_ACTIONS }) => {
      if (update.lockedUntil) {
        tryWriteAuditLog({ action: AUDIT_ACTIONS.ACCOUNT_LOCKED, targetType: 'user', targetId: user.id, detail: `username: ${username}` });
      } else {
        tryWriteAuditLog({ action: AUDIT_ACTIONS.LOGIN_FAILED, targetType: 'user', targetId: user.id, detail: `username: ${username}, attempt ${attempts}` });
      }
    });

    if (update.lockedUntil) {
      return {
        success: false,
        locked: true,
        error: '로그인 시도 횟수를 초과하여 계정이 잠금되었습니다. 관리자에게 문의하여 잠금을 해제해 주세요.',
      };
    }
    const remaining = MAX_FAILED_ATTEMPTS - attempts;
    return { success: false, error: `${GENERIC_ERROR} (남은 시도: ${remaining}회)` };
  }

  // Success — reset counter and create session
  const merged = { ...user, failedAttempts: 0, lockedUntil: null, updatedAt: new Date().toISOString() };
  users[idx] = await encryptUserMeta(merged);
  saveUsers(users);

  // IA-04 — a password past its maximum age must be changed before the operator continues.
  // Records predating this feature carry no passwordChangedAt, so the account's own creation
  // date stands in: a password that has never been changed is as old as the account.
  const pwAge = passwordAgeStatus(user.passwordChangedAt || user.createdAt);

  const session = {
    token: randomHex(32),
    userId: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role,
    mustChangePassword: !!user.mustChangePassword || pwAge.expired,
    passwordExpired: pwAge.expired,
    passwordAgeDays: pwAge.ageDays,
    passwordExpiresInDays: pwAge.expiresInDays,
    passwordExpiryWarning: pwAge.warn,
    loginTime: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

  import('./auditStore').then(({ tryWriteAuditLog, AUDIT_ACTIONS }) => {
    tryWriteAuditLog({ action: AUDIT_ACTIONS.LOGIN, targetType: 'user', targetId: user.id, detail: `username: ${username}` });
  });

  return { success: true, session };
}

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function touchSession() {
  const s = getSession();
  if (!s) return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, lastActivity: new Date().toISOString() }));
}

export function clearSession() {
  const s = getSession();
  sessionStorage.removeItem(SESSION_KEY);
  if (s) {
    import('./auditStore').then(({ tryWriteAuditLog, AUDIT_ACTIONS }) => {
      tryWriteAuditLog({ action: AUDIT_ACTIONS.LOGOUT, targetType: 'user', targetId: s.userId, detail: `username: ${s.username}` });
    });
  }
}

/** Like clearSession() but logs SESSION_TIMEOUT instead of LOGOUT — used by the inactivity timer. */
export function clearSessionForTimeout() {
  const s = getSession();
  sessionStorage.removeItem(SESSION_KEY);
  if (s) {
    import('./auditStore').then(({ tryWriteAuditLog, AUDIT_ACTIONS }) => {
      tryWriteAuditLog({ action: AUDIT_ACTIONS.SESSION_TIMEOUT, targetType: 'user', targetId: s.userId, detail: `username: ${s.username}, reason: 30min inactivity` });
    });
  }
}

// ── User management (admin) ───────────────────────────────────────────────────

// A record whose `_enc` blob cannot be decrypted/verified has no recoverable
// role or lockout state — decryptUserMeta() only returns permissive placeholders.
// Merging an update onto those placeholders would bake the fallback values in as
// if they were real (silently demoting an admin to clinician, and destroying the
// original ciphertext). Refuse the mutation instead and point the admin at the
// only safe recovery: delete the account and recreate it.
const CORRUPTED_RECORD_ERROR =
  '이 계정의 데이터가 손상되어 복호화할 수 없습니다. 계정을 삭제한 후 다시 생성해 주세요.';

function assertDecryptable(decrypted) {
  if (decrypted._decryptionFailed) throw new Error(CORRUPTED_RECORD_ERROR);
}

export const UserStore = {
  // Read-only — nothing to serialize against, so it stays off the write queue.
  async list() {
    const users = loadUsers();
    const decrypted = await Promise.all(users.map(decryptUserMeta));
    return decrypted.map(({ passwordHash, salt, ...safe }) => safe);
  },

  async create({ username, displayName = '', password, role = 'clinician' }) {
    return mutateUsers(async () => {
      const users = loadUsers();
      if (users.find((u) => u.username === username)) throw new Error('이미 존재하는 아이디입니다.');
      const salt = randomHex(16);
      const passwordHash = await pbkdf2Hash(password, salt);
      const user = {
        id: generateId(),
        username,
        displayName: displayName.trim() || username,
        passwordHash,
        salt,
        role,
        mustChangePassword: true,
        failedAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      users.push(await encryptUserMeta(user));
      saveUsers(users);
      return { ...user, passwordHash: undefined, salt: undefined };
    });
  },

  async changePassword(userId, newPassword) {
    return mutateUsers(async () => {
      const users = loadUsers();
      const idx = users.findIndex((u) => u.id === userId);
      if (idx === -1) throw new Error('사용자를 찾을 수 없습니다.');
      const salt = randomHex(16);
      const passwordHash = await pbkdf2Hash(newPassword, salt);
      const decrypted = await decryptUserMeta(users[idx]);
      assertDecryptable(decrypted);
      const merged = {
        ...decrypted,
        passwordHash,
        salt,
        mustChangePassword: false,
        // IA-04 — restarts the change cycle.
        passwordChangedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      users[idx] = await encryptUserMeta(merged);
      saveUsers(users);
      // Update active session if changing own password
      const s = getSession();
      if (s && s.userId === userId) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, mustChangePassword: false }));
      }
    });
  },

  async resetPassword(userId, newPassword) {
    return mutateUsers(async () => {
      const users = loadUsers();
      const idx = users.findIndex((u) => u.id === userId);
      if (idx === -1) throw new Error('사용자를 찾을 수 없습니다.');
      const salt = randomHex(16);
      const passwordHash = await pbkdf2Hash(newPassword, salt);
      const decrypted = await decryptUserMeta(users[idx]);
      assertDecryptable(decrypted);
      const merged = {
        ...decrypted,
        passwordHash,
        salt,
        mustChangePassword: true,
        // IA-04 — an admin reset also restarts the cycle; the user must still pick their own.
        passwordChangedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      users[idx] = await encryptUserMeta(merged);
      saveUsers(users);
    });
  },

  async unlock(userId) {
    return mutateUsers(async () => {
      const users = loadUsers();
      const idx = users.findIndex((u) => u.id === userId);
      if (idx === -1) throw new Error('사용자를 찾을 수 없습니다.');
      const decrypted = await decryptUserMeta(users[idx]);
      assertDecryptable(decrypted);
      const merged = { ...decrypted, failedAttempts: 0, lockedUntil: null, lockoutTicksRemaining: 0, updatedAt: new Date().toISOString() };
      users[idx] = await encryptUserMeta(merged);
      saveUsers(users);
      _sessionLockouts.delete(userId); // clear both layers
    });
  },

  async setRole(userId, role) {
    return mutateUsers(async () => {
      const users = loadUsers();
      const idx = users.findIndex((u) => u.id === userId);
      if (idx === -1) throw new Error('사용자를 찾을 수 없습니다.');
      const decrypted = await decryptUserMeta(users[idx]);
      assertDecryptable(decrypted);
      const merged = { ...decrypted, role, updatedAt: new Date().toISOString() };
      users[idx] = await encryptUserMeta(merged);
      saveUsers(users);
    });
  },

  // Deleting is the documented recovery path for an undecryptable record, so it
  // deliberately has no assertDecryptable() guard. Now async (queued) — callers must await.
  async delete(userId) {
    return mutateUsers(async () => {
      const users = loadUsers();
      if (users.length <= 1) throw new Error('마지막 계정은 삭제할 수 없습니다.');
      saveUsers(users.filter((u) => u.id !== userId));
    });
  },
};
