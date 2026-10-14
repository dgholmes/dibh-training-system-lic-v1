# 형성평가 반영 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the ten improvement requests from the 원주세브란스병원 formative evaluation to DIBH-Flow, ship as v1.1.7, and produce a submission document with before/after screenshots.

**Architecture:** Pure logic first (filename category detection, birth-date normalization, display-name composition) with unit tests, then a structural change that splits patient registration from file upload and merges upload with file selection, then the safety guard layered onto that merged screen, then the remaining UI items, then version and documents. No storage-schema change except one new encrypted patient field.

**Tech Stack:** React 18 + Vite, React Query, Radix UI primitives in `src/components/ui/`, Tailwind (dark GitHub palette), Vitest in `node` environment, date-fns, sql.js/WASM + localStorage.

**Spec:** `docs/superpowers/specs/2026-09-08-formative-evaluation-design.md`

## Global Constraints

- **Version:** `package.json` 1.1.6 → **1.1.7**. `versionCode` 10107 is derived automatically by `android/app/build.gradle:8` — never hand-edit it.
- **UI language is Korean.** All user-facing strings, including new dialogs and labels, are Korean.
- **Palette:** background `#0D1117`, surface `#1C2128`, raised `#252A32`, border `#30363D`, text `#C9D1D9`, muted `#8B949E`. Type colors: A `#22C55E`, B `#EAB308`, C `#EF4444`.
- **Offline-only.** Do not add any dependency, font, script tag, `fetch()` target, or the `INTERNET` permission. `npm run build` runs `scripts/verify-offline.js` and will fail the build.
- **Tests run in `node`, not jsdom.** Stub `localStorage`/`sessionStorage` with `vi.stubGlobal` and call `vi.resetModules()` in `beforeEach` for any module holding module-level state.
- **Baseline is 108 passing tests.** Every task ends with the full suite green.
- **Never store patient PII in a filename, a plain column, or a `Calibration` field.** `breathing_files.original_name` and `Calibration.source_files` are unencrypted.
- **Path alias:** `@` → `src/`.
- **Commit per task.** Each task's deliverable is independently revertible before submission.

---

### Task 0: Capture the "before" screenshots — OWNED BY THE USER

**The user captures these on a tablet running the released 1.1.6 APK.** Do not
attempt them and do not block on them; on-device shots from the shipped build
are stronger evidence than a browser capture and match the operating
environment recorded in `KTC-보완요청-대응-2026-09.md` 10장.

The table in Step 3 below is the shot list handed to the user. Steps 1-2 (dev
server, browser viewport) do not apply to the on-device route.

**Files:**
- Create: `docs/submission/evidence/formative-eval-2026-09/before/*.png`

- [ ] **Step 1: Start the dev server from the master checkout**

In a separate terminal, from the **main** directory (not this worktree):

```bash
cd /c/Users/user_/Documents/dev/2026/medical/dibh/dibh-training-system-lic-v1
git status --short          # expect: only docs/patent/ untracked
npm run dev                 # http://localhost:5174
```

- [ ] **Step 2: Set the browser viewport to 2560×1600**

In Chrome DevTools → Toggle device toolbar → Responsive → set 2560 × 1600,
zoom 100%. This matches the verified tablet resolution recorded in
`KTC-보완요청-대응-2026-09.md` 10장.

- [ ] **Step 3: Log in and capture each screen**

Log in as `admin` / `Admin@1234!`. Create one patient with two breathing files
(use `vxp data/type_samples/TYPE_A_GEN_20260508.csv` and
`TYPE_A_DIBH_20260508.csv`) so the analysis screens have content.

Capture these, saving into `docs/submission/evidence/formative-eval-2026-09/before/`:

| Filename | Screen | Shows (item) |
|---|---|---|
| `01-newpatient.png` | 신규 환자 등록, full page | #1 calendar-only DOB, #3 free-text doctor, #9 bundled upload |
| `02-newpatient-dob.png` | DOB popover open | #1 |
| `03-home-recent.png` | 환자 목록, empty search | #4, #8 |
| `04-home-search.png` | 환자 목록, `PT` typed in search | #4 heading still reads 최근 치료 환자 |
| `05-upload.png` | 호흡 데이터 추가 | #2 weak separation, #9 |
| `06-analysisfileselect.png` | 분석할 파일 선택 | #9 separate screen, #10 `PT-` filenames |
| `07-typedecision.png` | 호흡 분석 결과 | #5 no 권장 조치 |
| `08-graph-toggle.png` | Playback panel, toggle button visible | #7 |
| `09-dashboard-edit.png` | 환자 대시보드 수정 모달 | #1 + #3 duplicated controls |
| `10-header.png` | Close-up of a patient-flow header | #8 low-contrast back, no home |

- [ ] **Step 4: Verify the set is complete and readable**

```bash
ls docs/submission/evidence/formative-eval-2026-09/before/
```
Expected: 10 PNG files. Open two at random and confirm the Korean text is
legible at full size.

- [ ] **Step 5: Commit**

```bash
git add docs/submission/evidence/formative-eval-2026-09/before/
git commit -m "docs(evidence): capture pre-change screens for the formative-eval response"
```

---

### Task 1: Filename category detector

The first layer of #2's guard, and the deliverable half of #10.

**Files:**
- Create: `src/lib/breathingFileCategory.js`
- Test: `src/lib/breathingFileCategory.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `detectCategoryFromFileName(name: string) => 'general' | 'dibh' | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/breathingFileCategory.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { detectCategoryFromFileName } from './breathingFileCategory';

