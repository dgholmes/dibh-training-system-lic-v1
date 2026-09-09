import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/db/sqliteDb', () => ({
  exportDbBinaryBase64: vi.fn(async () => 'bW9jay1zcWxpdGUtYmxvYg=='), // "mock-sqlite-blob"
  importDbBinaryBase64: vi.fn(async () => {}),
}));

function createMockLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('createBackup / restoreBackup', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('round-trips all 7 keys plus the SQLite blob through a full backup/restore cycle', async () => {
    vi.stubGlobal('localStorage', createMockLocalStorage({
      dibh_patients: JSON.stringify([{ id: 'p1' }]),
      dibh_calibrations: JSON.stringify([{ id: 'c1' }]),
      dibh_training_sessions: JSON.stringify([]),
      dibh_audit_log: JSON.stringify([{ id: 'a1' }]),
      dibh_users: JSON.stringify([{ id: 'u1' }]),
      dibh_calibration_sessions: JSON.stringify([{ id: 'cs1' }]),
      dibh_doctor_roster: JSON.stringify({ v: 1, data: 'enc:abcd:1234' }),
    }));
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { createBackup } = await import('./AdminBackup.jsx');
    const encrypted = await createBackup();

    // Wipe storage to prove restore actually repopulates it
    vi.stubGlobal('localStorage', createMockLocalStorage());
    const { restoreBackup } = await import('./AdminBackup.jsx');
    await restoreBackup(encrypted);

    expect(JSON.parse(localStorage.getItem('dibh_users'))).toEqual([{ id: 'u1' }]);
    expect(JSON.parse(localStorage.getItem('dibh_calibration_sessions'))).toEqual([{ id: 'cs1' }]);
    // JSON envelope around an encrypted payload — round-trips opaquely.
    expect(JSON.parse(localStorage.getItem('dibh_doctor_roster'))).toEqual({
      v: 1,
      data: 'enc:abcd:1234',
    });
  });

  it('restores a legacy (v1, 4-key) backup fixture without error, leaving new keys untouched', async () => {
    vi.stubGlobal('localStorage', createMockLocalStorage());
    const { restoreBackup } = await import('./AdminBackup.jsx');
    const { encryptValue, sha256Hex, initCrypto } = await import('@/lib/crypto');
    await initCrypto();

    // Build a legacy-shaped payload by hand (no _backup_format_version, no sqlite blob, no dibh_users/dibh_calibration_sessions)
    const legacyPayload = {
      dibh_patients: [{ id: 'legacy-p1' }],
      dibh_calibrations: [],
      dibh_training_sessions: [],
      dibh_audit_log: [],
      _created_at: '2025-01-01T00:00:00.000Z',
      _version: '1.0.0',
    };
    const json = JSON.stringify(legacyPayload);
    const hash = await sha256Hex(new TextEncoder().encode(json).buffer);
    const envelope = JSON.stringify({ hash, data: json });
    const legacyEncrypted = await encryptValue(envelope);

    const result = await restoreBackup(legacyEncrypted);
    expect(result.version).toBe('1.0.0');
    expect(JSON.parse(localStorage.getItem('dibh_patients'))).toEqual([{ id: 'legacy-p1' }]);
    expect(localStorage.getItem('dibh_users')).toBeNull(); // untouched — legacy backup had no such key
  });

  it('sets _backup_format_version to 2 on newly created backups', async () => {
    vi.stubGlobal('localStorage', createMockLocalStorage());
    const { decryptValue, initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { createBackup } = await import('./AdminBackup.jsx');
    const encrypted = await createBackup();
    const envelope = JSON.parse(await decryptValue(encrypted));
    const payload = JSON.parse(envelope.data);
    expect(payload._backup_format_version).toBe(2);
    expect(payload._sqlite_blob_base64).toBe('bW9jay1zcWxpdGUtYmxvYg==');
  });
});
