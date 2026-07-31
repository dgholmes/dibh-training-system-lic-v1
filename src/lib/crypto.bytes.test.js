import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('encryptBytes / decryptBytes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createMockLocalStorage());
  });

  it('round-trips arbitrary bytes back to the original plaintext', async () => {
    const { initCrypto, encryptBytes, decryptBytes } = await import('./crypto.js');
    await initCrypto();
    const original = new TextEncoder().encode('t,raw,filtered,dy\n0,1.2,1.1,0.01\n');
    const encrypted = await encryptBytes(original);
    const decrypted = await decryptBytes(encrypted);
    expect(new Uint8Array(decrypted)).toEqual(original);
  });

  it('prefixes ciphertext with a 12-byte IV and does not leave plaintext visible', async () => {
    const { initCrypto, encryptBytes } = await import('./crypto.js');
    await initCrypto();
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    const encrypted = await encryptBytes(original);
    expect(encrypted.byteLength).toBeGreaterThan(original.byteLength + 12); // IV + ciphertext + GCM tag
    expect(encrypted.slice(12, 12 + original.length)).not.toEqual(original);
  });

  it('rejects tampered ciphertext via GCM authentication failure', async () => {
    const { initCrypto, encryptBytes, decryptBytes } = await import('./crypto.js');
    await initCrypto();
    const original = new TextEncoder().encode('sensitive breathing waveform data');
    const encrypted = await encryptBytes(original);
    const tampered = new Uint8Array(encrypted);
    tampered[tampered.length - 1] ^= 0xff; // flip last byte of the ciphertext/auth tag
    await expect(decryptBytes(tampered)).rejects.toThrow();
  });

  it('uses a fresh random IV on every call — no IV reuse across encryptions', async () => {
    const { initCrypto, encryptBytes } = await import('./crypto.js');
    await initCrypto();
    const original = new Uint8Array([9, 9, 9]);
    const a = await encryptBytes(original);
    const b = await encryptBytes(original);
    expect(a.slice(0, 12)).not.toEqual(b.slice(0, 12));
  });
});
