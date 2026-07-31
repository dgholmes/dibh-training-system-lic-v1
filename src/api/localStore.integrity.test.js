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

  it('migrateLegacyRecordHashes() hashes only the legacy records in a mixed dataset', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { Calibration, TrainingSession, migrateLegacyRecordHashes } = await import('./localStore.js');

    // Modern records — created through the API, so already hashed.
    const modernCal = await Calibration.create({ patient_id: 'p1', cv: 0.05 });
    const modernSession = await TrainingSession.create({ patient_id: 'p1', notes: 'modern' });

    // Legacy records — injected directly, as a pre-upgrade build would have left them.
    const cals = JSON.parse(localStorage.getItem('dibh_calibrations'));
    cals.push({ id: 'legacy-cal', patient_id: 'p2', cv: 0.07 });
    localStorage.setItem('dibh_calibrations', JSON.stringify(cals));
    const sessions = JSON.parse(localStorage.getItem('dibh_training_sessions'));
    sessions.push({ id: 'legacy-sess-a', patient_id: 'p2' }, { id: 'legacy-sess-b', patient_id: 'p3' });
    localStorage.setItem('dibh_training_sessions', JSON.stringify(sessions));

    const result = await migrateLegacyRecordHashes();
    expect(result).toEqual({ trainingSessions: 2, calibrations: 1 });

    // Already-hashed records keep their original hash — not recomputed.
    const storedCals = JSON.parse(localStorage.getItem('dibh_calibrations'));
    expect(storedCals.find((c) => c.id === modernCal.id)._hash).toBe(modernCal._hash);
    const storedSessions = JSON.parse(localStorage.getItem('dibh_training_sessions'));
    expect(storedSessions.find((s) => s.id === modernSession.id)._hash).toBe(modernSession._hash);

    // Migrated legacy records now verify cleanly instead of staying unverifiable.
    const migratedCal = await Calibration.get('legacy-cal');
    expect(migratedCal._hash).toBeTruthy();
    expect(migratedCal._integrityFailed).toBeUndefined();
    const migratedSession = await TrainingSession.get('legacy-sess-a');
    expect(migratedSession._integrityFailed).toBeUndefined();
  });

  it('migrateLegacyRecordHashes() is idempotent — the second run is a no-op', async () => {
    vi.stubGlobal('localStorage', createMockLocalStorage({
      dibh_training_sessions: JSON.stringify([{ id: 'legacy-sess', patient_id: 'p1' }]),
      dibh_calibrations: JSON.stringify([{ id: 'legacy-cal', patient_id: 'p1', cv: 0.05 }]),
    }));
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { migrateLegacyRecordHashes } = await import('./localStore.js');

    expect(await migrateLegacyRecordHashes()).toEqual({ trainingSessions: 1, calibrations: 1 });
    const sessionsSnapshot = localStorage.getItem('dibh_training_sessions');
    const calibrationsSnapshot = localStorage.getItem('dibh_calibrations');

    expect(await migrateLegacyRecordHashes()).toEqual({ trainingSessions: 0, calibrations: 0 });
    expect(localStorage.getItem('dibh_training_sessions')).toBe(sessionsSnapshot);
    expect(localStorage.getItem('dibh_calibrations')).toBe(calibrationsSnapshot);
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
