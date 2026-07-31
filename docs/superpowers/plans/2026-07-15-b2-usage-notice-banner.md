# B2 — Admin-Configurable Usage Notice Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin edit the IA-08 login-screen usage-notice text, closing the gap where the compliance doc claims it's configurable but no such mechanism exists today.

**Architecture:** New small store module (`usageNoticeStore.js`, mirrors the existing `authStore.js`/`auditStore.js` pattern of one focused module per concern) backed by a single localStorage key. `Login.jsx`'s `UsageNoticeBanner` renders the existing rich-styled default JSX when no custom text is set, or plain paragraphs of the admin's custom text when one is. Editor UI lives in the existing `AdminAccounts.jsx` page (admin-only, already gated).

**Tech Stack:** React 18, existing project conventions — plain `useState`/manual validation (matching `passwordUtils.js`'s `validatePassword` pattern, not react-hook-form/zod, since `AdminAccounts.jsx` doesn't use those for its other inline forms either), `@/components/ui/use-toast` for feedback (matches `NewPatient.jsx`/`BreathingDataUpload.jsx` convention).

## Global Constraints

- The core notice **always renders** before login — there is no on/off toggle (explicit user decision; do not add one).
- No version history / multi-language support — single active text only (explicit user decision; do not add one).
- 1000-character limit on custom notice text.
- Falls back to the current 4-sentence hardcoded/styled text when unset — must not regress existing certified banner content.

---

### Task 1: `usageNoticeStore.js` — storage + validation

**Files:**
- Create: `src/api/usageNoticeStore.js`
- Test: `src/api/usageNoticeStore.test.js`

**Interfaces:**
- Produces: `getCustomUsageNotice(): string | null`, `setUsageNotice(text: string): void`, `resetUsageNotice(): void`, `validateUsageNotice(text: string): string[]` — all consumed by Task 3 (`Login.jsx`) and Task 4 (`AdminAccounts.jsx`).

- [ ] **Step 1: Write the failing test**

```js
// src/api/usageNoticeStore.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

describe('usageNoticeStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMockLocalStorage());
  });

  it('getCustomUsageNotice returns null when unset', async () => {
    const { getCustomUsageNotice } = await import('./usageNoticeStore.js');
    expect(getCustomUsageNotice()).toBeNull();
  });

  it('setUsageNotice stores trimmed text, retrievable via getCustomUsageNotice', async () => {
    const { setUsageNotice, getCustomUsageNotice } = await import('./usageNoticeStore.js');
    setUsageNotice('  custom notice text  ');
    expect(getCustomUsageNotice()).toBe('custom notice text');
  });

  it('setUsageNotice with empty/whitespace-only text clears the key (reverts to default)', async () => {
    const { setUsageNotice, getCustomUsageNotice } = await import('./usageNoticeStore.js');
    setUsageNotice('something');
    setUsageNotice('   ');
    expect(getCustomUsageNotice()).toBeNull();
  });

  it('resetUsageNotice clears any custom text', async () => {
    const { setUsageNotice, resetUsageNotice, getCustomUsageNotice } = await import('./usageNoticeStore.js');
    setUsageNotice('something');
    resetUsageNotice();
    expect(getCustomUsageNotice()).toBeNull();
  });

  it('validateUsageNotice rejects text over 1000 characters', async () => {
    const { validateUsageNotice } = await import('./usageNoticeStore.js');
    const errors = validateUsageNotice('a'.repeat(1001));
    expect(errors).toEqual(['공지 문구는 최대 1000자까지 입력할 수 있습니다.']);
  });

  it('validateUsageNotice accepts text at or under 1000 characters', async () => {
    const { validateUsageNotice } = await import('./usageNoticeStore.js');
    expect(validateUsageNotice('a'.repeat(1000))).toEqual([]);
    expect(validateUsageNotice('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/api/usageNoticeStore.test.js`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
// src/api/usageNoticeStore.js
// Admin-configurable login-screen usage notice — MFDS IA-08.
// Falls back to the default hardcoded banner (rendered in Login.jsx) when unset.

const USAGE_NOTICE_KEY = 'dibh_usage_notice';
const MAX_LENGTH = 1000;

