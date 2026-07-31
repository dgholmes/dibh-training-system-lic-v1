# B3 — Env-Driven Debug Mode + Audit-Log FIFO Test Hook — Design Spec

**Date:** 2026-07-14 (revised 2026-07-15)
**Scope:** Replace the hardcoded `SECURITY_DEBUG` source flag with a build-time env var, and add a debug-only admin UI button that seeds 10,000 real audit-log entries on demand, so QA can verify the FIFO trim behavior against the actual certified threshold — not a substitute number.
**Related:** `docs/submission/ktc-review-2026-07-14.md` §0 memo #11 (audit FIFO test-environment request)

---

## Background

`src/lib/securityDebug.js` currently exports `SECURITY_DEBUG = false` as a hardcoded literal, requiring a manual source edit + rebuild to enable, with a standing risk of forgetting to flip it back before a production/submission build.

`src/api/auditStore.js` hardcodes `MAX_ENTRIES = 10_000` for the audit log's FIFO trim. There's currently no way to observe this trim behavior without actually accumulating 10,000 entries.

**Revision note (2026-07-15):** the original design proposed making `MAX_ENTRIES` itself overridable via env var so QA could test against a smaller number (e.g. 5). Superseded per user direction — testing against a substitute threshold doesn't actually verify the certified 10,000-entry behavior, and parameterizing a compliance-relevant constant at all (even behind a debug gate) was an avoidable risk. The revised design tests the **real** threshold directly instead: `MAX_ENTRIES` stays a fixed, non-overridable `10_000` everywhere, and a debug-only admin button generates 10,000 real entries so the actual trim can be observed and demonstrated to KTC directly.

## Design

### 1. Env var (`.env`, not committed with non-default values)

```
VITE_DEBUG_MODE=false   # default; set true only for local/QA debug builds
```

Add `.env.example` documenting it, with a comment that it must never be `true` in a submission or production build.

### 2. `src/lib/securityDebug.js`

```js
export const SECURITY_DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true';
```

No other changes — all existing `secDbg(...)` call sites are unaffected.

### 3. `src/api/auditStore.js` — `MAX_ENTRIES` is untouched

`MAX_ENTRIES = 10_000` remains a plain hardcoded constant — **no env override, no parameterization, in any build.** This is deliberately the safest option: there is no mechanism, gated or otherwise, that can ever change this compliance-relevant number. The only new thing `auditStore.js` gets is a bulk-seed helper for the debug button (see §4), which still respects the same trim logic as normal writes.

```js
/**
 * Debug-only: append `count` synthetic entries in one bulk write, respecting the
 * existing MAX_ENTRIES FIFO trim. Bypasses per-entry writeAuditLog() to avoid
 * O(n^2) re-serialization of the growing array on every single call.
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
      timestamp: new Date(now + i).toISOString(), // monotonically increasing for stable ordering
    });
  }
  const trimmed = log.length > MAX_ENTRIES ? log.slice(log.length - MAX_ENTRIES) : log;
  localStorage.setItem(AUDIT_KEY, JSON.stringify(trimmed));
  return { generated: count, totalAfterTrim: trimmed.length };
}
```

Add `DEBUG_SEED_ENTRY` to `AUDIT_ACTIONS`, clearly commented as debug/test-only and structurally incapable of appearing in a production build (since the seeding path itself throws unless `SECURITY_DEBUG` is true).

### 4. Debug-only admin UI button

In `src/pages/AdminAuditLog.jsx`, render a button (e.g. "디버그: 감사로그 10,000건 생성") **only when `SECURITY_DEBUG === true`** — same gate as everywhere else. Clicking it calls `seedDebugAuditEntries(10_000)`, then refreshes the visible log list, so a tester can immediately see the oldest real entries trimmed away and confirm the count holds steady at 10,000.

### 5. Visible debug-build indicator (safety requirement)

When `SECURITY_DEBUG === true`, render a small persistent on-screen indicator (e.g., a thin banner or corner tag reading "DEBUG BUILD") somewhere always-visible (e.g., in `App.jsx` or a top-level layout wrapper). This matters more now that a literal data-seeding button exists behind the flag — if a debug build were ever accidentally handed to KTC or installed at a hospital, this makes it immediately, visibly obvious rather than a silent difference only discoverable by inspecting `.env` or console output.

### 6. Documentation requirement

Add a note near UC-04 in the compliance doc explaining that a controlled debug/QA build variant exists specifically to demonstrate the audit-log FIFO-trim behavior against the real 10,000-entry threshold on demand (directly answering HWP memo #11's request), that it is disabled by default, visually distinguishable via the on-screen indicator when active, and absent from the submission build.

### 7. Constraints

- Build-time only — matches how `SECURITY_DEBUG` already works today. Not a runtime toggle inside an installed APK; flipping it requires rebuilding with a different `.env`.
- No new dependencies. No native rebuild required (pure JS/Vite env substitution).
- `MAX_ENTRIES` behavior is identical in every build, debug or production — only the *ability to generate test volume* is gated, not the retention limit itself.

## Testing

- Vitest: `seedDebugAuditEntries` throws when `SECURITY_DEBUG` is false.
- Vitest: seeding 10,000 entries results in exactly 10,000 entries in the log (trim applied correctly on a bulk write), oldest-first ordering preserved.
- Vitest: verify the debug indicator and seed button render only when `SECURITY_DEBUG` is true.
- Manual: build with `VITE_DEBUG_MODE=true`, confirm the on-screen debug indicator and seed button both appear, click the seed button, confirm exactly 10,000 entries exist and `getAuditLogCapacity()` reports 100%.
