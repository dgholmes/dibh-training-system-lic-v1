import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('TrainingSession / Calibration integrity hashing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createMockLocalStorage());
  });

  it('TrainingSession.create() stores a _hash that TrainingSession.get() verifies cleanly', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { TrainingSession } = await import('./localStore.js');
    const created = await TrainingSession.create({ patient_id: 'p1', notes: 'first run' });
    expect(created._hash).toBeTruthy();
    const fetched = await TrainingSession.get(created.id);
    expect(fetched._integrityFailed).toBeUndefined();
  });

  it('flags a record and writes DATA_INTEGRITY_FAILED when the stored content is tampered with', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { Calibration } = await import('./localStore.js');
    const { getAuditLogEntries } = await import('./auditStore.js');
    const created = await Calibration.create({ patient_id: 'p1', cv: 0.05, training_type: 'A' });

    const raw = JSON.parse(localStorage.getItem('dibh_calibrations'));
    raw[0].cv = 0.99; // tamper directly in storage, bypassing the API
    localStorage.setItem('dibh_calibrations', JSON.stringify(raw));

    const fetched = await Calibration.get(created.id);
    expect(fetched._integrityFailed).toBe(true);
    const { entries } = getAuditLogEntries({ limit: 10 });
    expect(entries.some((e) => e.action === 'DATA_INTEGRITY_FAILED')).toBe(true);
  });

  it('treats legacy records with no _hash field as unverified, not tampered', async () => {
    vi.stubGlobal('localStorage', createMockLocalStorage({
      dibh_calibrations: JSON.stringify([{ id: 'legacy-1', patient_id: 'p1', cv: 0.05 }]),
    }));
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { Calibration } = await import('./localStore.js');
    const fetched = await Calibration.get('legacy-1');
    expect(fetched._integrityFailed).toBeUndefined();
  });

  it('Calibration.filter() verifies every matched record', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { Calibration } = await import('./localStore.js');
    await Calibration.create({ patient_id: 'p1', cv: 0.05 });
    await Calibration.create({ patient_id: 'p1', cv: 0.06 });
    const results = await Calibration.filter({ patient_id: 'p1' });
    expect(results).toHaveLength(2);
    expect(results.every((r) => !r._integrityFailed)).toBe(true);
  });
});
