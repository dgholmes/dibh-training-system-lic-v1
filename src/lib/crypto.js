/**
 * AES-256-GCM encryption via Web Crypto API — MFDS DC-01, DC-03
 *
 * Key strategy: a random 256-bit installation key, unique per installation, imported once at
 * startup and cached in memory as a non-extractable CryptoKey. Where the key itself lives at
 * rest is secureKey.js's concern: on Android it is sealed by a hardware-backed Android
 * Keystore key and only the ciphertext reaches localStorage.
 */

import { loadOrCreateInstallKey } from './secureKey.js';
import { secDbg } from './securityDebug.js';

let _key = null; // in-memory CryptoKey cache
let _lastKeyProvenance = null; // { mode, migrated, securityLevel } — for audit logging

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

/**
 * Called once in main.jsx before React mounts.
 *
 * The raw key bytes come from secureKey.js, which on Android keeps them sealed by a
 * hardware-backed Android Keystore KEK and never writes them to disk in the clear
 * (MFDS DC-03). They are imported as a non-extractable CryptoKey and the local copy is
 * zeroed, so the plaintext key exists only transiently in memory.
 *
 * Throws if a previously wrapped key cannot be recovered — see secureKey.js for why
 * re-keying on failure would be worse than failing to start.
 *
 * @returns {Promise<{ mode: string, migrated: boolean, securityLevel: string }>} how the
 *          key was protected, for audit logging by the caller.
 */
export async function initCrypto() {
  if (_key) return _lastKeyProvenance;

  const { key: raw, mode, migrated, securityLevel } = await loadOrCreateInstallKey();
  _key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
  // The CryptoKey now holds the material; drop our own plaintext copy.
  raw.fill(0);

  _lastKeyProvenance = { mode, migrated, securityLevel };
  secDbg('DC-01', 'AES-256-GCM 설치 키 로드 — Installation Key Loaded', {
    설명: '256비트 AES-GCM 키를 로드했습니다. 환자 PII 암호화에 사용되며, 키는 메모리에만 유지되고 외부로 추출 불가합니다.',
    description: 'Loaded the 256-bit AES-GCM installation key used to encrypt patient PII. Key stays in memory only — not extractable.',
    algorithm: 'AES-GCM',
    key_length_bits: 256,
    extractable: false,
    key_storage_mode: mode,
    kek_security_level: securityLevel,
    legacy_key_migrated: migrated,
  });
  return _lastKeyProvenance;
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
  secDbg('DC-01', 'AES-256-GCM 암호화 수행 — Encrypt', {
    설명: '환자 PII(이름·생년월일·담당의사명)를 AES-256-GCM으로 암호화합니다. 매 암호화마다 새로운 랜덤 IV가 생성됩니다.',
    description: 'Encrypts patient PII (name, DOB, doctor) using AES-256-GCM. A fresh random IV is generated for every operation.',
    algorithm: 'AES-256-GCM',
    iv_hex: ivHex,
    iv_length_bits: 96,
    plaintext_length_bytes: new TextEncoder().encode(plaintext).length,
    ciphertext_length_bytes: ciphertext.byteLength,
    output_format: 'enc:<ivHex>:<ciphertextHex>',
    note: '매 암호화마다 새 랜덤 IV 생성 — 평문·키 미포함 | Fresh random IV per op — plaintext & key not logged',
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
  secDbg('DC-01', 'AES-256-GCM 복호화 수행 — Decrypt', {
    설명: '암호화된 환자 PII를 복호화합니다. GCM 인증 태그 검증으로 데이터 변조 여부를 자동 확인합니다.',
    description: 'Decrypts encrypted patient PII. GCM authentication tag verification automatically detects any tampering.',
    algorithm: 'AES-256-GCM',
    iv_hex: ivHex,
    ciphertext_length_bytes: hexDecode(ciphertextHex).length,
    status: '성공 — GCM 인증 태그 검증 완료 (변조 없음) | success — GCM auth tag verified (no tampering)',
    note: '복호화된 평문 미포함 — Plaintext not logged',
  });
  return new TextDecoder().decode(plaintext);
}

/**
 * Encrypt raw bytes (e.g. breathing data file BLOBs) with AES-256-GCM.
 * Returns a single Uint8Array: [12-byte IV][ciphertext] — compact for BLOB storage,
 * unlike encryptValue()'s hex-string format which is meant for JSON/localStorage values.
 */
export async function encryptBytes(bytes) {
  if (!_key) throw new Error('[crypto] Not initialised — call initCrypto() first');
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _key, data);
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.length);
  secDbg('DC-01', 'AES-256-GCM 암호화 수행 — Encrypt (파일 BLOB)', {
    설명: '호흡 데이터 파일(CSV/VXP) 원본 바이트를 AES-256-GCM으로 암호화합니다. 매 암호화마다 새로운 랜덤 IV가 생성됩니다.',
    description: 'Encrypts breathing data file (CSV/VXP) raw bytes using AES-256-GCM. A fresh random IV is generated for every operation.',
    algorithm: 'AES-256-GCM',
    plaintext_length_bytes: data.byteLength,
    ciphertext_length_bytes: result.byteLength,
    output_format: '[12-byte IV][ciphertext]',
    note: '매 암호화마다 새 랜덤 IV 생성 — 평문·키 미포함 | Fresh random IV per op — plaintext & key not logged',
  });
  return result;
}

