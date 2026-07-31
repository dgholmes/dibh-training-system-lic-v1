import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('encryptUserMeta / decryptUserMeta', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createMockLocalStorage());
  });

  it('round-trips role and lockout fields, keeping username/id in plaintext', async () => {
    const { initCrypto, encryptUserMeta, decryptUserMeta } = await import('./crypto.js');
    await initCrypto();
    const user = {
      id: 'u1', username: 'admin', displayName: '관리자',
      passwordHash: 'hash', salt: 'salt',
      role: 'admin', mustChangePassword: true,
      failedAttempts: 2, lockedUntil: null, lockoutTicksRemaining: 0,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const encrypted = await encryptUserMeta(user);
    expect(encrypted.username).toBe('admin'); // plaintext, unchanged
    expect(encrypted.role).toBeUndefined(); // moved into _enc
    expect(encrypted._enc).toMatch(/^enc:/);

    const decrypted = await decryptUserMeta(encrypted);
    expect(decrypted).toEqual(user);
  });

  it('passes through a legacy record with no _enc field unchanged', async () => {
    const { initCrypto, decryptUserMeta } = await import('./crypto.js');
    await initCrypto();
    const legacy = { id: 'u2', username: 'legacy', role: 'clinician' };
    expect(await decryptUserMeta(legacy)).toEqual(legacy);
  });

  it('falls back to safe defaults instead of throwing when _enc is corrupted', async () => {
    const { initCrypto, decryptUserMeta } = await import('./crypto.js');
    await initCrypto();
    const corrupted = { id: 'u3', username: 'broken', _enc: 'enc:not-valid-hex-data-000000:also-not-valid' };
    const result = await decryptUserMeta(corrupted);
    expect(result._decryptionFailed).toBe(true);
    expect(result.role).toBe('clinician');
  });

  it('detects an _enc blob copied from another user record (id binding)', async () => {
    const { initCrypto, encryptUserMeta, decryptUserMeta } = await import('./crypto.js');
    await initCrypto();
    const admin = {
      id: 'u-admin', username: 'boss', passwordHash: 'h1', salt: 's1',
      role: 'admin', mustChangePassword: false,
      failedAttempts: 0, lockedUntil: null, lockoutTicksRemaining: 0,
    };
    const clinician = {
      id: 'u-clin', username: 'nurse', passwordHash: 'h2', salt: 's2',
      role: 'clinician', mustChangePassword: false,
      failedAttempts: 0, lockedUntil: null, lockoutTicksRemaining: 0,
    };
    const encAdmin = await encryptUserMeta(admin);
    const encClinician = await encryptUserMeta(clinician);

    // Attack: lift the admin's ciphertext onto the clinician's record. Same install
    // key, valid GCM tag — only the sealed id reveals the swap.
    const swapped = { ...encClinician, _enc: encAdmin._enc };
    const result = await decryptUserMeta(swapped);

    expect(result._decryptionFailed).toBe(true);
    expect(result.role).not.toBe('admin'); // privilege escalation refused
    expect(result.username).toBe('nurse');
  });

  it('never persists the derived _decryptionFailed flag', async () => {
    const { initCrypto, encryptUserMeta } = await import('./crypto.js');
    await initCrypto();
    const encrypted = await encryptUserMeta({
      id: 'u4', username: 'broken', role: 'clinician', _decryptionFailed: true,
    });
    expect(encrypted._decryptionFailed).toBeUndefined();
  });
});
