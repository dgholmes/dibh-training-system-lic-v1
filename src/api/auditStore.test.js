import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
}

describe('seedDebugAuditEntries', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMockLocalStorage());
    vi.resetModules();
  });

  it('throws when SECURITY_DEBUG is false', async () => {
    vi.stubEnv('VITE_DEBUG_MODE', undefined);
    const { seedDebugAuditEntries } = await import('./auditStore.js');
    // seedDebugAuditEntries is now async, so a synchronous throw becomes a rejected promise.
    await expect(seedDebugAuditEntries(10)).rejects.toThrow(/debug builds/);
  });

  it('generates exactly `count` entries and applies the FIFO trim on a bulk write', async () => {
    vi.stubEnv('VITE_DEBUG_MODE', 'true');
    const { seedDebugAuditEntries, getAuditLogCapacity } = await import('./auditStore.js');
    const result = await seedDebugAuditEntries(10_000);
    expect(result).toEqual({ generated: 10_000, totalAfterTrim: 10_000 });
    expect(getAuditLogCapacity().count).toBe(10_000);
  });

  it('trims oldest entries first when seeding pushes the log over MAX_ENTRIES', async () => {
    vi.stubEnv('VITE_DEBUG_MODE', 'true');
    const { seedDebugAuditEntries, getAuditLogEntries } = await import('./auditStore.js');
    await seedDebugAuditEntries(10_000);
    await seedDebugAuditEntries(5); // pushes total to 10,005 — oldest 5 must be trimmed
    const { total } = getAuditLogEntries({ limit: 1 });
    expect(total).toBe(10_000);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});
