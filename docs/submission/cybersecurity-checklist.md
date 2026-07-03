# 의료기기 사이버보안 요구사항 체크리스트
## MFDS Cybersecurity Requirements Checklist

**근거:** 의료기기 사이버보안 허가·심사 가이드라인 안내서-0995-05 (2025.01.10)  
**제품:** DIBH Training System v1.0.0 (SaMD)  
**작성일:** 2026-04-28

범례: ✅ 구현됨 | ➖ 해당없음 (SaMD 예외 또는 오프라인 전용)

---

## 식별 및 인증 (IA, Identification & Authentication)

| 코드 | 요구사항 | 상태 | 구현 위치 |
|---|---|---|---|
| IA-01 | 사용자 식별 및 인증 | ✅ | `authStore.js` — PBKDF2-SHA256 해시, 세션 토큰 |
| IA-02 | 계정 관리 (추가·활성·수정·비활성·삭제) | ✅ | `AdminAccounts.jsx`, `authStore.js` UserStore |
| IA-03 | 식별정보 관리 (고유 사용자 ID) | ✅ | 각 계정에 UUID 형식 고유 ID 부여 |
| IA-04 | 인증정보 관리 (초기 비밀번호 강제 변경, 주기적 변경, 해시 저장) | ✅ | `authStore.js` — mustChangePassword 플래그, PBKDF2 단방향 해시 |
| IA-05 | 비밀번호 강도 설정 | ✅ | `passwordUtils.js` — 8자·대소문자·숫자·특수문자 |
| IA-06 | 인증정보 피드백 보호 (마스킹, 일반 오류 메시지) | ✅ | `Login.jsx` — type="password", 일반 오류 메시지 |
| IA-07 | 연속 로그인 실패 시 잠금 (5회 실패 → 15분 잠금) | ✅ | `authStore.js` |
| IA-08 | 시스템 사용 알림 메시지 (로그인 전 배너) | ✅ | `Login.jsx` UsageNoticeBanner |

## 사용 통제 (UC, Use Control)

| 코드 | 요구사항 | 상태 | 구현 위치 |
|---|---|---|---|
| UC-01 | 권한 부여 (역할 기반, 최소권한) | ✅ | `index.jsx` AdminRoute, `Home.jsx` 역할별 UI |
| UC-02 | 모바일 코드 사용 통제 (CSP) | ✅ | `index.html` CSP 메타태그, `vite.config.js` 서버 헤더 |
| UC-04 | 감사기록 생성 (로그인·CRUD·분석) | ✅ | `auditStore.js`, `localStore.js`, `authStore.js` |
| UC-05 | 감사 처리 실패 대응 | ✅ | `auditStore.js` writeAuditLog — 실패 시 예외 전파 |
| UC-06 | 타임스탬프 (ISO 8601) | ✅ | 모든 감사 로그 항목에 `timestamp: new Date().toISOString()` |
| UC-07 | 부인 방지 (사용자 ID 기록) | ✅ | 모든 감사 로그에 `userId`, `username` 포함 |

## 시스템 무결성 (SI, System Integrity)

