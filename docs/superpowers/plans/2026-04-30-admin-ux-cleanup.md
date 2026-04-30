# Admin UX Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin password-reset for other accounts, remove the redundant "regenerate patient code" button, and simplify calibration result pages to a single navigation button.

**Architecture:** Three independent UI changes: (1) new reset-password dialog in AdminAccounts backed by an existing `UserStore.changePassword` method + a new audit action; (2) remove dead `regenerateCode` UI in NewPatient; (3) collapse the two-button footer in TrainingReport and TypeDecision into one full-width dashboard link.

**Tech Stack:** React 18, react-router-dom v7, Radix UI Dialog, lucide-react, custom `UserStore` / `AUDIT_ACTIONS` from `src/api/`.

---

## File Map

| File | Change |
|---|---|
| `src/api/auditStore.js` | Add `PASSWORD_RESET_BY_ADMIN` constant |
| `src/api/authStore.js` | Add `UserStore.resetPassword()` — wraps `changePassword`, forces `mustChangePassword: true` |
| `src/pages/AdminAccounts.jsx` | New reset-password button + modal dialog |
| `src/pages/NewPatient.jsx` | Remove `regenerateCode` function + button |
| `src/pages/TrainingReport.jsx` | Replace two-button footer with single "환자 대시보드로 이동" button |
| `src/pages/TypeDecision.jsx` | Same footer simplification |

---

## Task 1: Add `PASSWORD_RESET_BY_ADMIN` audit action

**Files:**
- Modify: `src/api/auditStore.js:74-91`

- [ ] **Step 1: Add the constant**

In `src/api/auditStore.js`, add one entry to the `AUDIT_ACTIONS` object (after `PASSWORD_CHANGED`):

```js
PASSWORD_CHANGED: 'PASSWORD_CHANGED',
PASSWORD_RESET_BY_ADMIN: 'PASSWORD_RESET_BY_ADMIN',
```

- [ ] **Step 2: Verify dev server still starts**

Run: `npm run dev`
Expected: no compile errors, server up on port 5174.

- [ ] **Step 3: Commit**

```bash
git add src/api/auditStore.js
git commit -m "feat: add PASSWORD_RESET_BY_ADMIN audit action"
```

---

## Task 2: Add `UserStore.resetPassword()` to authStore

**Files:**
- Modify: `src/api/authStore.js` — add method after `changePassword`

`resetPassword` is identical to `changePassword` except it always re-sets `mustChangePassword: true`, meaning the target user must change their password on their very next login.

- [ ] **Step 1: Add the method**

In `src/api/authStore.js`, after the closing brace of `changePassword` (around line 227), add:

```js
async resetPassword(userId, newPassword) {
  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) throw new Error('사용자를 찾을 수 없습니다.');
  const salt = randomHex(16);
  const passwordHash = await pbkdf2Hash(newPassword, salt);
  users[idx] = {
    ...users[idx],
    passwordHash,
    salt,
    mustChangePassword: true,
    updatedAt: new Date().toISOString(),
  };
  saveUsers(users);
},
```