/** Decrypt bytes produced by encryptBytes(). Returns an ArrayBuffer of the original plaintext. */
export async function decryptBytes(bytes) {
  if (!_key) throw new Error('[crypto] Not initialised — call initCrypto() first');
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _key, ciphertext);
  secDbg('DC-01', 'AES-256-GCM 복호화 수행 — Decrypt (파일 BLOB)', {
    설명: '암호화된 호흡 데이터 파일을 복호화합니다. GCM 인증 태그 검증으로 데이터 변조 여부를 자동 확인합니다.',
    description: 'Decrypts encrypted breathing data file. GCM authentication tag verification automatically detects any tampering.',
    algorithm: 'AES-256-GCM',
    ciphertext_length_bytes: ciphertext.byteLength,
    status: '성공 — GCM 인증 태그 검증 완료 (변조 없음) | success — GCM auth tag verified (no tampering)',
    note: '복호화된 평문 미포함 — Plaintext not logged',
  });
  return plaintext;
}

/**
 * Compute SHA-256 hex digest of an ArrayBuffer — used for file integrity (SI-04).
 * @param {ArrayBuffer} buffer
 * @param {{ quiet?: boolean }} [options] - pass `quiet: true` to suppress the per-call
 *   secDbg audit trail entry (e.g. bulk verification loops that would otherwise spam
 *   thousands of console groups for a single logical operation).
 */
export async function sha256Hex(buffer, { quiet = false } = {}) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hash = hexEncode(digest);
  if (!quiet) {
    secDbg('SI-04', 'SHA-256 무결성 해시 계산 — Integrity Hash', {
      설명: '파일의 SHA-256 해시값을 계산합니다. 호흡 데이터 파일 무결성 검증 및 앱 번들 변조 탐지에 사용됩니다.',
      description: 'Computes SHA-256 hash of a file. Used for breathing data file integrity and app bundle tamper detection.',
      algorithm: 'SHA-256',
      input_length_bytes: buffer.byteLength,
      hash_hex: hash,
      hash_length_bits: 256,
    });
  }
  return hash;
}

/** Deterministic JSON.stringify — sorts object keys recursively so field order never affects the output. */
export function stableStringify(obj) {
  const sortValue = (value) => {
    if (Array.isArray(value)) return value.map(sortValue);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((acc, key) => {
        acc[key] = sortValue(value[key]);
        return acc;
      }, {});
    }
    return value;
  };
  return JSON.stringify(sortValue(obj));
}

/**
 * Compute a SHA-256 integrity hash over a record's content (order-independent).
 * Excludes `_hash`/`_integrityFailed` so hashing an already-hashed/flagged record
 * is idempotent — used for tamper detection on plaintext localStorage records
 * (training sessions, calibrations) that don't need encryption, only integrity.
 */
export async function computeRecordHash(record) {
  const rest = { ...record };
  delete rest._hash;
  delete rest._integrityFailed;
  const json = stableStringify(rest);
  return sha256Hex(new TextEncoder().encode(json).buffer);
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

// ── User account metadata helpers ────────────────────────────────────────────

const USER_META_FIELDS = ['role', 'mustChangePassword', 'failedAttempts', 'lockedUntil', 'lockoutTicksRemaining'];

/**
 * Separate the sensitive user-account fields (role, lockout state) from the
 * rest of the record and encrypt them into an `_enc` blob. `username`/`displayName`/
 * `id`/`passwordHash`/`salt`/timestamps stay plaintext — needed for synchronous
 * username lookup and admin-list display; the password is already one-way hashed
 * separately (PBKDF2-SHA256), so it isn't part of this encrypted blob.
 */
export async function encryptUserMeta(user) {
  // `_decryptionFailed` is a derived read-time flag produced by decryptUserMeta()'s
  // fallback path — never real data. Persisting it would permanently fail-close the
  // account (loginUser rejects any record carrying it), so strip it before writing.
  // eslint-disable-next-line no-unused-vars
  const { _decryptionFailed, ...cleanUser } = user;
  // The record's `id` is sealed inside the ciphertext so the blob is bound to this
  // specific user. Copying another user's `_enc` onto this record then fails the
  // id check in decryptUserMeta() instead of silently granting that user's role.
  const meta = { id: cleanUser.id };
  const rest = {};
  for (const [k, v] of Object.entries(cleanUser)) {
    if (USER_META_FIELDS.includes(k)) meta[k] = v ?? null;
    else rest[k] = v;
  }
  rest._enc = await encryptValue(JSON.stringify(meta));
  return rest;
}

/**
 * Decrypt the `_enc` blob and merge the user metadata fields back into the
 * record. Handles legacy unencrypted records (no `_enc`) transparently. If
 * decryption fails (e.g. install key changed), returns safe defaults instead
 * of throwing, so login/account management never crashes on one bad record.
 */
export async function decryptUserMeta(raw) {
  if (!raw) return raw;
  if (!raw._enc) return raw; // legacy record — metadata already in plain fields
  try {
    const metaJson = await decryptValue(raw._enc);
    const meta = JSON.parse(metaJson);
    // Ciphertext is bound to its record: a blob lifted from another user decrypts
    // cleanly (same install key, valid GCM tag) but carries the wrong id — treat
    // that as a decryption failure so the swap can never grant the other's role.
    if (meta.id !== raw.id) throw new Error('[crypto] user _enc id mismatch — record may have been swapped');
    // eslint-disable-next-line no-unused-vars
    const { id: _metaId, ...restMeta } = meta;
    // eslint-disable-next-line no-unused-vars
    const { _enc, ...rest } = raw;
    return { ...rest, ...restMeta };
  } catch {
    console.warn('[crypto] decryptUserMeta: decryption failed for user', raw.id,
      '— install key may have changed. Clear localStorage to reset.');
    // eslint-disable-next-line no-unused-vars
    const { _enc, ...rest } = raw;
    return {
      ...rest,
      role: 'clinician',
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
      lockoutTicksRemaining: 0,
      _decryptionFailed: true,
    };
  }
}
