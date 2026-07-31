# B4+B5 — Expand Backup Scope + Move Export to Capacitor Filesystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the encrypted backup actually comprehensive (accounts, calibration sessions, and breathing-file BLOBs, not just 4 of ~8 storage keys), and save it to a well-defined, retrievable location instead of relying on browser download behavior.

**Architecture:** `sqliteDb.js` gains two small exported helpers to export/import the entire SQLite binary as base64. `AdminBackup.jsx`'s `createBackup()`/`restoreBackup()` are extended with a versioned format (`_backup_format_version`) so old 4-key backups keep restoring correctly. Export switches from `Blob` + `<a download>` to `@capacitor/filesystem` writing to `Directory.Documents`.

**Tech Stack:** React 18, sql.js (already a dependency), `@capacitor/filesystem` (new dependency), Vitest 3.

## Global Constraints

- `_version` field in the backup payload holds the **app** version (`__APP_VERSION__`) — must not be repurposed. Format versioning uses a separate `_backup_format_version` field.
- Legacy (v1, 4-key) backups must continue to restore without error on the updated app — no forced migration, no breaking change to existing backup files.
- Whole-SQLite-blob inclusion (not a reconstructed breathing-files-only subset) — locked decision, do not build selective export.
- Save location: `Directory.Documents` — locked decision, do not use app-private `Directory.Data`.
- No jsdom/WASM-in-tests — this project's Vitest config runs in `node` environment with SQLite/WASM mocked at the module boundary (matches existing `analyzeFiles.integration.test.js` convention of `vi.mock('@/api/breathingFileRepository', ...)`). Do not attempt to load real sql.js WASM inside a Vitest test.

---

### Task 1: `sqliteDb.js` — export/import the whole DB as base64

**Files:**
- Modify: `src/db/sqliteDb.js` (add exports after `persistDb`, around line 113)
- Test: `src/db/sqliteDb.base64.test.js` (new)

**Interfaces:**
- Produces: `exportDbBinaryBase64(): Promise<string>`, `importDbBinaryBase64(base64: string): Promise<void>` — consumed by Task 2 (`AdminBackup.jsx`).
- Produces (test-only, not part of the public API used elsewhere): `bytesToBase64(bytes: Uint8Array): string`, `base64ToBytes(base64: string): Uint8Array` — exported so their chunking behavior can be unit-tested without loading real sql.js WASM.

- [ ] **Step 1: Write the failing test (pure byte/base64 conversion only — no WASM)**

```js
// src/db/sqliteDb.base64.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/db/sqliteDb.base64.test.js`
Expected: FAIL — `bytesToBase64`/`base64ToBytes` are not exported yet.

- [ ] **Step 3: Write minimal implementation**

Add to `src/db/sqliteDb.js`, after the `persistDb` function (around line 113), before `getSqliteDatabase`:

