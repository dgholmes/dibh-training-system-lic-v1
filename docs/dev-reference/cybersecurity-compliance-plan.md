# Cybersecurity Compliance Plan
## 의료기기 사이버보안 허가·심사 가이드라인 (안내서-0995-05, 2025.01.10)

This plan maps every applicable requirement from the MFDS guideline to concrete implementation tasks for the DIBH Training System (SaMD — Software as a Medical Device).

---

## Applicability Assessment

Our app is a **SaMD** (소프트웨어 의료기기) — browser-based, fully offline, no hardware. This means:
- SI-10 (물리적 변조 방지) — **NOT APPLICABLE** (SaMD exception)
- SI-11 (부트 프로세스 무결성) — **NOT APPLICABLE** (SaMD exception)
- All other requirements — **APPLICABLE**

---

## Requirements & Implementation Tasks

### 1. Identification & Authentication (IA — 식별 및 인증)

| Code | Requirement | Current State | Task |
|---|---|---|---|
| IA-01 | User identification & authentication on all interfaces | Fake login (any credential works) | Implement real auth with username/password |
| IA-02 | Account management (add/activate/modify/disable/delete) | No account management | Build account management screen (admin only) |
| IA-03 | Unique identifier per account | No identity system | Each account gets a unique, unambiguous ID |
| IA-04 | Credential management: initial creds, forced change of defaults, periodic rotation, hashed storage | Passwords not stored at all | Hash passwords (bcrypt/SHA-256+salt), force change on first login, periodic rotation reminder |
| IA-05 | Password strength enforcement (complexity rules) | None | Enforce minimum length + character class rules on all password fields |
| IA-06 | Credential feedback protection: mask input, generic auth failure messages | Password field is visible plain text; "Unknown user" style errors possible | Mask password fields; return generic "인증 실패" without specifying cause |
| IA-07 | Login attempt lockout after N consecutive failures | No lockout | Lock account for defined period after 5 failed attempts |
| IA-08 | System usage notification banner shown at login | None | Display legal/monitoring notice banner before login completes |

### 2. Use Control (UC — 사용 통제)

| Code | Requirement | Current State | Task |
|---|---|---|---|
| UC-01 | Role-based authorization with least-privilege | Single implied role, no RBAC | Define roles (admin, clinician); restrict pages/actions by role |
| UC-02 | Mobile code execution control | React SPA runs JS — needs CSP headers | Add Content Security Policy headers via Vite/server config |
| UC-04 | Audit log: record access, data creation, modification, deletion | No audit trail | Implement audit log entity recording user, action, timestamp, target |
| UC-05 | Audit log failure handling | N/A (no logs exist) | Graceful degradation if audit log write fails; do not silently drop events |
| UC-06 | Timestamps on all audit records | N/A | ISO 8601 timestamps on every audit log entry |
| UC-07 | Non-repudiation: user identity recorded against each action | N/A | Bind logged-in user ID to every audit log entry |

### 3. System Integrity (SI — 시스템 무결성)

| Code | Requirement | Current State | Task |
|---|---|---|---|
| SI-01 | Communication integrity (if networked) | Fully offline — low risk; future network use must use TLS | Document offline-only stance; enforce HTTPS if ever networked |
| SI-03 | Security function verification (self-check on startup) | None | On app load, verify critical security configs are active |
| SI-04 | Software & data integrity checks | No checksums on stored files | Store SHA-256 hash of each uploaded CSV/VXP alongside file; verify on read |
| SI-05 | Input validation: range, type, length, SQL injection, XSS | Partial (Zod on forms) | Audit all inputs; add sanitization; verify XSS protection in all text outputs |
| SI-07 | Error handling: do not expose internal info in error messages | Some errors expose raw JS errors to UI | Sanitize all user-facing error messages; no stack traces in UI |
| SI-08 | Software update mechanism | No update mechanism | Document versioning; provide clear update instructions; expose app version in UI |
| SI-09 | Verify authenticity & integrity of updates before install | N/A | Provide SHA-256 hash manifest for each release; verify before applying |

### 4. Data Confidentiality (DC — 데이터 기밀성)

| Code | Requirement | Current State | Task |
|---|---|---|---|
| DC-01 | Confidentiality of stored and transmitted data | Patient PII stored as plain JSON in localStorage | Encrypt sensitive fields (name, DOB, patient_code) at rest using AES-256 |
| DC-02 | De-identification of health data | No de-identification feature | Implement export/display de-identification (pseudonymize name + DOB when sharing/exporting) |
| DC-03 | Use approved cryptographic algorithms (≥112-bit security) | No crypto in use | Use AES-256 for storage, SHA-256 with salt for passwords; document key management |

### 5. Timely Response to Events (TRE — 이벤트 적시 대응)

| Code | Requirement | Current State | Task |
|---|---|---|---|
| TRE-01 | Audit log access restricted to authorized users (read-only) | No audit log exists | Admin-only audit log viewer page; log entries immutable (append-only) |

### 6. Resource Availability (RA — 자원 가용성)

| Code | Requirement | Current State | Task |
|---|---|---|---|
| RA-01 | DoS prevention — essential functions maintained | Offline app, low network exposure; N/A unless networked | Document rationale; if ever networked, add rate limiting |
| RA-02 | Backup functionality (does not interrupt normal operation) | No export/backup feature | Implement encrypted data export (JSON backup of all patient/calibration data) |
| RA-03 | Recovery and reconfiguration after interruption | No restore feature | Implement backup restore; validate imported data integrity before applying |

---

## Documentation Requirements (허가·심사 첨부자료)

These are not code tasks but documents required for MFDS submission:

1. **사이버보안 위험관리 보고서** — Risk analysis, evaluation, control, residual risk report
2. **소프트웨어 명세서 (SBOM)** — Full list of third-party libraries with versions and known CVEs
3. **사용자 설명서 보안 섹션** — User manual section on security configuration, credential management, incident response contacts
4. **사이버보안 요구사항 체크리스트** — The guideline's own checklist (Annex IV) completed and signed

---

## Cryptographic Standards Reference (DC-03)

Per MFDS guideline, minimum 112-bit security strength:
- **Symmetric encryption**: AES-128/192/256 ✓
- **Hashing (passwords)**: SHA-256 with salt (bcrypt recommended) ✓
- **Hashing (integrity)**: SHA-256 ✓
- **Do NOT use**: MD5, SHA-1 for security purposes, DES, RC4

---

## Priority Order

| Priority | Group | Reason |
|---|---|---|
| P1 (Critical) | IA-01, IA-04, IA-05, IA-06, IA-07 | Authentication is the primary attack surface; fake login is a blocking issue |
| P1 (Critical) | DC-01, DC-03 | Patient PII in plaintext localStorage is the most severe data risk |
| P2 (High) | UC-04, UC-06, UC-07, TRE-01 | Audit trail required for regulatory traceability |
| P2 (High) | SI-05, SI-07 | Input validation and safe error handling prevent exploitation |
| P3 (Medium) | IA-02, IA-03, IA-08, UC-01 | Account management and RBAC |
| P3 (Medium) | DC-02, SI-04, SI-08, SI-09 | Data de-identification, integrity, update process |
| P4 (Low) | RA-02, RA-03, UC-02, SI-03 | Backup/restore, CSP, self-check |
| P5 (Docs) | Risk report, SBOM, user manual, checklist | Required before regulatory submission |
