# Storage Integrity & Encryption Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three KTC reviewer gaps on the DIBH training system's storage table — SHA-256 integrity hashing for training-session/calibration records, AES-256-GCM encryption of user-account metadata (role, lockout state), and a hash-chain for the append-only audit log — per `docs/superpowers/specs/2026-07-31-storage-integrity-encryption-design.md`.

**Architecture:** Each fix reuses the existing `crypto.js` primitives (`sha256Hex`, `encryptValue`/`decryptValue`) via new small helpers, following the same pattern the codebase already uses for patient PII (`encryptPatient`/`decryptPatient`). Fix 1 and Fix 3 are additive (new fields, no shape change to existing consumers beyond an added flag). Fix 2 converts several previously-synchronous `authStore.js`/`UserStore` functions to `async` because reading/writing encrypted fields requires `await`ing Web Crypto — this ripples into the one page (`AdminAccounts.jsx`) that calls them.

**Tech Stack:** Web Crypto API (AES-256-GCM, SHA-256, PBKDF2) via the existing `src/lib/crypto.js`; Vitest (`node` environment) for tests; React + `@tanstack/react-query` for the two touched pages.

## Global Constraints

- Encryption: AES-256-GCM only, via the existing `encryptValue`/`decryptValue` in `src/lib/crypto.js` — do not introduce a second crypto library or key scheme.
- Hashing: SHA-256 only, via the existing `sha256Hex` in `src/lib/crypto.js`.
- Legacy records (missing `_hash` / `_enc` / chain `hash` field) must be treated as unverified, never as tampered — mirrors the existing fallback in `decryptPatient`.
- All new user-facing strings are Korean, matching the existing UI's tone (see `AdminAuditLog.jsx`, `AdminAccounts.jsx` for examples).
- Tests run in Vitest's `node` environment (see `vite.config.js` `test.environment: 'node'`) — no DOM APIs. Stub `localStorage`/`sessionStorage` with `vi.stubGlobal` and call `vi.resetModules()` in `beforeEach` (crypto.js/authStore.js/auditStore.js all hold module-level state: the crypto key cache, the login-lockout heartbeat interval, and in-memory maps).
- Path alias `@` resolves to `src/` (see existing imports for the exact convention).
- Do not touch the already-uncommitted breathing-file BLOB encryption work (`encryptBytes`/`decryptBytes` in `crypto.js`, their use in `breathingFileRepository.js`) — unrelated to these three reviewer items.
- No speculative abstractions: implement exactly the fields/flows named below, nothing extra.

---

### Task 1: `computeRecordHash` + `stableStringify` in crypto.js

**Files:**
- Modify: `src/lib/crypto.js`
- Test: `src/lib/crypto.recordHash.test.js` (create)

