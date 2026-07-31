import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('computeRecordHash', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createMockLocalStorage());
  });

  it('produces the same hash for the same content regardless of key order', async () => {
    const { initCrypto, computeRecordHash } = await import('./crypto.js');
    await initCrypto();
    const a = await computeRecordHash({ id: '1', cv: 0.05, training_type: 'A' });
    const b = await computeRecordHash({ training_type: 'A', id: '1', cv: 0.05 });
    expect(a).toBe(b);
  });

  it('produces a different hash when a field value changes', async () => {
    const { initCrypto, computeRecordHash } = await import('./crypto.js');
    await initCrypto();
    const a = await computeRecordHash({ id: '1', cv: 0.05 });
    const b = await computeRecordHash({ id: '1', cv: 0.06 });
    expect(a).not.toBe(b);
  });

  it('ignores _hash and _integrityFailed fields already present on the record', async () => {
    const { initCrypto, computeRecordHash } = await import('./crypto.js');
    await initCrypto();
    const bare = await computeRecordHash({ id: '1', cv: 0.05 });
    const withHash = await computeRecordHash({ id: '1', cv: 0.05, _hash: 'whatever', _integrityFailed: true });
    expect(bare).toBe(withHash);
  });
});
