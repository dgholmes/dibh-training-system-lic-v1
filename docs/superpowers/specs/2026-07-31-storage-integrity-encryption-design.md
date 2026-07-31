# Storage integrity & encryption fixes — design

**Date:** 2026-07-31
**Origin:** KTC reviewer (박훈재) HWP memos #8–#10, catalogued in `docs/submission/ktc-review-2026-07-14.md` §0, matching the "5.2 저장데이터" table review comments:

| Row in 5.2 표 | Comment | Requirement |
|---|---|---|
| 훈련 세션 정보, 캘리브레이션 결과 | 무결성 보장 필수 | Integrity (hash) only — encryption not required |
| 사용자 계정 메타데이터 (역할·잠금 상태 등) | 암호화 필수 | Encryption only |
| 감사 로그 (최대 10,000건, 추가 전용) | 무결성 보장 필수 | Integrity — hash-chain fits the append-only structure and doubles as UC-07 non-repudiation evidence |

None of these three items are addressed by the two 2026-07-16 Q&A docs (`cybersecurity-review-qa-encryption-storage-2026-07-16.md`, `cybersecurity-review-qa-backup-integrity-2026-07-16.md`), which answer different DC-03/backup questions. `dibh_users`, `dibh_training_sessions`, `dibh_calibrations`, and `dibh_audit_log` are still plaintext with no tamper detection as of this design.

---

## 1. Training session & calibration integrity

**Goal:** detect tampering with `dibh_training_sessions` / `dibh_calibrations` localStorage entries. Encryption is explicitly not required for these two data types.

- `src/lib/crypto.js`: add `computeRecordHash(record)` — strips `_hash`/`_integrityFailed` from the record, serializes with stable (sorted) key order so field-order changes don't produce false mismatches, and returns `sha256Hex()` of the UTF-8 bytes.
- `src/api/localStore.js`:
  - `TrainingSession.create`/`update` and `Calibration.create`/`update` compute and store `_hash` on the record before writing to localStorage.
  - `TrainingSession.list`/`filter`/`get` and `Calibration.list`/`filter`/`get` recompute the hash for each record read and compare to the stored `_hash`:
    - Missing `_hash` (pre-existing/legacy record) → returned as-is, not flagged, not counted as tampered.
    - Present but mismatched → the returned record gets `_integrityFailed: true`, and `tryWriteAuditLog` is called once per detection with a new `DATA_INTEGRITY_FAILED` action (`src/api/auditStore.js` `AUDIT_ACTIONS`).
    - Matching → returned as-is, hash field kept internal (UI does not need to render `_hash`).
- `CalibrationSession` (in-progress/ephemeral, always deleted on completion) is out of scope — it's not a data type the reviewer flagged and isn't meaningfully "at rest".
- Consuming pages (`PatientDashboard.jsx`, `TrainingHistory` view, `CalibrationReport` view) are not required to change behavior for this design — flagging is best-effort visibility, not a blocking gate. If time permits, a small tamper-warning badge can be added where these records render, but that's not a hard requirement of this fix.

## 2. User account metadata encryption

**Goal:** encrypt `role`, lockout state, and `mustChangePassword` in `dibh_users`. Username/displayName/id/passwordHash/salt/timestamps stay plaintext — they're needed for synchronous username lookup and admin-list display, and the password is already one-way hashed (separate MFDS requirement, already satisfied).

- `src/lib/crypto.js`: add `encryptUserMeta(user)` / `decryptUserMeta(user)` mirroring the existing `encryptPatient`/`decryptPatient` pattern.
  - `ENCRYPTED_USER_FIELDS = ['role', 'mustChangePassword', 'failedAttempts', 'lockedUntil', 'lockoutTicksRemaining']`
  - Encrypt: pull those fields into a plain object, `JSON.stringify` + `encryptValue()` into `_enc`; everything else stays at the top level of the record.
  - Decrypt: if no `_enc`, return record as-is (legacy plaintext record). On decrypt failure (key mismatch), same defensive fallback as `decryptPatient` — return the record with safe defaults (`role: 'clinician'`, `mustChangePassword: false`, lockout fields cleared) and `_decryptionFailed: true`, logged via `console.warn`. A user record that fails to decrypt must never crash login or the accounts page.
