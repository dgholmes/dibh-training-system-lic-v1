# B4+B5 — Expand Backup Scope + Move Export to Capacitor Filesystem — Design Spec

**Date:** 2026-07-14
**Scope:** `AdminBackup.jsx` currently backs up only 4 of ~8 localStorage keys and excludes all SQLite/IndexedDB content (breathing-file BLOBs); export also relies on a browser `<a download>` anchor rather than a controlled native save path. This spec expands backup coverage and moves the save mechanism to `@capacitor/filesystem`.
**Related:** `docs/submission/ktc-review-2026-07-14.md` §2 ("전체 백업" overclaim)
**Decisions locked in with user:** whole-SQLite-blob inclusion (not selective breathing_files-only export); save to `Directory.Documents`.

---

## Background

Current `BACKUP_KEYS` (`src/pages/AdminBackup.jsx:45`): `['dibh_patients', 'dibh_calibrations', 'dibh_training_sessions', 'dibh_audit_log']`.

Missing: `dibh_users` (accounts), `dibh_calibration_sessions` (in-progress sessions), and the entire SQLite/IndexedDB store (`dibh_app`/`sqlite`, holding `breathing_files` BLOBs + the `patients` mirror table). RA-02 currently claims "전체 백업" (full backup), which is not accurate today.

Export currently uses `Blob` + `<a download>`, relying on WebView download handling rather than an explicit, verifiable save location — `@capacitor/filesystem` is not installed.

## Design

### 1. Backup format — versioned, backward-compatible

Add a new field distinct from the existing `_version` (which holds the **app** version, e.g. `"1.1.4"` — must not be repurposed, existing restore UI displays it):

```js
payload._backup_format_version = 2; // new field; absent or 1 = legacy 4-key format
```

`restoreBackup()` logic:
- Always restore the original 4 JSON keys (unchanged behavior — old backups keep working).
- If `_backup_format_version >= 2`: additionally restore `dibh_users`, `dibh_calibration_sessions`, and the SQLite blob.
- A legacy (v1) backup restored on a v2-aware app simply skips the new fields (they're absent) — no error, no data loss, matches existing "additive" restore pattern (`if (Array.isArray(payload[key]))` guard already skips missing keys).

### 2. New backup keys

Add to `BACKUP_KEYS`: `dibh_users`, `dibh_calibration_sessions`. Same JSON-array treatment as existing keys — no special handling needed (accounts contain PBKDF2 hashes + random salts, never plaintext passwords, and are protected by the same AES-256-GCM backup envelope as everything else).

### 3. SQLite/breathing-file inclusion

Per locked decision: include the **entire SQLite export blob**, not a reconstructed subset.

`src/db/sqliteDb.js` — add two small exported helpers (currently `saveDbBinary`/`loadDbBinary` are private):

```js
const CHUNK_SIZE = 8192; // avoids spreading a large Uint8Array into String.fromCharCode's arguments

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

export async function exportDbBinaryBase64() {
  const db = await getSqliteDatabase();
  return bytesToBase64(db.export());
}

export async function importDbBinaryBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Sanity-check it's a valid SQLite DB before committing, using the already-loaded SQLModule
  new SQLModule.Database(bytes); // throws if corrupt/invalid — caught by caller
  await saveDbBinary(bytes);
}
```

**Self-review note:** spreading a full `Uint8Array` into `String.fromCharCode(...bytes)` in one call risks exceeding the JS engine's argument-count limit once breathing-file BLOBs accumulate across multiple patients (each capped at 10 files/category, but files can be substantial CSV/VXP text). Chunking in fixed-size blocks avoids this regardless of total DB size.

`createBackup()`: call `exportDbBinaryBase64()`, store as `payload._sqlite_blob_base64`.
`restoreBackup()`: if `_backup_format_version >= 2` and `_sqlite_blob_base64` present, call `importDbBinaryBase64(...)`.

**Restore reconciliation:** the SQLite module keeps an in-memory singleton (`dbPromise` in `sqliteDb.js`) that would go stale if IndexedDB is overwritten underneath it. The existing restore flow already surfaces "새로고침하면 변경사항이 반영됩니다" (refresh to apply changes) for the localStorage keys — a full page reload also resets the JS module state, so this is consistent with the existing UX pattern. No additional reconciliation logic needed; the existing refresh instruction now also covers the SQLite data.

**Size note:** breathing files are capped at 10 per patient per category (existing limit in `breathingFileRepository.js`), and CSV/VXP files are small text data, so the base64-inflated blob should stay well within a reasonable backup-file size for the expected patient volumes. No pagination/streaming needed for this data profile.

### 4. Capacitor Filesystem for export

Add `@capacitor/filesystem` dependency (new native dependency — requires `npx cap sync android` and an Android rebuild).

`handleExport()`/`handleDeidentifiedExport()`: replace the `Blob` + `<a download>` + `URL.createObjectURL` pattern with:

```js
import { Filesystem, Directory } from '@capacitor/filesystem';

await Filesystem.writeFile({
  path: `dibh-backup-${format(new Date(), 'yyyyMMdd-HHmmss')}.enc`,
  data: encrypted, // base64 or UTF-8 string per plugin requirements — confirm encoding in implementation
  directory: Directory.Documents,
  encoding: 'utf8',
});
```

Per locked decision, `Directory.Documents` — this maps to the app's own external-files "Documents" subdirectory (`Android/data/com.thepict.dibhtraining/files/Documents/` on-device), retrievable via a file manager app or by connecting the tablet to a PC over USB, without requiring `MANAGE_EXTERNAL_STORAGE` or other broad runtime permissions (Android scoped-storage rules already permit an app to write its own external-files directory). This matches the existing manual-USB-transfer workflow already described in the compliance doc, so no new operational process is introduced — just a well-defined location instead of relying on WebView download behavior.

Show the resolved path/filename in the success status message so the admin knows exactly where to retrieve the file (currently the success message is generic — extend it to include the save location).

Restore (`handleImport`) is unaffected — it already uses a plain `<input type="file">` picker, which can browse to any accessible location including `Directory.Documents`, so no change needed there.

### 5. Documentation updates (paired with this code change)

- RA-02 in the compliance doc: update from "전체 백업" (overclaim) to an accurate description now that it actually *is* comprehensive (accounts, sessions, calibrations, audit log, and breathing-file BLOBs all included) — this code change directly resolves that overclaim rather than requiring a doc-only correction.
- Note the backup file's on-device retrieval path (`Android/data/com.thepict.dibhtraining/files/Documents/`) in the DC-03/backup section per the email's explicit request for exact storage paths/filenames.

## Testing

- Vitest: `createBackup()`/`restoreBackup()` round-trip with the expanded key set + a small mock SQLite blob; verify `_backup_format_version` is set to `2` on new backups.
- Vitest: restoring a **legacy (v1) backup fixture** (only the original 4 keys, no `_backup_format_version`) still succeeds and doesn't error on the missing new fields.
- Vitest: `importDbBinaryBase64` rejects/throws on a corrupt blob rather than silently committing bad data.
- Manual: export on a real Android build, confirm the `.enc` file is retrievable at the documented path via USB/file manager; restore it on a fresh install; confirm breathing files, accounts, and calibration sessions all come back.
