# Software Bill of Materials (SBOM)
## DIBH Training System v1.0.0

**Document type:** SBOM (소프트웨어 구성 명세서)  
**Standard reference:** MFDS 의료기기 사이버보안 허가·심사 가이드라인 안내서-0995-05  
**Prepared:** 2026-04-28  
**Product:** DIBH 훈련 시스템 (Software as a Medical Device, SaMD)

---

## 1. Product Overview

| Item | Details |
|---|---|
| Product name | DIBH Training System |
| Version | 1.0.0 |
| Type | SaMD — Browser-based offline web application |
| Runtime | Modern web browser (Chrome 120+, Edge 120+) |
| Platform | Windows 10/11 |
| No backend server | All processing is client-side only |

---

## 2. Runtime Dependencies

These libraries are bundled into the production build and shipped to end users.

| Package | Version | License | Purpose | Known CVEs |
|---|---|---|---|---|
| react | 18.2.0 | MIT | UI framework | None known |
| react-dom | 18.2.0 | MIT | DOM rendering | None known |
| react-router-dom | 7.2.0 | MIT | Client-side routing | None known |
| @tanstack/react-query | 5.90.16 | MIT | Data fetching / cache | None known |
| react-hook-form | 7.54.2 | MIT | Form state management | None known |
| zod | 3.24.2 | MIT | Schema validation | None known |
| sql.js | 1.14.1 | MIT | WebAssembly SQLite (offline DB) | None known |
| date-fns | 3.6.0 | MIT | Date formatting | None known |
| recharts | 2.15.1 | MIT | Waveform charts | None known |
| framer-motion | 12.4.7 | MIT | UI animations | None known |
| lucide-react | 0.475.0 | ISC | SVG icons | None known |
| sonner | 2.0.1 | MIT | Toast notifications | None known |
| tailwind-merge | 3.0.2 | MIT | CSS class merging | None known |
| tailwindcss-animate | 1.0.7 | MIT | CSS animations | None known |
| clsx | 2.1.1 | MIT | Conditional CSS classes | None known |
| class-variance-authority | 0.7.1 | Apache-2.0 | UI variant management | None known |
| next-themes | 0.4.4 | MIT | Theme management | None known |
| react-day-picker | 8.10.1 | MIT | Calendar picker | None known |
| embla-carousel-react | 8.5.2 | MIT | Carousel component | None known |
| input-otp | 1.4.2 | MIT | OTP input component | None known |
| react-resizable-panels | 2.1.7 | MIT | Resizable layout panels | None known |
| vaul | 1.1.2 | MIT | Drawer/sheet component | None known |
| cmdk | 1.0.0 | MIT | Command palette | None known |
| @hookform/resolvers | 4.1.2 | MIT | Zod adapter for react-hook-form | None known |

### Radix UI Primitives (all MIT licensed)

| Package | Version |
|---|---|
| @radix-ui/react-accordion | 1.2.3 |
| @radix-ui/react-alert-dialog | 1.1.6 |
| @radix-ui/react-aspect-ratio | 1.1.2 |
| @radix-ui/react-avatar | 1.1.3 |
| @radix-ui/react-checkbox | 1.1.4 |
| @radix-ui/react-collapsible | 1.1.3 |
| @radix-ui/react-context-menu | 2.2.6 |
| @radix-ui/react-dialog | 1.1.6 |
| @radix-ui/react-dropdown-menu | 2.1.6 |
| @radix-ui/react-hover-card | 1.1.6 |
| @radix-ui/react-label | 2.1.2 |
| @radix-ui/react-menubar | 1.1.6 |
| @radix-ui/react-navigation-menu | 1.2.5 |
| @radix-ui/react-popover | 1.1.6 |
| @radix-ui/react-progress | 1.1.2 |
| @radix-ui/react-radio-group | 1.2.3 |
| @radix-ui/react-scroll-area | 1.2.3 |
| @radix-ui/react-select | 2.1.6 |
| @radix-ui/react-separator | 1.1.2 |
| @radix-ui/react-slider | 1.2.3 |
| @radix-ui/react-slot | 1.1.2 |
| @radix-ui/react-switch | 1.1.3 |
| @radix-ui/react-tabs | 1.1.3 |
| @radix-ui/react-toggle | 1.1.2 |
| @radix-ui/react-toggle-group | 1.1.2 |
| @radix-ui/react-tooltip | 1.1.8 |

