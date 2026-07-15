import { describe, it, expect } from 'vitest';
import { bytesToBase64, base64ToBytes } from './sqliteDb.js';

describe('bytesToBase64 / base64ToBytes', () => {
  it('round-trips a small byte array', () => {
    const original = new Uint8Array([0, 1, 2, 255, 128, 64]);
    const encoded = bytesToBase64(original);
    const decoded = base64ToBytes(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('round-trips a byte array larger than the chunk size (8192)', () => {
    const original = new Uint8Array(20_000);
    for (let i = 0; i < original.length; i++) original[i] = i % 256;
    const encoded = bytesToBase64(original);
    const decoded = base64ToBytes(encoded);
    expect(decoded.length).toBe(original.length);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('round-trips an empty byte array', () => {
    const encoded = bytesToBase64(new Uint8Array(0));
    expect(base64ToBytes(encoded).length).toBe(0);
  });
});
