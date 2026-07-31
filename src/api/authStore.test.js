import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('authStore — encrypted user metadata', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createMockStorage());
    vi.stubGlobal('sessionStorage', createMockStorage());
  });

  it('stores role/lockout fields encrypted, not as plaintext top-level keys', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin } = await import('./authStore.js');
    await ensureDefaultAdmin();

    const raw = JSON.parse(localStorage.getItem('dibh_users'))[0];
    expect(raw.username).toBe('admin'); // plaintext, needed for lookup
    expect(raw.role).toBeUndefined(); // must not be a plaintext field
    expect(raw._enc).toMatch(/^enc:/);
  });

  it('logs in successfully with the default admin credentials', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, loginUser } = await import('./authStore.js');
    await ensureDefaultAdmin();

    const result = await loginUser('admin', 'Admin@1234!');
    expect(result.success).toBe(true);
    expect(result.session.role).toBe('admin');
  });

  it('locks the account after 5 failed attempts and keeps the lockout state encrypted', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, loginUser } = await import('./authStore.js');
    await ensureDefaultAdmin();

    for (let i = 0; i < 4; i++) {
      const r = await loginUser('admin', 'wrong-password');
      expect(r.locked).toBeUndefined();
    }
    const lockedResult = await loginUser('admin', 'wrong-password');
    expect(lockedResult.locked).toBe(true);

    const raw = JSON.parse(localStorage.getItem('dibh_users'))[0];
    expect(raw.lockedUntil).toBeUndefined(); // must not leak in plaintext
    expect(raw._enc).toMatch(/^enc:/);
  });

  it('UserStore.list() never exposes passwordHash or salt', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, UserStore } = await import('./authStore.js');
    await ensureDefaultAdmin();

    const users = await UserStore.list();
    expect(users[0].passwordHash).toBeUndefined();
    expect(users[0].salt).toBeUndefined();
    expect(users[0].role).toBe('admin'); // decrypted metadata still present
  });

  it('UserStore.setRole updates the encrypted role field', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, UserStore } = await import('./authStore.js');
    await ensureDefaultAdmin();
    const [admin] = await UserStore.list();

    await UserStore.setRole(admin.id, 'clinician');
    const [updated] = await UserStore.list();
    expect(updated.role).toBe('clinician');
  });

  it('UserStore.unlock clears lockout state after a lockout', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, loginUser, UserStore } = await import('./authStore.js');
    await ensureDefaultAdmin();
    for (let i = 0; i < 5; i++) await loginUser('admin', 'wrong-password');

    const [locked] = await UserStore.list();
    expect(locked.lockedUntil).not.toBeNull();

    await UserStore.unlock(locked.id);
    const [unlocked] = await UserStore.list();
    expect(unlocked.lockedUntil).toBeNull();
    expect(unlocked.failedAttempts).toBe(0);
  });

  it('fails closed: a user record with an undecryptable _enc blob cannot log in with any password', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { loginUser } = await import('./authStore.js');

    const corrupted = {
      id: 'u-corrupted',
      username: 'broken',
      displayName: 'broken',
      passwordHash: 'irrelevant',
      salt: 'irrelevant',
      _enc: 'enc:not-valid-hex-data-000000:also-not-valid',
    };
    localStorage.setItem('dibh_users', JSON.stringify([corrupted]));

    const result = await loginUser('broken', 'any-password-at-all');
    expect(result.success).toBe(false);
  });
});
