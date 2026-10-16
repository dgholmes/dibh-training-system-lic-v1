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

  it('tells the user the same retry time when the account locks and on a retry while locked', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, loginUser } = await import('./authStore.js');
    await ensureDefaultAdmin();

    for (let i = 0; i < 4; i++) await loginUser('admin', 'wrong-password');
    const atLock = await loginUser('admin', 'wrong-password');
    const retry = await loginUser('admin', 'wrong-password');

    // Both messages give the 15-minute auto-unlock and the admin alternative.
    expect(atLock.error).toContain('약 15분 후 다시 시도하거나 관리자에게 문의하세요.');
    expect(retry.error).toContain('약 15분 후 다시 시도하거나 관리자에게 문의하세요.');
  });

  it('a locked account is reported as locked to the admin list until unlocked', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, loginUser, UserStore, isUserLocked } = await import('./authStore.js');
    await ensureDefaultAdmin();

    let [admin] = await UserStore.list();
    expect(isUserLocked(admin)).toBe(false);

    for (let i = 0; i < 5; i++) await loginUser('admin', 'wrong-password');

    // Regression: `lockedUntil` holds the lockout *start* time, so a
    // "lockedUntil > now" check reported this account as unlocked and the
    // admin's 잠금해제 button never rendered.
    [admin] = await UserStore.list();
    expect(isUserLocked(admin)).toBe(true);

    await UserStore.unlock(admin.id);
    [admin] = await UserStore.list();
    expect(isUserLocked(admin)).toBe(false);
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

  it('rejects login for a user whose _enc metadata cannot be decrypted, even with the correct password', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, loginUser } = await import('./authStore.js');
    await ensureDefaultAdmin();

    // Corrupt only the _enc blob directly in storage — passwordHash/salt stay genuine and untouched
    const users = JSON.parse(localStorage.getItem('dibh_users'));
    users[0]._enc = 'enc:not-valid-hex-data-000000:also-not-valid';
    localStorage.setItem('dibh_users', JSON.stringify(users));

    const result = await loginUser('admin', 'Admin@1234!'); // the genuinely correct password
    expect(result.success).toBe(false);
  });

  it('refuses every UserStore mutation on an undecryptable record and leaves it byte-identical', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, UserStore } = await import('./authStore.js');
    await ensureDefaultAdmin();

    const users = JSON.parse(localStorage.getItem('dibh_users'));
    const adminId = users[0].id;
    users[0]._enc = 'enc:not-valid-hex-data-000000:also-not-valid';
    localStorage.setItem('dibh_users', JSON.stringify(users));
    const before = localStorage.getItem('dibh_users');

    const CORRUPT_MSG = '이 계정의 데이터가 손상되어 복호화할 수 없습니다. 계정을 삭제한 후 다시 생성해 주세요.';
    await expect(UserStore.unlock(adminId)).rejects.toThrow(CORRUPT_MSG);
    await expect(UserStore.setRole(adminId, 'clinician')).rejects.toThrow(CORRUPT_MSG);
    await expect(UserStore.changePassword(adminId, 'NewPass@1234!')).rejects.toThrow(CORRUPT_MSG);
    await expect(UserStore.resetPassword(adminId, 'NewPass@1234!')).rejects.toThrow(CORRUPT_MSG);

    // The real (unrecoverable) ciphertext must not have been overwritten with the
    // permissive fallback values, and _decryptionFailed must never be persisted.
    expect(localStorage.getItem('dibh_users')).toBe(before);
    expect(JSON.parse(localStorage.getItem('dibh_users'))[0]._decryptionFailed).toBeUndefined();

    // Rejected mutations must not stall the write queue for everyone else.
    await UserStore.create({ username: 'recovery', password: 'Recovery@1234!' });
    expect((await UserStore.list()).map((u) => u.username)).toContain('recovery');

    // Delete is the documented recovery path — it must still work on a corrupt record.
    await UserStore.delete(adminId);
    expect((await UserStore.list()).map((u) => u.username)).toEqual(['recovery']);
  });

  it('serializes concurrent UserStore mutations so no write is lost', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, UserStore } = await import('./authStore.js');
    await ensureDefaultAdmin();

    // Two concurrent creates: without serialization the second saveUsers() would
    // write a snapshot taken before the first one landed, dropping that account.
    const [alpha, beta] = await Promise.all([
      UserStore.create({ username: 'alpha', password: 'Alpha@1234!' }),
      UserStore.create({ username: 'beta', password: 'Beta@12345!' }),
    ]);
    const afterCreate = await UserStore.list();
    expect(afterCreate.map((u) => u.username).sort()).toEqual(['admin', 'alpha', 'beta']);

    // Two concurrent mutations on *different* records — both must persist.
    const hashBefore = JSON.parse(localStorage.getItem('dibh_users'))
      .find((u) => u.id === beta.id).passwordHash;
    await Promise.all([
      UserStore.setRole(alpha.id, 'admin'),
      UserStore.resetPassword(beta.id, 'Reset@12345!'),
    ]);
    const afterMutations = await UserStore.list();
    expect(afterMutations).toHaveLength(3);
    expect(afterMutations.find((u) => u.id === alpha.id).role).toBe('admin'); // setRole not clobbered
    const hashAfter = JSON.parse(localStorage.getItem('dibh_users'))
      .find((u) => u.id === beta.id).passwordHash;
    expect(hashAfter).not.toBe(hashBefore); // resetPassword not clobbered
  });

  it('migrateLegacyUserMetadata encrypts plaintext records once and is a no-op on re-run', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    // Legacy (pre-upgrade) record: role/lockout still stored as plaintext fields.
    localStorage.setItem('dibh_users', JSON.stringify([{
      id: 'u-legacy', username: 'legacy', displayName: '레거시',
      passwordHash: 'hash', salt: 'salt',
      role: 'admin', mustChangePassword: false, failedAttempts: 0, lockedUntil: null,
      createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
    }]));
    const { migrateLegacyUserMetadata, UserStore } = await import('./authStore.js');

    expect(await migrateLegacyUserMetadata()).toEqual({ migrated: 1 });
    const raw = JSON.parse(localStorage.getItem('dibh_users'))[0];
    expect(raw.role).toBeUndefined();
    expect(raw._enc).toMatch(/^enc:/);
    expect((await UserStore.list())[0].role).toBe('admin'); // role survived the migration

    const afterFirst = localStorage.getItem('dibh_users');
    expect(await migrateLegacyUserMetadata()).toEqual({ migrated: 0 });
    // Byte-identical — already-encrypted records are not re-encrypted with a new IV.
    expect(localStorage.getItem('dibh_users')).toBe(afterFirst);
  });

  it('migrateLegacyUserMetadata only touches the legacy records in a mixed dataset', async () => {
    const { initCrypto, encryptUserMeta } = await import('@/lib/crypto');
    await initCrypto();
    const modern = await encryptUserMeta({
      id: 'u-modern', username: 'modern', passwordHash: 'h', salt: 's',
      role: 'clinician', mustChangePassword: false, failedAttempts: 0, lockedUntil: null,
    });
    const legacy = {
      id: 'u-legacy', username: 'legacy', passwordHash: 'h', salt: 's',
      role: 'admin', mustChangePassword: false, failedAttempts: 0, lockedUntil: null,
    };
    localStorage.setItem('dibh_users', JSON.stringify([modern, legacy]));
    const { migrateLegacyUserMetadata, UserStore } = await import('./authStore.js');

    expect(await migrateLegacyUserMetadata()).toEqual({ migrated: 1 });
    const stored = JSON.parse(localStorage.getItem('dibh_users'));
    expect(stored[0]._enc).toBe(modern._enc); // untouched ciphertext
    expect(stored[1]._enc).toMatch(/^enc:/);
    expect(stored[1].role).toBeUndefined();

    const list = await UserStore.list();
    expect(list.find((u) => u.id === 'u-modern').role).toBe('clinician');
    expect(list.find((u) => u.id === 'u-legacy').role).toBe('admin');
  });
});