describe('detectCategoryFromFileName', () => {
  it('reads the GEN token from the real sample names', () => {
    expect(detectCategoryFromFileName('TYPE_A_GEN_20260508.csv')).toBe('general');
    expect(detectCategoryFromFileName('TYPE_B_GEN_20260508.vxp')).toBe('general');
    expect(detectCategoryFromFileName('PT-2026-001_GEN_20260508.csv')).toBe('general');
  });

  it('reads the DIBH token from the real sample names', () => {
    expect(detectCategoryFromFileName('TYPE_A_DIBH_20260508.csv')).toBe('dibh');
    expect(detectCategoryFromFileName('TYPE_C_DIBH_20260508.vxp')).toBe('dibh');
    expect(detectCategoryFromFileName('PT-2026-001_DIBH_20260508_2.csv')).toBe('dibh');
  });

  it('treats normal/general/free as general', () => {
    expect(detectCategoryFromFileName('synth_patient_1_normal.vxp')).toBe('general');
    expect(detectCategoryFromFileName('patient-general-0508.csv')).toBe('general');
    expect(detectCategoryFromFileName('free breathing 0508.csv')).toBe('general');
  });

  it('is case-insensitive', () => {
    expect(detectCategoryFromFileName('synth_patient_1_dibh.vxp')).toBe('dibh');
    expect(detectCategoryFromFileName('Type_A_Gen_20260508.csv')).toBe('general');
  });

  it('returns null when no token is present', () => {
    expect(detectCategoryFromFileName('breathing_2026.csv')).toBeNull();
    expect(detectCategoryFromFileName('20260508.vxp')).toBeNull();
  });

  it('returns null when both tokens are present rather than guessing', () => {
    expect(detectCategoryFromFileName('GEN_DIBH_compare.csv')).toBeNull();
    expect(detectCategoryFromFileName('normal_vs_dibh.csv')).toBeNull();
  });

  it('requires token boundaries — no substring matches', () => {
    expect(detectCategoryFromFileName('NONDIBH_0508.csv')).toBeNull();
    expect(detectCategoryFromFileName('REGENERATED_0508.csv')).toBeNull();
    expect(detectCategoryFromFileName('GENERATOR.csv')).toBeNull();
  });

  it('handles missing and malformed input without throwing', () => {
    expect(detectCategoryFromFileName('')).toBeNull();
    expect(detectCategoryFromFileName('   ')).toBeNull();
    expect(detectCategoryFromFileName(null)).toBeNull();
    expect(detectCategoryFromFileName(undefined)).toBeNull();
    expect(detectCategoryFromFileName(42)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- breathingFileCategory`
Expected: FAIL — cannot resolve `./breathingFileCategory`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/breathingFileCategory.js`:

```js
/**
 * Reads the breathing-data category out of an incoming filename.
 *
 * Hospital exports carry a category token (TYPE_A_GEN_20260508.csv,
 * synth_patient_1_dibh.vxp), and uploading a file into the wrong category
 * changes the resulting DIBH type — see RM-DBF-010. This detector feeds the
 * mismatch warning on the upload screen.
 *
 * It never guesses: an ambiguous or token-free name returns null, and the
 * caller stays silent rather than warning on a coin flip.
 */

const GENERAL_TOKENS = ['GEN', 'GENERAL', 'NORMAL', 'FREE'];
const DIBH_TOKENS = ['DIBH'];

/** Token must stand alone — bounded by a non-alphanumeric or a string edge. */
function hasToken(name, token) {
  return new RegExp(`(^|[^A-Za-z0-9])${token}([^A-Za-z0-9]|$)`, 'i').test(name);
}

/**
 * @param {string} name incoming filename (not the stored name)
 * @returns {'general'|'dibh'|null}
 */
export function detectCategoryFromFileName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  const isGeneral = GENERAL_TOKENS.some((t) => hasToken(trimmed, t));
  const isDibh = DIBH_TOKENS.some((t) => hasToken(trimmed, t));

  // Both or neither — no confident reading.
  if (isGeneral === isDibh) return null;
  return isDibh ? 'dibh' : 'general';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- breathingFileCategory`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 116 passed (108 baseline + 8).

- [ ] **Step 6: Commit**

```bash
git add src/lib/breathingFileCategory.js src/lib/breathingFileCategory.test.js
git commit -m "feat(upload): detect general/DIBH category from the incoming filename

First layer of the RM-DBF-010 control strengthening requested by the
formative evaluation. Returns null rather than guessing when a filename
carries both tokens or neither, so the mismatch warning only fires on a
confident reading."
```

---

### Task 2: Birth-date input normalization

**Files:**
- Create: `src/lib/birthDate.js`
- Test: `src/lib/birthDate.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `normalizeBirthDateInput(input: string, today?: Date) => string | null` — returns `yyyy-MM-dd`
  - `formatBirthDateForDisplay(iso: string) => string` — returns `yyyy-MM-dd` or `''`
  - `MIN_BIRTH_YEAR = 1900`

- [ ] **Step 1: Write the failing test**

Create `src/lib/birthDate.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalizeBirthDateInput, formatBirthDateForDisplay } from './birthDate';

const TODAY = new Date(2026, 8, 8); // 2026-09-08, local

describe('normalizeBirthDateInput', () => {
  it('accepts the primary 8-digit form', () => {
    expect(normalizeBirthDateInput('19900512', TODAY)).toBe('1990-05-12');
    expect(normalizeBirthDateInput('20001231', TODAY)).toBe('2000-12-31');
  });

  it('accepts separators and normalizes them away', () => {
    expect(normalizeBirthDateInput('1990-05-12', TODAY)).toBe('1990-05-12');
    expect(normalizeBirthDateInput('1990.05.12', TODAY)).toBe('1990-05-12');
    expect(normalizeBirthDateInput('1990/05/12', TODAY)).toBe('1990-05-12');
    expect(normalizeBirthDateInput(' 1990 05 12 ', TODAY)).toBe('1990-05-12');
  });

  it('rejects dates that do not exist', () => {
    expect(normalizeBirthDateInput('19900231', TODAY)).toBeNull(); // Feb 31
    expect(normalizeBirthDateInput('19901301', TODAY)).toBeNull(); // month 13
    expect(normalizeBirthDateInput('19900500', TODAY)).toBeNull(); // day 0
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(normalizeBirthDateInput('20000229', TODAY)).toBe('2000-02-29');
    expect(normalizeBirthDateInput('19000229', TODAY)).toBeNull();
  });

  it('rejects future dates', () => {
    expect(normalizeBirthDateInput('20260909', TODAY)).toBeNull();
    expect(normalizeBirthDateInput('20260908', TODAY)).toBe('2026-09-08'); // today is allowed
  });

  it('rejects years before 1900', () => {
    expect(normalizeBirthDateInput('18991231', TODAY)).toBeNull();
    expect(normalizeBirthDateInput('19000101', TODAY)).toBe('1900-01-01');
  });

  it('rejects wrong-length and non-numeric input', () => {
    expect(normalizeBirthDateInput('199005', TODAY)).toBeNull();
    expect(normalizeBirthDateInput('199005123', TODAY)).toBeNull();
    expect(normalizeBirthDateInput('abcdefgh', TODAY)).toBeNull();
    expect(normalizeBirthDateInput('', TODAY)).toBeNull();
    expect(normalizeBirthDateInput(null, TODAY)).toBeNull();
  });
});

describe('formatBirthDateForDisplay', () => {
  it('renders a stored ISO date as yyyy-MM-dd', () => {
    expect(formatBirthDateForDisplay('1990-05-12')).toBe('1990-05-12');
  });

  it('returns an empty string for missing or malformed values', () => {
    expect(formatBirthDateForDisplay('')).toBe('');
    expect(formatBirthDateForDisplay(null)).toBe('');
    expect(formatBirthDateForDisplay('not-a-date')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- birthDate`
Expected: FAIL — cannot resolve `./birthDate`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/birthDate.js`:

```js
/**
 * Birth-date entry. All five formative-evaluation testers found the
 * calendar-only picker inconvenient (lowest-scoring task), so the field now
 * accepts typing. The primary form is 8 digits — 19900512 — with separators
 * tolerated.
 *
 * Storage format is unchanged: yyyy-MM-dd.
 */

export const MIN_BIRTH_YEAR = 1900;

/**
 * @param {string} input what the operator typed
 * @param {Date} [today] injectable for tests
 * @returns {string|null} yyyy-MM-dd, or null if not a usable date
 */
export function normalizeBirthDateInput(input, today = new Date()) {
  if (typeof input !== 'string') return null;
  const digits = input.trim().replace(/[.\-/\s]/g, '');
  if (!/^\d{8}$/.test(digits)) return null;

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));

  if (year < MIN_BIRTH_YEAR) return null;

  // Round-trip through Date to reject dates that do not exist (Feb 31 etc.).
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }

  // Compare at local midnight so "today" is accepted but tomorrow is not.
  const midnightToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (dt.getTime() > midnightToday.getTime()) return null;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** @param {string} iso stored yyyy-MM-dd @returns {string} */
export function formatBirthDateForDisplay(iso) {
  if (typeof iso !== 'string') return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- birthDate`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 126 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/birthDate.js src/lib/birthDate.test.js
git commit -m "feat(patient): normalize typed birth dates, 19900512 as the primary form

All five formative-evaluation testers flagged the calendar-only picker.
Storage format (yyyy-MM-dd) is unchanged; this only parses input."
```

---

### Task 3: Breathing-file display name

Composes the patient's name into the shown filename **without storing it**.
The stored `original_name` keeps the patient code, because that column and
`Calibration.source_files` are both unencrypted (spec §4.10).

**Files:**
- Create: `src/lib/breathingFileDisplayName.js`
- Test: `src/lib/breathingFileDisplayName.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `breathingFileDisplayName(storedName: string, patient: object|null) => string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/breathingFileDisplayName.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { breathingFileDisplayName } from './breathingFileDisplayName';

const PATIENT = { patient_code: 'PT-2026-001', name: '홍길동' };

describe('breathingFileDisplayName', () => {
  it('swaps the patient code for the patient name', () => {
    expect(breathingFileDisplayName('PT-2026-001_GEN_20260508.csv', PATIENT))
      .toBe('홍길동_GEN_20260508.csv');
    expect(breathingFileDisplayName('PT-2026-001_DIBH_20260508_2.vxp', PATIENT))
      .toBe('홍길동_DIBH_20260508_2.vxp');
  });

  it('leaves the name untouched when it does not start with the code', () => {
    expect(breathingFileDisplayName('TYPE_A_GEN_20260508.csv', PATIENT))
      .toBe('TYPE_A_GEN_20260508.csv');
    expect(breathingFileDisplayName('PT-2026-002_GEN_20260508.csv', PATIENT))
      .toBe('PT-2026-002_GEN_20260508.csv');
  });

  it('falls back to the stored name when the patient is unusable', () => {
    const stored = 'PT-2026-001_GEN_20260508.csv';
    expect(breathingFileDisplayName(stored, null)).toBe(stored);
    expect(breathingFileDisplayName(stored, {})).toBe(stored);
    expect(breathingFileDisplayName(stored, { patient_code: 'PT-2026-001' })).toBe(stored);
    expect(breathingFileDisplayName(stored, { name: '홍길동' })).toBe(stored);
  });

  it('never shows the decryption-failure placeholder as a filename', () => {
    const stored = 'PT-2026-001_GEN_20260508.csv';
    const broken = { patient_code: 'PT-2026-001', name: '[복호화 실패]', _decryptionFailed: true };
    expect(breathingFileDisplayName(stored, broken)).toBe(stored);
  });

  it('handles missing or malformed stored names', () => {
    expect(breathingFileDisplayName('', PATIENT)).toBe('');
    expect(breathingFileDisplayName(null, PATIENT)).toBe('');
    expect(breathingFileDisplayName(undefined, PATIENT)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- breathingFileDisplayName`
Expected: FAIL — cannot resolve `./breathingFileDisplayName`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/breathingFileDisplayName.js`:

```js
/**
 * Shows a breathing file under the patient's name instead of the patient code
 * — a formative-evaluation request (#10).
 *
 * Display only. The stored `original_name` keeps the code, because
 * `breathing_files.original_name` is a plaintext column and its value is
 * copied into `Calibration.source_files`, which is not encrypted either.
 * Writing the name there would put PII in the clear in two stores
 * (RM-DBF-003). The patient's name is already decrypted in memory for the
 * rest of the screen, so composing it here costs nothing.
 *
 * @param {string} storedName e.g. 'PT-2026-001_GEN_20260508.csv'
 * @param {{patient_code?: string, name?: string, _decryptionFailed?: boolean}|null} patient
 * @returns {string} e.g. '홍길동_GEN_20260508.csv'
 */
export function breathingFileDisplayName(storedName, patient) {
  if (typeof storedName !== 'string' || !storedName) return '';
  if (!patient || patient._decryptionFailed) return storedName;

  const code = patient.patient_code;
  const name = patient.name;
  if (!code || !name) return storedName;
  if (!storedName.startsWith(code)) return storedName;

  return `${name}${storedName.slice(code.length)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- breathingFileDisplayName`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 131 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/breathingFileDisplayName.js src/lib/breathingFileDisplayName.test.js
git commit -m "feat(files): show breathing files under the patient name

Display-layer only — the stored name keeps the patient code because
original_name is a plaintext column that is copied into the unencrypted
Calibration.source_files. Requested as #10 by the formative evaluation."
```

---

### Task 4: Persist the doctor's account link

Adds `assigned_doctor_account_id` to the encrypted patient PII set. Records
written before this task have no such key and must read back as `''`.

**Files:**
- Modify: `src/lib/crypto.js:229` (`PII_FIELDS`), `src/lib/crypto.js:266-274` (`decryptPatient` fallback)
- Modify: `src/api/localStore.js:59` (`PII` filter list)
- Test: `src/lib/crypto.doctorAccount.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: patient records carrying `assigned_doctor_account_id: string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/crypto.doctorAccount.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('assigned_doctor_account_id encryption', () => {
  let crypto_;

  beforeEach(async () => {
    vi.resetModules();
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    });
    crypto_ = await import('./crypto.js');
    await crypto_.initCrypto();
  });

  it('encrypts the account id into the _enc blob, not a plain field', async () => {
    const encrypted = await crypto_.encryptPatient({
      id: 'p1',
      patient_code: 'PT-2026-001',
      name: '홍길동',
      birth_date: '1990-05-12',
      assigned_doctor_name: '김의사',
      assigned_doctor_account_id: 'u-42',
    });

    expect(encrypted.assigned_doctor_account_id).toBeUndefined();
    expect(encrypted.patient_code).toBe('PT-2026-001');
    expect(JSON.stringify(encrypted)).not.toContain('u-42');
  });

  it('round-trips the account id back out', async () => {
    const encrypted = await crypto_.encryptPatient({
      id: 'p1',
      name: '홍길동',
      birth_date: '1990-05-12',
      assigned_doctor_name: '김의사',
      assigned_doctor_account_id: 'u-42',
    });
    const decrypted = await crypto_.decryptPatient(encrypted);

    expect(decrypted.assigned_doctor_account_id).toBe('u-42');
    expect(decrypted.assigned_doctor_name).toBe('김의사');
  });

  it('reads a record written before the field existed as an empty string', async () => {
    // Simulate a pre-upgrade record: _enc blob without the new key.
    const legacyPii = JSON.stringify({
      name: '이환자',
      birth_date: '1985-03-03',
      assigned_doctor_name: '박의사',
    });
    const legacy = {
      id: 'p2',
      patient_code: 'PT-2025-009',
      _enc: await crypto_.encryptValue(legacyPii),
    };

    const decrypted = await crypto_.decryptPatient(legacy);
    expect(decrypted.name).toBe('이환자');
    expect(decrypted.assigned_doctor_account_id).toBe('');
  });

  it('supplies an empty account id when decryption fails', async () => {
    const broken = { id: 'p3', patient_code: 'PT-2026-003', _enc: 'enc:0000:dead' };
    const decrypted = await crypto_.decryptPatient(broken);

    expect(decrypted._decryptionFailed).toBe(true);
    expect(decrypted.assigned_doctor_account_id).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- crypto.doctorAccount`
Expected: FAIL — the round-trip test gets `undefined`, and the legacy test gets `undefined` rather than `''`.

- [ ] **Step 3: Add the field to the PII set**

In `src/lib/crypto.js`, change line 229:

```js
const PII_FIELDS = ['name', 'birth_date', 'assigned_doctor_name', 'assigned_doctor_account_id'];
```

- [ ] **Step 4: Default the field for records written before it existed**

In `src/lib/crypto.js`, inside `decryptPatient`, replace the success branch so a
missing key reads as `''` rather than `undefined`:

```js
  try {
    const piiJson = await decryptValue(raw._enc);
    const pii = JSON.parse(piiJson);
    const { _enc, ...rest } = raw;
    // Records written before assigned_doctor_account_id existed have no such
    // key. Default it rather than migrating — nothing needs rewriting.
    return { assigned_doctor_account_id: '', ...rest, ...pii };
  } catch (err) {
```

Note the placement: the default comes **first** so a real decrypted value overrides it.

Then add the field to the failure fallback a few lines below:

```js
    return {
      ...rest,
      name: '[복호화 실패]',
      birth_date: '',
      assigned_doctor_name: '',
      assigned_doctor_account_id: '',
      _decryptionFailed: true,
    };
```

- [ ] **Step 5: Keep the localStore filter list in sync**

In `src/api/localStore.js`, change line 59:

```js
    const PII = ['name', 'birth_date', 'assigned_doctor_name', 'assigned_doctor_account_id'];
```

This list tells `Patient.filter` which keys cannot be matched before decryption.
Leaving it stale would make a filter on the new field silently return nothing.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- crypto.doctorAccount`
Expected: PASS, 4 tests.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: 135 passed. Pay attention to `src/pages/AdminBackup.test.js` and
`src/api/localStore.integrity.test.js` — both round-trip patient records.

- [ ] **Step 8: Commit**

```bash
git add src/lib/crypto.js src/lib/crypto.doctorAccount.test.js src/api/localStore.js
git commit -m "feat(patient): store the assigned doctor's account id, encrypted

Backs the account dropdown replacing free-text doctor entry (#3). Records
predating the field read back as an empty string — no write migration, so
existing patients stay readable and untouched."
```

---

### Task 5: Registration stops bundling upload and analysis

The formative evaluation's #9: 신규 환자 등록 should register a patient, nothing
more. Today `NewPatient` also uploads files, fakes their progress, and jumps
straight into analysis.

**Files:**
- Modify: `src/pages/NewPatient.jsx` — remove `BreathingFileSection` (lines 33-142), `simulateUpload`, `handleAddFiles`, file state, file refs, the file-list JSX, and the analysis auto-navigation

**Interfaces:**
- Consumes: nothing
- Produces: `NewPatient` navigates to `PatientDashboard` after creating a patient

- [ ] **Step 1: Delete the upload section component**

Remove the whole `BreathingFileSection` function (`src/pages/NewPatient.jsx:30-142`,
the JSDoc comment through its closing brace).

- [ ] **Step 2: Remove the upload state and handlers**

Delete these from the `NewPatient` component body:
- `const generalFileInputRef = useRef(null);` and `const dibhFileInputRef = useRef(null);`
- `const [generalFiles, setGeneralFiles] = useState([]);` and the `dibhFiles` equivalent
- the entire `simulateUpload` `useCallback`
- the entire `handleAddFiles` `useCallback`
- `hasUploadInProgress`, `generalReady`, `dibhReady`, `hasBothCategoriesForAnalysis`, `hasAnyFilesForAnalysis`

- [ ] **Step 3: Simplify handleSubmit**

Replace the body of `handleSubmit` between `setIsLoading(true);` and the `catch`
with this. Note `general_breathing_files` / `dibh_files` are gone — nothing in
the codebase reads them, and with upload removed they would always be empty:

```js
    setIsLoading(true);

    try {
      const newPatient = await Patient.create({
        name: formData.name,
        birth_date: formData.birth_date,
        gender: formData.gender,
        treatment_session_count: formData.treatment_session_count,
        patient_code: formData.patient_code,
        assigned_doctor_name: formData.assigned_doctor_name.trim(),
        assigned_doctor_account_id: formData.assigned_doctor_account_id,
        expected_treatment_date: '',
        treatment_method: '',
        breathing_method: '',
      });

      await queryClient.invalidateQueries({ queryKey: ['patients'] });

      setPostRegistrationModal({
        open: true,
        patientId: newPatient.id,
        message: '등록이 완료되었습니다. 호흡 데이터는 환자 대시보드에서 추가할 수 있습니다.',
      });
    } catch (err) {
```

Also add `assigned_doctor_account_id: ''` to the initial `formData` state object
(Task 9 fills it in; this task only carries it through).

- [ ] **Step 4: Remove the upload JSX and the in-progress guard**

Delete both `<BreathingFileSection …/>` usages and the surrounding card, and
remove the `hasUploadInProgress` toast block from `handleSubmit`.

- [ ] **Step 5: Verify by hand**

```bash
npm run dev
```
Register a patient. Expected: no upload zones on the page; after 등록 완료 the
post-registration modal appears and leads to the dashboard; no jump to the
analysis screen.

- [ ] **Step 6: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: no unused-variable errors (they would flag a missed deletion), 135 passed.

- [ ] **Step 7: Commit**

```bash
git add src/pages/NewPatient.jsx
git commit -m "refactor(newpatient): register a patient and nothing else

Formative evaluation #9 — registration bundled file upload and jumped
straight into analysis. Also drops the faked upload progress, which marked
files 'done' while nothing had been written, and stops writing
general_breathing_files/dibh_files, which nothing reads."
```

---

### Task 6: Merge upload into the file-selection screen

`AnalysisFileSelect` gains the upload zones so upload and list live on one
screen (#9). It survives rather than `BreathingDataUpload` because it already
owns analysis orchestration, abort handling and the error modals.

**Files:**
- Modify: `src/pages/AnalysisFileSelect.jsx` — add upload per category section
- Modify: `src/pages/index.jsx:88-89` — point `/BreathingDataUpload` at a redirect
- Modify: `src/pages/PatientDashboard.jsx:172-178` — collapse the two buttons
- Delete: `src/pages/BreathingDataUpload.jsx`

**Interfaces:**
- Consumes: `detectCategoryFromFileName` (Task 1), `breathingFileDisplayName` (Task 3)
- Produces: a single route `/analysisfileselect` handling upload + selection + analysis

- [ ] **Step 1: Lift the upload section into a shared component**

Create `src/components/breathing/BreathingCategorySection.jsx`, porting the
markup from `BreathingDataUpload.jsx:29-180` (`PatientBreathingUploadSection`)
with three changes: the drop zone sits above the list, each saved row carries a
selection radio, and there is **no fake progress** — a pending file is either
`saving` or `failed`.

```jsx
import { CloudUpload, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatFileSize, fileTypeBadge } from '@/lib/files';
import { breathingFileDisplayName } from '@/lib/breathingFileDisplayName';
import { format } from 'date-fns';

function formatImportedAt(iso) {
  try {
    return format(new Date(iso), 'yyyy.MM.dd HH:mm');
  } catch {
    return iso;
  }
}

const CATEGORY_STYLE = {
  general: {
    title: '일반호흡 (GEN)',
    accent: 'from-[#8B5CF6] to-[#6366F1]',
    badge: 'border-[#8B5CF6]/50 bg-[#8B5CF6]/15 text-[#C4B5FD]',
    ring: 'hover:border-[#8B5CF6]/55',
  },
  dibh: {
    title: 'DIBH 호흡 (DIBH)',
    accent: 'from-[#3B82F6] to-[#22D3EE]',
    badge: 'border-[#3B82F6]/50 bg-[#3B82F6]/15 text-[#93C5FD]',
    ring: 'hover:border-[#3B82F6]/55',
  },
};

export default function BreathingCategorySection({
  category,
  patient,
  savedFiles,
  pendingFiles,
  selectedId,
  onSelect,
  onAddFiles,
  onRequestDeleteSaved,
  inputRef,
}) {
  const style = CATEGORY_STYLE[category];

  const onDrop = (e) => {
    e.preventDefault();
    const list = e.dataTransfer?.files;
    if (list?.length) onAddFiles(list);
  };

  return (
    <section className="rounded-xl border border-[#30363D] bg-[#1C2128] p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-white">
        <span className={cn('h-5 w-1 rounded-full bg-gradient-to-b', style.accent)} />
        {style.title}
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', style.badge)}>
          {category === 'general' ? 'GEN' : 'DIBH'}
        </span>
      </h2>
      <p className="mb-5 pl-3 text-xs text-[#8B949E]">
        {category === 'general'
          ? '자유 호흡 상태로 측정한 데이터를 올려 주세요.'
          : '숨을 참은 상태(DIBH)로 측정한 데이터를 올려 주세요.'}
      </p>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'mb-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#30363D] bg-[#0D1117]/50 px-4 py-8 text-center transition-colors hover:bg-[#0D1117]',
          style.ring
        )}
      >
        <CloudUpload className="mb-2 h-9 w-9 text-[#8B949E]" />
        <p className="text-sm font-medium text-white">
          {style.title} 파일을 선택하세요
        </p>
        <p className="mt-1 text-xs text-[#8B949E]">CSV, VXP 지원 (다중 선택 가능 · 분석은 CSV만)</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.vxp,text/csv,application/octet-stream"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onAddFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {savedFiles.length === 0 && pendingFiles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#30363D] px-4 py-6 text-center text-sm text-[#8B949E]">
          등록된 파일이 없습니다
        </p>
      ) : (
        <ul className="space-y-3">
          {savedFiles.map((f) => {
            const active = selectedId === f.id;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onSelect(f.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                    active
                      ? 'border-[#3B82F6] bg-[#3B82F6]/10'
                      : 'border-[#30363D]/80 bg-[#252A32] hover:border-[#3B82F6]/40'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                      active ? 'border-[#3B82F6] bg-[#3B82F6]' : 'border-[#8B949E]'
                    )}
                    aria-hidden
                  >
                    {active && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </span>
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#30363D] bg-[#1C2128] text-[10px] font-bold uppercase tracking-wide text-[#C9D1D9]"
                    aria-hidden
                  >
                    {fileTypeBadge(f.original_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">
                      {breathingFileDisplayName(f.original_name, patient)}
                    </span>
                    <span className="mt-0.5 block text-xs text-[#9BA1A6]">
                      {formatFileSize(f.size_bytes)} · {formatImportedAt(f.imported_at)}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    asChild
                    className="h-9 w-9 shrink-0 text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                  >
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="파일 삭제"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestDeleteSaved({
                          id: f.id,
                          name: breathingFileDisplayName(f.original_name, patient),
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          onRequestDeleteSaved({
                            id: f.id,
                            name: breathingFileDisplayName(f.original_name, patient),
                          });
                        }
                      }}
                    >
                      <X className="h-4 w-4" strokeWidth={2} />
                    </span>
                  </Button>
                </button>
              </li>
            );
          })}

          {pendingFiles.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-2xl border border-[#30363D]/80 bg-[#252A32]/60 px-4 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#C9D1D9]">{f.name}</span>
                <span className="mt-0.5 block text-xs">
                  {f.status === 'failed' ? (
                    <span className="text-[#EF4444]">{f.error}</span>
                  ) : (
                    <span className="text-[#8B949E]">저장 중…</span>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire the sections into AnalysisFileSelect**

In `src/pages/AnalysisFileSelect.jsx`, add the imports and the save handler, and
replace the existing two file-list blocks with two `BreathingCategorySection`
instances. The save path is real — no timers:

```jsx
import BreathingCategorySection from '@/components/breathing/BreathingCategorySection';
import { createBreathingFile } from '@/api/entities';
import { isAllowedBreathingUploadFile } from '@/lib/breathingFileFormat';

// … inside the component:
const generalInputRef = useRef(null);
const dibhInputRef = useRef(null);
const [pending, setPending] = useState({ general: [], dibh: [] });

const persistFiles = useCallback(
  async (files, category) => {
    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setPending((p) => ({
        ...p,
        [category]: [...p[category], { id, name: file.name, status: 'saving' }],
      }));
      try {
        await createBreathingFile({ patientId, category, file });
        setPending((p) => ({ ...p, [category]: p[category].filter((f) => f.id !== id) }));
      } catch (err) {
        console.error('[AnalysisFileSelect] createBreathingFile failed:', err);
        setPending((p) => ({
          ...p,
          [category]: p[category].map((f) =>
            f.id === id
              ? { ...f, status: 'failed', error: '파일 저장 중 오류가 발생했습니다. 다시 시도해 주세요.' }
              : f
          ),
        }));
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['breathingFiles'] });
  },
  [patientId, queryClient]
);
```

Task 7 inserts the category check and confirmation between the file picker and
`persistFiles`. For now, wire `onAddFiles` to filter by extension and call
`persistFiles` directly:

```jsx
const handleAddFiles = useCallback(
  (fileList, category) => {
    const incoming = Array.from(fileList).filter(isAllowedBreathingUploadFile);
    const skipped = Array.from(fileList).length - incoming.length;
    if (skipped > 0) {
      toast({
        title: 'CSV 또는 VXP만 업로드할 수 있습니다',
        description: `${skipped}개 파일은 지원 형식이 아니어서 제외되었습니다.`,
        variant: 'destructive',
      });
    }
    if (incoming.length) void persistFiles(incoming, category);
  },
  [persistFiles]
);
```

- [ ] **Step 3: Update the page title and header**

Change the `PatientFlowPageHeader` title on `AnalysisFileSelect` to
`호흡 데이터 · 분석` so it reflects both jobs, and update the intro line to
`파일을 추가하고, 분석할 일반호흡·DIBH 파일을 하나씩 선택해 주세요.`

- [ ] **Step 4: Redirect the old upload route**

In `src/pages/index.jsx`, remove the `BreathingDataUpload` import and its entry
in `PAGES`, then replace both routes so deep links still resolve:

```jsx
<Route path="/BreathingDataUpload" element={<ProtectedRoute><BreathingUploadRedirect /></ProtectedRoute>} />
<Route path="/breathingdataupload" element={<ProtectedRoute><BreathingUploadRedirect /></ProtectedRoute>} />
```

Create `src/pages/BreathingUploadRedirect.jsx`:

```jsx
import { Navigate, useSearchParams } from 'react-router-dom';
import { createPageUrl, getPatientIdFromSearchParams } from '@/utils';

/**
 * Upload and file selection merged into one screen (formative evaluation #9).
 * This keeps older deep links working.
 */
export default function BreathingUploadRedirect() {
  const [searchParams] = useSearchParams();
  const patientId = getPatientIdFromSearchParams(searchParams);
  const target = patientId
    ? `${createPageUrl('AnalysisFileSelect')}?patientId=${encodeURIComponent(patientId)}`
    : createPageUrl('Home');
  return <Navigate to={target} replace />;
}
```

- [ ] **Step 5: Collapse the dashboard's two buttons**

In `src/pages/PatientDashboard.jsx`, delete `handleAddData` and point the
remaining action at the merged screen. Label it `호흡 데이터 · 분석` when there
is no calibration yet and `다시 분석` when there is.

- [ ] **Step 6: Delete the old page**

```bash
git rm src/pages/BreathingDataUpload.jsx
```

- [ ] **Step 7: Verify by hand**

```bash
npm run dev
```
From a patient dashboard, open the merged screen. Expected: upload zone above
each category's list; a dropped file appears as 저장 중… then becomes a
selectable row with no artificial delay; selecting one file per category enables
분석 시작; visiting `/breathingdataupload?patientId=…` redirects.

- [ ] **Step 8: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: 135 passed.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(upload): merge file upload into the analysis screen

Formative evaluation #9 — upload and the file list were separate screens.
Upload now sits above each category's list on the screen that runs the
analysis. Removes the simulated 0.8-1.7s progress in favour of real
saving/failed states, and shows files under the patient's name."
```

---

### Task 7: Three-layer guard against wrong-category upload

The critical item (#2). Uploading a file into the wrong category changes the
resulting DIBH type, so this strengthens the `RM-DBF-010` control.

**Files:**
- Modify: `src/pages/AnalysisFileSelect.jsx` — mismatch dialog + confirmation dialog
- Create: `src/components/breathing/UploadConfirmDialog.jsx`

**Interfaces:**
- Consumes: `detectCategoryFromFileName` (Task 1), `persistFiles` (Task 6)
- Produces: nothing consumed later

- [ ] **Step 1: Build the confirmation dialog**

Create `src/components/breathing/UploadConfirmDialog.jsx`. It lists every
pending file against its destination and marks mismatches:

```jsx
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const LABEL = { general: '일반호흡 (GEN)', dibh: 'DIBH 호흡 (DIBH)' };

/**
 * Registration confirmation before breathing files are written (MFDS
 * RM-DBF-010). Uploading into the wrong category changes the DIBH type, so
 * the operator confirms the destination of every file explicitly.
 *
 * @param {{items: Array<{name: string, category: 'general'|'dibh', detected: 'general'|'dibh'|null}>}} props
 */
export default function UploadConfirmDialog({ open, items, onCancel, onConfirm }) {
  const mismatches = items.filter((i) => i.detected && i.detected !== i.category);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        hideClose
        className="max-w-[min(100%,460px)] border border-[#30363D] bg-[#1C2128] p-0 sm:rounded-2xl"
      >
        <DialogTitle className="sr-only">업로드 확인</DialogTitle>
        <DialogDescription className="sr-only">
          등록할 파일과 저장될 구분을 확인합니다.
        </DialogDescription>

        <div className="px-6 pb-6 pt-7">
          <p className="text-base font-bold text-white sm:text-lg">
            아래 내용으로 등록할까요?
          </p>
          <p className="mt-1.5 text-sm text-[#8B949E]">
            구분을 잘못 지정하면 분석 결과(Type)가 달라집니다.
          </p>

          <ul className="mt-5 space-y-2">
            {items.map((item, i) => {
              const bad = item.detected && item.detected !== item.category;
              return (
                <li
                  key={`${item.name}-${i}`}
                  className={cn(
                    'rounded-xl border px-4 py-3',
                    bad ? 'border-[#EF4444]/60 bg-[#EF4444]/10' : 'border-[#30363D] bg-[#252A32]'
                  )}
                >
                  <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                  <p className={cn('mt-1 text-xs', bad ? 'text-[#FCA5A5]' : 'text-[#8B949E]')}>
                    {LABEL[item.category]}(으)로 저장
                    {bad && ` · 파일명은 ${LABEL[item.detected]}(으)로 보입니다`}
                  </p>
                </li>
              );
            })}
          </ul>

          {mismatches.length > 0 && (
            <div className="mt-4 flex gap-2.5 rounded-xl border border-[#EF4444]/60 bg-[#EF4444]/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#EF4444]" />
              <p className="text-xs leading-relaxed text-[#FCA5A5]">
                파일명과 구분이 일치하지 않는 파일이 {mismatches.length}개 있습니다.
                그대로 등록하면 분석 결과가 달라질 수 있습니다.
              </p>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="h-12 flex-1 rounded-xl border-[#30363D] bg-[#252A32] text-white hover:bg-[#30363D]"
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              className={cn(
                'h-12 flex-1 rounded-xl font-semibold text-white',
                mismatches.length > 0
                  ? 'bg-[#EF4444] hover:bg-[#DC2626]'
                  : 'bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] hover:from-[#2563EB] hover:to-[#7C3AED]'
              )}
            >
              {mismatches.length > 0 ? '그대로 등록' : '등록'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Route every add through detection and confirmation**

In `src/pages/AnalysisFileSelect.jsx`, replace the Task 6 `handleAddFiles` so it
stages files instead of saving immediately:

```jsx
import { detectCategoryFromFileName } from '@/lib/breathingFileCategory';
import UploadConfirmDialog from '@/components/breathing/UploadConfirmDialog';

const [confirmState, setConfirmState] = useState(null); // { items, files, category }

const handleAddFiles = useCallback((fileList, category) => {
  const incoming = Array.from(fileList).filter(isAllowedBreathingUploadFile);
  const skipped = Array.from(fileList).length - incoming.length;
  if (skipped > 0) {
    toast({
      title: 'CSV 또는 VXP만 업로드할 수 있습니다',
      description: `${skipped}개 파일은 지원 형식이 아니어서 제외되었습니다.`,
      variant: 'destructive',
    });
  }
  if (!incoming.length) return;

  setConfirmState({
    category,
    files: incoming,
    items: incoming.map((f) => ({
      name: f.name,
      category,
      detected: detectCategoryFromFileName(f.name),
    })),
  });
}, []);
```

Render the dialog near the other dialogs:

```jsx
<UploadConfirmDialog
  open={!!confirmState}
  items={confirmState?.items ?? []}
  onCancel={() => setConfirmState(null)}
  onConfirm={() => {
    const { files, category } = confirmState;
    setConfirmState(null);
    void persistFiles(files, category);
  }}
/>
```

The dialog covers layers 2 and 3 together: a mismatch is surfaced in red the
moment the file is picked, and nothing is written until 등록 is pressed.

- [ ] **Step 3: Verify each layer by hand**

```bash
npm run dev
```

| Action | Expected |
|---|---|
| Drop `TYPE_A_GEN_20260508.csv` on 일반호흡 | Dialog, no red, button reads 등록 |
| Drop `TYPE_A_DIBH_20260508.csv` on 일반호흡 | Red row: `파일명은 DIBH 호흡 (DIBH)(으)로 보입니다`, warning banner, button reads 그대로 등록 |
| Press 취소 | Nothing saved; the list is unchanged |
| Drop `breathing_2026.csv` (renamed copy) | Dialog with no red — detection returned null, so no false warning |
| Drop two files at once | Both listed, each with its own verdict |

- [ ] **Step 4: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: 135 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AnalysisFileSelect.jsx src/components/breathing/UploadConfirmDialog.jsx
git commit -m "feat(upload): confirm the category before writing breathing files

The formative evaluation's highest-priority item: uploading a file into the
wrong category changes the resulting Type, so this is a safety issue rather
than a convenience one. Strengthens the RM-DBF-010 control from a format
check to detect -> warn -> confirm; nothing is written until the operator
confirms each file's destination."
```

---

### Task 8: Typed birth-date field in both screens

**Files:**
- Create: `src/components/common/BirthDateField.jsx`
- Modify: `src/pages/NewPatient.jsx` (the DOB popover block)
- Modify: `src/pages/PatientDashboard.jsx` (the edit modal's DOB block, ~lines 596-635)

**Interfaces:**
- Consumes: `normalizeBirthDateInput`, `formatBirthDateForDisplay` (Task 2)
- Produces: `<BirthDateField id value onChange invalid />` where `value`/`onChange` speak `yyyy-MM-dd`

- [ ] **Step 1: Build the field**

Create `src/components/common/BirthDateField.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { darkPopoverCalendarClassNames } from '@/lib/darkPopoverCalendar';
import { normalizeBirthDateInput, formatBirthDateForDisplay } from '@/lib/birthDate';
import { cn } from '@/lib/utils';
import { format, parseISO, isValid } from 'date-fns';

/**
 * Birth date: type it or pick it. Every formative-evaluation tester found the
 * calendar-only control inconvenient. Primary typed form is 19900512;
 * separators are accepted. Value in and out is always yyyy-MM-dd.
 */
export default function BirthDateField({ id, value, onChange, invalid = false }) {
  const [text, setText] = useState(formatBirthDateForDisplay(value));
  const [open, setOpen] = useState(false);
  const [localError, setLocalError] = useState(false);

  // Follow external changes (edit modal opening on a different patient).
  useEffect(() => {
    setText(formatBirthDateForDisplay(value));
    setLocalError(false);
  }, [value]);

  const commit = (raw) => {
    if (!raw.trim()) {
      setLocalError(false);
      onChange('');
      return;
    }
    const iso = normalizeBirthDateInput(raw);
    if (iso) {
      setLocalError(false);
      setText(iso);
      onChange(iso);
    } else {
      setLocalError(true);
    }
  };

  const showError = invalid || localError;

  return (
    <div>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="numeric"
          placeholder="19900512"
          value={text}
          aria-invalid={showError}
          onChange={(e) => {
            setText(e.target.value);
            if (localError) setLocalError(false);
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(e.currentTarget.value);
            }
          }}
          className={cn(
            'h-12 flex-1 rounded-xl border bg-[#0D1117] text-white placeholder:text-[#6E7681]',
            showError ? 'border-[#EF4444]' : 'border-[#30363D] focus:border-[#3B82F6]'
          )}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="달력에서 선택"
              className="h-12 w-12 shrink-0 rounded-xl border-[#30363D] bg-[#252A32] text-[#C9D1D9] hover:bg-[#30363D] hover:text-white"
            >
              <CalendarIcon className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto border-[#30363D] bg-[#1C2128] p-0" align="end">
            <Calendar
              mode="single"
              captionLayout="dropdown-buttons"
              fromYear={1900}
              toYear={new Date().getFullYear()}
              selected={value && isValid(parseISO(value)) ? parseISO(value) : undefined}
              defaultMonth={value && isValid(parseISO(value)) ? parseISO(value) : undefined}
              onSelect={(date) => {
                const iso = date ? format(date, 'yyyy-MM-dd') : '';
                setText(iso);
                setLocalError(false);
                onChange(iso);
                setOpen(false);
              }}
              classNames={darkPopoverCalendarClassNames}
            />
          </PopoverContent>
        </Popover>
      </div>
      <p className={cn('mt-1.5 text-xs', showError ? 'text-[#EF4444]' : 'text-[#8B949E]')}>
        {showError
          ? '생년월일을 확인해 주세요. 예: 19900512'
          : '예: 19900512 (구분자 입력 가능)'}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Use it in NewPatient**

Replace the whole `Popover`/`Calendar` block under the 생년월일 label with:

```jsx
<BirthDateField
  id="new-birth-date"
  value={formData.birth_date}
  invalid={fieldErrors.birth_date}
  onChange={(iso) => {
    setFormData({ ...formData, birth_date: iso });
    if (fieldErrors.birth_date) setFieldErrors((prev) => ({ ...prev, birth_date: false }));
  }}
/>
```

Remove the now-unused `birthDatePopoverOpen` state and the `CalendarIcon`,
`Popover`, `Calendar`, `darkPopoverCalendarClassNames`, `format`, `parseISO`,
`isValid` imports if nothing else on the page uses them.

- [ ] **Step 3: Use it in the dashboard edit modal**

Replace the equivalent block in `src/pages/PatientDashboard.jsx`:

```jsx
<BirthDateField
  id="edit-birth-date"
  value={editFormData.birth_date}
  onChange={(iso) => setEditFormData({ ...editFormData, birth_date: iso })}
/>
```

Remove `editBirthPopoverOpen` and any imports that become unused.

- [ ] **Step 4: Fix the read-only display format**

`PatientDashboard.jsx:315` renders the stored date with `yyyy.MM.dd` — keep
that, it is already Korean-ordered. Confirm no `MM/dd/yyyy` remains:

```bash
grep -rn "MM/dd/yyyy" src/
```
Expected: no results.

- [ ] **Step 5: Verify by hand**

```bash
npm run dev
```
Type `19900512` in registration → field shows `1990-05-12` on blur. Type
`19900231` → red, message `생년월일을 확인해 주세요. 예: 19900512`. Type
`20991231` → rejected as future. Calendar button still opens and selects.
Repeat in the dashboard edit modal.

- [ ] **Step 6: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: 135 passed.

- [ ] **Step 7: Commit**

```bash
git add src/components/common/BirthDateField.jsx src/pages/NewPatient.jsx src/pages/PatientDashboard.jsx
git commit -m "feat(patient): let operators type the birth date

Formative evaluation #1 — the lowest-scoring task, flagged by all five
testers. One shared field replaces the calendar-only picker that was
duplicated in registration and the dashboard edit modal, and the display
format changes from MM/dd/yyyy to yyyy-MM-dd to match what is typed."
```

---

### Task 9: Doctor account selection in both screens

**Files:**
- Create: `src/components/common/DoctorSelectField.jsx`
- Modify: `src/pages/NewPatient.jsx` (담당 의사 input)
- Modify: `src/pages/PatientDashboard.jsx` (edit modal 담당 의사 input, ~line 582)

**Interfaces:**
- Consumes: `UserStore.list()` from `@/api/authStore`, `assigned_doctor_account_id` (Task 4)
- Produces: `<DoctorSelectField name accountId onChange />` where
  `onChange({ name, accountId })`

- [ ] **Step 1: Build the field**

Create `src/components/common/DoctorSelectField.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserStore } from '@/api/authStore';

const MANUAL = '__manual__';

/**
 * Doctor assignment. Free-text entry produced spelling variants and duplicate
 * names (formative evaluation #3), so the default is a registered account.
 * "직접 입력" stays for physicians without an account.
 *
 * Only id/username/displayName are read off the account list — UserStore.list()
 * also returns role and lockout state, which this component drops immediately
 * and never renders.
 */
export default function DoctorSelectField({ name, accountId, onChange }) {
  const [accounts, setAccounts] = useState([]);
  const [manual, setManual] = useState(!accountId && !!name);

  useEffect(() => {
    let alive = true;
    UserStore.list()
      .then((list) => {
        if (!alive) return;
        setAccounts(list.map(({ id, username, displayName }) => ({ id, username, displayName })));
      })
      .catch((err) => console.error('[DoctorSelectField] account list failed:', err));
    return () => {
      alive = false;
    };
  }, []);

  // An account that has since been deleted: keep showing the stored name.
  const known = accounts.some((a) => a.id === accountId);
  const selectValue = manual || (accountId && !known) ? MANUAL : accountId || '';

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === MANUAL) {
            setManual(true);
            onChange({ name: '', accountId: '' });
            return;
          }
          const picked = accounts.find((a) => a.id === v);
          setManual(false);
          onChange({ name: picked?.displayName || '', accountId: v });
        }}
      >
        <SelectTrigger className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] text-white">
          <SelectValue placeholder="담당 의사를 선택하세요" />
        </SelectTrigger>
        <SelectContent className="border-[#30363D] bg-[#1C2128] text-white">
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id} className="focus:bg-[#30363D]">
              {a.displayName} ({a.username})
            </SelectItem>
          ))}
          <SelectItem value={MANUAL} className="focus:bg-[#30363D]">
            직접 입력
          </SelectItem>
        </SelectContent>
      </Select>

      {selectValue === MANUAL && (
        <Input
          placeholder="담당 의사 이름을 입력하세요"
          value={name}
          onChange={(e) => onChange({ name: e.target.value, accountId: '' })}
          className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] text-white placeholder:text-[#6E7681] focus:border-[#3B82F6]"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Use it in NewPatient**

Replace the 담당 의사 `Input` with:

```jsx
<DoctorSelectField
  name={formData.assigned_doctor_name}
  accountId={formData.assigned_doctor_account_id}
  onChange={({ name, accountId }) =>
    setFormData({ ...formData, assigned_doctor_name: name, assigned_doctor_account_id: accountId })
  }
/>
```

The initial `formData` should default to the logged-in user's account so the
common case needs no interaction:

```js
assigned_doctor_name: session?.displayName || session?.username || '',
assigned_doctor_account_id: session?.userId || session?.id || '',
```

Check which key the session object carries before writing this — run
`grep -n "userId\|id:" src/api/authStore.js | sed -n '1,40p'` and use the one
`getSession()` actually returns.

- [ ] **Step 3: Use it in the dashboard edit modal**

```jsx
<DoctorSelectField
  name={editFormData.assigned_doctor_name}
  accountId={editFormData.assigned_doctor_account_id}
  onChange={({ name, accountId }) =>
    setEditFormData({
      ...editFormData,
      assigned_doctor_name: name,
      assigned_doctor_account_id: accountId,
    })
  }
/>
```

Add `assigned_doctor_account_id` to the `editFormData` initial state and to the
`useEffect` that fills it from the patient (`PatientDashboard.jsx:236-244`), and
include it in the `Patient.update` call (~line 215).

- [ ] **Step 4: Verify by hand**

```bash
npm run dev
```
Register a patient: the dropdown lists accounts and defaults to the logged-in
one. Pick 직접 입력 → a text box appears. Open an existing patient created
before this change → the stored name still shows (the account is unknown, so
the field falls back to manual). Save and reopen → the value persists.

- [ ] **Step 5: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: 135 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/common/DoctorSelectField.jsx src/pages/NewPatient.jsx src/pages/PatientDashboard.jsx
git commit -m "feat(patient): pick the assigned doctor from registered accounts

Formative evaluation #3 — free-text entry produced spelling variants and
duplicates. 직접 입력 stays for physicians without an account, and patients
whose doctor account no longer exists keep showing the stored name."
```

---

### Task 10: Separate search results from the recent list

**Files:**
- Modify: `src/pages/Home.jsx:14-34` (state, filtering) and the list JSX

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed later

- [ ] **Step 1: Reset pagination when the search changes**

`Home.jsx` never resets `currentPage`, so searching from page 3 shows an empty
list even when there are matches. Replace the search input's `onChange`:

```jsx
onChange={(e) => {
  setSearchTerm(e.target.value);
  setCurrentPage(1);
}}
```

- [ ] **Step 2: Branch the heading and the empty state**

Introduce a searching flag and use it for the heading, the count and the empty
copy:

```jsx
const isSearching = searchTerm.trim().length > 0;

const filteredPatients = patients.filter((patient) =>
  patient.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
  patient.patient_code?.toLowerCase().includes(searchTerm.toLowerCase())
);
```

Replace the single `최근 치료 환자` heading (both the loading branch and the
loaded branch) with:

```jsx
<div className="mb-3 flex items-center justify-between">
  <h2 className="text-sm font-bold uppercase tracking-wide text-[#8B949E]">
    {isSearching ? `검색 결과 (${filteredPatients.length}건)` : '최근 치료 환자'}
  </h2>
  {isSearching && (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        setSearchTerm('');
        setCurrentPage(1);
      }}
      className="h-8 gap-1.5 text-[#8B949E] hover:bg-[#1C2128] hover:text-white"
    >
      <X className="h-3.5 w-3.5" />
      검색 해제
    </Button>
  )}
</div>
```

Import `X` from `lucide-react`.

- [ ] **Step 3: Give the search branch its own empty state**

Replace the `등록된 환자가 없습니다` block:

```jsx
<div className="rounded-xl border border-dashed border-[#30363D] py-10 text-center">
  <p className="text-sm text-[#8B949E]">
    {isSearching ? '검색 결과가 없습니다' : '등록된 환자가 없습니다'}
  </p>
</div>
```

- [ ] **Step 4: Mark the search list visually distinct**

Wrap the results list in a left accent so it does not read as the recent list:

```jsx
<div className={cn('space-y-3', isSearching && 'border-l-2 border-[#3B82F6]/60 pl-3')}>
```

Import `cn` from `@/lib/utils`.

- [ ] **Step 5: Verify by hand**

```bash
npm run dev
```
With 6+ patients: go to page 2, type in the search → results appear (before this
change the list went blank). The heading reads 검색 결과 (N건) with a 검색 해제
button and a blue accent rail. Clear it → 최근 치료 환자 returns.

- [ ] **Step 6: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: 135 passed.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Home.jsx
git commit -m "fix(home): tell search results apart from the recent patient list

Formative evaluation #4 — search results appeared under a heading reading
최근 치료 환자. Also fixes a live defect: the page index was never reset, so
searching while past page 1 showed an empty list."
```

---

### Task 11: Visible back and home controls

**Files:**
- Modify: `src/components/common/PatientFlowPageHeader.jsx`

**Interfaces:**
- Consumes: nothing
- Produces: the same `{ backHref, title, patient, trailing, className }` props — no call-site changes

- [ ] **Step 1: Rewrite the header**

Replace the whole file:

```jsx
import React from 'react';
import { ArrowLeft, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';
import { cn } from '@/lib/utils';

/**
 * Patient-flow header. The back control used to be an unlabelled ghost icon at
 * #8B949E and there was no home control at all; both were raised in the
 * formative evaluation (#8). Back is now labelled and bordered, home is
 * always present, and each is a 44px touch target.
 */
export function PatientFlowPageHeader({ backHref, title, patient, trailing = null, className }) {
  return (
    <div
      className={cn(
        'sticky top-0 z-20 mb-4 flex items-center justify-between gap-3 bg-[#0D1117] py-2',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Button
          asChild
          variant="outline"
          className="h-11 shrink-0 gap-1.5 rounded-xl border-[#30363D] bg-[#252A32] px-3 text-[#C9D1D9] hover:bg-[#30363D] hover:text-white"
        >
          <Link to={backHref} aria-label="뒤로 가기">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-semibold">뒤로</span>
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-white">{title}</h1>
          {patient && (
            <p className="truncate text-sm text-[#8B949E]">
              {patient.name} • {patient.patient_code}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {trailing}
        <Button
          asChild
          variant="outline"
          className="h-11 shrink-0 gap-1.5 rounded-xl border-[#30363D] bg-[#252A32] px-3 text-[#C9D1D9] hover:bg-[#30363D] hover:text-white"
        >
          <Link to={createPageUrl('Home')} aria-label="홈으로 이동">
            <Home className="h-5 w-5" />
            <span className="text-sm font-semibold">홈</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Check every call site still looks right**

```bash
grep -rn "PatientFlowPageHeader" src/pages/
```
Open each listed page in the browser. `TypeDecision` and any page passing
`trailing` must show trailing content **and** the home button without overlap.

- [ ] **Step 3: Verify by hand**

```bash
npm run dev
```
On a narrow window the title truncates rather than pushing the buttons off
screen. Both buttons are at least 44px tall.

- [ ] **Step 4: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: 135 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/PatientFlowPageHeader.jsx
git commit -m "feat(nav): label the back control and add a home button

Formative evaluation #8 — back was an unlabelled #8B949E icon and no home
control existed anywhere in the patient flow. One shared header, so every
patient screen inherits both."
```

---

### Task 12: Graph tabs instead of a toggle button

**Files:**
- Modify: `src/components/breathing/AnalysisPlaybackPanel.jsx:104-131`

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed later

- [ ] **Step 1: Replace the toggle with tabs**

The panel already shows one graph at a time; only the control changes. Delete
`toggleGraph`, `toggleLabel` and the `Repeat2` import, then replace the header
row:

```jsx
      <div className="mb-4">
        <h3 className="mb-3 text-base font-bold text-white sm:text-lg">호흡 파형 재생</h3>
        <div
          role="tablist"
          aria-label="그래프 선택"
          className="inline-flex rounded-xl border border-[#30363D] bg-[#0D1117] p-1"
        >
          {[
            { key: 'general', label: '일반 호흡' },
            { key: 'dibh', label: 'DIBH' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={graphMode === tab.key}
              onClick={() => setGraphMode(tab.key)}
              className={cn(
                'min-h-[40px] rounded-lg px-5 text-sm font-semibold transition-colors',
                graphMode === tab.key
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-[#8B949E] hover:bg-[#252A32] hover:text-white'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
```

The `title` variable becomes unused — remove it. The existing
`useEffect` that resets `currentTime`/`playing` on `graphMode` change is
unchanged and still does the right thing.

- [ ] **Step 2: Verify by hand**

```bash
npm run dev
```
On 호흡 분석 결과: both tabs are visible at once, the active one is filled blue,
switching resets playback to 00:00, and the chart changes between the general
cycle overlay and the DIBH hold thresholds.

- [ ] **Step 3: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: 135 passed.

- [ ] **Step 4: Commit**

```bash
git add src/components/breathing/AnalysisPlaybackPanel.jsx
git commit -m "feat(report): switch breathing graphs with tabs

Formative evaluation #7. The panel already showed one graph at a time, but a
single toggle button whose label flipped between the two never revealed that
a second graph existed or which one was on screen."
```

---

### Task 13: Type-specific recommended actions

**Draft copy — pending clinical sign-off.** Written as 제안 rather than
instruction because `RM-DBF-007 분석결과 과신` and `RM-DBF-014 분석 결과 오해석`
are precisely the risks directive wording aggravates.

**Files:**
- Modify: `src/lib/breathingAnalysisReportContent.js`
- Modify: `src/pages/TypeDecision.jsx`

**Interfaces:**
- Consumes: nothing
- Produces: `RECOMMENDED_ACTIONS[type] = { headline, steps: string[] }`, `CLINICAL_DISCLAIMER`

- [ ] **Step 1: Add the copy**

Append to `src/lib/breathingAnalysisReportContent.js`:

```js
/**
 * Type-specific next steps (formative evaluation #5 — the result screen said
 * what the type was but not what to do about it).
 *
 * DRAFT — pending clinical review by the 더픽트 clinical team. Phrased as a
 * suggestion, never an instruction: RM-DBF-007 (over-reliance on the analysis)
 * and RM-DBF-014 (misreading the result) are the risks directive wording makes
 * worse. Keep CLINICAL_DISCLAIMER displayed alongside.
 */
export const RECOMMENDED_ACTIONS = {
  A: {
    headline: 'DIBH 치료 계획 수립을 고려할 수 있습니다',
    steps: [
      '호흡 유지 시간과 안정성이 DIBH 기준을 충족합니다.',
      '동일 조건에서 1회 더 측정하여 재현성을 확인하는 것을 권장합니다.',
      '치료 계획 수립 시 실제 호흡 유지 가능 시간을 함께 검토해 주세요.',
    ],
  },
  B: {
    headline: '추가 훈련 후 재평가를 고려할 수 있습니다',
    steps: [
      '호흡은 안정적이나 DIBH 기준에는 도달하지 않았습니다.',
      '호흡 유지 훈련을 진행한 뒤 재측정하는 것을 권장합니다.',
      '재측정 시 측정 조건(자세·시간대)을 이전과 동일하게 유지해 주세요.',
    ],
  },
  C: {
    headline: '호흡 안정화가 우선 필요할 수 있습니다',
    steps: [
      '호흡이 짧고 변동이 커 현재 조건에서는 DIBH 적용이 어려울 수 있습니다.',
      '호흡 안정화 훈련을 먼저 진행하는 것을 권장합니다.',
      '측정 중 환자 상태나 자세에 문제가 없었는지 확인 후 재측정을 고려해 주세요.',
    ],
  },
};

/** Shown with every recommendation — the analysis supports, never replaces, clinical judgement. */
export const CLINICAL_DISCLAIMER =
  '본 결과는 참고 정보이며, 최종 치료 방침은 담당 의료진의 판단에 따릅니다.';
```

- [ ] **Step 2: Render it on the result screen**

In `src/pages/TypeDecision.jsx`, import the new constants and insert this card
between the metrics card and `<AnalysisPlaybackPanel />`:

```jsx
<div className="rounded-2xl border border-[#30363D] bg-[#1C2128] px-5 py-6 sm:px-6">
  <div className="mb-4 flex items-center gap-2">
    <span className="h-5 w-1 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#8B5CF6]" />
    <h3 className="text-base font-bold text-white sm:text-lg">권장 조치</h3>
  </div>
  <p className="mb-4 text-sm font-semibold text-white">
    {RECOMMENDED_ACTIONS[displayType].headline}
  </p>
  <ul className="space-y-2.5">
    {RECOMMENDED_ACTIONS[displayType].steps.map((line, i) => (
      <li key={i} className="flex gap-2.5 text-sm leading-snug text-[#C9D1D9]">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8B949E]" />
        <span>{line}</span>
      </li>
    ))}
  </ul>
  <p className="mt-5 border-t border-[#30363D] pt-4 text-xs leading-relaxed text-[#8B949E]">
    {CLINICAL_DISCLAIMER}
  </p>
</div>
```

`displayType` already exists at `TypeDecision.jsx:97` and is always `'A' | 'B' | 'C'`.

- [ ] **Step 3: Verify by hand**

```bash
npm run dev
```
Run an analysis and open 호흡 분석 결과. The 권장 조치 card appears under the
metrics with the disclaimer beneath a divider.

- [ ] **Step 4: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: 135 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/breathingAnalysisReportContent.js src/pages/TypeDecision.jsx
git commit -m "feat(report): add Type-specific recommended actions (DRAFT copy)

Formative evaluation #5 — the result screen named the type but not what to
do next. Copy is DRAFT pending clinical sign-off and is deliberately phrased
as a suggestion with a standing disclaimer, because RM-DBF-007 and
RM-DBF-014 are the risks directive wording would aggravate."
```

---

### Task 14: Version 1.1.7

**Files:**
- Modify: `package.json:4`, `package-lock.json`
- Modify: `src/pages/Home.jsx` (footer)

**Interfaces:**
- Consumes: nothing
- Produces: `__APP_VERSION__ === '1.1.7'`

- [ ] **Step 1: Bump the version without tagging**

```bash
npm version patch --no-git-tag-version
grep '"version"' package.json
```
Expected: `"version": "1.1.7"`. This also updates `package-lock.json`.

- [ ] **Step 2: Confirm the Android version code derives correctly**

`android/app/build.gradle:8` folds the parts: `1 → 101 → 10107`.

```bash
node -e "console.log(require('./package.json').version.split('.').reduce((c,p)=>c*100+ +p,0))"
```
Expected: `10107`.

- [ ] **Step 3: Show the version on Home**

The version currently appears only on Login and the three admin screens. Add a
footer to `src/pages/Home.jsx`, just before the closing `</div>` of the
`max-w-2xl` container, matching the admin pages' wording:

```jsx
<p className="mt-10 text-center text-xs text-[#6E7681]">
  DIBH - Flow v{__APP_VERSION__} &nbsp;·&nbsp; {PRODUCT_CODE_LABEL} {PRODUCT_CODE}
</p>
```

Import the product constants the same way the admin pages do — check the exact
path first:

```bash
grep -n "PRODUCT_CODE" src/pages/AdminAccounts.jsx | head -3
```

- [ ] **Step 4: Verify the build still passes the offline check**

```bash
npm run build
```
Expected: build succeeds and `scripts/verify-offline.js` reports no external
references.

- [ ] **Step 5: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: 135 passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/pages/Home.jsx
git commit -m "chore(release): 1.1.7 and show the version on the patient list

Formative evaluation #6. versionCode 10107 is derived by build.gradle from
package.json, so this is the single edit. The version was previously only
visible on the login and admin screens."
```

---

### Task 15: Capture the "after" screenshots — OWNED BY THE USER

**The user captures these on a tablet, from a 1.1.7 APK built off this
branch.** Build and hand over the APK when Task 14 is done; the shot list below
is what the user works from.

**Files:**
- Create: `docs/submission/evidence/formative-eval-2026-09/after/*.png`

- [ ] **Step 1: Run the changed build**

From **this worktree**:

```bash
npm run dev
```

- [ ] **Step 2: Recapture with identical framing**

Same 2560×1600 viewport, same login, same patient and the same two sample
files as Task 0. Save into
`docs/submission/evidence/formative-eval-2026-09/after/` using the **same
filenames** as the before set so the pairs line up, with these substitutions:

| Filename | Screen now |
|---|---|
| `01-newpatient.png` | Registration with no upload zones |
| `02-newpatient-dob.png` | DOB field with `19900512` typed |
| `03-home-recent.png` | 최근 치료 환자, version in the footer |
| `04-home-search.png` | 검색 결과 (N건) with 검색 해제 |
| `05-upload.png` | Merged screen, upload above each list |
| `06-analysisfileselect.png` | Same screen, files under the patient's name |
| `07-typedecision.png` | Result with the 권장 조치 card |
| `08-graph-toggle.png` | Playback panel with both tabs visible |
| `09-dashboard-edit.png` | Edit modal with typed DOB + doctor dropdown |
| `10-header.png` | Header close-up with 뒤로 and 홈 |

Add two screens the before set has no counterpart for:

| Filename | Screen |
|---|---|
| `11-upload-confirm.png` | 등록 전 확인 팝업, matching categories |
| `12-upload-mismatch.png` | Same dialog with a DIBH file dropped on 일반호흡 — red row and warning |

- [ ] **Step 3: Check the pairs**

```bash
ls docs/submission/evidence/formative-eval-2026-09/before/ docs/submission/evidence/formative-eval-2026-09/after/
```
Expected: 10 before, 12 after; the first ten filenames match.

- [ ] **Step 4: Commit**

```bash
git add docs/submission/evidence/formative-eval-2026-09/after/
git commit -m "docs(evidence): capture post-change screens for the formative-eval response"
```

---

### Task 16: Formative-evaluation response document

A **new** document. `KTC-보완요청-대응-2026-09.md` is not edited.

**Files:**
- Create: `docs/submission/형성평가-대응-2026-09.md`

- [ ] **Step 1: Write the document**

Structure it to mirror `KTC-보완요청-대응-2026-09.md` so the reviewer reads a
familiar shape:

1. Header block — 대상 제품, 대응 버전 v1.1.7 (versionCode 10107), 평가 기관
   (원주세브란스병원), 작성일, 작성자
2. **0. 요약** — a 10-row table: 번호 / 항목 / 지적 사항 / 조치 상태, with #2
   marked 안전성 관련 and #10 split into 구현 + 조사
3. **Per-item sections 1-10** — each with 지적 사항, 조치 내용, 변경 파일, and a
   before/after screenshot pair:

```markdown
| 변경 전 | 변경 후 |
|---|---|
| ![변경 전](evidence/formative-eval-2026-09/before/01-newpatient.png) | ![변경 후](evidence/formative-eval-2026-09/after/01-newpatient.png) |
```

4. **11. 위험관리 영향** — #2 strengthens the existing `RM-DBF-010` control and
   adds no new risk; #5 is written against `RM-DBF-007`/`RM-DBF-014`; #10's
   display-layer choice avoids touching `RM-DBF-003`
5. **12. 미결 사항** — the #5 copy awaits clinical sign-off; #10's patient
   matching needs a 차트번호 field and real hospital filename samples

- [ ] **Step 2: Check every image path resolves**

```bash
grep -o 'evidence/[^)]*\.png' docs/submission/형성평가-대응-2026-09.md | while read -r p; do
  [ -f "docs/submission/$p" ] || echo "MISSING: $p"
done
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add docs/submission/형성평가-대응-2026-09.md
git commit -m "docs(submission): respond to the 원주세브란스 formative evaluation

New document rather than an edit to the KTC 2026-09 response, with
before/after screenshots for each of the ten items."
```

---

### Task 17: Update the certification documents

**Files:**
- Modify: `docs/submission/09-위험관리보고서_DIBH-Flow.md` (RM-DBF-010 at line 474, the residual-risk row at 604, the version field at 89, the revision table at 18-21)
- Modify: `docs/submission/2-모양-및-구조.md`
- Modify: the user manual (4장 화면 구성, 5장 파일 업로드)

- [ ] **Step 1: Strengthen the RM-DBF-010 control**

In the `#### RM-DBF-010 — 잘못된 파일 업로드로 인한 사용오류` section, describe
the three layers and cite the code:

```markdown
**위험통제 (v1.1.7 강화)**

| 층 | 통제 | 구현 |
|---|---|---|
| 1 | 파일명에서 일반/DIBH 구분을 자동 판별 | `src/lib/breathingFileCategory.js` — 판별 불가 시 `null`을 반환하여 추정하지 않음 |
| 2 | 파일명과 지정 구분이 불일치하면 경고 표시 | `UploadConfirmDialog` 불일치 항목 적색 강조 |
| 3 | 저장 전 대상 구분을 명시적으로 확인 | 확인 전에는 저장이 수행되지 않음 |

기존 통제(확장자·형식 검증)는 유지된다. 반대 카테고리 업로드가 분류 결과(Type)를
변경할 수 있다는 점이 원주세브란스병원 형성평가에서 확인되어 통제를 강화하였다.
```

Update the residual-risk row and the revision table (개정번호 2, 2026-09-08,
"형성평가 결과 반영 — RM-DBF-010 통제 강화, 제품 버전 1.1.7"). Change the
버전 field at line 89 from `V.1.0` to `V.1.1.7`.

- [ ] **Step 2: Update 2-모양-및-구조**

Revise the screen-composition text for the merged upload/analysis screen and the
registration screen, and replace any screenshots with the `after/` set.

- [ ] **Step 3: Update the user manual**

4장: the screen list loses 호흡 데이터 추가 as a separate screen and the header
now carries 뒤로/홈. 5장: the upload procedure gains the confirmation step and
notes that a filename/category mismatch is flagged.

- [ ] **Step 4: Check for stale version references**

```bash
grep -rn "1\.1\.6\|10106" docs/submission/*.md
```
Every hit must be either a deliberate historical reference (직전 제출 버전) or
updated to 1.1.7 / 10107.

- [ ] **Step 5: Commit**

```bash
git add docs/submission/
git commit -m "docs(submission): reflect the formative-eval changes in the certification set

RM-DBF-010's control becomes detect -> warn -> confirm, the risk report's
version field moves off V.1.0, and the manual and 2-모양-및-구조 follow the
merged upload screen and the new header."
```

---

### Task 18: Filename-based patient matching — feasibility memo

The investigation half of #10. No code.

**Files:**
- Create: `docs/dev-reference/filename-patient-matching-feasibility.md`

- [ ] **Step 1: Write the memo**

Cover:

- **The blocker.** `patient_code` (`PT-2026-001`) is generated locally by
  `src/lib/patientCode.js`, so it cannot appear in a file the hospital exported.
  The `P202600123` in the hospital's example is their own identifier.
- **What it would take.** An optional 차트번호 field on `Patient`, encrypted
  alongside the other PII (the same one-line `PII_FIELDS` change Task 4 made),
  entered at registration, matched case-insensitively against the incoming
  filename.
- **Suggest, never bind.** A match must pre-select the patient for the operator
  to confirm. Auto-binding removes the human judgement `RM-DBF-010` depends on,
  and a wrong bind attaches breathing data to the wrong patient — a more severe
  failure than the wrong-category upload this release just hardened.
- **What is missing.** Real exported filenames from 원주세브란스. Every sample
  in `vxp data/` is synthetic (`TYPE_A_*`, `synth_patient_*`). Collision
  behaviour and the identifier's true format cannot be designed against
  invented names.
- **Already delivered.** Category detection
  (`src/lib/breathingFileCategory.js`) covers the half of #10 that needs no new
  field, and is already in use.
- **Recommendation.** Defer until the hospital provides a sample set; then
  implement as a suggestion-only match.

- [ ] **Step 2: Commit**

```bash
git add docs/dev-reference/filename-patient-matching-feasibility.md
git commit -m "docs: assess filename-based patient matching (formative eval #10)

Feasible, but needs a 차트번호 field and real exported filenames, and must
suggest rather than bind. The category-detection half already shipped."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3 공용 구성요소 | 1, 2, 3, 8, 9 |
| §4.1 #2 three-layer guard | 1, 7 |
| §4.2 #9 decouple + merge | 5, 6 |
| §4.3 #1 birth date | 2, 8 |
| §4.4 #3 doctor account | 4, 9 |
| §4.5 #4 search/recent | 10 |
| §4.6 #8 back/home | 11 |
| §4.7 #5 recommended actions | 13 |
| §4.8 #7 graph tabs | 12 |
| §4.9 #6 version | 14 |
| §4.10(a) display name | 3, 6 |
| §4.10(b) matching memo | 18 |
| §5 storage impact | 4, 5 |
| §6 tests | 1, 2, 3, 4 |
| §7 screenshots | 0, 15 |
| §8 documents | 16, 17 |

No gaps.

**Type consistency:** `detectCategoryFromFileName` returns
`'general' | 'dibh' | null` in Tasks 1, 7 and 18. `breathingFileDisplayName(storedName, patient)`
keeps that argument order in Tasks 3 and 6. `normalizeBirthDateInput(input, today?)`
matches between Tasks 2 and 8. `assigned_doctor_account_id` is spelled
identically in Tasks 4, 5 and 9. `DoctorSelectField`'s `onChange({ name, accountId })`
matches both call sites in Task 9.

**Sequencing:** Task 0 must precede every code change. Task 7 depends on Task 6's
`persistFiles`. Tasks 8 and 9 both edit `NewPatient` and `PatientDashboard`
after Task 5 has reduced the former. Task 15 must follow all UI tasks; Task 16
follows Task 15.
