# B2 — Admin-Configurable Usage Notice Banner (IA-08) — Design Spec

**Date:** 2026-07-14
**Scope:** Make the `UsageNoticeBanner` text on `Login.jsx` editable by an admin, instead of a hardcoded string — closes the gap where IA-08 claims "인가된 사용자에 의해 설정 가능" but no such mechanism exists.
**Related:** `docs/submission/ktc-review-2026-07-14.md` §3 item 1

---

## Background

`src/pages/Login.jsx:19-45` defines `UsageNoticeBanner` with four fixed Korean sentences hardcoded in JSX. IA-08's compliance claim requires this text be configurable by an authorized user. No settings UI exists anywhere in the app for this today (confirmed via grep across `src/`).

## Design

### Storage

New localStorage key `dibh_usage_notice` — plain text, not encrypted. This banner text is not sensitive (it's a public notice shown pre-login), unlike the account-metadata/audit-log items identified elsewhere in the KTC review that specifically require encryption/integrity. If the key is unset, the app falls back to the current 4-sentence hardcoded text as the default — so behavior is unchanged for anyone who never edits it, and the currently-certified banner content remains the default.

### Edit UI

New section within the existing `AdminAccounts.jsx` page (admin-only route, already gated by `AdminRoute`) rather than a new top-level route:
- Textarea bound to the current notice text (default-populated from the hardcoded fallback if unset)
- Character limit: 1000, validated via a `zod` schema (matches the project's existing `react-hook-form` + `zod` convention)
- Save button — writes to `dibh_usage_notice`, shows a `sonner` toast on success/failure (matches existing UI conventions)
- "Reset to default" action to restore the original hardcoded text

### Audit logging

New `AUDIT_ACTIONS.USAGE_NOTICE_UPDATED` constant in `auditStore.js`. Logged via `tryWriteAuditLog` on save, with `detail` noting the change occurred (not the full new text, to keep audit entries concise — consistent with how other entity-update actions log a reference rather than a full diff).

### `Login.jsx` changes

`UsageNoticeBanner` reads `localStorage.getItem('dibh_usage_notice')` and renders it (falling back to the current hardcoded default text if null/empty), instead of the current fully-static JSX content.

## Testing

- Vitest: banner renders default text when key unset; renders custom text when key set; falls back to default on empty string.
- Vitest: save function rejects text over 1000 chars; writes audit log entry on successful save.
- Manual: edit notice as admin, log out, confirm updated text appears on login screen; reset to default, confirm original text returns.