/** Returns the admin's custom notice text, or null if none has been set (use default). */
export function getCustomUsageNotice() {
  const stored = localStorage.getItem(USAGE_NOTICE_KEY);
  return stored && stored.trim() ? stored.trim() : null;
}

/** Sets the custom notice text. Empty/whitespace-only input clears it (reverts to default). */
export function setUsageNotice(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    localStorage.removeItem(USAGE_NOTICE_KEY);
  } else {
    localStorage.setItem(USAGE_NOTICE_KEY, trimmed);
  }
}

/** Clears any custom notice text, reverting to the default banner. */
export function resetUsageNotice() {
  localStorage.removeItem(USAGE_NOTICE_KEY);
}

/** Validates candidate notice text before saving. Returns an array of error messages (empty = valid). */
export function validateUsageNotice(text) {
  const errors = [];
  if ((text ?? '').length > MAX_LENGTH) {
    errors.push(`공지 문구는 최대 ${MAX_LENGTH}자까지 입력할 수 있습니다.`);
  }
  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/api/usageNoticeStore.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/usageNoticeStore.js src/api/usageNoticeStore.test.js
git commit -m "feat: add usageNoticeStore for admin-configurable IA-08 banner text"
```

---

### Task 2: `AUDIT_ACTIONS.USAGE_NOTICE_UPDATED`

**Files:**
- Modify: `src/api/auditStore.js` (`AUDIT_ACTIONS` object, `:139-161`)

**Interfaces:**
- Produces: `AUDIT_ACTIONS.USAGE_NOTICE_UPDATED` (string `'USAGE_NOTICE_UPDATED'`) — consumed by Task 4.

- [ ] **Step 1: Add the constant**

Add to the `AUDIT_ACTIONS` object in `src/api/auditStore.js` (alongside `DEIDENTIFIED_EXPORT`):

```js
  USAGE_NOTICE_UPDATED: 'USAGE_NOTICE_UPDATED',
```

- [ ] **Step 2: No new test needed** — this is a plain string constant; existing `auditStore.js` tests (if any from Task 2 of the B3 plan) already cover the general `tryWriteAuditLog` write path. Verify by running the full suite:

Run: `npm test`
Expected: PASS (no regressions)

- [ ] **Step 3: Commit**

```bash
git add src/api/auditStore.js
git commit -m "feat: add USAGE_NOTICE_UPDATED audit action"
```

---

### Task 3: `Login.jsx` — render custom notice when set

**Files:**
- Modify: `src/pages/Login.jsx:1-11` (imports), `:19-45` (`UsageNoticeBanner`)
- Test: `src/pages/Login.usageNotice.test.jsx` (new — see note on test environment below)

**Interfaces:**
- Consumes: `getCustomUsageNotice()` from Task 1.

**Note on testing:** the project's Vitest config runs in `node` environment (no jsdom), and no existing test renders a React component. Rather than introduce a new testing setup (jsdom + React Testing Library) for one component, this task tests the **text-selection logic** as a small extracted pure function, and verifies the visual result manually. This keeps the change minimal and consistent with the existing test suite's scope (pure-logic unit tests only).

- [ ] **Step 1: Extract the notice-selection logic as a testable pure function and write its failing test**

```js
// src/pages/Login.usageNotice.test.jsx
import { describe, it, expect, vi } from 'vitest';

describe('resolveUsageNoticeParagraphs', () => {
  it('returns null (use default JSX) when no custom notice is set', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const { resolveUsageNoticeParagraphs } = await import('./Login.jsx');
    expect(resolveUsageNoticeParagraphs()).toBeNull();
  });

  it('splits a custom notice into non-empty trimmed lines', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'Line one\n\nLine two  \n' });
    const { resolveUsageNoticeParagraphs } = await import('./Login.jsx');
    expect(resolveUsageNoticeParagraphs()).toEqual(['Line one', 'Line two']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/pages/Login.usageNotice.test.jsx`
Expected: FAIL — `resolveUsageNoticeParagraphs` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

In `src/pages/Login.jsx`, add the import (alongside the existing imports):

```js
import { getCustomUsageNotice } from '@/api/usageNoticeStore';
```

Add this exported helper just above `UsageNoticeBanner` (around line 19):

```js
/** Returns an array of non-empty trimmed lines from the admin's custom notice, or null to use the default styled JSX. */
export function resolveUsageNoticeParagraphs() {
  const custom = getCustomUsageNotice();
  if (!custom) return null;
  return custom.split('\n').map((line) => line.trim()).filter(Boolean);
}
```

Modify `UsageNoticeBanner` to use it (replace the fixed `<div className="space-y-3 ...">` contents):

```jsx
function UsageNoticeBanner({ onAcknowledge }) {
  const customLines = resolveUsageNoticeParagraphs();
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D1117] p-6">
      <div className="w-full max-w-lg rounded-2xl border border-[#EAB308]/40 bg-[#1C2128] p-8 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EAB308]/15">
            <ShieldAlert className="h-5 w-5 text-[#EAB308]" />
          </div>
          <h2 className="text-lg font-bold text-white">시스템 사용 알림</h2>
        </div>
        <div className="space-y-3 rounded-xl border border-[#30363D] bg-[#0D1117] p-5 text-sm leading-relaxed text-[#C9D1D9]">
          {customLines ? (
            customLines.map((line, i) => <p key={i}>{line}</p>)
          ) : (
            <>
              <p>본 시스템은 <span className="font-semibold text-white">인가된 의료진 및 관리자</span>만 사용할 수 있습니다.</p>
              <p>시스템에 접속하고 수행되는 모든 활동은 <span className="font-semibold text-white">모니터링, 기록 및 감사의 대상</span>이 됩니다.</p>
              <p><span className="font-semibold text-[#EF4444]">인가되지 않은 시스템 접근 및 사용은 금지</span>되며, 관련 법령에 따라 민·형사상 처벌을 받을 수 있습니다.</p>
              <p>시스템 접속은 위 내용에 동의함을 의미합니다.</p>
            </>
          )}
        </div>
        <Button
          onClick={onAcknowledge}
          className="mt-6 h-12 w-full rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] font-semibold text-white"
        >
          확인하고 계속하기
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/pages/Login.usageNotice.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open the login screen with no custom notice set — confirm the exact same 4-sentence styled banner as before (no visual regression). Then, from a browser devtools console on that page, run `localStorage.setItem('dibh_usage_notice', 'Test line one\nTest line two')` and reload — confirm the banner now shows two plain unstyled paragraphs instead.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Login.jsx src/pages/Login.usageNotice.test.jsx
git commit -m "feat: render admin-configured usage notice text when set"
```

---

### Task 4: Admin editor UI in `AdminAccounts.jsx`

**Files:**
- Modify: `src/pages/AdminAccounts.jsx:1-14` (imports), `:46-65` (component state), `:236-241` (insert new section before the footer)

**Interfaces:**
- Consumes: `getCustomUsageNotice`, `setUsageNotice`, `resetUsageNotice`, `validateUsageNotice` from Task 1; `AUDIT_ACTIONS.USAGE_NOTICE_UPDATED` from Task 2.

- [ ] **Step 1: Add imports**

Add to the top of `src/pages/AdminAccounts.jsx`:

```js
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { getCustomUsageNotice, setUsageNotice, resetUsageNotice, validateUsageNotice } from '@/api/usageNoticeStore';
import { MessageSquareWarning } from 'lucide-react';
```

- [ ] **Step 2: Add state and handlers**

Inside `AdminAccounts()`, after the existing `reload`/`useEffect` block (around line 59), add:

```js
  // ── Usage notice editor (IA-08) ─────────────────────────────────────────────
  const [noticeText, setNoticeText] = useState('');
  const [noticeErrors, setNoticeErrors] = useState([]);
  const [savingNotice, setSavingNotice] = useState(false);

  useEffect(() => { setNoticeText(getCustomUsageNotice() ?? ''); }, []);

  const handleSaveNotice = () => {
    const errors = validateUsageNotice(noticeText);
    if (errors.length) { setNoticeErrors(errors); return; }
    setSavingNotice(true);
    try {
      setUsageNotice(noticeText);
      tryWriteAuditLog({ action: AUDIT_ACTIONS.USAGE_NOTICE_UPDATED, targetType: 'system', detail: '시스템 사용 알림 문구 변경' });
      setNoticeErrors([]);
      toast({ title: '저장되었습니다', description: '로그인 화면에 새 공지 문구가 표시됩니다.' });
    } finally {
      setSavingNotice(false);
    }
  };

  const handleResetNotice = () => {
    resetUsageNotice();
    setNoticeText('');
    setNoticeErrors([]);
    tryWriteAuditLog({ action: AUDIT_ACTIONS.USAGE_NOTICE_UPDATED, targetType: 'system', detail: '기본 문구로 재설정' });
    toast({ title: '기본 문구로 재설정되었습니다' });
  };
```

- [ ] **Step 3: Add the editor section JSX**

Insert this new card between the closing `</div>` of the user-list card (line 238) and the `<p className="mt-8 ...">DIBH - Flow v...` footer line (line 240):

```jsx
        {/* Usage notice editor (IA-08) */}
        <div className="mt-6 rounded-2xl border border-[#30363D] bg-[#1C2128] p-6">
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-white">
            <MessageSquareWarning className="h-4 w-4 text-[#EAB308]" /> 시스템 사용 알림 문구
          </h2>
          <p className="mb-4 text-sm text-[#8B949E]">
            로그인 화면에 표시되는 사전 접속 안내 문구입니다. 비워두면 기본 문구가 표시됩니다. (최대 1000자)
          </p>
          <Textarea
            value={noticeText}
            onChange={(e) => setNoticeText(e.target.value)}
            placeholder="비워두면 기본 문구가 표시됩니다."
            rows={5}
            className="rounded-xl border-[#30363D] bg-[#0D1117] text-white"
          />
          {noticeErrors.length > 0 && (
            <div className="mt-3 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#FCA5A5]">
              {noticeErrors.map((e) => <p key={e}>{e}</p>)}
            </div>
          )}
          <div className="mt-4 flex gap-3">
            <Button variant="outline" onClick={handleResetNotice}
              className="border-[#30363D] bg-transparent text-[#C9D1D9] hover:bg-[#30363D] hover:text-white">
              기본값으로 재설정
            </Button>
            <Button onClick={handleSaveNotice} disabled={savingNotice}
              className="gap-2 bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white">
              {savingNotice ? '저장 중…' : '저장'}
            </Button>
          </div>
        </div>
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, log in as admin, go to `/admin/accounts`. Confirm the new "시스템 사용 알림 문구" card appears below the account list. Type custom text, save, confirm the toast appears. Log out, confirm the login screen shows the custom text as plain paragraphs. Return to `/admin/accounts`, click "기본값으로 재설정", confirm the textarea clears and logging out shows the original styled 4-sentence banner again. Check `/admin/auditlog` for the `USAGE_NOTICE_UPDATED` entries.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AdminAccounts.jsx
git commit -m "feat: add usage-notice editor to admin accounts page"
```

---

## Plan Self-Review

**Spec coverage:** Storage/validation (Task 1) ✓, audit action (Task 2) ✓, Login.jsx fallback rendering (Task 3) ✓, admin editor UI (Task 4) ✓. No on/off toggle, no versioning — matches the explicit user decision to drop both.

**Placeholder scan:** No TBD/TODO. All code blocks complete.

**Type consistency:** `getCustomUsageNotice(): string | null` used consistently in Task 3 and Task 4. `validateUsageNotice(text): string[]` matches the `validatePassword`-style convention already in the codebase (array of error strings, checked via `.length`). Function names match their call sites exactly (`resolveUsageNoticeParagraphs`, `handleSaveNotice`, `handleResetNotice`).

**Deviation from original spec doc, noted deliberately:** the spec (`docs/superpowers/specs/2026-07-14-b2-usage-notice-design.md`) mentioned `zod` for validation; this plan uses a plain array-of-errors function instead, matching `passwordUtils.js`'s existing convention and `AdminAccounts.jsx`'s existing manual-validation style (it doesn't use `react-hook-form`/`zod` for its other inline forms either). Functionally equivalent (same 1000-char limit, same UI behavior) — flagging here per "follow existing patterns" rather than treating it as a silent scope change.