```js
const CHUNK_SIZE = 8192; // avoids spreading a large Uint8Array into String.fromCharCode's arguments

export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Exports the entire SQLite DB (all tables) as a base64 string, for inclusion in an encrypted backup. */
export async function exportDbBinaryBase64() {
  const db = await getSqliteDatabase();
  return bytesToBase64(db.export());
}

/**
 * Imports a base64-encoded SQLite DB binary, replacing the current IndexedDB-persisted DB.
 * Validates the blob is a loadable SQLite DB before committing (throws on corrupt/invalid input).
 * Does NOT reconcile the in-memory getSqliteDatabase() singleton — callers must instruct the
 * user to refresh the page (same pattern already used for localStorage-based restore), which
 * resets all JS module state including the cached dbPromise.
 */
export async function importDbBinaryBase64(base64) {
  await getSqliteDatabase(); // ensures SQLModule is initialized
  const bytes = base64ToBytes(base64);
  new SQLModule.Database(bytes); // throws if corrupt/invalid — caller catches
  await saveDbBinary(bytes);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/db/sqliteDb.base64.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Manual verification of the WASM-backed round trip (not automated — see Global Constraints)**

Run: `npm run dev`, log in, upload a breathing-data file for a patient (exercises real sql.js). In the browser devtools console, run:
```js
const mod = await import('/src/db/sqliteDb.js');
const b64 = await mod.exportDbBinaryBase64();
console.log(b64.length); // should be a large base64 string, not empty
await mod.importDbBinaryBase64(b64);
console.log('import succeeded');
```
Confirm no errors and the app still functions after a page refresh.

- [ ] **Step 6: Commit**

```bash
git add src/db/sqliteDb.js src/db/sqliteDb.base64.test.js
git commit -m "feat: add whole-DB base64 export/import helpers to sqliteDb"
```

---

### Task 2: Expand `AdminBackup.jsx` backup format (versioned, backward-compatible)

**Files:**
- Modify: `src/pages/AdminBackup.jsx:1-14` (imports), `:45` (`BACKUP_KEYS`), `:70-103` (`createBackup`/`restoreBackup` — export them)
- Test: `src/pages/AdminBackup.test.js` (new)

**Interfaces:**
- Consumes: `exportDbBinaryBase64`, `importDbBinaryBase64` from Task 1.
- Produces: `createBackup(): Promise<string>`, `restoreBackup(encryptedText: string): Promise<{created_at, version}>` — exported (previously private) so Task's own tests and any future caller can exercise them directly.

- [ ] **Step 1: Write the failing test**

```js
// src/pages/AdminBackup.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/db/sqliteDb', () => ({
  exportDbBinaryBase64: vi.fn(async () => 'bW9jay1zcWxpdGUtYmxvYg=='), // "mock-sqlite-blob"
  importDbBinaryBase64: vi.fn(async () => {}),
}));

function createMockLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('createBackup / restoreBackup', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('round-trips all 6 keys plus the SQLite blob through a full backup/restore cycle', async () => {
    vi.stubGlobal('localStorage', createMockLocalStorage({
      dibh_patients: JSON.stringify([{ id: 'p1' }]),
      dibh_calibrations: JSON.stringify([{ id: 'c1' }]),
      dibh_training_sessions: JSON.stringify([]),
      dibh_audit_log: JSON.stringify([{ id: 'a1' }]),
      dibh_users: JSON.stringify([{ id: 'u1' }]),
      dibh_calibration_sessions: JSON.stringify([{ id: 'cs1' }]),
    }));
    const { createBackup, restoreBackup } = await import('./AdminBackup.jsx');
    const encrypted = await createBackup();

    // Wipe storage to prove restore actually repopulates it
    vi.stubGlobal('localStorage', createMockLocalStorage());
    const { restoreBackup: restore2 } = await import('./AdminBackup.jsx');
    await restore2(encrypted);

    expect(JSON.parse(localStorage.getItem('dibh_users'))).toEqual([{ id: 'u1' }]);
    expect(JSON.parse(localStorage.getItem('dibh_calibration_sessions'))).toEqual([{ id: 'cs1' }]);
  });

  it('restores a legacy (v1, 4-key) backup fixture without error, leaving new keys untouched', async () => {
    vi.stubGlobal('localStorage', createMockLocalStorage());
    const { restoreBackup } = await import('./AdminBackup.jsx');
    const { encryptValue, sha256Hex } = await import('@/lib/crypto');

    // Build a legacy-shaped payload by hand (no _backup_format_version, no sqlite blob, no dibh_users/dibh_calibration_sessions)
    const legacyPayload = {
      dibh_patients: [{ id: 'legacy-p1' }],
      dibh_calibrations: [],
      dibh_training_sessions: [],
      dibh_audit_log: [],
      _created_at: '2025-01-01T00:00:00.000Z',
      _version: '1.0.0',
    };
    const json = JSON.stringify(legacyPayload);
    const hash = await sha256Hex(new TextEncoder().encode(json).buffer);
    const envelope = JSON.stringify({ hash, data: json });
    const legacyEncrypted = await encryptValue(envelope);

    const result = await restoreBackup(legacyEncrypted);
    expect(result.version).toBe('1.0.0');
    expect(JSON.parse(localStorage.getItem('dibh_patients'))).toEqual([{ id: 'legacy-p1' }]);
    expect(localStorage.getItem('dibh_users')).toBeNull(); // untouched — legacy backup had no such key
  });

  it('sets _backup_format_version to 2 on newly created backups', async () => {
    vi.stubGlobal('localStorage', createMockLocalStorage());
    const { createBackup } = await import('./AdminBackup.jsx');
    const { decryptValue } = await import('@/lib/crypto');
    const encrypted = await createBackup();
    const envelope = JSON.parse(await decryptValue(encrypted));
    const payload = JSON.parse(envelope.data);
    expect(payload._backup_format_version).toBe(2);
    expect(payload._sqlite_blob_base64).toBe('bW9jay1zcWxpdGUtYmxvYg==');
  });
});
```

**Note:** this test requires `initCrypto()` to have run so `encryptValue`/`decryptValue` have a key. Add a `beforeEach` (or a one-time `beforeAll`) calling `await initCrypto()` from `@/lib/crypto` — confirm against that module's existing test setup pattern if one already exists elsewhere in the codebase; if not, add:

```js
import { initCrypto } from '@/lib/crypto';
beforeEach(async () => {
  vi.stubGlobal('crypto', globalThis.crypto); // Node 18+ exposes Web Crypto globally already; stub only if the test env lacks it
  await initCrypto();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/pages/AdminBackup.test.js`
Expected: FAIL — `createBackup`/`restoreBackup` are not exported yet (currently private functions), and `BACKUP_KEYS` doesn't include the new keys.

- [ ] **Step 3: Write minimal implementation**

Add the import at the top of `src/pages/AdminBackup.jsx`:

```js
import { exportDbBinaryBase64, importDbBinaryBase64 } from '@/db/sqliteDb';
```

Replace line 45:

```js
// Before:
const BACKUP_KEYS = ['dibh_patients', 'dibh_calibrations', 'dibh_training_sessions', 'dibh_audit_log'];

// After:
const BACKUP_KEYS = ['dibh_patients', 'dibh_calibrations', 'dibh_training_sessions', 'dibh_audit_log', 'dibh_users', 'dibh_calibration_sessions'];
const BACKUP_FORMAT_VERSION = 2;
```

Replace `createBackup`/`restoreBackup` (currently unexported, lines 70-103) with exported versions:

```js
export async function createBackup() {
  const payload = {};
  for (const key of BACKUP_KEYS) {
    const raw = localStorage.getItem(key);
    payload[key] = raw ? JSON.parse(raw) : [];
  }
  payload._created_at = new Date().toISOString();
  payload._version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
  payload._backup_format_version = BACKUP_FORMAT_VERSION;
  payload._sqlite_blob_base64 = await exportDbBinaryBase64();

  const json = JSON.stringify(payload);
  const hash = await sha256Hex(new TextEncoder().encode(json).buffer);
  const envelope = JSON.stringify({ hash, data: json });
  const encrypted = await encryptValue(envelope);
  return encrypted;
}

export async function restoreBackup(encryptedText) {
  const envelopeJson = await decryptValue(encryptedText.trim());
  const envelope = JSON.parse(envelopeJson);
  const { hash, data } = envelope;

  const actualHash = await sha256Hex(new TextEncoder().encode(data).buffer);
  if (actualHash !== hash) {
    throw new Error('백업 파일의 무결성 검증에 실패했습니다. 파일이 손상되었거나 변조되었습니다.');
  }

  const payload = JSON.parse(data);
  for (const key of BACKUP_KEYS) {
    if (Array.isArray(payload[key])) {
      localStorage.setItem(key, JSON.stringify(payload[key]));
    }
  }
  if (payload._backup_format_version >= 2 && payload._sqlite_blob_base64) {
    await importDbBinaryBase64(payload._sqlite_blob_base64);
  }
  return { created_at: payload._created_at, version: payload._version };
}
```

(Legacy v1 backups have no `dibh_users`/`dibh_calibration_sessions` keys and no `_backup_format_version`/`_sqlite_blob_base64` fields — the `Array.isArray(payload[key])` guard already skips missing JSON keys safely, and the `payload._backup_format_version >= 2` check skips the SQLite import entirely for v1 backups. No new branching needed beyond what's shown above.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/pages/AdminBackup.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/AdminBackup.jsx src/pages/AdminBackup.test.js
git commit -m "feat: expand backup to cover accounts, sessions, and SQLite data (v2 format)"
```

---

### Task 3: Move export to `@capacitor/filesystem`

**Files:**
- Modify: `package.json` (new dependency)
- Modify: `src/pages/AdminBackup.jsx:1-14` (imports), `:111-157` (`handleExport`, `handleDeidentifiedExport`)

**Interfaces:**
- Consumes: `createBackup`, `createDeidentifiedCsv`, `decryptPatient` (existing, unchanged) from within the same file.

- [ ] **Step 1: Install the dependency**

Run: `npm install @capacitor/filesystem`

(Let npm resolve the correct version compatible with the project's `@capacitor/core@^8.3.1` — do not hand-write a guessed version string into `package.json`.)

- [ ] **Step 2: Run `npx cap sync android` to register the native plugin**

Run: `npx cap sync android`
Expected: output confirms `@capacitor/filesystem` was found and synced into the Android project.

- [ ] **Step 3: Replace the export handlers**

Add the import at the top of `src/pages/AdminBackup.jsx`:

```js
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
```

Replace `handleExport` (lines 111-131):

```js
const handleExport = async () => {
  setExporting(true);
  setStatus(null);
  try {
    const encrypted = await createBackup();
    const fileName = `dibh-backup-${format(new Date(), 'yyyyMMdd-HHmmss')}.enc`;
    await Filesystem.writeFile({
      path: fileName,
      data: encrypted,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    tryWriteAuditLog({ action: AUDIT_ACTIONS.BACKUP_CREATED, targetType: 'system', detail: `암호화된 백업 생성됨: ${fileName}` });
    setStatus({ type: 'success', message: `백업 파일이 생성되었습니다. (기기 내 Documents/${fileName})` });
  } catch (err) {
    console.error('[AdminBackup] export failed:', err);
    setStatus({ type: 'error', message: '백업 생성에 실패했습니다.' });
  } finally {
    setExporting(false);
  }
};
```

Replace `handleDeidentifiedExport` (lines 133-157):

```js
const handleDeidentifiedExport = async () => {
  setDeidentifying(true);
  setStatus(null);
  try {
    const patients = JSON.parse(localStorage.getItem('dibh_patients') || '[]');
    const calibrations = JSON.parse(localStorage.getItem('dibh_calibrations') || '[]');
    const decrypted = await Promise.all(patients.map(decryptPatient));
    const csv = await createDeidentifiedCsv(decrypted, calibrations);
    const fileName = `dibh-deidentified-${format(new Date(), 'yyyyMMdd')}.csv`;
    await Filesystem.writeFile({
      path: fileName,
      data: '﻿' + csv, // BOM for Excel UTF-8 compatibility, matches prior Blob-based behavior
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    tryWriteAuditLog({ action: AUDIT_ACTIONS.DEIDENTIFIED_EXPORT, targetType: 'system', detail: `${decrypted.length}명 비식별 내보내기: ${fileName}` });
    setStatus({ type: 'success', message: `비식별 데이터가 내보내졌습니다 (${decrypted.length}명, 기기 내 Documents/${fileName}). 이름·생년월일은 포함되지 않습니다.` });
  } catch (err) {
    console.error('[AdminBackup] de-identified export failed:', err);
    setStatus({ type: 'error', message: '비식별 내보내기에 실패했습니다.' });
  } finally {
    setDeidentifying(false);
  }
};
```

Restore (`handleImport`) is unchanged — it already uses `<input type="file">`, which can browse to any accessible location including the new `Directory.Documents` path.

- [ ] **Step 4: Manual verification (requires a real Android build — Filesystem plugin has no meaningful behavior in the Vite dev server/browser preview)**

Run: `npm run cap:build && npx cap open android`, run the app on a device/emulator, log in as admin, go to `/admin/backup`, click "백업 파일 생성". Confirm the success message appears. Connect the device to a PC (or use Android Studio's Device File Explorer) and confirm the `.enc` file exists at `Android/data/com.thepict.dibhtraining/files/Documents/`. Repeat for "비식별 CSV 내보내기" and confirm the `.csv` file appears alongside it and opens correctly in a spreadsheet app (BOM renders Korean text correctly).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/pages/AdminBackup.jsx android/
git commit -m "feat: save backup/CSV exports via Capacitor Filesystem to Directory.Documents"
```

---

### Task 4: Documentation updates

**Files:**
- Modify: `docs/submission/section8-시험기준-준수명세.md` (RA-02 section — confirm exact heading before editing)
- Modify: `docs/submission/사이버보안-준수명세서-작성내용.md` (DC-03 / storage path section — confirm exact heading before editing)

**Interfaces:** None (documentation-only task).

- [ ] **Step 1: Correct the RA-02 "전체 백업" claim**

Update RA-02's description to reflect the now-accurate scope: patient records, calibrations, training sessions, audit log, user accounts, calibration sessions, and breathing-file BLOBs (via the SQLite export) are all included in an encrypted backup — this is now genuinely comprehensive, closing the overclaim identified in `docs/submission/ktc-review-2026-07-14.md` §2.

- [ ] **Step 2: Add the backup file's on-device retrieval path to the DC-03 storage-path table**

Add a row/note: backup files are saved to `Android/data/com.thepict.dibhtraining/files/Documents/` on the device (via `@capacitor/filesystem`, `Directory.Documents`), retrievable via a file manager app or by connecting the tablet to a PC over USB — satisfying the email's explicit request for exact storage paths/filenames.

- [ ] **Step 3: Commit**

```bash
git add docs/submission/section8-시험기준-준수명세.md docs/submission/사이버보안-준수명세서-작성내용.md
git commit -m "docs: correct RA-02 backup scope claim and document backup file retrieval path"
```

---

## Plan Self-Review

**Spec coverage:** Whole-SQLite-blob export/import (Task 1) ✓, versioned backward-compatible backup format + expanded keys (Task 2) ✓, `@capacitor/filesystem` + `Directory.Documents` (Task 3) ✓, doc corrections (Task 4) ✓.

**Placeholder scan:** No TBD/TODO. All code blocks complete. One caveat flagged explicitly rather than hidden: Task 2's test note about `initCrypto()` setup depends on confirming the existing test environment's Web Crypto availability — this is a legitimate unresolved detail (not a placeholder), called out for the implementer to verify against `src/lib/crypto.js`'s own test setup (if any) before writing the test.

**Type consistency:** `exportDbBinaryBase64(): Promise<string>` / `importDbBinaryBase64(base64: string): Promise<void>` signatures match between Task 1's implementation and Task 2's `createBackup`/`restoreBackup` call sites exactly. `BACKUP_KEYS` array is defined once (Task 2) and referenced consistently in both `createBackup` and `restoreBackup`. `_backup_format_version` (not `_version`, which is reserved for app version) used consistently.

**Sequencing note:** Task 3 depends on Task 2 being complete (it calls the now-exported `createBackup`), and Task 2 depends on Task 1 (`exportDbBinaryBase64`/`importDbBinaryBase64` must exist before `AdminBackup.jsx` can import them). Tasks must be executed in order 1 → 2 → 3 → 4.
