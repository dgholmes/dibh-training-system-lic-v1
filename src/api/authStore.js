// Authentication store — MFDS cybersecurity guideline IA-01 through IA-07
// Audit logging imported lazily to avoid circular dep (auditStore → authStore → auditStore)
// Passwords hashed with PBKDF2-SHA256 (100k iterations + random 16-byte salt)
// Sessions stored in sessionStorage (cleared on tab/browser close)

const USERS_KEY = 'dibh_users';
const SESSION_KEY = 'dibh_session';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

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
  const users = loadUsers();
  if (users.length > 0) return;
  const salt = randomHex(16);
  const passwordHash = await pbkdf2Hash('Admin@1234!', salt);
  saveUsers([
    {
      id: generateId(),
      username: 'admin',
      displayName: '관리자',
      passwordHash,
      salt,
      role: 'admin',
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);
}

// ── Login / session ───────────────────────────────────────────────────────────

const GENERIC_ERROR = '아이디 또는 비밀번호가 올바르지 않습니다.';

export async function loginUser(username, password) {
  const users = loadUsers();
  const idx = users.findIndex((u) => u.username === username);

  // Do not reveal whether the username exists (IA-06)
  if (idx === -1) return { success: false, error: GENERIC_ERROR };

  const user = users[idx];

  // Lockout check (IA-07)
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const mins = Math.ceil((new Date(user.lockedUntil) - Date.now()) / 60_000);
    return {
      success: false,
      locked: true,
      error: `계정이 잠금되었습니다. ${mins}분 후 다시 시도하거나 관리자에게 문의하세요.`,
    };
  }

  const hash = await pbkdf2Hash(password, user.salt);

  if (hash !== user.passwordHash) {
    const attempts = (user.failedAttempts || 0) + 1;
    const update = { failedAttempts: attempts, updatedAt: new Date().toISOString() };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      update.lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
      update.failedAttempts = 0;
    }
    users[idx] = { ...user, ...update };
    saveUsers(users);

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
        error: '로그인 시도 횟수를 초과하여 계정이 잠금되었습니다. 15분 후 다시 시도하거나 관리자에게 문의하세요.',
      };
    }
    const remaining = MAX_FAILED_ATTEMPTS - attempts;
    return { success: false, error: `${GENERIC_ERROR} (남은 시도: ${remaining}회)` };
  }

  // Success — reset counter and create session
  users[idx] = { ...user, failedAttempts: 0, lockedUntil: null, updatedAt: new Date().toISOString() };
  saveUsers(users);

  const session = {
    token: randomHex(32),
    userId: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role,
    mustChangePassword: !!user.mustChangePassword,
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

// ── User management (admin) ───────────────────────────────────────────────────

export const UserStore = {
  list() {
    return loadUsers().map(({ passwordHash, salt, ...safe }) => safe);
  },

  async create({ username, displayName = '', password, role = 'clinician' }) {
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
    return { ...user, passwordHash: undefined, salt: undefined };
  },

  async changePassword(userId, newPassword) {
    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) throw new Error('사용자를 찾을 수 없습니다.');
    const salt = randomHex(16);
    const passwordHash = await pbkdf2Hash(newPassword, salt);
    users[idx] = { ...users[idx], passwordHash, salt, mustChangePassword: false, updatedAt: new Date().toISOString() };
    saveUsers(users);
    // Update active session if changing own password
    const s = getSession();
    if (s && s.userId === userId) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, mustChangePassword: false }));
    }
  },

  async resetPassword(userId, newPassword) {
    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) throw new Error('사용자를 찾을 수 없습니다.');
    const salt = randomHex(16);
    const passwordHash = await pbkdf2Hash(newPassword, salt);
    users[idx] = {
      ...users[idx],
      passwordHash,
      salt,
      mustChangePassword: true,
      updatedAt: new Date().toISOString(),
    };
    saveUsers(users);
  },

  unlock(userId) {
    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) throw new Error('사용자를 찾을 수 없습니다.');
    users[idx] = { ...users[idx], failedAttempts: 0, lockedUntil: null, updatedAt: new Date().toISOString() };
    saveUsers(users);
  },

  setRole(userId, role) {
    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) throw new Error('사용자를 찾을 수 없습니다.');
    users[idx] = { ...users[idx], role, updatedAt: new Date().toISOString() };
    saveUsers(users);
  },

  delete(userId) {
    const users = loadUsers();
    if (users.length <= 1) throw new Error('마지막 계정은 삭제할 수 없습니다.');
    saveUsers(users.filter((u) => u.id !== userId));
  },
};
