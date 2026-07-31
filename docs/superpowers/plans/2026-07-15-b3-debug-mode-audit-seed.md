# B3 — Env-Driven Debug Mode + Audit-Log Seed Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `SECURITY_DEBUG` flag with a build-time env var, and add a debug-only admin button that seeds exactly 10,000 real audit-log entries so QA can observe the FIFO trim against the actual certified threshold.

**Architecture:** `SECURITY_DEBUG` becomes `import.meta.env.VITE_DEBUG_MODE === 'true'` (unchanged consumers). A new `seedDebugAuditEntries()` in `auditStore.js` bulk-writes entries directly to localStorage (bypassing per-entry `writeAuditLog()` to avoid O(n²) cost), gated to throw unless `SECURITY_DEBUG` is true. `AdminAuditLog.jsx` renders a seed button only in debug builds. `App.jsx` renders a persistent on-screen indicator whenever `SECURITY_DEBUG` is true.

**Tech Stack:** React 18, Vite 6 (`import.meta.env`), Vitest 3.

## Global Constraints

- `MAX_ENTRIES` in `src/api/auditStore.js` stays a literal `10_000` in every code path — no env override exists anywhere for this value.
- `VITE_DEBUG_MODE` must default to falsy/absent in the committed `.env` and in any production/submission build.
- Debug-only UI (seed button, "DEBUG BUILD" indicator) must never render when `SECURITY_DEBUG` is false.
- No new npm dependencies. No native Android rebuild required.

---

### Task 1: Env-driven `SECURITY_DEBUG` flag

**Files:**
- Modify: `src/lib/securityDebug.js:11`
- Create: `.env.example`
- Test: `src/lib/securityDebug.test.js`

**Interfaces:**
- Produces: `SECURITY_DEBUG` (boolean, exported from `@/lib/securityDebug`) — consumed by Task 2 (`auditStore.js`), Task 3 (`AdminAuditLog.jsx`), Task 4 (`App.jsx`).

- [ ] **Step 1: Write the failing test**

```js
// src/lib/securityDebug.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('SECURITY_DEBUG env flag', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false when VITE_DEBUG_MODE is unset', async () => {
    vi.stubEnv('VITE_DEBUG_MODE', undefined);
    const { SECURITY_DEBUG } = await import('./securityDebug.js');
    expect(SECURITY_DEBUG).toBe(false);
  });

  it('is true when VITE_DEBUG_MODE is the string "true"', async () => {
    vi.stubEnv('VITE_DEBUG_MODE', 'true');
    const { SECURITY_DEBUG } = await import('./securityDebug.js');
    expect(SECURITY_DEBUG).toBe(true);
  });

  it('is false for any other value (e.g. "1", "yes")', async () => {
    vi.stubEnv('VITE_DEBUG_MODE', '1');
    const { SECURITY_DEBUG } = await import('./securityDebug.js');
    expect(SECURITY_DEBUG).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/securityDebug.test.js`
Expected: FAIL — `SECURITY_DEBUG` is currently the hardcoded literal `false`, so the "is true" case fails (the "is false" cases will pass by coincidence, but the suite as a whole fails).

- [ ] **Step 3: Write minimal implementation**

Replace line 11 of `src/lib/securityDebug.js`:

```js
// Before:
export const SECURITY_DEBUG = false; // KTC AUDIT DEMO — set back to false before production build

// After:
// Build-time only — set VITE_DEBUG_MODE=true in .env for a debug/QA build.
// Must be false/absent in every production and submission build.
export const SECURITY_DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/securityDebug.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Create `.env.example`**

```
# Copy to .env and set VITE_DEBUG_MODE=true for a local/QA debug build.
# MUST remain false (or this file's default/absent) in any production or
# submission build handed to KTC or installed at a hospital.
VITE_DEBUG_MODE=false
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/securityDebug.js src/lib/securityDebug.test.js .env.example
git commit -m "feat: drive SECURITY_DEBUG from VITE_DEBUG_MODE env var"
```

---

### Task 2: `seedDebugAuditEntries` bulk-write helper

**Files:**
- Modify: `src/api/auditStore.js:1-9` (import), `:139-161` (AUDIT_ACTIONS)
- Test: `src/api/auditStore.test.js` (new)

**Interfaces:**
- Consumes: `SECURITY_DEBUG` (boolean) from Task 1.
- Produces: `seedDebugAuditEntries(count = 10_000): { generated: number, totalAfterTrim: number }`, exported from `@/api/auditStore` — consumed by Task 3.
- Produces: `AUDIT_ACTIONS.DEBUG_SEED_ENTRY` (string constant `'DEBUG_SEED_ENTRY'`).

- [ ] **Step 1: Write the failing test**

```js
// src/api/auditStore.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
}