- [ ] **Step 2: Verify no syntax errors**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/authStore.js
git commit -m "feat: add UserStore.resetPassword — sets mustChangePassword on target"
```

---

## Task 3: Reset-password button + modal in AdminAccounts

**Files:**
- Modify: `src/pages/AdminAccounts.jsx`

The reset button appears in each user row alongside the existing role-toggle and delete buttons. It must not appear for the currently logged-in user (same rule as the delete button). The modal asks for a new temporary password, validates strength, calls `UserStore.resetPassword`, writes the audit log, and shows a success/error state.

- [ ] **Step 1: Add `KeyRound` to the lucide-react import**

Change the import line at the top of `AdminAccounts.jsx`:

```js
import { ArrowLeft, Plus, Trash2, Unlock, ShieldCheck, ShieldAlert, UserCog, Eye, EyeOff, Users, ClipboardList, Database, KeyRound } from 'lucide-react';
```

- [ ] **Step 2: Add state variables for the reset flow**

Inside `AdminAccounts` (after the existing `deleteTarget` state line), add:

```js
const [resetTarget, setResetTarget] = useState(null);
const [resetPw, setResetPw] = useState('');
const [showResetPw, setShowResetPw] = useState(false);
const [resetErrors, setResetErrors] = useState([]);
const [resetting, setResetting] = useState(false);
```

- [ ] **Step 3: Add the `handleReset` function**

After the existing `handleDelete` function, add:

```js
const handleReset = async (e) => {
  e.preventDefault();
  const pwErrors = validatePassword(resetPw);
  if (pwErrors.length) { setResetErrors(pwErrors); return; }
  setResetting(true);
  try {
    await UserStore.resetPassword(resetTarget.id, resetPw);
    tryWriteAuditLog({
      action: AUDIT_ACTIONS.PASSWORD_RESET_BY_ADMIN,
      targetType: 'user',
      targetId: resetTarget.id,
      detail: `username: ${resetTarget.username} — 관리자에 의한 비밀번호 초기화`,
    });
    setResetTarget(null);
    setResetPw('');
    setResetErrors([]);
  } catch (err) {
    setResetErrors([err.message]);
  } finally {
    setResetting(false);
  }
};
```

- [ ] **Step 4: Add reset button to each user row**

In the `<div className="flex shrink-0 gap-2">` block for each user row, add the reset button **before** the delete button:

```jsx
{u.id !== session?.userId && (
  <Button size="sm" variant="outline"
    onClick={() => { setResetTarget(u); setResetPw(''); setResetErrors([]); setShowResetPw(false); }}
    title="비밀번호 초기화"
    className="border-[#EAB308]/40 text-[#EAB308] hover:bg-[#EAB308]/10">
    <KeyRound className="h-3.5 w-3.5" />
  </Button>
)}
```

- [ ] **Step 5: Add the reset-password modal dialog**

After the closing `</Dialog>` of the delete-confirmation dialog, add:

```jsx
{/* Reset password modal */}
<Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setResetErrors([]); } }}>
  <DialogContent hideClose className="max-w-md border border-[#30363D] bg-[#1C2128] p-0 text-white sm:rounded-2xl">
    <DialogTitle className="sr-only">비밀번호 초기화</DialogTitle>
    <DialogDescription className="sr-only">관리자가 해당 계정의 비밀번호를 초기화합니다. 대상 사용자는 다음 로그인 시 비밀번호를 변경해야 합니다.</DialogDescription>
    <form onSubmit={handleReset} className="pb-6">
      <div className="flex items-center justify-between border-b border-[#30363D] px-6 py-4">
        <p className="font-semibold text-[#C9D1D9]">
          [{resetTarget?.username}] 비밀번호 초기화
        </p>
        <button type="button" onClick={() => setResetTarget(null)}
          className="rounded-lg p-1 text-[#8B949E] hover:bg-[#30363D] hover:text-white">
          <span className="text-lg leading-none">×</span>
        </button>
      </div>
      <div className="space-y-4 px-6 pt-5">
        <div className="rounded-xl border border-[#EAB308]/30 bg-[#EAB308]/10 px-4 py-3 text-xs text-[#EAB308]">
          ⚠ 초기화된 비밀번호로 설정됩니다. 해당 사용자는 다음 로그인 시 비밀번호를 반드시 변경해야 합니다.
        </div>
        <div>
          <Label className="mb-1.5 block text-sm text-[#8B949E]">새 임시 비밀번호</Label>
          <div className="relative">
            <Input type={showResetPw ? 'text' : 'password'} value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              autoComplete="new-password"
              className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] pr-11 text-white" />
            <button type="button" tabIndex={-1} onClick={() => setShowResetPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B949E] hover:text-white">
              {showResetPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-[#8B949E]">8자 이상, 대소문자·숫자·특수문자 포함</p>
        </div>
        {resetErrors.length > 0 && (
          <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#FCA5A5]">
            {resetErrors.map((e) => <p key={e}>{e}</p>)}
          </div>
        )}
      </div>
      <div className="mt-6 flex gap-3 px-6">
        <Button type="button" variant="outline" onClick={() => setResetTarget(null)}
          className="h-12 flex-1 rounded-xl border-[#30363D] bg-[#0D1117] text-white hover:bg-[#252A32]">취소</Button>
        <Button type="submit" disabled={resetting}
          className="h-12 flex-1 rounded-xl bg-gradient-to-r from-[#EAB308] to-[#F59E0B] font-semibold text-black">
          {resetting ? '처리 중…' : '비밀번호 초기화'}
        </Button>
      </div>
    </form>
  </DialogContent>
</Dialog>
```

- [ ] **Step 6: Verify in browser**

Run `npm run dev`, log in as admin, go to `/admin/accounts`. For any other account you should see a yellow key icon button. Clicking it opens the reset modal with a warning banner. Enter a valid password → submit → modal closes. Check `/admin/auditlog` for the `PASSWORD_RESET_BY_ADMIN` entry.

- [ ] **Step 7: Commit**

```bash
git add src/pages/AdminAccounts.jsx
git commit -m "feat: admin can reset other users' passwords with forced change on next login"
```

---

## Task 4: Remove "regenerate patient code" button

**Files:**
- Modify: `src/pages/NewPatient.jsx`

The patient code is sequential (`PT-YYYY-NNN`, max+1 of existing codes) and read-only. Regenerating always returns the same value, so the button serves no purpose.

- [ ] **Step 1: Remove `RefreshCw` from the lucide-react import**

Change:
```js
import {
  Calendar as CalendarIcon,
  RefreshCw,
  CloudUpload,
  ...
} from 'lucide-react';
```
To:
```js
import {
  Calendar as CalendarIcon,
  CloudUpload,
  ...
} from 'lucide-react';
```

- [ ] **Step 2: Delete the `regenerateCode` function**

Remove these lines entirely (around line 226):
```js
const regenerateCode = () => {
  setFormData((prev) => ({ ...prev, patient_code: nextPatientCode() }));
};
```

- [ ] **Step 3: Simplify the patient code field to input-only**

Replace the `<div className="flex gap-2">` block that wraps the patient code input and regenerate button with just the input:

```jsx
<div>
  <Label htmlFor="new-patient-code" className="text-[#8B949E] mb-2 block font-medium">
    환자 코드
  </Label>
  <Input
    id="new-patient-code"
    value={formData.patient_code}
    readOnly
    className="h-12 bg-[#0D1117] border-[#30363D] text-[#8B949E] rounded-xl"
  />
</div>
```

- [ ] **Step 4: Verify in browser**

Navigate to `/newpatient`. The patient code field shows `PT-2026-NNN` with no button next to it. Submitting a new patient increments to the next code correctly.

- [ ] **Step 5: Commit**

```bash
git add src/pages/NewPatient.jsx
git commit -m "chore: remove redundant regenerate-patient-code button — code is always sequential"
```

---

## Task 5: Single button on calibration results pages

**Files:**
- Modify: `src/pages/TrainingReport.jsx`
- Modify: `src/pages/TypeDecision.jsx`

Both pages have a fixed bottom bar with "처음으로" (→ Home) and "저장 및 종료" (→ Patient Dashboard). Since calibration data is auto-saved during analysis, neither label is accurate. Replace the two buttons with one full-width "환자 대시보드로 이동" button.

- [ ] **Step 1: Update `TrainingReport.jsx` footer**

Remove the `handleHome` function and update the `handleSaveAndExit` function name to `handleDashboard`:

```jsx
const handleDashboard = () => {
  if (patientId) {
    navigate(
      `${createPageUrl('PatientDashboard')}?patientId=${encodeURIComponent(patientId)}`
    );
  } else {
    navigate(createPageUrl('Home'));
  }
};
```

Replace the fixed bottom bar JSX:

```jsx
<div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#30363D] bg-[#0D1117]/95 p-4 backdrop-blur">
  <div className="mx-auto max-w-2xl">
    <Button
      type="button"
      onClick={handleDashboard}
      className="h-12 w-full bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-base font-semibold text-white hover:from-[#2563EB] hover:to-[#7C3AED]"
    >
      환자 대시보드로 이동
    </Button>
  </div>
</div>
```

- [ ] **Step 2: Update `TypeDecision.jsx` footer**

Remove `handleHome` and rename `handleSaveAndExit` to `handleDashboard`:

```jsx
const handleDashboard = () => {
  navigate(createPageUrl('PatientDashboard') + `?patientId=${patientId}`);
};
```

Replace the fixed bottom bar JSX (same template as above):

```jsx
<div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#30363D] bg-[#0D1117]/95 p-4 backdrop-blur">
  <div className="mx-auto max-w-2xl">
    <Button
      type="button"
      onClick={handleDashboard}
      className="h-12 w-full bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-base font-semibold text-white hover:from-[#2563EB] hover:to-[#7C3AED]"
    >
      환자 대시보드로 이동
    </Button>
  </div>
</div>
```

- [ ] **Step 3: Verify in browser**

Run a calibration flow to reach TypeDecision or TrainingReport. The bottom bar shows a single gradient button "환자 대시보드로 이동". Clicking it navigates to the patient's dashboard.

- [ ] **Step 4: Commit**

```bash
git add src/pages/TrainingReport.jsx src/pages/TypeDecision.jsx
git commit -m "chore: replace two-button footer with single dashboard button on calibration result pages"
```