**Interfaces:**
- Produces: `export function stableStringify(obj): string`, `export async function computeRecordHash(record): Promise<string>` (both from `src/lib/crypto.js`) — used by Task 2 (`localStore.js`) and Task 6 (`auditStore.js`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/crypto.recordHash.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('computeRecordHash', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createMockLocalStorage());
  });

  it('produces the same hash for the same content regardless of key order', async () => {
    const { initCrypto, computeRecordHash } = await import('./crypto.js');
    await initCrypto();
    const a = await computeRecordHash({ id: '1', cv: 0.05, training_type: 'A' });
    const b = await computeRecordHash({ training_type: 'A', id: '1', cv: 0.05 });
    expect(a).toBe(b);
  });

  it('produces a different hash when a field value changes', async () => {
    const { initCrypto, computeRecordHash } = await import('./crypto.js');
    await initCrypto();
    const a = await computeRecordHash({ id: '1', cv: 0.05 });
    const b = await computeRecordHash({ id: '1', cv: 0.06 });
    expect(a).not.toBe(b);
  });

  it('ignores _hash and _integrityFailed fields already present on the record', async () => {
    const { initCrypto, computeRecordHash } = await import('./crypto.js');
    await initCrypto();
    const bare = await computeRecordHash({ id: '1', cv: 0.05 });
    const withHash = await computeRecordHash({ id: '1', cv: 0.05, _hash: 'whatever', _integrityFailed: true });
    expect(bare).toBe(withHash);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- crypto.recordHash`
Expected: FAIL — `computeRecordHash` is not exported from `./crypto.js`.

- [ ] **Step 3: Implement `stableStringify` and `computeRecordHash`**

In `src/lib/crypto.js`, add after `sha256Hex` (after the closing `}` of that function, before the `// ── Patient PII helpers ──` section):

```js
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
  const { _hash, _integrityFailed, ...rest } = record;
  const json = stableStringify(rest);
  return sha256Hex(new TextEncoder().encode(json).buffer);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- crypto.recordHash`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto.js src/lib/crypto.recordHash.test.js
git commit -m "feat: add computeRecordHash/stableStringify for record integrity hashing"
```

---

### Task 2: Integrity hashing for TrainingSession & Calibration records

**Files:**
- Modify: `src/api/auditStore.js` (add `DATA_INTEGRITY_FAILED` action)
- Modify: `src/api/localStore.js` (`TrainingSession`, `Calibration`, `CalibrationSession.complete`)
- Modify: `src/pages/TrainingHistory.jsx`, `src/pages/TypeDecision.jsx`, `src/pages/TrainingReport.jsx` (adapt to `Calibration.filter`/`get` now returning a Promise where the result was previously used synchronously)
- Test: `src/api/localStore.integrity.test.js` (create)

**Interfaces:**
- Consumes: `computeRecordHash(record): Promise<string>` from Task 1 (`@/lib/crypto`).
- Produces: `TrainingSession.list/filter/get/create/update` and `Calibration.list/filter/get/create/update` are now `async` and return records that may carry `_integrityFailed: true`. `AUDIT_ACTIONS.DATA_INTEGRITY_FAILED` is a new string constant `'DATA_INTEGRITY_FAILED'`.

- [ ] **Step 1: Write the failing test**

Create `src/api/localStore.integrity.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('TrainingSession / Calibration integrity hashing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createMockLocalStorage());
  });

  it('TrainingSession.create() stores a _hash that TrainingSession.get() verifies cleanly', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { TrainingSession } = await import('./localStore.js');
    const created = await TrainingSession.create({ patient_id: 'p1', notes: 'first run' });
    expect(created._hash).toBeTruthy();
    const fetched = await TrainingSession.get(created.id);
    expect(fetched._integrityFailed).toBeUndefined();
  });

  it('flags a record and writes DATA_INTEGRITY_FAILED when the stored content is tampered with', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { Calibration } = await import('./localStore.js');
    const { getAuditLogEntries } = await import('./auditStore.js');
    const created = await Calibration.create({ patient_id: 'p1', cv: 0.05, training_type: 'A' });

    const raw = JSON.parse(localStorage.getItem('dibh_calibrations'));
    raw[0].cv = 0.99; // tamper directly in storage, bypassing the API
    localStorage.setItem('dibh_calibrations', JSON.stringify(raw));

    const fetched = await Calibration.get(created.id);
    expect(fetched._integrityFailed).toBe(true);
    const { entries } = getAuditLogEntries({ limit: 10 });
    expect(entries.some((e) => e.action === 'DATA_INTEGRITY_FAILED')).toBe(true);
  });

  it('treats legacy records with no _hash field as unverified, not tampered', async () => {
    vi.stubGlobal('localStorage', createMockLocalStorage({
      dibh_calibrations: JSON.stringify([{ id: 'legacy-1', patient_id: 'p1', cv: 0.05 }]),
    }));
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { Calibration } = await import('./localStore.js');
    const fetched = await Calibration.get('legacy-1');
    expect(fetched._integrityFailed).toBeUndefined();
  });

  it('Calibration.filter() verifies every matched record', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { Calibration } = await import('./localStore.js');
    await Calibration.create({ patient_id: 'p1', cv: 0.05 });
    await Calibration.create({ patient_id: 'p1', cv: 0.06 });
    const results = await Calibration.filter({ patient_id: 'p1' });
    expect(results).toHaveLength(2);
    expect(results.every((r) => !r._integrityFailed)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- localStore.integrity`
Expected: FAIL — `TrainingSession.create`/`Calibration.create`/`get`/`filter` currently return plain (non-Promise) values with no `_hash`, so `await`-ing them resolves immediately without the new fields; the `_hash`/`_integrityFailed`/`DATA_INTEGRITY_FAILED` assertions fail.

- [ ] **Step 3: Add the `DATA_INTEGRITY_FAILED` audit action**

In `src/api/auditStore.js`, inside the `AUDIT_ACTIONS` object, add (after `INTEGRITY_CHECK_FAILED`):

```js
  DATA_INTEGRITY_FAILED: 'DATA_INTEGRITY_FAILED', // stored record hash mismatch detected on read (training session / calibration)
```

- [ ] **Step 4: Rewrite `TrainingSession` and `Calibration` in `src/api/localStore.js`**

Add to the top imports (alongside the existing `encryptPatient, decryptPatient` import):

```js
import { encryptPatient, decryptPatient, computeRecordHash } from '@/lib/crypto';
```

Add this shared helper right before the `export const TrainingSession = {` block:

```js
// Shared integrity-check helper for plaintext (non-PII) record types that only
// need tamper detection, not encryption (training sessions, calibrations).
async function verifyRecord(record, targetType) {
  if (!record) return record;
  if (!record._hash) return record; // legacy record — unverified, not flagged
  const expected = await computeRecordHash(record);
  if (expected === record._hash) return record;
  tryWriteAuditLog({
    action: AUDIT_ACTIONS.DATA_INTEGRITY_FAILED,
    targetType,
    targetId: record.id,
    detail: `${targetType} record hash mismatch — possible tampering`,
  });
  return { ...record, _integrityFailed: true };
}

async function verifyRecords(records, targetType) {
  return Promise.all(records.map((r) => verifyRecord(r, targetType)));
}
```

Replace the entire `TrainingSession` object with:

```js
// TrainingSession entity — SHA-256 integrity-hashed (no encryption required for this data type)
export const TrainingSession = {
  list: async (sortBy = null) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const verified = await verifyRecords(sessions, 'training_session');

    if (sortBy) {
      const isDesc = sortBy.startsWith('-');
      const field = isDesc ? sortBy.substring(1) : sortBy;

      return [...verified].sort((a, b) => {
        const aVal = a[field] || '';
        const bVal = b[field] || '';

        if (isDesc) {
          return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
        } else {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        }
      });
    }

    return verified;
  },

  filter: async (filters) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const verified = await verifyRecords(sessions, 'training_session');

    if (filters.id) {
      return verified.filter(s => s.id === filters.id);
    }

    return verified.filter(session => {
      return Object.keys(filters).every(key => {
        return session[key] === filters[key];
      });
    });
  },

  get: async (id) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const found = sessions.find(s => s.id === id) || null;
    return found ? verifyRecord(found, 'training_session') : null;
  },

  create: async (data) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const newSession = {
      id: generateId(),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    newSession._hash = await computeRecordHash(newSession);
    sessions.push(newSession);
    setStorageItem(STORAGE_KEYS.TRAINING_SESSIONS, sessions);
    return newSession;
  },

  update: async (id, data) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const index = sessions.findIndex(s => s.id === id);

    if (index === -1) {
      throw new Error(`TrainingSession with id ${id} not found`);
    }

    const updated = {
      ...sessions[index],
      ...data,
      updated_at: new Date().toISOString(),
    };
    updated._hash = await computeRecordHash(updated);
    sessions[index] = updated;
    setStorageItem(STORAGE_KEYS.TRAINING_SESSIONS, sessions);
    return sessions[index];
  },

  delete: (id) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const filtered = sessions.filter(s => s.id !== id);
    setStorageItem(STORAGE_KEYS.TRAINING_SESSIONS, filtered);
    return true;
  },
};
```

Replace the entire `Calibration` object with:

```js
// Calibration entity — SHA-256 integrity-hashed (no encryption required for this data type)
export const Calibration = {
  list: async (sortBy = null) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const verified = await verifyRecords(calibrations, 'calibration');

    if (sortBy) {
      const isDesc = sortBy.startsWith('-');
      const field = isDesc ? sortBy.substring(1) : sortBy;

      return [...verified].sort((a, b) => {
        const aVal = a[field] || '';
        const bVal = b[field] || '';

        if (isDesc) {
          return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
        } else {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        }
      });
    }

    return verified;
  },

  filter: async (filters) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const verified = await verifyRecords(calibrations, 'calibration');

    if (filters.id) {
      return verified.filter(c => c.id === filters.id);
    }

    return verified.filter(calibration => {
      return Object.keys(filters).every(key => {
        return calibration[key] === filters[key];
      });
    });
  },

  get: async (id) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const found = calibrations.find(c => c.id === id) || null;
    return found ? verifyRecord(found, 'calibration') : null;
  },

  create: async (data) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const newCalibration = {
      id: generateId(),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    newCalibration._hash = await computeRecordHash(newCalibration);
    calibrations.push(newCalibration);
    setStorageItem(STORAGE_KEYS.CALIBRATIONS, calibrations);
    return newCalibration;
  },

  update: async (id, data) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const index = calibrations.findIndex(c => c.id === id);

    if (index === -1) {
      throw new Error(`Calibration with id ${id} not found`);
    }

    const updated = {
      ...calibrations[index],
      ...data,
      updated_at: new Date().toISOString(),
    };
    updated._hash = await computeRecordHash(updated);
    calibrations[index] = updated;
    setStorageItem(STORAGE_KEYS.CALIBRATIONS, calibrations);
    return calibrations[index];
  },

  delete: (id) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const filtered = calibrations.filter(c => c.id !== id);
    setStorageItem(STORAGE_KEYS.CALIBRATIONS, filtered);
    return true;
  },
};
```

In `CalibrationSession.complete` (same file), change:

```js
    const calibration = Calibration.create({
```

to:

```js
    const calibration = await Calibration.create({
```

- [ ] **Step 5: Update the three page call sites that used `Calibration.filter`/`get` synchronously**

In `src/pages/TrainingHistory.jsx`, change the `calibrations` query:

```js
  const { data: calibrations = [] } = useQuery({
    queryKey: ['calibrations', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      return sortCalibrationsDesc(await Calibration.filter({ patient_id: patientId }));
    },
    enabled: !!patientId,
  });
```

In `src/pages/TypeDecision.jsx`, change the `latestCalibration` query:

```js
  const { data: latestCalibration, isFetched } = useQuery({
    queryKey: ['latestCalibration', patientId],
    queryFn: async () => {
      const calibrations = await Calibration.filter({ patient_id: patientId });
      return getLatestCalibration(calibrations);
    },
    enabled: !!patientId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
```

In `src/pages/TrainingReport.jsx`, change the `calibration` query:

```js
  const { data: calibration } = useQuery({
    queryKey: ['calibrationForReport', patientId, calibrationId],
    queryFn: async () => {
      if (!patientId) return null;
      if (calibrationId) {
        const c = await Calibration.get(calibrationId);
        if (c && c.patient_id === patientId) return c;
        return null;
      }
      const list = await Calibration.filter({ patient_id: patientId });
      return getLatestCalibration(list);
    },
    enabled: !!patientId,
  });
```

(`src/pages/PatientDashboard.jsx`'s two queries — `queryFn: () => Calibration.filter(...)` and `queryFn: () => TrainingSession.filter(...)` — already just return the call's result directly with no further synchronous processing, so React Query handles the now-returned Promise correctly with no edit needed.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- localStore.integrity`
Expected: PASS (4 tests)

- [ ] **Step 7: Run the full test suite to check for regressions**

Run: `npm test`
Expected: All existing tests still pass (in particular `sortCalibrations.test.js`, which tests pure functions on plain arrays and is unaffected).

- [ ] **Step 8: Commit**

```bash
git add src/api/auditStore.js src/api/localStore.js src/api/localStore.integrity.test.js src/pages/TrainingHistory.jsx src/pages/TypeDecision.jsx src/pages/TrainingReport.jsx
git commit -m "feat: add SHA-256 integrity hashing to TrainingSession and Calibration records"
```

---

### Task 3: `encryptUserMeta` / `decryptUserMeta` in crypto.js

**Files:**
- Modify: `src/lib/crypto.js`
- Test: `src/lib/crypto.userMeta.test.js` (create)

**Interfaces:**
- Produces: `export async function encryptUserMeta(user): Promise<object>`, `export async function decryptUserMeta(raw): Promise<object>` — used by Task 4 (`authStore.js`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/crypto.userMeta.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('encryptUserMeta / decryptUserMeta', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createMockLocalStorage());
  });

  it('round-trips role and lockout fields, keeping username/id in plaintext', async () => {
    const { initCrypto, encryptUserMeta, decryptUserMeta } = await import('./crypto.js');
    await initCrypto();
    const user = {
      id: 'u1', username: 'admin', displayName: '관리자',
      passwordHash: 'hash', salt: 'salt',
      role: 'admin', mustChangePassword: true,
      failedAttempts: 2, lockedUntil: null, lockoutTicksRemaining: 0,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const encrypted = await encryptUserMeta(user);
    expect(encrypted.username).toBe('admin'); // plaintext, unchanged
    expect(encrypted.role).toBeUndefined(); // moved into _enc
    expect(encrypted._enc).toMatch(/^enc:/);

    const decrypted = await decryptUserMeta(encrypted);
    expect(decrypted).toEqual(user);
  });

  it('passes through a legacy record with no _enc field unchanged', async () => {
    const { initCrypto, decryptUserMeta } = await import('./crypto.js');
    await initCrypto();
    const legacy = { id: 'u2', username: 'legacy', role: 'clinician' };
    expect(await decryptUserMeta(legacy)).toEqual(legacy);
  });

  it('falls back to safe defaults instead of throwing when _enc is corrupted', async () => {
    const { initCrypto, decryptUserMeta } = await import('./crypto.js');
    await initCrypto();
    const corrupted = { id: 'u3', username: 'broken', _enc: 'enc:not-valid-hex-data-000000:also-not-valid' };
    const result = await decryptUserMeta(corrupted);
    expect(result._decryptionFailed).toBe(true);
    expect(result.role).toBe('clinician');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- crypto.userMeta`
Expected: FAIL — `encryptUserMeta`/`decryptUserMeta` not exported from `./crypto.js`.

- [ ] **Step 3: Implement `encryptUserMeta`/`decryptUserMeta`**

In `src/lib/crypto.js`, add after the `decryptPatient` function (end of file):

```js
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
  const meta = {};
  const rest = {};
  for (const [k, v] of Object.entries(user)) {
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
    const { _enc, ...rest } = raw;
    return { ...rest, ...meta };
  } catch (err) {
    console.warn('[crypto] decryptUserMeta: decryption failed for user', raw.id,
      '— install key may have changed. Clear localStorage to reset.');
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- crypto.userMeta`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto.js src/lib/crypto.userMeta.test.js
git commit -m "feat: add encryptUserMeta/decryptUserMeta for user account metadata"
```

---

### Task 4: Encrypt user account metadata in authStore.js

**Files:**
- Modify: `src/api/authStore.js`
- Test: `src/api/authStore.test.js` (create)

**Interfaces:**
- Consumes: `encryptUserMeta`, `decryptUserMeta` from Task 3 (`@/lib/crypto`).
- Produces: `ensureDefaultAdmin(): Promise<void>` (unchanged signature, now async-safe), `loginUser(username, password): Promise<{success, session?, error?, locked?}>` (unchanged signature), `UserStore.list(): Promise<object[]>` (was sync, now async), `UserStore.create/unlock/setRole(...): Promise<...>` (unlock/setRole were sync, now async; create was already async).

- [ ] **Step 1: Write the failing test**

Create `src/api/authStore.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('authStore — encrypted user metadata', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createMockStorage());
    vi.stubGlobal('sessionStorage', createMockStorage());
  });

  it('stores role/lockout fields encrypted, not as plaintext top-level keys', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin } = await import('./authStore.js');
    await ensureDefaultAdmin();

    const raw = JSON.parse(localStorage.getItem('dibh_users'))[0];
    expect(raw.username).toBe('admin'); // plaintext, needed for lookup
    expect(raw.role).toBeUndefined(); // must not be a plaintext field
    expect(raw._enc).toMatch(/^enc:/);
  });

  it('logs in successfully with the default admin credentials', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, loginUser } = await import('./authStore.js');
    await ensureDefaultAdmin();

    const result = await loginUser('admin', 'Admin@1234!');
    expect(result.success).toBe(true);
    expect(result.session.role).toBe('admin');
  });

  it('locks the account after 5 failed attempts and keeps the lockout state encrypted', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, loginUser } = await import('./authStore.js');
    await ensureDefaultAdmin();

    for (let i = 0; i < 4; i++) {
      const r = await loginUser('admin', 'wrong-password');
      expect(r.locked).toBeUndefined();
    }
    const lockedResult = await loginUser('admin', 'wrong-password');
    expect(lockedResult.locked).toBe(true);

    const raw = JSON.parse(localStorage.getItem('dibh_users'))[0];
    expect(raw.lockedUntil).toBeUndefined(); // must not leak in plaintext
    expect(raw._enc).toMatch(/^enc:/);
  });

  it('UserStore.list() never exposes passwordHash or salt', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, UserStore } = await import('./authStore.js');
    await ensureDefaultAdmin();

    const users = await UserStore.list();
    expect(users[0].passwordHash).toBeUndefined();
    expect(users[0].salt).toBeUndefined();
    expect(users[0].role).toBe('admin'); // decrypted metadata still present
  });

  it('UserStore.setRole updates the encrypted role field', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, UserStore } = await import('./authStore.js');
    await ensureDefaultAdmin();
    const [admin] = await UserStore.list();

    await UserStore.setRole(admin.id, 'clinician');
    const [updated] = await UserStore.list();
    expect(updated.role).toBe('clinician');
  });

  it('UserStore.unlock clears lockout state after a lockout', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, loginUser, UserStore } = await import('./authStore.js');
    await ensureDefaultAdmin();
    for (let i = 0; i < 5; i++) await loginUser('admin', 'wrong-password');

    const [locked] = await UserStore.list();
    expect(locked.lockedUntil).not.toBeNull();

    await UserStore.unlock(locked.id);
    const [unlocked] = await UserStore.list();
    expect(unlocked.lockedUntil).toBeNull();
    expect(unlocked.failedAttempts).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- authStore`
Expected: FAIL — `raw.role` is currently defined (plaintext), `UserStore.list()`/`unlock()`/`setRole()` currently return non-Promise values so `await`-ing them doesn't error but the plaintext-field assertions fail.

- [ ] **Step 3: Rewrite `src/api/authStore.js`**

Add to the top imports:

```js
import { encryptUserMeta, decryptUserMeta } from '@/lib/crypto';
```

Replace the heartbeat `setInterval` block with:

```js
// Heartbeat: decrement lockoutTicksRemaining for every locked user every 10 real seconds.
// Auto-starts on module import so it runs even before the React tree mounts.
setInterval(async () => {
  const users = loadUsers();
  const decrypted = await Promise.all(users.map(decryptUserMeta));
  let dirty = false;
  for (let i = 0; i < decrypted.length; i++) {
    if (!decrypted[i].lockoutTicksRemaining || decrypted[i].lockoutTicksRemaining <= 0) continue;
    decrypted[i] = { ...decrypted[i], lockoutTicksRemaining: decrypted[i].lockoutTicksRemaining - 1 };
    if (decrypted[i].lockoutTicksRemaining === 0) {
      decrypted[i] = { ...decrypted[i], lockedUntil: null, failedAttempts: 0 };
      _sessionLockouts.delete(decrypted[i].id);
    }
    dirty = true;
  }
  if (dirty) {
    const reEncrypted = await Promise.all(decrypted.map(encryptUserMeta));
    saveUsers(reEncrypted);
  }
}, HEARTBEAT_MS);
```

Replace `ensureDefaultAdmin`:

```js
/** Creates the default admin account if no users exist yet. */
export async function ensureDefaultAdmin() {
  const users = loadUsers();
  if (users.length > 0) return;
  const salt = randomHex(16);
  const passwordHash = await pbkdf2Hash('Admin@1234!', salt);
  const admin = await encryptUserMeta({
    id: generateId(),
    username: 'admin',
    displayName: '관리자',
    passwordHash,
    salt,
    role: 'admin',
    mustChangePassword: true,
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  saveUsers([admin]);
}
```

Replace `loginUser` in full:

```js
export async function loginUser(username, password) {
  const users = loadUsers();
  const idx = users.findIndex((u) => u.username === username);

  // Do not reveal whether the username exists (IA-06)
  if (idx === -1) return { success: false, error: GENERIC_ERROR };

  const user = await decryptUserMeta(users[idx]);

  // Lockout check (IA-07) — tick counter (primary) + performance.now() (same-session layer)
  const ticks = user.lockoutTicksRemaining ?? 0;
  if (ticks > 0) {
    const remainingMin = Math.ceil((ticks * HEARTBEAT_MS) / 60_000);
    // Also check same-session layer for belt-and-suspenders
    if (!_sessionLockouts.has(user.id)) {
      // Re-entering after app restart: pin into monotonic tracker for this session
      _sessionLockouts.set(user.id, performance.now() - (LOCKOUT_TICKS - ticks) * HEARTBEAT_MS);
    }
    secDbg('IA-07', '계정 잠금 상태 확인 — Lockout Active', {
      설명: '연속 로그인 실패로 인해 계정이 잠금 상태입니다. OS 시계 조작 내성을 위해 이중 레이어 잠금이 적용되어 있습니다.',
      description: 'Account is locked due to repeated login failures. Dual-layer lockout is immune to OS clock manipulation.',
      남은_틱: ticks, ticks_remaining: ticks,
      남은_시간_분: remainingMin, remaining_min: remainingMin,
      레이어1: '틱 카운터 (실시간 인터벌, OS 시계 무관, 세션 간 유지)',
      layer1: 'tick counter (real-time interval, OS-clock immune, cross-session)',
      레이어2: 'performance.now() — 동일 세션 내 정밀 측정',
      layer2: 'performance.now() pinned for this session',
    });
    return {
      success: false,
      locked: true,
      error: `계정이 잠금되었습니다. 약 ${remainingMin}분 후 다시 시도하거나 관리자에게 문의하세요.`,
    };
  }

  const hash = await pbkdf2Hash(password, user.salt);

  if (hash !== user.passwordHash) {
    const attempts = (user.failedAttempts || 0) + 1;
    const update = { failedAttempts: attempts, updatedAt: new Date().toISOString() };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      update.lockedUntil = new Date().toISOString(); // audit trail: when lockout began
      update.lockoutTicksRemaining = LOCKOUT_TICKS;  // primary: real-time tick countdown
      update.failedAttempts = 0;
      _sessionLockouts.set(user.id, performance.now()); // layer 2: same-session monotonic
    }
    const merged = { ...user, ...update };
    users[idx] = await encryptUserMeta(merged);
    saveUsers(users);
    secDbg('IA-07', update.lockoutTicksRemaining ? '계정 잠금 처리 — Account Locked' : '로그인 실패 — Login Failed', {
      설명: update.lockoutTicksRemaining
        ? `${MAX_FAILED_ATTEMPTS}회 연속 실패로 계정이 잠금 처리되었습니다. 15분 후 자동 해제됩니다.`
        : '비밀번호가 일치하지 않아 로그인이 실패하였습니다.',
      description: update.lockoutTicksRemaining
        ? `Account locked after ${MAX_FAILED_ATTEMPTS} consecutive failures. Auto-unlocks after 15 minutes.`
        : 'Login failed — password mismatch.',
      username,
      실패_횟수: attempts, failed_attempt: attempts,
      최대_허용_횟수: MAX_FAILED_ATTEMPTS, max_attempts: MAX_FAILED_ATTEMPTS,
      계정_잠금_여부: !!update.lockoutTicksRemaining, account_locked: !!update.lockoutTicksRemaining,
      잠금_틱: update.lockoutTicksRemaining ?? 'N/A', lockout_ticks: update.lockoutTicksRemaining ?? 'N/A',
      잠금_시간_분: LOCKOUT_MS / 60_000, lockout_duration_min: LOCKOUT_MS / 60_000,
      시계_조작_방어: '레이어1: 실시간 틱 카운터 (세션 간 유지) | 레이어2: performance.now() (동일 세션)',
      clock_protection: 'Layer 1: real-time tick counter (cross-session safe) | Layer 2: performance.now() (same-session)',
    });

    // Lazy import to avoid circular dependency
    import('./auditStore').then(({ tryWriteAuditLog, AUDIT_ACTIONS }) => {
      if (update.lockedUntil) {
        tryWriteAuditLog({ action: AUDIT_ACTIONS.ACCOUNT_LOCKED, targetType: 'user', targetId: user.id, detail: `username: ${username}` });
      } else {
        tryWriteAuditLog({ action: AUDIT_ACTIONS.LOGIN_FAILED, targetType: 'user', targetId: user.id, detail: `username: ${username}, attempt ${attempts}` });
      }
    });

    if (update.lockedUntil) {
      return {
        success: false,
        locked: true,
        error: '로그인 시도 횟수를 초과하여 계정이 잠금되었습니다. 관리자에게 문의하여 잠금을 해제해 주세요.',
      };
    }
    const remaining = MAX_FAILED_ATTEMPTS - attempts;
    return { success: false, error: `${GENERIC_ERROR} (남은 시도: ${remaining}회)` };
  }

  // Success — reset counter and create session
  const merged = { ...user, failedAttempts: 0, lockedUntil: null, updatedAt: new Date().toISOString() };
  users[idx] = await encryptUserMeta(merged);
  saveUsers(users);

  const session = {
    token: randomHex(32),
    userId: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role,
    mustChangePassword: !!user.mustChangePassword,
    loginTime: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

  import('./auditStore').then(({ tryWriteAuditLog, AUDIT_ACTIONS }) => {
    tryWriteAuditLog({ action: AUDIT_ACTIONS.LOGIN, targetType: 'user', targetId: user.id, detail: `username: ${username}` });
  });

  return { success: true, session };
}
```

Replace the `UserStore` object in full:

```js
export const UserStore = {
  async list() {
    const users = loadUsers();
    const decrypted = await Promise.all(users.map(decryptUserMeta));
    return decrypted.map(({ passwordHash, salt, ...safe }) => safe);
  },

  async create({ username, displayName = '', password, role = 'clinician' }) {
    const users = loadUsers();
    if (users.find((u) => u.username === username)) throw new Error('이미 존재하는 아이디입니다.');
    const salt = randomHex(16);
    const passwordHash = await pbkdf2Hash(password, salt);
    const user = {
      id: generateId(),
      username,
      displayName: displayName.trim() || username,
      passwordHash,
      salt,
      role,
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    users.push(await encryptUserMeta(user));
    saveUsers(users);
    return { ...user, passwordHash: undefined, salt: undefined };
  },

  async changePassword(userId, newPassword) {
    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) throw new Error('사용자를 찾을 수 없습니다.');
    const salt = randomHex(16);
    const passwordHash = await pbkdf2Hash(newPassword, salt);
    const decrypted = await decryptUserMeta(users[idx]);
    const merged = { ...decrypted, passwordHash, salt, mustChangePassword: false, updatedAt: new Date().toISOString() };
    users[idx] = await encryptUserMeta(merged);
    saveUsers(users);
    // Update active session if changing own password
    const s = getSession();
    if (s && s.userId === userId) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, mustChangePassword: false }));
    }
  },

  async resetPassword(userId, newPassword) {
    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) throw new Error('사용자를 찾을 수 없습니다.');
    const salt = randomHex(16);
    const passwordHash = await pbkdf2Hash(newPassword, salt);
    const decrypted = await decryptUserMeta(users[idx]);
    const merged = { ...decrypted, passwordHash, salt, mustChangePassword: true, updatedAt: new Date().toISOString() };
    users[idx] = await encryptUserMeta(merged);
    saveUsers(users);
  },

  async unlock(userId) {
    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) throw new Error('사용자를 찾을 수 없습니다.');
    const decrypted = await decryptUserMeta(users[idx]);
    const merged = { ...decrypted, failedAttempts: 0, lockedUntil: null, lockoutTicksRemaining: 0, updatedAt: new Date().toISOString() };
    users[idx] = await encryptUserMeta(merged);
    saveUsers(users);
    _sessionLockouts.delete(userId); // clear both layers
  },

  async setRole(userId, role) {
    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) throw new Error('사용자를 찾을 수 없습니다.');
    const decrypted = await decryptUserMeta(users[idx]);
    const merged = { ...decrypted, role, updatedAt: new Date().toISOString() };
    users[idx] = await encryptUserMeta(merged);
    saveUsers(users);
  },

  delete(userId) {
    const users = loadUsers();
    if (users.length <= 1) throw new Error('마지막 계정은 삭제할 수 없습니다.');
    saveUsers(users.filter((u) => u.id !== userId));
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- authStore`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npm test`
Expected: All tests pass, including Task 1–2's new tests and all pre-existing ones.

- [ ] **Step 6: Commit**

```bash
git add src/api/authStore.js src/api/authStore.test.js
git commit -m "feat: encrypt user account metadata (role, lockout state) with AES-256-GCM"
```

---

### Task 5: Update AdminAccounts.jsx for the now-async UserStore calls

**Files:**
- Modify: `src/pages/AdminAccounts.jsx`

**Interfaces:**
- Consumes: `UserStore.list/setRole/unlock` (now `async`, from Task 4).

- [ ] **Step 1: Update `reload` and the handlers that call it**

In `src/pages/AdminAccounts.jsx`, change:

```js
  const reload = () => setUsers(UserStore.list());
```

to:

```js
  const reload = async () => setUsers(await UserStore.list());
```

Change `handleCreate`'s `reload();` call (inside the `try` block, after `setFormErrors([]);`) to `await reload();` (the function is already `async`).

Change `handleRoleToggle`:

```js
  const handleRoleToggle = (user) => {
    const newRole = user.role === 'admin' ? 'clinician' : 'admin';
    // Prevent removing last admin
    if (user.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) {
      alert('마지막 관리자 계정의 권한은 변경할 수 없습니다.');
      return;
    }
    UserStore.setRole(user.id, newRole);
    tryWriteAuditLog({ action: AUDIT_ACTIONS.USER_ROLE_CHANGED, targetType: 'user', targetId: user.id, detail: `username: ${user.username}, role: ${user.role} → ${newRole}` });
    reload();
  };
```

to:

```js
  const handleRoleToggle = async (user) => {
    const newRole = user.role === 'admin' ? 'clinician' : 'admin';
    // Prevent removing last admin
    if (user.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) {
      alert('마지막 관리자 계정의 권한은 변경할 수 없습니다.');
      return;
    }
    await UserStore.setRole(user.id, newRole);
    tryWriteAuditLog({ action: AUDIT_ACTIONS.USER_ROLE_CHANGED, targetType: 'user', targetId: user.id, detail: `username: ${user.username}, role: ${user.role} → ${newRole}` });
    await reload();
  };
```

Change `handleUnlock`:

```js
  const handleUnlock = (user) => {
    UserStore.unlock(user.id);
    tryWriteAuditLog({ action: AUDIT_ACTIONS.USER_UNLOCKED, targetType: 'user', targetId: user.id, detail: `username: ${user.username}` });
    reload();
  };
```

to:

```js
  const handleUnlock = async (user) => {
    await UserStore.unlock(user.id);
    tryWriteAuditLog({ action: AUDIT_ACTIONS.USER_UNLOCKED, targetType: 'user', targetId: user.id, detail: `username: ${user.username}` });
    await reload();
  };
```

Change `handleDelete`:

```js
  const handleDelete = () => {
    try {
      UserStore.delete(deleteTarget.id);
      tryWriteAuditLog({ action: AUDIT_ACTIONS.USER_DELETED, targetType: 'user', targetId: deleteTarget.id, detail: `username: ${deleteTarget.username}` });
      setDeleteTarget(null);
      reload();
    } catch (err) {
      alert(err.message);
    }
  };
```

to:

```js
  const handleDelete = async () => {
    try {
      UserStore.delete(deleteTarget.id);
      tryWriteAuditLog({ action: AUDIT_ACTIONS.USER_DELETED, targetType: 'user', targetId: deleteTarget.id, detail: `username: ${deleteTarget.username}` });
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      alert(err.message);
    }
  };
```

(`UserStore.delete` itself stays synchronous — it doesn't touch encrypted fields — so no `await` is needed on that specific call.)

- [ ] **Step 2: Manually verify in the dev server**

This page has no existing automated test harness (the repo's Vitest config runs in the `node` environment with no DOM, and no other page in this codebase has component-render tests — see `Login.usageNotice.test.jsx` for the established pattern of testing only exported pure functions, not rendering). Verify manually instead:

Run: `npm run dev`, then in the browser:
1. Log in as `admin` / whatever the current password is.
2. Go to `/admin/accounts`.
3. Confirm the user list renders with correct roles and lock status (this exercises the now-async `reload()`/`UserStore.list()`).
4. Toggle a non-last-admin user's role — confirm the badge updates immediately.
5. Trigger a lockout (5 failed logins on a second test account from a private/incognito window), then unlock it from this page — confirm the lock badge clears.

Expected: all four actions update the UI with no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AdminAccounts.jsx
git commit -m "fix: await the now-async UserStore calls in AdminAccounts.jsx"
```

---

### Task 6: Hash-chain for the audit log

**Files:**
- Modify: `src/api/auditStore.js`
- Test: `src/api/auditStore.chain.test.js` (create)

**Interfaces:**
- Consumes: `sha256Hex`, `stableStringify` from Task 1 (`@/lib/crypto`).
- Produces: `writeAuditLog(...)` and `tryWriteAuditLog(...)` are now `async` (same call signature). New `export async function verifyAuditChain(): Promise<{valid: boolean, checkedCount: number, brokenAtIndex: number|null, brokenAtId: string|null}>`.

- [ ] **Step 1: Write the failing test**

Create `src/api/auditStore.chain.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auditStore.chain`
Expected: FAIL — `verifyAuditChain` is not exported; `writeAuditLog` doesn't yet produce a `hash`/`prevHash`.

- [ ] **Step 3: Implement the hash-chain in `src/api/auditStore.js`**

Add to the top imports:

```js
import { sha256Hex, stableStringify } from '@/lib/crypto';
```

Add near the other top-level constants (after `LS_WARN_BYTES`):

```js
const GENESIS_HASH = '0'.repeat(64); // prevHash for the first hash-chained entry ever written
```

Replace `writeAuditLog` and `tryWriteAuditLog` in full:

```js
/**
 * Write an audit entry. Throws if localStorage is unavailable (UC-05 — caller must handle).
 *
 * @param {{ action: string, targetType?: string, targetId?: string, detail?: string }} params
 */
export async function writeAuditLog({ action, targetType = null, targetId = null, detail = null }) {
  const session = getSession();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: session?.userId ?? 'system',
    username: session?.username ?? 'system',
    action,
    targetType,
    targetId: targetId ? String(targetId) : null,
    detail,
    timestamp: new Date().toISOString(), // UC-06 ISO 8601
  };

  const log = loadLog();
  const previous = log[log.length - 1];
  entry.prevHash = previous?.hash || GENESIS_HASH;
  // Hash covers the entry's own content plus prevHash (already a field on entry at this point) —
  // any edit, deletion, or reordering of a prior entry changes every hash after it (UC-07).
  entry.hash = await sha256Hex(new TextEncoder().encode(stableStringify(entry)).buffer);

  log.push(entry);
  if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES);

  secDbg('UC-04/UC-06/UC-07', '감사 로그 항목 기록 — Audit Log Entry Written', {
    설명: '보안 이벤트를 감사 로그에 기록합니다. 사용자 ID·타임스탬프·액션 코드와 해시체인(prevHash/hash)을 포함하여 부인 방지(UC-07) 및 추적성(UC-04)을 보장합니다.',
    description: 'Records a security event to the audit log. Includes userId, timestamp, action code, and a hash-chain link (prevHash/hash) for non-repudiation (UC-07) and traceability (UC-04).',
    action: entry.action,
    userId: entry.userId,
    username: entry.username,
    targetType: entry.targetType,
    targetId: entry.targetId,
    detail: entry.detail,
    timestamp: entry.timestamp,
    total_entries: log.length,
    max_entries: MAX_ENTRIES,
  });
  // UC-05 — attempt write; on QuotaExceededError, emergency-trim oldest 20% and retry once
  const serialized = JSON.stringify(log);
  try {
    localStorage.setItem(AUDIT_KEY, serialized);
  } catch (e) {
    const isQuota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    if (isQuota) {
      secDbg('UC-05', '저장소 용량 초과 긴급 조치 — QuotaExceededError Emergency Trim', {
        설명: 'localStorage 용량 초과 시 오래된 감사 로그 20%를 삭제하고 쓰기를 재시도합니다. 최신 기록을 보존하기 위한 긴급 조치입니다.',
        description: 'On localStorage QuotaExceededError, drops the oldest 20% of audit entries and retries the write to preserve the most recent records.',
        entries_before: log.length,
      });
      const trimmed = log.slice(Math.floor(log.length * 0.2));
      try {
        localStorage.setItem(AUDIT_KEY, JSON.stringify(trimmed));
      } catch {
        throw e; // still full — propagate; tryWriteAuditLog will surface to console
      }
    } else {
      throw e;
    }
  }
  return entry;
}

/** Safe wrapper — logs to console if write fails instead of crashing non-critical paths. */
export async function tryWriteAuditLog(params) {
  try {
    await writeAuditLog(params);
  } catch (err) {
    console.error('[AuditLog] Write failed:', err);
  }
}
```

Add `verifyAuditChain` after `getAuditLogCapacity`:

```js
/**
 * Walk the audit log in order and verify the hash-chain (UC-07). Entries written
 * before this feature shipped have no `hash` field — they're skipped as legacy/
 * unverified rather than counted as tampered. Verification starts from the first
 * hash-bearing entry and checks every entry after it.
 */
export async function verifyAuditChain() {
  const log = loadLog();
  const firstHashedIndex = log.findIndex((e) => !!e.hash);
  if (firstHashedIndex === -1) {
    return { valid: true, checkedCount: 0, brokenAtIndex: null, brokenAtId: null };
  }

  let prevHash = log[firstHashedIndex].prevHash ?? GENESIS_HASH;
  let checkedCount = 0;
  for (let i = firstHashedIndex; i < log.length; i++) {
    const entry = log[i];
    if (entry.prevHash !== prevHash) {
      return { valid: false, checkedCount, brokenAtIndex: i, brokenAtId: entry.id };
    }
    const { hash, ...rest } = entry;
    const expected = await sha256Hex(new TextEncoder().encode(stableStringify(rest)).buffer);
    if (expected !== hash) {
      return { valid: false, checkedCount, brokenAtIndex: i, brokenAtId: entry.id };
    }
    checkedCount++;
    prevHash = hash;
  }
  return { valid: true, checkedCount, brokenAtIndex: null, brokenAtId: null };
}
```

`seedDebugAuditEntries` (debug-only bulk seeding) is left unchanged — it stays chain-exempt, writing entries with no `hash`, which `verifyAuditChain` correctly treats as trailing legacy-style entries only if they appear before the first hashed entry. Since debug seeding always runs after real entries may already exist, note this exemption applies to debug/QA builds only (`SECURITY_DEBUG` guard, never a production build) — acceptable because it can never be presented as evidence of a real audit trail.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- auditStore.chain`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npm test`
Expected: All tests pass, including the existing `auditStore.test.js` (`seedDebugAuditEntries` tests — unaffected since that function doesn't call `writeAuditLog`).

- [ ] **Step 6: Commit**

```bash
git add src/api/auditStore.js src/api/auditStore.chain.test.js
git commit -m "feat: add hash-chain integrity to the audit log"
```

---

### Task 7: Audit chain verification UI in AdminAuditLog.jsx

**Files:**
- Modify: `src/pages/AdminAuditLog.jsx`

**Interfaces:**
- Consumes: `verifyAuditChain(): Promise<{valid, checkedCount, brokenAtIndex, brokenAtId}>` from Task 6 (`@/api/auditStore`).

- [ ] **Step 1: Add the import and state**

In `src/pages/AdminAuditLog.jsx`, change:

```js
import { getAuditLogEntries, getAuditLogCapacity, seedDebugAuditEntries } from '@/api/auditStore';
```

to:

```js
import { getAuditLogEntries, getAuditLogCapacity, seedDebugAuditEntries, verifyAuditChain } from '@/api/auditStore';
```

Inside `AdminAuditLog()`, after the `refreshKey` state declaration, add:

```js
  const [chainStatus, setChainStatus] = useState(null); // null = not yet checked this session
  const [verifyingChain, setVerifyingChain] = useState(false);

  const handleVerifyChain = async () => {
    setVerifyingChain(true);
    try {
      const result = await verifyAuditChain();
      setChainStatus(result);
    } finally {
      setVerifyingChain(false);
    }
  };
```

- [ ] **Step 2: Add the status/verify UI**

Immediately after the `<AdminNav />` line and before the capacity-warning block (`{(capacity.pct >= 80 ...`), add:

```jsx
        {/* UC-07 — Audit log hash-chain integrity */}
        <div className="mb-4 flex items-center justify-between rounded-xl border border-[#30363D] bg-[#1C2128] px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            {chainStatus == null ? (
              <span className="text-[#8B949E]">체인 무결성: 검증 필요 (UC-07)</span>
            ) : chainStatus.valid ? (
              <span className="flex items-center gap-1.5 text-[#22C55E]">
                <ShieldCheck className="h-4 w-4" />
                체인 무결성: 정상 ({chainStatus.checkedCount.toLocaleString()}건 검증)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[#EF4444]">
                <AlertTriangle className="h-4 w-4" />
                체인 무결성 손상 — 항목 #{chainStatus.brokenAtIndex} (id: {chainStatus.brokenAtId})
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={handleVerifyChain} disabled={verifyingChain}
            className="border-[#30363D] bg-transparent text-[#C9D1D9] shadow-none hover:bg-[#30363D] hover:text-white">
            {verifyingChain ? '검증 중…' : '지금 검증'}
          </Button>
        </div>
```

- [ ] **Step 3: Manually verify in the dev server**

Same rationale as Task 5 — no component-render test harness exists in this repo for pages (see `Login.usageNotice.test.jsx`'s pattern of testing only exported pure functions).

Run: `npm run dev`, then in the browser:
1. Log in as an admin user, go to `/admin/auditlog`.
2. Confirm the new status row shows "체인 무결성: 검증 필요 (UC-07)".
3. Click "지금 검증" — confirm it switches to "체인 무결성: 정상 (N건 검증)" with a green checkmark.
4. Optional tamper check: in DevTools console, run `const log = JSON.parse(localStorage.getItem('dibh_audit_log')); log[0].detail = 'tampered'; localStorage.setItem('dibh_audit_log', JSON.stringify(log));`, reload the page, click "지금 검증" again — confirm it now shows "체인 무결성 손상 — 항목 #0 (...)" in red. Undo by restoring from a backup or clearing localStorage afterward.

Expected: all steps behave as described with no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AdminAuditLog.jsx
git commit -m "feat: add audit log hash-chain verification UI (UC-07)"
```

---

### Task 8: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: All test files pass, including the 6 new/updated ones from Tasks 1–4 and 6 (`crypto.recordHash.test.js`, `localStore.integrity.test.js`, `crypto.userMeta.test.js`, `authStore.test.js`, `auditStore.chain.test.js`) plus every pre-existing test file unchanged in behavior.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No new errors introduced by this plan's changes.

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: Build succeeds (this also exercises `scripts/generate-integrity.js`, unaffected by this plan, but worth confirming nothing broke it).

- [ ] **Step 4: Manual smoke test via the dev server**

Run: `npm run dev`, then:
1. Fresh login as `admin` (confirms `ensureDefaultAdmin` + `loginUser` with encrypted metadata work end to end).
2. Create a training session/calibration via the normal patient flow (upload → analyze) and confirm `PatientDashboard`/`TrainingHistory`/`TypeDecision`/`TrainingReport` all still render calibration data correctly (confirms Task 2's async conversion didn't break any consumer).
3. Visit `/admin/accounts` — toggle a role, lock and unlock a test account (confirms Task 4/5's async `UserStore` wiring).
4. Visit `/admin/auditlog` — run the chain verification (confirms Task 6/7).

Expected: no console errors; all four flows work as they did before this plan, plus the new integrity/encryption/chain behavior underneath.

- [ ] **Step 5: Note the follow-up (not part of this plan)**

Once all of the above is verified, draft a Q&A response document for the KTC reviewer (style-matched to the existing `docs/submission/cybersecurity-review-qa-*.md` files) documenting these three fixes — this is a separate, later step, not a task in this implementation plan.