- `src/api/authStore.js` — every place that reads or writes these fields becomes async:
  - `loadUsers()` stays synchronous (returns raw/encrypted records). Add `async function decryptUsers(raw)` = `Promise.all(raw.map(decryptUserMeta))`.
  - The heartbeat `setInterval` callback becomes `async`: decrypt all users, decrement `lockoutTicksRemaining` for locked ones, re-encrypt only the changed records, write back.
  - `ensureDefaultAdmin()`: encrypt the metadata fields before the initial `saveUsers()` call.
  - `loginUser()`: after finding the user by username (plaintext field, still sync-findable), decrypt that one user's metadata before checking lockout/role, and re-encrypt before `saveUsers()` on every branch that mutates `failedAttempts`/`lockedUntil`/`lockoutTicksRemaining`.
  - `UserStore.create/unlock/setRole` — encrypt metadata before save.
  - `UserStore.list()` becomes `async`, decrypting all records (still strips `passwordHash`/`salt`).
- `src/pages/AdminAccounts.jsx`: `reload()` becomes `async () => setUsers(await UserStore.list())`; call sites (`useEffect`, post-action reloads) awaited or `.then()`-chained as appropriate.
- `src/pages/Login.jsx`: no field-shape change expected (`UserStore.changePassword` doesn't touch the encrypted fields), but verify no direct property access on raw (un-decrypted) user objects exists there.

## 3. Audit log hash-chain

**Goal:** make any reordering, deletion, or edit of `dibh_audit_log` entries detectable, and provide visible verification evidence for the reviewer (also serves memo #11's "증적" ask).

- `src/api/auditStore.js`:
  - `writeAuditLog()` becomes `async` (it must call `sha256Hex`, which is inherently async via `crypto.subtle.digest`). Its only caller is `tryWriteAuditLog()` in the same file, which becomes `async` too and does `await writeAuditLog(params)` inside its existing try/catch. None of `tryWriteAuditLog`'s ~30+ call sites across the app currently await its return value or use it — they're fire-and-forget by design (audit logging must never block or fail the calling action), so making both functions async is a safe, isolated change with no call-site edits required elsewhere.
  - After building `entry`, set `entry.prevHash` = the previous entry's `hash` if the log is non-empty and the last entry has a `hash`; otherwise a fixed genesis constant `GENESIS_HASH = '0'.repeat(64)`. Compute `entry.hash = await sha256Hex(new TextEncoder().encode(stableStringify(entry) + entry.prevHash))`, where `stableStringify` sorts keys (same helper/approach as `computeRecordHash` in §1 — factor into one shared util in `crypto.js` if convenient).
  - New `export async function verifyAuditChain()`: loads the full log, walks entries in order, skips any legacy entries before the first one that has a `hash`, then for each subsequent entry recomputes the expected hash from its content + the previous entry's actual stored `hash` and compares. Returns `{ valid: boolean, checkedCount, brokenAtIndex, brokenAtId }` (`brokenAtIndex`/`brokenAtId` are `null` when valid).
  - `seedDebugAuditEntries()` (debug-only bulk seeding, structurally excluded from production builds via the `SECURITY_DEBUG` guard) stays chain-exempt — it bulk-writes without hashes, same as today. This is acceptable because it can never run in a production build, so it can never be presented as evidence of a real audit trail.
- `src/pages/AdminAuditLog.jsx`: add a compact integrity status row above or near the existing capacity indicator — "체인 무결성: 정상" (green) or "체인 무결성 손상 — 항목 #N" (red/warning), with a manual "지금 검증" button that calls `verifyAuditChain()` on click (not on every render, to avoid re-hashing 10,000 entries automatically).

## Testing

Follow the existing Vitest conventions (`node` environment, fixture-based, `vi.mock`/`vi.mocked`):

- `computeRecordHash`: same input → same hash; changed field → different hash; key-order independence.
- `encryptUserMeta`/`decryptUserMeta`: round-trip; legacy (no `_enc`) passthrough; corrupted `_enc` → safe-default fallback, no throw.
- Audit chain: sequential writes produce a valid chain; mutating a stored entry's `detail` after the fact is caught by `verifyAuditChain()`; legacy (no-hash) entries don't count as broken.
- `TrainingSession`/`Calibration` integrity: create → hash stored; mutate raw localStorage value → `list()`/`get()` returns `_integrityFailed: true` and logs `DATA_INTEGRITY_FAILED`.

## Explicitly out of scope

- Breathing file BLOB encryption (already implemented separately, uncommitted in the working tree — unrelated to these three reviewer items per `ktc-review-2026-07-14.md`'s own note that BLOB encryption was not requested by this review).
- `CalibrationSession` (ephemeral, deleted on completion).
- Any change to backup file format (`AdminBackup.jsx`) — encrypting user metadata happens before the record enters the backup `BACKUP_KEYS` payload, so backups automatically carry the already-encrypted form; no backup-code changes anticipated, but verify this assumption during implementation.