describe('seedDebugAuditEntries', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMockLocalStorage());
    vi.resetModules();
  });

  it('throws when SECURITY_DEBUG is false', async () => {
    vi.stubEnv('VITE_DEBUG_MODE', undefined);
    const { seedDebugAuditEntries } = await import('./auditStore.js');
    expect(() => seedDebugAuditEntries(10)).toThrow(/debug builds/);
  });

  it('generates exactly `count` entries and applies the FIFO trim on a bulk write', async () => {
    vi.stubEnv('VITE_DEBUG_MODE', 'true');
    const { seedDebugAuditEntries, getAuditLogCapacity } = await import('./auditStore.js');
    const result = seedDebugAuditEntries(10_000);
    expect(result).toEqual({ generated: 10_000, totalAfterTrim: 10_000 });
    expect(getAuditLogCapacity().count).toBe(10_000);
  });

  it('trims oldest entries first when seeding pushes the log over MAX_ENTRIES', async () => {
    vi.stubEnv('VITE_DEBUG_MODE', 'true');
    const { seedDebugAuditEntries, getAuditLogEntries } = await import('./auditStore.js');
    seedDebugAuditEntries(10_000);
    seedDebugAuditEntries(5); // pushes total to 10,005 — oldest 5 must be trimmed
    const { total } = getAuditLogEntries({ limit: 1 });
    expect(total).toBe(10_000);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/api/auditStore.test.js`
Expected: FAIL with "seedDebugAuditEntries is not a function" (or similar — the export doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

In `src/api/auditStore.js`, change the import line (currently `import { secDbg } from '@/lib/securityDebug';`) to also pull in `SECURITY_DEBUG`:

```js
import { secDbg, SECURITY_DEBUG } from '@/lib/securityDebug';
```

Add this new exported function (place it after `writeAuditLog`/`tryWriteAuditLog`, before `getAuditLogEntries`):

```js
/**
 * Debug-only: append `count` synthetic entries in one bulk write, respecting the
 * existing MAX_ENTRIES FIFO trim. Bypasses per-entry writeAuditLog() to avoid
 * O(n^2) re-serialization of the growing array on every single call.
 * Throws unless SECURITY_DEBUG is true — structurally cannot run in a production build.
 */
export function seedDebugAuditEntries(count = 10_000) {
  if (!SECURITY_DEBUG) throw new Error('seedDebugAuditEntries is only available in debug builds');
  const log = loadLog();
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    log.push({
      id: `debug-${now}-${i}`,
      userId: 'system',
      username: 'system',
      action: 'DEBUG_SEED_ENTRY',
      targetType: 'debug',
      targetId: null,
      detail: 'QA 테스트용 자동 생성 항목 (디버그 빌드 전용)',
      timestamp: new Date(now + i).toISOString(),
    });
  }
  const trimmed = log.length > MAX_ENTRIES ? log.slice(log.length - MAX_ENTRIES) : log;
  localStorage.setItem(AUDIT_KEY, JSON.stringify(trimmed));
  return { generated: count, totalAfterTrim: trimmed.length };
}
```

Add to the `AUDIT_ACTIONS` object (after `DEIDENTIFIED_EXPORT`):

```js
  DEBUG_SEED_ENTRY: 'DEBUG_SEED_ENTRY', // debug-build only — never appears in a production audit log
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/api/auditStore.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/auditStore.js src/api/auditStore.test.js
git commit -m "feat: add debug-only seedDebugAuditEntries bulk-write helper"
```

---

### Task 3: Debug-only seed button in `AdminAuditLog.jsx`

**Files:**
- Modify: `src/pages/AdminAuditLog.jsx:1-5` (imports), `:65-116` (component body/state), `:132-136` (header area)

**Interfaces:**
- Consumes: `SECURITY_DEBUG` from `@/lib/securityDebug` (Task 1), `seedDebugAuditEntries` from `@/api/auditStore` (Task 2).

- [ ] **Step 1: Add imports**

At the top of `src/pages/AdminAuditLog.jsx`, add:

```js
import { getAuditLogEntries, getAuditLogCapacity, seedDebugAuditEntries } from '@/api/auditStore';
import { SECURITY_DEBUG } from '@/lib/securityDebug';
import { Bug } from 'lucide-react';
```

(This replaces the existing `import { getAuditLogEntries, getAuditLogCapacity } from '@/api/auditStore';` line — add `seedDebugAuditEntries` to it rather than duplicating the import.)

- [ ] **Step 2: Add a refresh-trigger state and wire it into the existing `useMemo` calls**

In the component body, add near the other `useState` calls:

```js
const [refreshKey, setRefreshKey] = useState(0);
```

Update the existing `useMemo` dependency arrays:

```js
const { entries, total } = useMemo(
  () => getAuditLogEntries({ search, limit: pageSize, offset: page * pageSize }),
  [search, page, pageSize, refreshKey]
);

const capacity = useMemo(() => getAuditLogCapacity(), [total, refreshKey]);
```

- [ ] **Step 3: Add the seed handler and button**

Add the handler function near `handleSearch`:

```js
const handleDebugSeed = () => {
  seedDebugAuditEntries(10_000);
  setPage(0);
  setRefreshKey((k) => k + 1);
};
```

In the header `<div className="flex items-center gap-1.5 ...">읽기 전용</div>` block (around line 132-135), add the button as a sibling, gated on `SECURITY_DEBUG`:

```jsx
{SECURITY_DEBUG && (
  <Button
    size="sm"
    variant="outline"
    onClick={handleDebugSeed}
    className="ml-2 gap-1.5 border-[#EF4444]/40 bg-transparent text-[#EF4444] shadow-none hover:bg-[#EF4444]/10"
  >
    <Bug className="h-3.5 w-3.5" />
    디버그: 10,000건 생성
  </Button>
)}
```

- [ ] **Step 4: Manual verification (no automated test — this is a debug-only UI affordance)**

Run: `VITE_DEBUG_MODE=true npm run dev`
Navigate to `/admin/auditlog` as an admin. Confirm the "디버그: 10,000건 생성" button is visible. Click it, confirm the log fills to 10,000 entries and the capacity warning banner (UC-05, already existing) appears at 100%.

Then run: `npm run dev` (no env var — default `false`)
Confirm the button does NOT appear.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AdminAuditLog.jsx
git commit -m "feat: add debug-only audit-log seed button"
```

---

### Task 4: Persistent "DEBUG BUILD" on-screen indicator

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `SECURITY_DEBUG` from `@/lib/securityDebug` (Task 1).

- [ ] **Step 1: Add the import and indicator**

In `src/App.jsx`, add the import:

```js
import { SECURITY_DEBUG } from '@/lib/securityDebug'
```

Modify `AppInner` to render the indicator alongside the existing `Toaster`/`TimeoutWarningBanner`:

```jsx
function AppInner() {
  const { timeoutWarning, dismissTimeoutWarning } = useAuth();
  return (
    <>
      {SECURITY_DEBUG && (
        <div className="fixed left-0 top-0 z-[9999] w-full bg-[#EF4444] py-1 text-center text-xs font-bold text-white">
          DEBUG BUILD — 프로덕션/제출 빌드에 포함되어서는 안 됨
        </div>
      )}
      <Pages />
      <Toaster />
      {timeoutWarning && <TimeoutWarningBanner onStayLoggedIn={dismissTimeoutWarning} />}
    </>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `VITE_DEBUG_MODE=true npm run dev` — confirm the red "DEBUG BUILD" bar is visible on every screen (login, home, admin pages).
Run: `npm run dev` (default) — confirm it is absent.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: show persistent DEBUG BUILD indicator when SECURITY_DEBUG is true"
```

---

### Task 5: Compliance doc note (UC-04)

**Files:**
- Modify: `docs/submission/section8-시험기준-준수명세.md` (or wherever the UC-04 section text lives in the source-of-truth doc — confirm exact file before editing)

**Interfaces:** None (documentation-only task).

- [ ] **Step 1: Add a note near UC-04**

Add a short paragraph (adjacent to the existing UC-04 감사기록 생성 section) stating: a controlled debug/QA build variant exists specifically to demonstrate the audit-log FIFO-trim behavior against the real 10,000-entry threshold on demand (`VITE_DEBUG_MODE=true`), it is disabled by default, visually distinguishable via a persistent on-screen "DEBUG BUILD" indicator when active, and is never present in the production/submission build.

- [ ] **Step 2: Commit**

```bash
git add docs/submission/section8-시험기준-준수명세.md
git commit -m "docs: note debug-mode audit-log test hook under UC-04"
```

---

## Plan Self-Review

**Spec coverage:** Env var (Task 1) ✓, `MAX_ENTRIES` left untouched everywhere (verified — no task modifies the `MAX_ENTRIES = 10_000` line in `auditStore.js`) ✓, bulk-seed helper (Task 2) ✓, debug-only button (Task 3) ✓, visible build indicator (Task 4) ✓, documentation (Task 5) ✓.

**Placeholder scan:** No TBD/TODO. All code blocks are complete and copy-pasteable.

**Type consistency:** `seedDebugAuditEntries(count = 10_000): { generated, totalAfterTrim }` — signature matches between Task 2's implementation and Task 3's call site (`seedDebugAuditEntries(10_000)`, return value unused there since the UI just triggers a refresh). `SECURITY_DEBUG` import path (`@/lib/securityDebug`) is consistent across Tasks 1, 2, 3, 4.

**Note on Task 5:** the exact filename for where UC-04 body text lives needs confirming before that step runs — `docs/submission/section8-시험기준-준수명세.md` is the most likely candidate based on the repo's existing `docs/submission/` structure, but verify against the actual file before editing.
