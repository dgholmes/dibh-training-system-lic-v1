import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('audit log hash-chain', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createMockLocalStorage());
    vi.stubGlobal('sessionStorage', createMockLocalStorage());
  });

  it('produces a valid chain across sequential writes', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { writeAuditLog, verifyAuditChain } = await import('./auditStore.js');
    await writeAuditLog({ action: 'LOGIN' });
    await writeAuditLog({ action: 'LOGOUT' });
    await writeAuditLog({ action: 'LOGIN' });

    const result = await verifyAuditChain();
    expect(result).toEqual({ valid: true, checkedCount: 3, brokenAtIndex: null, brokenAtId: null });
  });

  it('detects a mutated entry as a broken chain', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { writeAuditLog, verifyAuditChain } = await import('./auditStore.js');
    await writeAuditLog({ action: 'LOGIN' });
    await writeAuditLog({ action: 'LOGOUT' });

    const log = JSON.parse(localStorage.getItem('dibh_audit_log'));
    log[0].detail = 'tampered';
    localStorage.setItem('dibh_audit_log', JSON.stringify(log));

    const result = await verifyAuditChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAtIndex).toBe(0);
  });

  it('detects a deleted entry (reordering) as a broken chain', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { writeAuditLog, verifyAuditChain } = await import('./auditStore.js');
    await writeAuditLog({ action: 'LOGIN' });
    await writeAuditLog({ action: 'LOGOUT' });
    await writeAuditLog({ action: 'LOGIN' });

    const log = JSON.parse(localStorage.getItem('dibh_audit_log'));
    log.splice(1, 1); // remove the middle entry
    localStorage.setItem('dibh_audit_log', JSON.stringify(log));

    const result = await verifyAuditChain();
    expect(result.valid).toBe(false);
  });

  it('treats legacy no-hash entries as valid/unverified and does not count them as broken', async () => {
    localStorage.setItem('dibh_audit_log', JSON.stringify([
      { id: 'legacy-1', action: 'LOGIN', timestamp: '2025-01-01T00:00:00.000Z' },
      { id: 'legacy-2', action: 'LOGOUT', timestamp: '2025-01-01T00:01:00.000Z' },
    ]));
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { verifyAuditChain } = await import('./auditStore.js');
    const result = await verifyAuditChain();
    expect(result).toEqual({ valid: true, checkedCount: 0, brokenAtIndex: null, brokenAtId: null });
  });
});
