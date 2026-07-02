/**
 * AES-256-GCM encryption via Web Crypto API — MFDS DC-01, DC-03
 *
 * Key strategy: random 256-bit installation key stored in localStorage.
 * Different per installation; protects against casual localStorage inspection.
 * Key is imported once at app startup and cached in memory.
 */

import { secDbg } from './securityDebug.js';

const INSTALL_KEY_STORAGE = 'dibh_install_key';

let _key = null; // in-memory CryptoKey cache

function hexEncode(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexDecode(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Called once in main.jsx before React mounts. */
export async function initCrypto() {
  if (_key) return;
  let keyHex = localStorage.getItem(INSTALL_KEY_STORAGE);
  const isNew = !keyHex;
  if (isNew) {
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    keyHex = hexEncode(raw.buffer);
    localStorage.setItem(INSTALL_KEY_STORAGE, keyHex);
  }
  _key = await crypto.subtle.importKey(
    'raw',
    hexDecode(keyHex),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  secDbg('DC-01', 'AES-256-GCM Installation Key Loaded', {
    status: isNew ? 'new key generated and stored' : 'existing key loaded from localStorage',
    algorithm: 'AES-GCM',
    key_length_bits: 256,
    extractable: false,
    storage: 'localStorage (dibh_install_key)',
  });
}

/** Encrypt a string. Returns `enc:<ivHex>:<ciphertextHex>`. */
export async function encryptValue(plaintext) {
  if (!_key) throw new Error('[crypto] Not initialised — call initCrypto() first');
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _key, enc.encode(plaintext));
  const ivHex = hexEncode(iv.buffer);
  const result = `enc:${ivHex}:${hexEncode(ciphertext)}`;
  secDbg('DC-01', 'AES-256-GCM Encrypt', {
    algorithm: 'AES-256-GCM',
    iv_hex: ivHex,
    iv_length_bits: 96,
    plaintext_length_bytes: new TextEncoder().encode(plaintext).length,
    ciphertext_length_bytes: ciphertext.byteLength,
    output_format: 'enc:<ivHex>:<ciphertextHex>',
    note: 'Fresh random IV generated per operation — plaintext and key not logged',
  });
  return result;
}

/**
 * Decrypt a value produced by encryptValue().
 * Returns the original plaintext. If the value does not start with `enc:`,
 * it is treated as a legacy plaintext value and returned unchanged.
 */
export async function decryptValue(value) {
  if (!value) return value;
  // Trim any CRLF/whitespace that Windows or browsers may append to downloaded text files
  const trimmed = String(value).trim();
  if (!trimmed.startsWith('enc:')) return value;
  if (!_key) throw new Error('[crypto] Not initialised — call initCrypto() first');

  // Format: enc:<24 hex chars IV>:<ciphertext hex>
  // Extract by fixed position — avoids split(':') being confused by any stray characters
  const IV_HEX_LEN = 24; // 12 bytes * 2
  const ivHex = trimmed.slice(4, 4 + IV_HEX_LEN);
  const ciphertextHex = trimmed.slice(4 + IV_HEX_LEN + 1); // skip trailing ':'

  if (ivHex.length !== IV_HEX_LEN || !ciphertextHex) {
    throw new Error('[crypto] Malformed encrypted value');
  }

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: hexDecode(ivHex) },
    _key,
    hexDecode(ciphertextHex)
  );
  secDbg('DC-01', 'AES-256-GCM Decrypt', {
    algorithm: 'AES-256-GCM',
    iv_hex: ivHex,
    ciphertext_length_bytes: hexDecode(ciphertextHex).length,
    status: 'success — GCM authentication tag verified',
    note: 'Plaintext not logged',
  });
  return new TextDecoder().decode(plaintext);
}

/** Compute SHA-256 hex digest of an ArrayBuffer — used for file integrity (SI-04). */
export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hash = hexEncode(digest);
  secDbg('SI-04', 'SHA-256 Integrity Hash', {
    algorithm: 'SHA-256',
    input_length_bytes: buffer.byteLength,
    hash_hex: hash,
    hash_length_bits: 256,
  });
  return hash;
}

// ── Patient PII helpers ───────────────────────────────────────────────────────

const PII_FIELDS = ['name', 'birth_date', 'assigned_doctor_name'];

/**
 * Separate PII from non-PII, encrypt PII into `_enc` blob.
 * Returns the record ready for localStorage storage.
 */
export async function encryptPatient(data) {
  const pii = {};
  const rest = {};
  for (const [k, v] of Object.entries(data)) {
    if (PII_FIELDS.includes(k)) pii[k] = v ?? '';
    else rest[k] = v;
  }
  rest._enc = await encryptValue(JSON.stringify(pii));
  return rest;
}

/**
 * Decrypt `_enc` blob and merge PII fields back into the record.
 * Handles legacy unencrypted records (no `_enc` field) transparently.
 * If decryption fails (e.g. install key changed), returns the record with
 * placeholder PII rather than crashing the entire app.
 */
export async function decryptPatient(raw) {
  if (!raw) return raw;
  if (!raw._enc) return raw; // legacy record — PII already in plain fields
  try {
    const piiJson = await decryptValue(raw._enc);
    const pii = JSON.parse(piiJson);
    const { _enc, ...rest } = raw;
    return { ...rest, ...pii };
  } catch (err) {
    // Key mismatch (e.g. install key was regenerated) — return record with
    // empty PII so the app keeps working; warn in console for diagnostics.
    console.warn('[crypto] decryptPatient: decryption failed for record', raw.id,
      '— install key may have changed. Clear localStorage to reset.');
    const { _enc, ...rest } = raw;
    return {
      ...rest,
      name: '[복호화 실패]',
      birth_date: '',
      assigned_doctor_name: '',
      _decryptionFailed: true,
    };
  }
}
