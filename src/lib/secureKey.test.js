/**
 * MFDS DC-03 — installation key storage.
 *
 * These cover the properties the KTC finding turns on: the plaintext key must disappear from
 * localStorage on Android, its *value* must survive migration (otherwise existing patient
 * records become unreadable), and an unwrap failure must abort rather than quietly re-key.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEK = 0x5a; // stand-in "hardware" KEK: XOR is enough to prove wrap/unwrap round-trips

/** In-memory localStorage stub (tests run in the node environment). */
function installLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i) => [...store.keys()][i] ?? null,
  });
  return store;
}

/**
 * Replaces @capacitor/core so the module believes it is on Android and routes wrap/unwrap
 * through a fake "Keystore". `overrides` lets a test make a specific call fail.
 */
function mockCapacitor(overrides = {}) {
  const calls = { wrap: 0, unwrap: 0, getKeyInfo: 0 };
  const impl = {
    getKeyInfo: async () => {
      calls.getKeyInfo += 1;
      return { available: true, alias: 'dibh_kek_v1', securityLevel: 'hardware' };
    },
    wrap: async ({ data }) => {
      calls.wrap += 1;
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0)).map((b) => b ^ KEK);
      return { wrapped: btoa(String.fromCharCode(...bytes)) };
    },
    unwrap: async ({ wrapped }) => {
      calls.unwrap += 1;
      const bytes = Uint8Array.from(atob(wrapped), (c) => c.charCodeAt(0)).map((b) => b ^ KEK);
      return { data: btoa(String.fromCharCode(...bytes)) };
    },
    ...overrides,
  };

  vi.doMock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
    registerPlugin: () => impl,
  }));
  return calls;
}

const HEX32 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

const toHex = (bytes) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.doUnmock('@capacitor/core');
});

describe('DC-03 — installation key on Android', () => {
  it('creates a wrapped key on first run and never writes the plaintext key', async () => {
    const store = installLocalStorage();
    mockCapacitor();
    const { loadOrCreateInstallKey, LEGACY_KEY_STORAGE, WRAPPED_KEY_STORAGE } = await import('./secureKey.js');

    const { key, mode, migrated, securityLevel } = await loadOrCreateInstallKey();

    expect(key).toHaveLength(32);
    expect(mode).toBe('android-keystore');
    expect(migrated).toBe(false);
    expect(securityLevel).toBe('hardware');
    expect(store.has(LEGACY_KEY_STORAGE)).toBe(false);
    expect(store.get(WRAPPED_KEY_STORAGE)).toBeTruthy();
    // What lands on disk must not be the key itself.
    expect(store.get(WRAPPED_KEY_STORAGE)).not.toContain(toB64(key));
  });

  it('migrates a legacy plaintext key, preserving its value and deleting the plaintext', async () => {
    const store = installLocalStorage({ dibh_install_key: HEX32 });
    mockCapacitor();
    const { loadOrCreateInstallKey, LEGACY_KEY_STORAGE, WRAPPED_KEY_STORAGE } = await import('./secureKey.js');

    const { key, migrated } = await loadOrCreateInstallKey();

    expect(migrated).toBe(true);
    // Value preserved — existing encrypted records must stay decryptable.
    expect(toHex(key)).toBe(HEX32);
    expect(store.has(LEGACY_KEY_STORAGE)).toBe(false);
    expect(store.get(WRAPPED_KEY_STORAGE)).toBeTruthy();
  });

  it('overwrites the legacy value before deleting it, so the live record holds no key', async () => {
    const writes = [];
    const store = installLocalStorage({ dibh_install_key: HEX32 });
    const realSet = localStorage.setItem;
    vi.stubGlobal('localStorage', {
      ...localStorage,
      setItem: (k, v) => {
        writes.push([k, v]);
        return realSet.call(localStorage, k, v);
      },
    });
    mockCapacitor();
    const { loadOrCreateInstallKey, LEGACY_KEY_STORAGE } = await import('./secureKey.js');

    await loadOrCreateInstallKey();

    const legacyWrites = writes.filter(([k]) => k === LEGACY_KEY_STORAGE);
    expect(legacyWrites).toHaveLength(1);
    expect(legacyWrites[0][1]).toBe('0'.repeat(64));
    expect(legacyWrites[0][1]).not.toBe(HEX32);
    expect(store.has(LEGACY_KEY_STORAGE)).toBe(false);
  });

  it('round-trips: a key stored by one run is returned unchanged by the next', async () => {
    const store = installLocalStorage();
    mockCapacitor();

    const first = await import('./secureKey.js').then((m) => m.loadOrCreateInstallKey());

    vi.resetModules();
    mockCapacitor();
    const second = await import('./secureKey.js').then((m) => m.loadOrCreateInstallKey());

    expect(toHex(second.key)).toBe(toHex(first.key));
    expect(second.migrated).toBe(false);
    expect(store.size).toBe(1); // only the wrapped blob
  });

  it('fails closed when the wrapped key cannot be unwrapped, instead of re-keying', async () => {
    const store = installLocalStorage({ dibh_install_key_v2: 'AAAA' });
    mockCapacitor({
      unwrap: async () => {
        const err = new Error('the Keystore key was invalidated');
        err.code = 'KEK_INVALIDATED';
        throw err;
      },
    });
    const { loadOrCreateInstallKey, WRAPPED_KEY_STORAGE } = await import('./secureKey.js');

    await expect(loadOrCreateInstallKey()).rejects.toThrow(/KEK_INVALIDATED/);
    // The unreadable blob must be left untouched — overwriting it would destroy any
    // chance of recovery and silently orphan every encrypted record.
    expect(store.get(WRAPPED_KEY_STORAGE)).toBe('AAAA');
  });

  it('refuses to fall back to plaintext when the Keystore is unavailable', async () => {
    const store = installLocalStorage();
    mockCapacitor({ getKeyInfo: async () => ({ available: false, securityLevel: 'unavailable' }) });
    const { loadOrCreateInstallKey, LEGACY_KEY_STORAGE } = await import('./secureKey.js');

    await expect(loadOrCreateInstallKey()).rejects.toThrow(/Keystore is unavailable/);
    expect(store.has(LEGACY_KEY_STORAGE)).toBe(false);
  });

  it('does not re-wrap on every start — the Keystore is used once per launch', async () => {
    installLocalStorage({ dibh_install_key: HEX32 });
    const calls = mockCapacitor();
    const { loadOrCreateInstallKey } = await import('./secureKey.js');

    await loadOrCreateInstallKey();
    expect(calls.wrap).toBe(1);
    expect(calls.unwrap).toBe(0);
  });
});

describe('DC-03 — browser fallback (development only)', () => {
  it('keeps the previous localStorage behaviour when not running on Android', async () => {
    const store = installLocalStorage();
    // No @capacitor/core mock: Capacitor reports a web platform.
    const { loadOrCreateInstallKey, LEGACY_KEY_STORAGE } = await import('./secureKey.js');

    const { key, mode } = await loadOrCreateInstallKey();

    expect(key).toHaveLength(32);
    expect(mode).toBe('localStorage-plaintext');
    expect(store.get(LEGACY_KEY_STORAGE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reuses an existing browser key rather than generating a new one', async () => {
    installLocalStorage({ dibh_install_key: HEX32 });
    const { loadOrCreateInstallKey } = await import('./secureKey.js');

    const { key } = await loadOrCreateInstallKey();

    expect(toHex(key)).toBe(HEX32);
  });
});
