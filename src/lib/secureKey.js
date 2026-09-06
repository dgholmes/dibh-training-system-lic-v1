/**
 * MFDS DC-03 — installation key storage.
 *
 * The 256-bit AES-GCM installation key (the DEK) encrypts all patient PII. Prior to this
 * module the DEK itself was written to localStorage as plaintext hex, in the same store as
 * the data it protects, which the KTC assessment correctly identified as defeating the
 * purpose of the encryption.
 *
 * The DEK is now sealed with a key-encryption key (KEK) that lives inside the Android
 * Keystore — hardware-backed (TEE, or StrongBox where present) on real devices. localStorage
 * holds only the wrapped blob under `dibh_install_key_v2`; the KEK cannot be exported from
 * the Keystore by this app or by a rooted shell, so the wrapped blob is worthless off-device.
 *
 * Platform behaviour:
 *   - Android (the certified target): wrapped by the native SecureKey plugin.
 *   - Browser (development only, not a certified deployment target): the Web Crypto API has
 *     no equivalent hardware store, so the key stays as it was. `getKeyStorageMode()` reports
 *     which path is in use, and the caller records it in the audit log.
 *
 * Failure policy is fail-closed. If the wrapped blob exists but cannot be unwrapped, this
 * module throws rather than minting a replacement DEK: a fresh key would leave every stored
 * record undecryptable while the app appeared to start normally.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

import { secDbg } from './securityDebug.js';

/** Legacy plaintext-hex key. Read once for migration, then deleted. */
export const LEGACY_KEY_STORAGE = 'dibh_install_key';
/** Base64 of [12-byte IV][ciphertext||tag], produced by the Android Keystore KEK. */
export const WRAPPED_KEY_STORAGE = 'dibh_install_key_v2';

// Registered on first use rather than at import time: the test suite re-imports this module
// under vi.resetModules(), and Capacitor warns (loudly) when the same plugin name is
// registered twice in one runtime.
let _plugin = null;
function plugin() {
  if (!_plugin) _plugin = registerPlugin('SecureKey');
  return _plugin;
}

/** Set by loadOrCreateInstallKey() so the caller can audit-log how the key was protected. */
let keyStorageMode = 'uninitialised';

export function getKeyStorageMode() {
  return keyStorageMode;
}

/** Android is the only platform with a hardware key store available to us. */
function isNativeAndroid() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Returns the raw 32-byte installation key, creating or migrating it as required.
 *
 * @returns {Promise<{ key: Uint8Array, mode: string, migrated: boolean, securityLevel: string }>}
 * @throws when a wrapped key exists but cannot be unwrapped (fail-closed — never re-keys).
 */
