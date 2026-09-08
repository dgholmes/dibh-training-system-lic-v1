import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('assigned_doctor_account_id encryption', () => {
  let crypto_;

  beforeEach(async () => {
    vi.resetModules();
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    });
    crypto_ = await import('./crypto.js');
    await crypto_.initCrypto();
  });

  it('encrypts the account id into the _enc blob, not a plain field', async () => {
    const encrypted = await crypto_.encryptPatient({
      id: 'p1',
      patient_code: 'PT-2026-001',
      name: '홍길동',
      birth_date: '1990-05-12',
      assigned_doctor_name: '김의사',
      assigned_doctor_account_id: 'u-42',
    });

    expect(encrypted.assigned_doctor_account_id).toBeUndefined();
    expect(encrypted.patient_code).toBe('PT-2026-001');
    expect(JSON.stringify(encrypted)).not.toContain('u-42');
  });

  it('round-trips the account id back out', async () => {
    const encrypted = await crypto_.encryptPatient({
      id: 'p1',
      name: '홍길동',
      birth_date: '1990-05-12',
      assigned_doctor_name: '김의사',
      assigned_doctor_account_id: 'u-42',
    });
    const decrypted = await crypto_.decryptPatient(encrypted);

    expect(decrypted.assigned_doctor_account_id).toBe('u-42');
    expect(decrypted.assigned_doctor_name).toBe('김의사');
  });

  it('reads a record written before the field existed as an empty string', async () => {
    // Simulate a pre-upgrade record: _enc blob without the new key.
    const legacyPii = JSON.stringify({
      name: '이환자',
      birth_date: '1985-03-03',
      assigned_doctor_name: '박의사',
    });
    const legacy = {
      id: 'p2',
      patient_code: 'PT-2025-009',
      _enc: await crypto_.encryptValue(legacyPii),
    };

    const decrypted = await crypto_.decryptPatient(legacy);
    expect(decrypted.name).toBe('이환자');
    expect(decrypted.assigned_doctor_account_id).toBe('');
  });

  it('supplies an empty account id when decryption fails', async () => {
    const broken = { id: 'p3', patient_code: 'PT-2026-003', _enc: 'enc:0000:dead' };
    const decrypted = await crypto_.decryptPatient(broken);

    expect(decrypted._decryptionFailed).toBe(true);
    expect(decrypted.assigned_doctor_account_id).toBe('');
  });
});
