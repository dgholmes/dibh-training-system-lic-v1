# Design: Analysis Animation Fix + Admin Button Labels

**Date:** 2026-05-21  
**Status:** Approved

---

## Problem Statement

Two independent UX issues:

1. **Analysis animation black on tablet** — The loading modal in `AnalysisFileSelect.jsx` uses a `<video>` element to play `analysis-loading.mp4`. On Android tablets (Capacitor WebView), the video renders black and does not play due to Android WebView autoplay policy restrictions, even with `muted` and `playsInline` set.

2. **Admin icon-only buttons are cryptic** — In `AdminAccounts.jsx`, three action buttons per user row (role toggle, password reset, delete) are icon-only with `title` tooltip attributes. On touch devices, tooltips are inaccessible, making the buttons difficult to understand at a glance.

---

## Solution

### 1 — Swap `<video>` for animated WebP `<img>`

`<img>` elements have no autoplay restrictions — they render immediately without requiring a user gesture. An animated WebP asset (`analysis-loading-ezgif.com-video-to-webp-converter.webp`) already exists in `public/`.

**Changes:**
- Rename `public/analysis-loading-ezgif.com-video-to-webp-converter.webp` → `public/analysis-loading.webp`
- In `src/pages/AnalysisFileSelect.jsx`:
  - Remove the `import analysisLoadingVideo from '@/assets/analysis-loading.mp4'` import
  - Remove the hidden preload `<video>` element at the top of the JSX (not needed for `<img>`)
  - Replace the modal `<video ...>` with `<img src="/analysis-loading.webp" alt="" className="w-full" />`

### 2 — Add text labels to icon-only admin buttons

Buttons with both icon and label are readable without hover tooltips, consistent with the existing "잠금해제" button that already has text.

**Changes in `src/pages/AdminAccounts.jsx`:**
- Action row `<div>`: add `flex-wrap` so buttons can wrap on narrow screens
- Role toggle button: add `gap-1.5` + `<span>역할 변경</span>` after the icon; remove `title`
- Password reset button: add `gap-1.5` + `<span>비밀번호 초기화</span>` after the icon; remove `title`
- Delete button: add `gap-1.5` + `<span>삭제</span>` after the icon

---

## Files Affected

| File | Change |
|---|---|
| `public/analysis-loading-ezgif.com-video-to-webp-converter.webp` | Rename to `analysis-loading.webp` |
| `src/pages/AnalysisFileSelect.jsx` | Remove video import + preload element; swap `<video>` → `<img>` |
| `src/pages/AdminAccounts.jsx` | Add text labels + `flex-wrap` to action buttons |

---

## Out of Scope

- No changes to analysis logic, calibration pipeline, or other admin pages
- No layout restructuring of the user list card
- No change to the MP4 asset itself (can be kept or removed separately)