| 코드 | 요구사항 | 상태 | 구현 위치 |
|---|---|---|---|
| SI-01 | 통신 무결성 | ➖ | 오프라인 전용 — 외부 통신 없음. 미래 네트워크 사용 시 TLS 적용 필요 |
| SI-02 | 악성코드로부터 보호 | ➖ | 브라우저 샌드박스 + 호스트 OS 백신 의존. CSP로 스크립트 삽입 방지 |
| SI-03 | 보안 기능 검증 (자가진단) | ✅ | `main.jsx` securitySelfCheck — 암호화·스토리지 초기화 검증 |
| SI-04 | 소프트웨어 및 정보 무결성 점검 | ✅ | `breathingFileRepository.js` — 업로드 시 SHA-256 저장, 분석 전 재검증 |
| SI-05 | 입력값 검증 (범위·길이·XSS·SQL삽입) | ✅ | Zod 스키마, 길이 제한, React XSS 기본 방지, 파라미터화 SQL |
| SI-06 | 오류 시 사전 결정 상태 출력 | ➖ | 자동화 프로세스 미연결 — 해당없음 |
| SI-07 | 오류 처리 (내부 정보 미노출) | ✅ | 모든 사용자 오류 메시지 일반화 처리, console.error로 내부 정보 분리 |
| SI-08 | 업데이트 기능 | ✅ | 버전 UI 표시 (`__APP_VERSION__`), 업데이트 절차 사용자 설명서 기술 |
| SI-09 | 업데이트 진본성 및 무결성 검증 | ✅ | 릴리스 시 SHA-256 해시 매니페스트 제공 절차 수립 (사용자 설명서 참조) |
| SI-10 | 물리적 변조 방지 | ➖ | SaMD 예외 조항 적용 |
| SI-11 | 부트 프로세스 무결성 검증 | ➖ | SaMD 예외 조항 적용 |

## 데이터 기밀성 (DC, Data Confidentiality)

| 코드 | 요구사항 | 상태 | 구현 위치 |
|---|---|---|---|
| DC-01 | 저장 및 전송 정보 기밀성 | ✅ | `crypto.js` AES-256-GCM — 환자 PII 암호화 저장. 전송 없음 |
| DC-02 | 보건의료정보 비식별화 | ✅ | `AdminBackup.jsx` 비식별 CSV 내보내기 (이름·생년월일 제외) |
| DC-03 | 안전한 암호화 사용 (112비트 이상) | ✅ | AES-256-GCM (256비트), PBKDF2-SHA256 (256비트), SHA-256 해시 |

## 이벤트 적시 대응 (TRE, Timely Response to Events)

| 코드 | 요구사항 | 상태 | 구현 위치 |
|---|---|---|---|
| TRE-01 | 감사로그 비인가 접근 제한 (읽기 전용) | ✅ | `AdminAuditLog.jsx` — admin 역할 전용, 수정/삭제 UI 없음 |

## 자원 가용성 (RA, Resource Availability)

| 코드 | 요구사항 | 상태 | 구현 위치 |
|---|---|---|---|
| RA-01 | DoS 방지 | ➖ | 오프라인 단일 사용자 — 네트워크 DoS 해당없음. 로그인 잠금으로 계정 무차별공격 방지 |
| RA-02 | 의료기기 백업 | ✅ | `AdminBackup.jsx` — AES-256 암호화 백업, 정상 운영 중 백업 가능 |
| RA-03 | 의료기기 복구 및 재구성 | ✅ | `AdminBackup.jsx` — SHA-256 무결성 검증 후 복구 |

---

## 암호 알고리즘 준수 확인

| 사용 목적 | 알고리즘 | 키 길이 | 보안강도 | 적합성 |
|---|---|---|---|---|
| 환자 PII 저장 암호화 | AES-GCM | 256비트 | 256비트 | ✅ 적합 |
| 비밀번호 저장 | PBKDF2-SHA256 | 256비트, 100,000회 반복 | 256비트 | ✅ 적합 |
| 파일 무결성 | SHA-256 | — | 256비트 | ✅ 적합 |
| 백업 무결성 | SHA-256 | — | 256비트 | ✅ 적합 |
| 백업 암호화 | AES-GCM | 256비트 | 256비트 | ✅ 적합 |

> 모든 암호 알고리즘이 MFDS 권고 기준(112비트 이상 보안강도) 충족

---

## 제출 서류 목록

| 문서 | 파일 | 상태 |
|---|---|---|
| 본 체크리스트 | `docs/cybersecurity-checklist.md` | ✅ |
| 사이버보안 위험관리 보고서 | `docs/risk-management-report.md` | ✅ |
| SBOM | `docs/sbom.md` | ✅ |
| 사용자 설명서 보안 섹션 | `docs/user-manual-security.md` | ✅ |
| 구현 계획 | `docs/cybersecurity-compliance-plan.md` | ✅ |