export async function loadOrCreateInstallKey() {
  const wrapped = localStorage.getItem(WRAPPED_KEY_STORAGE);
  const legacyHex = localStorage.getItem(LEGACY_KEY_STORAGE);

  if (!isNativeAndroid()) {
    // Browser/dev path — no hardware store exists. Behaviour is unchanged from before.
    keyStorageMode = 'localStorage-plaintext';
    let hex = legacyHex;
    let created = false;
    if (!hex) {
      const raw = new Uint8Array(32);
      crypto.getRandomValues(raw);
      hex = bytesToHex(raw);
      localStorage.setItem(LEGACY_KEY_STORAGE, hex);
      created = true;
    }
    secDbg('DC-03', '설치 키 로드 (브라우저) — Install Key Loaded (browser)', {
      설명: '브라우저 환경에는 하드웨어 키 저장소가 없어 기존 방식을 유지합니다. 인증 대상 플랫폼은 Android입니다.',
      description: 'No hardware key store exists in a browser; the certified platform is Android.',
      storage: `localStorage (${LEGACY_KEY_STORAGE})`,
      status: created ? 'new key generated' : 'existing key loaded',
    });
    return { key: hexToBytes(hex), mode: keyStorageMode, migrated: false, securityLevel: 'software' };
  }

  const info = await plugin().getKeyInfo().catch(() => ({ available: false, securityLevel: 'unavailable' }));
  if (!info.available) {
    throw new Error(
      '[secureKey] Android Keystore is unavailable — refusing to store the installation key in plaintext',
    );
  }

  // 1. Normal path: a wrapped key already exists.
  if (wrapped) {
    let unwrappedB64;
    try {
      ({ data: unwrappedB64 } = await plugin().unwrap({ wrapped }));
    } catch (e) {
      // Fail closed: a new key here would orphan every encrypted record on the device.
      throw new Error(
        `[secureKey] Stored key could not be unwrapped (${e?.code || e?.message || e}). ` +
          'Patient data cannot be decrypted on this device.',
      );
    }
    keyStorageMode = 'android-keystore';
    secDbg('DC-03', '설치 키 복호화 (Android Keystore) — Install Key Unwrapped', {
      설명: 'Android Keystore의 하드웨어 보호 키로 설치 키를 복호화했습니다. 평문 키는 저장소에 존재하지 않습니다.',
      description: 'Unwrapped the installation key with the hardware-backed Keystore KEK. No plaintext key is stored.',
      kek_security_level: info.securityLevel,
      storage: `localStorage (${WRAPPED_KEY_STORAGE}, ciphertext only)`,
    });
    return {
      key: base64ToBytes(unwrappedB64),
      mode: keyStorageMode,
      migrated: false,
      securityLevel: info.securityLevel,
    };
  }

  // 2. Migration path: an existing plaintext key is wrapped in place, then the plaintext
  //    copy is deleted. The key value itself is preserved, so existing data stays readable.
  if (legacyHex) {
    const raw = hexToBytes(legacyHex);
    const { wrapped: newWrapped } = await plugin().wrap({ data: bytesToBase64(raw) });
    localStorage.setItem(WRAPPED_KEY_STORAGE, newWrapped);
    // Only remove the plaintext once the wrapped copy is safely persisted.
    //
    // Overwrite before deleting so the newest record for this key holds no key material.
    // The WebView's LevelDB store is append-only, so the original bytes can still sit in
    // its log until LevelDB compacts; this makes the live value harmless immediately and
    // the on-disk remnant disappear at compaction. A fresh install never writes the key
    // in the clear at all. Reaching those remnants requires root or a debuggable build —
    // neither applies to a signed release APK.
    localStorage.setItem(LEGACY_KEY_STORAGE, '0'.repeat(legacyHex.length));
    localStorage.removeItem(LEGACY_KEY_STORAGE);
    keyStorageMode = 'android-keystore';
    secDbg('DC-03', '평문 설치 키 마이그레이션 — Legacy Key Migrated', {
      설명: '기존 평문 설치 키를 Android Keystore 키로 봉인하고 평문 사본을 삭제했습니다. 기존 암호화 데이터는 그대로 복호화됩니다.',
      description: 'Sealed the existing plaintext key with the Keystore KEK and deleted the plaintext copy.',
      kek_security_level: info.securityLevel,
    });
    return { key: raw, mode: keyStorageMode, migrated: true, securityLevel: info.securityLevel };
  }

  // 3. First run: generate, wrap, and store only the wrapped form.
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const { wrapped: newWrapped } = await plugin().wrap({ data: bytesToBase64(raw) });
  localStorage.setItem(WRAPPED_KEY_STORAGE, newWrapped);
  keyStorageMode = 'android-keystore';
  secDbg('DC-03', '설치 키 신규 생성 — Install Key Created', {
    설명: '256비트 설치 키를 생성하여 Android Keystore 키로 봉인 후 저장했습니다. 평문 키는 디스크에 기록되지 않습니다.',
    description: 'Generated a 256-bit installation key, sealed it with the Keystore KEK, and stored only the ciphertext.',
    kek_security_level: info.securityLevel,
  });
  return { key: raw, mode: keyStorageMode, migrated: false, securityLevel: info.securityLevel };
}