---

## 3. Build-time / Development Dependencies

These are used only during development and are not shipped to end users.

| Package | Version | License | Purpose |
|---|---|---|---|
| vite | 6.1.0 | MIT | Build tool & dev server |
| @vitejs/plugin-react | 4.3.4 | MIT | React JSX transform for Vite |
| vitest | 3.0.5 | MIT | Unit test framework |
| tailwindcss | 3.4.17 | MIT | CSS utility framework (build-time) |
| postcss | 8.5.3 | MIT | CSS post-processor |
| autoprefixer | 10.4.20 | MIT | CSS vendor prefix automation |
| eslint | 9.19.0 | MIT | Static code analysis |
| eslint-plugin-react | 7.37.4 | MIT | React-specific lint rules |
| eslint-plugin-react-hooks | 5.0.0 | MIT | React hooks lint rules |
| eslint-plugin-react-refresh | 0.4.18 | MIT | HMR lint rules |
| @eslint/js | 9.19.0 | MIT | ESLint JS config |
| globals | 15.14.0 | MIT | Global variable definitions for ESLint |
| @types/react | 18.2.66 | MIT | TypeScript types for React |
| @types/react-dom | 18.2.22 | MIT | TypeScript types for ReactDOM |
| @types/node | 22.13.5 | MIT | TypeScript types for Node.js |
| @flydotio/dockerfile | 0.7.8 | MIT | Dockerfile generator |

---

## 4. External Runtime Resources

These are loaded from external CDNs at runtime (not bundled).

| Resource | Source | Purpose | Fallback if unavailable |
|---|---|---|---|
| Pretendard variable font | cdn.jsdelivr.net | Korean UI typeface | System sans-serif fallback |
| Space Grotesk font | fonts.googleapis.com / fonts.gstatic.com | Numeric / data display | System monospace fallback |

> **Note:** The app is fully functional offline. Font CDNs are cosmetic only — all clinical features work without them.

---

## 5. Browser-Native APIs Used (No Library)

| API | Purpose | Security relevance |
|---|---|---|
| Web Crypto API (`crypto.subtle`) | AES-256-GCM encryption, PBKDF2 key derivation, SHA-256 hashing | Core security primitive — DC-01, DC-03, IA-04, SI-04 |
| IndexedDB | SQLite WASM persistence (via sql.js) | Offline file BLOB storage |
| localStorage | Patient records, audit log, install key, user accounts | Primary data store |
| sessionStorage | Active session token | Session management (IA-01, UC) |

---

## 6. CVE Monitoring

**Last checked:** 2026-04-28  
**Source:** npm audit, GitHub advisory database

```
npm audit --production
```

No high or critical vulnerabilities found as of the date above. sql.js (WebAssembly SQLite) and react/react-dom are the highest-risk packages due to their size and complexity. Monitor:

- https://github.com/sql-js/sql.js/security/advisories
- https://github.com/facebook/react/security/advisories
- https://github.com/TanStack/query/security/advisories

**Update policy:** Review SBOM and run `npm audit` before each new release. Apply security patches within 30 days of disclosure for high/critical CVEs.

---

## 7. License Summary

| License | Count | Packages |
|---|---|---|
| MIT | 52 | All Radix UI, React, sql.js, date-fns, recharts, Vite, etc. |
| ISC | 1 | lucide-react |
| Apache-2.0 | 1 | class-variance-authority |

All licenses are permissive and compatible with commercial medical software distribution.
