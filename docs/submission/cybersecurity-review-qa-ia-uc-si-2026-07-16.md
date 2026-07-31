# IA-08·UC-01·UC-04·UC-05·SI-02·SI-04·SI-07·SI-09 관련 사항 (Access Control, Audit Log, Malware, Integrity, Errors, Update Distribution)

**제품명:** DIBH 훈련 관리 시스템
**작성일:** 2026년 7월 16일
**작성자:** 개발팀
**문서 목적:** KTC 리뷰어 질의(IA-08 시스템 사용 알림, UC-01 권한 부여, UC-04 감사 로그 항목, UC-05 감사 처리 실패 조건, SI-02 악성코드 보호, SI-04 기타 무결성 대상, SI-07 오류 메시지, SI-09 배포 경로)에 대한 기술적 답변

---

## 질문 1 (IA-08)

> 시스템 사용 알림 메시지 설정과 관련된 구체적인 내용을 문서에 추가해 주시기 바랍니다.

## 질문 2 (UC-01)

> 계정별로 부여된 접근 권한을 명확히 파악할 수 있도록 표 형태로 정리해 주시기 바랍니다.

## 질문 3 (UC-04)

> 감사 로그에 기록되는 항목(타임스탬프, 출처, 카테고리, 유형, 이벤트 ID, 이벤트 결과 등)을 가독성 있게 표로 구조화하여 작성해 주시기 바랍니다.

## 질문 4 (UC-05)

> 현재 "감사 처리 실패 조건"에 대한 식별 내용이 누락되어 있습니다. 해당 조건을 명확히 식별하여 문서에 추가해 주시기 바랍니다.

## 질문 5 (SI-02)

> 미적용을 유지하실 경우 규제 기관이 납득할 수 있는 구체적인 "미적용 사유"를 기재해 주시고, 적용으로 변경하실 경우 그에 맞는 대응/시험 방안을 추가해 주시기 바랍니다.

## 질문 6 (SI-04)

> "기타 위변조 시 제품 동작 또는 보안 기능에 영향을 줄 수 있는 파일"이 무엇인지 명시해 주시고, 산출된 무결성 기준값(해시 등)이 시스템 내 어느 위치에 저장되는지 확인 부탁드립니다.

## 질문 7 (SI-07)

> 시스템에서 발생하는 오류 메시지들을 모두 식별하여 기재해 주시고, 관련 증적(화면 캡처 등)을 문서에 추가해 주시기 바랍니다.

## 질문 8 (SI-09)

> "업데이트 파일이 제조자가 승인한 배포 경로를 통해 제공되었는지 확인한다."라는 시험 기준과 관련하여, 실제 운영 시 구체적으로 어떤 '배포 방법(경로)'을 사용하는지 상세히 기술해 주시기 바랍니다.

---

## 답변

### 답변 1 — IA-08 시스템 사용 알림 메시지 설정

구현 파일: `src/api/usageNoticeStore.js`, `src/pages/Login.jsx`, `src/pages/AdminAccounts.jsx`

| 항목 | 내용 |
|---|---|
| 저장 위치 | `localStorage`의 `dibh_usage_notice` 키 (평문 텍스트, PII 아님) |
| 최대 길이 | 1,000자 — `validateUsageNotice()`가 초과 시 저장을 거부하고 `공지 문구는 최대 1000자까지 입력할 수 있습니다.` 오류를 반환 |
| 설정 권한 | 관리자만 가능 — `/admin/accounts` 화면(코드 내 "시스템 사용 알림 문구" 카드)에서만 편집 가능하며, 이 라우트는 `src/pages/index.jsx`의 `AdminRoute`로 감싸져 있어 `session.role !== 'admin'`이면 `/home`으로 강제 리다이렉트됨 — 일반(임상의) 계정은 이 화면 자체에 진입할 수 없음 |
| 기본값(미설정 시) 동작 | `getCustomUsageNotice()`가 `null`을 반환하면 `Login.jsx`의 `UsageNoticeBanner`가 하드코딩된 기본 4개 문단(인가된 사용자만 사용 가능, 모니터링·기록·감사 대상, 무단 접근 금지·처벌 경고, 접속 시 동의 간주)을 표시 — 즉 "미설정"과 "빈 문자열 저장"은 동일하게 취급되어 항상 기본 문구가 보장됨(공백만 입력해도 `setUsageNotice()`가 트림 후 빈 값이면 키 자체를 삭제) |
| 표시 위치·시점 | `src/pages/Login.jsx` — 로그인 폼이 렌더링되기 **이전** 단계에서 전체 화면으로 표시됨(`noticed` 상태가 `false`인 동안). 아이디/비밀번호 입력 UI는 사용자가 "확인하고 계속하기" 버튼을 눌러야 노출되므로, **인증 시도 이전에 매 로그인 세션마다 반드시 노출**됨 |
| 재설정(기본값 복귀) | `/admin/accounts`의 "기본값으로 재설정" 버튼 → `resetUsageNotice()` → `dibh_usage_notice` 키 삭제 → 이후 로그인 화면은 다시 기본 하드코딩 문구를 표시 |
| 감사 로그 기록 | `USAGE_NOTICE_UPDATED` 액션으로 두 가지 경우 모두 기록됨: (1) 저장 시 `detail: '시스템 사용 알림 문구 변경'`, (2) 재설정 시 `detail: '기본 문구로 재설정'`. 두 경우 모두 `targetType: 'system'`이며 변경 전/후 문구 원문 자체는 로그에 남지 않고 "변경되었다"는 사실과 시각·수행자만 기록됨 |

**문서 기재용 설명:**

> 로그인 화면에 표시되는 시스템 사용 알림 문구는 관리자 계정만 `/admin/accounts` 화면에서 편집할 수 있으며, `localStorage`(`dibh_usage_notice`, 최대 1,000자)에 평문으로 저장됩니다. 문구를 비워두거나 초기화하면 인가된 사용자 전용 안내·모니터링 고지·무단 접근 금지 경고를 포함한 기본 문구가 자동으로 표시되어, 항상 알림 문구가 보장됩니다. 문구는 매 로그인 시도마다 인증 이전 단계에서 전체 화면으로 노출되며, 사용자가 확인 버튼을 눌러야 로그인 폼에 진입할 수 있습니다. 문구 변경·초기화 이력은 감사 로그(`USAGE_NOTICE_UPDATED`)에 기록됩니다.

---

### 답변 2 — UC-01 계정별 접근 권한

구현 파일: `src/api/authStore.js`(`role` 필드: `'admin'` | `'clinician'`), `src/pages/index.jsx`(`ProtectedRoute`, `AdminRoute`)

`AdminRoute`는 `session.role !== 'admin'`이면 `/home`으로 리다이렉트하는 구조이며, 그 외 일반 화면은 `ProtectedRoute`(로그인 여부만 확인, 역할 구분 없음)로 감싸져 있습니다. 코드 전체를 검색한 결과 라우트 가드 외에 역할별 기능 제한(예: 임상의는 환자 삭제 불가 등)은 **존재하지 않으며**, `role` 값이 화면 분기에 쓰이는 곳은 `AdminRoute`와 `Home.jsx`(관리자 메뉴 링크 노출 여부)뿐입니다.

| 라우트 / 기능 | 가드 컴포넌트 | 관리자(admin) | 임상의(clinician) |
|---|---|---|---|
| `/login` | 없음(공개) | O | O |
| `/home` (환자 목록) | `ProtectedRoute` | O | O |
| `/newpatient` (환자 등록) | `ProtectedRoute` | O | O |
| `/patientdashboard` (환자별 대시보드) | `ProtectedRoute` | O | O |
| `/breathingdataupload` (호흡 파일 업로드) | `ProtectedRoute` | O | O |
| `/analysisfileselect` (분석 실행) | `ProtectedRoute` | O | O |
| `/calibrationreport` (캘리브레이션 리포트) | `ProtectedRoute` | O | O |
| `/traininghistory` (훈련 이력) | `ProtectedRoute` | O | O |
| `/typedecision` (유형 확정) | `ProtectedRoute` | O | O |
| `/admin/accounts` (계정 관리 + 사용 알림 문구 편집) | `AdminRoute` | O | **X (`/home`으로 리다이렉트)** |
| `/admin/auditlog` (감사 로그 조회) | `AdminRoute` | O | **X** |
| `/admin/backup` (백업/복구, 비식별 CSV 내보내기) | `AdminRoute` | O | **X** |
| 레거시 라우트(`/calibration`, `/trainingmonitor` 등) | `ProtectedRoute` → `LegacyFlowRedirect` | O(리다이렉트만) | O(리다이렉트만) |

**요약:** 두 역할의 차이는 오직 관리자 3개 화면(계정 관리·감사 로그·백업)에 대한 접근 여부이며, 환자 진료 관련 기능(등록·업로드·분석·리포트·이력)은 인증된 모든 계정이 동일하게 사용할 수 있습니다.

---

### 답변 3 — UC-04 감사 로그 항목 구조

구현 파일: `src/api/auditStore.js` — `AUDIT_ACTIONS` 상수 및 `writeAuditLog()`/`tryWriteAuditLog()` 함수

#### 3-1. 현재 정의된 전체 이벤트 목록

`AUDIT_ACTIONS`는 아래 25개 항목으로 구성되어 있습니다(이전 문서 작성 이후 `SESSION_TIMEOUT`, `BACKUP_CREATED`, `BACKUP_RESTORED`, `DEIDENTIFIED_EXPORT`, `DEBUG_SEED_ENTRY`, `USAGE_NOTICE_UPDATED` 6건이 신규 추가되었고, 2026-07-16 당일 백업/복원/비식별 내보내기의 **실패** 결과를 구분해 기록하기 위해 `BACKUP_CREATE_FAILED`, `BACKUP_RESTORE_FAILED`, `DEIDENTIFIED_EXPORT_FAILED` 3건이 추가로 반영됨).

| 이벤트 코드(`action`) | 카테고리 | 설명 | 발생 시점 | 실제 호출 위치 |
|---|---|---|---|---|
| `LOGIN` | 인증 | 로그인 성공 | 올바른 자격증명으로 로그인 | `authStore.js:loginUser()` |
| `LOGOUT` | 인증 | 로그아웃 | 사용자가 직접 로그아웃 | `authStore.js:clearSession()` |
| `SESSION_TIMEOUT` | 인증 | 세션 자동 만료 | 30분 비활동 시 자동 로그아웃(수동 LOGOUT과 구분) | `authStore.js:clearSessionForTimeout()` |
| `LOGIN_FAILED` | 인증 | 로그인 실패 | 비밀번호 불일치(매 시도마다) | `authStore.js:loginUser()` |
| `ACCOUNT_LOCKED` | 인증 | 계정 잠금 | 5회 연속 실패 후 자동 잠금 | `authStore.js:loginUser()` |
| `USER_CREATED` | 계정 관리 | 계정 생성 | 관리자가 신규 계정 생성 | `AdminAccounts.jsx:handleCreate()` |
| `USER_DELETED` | 계정 관리 | 계정 삭제 | 관리자가 계정 삭제 | `AdminAccounts.jsx` 삭제 핸들러 |
| `USER_ROLE_CHANGED` | 계정 관리 | 권한(역할) 변경 | 관리자가 admin/clinician 전환 | `AdminAccounts.jsx` 역할 전환 핸들러 |
| `USER_UNLOCKED` | 계정 관리 | 계정 잠금 수동 해제 | 관리자가 잠긴 계정 해제 | `AdminAccounts.jsx` 잠금해제 핸들러 |
| `PASSWORD_CHANGED` | 계정 관리 | 본인 비밀번호 변경 | 강제 초기 비밀번호 변경 성공 시 | `Login.jsx:ChangePasswordModal.handleSubmit()` |
| `PASSWORD_RESET_BY_ADMIN` | 계정 관리 | 관리자의 타 계정 비밀번호 초기화 | 관리자가 초기화 실행 | `AdminAccounts.jsx` 초기화 핸들러 |
| `PATIENT_CREATED` | 환자 관리 | 환자 등록 | 신규 환자 레코드 생성 | `localStore.js:Patient.create()` |
| `PATIENT_UPDATED` | 환자 관리 | 환자 정보 수정 | 환자 필드 변경 | `localStore.js:Patient.update()` |
| `PATIENT_DELETED` | 환자 관리 | 환자 삭제 | 환자 레코드 삭제 | `localStore.js:Patient.delete()` |
| `FILE_UPLOADED` | 파일 관리 | 호흡 파일 업로드 | CSV/VXP 업로드 완료 | `breathingFileRepository.js:createBreathingFile()` |
| `FILE_DELETED` | 파일 관리 | 호흡 파일 삭제 | 업로드 파일 삭제 | `breathingFileRepository.js:deleteBreathingFile()` |
| `ANALYSIS_RUN` | 분석 | 분석 실행 | 호흡 분석 파이프라인 완료 후 캘리브레이션 레코드 생성 | `localStore.js:CalibrationSession.complete()` |
| `CALIBRATION_DELETED` | 분석 | 캘리브레이션 삭제 | 캘리브레이션 결과 삭제 | **호출 위치 없음 — 아래 3-3 참고 (기능 자체 미구현)** |
| `BACKUP_CREATED` | 백업/내보내기 | 암호화 백업 생성(성공) | 관리자가 백업 파일 생성 성공 | `AdminBackup.jsx:handleExport()` |
| `BACKUP_CREATE_FAILED` | 백업/내보내기 | 암호화 백업 생성(실패) | 백업 생성 중 예외 발생 | `AdminBackup.jsx:handleExport()` catch |
| `BACKUP_RESTORED` | 백업/내보내기 | 백업 복원(성공) | 관리자가 백업 파일 복원 성공 | `AdminBackup.jsx:handleImport()` |
| `BACKUP_RESTORE_FAILED` | 백업/내보내기 | 백업 복원(실패) | 복원 중 예외 발생(무결성 검증 실패, 설치 키 불일치 등) | `AdminBackup.jsx:handleImport()` catch |
| `DEIDENTIFIED_EXPORT` | 백업/내보내기 | 비식별 CSV 내보내기(성공) | 관리자가 비식별 CSV 생성 성공 | `AdminBackup.jsx:handleDeidentifiedExport()` |
| `DEIDENTIFIED_EXPORT_FAILED` | 백업/내보내기 | 비식별 CSV 내보내기(실패) | 비식별 CSV 생성 중 예외 발생 | `AdminBackup.jsx:handleDeidentifiedExport()` catch |
| `USAGE_NOTICE_UPDATED` | 시스템 설정 | 사용 알림 문구 변경/초기화 | 관리자가 IA-08 문구 저장 또는 재설정 | `AdminAccounts.jsx` |
| `DEBUG_SEED_ENTRY` | (디버그 전용) | QA용 대량 테스트 항목 생성 | `SECURITY_DEBUG` 빌드에서만 호출 가능(`seedDebugAuditEntries()`) — 프로덕션 빌드에서는 함수 자체가 예외를 던져 구조적으로 실행 불가 | `auditStore.js:seedDebugAuditEntries()` |

**3-3. 정확성 확인 — 검토 중 발견되어 2026-07-16 당일 수정을 반영한 이벤트**

이 문서 초안 작성 시점에는 `FILE_UPLOADED`, `FILE_DELETED`, `ANALYSIS_RUN`, `CALIBRATION_DELETED`, `PASSWORD_CHANGED` 5개 액션 코드가 `AUDIT_ACTIONS`에 상수로 정의되어 있음에도 `tryWriteAuditLog()`/`writeAuditLog()` 호출부가 저장소 전체에 존재하지 않는 것으로 확인되었습니다. 이 중 4건은 같은 날 코드에 직접 반영하여 수정했습니다:

- `FILE_UPLOADED` → `breathingFileRepository.js:createBreathingFile()`에서 SQLite INSERT 성공 직후 기록하도록 추가
- `FILE_DELETED` → `breathingFileRepository.js:deleteBreathingFile()`에서 삭제 직전 `original_name`을 조회해 detail로 남기고 기록하도록 추가
- `ANALYSIS_RUN` → `localStore.js:CalibrationSession.complete()`에서 `Calibration.create()` 성공 후 기록하도록 추가(환자 ID·분석유형·CV 값을 detail에 포함)
- `PASSWORD_CHANGED` → `Login.jsx:ChangePasswordModal.handleSubmit()`에서 `UserStore.changePassword()` 성공 직후 기록하도록 추가

**`CALIBRATION_DELETED`는 의도적으로 수정하지 않았습니다.** 코드 전수 검색 결과 `Calibration.delete()`(`localStore.js`) 자체를 호출하는 UI가 앱 어디에도 없습니다 — 캘리브레이션 결과를 삭제하는 화면/버튼이 존재하지 않는 **미구현 기능**이며, 감사 로그 누락이 아니라 그 대상이 되는 기능 자체가 없는 상태입니다. 존재하지 않는 삭제 기능을 이번 검토 범위에서 임의로 신설하는 것은 범위를 벗어난다고 판단해 구현하지 않았으며, 리뷰어께는 (a) 캘리브레이션 삭제 기능을 실제로 추가하고 그 시점에 감사 로그를 연결하거나, (b) 해당 기능이 없다는 점을 명시하고 `CALIBRATION_DELETED`/`Calibration.delete()`를 미사용 코드로 정리하는 두 가지 선택지 중 하나를 결정해 주실 것을 권장합니다.

(참고: 이전 문서 `docs/submission/cybersecurity-review-qa.md`의 UC-04 섹션은 이 5건 중 4건을 "구현됨" 목록에 포함하고 있었습니다 — 위 수정으로 그중 4건은 실제로 구현됨 상태가 되었으나, 해당 문서 자체는 이번 답변 범위에 포함되지 않아 별도 수정하지 않았습니다.)

#### 3-2. 감사 로그 항목 필드 스키마

구현 파일: `src/api/auditStore.js:writeAuditLog()`

| 필드명 | 타입 | 설명 | 예시 |
|---|---|---|---|
| `id` | string | 로그 항목 고유 식별자(타임스탬프ms + 랜덤 5자) | `"1749650234123-k7x2m"` |
| `timestamp` | string | ISO 8601 UTC 타임스탬프(`new Date().toISOString()`) | `"2026-07-16T10:30:45.123Z"` |
| `userId` | string | 작업 수행 계정의 내부 ID. 미인증 상태 이벤트는 `"system"` | `"1749500000000-abc1234"` |
| `username` | string | 작업 수행 계정의 로그인 아이디. 미인증 상태는 `"system"` | `"admin"` |
| `action` | string | 이벤트 코드(위 표 참조) | `"LOGIN"` |
| `targetType` | string\|null | 작업 대상 유형(`user`/`patient`/`system` 등) | `"user"` |
| `targetId` | string\|null | 작업 대상 항목의 ID | `"1749500000001-xyz"` |
| `detail` | string\|null | 이벤트 부가 설명(자유 텍스트) | `"username: admin, attempt 2"` |

#### 3-3. 리뷰어 요청 용어 ↔ 실제 필드 대응표

리뷰어가 요청한 "타임스탬프/출처/카테고리/유형/이벤트 ID/이벤트 결과" 6개 용어는 코드의 필드 구조와 1:1로 대응하지 않으므로, 실제 대응 관계를 아래와 같이 명시적으로 정리합니다.

| 가이드라인 용어 | 코드상 대응 | 비고 |
|---|---|---|
| 타임스탬프 | `timestamp` | ISO 8601 UTC, Android 기기 시스템 시계 기반(UC-06) |
| 출처 | `userId` + `username` | 본 앱은 단일 기기·완전 오프라인 구조로 별도의 IP·호스트명·세션 소스 필드가 없음 — 작업을 수행한 "계정"이 곧 이벤트의 출처 역할을 함. 미인증 상태(예: 세션 없이 발생) 이벤트는 `"system"`으로 기록됨 |
| 카테고리 | 전용 필드 없음 — 위 3-1 표의 "카테고리" 열처럼 `action` 값의 의미로 그룹화(인증/계정 관리/환자 관리/파일 관리/분석/백업·내보내기/시스템 설정) | 코드에는 카테고리 전용 컬럼이 존재하지 않으며, 본 문서 3-1 표가 그 그룹화를 문서 차원에서 제공함 |
| 유형 | `action`(이벤트 유형 코드) 및 `targetType`(작업 대상 유형) | 두 필드가 함께 "무엇에 대해 어떤 이벤트가 발생했는지"를 특정함 |
| 이벤트 ID | `id`(로그 항목 고유 식별자) | 이벤트 코드(`action`)와는 별개로, 각 로그 레코드 자체의 PK 역할 |
| 이벤트 결과 | 전용 결과(성공/실패) 필드가 없음 — 성공/실패가 **별도의 액션 코드**로 구분됨(예: `LOGIN` vs `LOGIN_FAILED`, `ACCOUNT_LOCKED`) | **2026-07-16 수정 반영:** 이 문서 초안 작성 시점에는 백업 생성(`handleExport`)·복원(`handleImport`)·비식별 내보내기(`handleDeidentifiedExport`)가 **성공 시에만** `tryWriteAuditLog()`를 호출해 "실패" 결과가 감사 로그에 남지 않는 경로가 있었습니다. 같은 날 `AUDIT_ACTIONS`에 `BACKUP_CREATE_FAILED`/`BACKUP_RESTORE_FAILED`/`DEIDENTIFIED_EXPORT_FAILED` 3건을 추가하고, `AdminBackup.jsx`의 각 `catch` 블록에서 `err.message`(설치 키 불일치의 경우 그 사실 자체)를 `detail`로 남기며 실패를 기록하도록 수정해 이 공백을 닫았습니다. |

---

### 답변 4 — UC-05 감사 처리 실패 조건

구현 파일: `src/api/auditStore.js` — `writeAuditLog()`(예외 전파형) vs `tryWriteAuditLog()`(예외 흡수형)

`writeAuditLog()`는 실패 시 예외를 **던지며**, `tryWriteAuditLog()`는 이를 `try/catch`로 감싸 콘솔에만 기록하고 앱 실행을 계속시키는 안전 래퍼입니다. 실제 앱 코드는 전부 `tryWriteAuditLog()`를 호출하므로, 아래 실패 조건이 발생해도 **호출부(로그인, 환자 등록 등 핵심 기능)는 중단되지 않습니다.**

| # | 실패 조건 | 코드상 근거 | `tryWriteAuditLog()`에서의 처리 |
|---|---|---|---|
| 1 | `localStorage` 용량 초과(`QuotaExceededError`, 기기 저장공간 부족 등) | `writeAuditLog()` 내부에서 `e instanceof DOMException && (e.name === 'QuotaExceededError' \|\| e.code === 22)`로 감지 | **1차 자동 복구:** 오래된 로그의 20%를 잘라내고(`log.slice(Math.floor(log.length*0.2))`) 1회 재시도. 재시도도 실패하면 원래 예외를 다시 던짐(`throw e`) → 이 경우 `tryWriteAuditLog`가 이를 catch하여 `console.error('[AuditLog] Write failed:', err)`만 수행하고 함수는 정상 반환됨(호출부는 예외를 못 보고 계속 진행) |
| 2 | 기존 로그 배열의 JSON 파싱 실패(저장된 `dibh_audit_log` 값이 손상되어 `JSON.parse` 실패) | `loadLog()`가 `try/catch`로 감싸져 있어 파싱 실패 시 **빈 배열 `[]`을 반환** — 이 경우 손상된 과거 로그는 사실상 유실되고 새 항목부터 다시 쌓임(예외를 던지지 않으므로 UC-05 표의 실패 유형과는 별개로 "조용한 데이터 유실"에 해당) | 예외 자체가 발생하지 않으므로 `tryWriteAuditLog`의 catch 분기를 타지 않음 — 정상 흐름처럼 보이지만 과거 로그가 사라진 상태로 새로 시작됨 |
| 3 | `localStorage.setItem()` 자체가 실패하되 `QuotaExceededError`가 아닌 경우(예: 브라우저 설정으로 저장소가 비활성화된 환경 — Android 설치 앱에서는 드묾) | `writeAuditLog()`의 `catch` 블록에서 `isQuota`가 `false`이면 즉시 `throw e` | `tryWriteAuditLog`가 catch하여 `console.error`만 남기고 함수는 정상 반환 — 호출부(로그인 등)는 영향 없음 |
| 4 | `localStorage` 자체를 사용할 수 없는 환경(예: 사설/시크릿 모드 등에서 완전히 비활성화된 경우) | 이 경우 애초에 `main.jsx`의 `securitySelfCheck()` 4단계 중 "localStorage 가용성" 점검에서 실패하여 **앱 마운트 자체가 차단**됨(SI-03) — 즉 감사 로그 개별 쓰기 실패로 도달하기 전에 앱 시작 단계에서 이미 차단됨 | 해당 없음(앱이 이 단계까지 도달하지 못함) |

**최대 항목 수 정책(100% 도달 시 보호):** 정상 쓰기 흐름에서는 `MAX_ENTRIES = 10,000`을 초과하면 `log.splice(0, log.length - MAX_ENTRIES)`로 가장 오래된 항목부터 잘라내어 최신 10,000건을 항상 유지합니다. 이는 위 실패 조건과 별개로, 매 쓰기마다 무조건 수행되는 정상 트림 로직입니다.

**요약(문서 기재용):**

> 감사 로그 쓰기 실패는 크게 두 층위로 처리됩니다. ① `localStorage` 용량 초과(`QuotaExceededError`) 시 오래된 로그 20%를 자동 삭제 후 1회 재시도하며, 그래도 실패하면 예외가 상위로 전파됩니다. ② 그 예외는 모든 호출부에서 `tryWriteAuditLog()`로 감싸져 있어 콘솔 오류로만 기록되고, 로그인·환자 등록 등 핵심 기능은 감사 로그 실패와 무관하게 계속 동작합니다. ③ `localStorage` 자체가 비활성화된 극단적 환경에서는 감사 로그 개별 실패 이전에 앱 시작 자가진단(SI-03) 단계에서 이미 앱 마운트가 차단됩니다. 다만 기존 로그 배열의 JSON 파싱이 실패하는 경우는 예외 없이 빈 배열로 대체되어 과거 로그가 조용히 유실될 수 있는 잔여 위험이 있음을 함께 밝힙니다.

---

### 답변 5 — SI-02 악성코드로부터 보호(미적용 사유 보강)

**결론: 미적용(N/A) 유지를 권장하며, 사유를 아래와 같이 구체화합니다.** (백신 프로그램 도입을 권장하지 않음 — 기존 `docs/submission/cybersecurity-review-qa.md`의 SI-02 방향과 일관됨)

| # | 구체적 근거 | 코드/구성 확인 내용 |
|---|---|---|
| 1 | 네트워크 공격 표면 자체가 없음 | `package.json` 의존성 전체 검토 결과 HTTP 클라이언트·소켓·WebSocket 등 네트워킹 라이브러리가 **전무**함(axios, fetch 래퍼, socket.io 등 없음). 앱 내 유일한 "통신"은 Android WebView가 로컬 번들(`https://localhost/...`)을 서빙하는 것뿐이며, 원격 서버·외부 API 호출 코드가 없음 |
| 2 | 업로드 파일이 실행 가능한 코드가 아님 | 업로드 허용 확장자는 `.csv`/`.vxp`뿐(`src/lib/breathingFileFormat.js:isAllowedBreathingUploadFileName()`, `BreathingDataUpload.jsx`의 `accept=".csv,.vxp,text/csv,application/octet-stream"`). 파싱 로직(`analyzeFiles.js`)은 숫자형 시계열 데이터만 열 단위로 읽어 들이며, 매크로·스크립트 실행 기능이 없는 순수 데이터 파서임 |
| 3 | Android 앱 샌드박스 격리 | APK는 서명된 패키지로만 설치되며(Android 패키지 관리자가 서명 검증), 앱 코드에는 셸 실행(`exec`)이나 임의 네이티브 바이너리 실행 기능이 없음. WebView 프로세스는 OS가 다른 앱과 격리된 저장 영역에서 실행함 |
| 4 | 이동식 매체 자동 실행 기능 없음 | 앱은 USB/외장 저장소를 자동으로 스캔·실행하는 기능이 없으며, 파일 선택은 사용자가 명시적으로 트리거하는 `<input type="file">` 다이얼로그를 통해서만 이루어짐(자동 실행/오토런 경로 없음) |

**미적용 사유(문서 기재용 원문):**

> 본 앱은 완전 오프라인 구조로 외부 네트워크 통신 코드가 전혀 존재하지 않으며(`package.json` 전체 의존성 검토 결과 HTTP/소켓 통신 라이브러리 없음), 유일한 외부 입력 경로인 파일 업로드는 `.csv`/`.vxp` 확장자로 엄격히 제한되어 숫자형 시계열 데이터로만 파싱되고 스크립트·매크로 실행 기능을 갖지 않습니다. 앱은 서명된 APK로만 설치되는 Android 표준 앱 샌드박스 내에서 실행되며, 셸 실행이나 이동식 매체 자동 실행 기능을 갖지 않습니다. 따라서 악성코드가 네트워크·실행형 파일·이동식 매체를 통해 유입될 수 있는 경로 자체가 존재하지 않으므로 SI-02는 미적용(N/A)으로 유지하며, 기기 자체의 악성코드 방지는 사용자 설명서의 백신 설치 권고 문구(기존 `docs/submission/cybersecurity-review-qa.md` SI-02 참조)로 보완합니다.

---

### 답변 6 — SI-04 기타 무결성 점검 대상 파일 및 해시 저장 위치

호흡 파일 원본(BLOB) 및 백업 파일(`.enc`)의 무결성 해시 계산·저장 위치는 별도 문서(`docs/submission/cybersecurity-review-qa-backup-integrity-2026-07-16.md`)에서 상세히 다루므로 본 답변에서는 반복하지 않고, **그 외에 위변조 시 제품 동작 또는 보안 기능에 영향을 줄 수 있는 파일**을 대상으로 답변합니다.

| 대상 파일 | 위변조 시 영향 | 현재 해시 계산/저장 여부 | 해시 저장 위치 |
|---|---|---|---|
| JS/CSS/WASM 앱 번들(`dist/assets/*.js`, `dist/assets/*.css`, `dist/assets/sql-wasm-*.wasm`) | 앱 로직·화면 표시·SQLite 엔진 자체가 변조된 코드/바이너리로 대체될 수 있음(가장 직접적인 보안 기능 영향) | **적용됨** — 빌드 시 `scripts/generate-integrity.js`가 SHA-256 해시 매니페스트를 생성하고, 프로덕션 실행 시(`import.meta.env.PROD`) `src/main.jsx:integrityCheck()`가 각 파일을 재해시하여 비교, 불일치 시 앱 마운트를 차단함. **2026-07-16 수정 반영:** 이 문서 초안 작성 시점에는 `generate-integrity.js`의 파일 필터가 `.js`/`.css`만 대상으로 해 SQLite 엔진 WASM 바이너리(`sql-wasm-*.wasm`, `src/db/sqliteDb.js`가 `sql.js/dist/sql-wasm.wasm?url`로 로드)가 매니페스트에서 제외되어 있었습니다. 같은 날 필터 조건에 `.wasm`을 추가하고 재빌드하여, 현재 `dist/integrity.json`에 `sql-wasm-*.wasm` 항목이 포함되고 `integrityCheck()`가 이를 동일하게 재검증함을 직접 확인했습니다(코드 수정 없이 매니페스트 생성 대상만 확장하면 되었음 — `integrityCheck()`는 매니페스트의 모든 항목을 파일 종류 구분 없이 동일하게 처리하는 범용 루프였음) | `dist/integrity.json` → APK 내 `assets/public/integrity.json`로 패키징 → 런타임에는 WebView 원점 기준 `https://localhost/integrity.json` 경로에서 조회 |
| Android APK 패키지 자체(서명·매니페스트·네이티브 코드 포함) | APK 전체가 재서명되어 배포되면 위 두 파일을 포함한 모든 자산이 함께 위조될 수 있음(app-level integrity check의 근본적 한계) | **앱 자체 로직으로는 미적용** — Android OS가 설치 시 APK 서명 인증서를 자동 검증하는 것으로 대체됨(SI-09 참조). 앱 코드 내부에는 자신의 APK 서명을 스스로 검증하는 로직이 없음 | 해당 없음(OS 레벨 책임). 향후 구현 시 후보는 Android `PackageManager`를 통한 자체 서명 인증서 조회·비교 로직 추가 |
| localStorage 저장 데이터(계정, 환자, 감사 로그 등) | 위변조 시 인증·권한·이력 추적 기능이 왜곡될 수 있음 | **부분 적용** — 환자 PII(`_enc`)는 AES-256-GCM 인증 태그로 위변조 시 복호화 자체가 실패하여 탐지됨. 그 외 평문 필드(감사 로그, 세션 상태 등)는 별도의 무결성 해시가 없음 | 해당 없음(전용 무결성 해시 파일 없음) |

**참고 — 이전 문서와의 차이:** `docs/submission/cybersecurity-review-qa.md`의 SI-04 섹션은 "앱 번들 해시 검증 — 미구현"으로 기재되어 있으나, 이는 그 문서 작성 시점 기준이며 **현재 코드에는 이미 JS/CSS 번들에 대한 해시 검증이 구현되어 있습니다**(`scripts/generate-integrity.js` + `src/main.jsx:integrityCheck()`, 2026-07-16 빌드 기준 `dist/integrity.json` 확인). 다만 그 문서는 이번 답변 작성 범위에 포함되지 않아 별도로 수정하지 않았습니다. 호흡 파일·백업 파일 해시는 `docs/submission/cybersecurity-review-qa-backup-integrity-2026-07-16.md`를 참조하시기 바랍니다.

---

### 답변 7 — SI-07 오류 메시지 전체 식별

코드 전체(`src/api/*.js`, `src/pages/*.jsx`, `src/lib/*.js`, `src/utils/*.js`, `src/main.jsx`)를 검색하여 사용자에게 실제로 노출되는 한글 오류·경고 메시지를 화면/기능 단위로 정리합니다.

#### 7-1. 인증 및 계정 관리 — `src/api/authStore.js`, `src/pages/Login.jsx`, `src/pages/AdminAccounts.jsx`, `src/lib/passwordUtils.js`

| 오류 메시지(원문) | 발생 위치(파일:함수) | 발생 조건 |
|---|---|---|
| `아이디 또는 비밀번호가 올바르지 않습니다.` | `authStore.js:loginUser()`(`GENERIC_ERROR`) | 존재하지 않는 아이디로 로그인 시도(계정 존재 여부 비노출, IA-06) |
| `아이디 또는 비밀번호가 올바르지 않습니다. (남은 시도: N회)` | `authStore.js:loginUser()` | 비밀번호 불일치, 잠금 임계치(5회) 미도달 시 |
| `계정이 잠금되었습니다. 약 N분 후 다시 시도하거나 관리자에게 문의하세요.` | `authStore.js:loginUser()` | 이미 잠긴 계정으로 재로그인 시도 |
| `로그인 시도 횟수를 초과하여 계정이 잠금되었습니다. 관리자에게 문의하여 잠금을 해제해 주세요.` | `authStore.js:loginUser()` | 5회 연속 실패로 신규 잠금이 발생한 바로 그 시도 |
| `이미 존재하는 아이디입니다.` | `authStore.js:UserStore.create()` | 관리자가 중복 아이디로 계정 생성 시도 |
| `사용자를 찾을 수 없습니다.` | `authStore.js:UserStore.changePassword()/resetPassword()/unlock()/setRole()` | 대상 계정 ID가 이미 삭제된 상태에서 조작 시도 |
| `마지막 계정은 삭제할 수 없습니다.` | `authStore.js:UserStore.delete()` | 계정이 1개만 남은 상태에서 삭제 시도(관리자 잠금 방지) |
| `비밀번호가 일치하지 않습니다.` | `Login.jsx:ChangePasswordModal.handleSubmit()` | 강제 비밀번호 변경 시 새 비밀번호/확인 비밀번호 불일치 |
| `8자 이상이어야 합니다` / `대문자(A-Z)를 포함해야 합니다` / `소문자(a-z)를 포함해야 합니다` / `숫자(0-9)를 포함해야 합니다` / `특수문자(!@#$ 등)를 포함해야 합니다` | `passwordUtils.js:validatePassword()` — `Login.jsx`(강제 변경), `AdminAccounts.jsx`(계정 생성/비밀번호 초기화) | 새 비밀번호가 IA-05 정책 각 규칙을 위반할 때마다 해당 문구가 개별 표시됨 |
| `아이디를 입력하세요.` | `AdminAccounts.jsx:handleCreate()` | 계정 생성 폼에서 아이디 공란 제출 |
| `아이디는 영문·숫자·_.- 만 사용 가능하며 2~30자여야 합니다.` | `AdminAccounts.jsx:handleCreate()` | 아이디가 정규식(`^[a-zA-Z0-9_.\-]{2,30}$`) 불충족 |
| `마지막 관리자 계정의 권한은 변경할 수 없습니다.`(네이티브 `alert()`) | `AdminAccounts.jsx:handleRoleToggle()` | 마지막 남은 admin 계정을 clinician으로 강등 시도 |
| `공지 문구는 최대 1000자까지 입력할 수 있습니다.` | `usageNoticeStore.js:validateUsageNotice()`(`AdminAccounts.jsx`에서 호출) | 관리자가 1,000자 초과 사용 알림 문구 저장 시도 |

#### 7-2. 파일 업로드/무결성 — `src/api/breathingFileRepository.js`, `src/pages/BreathingDataUpload.jsx`, `src/pages/NewPatient.jsx`

| 오류 메시지(원문) | 발생 위치(파일:함수) | 발생 조건 |
|---|---|---|
| `한 환자당 {일반호흡\|DIBH} 데이터는 최대 10개까지만 보관할 수 있습니다. 오래된 데이터를 삭제한 뒤 다시 업로드해 주세요.` | `breathingFileRepository.js:createBreathingFile()` | 동일 환자·동일 카테고리로 11번째 파일 업로드 시도(서버 측 최종 검증) |
| `파일 무결성 오류: 저장된 이후 파일이 변경되었습니다. ({원본파일명})` | `breathingFileRepository.js:getBreathingFileContent()` | 저장된 SHA-256 해시(`content_hash`)와 조회 시점 재계산 해시 불일치 |
| 토스트 `파일을 저장할 수 없습니다` / `파일 저장 중 오류가 발생했습니다. 다시 시도해 주세요.` | `BreathingDataUpload.jsx:simulateUploadAndPersist()` | `createBreathingFile()` 실패(위 10개 초과, 무결성 오류, SQLite 오류 등을 통칭) |
| 토스트 `일반호흡 데이터는 최대 10개까지 저장됩니다` / `DIBH 데이터는 최대 10개까지 저장됩니다` | `BreathingDataUpload.jsx:handleAddGeneral()/handleAddDibh()` | 업로드 전 클라이언트 단 사전 개수 확인(10개 도달) |
| 토스트 `CSV 또는 VXP만 업로드할 수 있습니다` / `${skipped}개 파일은 지원 형식이 아니어서 제외되었습니다.` | `BreathingDataUpload.jsx`, `NewPatient.jsx`(각 파일 추가 핸들러) | `.csv`/`.vxp` 이외 확장자 파일 선택 |
| 토스트 `업로드 진행 중입니다` / `모든 파일 저장이 끝난 뒤 등록 완료를 눌러 주세요.` | `BreathingDataUpload.jsx:handleDone()`, `NewPatient.jsx:handleSubmit()` | 파일 업로드/저장이 끝나기 전 "등록 완료" 클릭 |
| 토스트 `삭제 실패` / `파일 삭제 중 오류가 발생했습니다. 다시 시도해 주세요.` | `BreathingDataUpload.jsx:confirmDeleteSaved()`, `AnalysisFileSelect.jsx:handleConfirmDeleteFile()` | 저장된 파일 삭제 중 예외 발생 |
| `환자를 찾을 수 없습니다.` / `목록에서 다시 선택해 주세요.`, 인라인 `patientId가 없습니다.` | `BreathingDataUpload.jsx`, `AnalysisFileSelect.jsx`, `PatientDashboard.jsx` (공통 패턴) | URL의 `patientId`가 없거나 존재하지 않는 환자를 가리킴 |
| 검증 모달 `기본정보(필수입력)를 모두 입력하세요.` + `누락된 항목: 환자 이름, 생년월일` 등 | `NewPatient.jsx:handleSubmit()` → `validateBasicInfo()` | 환자 이름/생년월일 등 필수 항목 공란 또는 이름 100자 초과 |
| 토스트 `저장에 실패했습니다` / `환자 정보를 저장하는 중 오류가 발생했습니다. 다시 시도해 주세요.` | `NewPatient.jsx:handleSubmit()` | `Patient.create()`/`createBreathingFile()` 실패 |
| 토스트 `저장 실패` / `환자 정보 저장에 실패했습니다. 다시 시도해 주세요.` | `PatientDashboard.jsx:handleSaveEdit()` | `Patient.update()` 실패 |

**중요 발견 — 처리되지 않는 예외 경로:** `PatientDashboard.jsx:handleConfirmDelete()`는 `Patient.delete(patientId)`를 `try/catch` 없이 호출합니다. 삭제가 실패할 경우 한글 오류 메시지 없이 **처리되지 않은 Promise 거부(unhandled rejection)** 로 남아 사용자에게 아무 안내도 표시되지 않을 수 있습니다. 이는 우아한 오류 처리가 없는 경로로 별도 식별합니다.

#### 7-3. 분석 파이프라인 — `src/pages/AnalysisFileSelect.jsx`, `src/lib/calibration/analyzeFiles.js`

| 오류 메시지(원문) | 발생 위치(파일:함수) | 발생 조건 |
|---|---|---|
| 검증 모달 `분석할 파일을 모두 선택해 주세요.` / `일반호흡 파일과 DIBH 파일을 각각 1개씩 선택해야 다음 단계로 이동할 수 있습니다.` | `AnalysisFileSelect.jsx:handleStartAnalysis()` | 일반호흡·DIBH 파일을 각 1개씩 선택하지 않고 "분석 시작" 클릭 |
| `분석 중 오류가 발생했습니다. 파일을 확인하고 다시 시도해 주세요.`(모달에는 `분석에 실패했습니다`) | `AnalysisFileSelect.jsx:handleStartAnalysis()` catch | `analyzeFiles()`가 예외를 던짐(아래 파서 오류 포함) |
| `VXP 파일에서 [Data] 섹션을 찾을 수 없습니다.` | `analyzeFiles.js:parseVxp()` | VXP 파일에 `[Data]` 섹션 부재(형식 오류) |
| `일반호흡 파일을 찾을 수 없습니다.` / `DIBH 파일을 찾을 수 없습니다.` | `analyzeFiles.js:analyzeFiles()` | 선택된 파일 레코드가 SQLite에서 조회되지 않음 |
| `일반호흡 파일에 유효한 데이터가 없습니다.` / `DIBH 파일에 유효한 데이터가 없습니다.` | `analyzeFiles.js:analyzeFiles()` | 파싱 결과 유효 샘플 0건(빈 파일/손상 파일) |

**중요 발견 — 세부 원인이 사용자에게 도달하지 않음:** 위 파서 단계의 5가지 구체적 오류(VXP 형식 오류, 파일 미발견, 유효 데이터 없음)는 모두 `AnalysisFileSelect.jsx`의 `catch` 블록에서 하나의 공통 문구(`분석 중 오류가 발생했습니다...`)로 대체되어 표시됩니다. 구체적 원인 문자열은 `console.error`로만 남고 화면에는 노출되지 않습니다 — 임상 사용자가 실패 원인(예: 파일 형식 문제 vs 빈 데이터)을 화면만으로 구분할 수 없는 사용성 공백으로 별도 식별합니다.

#### 7-4. 백업/복구/내보내기 — `src/pages/AdminBackup.jsx`

| 오류 메시지(원문) | 발생 위치(함수) | 발생 조건 |
|---|---|---|
| `백업 생성에 실패했습니다.` | `handleExport()` catch | 백업 생성 중 예외(감사 로그 미기록 — 답변 3의 3-3 참조) |
| `비식별 내보내기에 실패했습니다.` | `handleDeidentifiedExport()` catch | 비식별 CSV 생성 중 예외(감사 로그 미기록) |
| `백업 파일의 무결성 검증에 실패했습니다. 파일이 손상되었거나 변조되었습니다.` | `restoreBackup()` (throw) | 복원 시 재계산 SHA-256 해시가 봉투 내 저장 해시와 불일치 |
| `복호화에 실패했습니다. 이 백업은 현재 설치 키와 다른 키로 암호화되어 있습니다. 백업을 생성한 기기에서만 복구할 수 있습니다.` | `handleImport()` catch | AES-GCM 복호화가 `OperationError`로 실패(다른 기기 키로 암호화된 백업 복원 시도) |
| `복구에 실패했습니다. 올바른 백업 파일인지 확인해 주세요.` | `handleImport()` catch | 그 외 일반 복원 실패(형식 오류 등, `err.message` 부재 시 기본 문구) |

#### 7-5. 앱 시작 자가진단/무결성 검사 — `src/main.jsx` (화면 전체 차단형)

| 오류 메시지(원문) | 함수 | 발생 조건 |
|---|---|---|
| `Web Crypto API 사용 불가` / `암호화 자가진단 실패` / `sessionStorage 사용 불가` / `localStorage 사용 불가` | `securitySelfCheck()` | SI-03 자가진단 4단계 중 하나라도 실패 |
| `무결성 매니페스트를 로드할 수 없습니다 (integrity.json)` / `무결성 검사 파일 로드 실패: {filePath}` / `무결성 검사 실패 (파일 변조 감지): {filePath}` | `integrityCheck()`(프로덕션 빌드 전용) | 매니페스트/번들 파일 fetch 실패 또는 해시 불일치(SI-04) |
| 전체화면 오류 카드 제목 `무결성 검사 실패` / 본문 `앱 파일의 무결성을 확인할 수 없습니다. 파일이 변조되었을 수 있습니다.` | `integrityCheck()` 실패 시 렌더 | 위 무결성 오류 중 하나라도 발생 — `#root` 전체가 오류 카드로 대체되어 앱 미마운트 |
| 전체화면 오류 카드 제목 `보안 자가진단 실패` / 본문 `시스템 보안 기능을 초기화할 수 없습니다.` | `securitySelfCheck()` 실패 시 렌더 | 위 자가진단 오류 중 하나라도 발생 — 앱 미마운트 |

#### 7-6. 감사 로그 용량 경고 — `src/pages/AdminAuditLog.jsx` (UC-05)

| 메시지(원문) | 발생 조건 |
|---|---|
| `감사 로그 저장 공간 경고 (UC-05)` / `감사 로그 저장 공간 부족 (UC-05)` | 로그 건수 또는 추정 localStorage 사용량이 각각 80%/90% 임계치 도달 |
| `로그 항목: {count} / {max}건 ({pct}%)` (+ 90% 이상 시 `오래된 항목이 자동 삭제됩니다.`) | 상동 |
| `기기 저장소: {used} 사용 중 (감사 로그 {auditBytes})` (+ 90% 이상 시 `저장소 용량이 부족합니다.`) | 상동 |
| `백업 후 데이터를 내보내기하세요.` | 90% 이상 위험 수준 도달 시 |

#### 7-7. 암호화 관련(내부/부분 사용자 노출) — `src/lib/crypto.js`

| 메시지 | 위치 | 비고 |
|---|---|---|
| `[복호화 실패]` (환자 이름 자리에 표시, `_decryptionFailed: true` 플래그 동반) | `decryptPatient()` catch | 환자 PII 복호화 실패 시(설치 키 변경 등) 화면 크래시 대신 이 자리표시자로 표시됨 — 사용자에게 노출되는 유일한 crypto 관련 한글 문구 |
| `[crypto] Not initialised — call initCrypto() first` / `[crypto] Malformed encrypted value` | `encryptValue()`/`decryptValue()` 등 | 영문 개발자용 내부 예외 — 정상 흐름에서는 발생하지 않으며, 만약 상위에서 캐치되지 않으면 영문 텍스트가 그대로 노출될 잠재적 위험 있음(현재 코드상 실제 도달 경로는 확인되지 않음) |

**중요 — 증적(스크린샷) 관련 한계 고지:**

본 문서는 코드베이스 정적 분석만으로 작성되었으며, 브라우저/실기기 자동화 도구를 사용할 수 없는 환경에서 작성되었습니다. 따라서 **위 표의 각 오류 메시지에 대한 실제 화면 캡처(스크린샷) 증적은 이 문서에 포함되어 있지 않습니다.** 위 표는 스크린샷 증적 작업 시 어떤 오류 상황을 재현·촬영해야 하는지 빠짐없이 식별한 **전체 텍스트 인벤토리**이며, 실제 스크린샷 확보는 사람이 실기기(또는 에뮬레이터)에서 위 표의 각 조건을 직접 재현하는 수동 QA 절차로 별도 진행되어야 합니다.

---

### 답변 8 — SI-09 실제 배포 경로

**코드로 확인 가능한 사실:**

| 항목 | 확인 내용 |
|---|---|
| 자동 업데이트(OTA) 기능 | 코드 전체를 검색한 결과 업데이트 확인·다운로드를 수행하는 네트워킹 코드가 **존재하지 않음**(SI-02 답변의 "네트워킹 라이브러리 없음" 확인과 동일한 근거) — 앱은 새 버전 확인을 위해 어떤 서버에도 접속하지 않으며, 이는 완전 오프라인 설계와 일관됨 |
| 설치 시 진본성 검증 | Android OS가 APK 설치 시 서명 인증서를 자동 검증하며, 기존 설치본과 서명이 다른 APK로는 업데이트 설치가 거부됨(OS 레벨 강제, 앱 자체 로직 아님) — 이미 `docs/submission/cybersecurity-review-qa.md`의 SI-09 섹션에 기재됨 |
| 버전 표시 | `__APP_VERSION__`이 로그인 화면 하단 및 `/admin/accounts` 하단에 표시됨(`v{__APP_VERSION__}`) |
| 문서상 기재된 절차(참고용) | `docs/submission/section8-시험기준-준수명세.md`, `docs/submission/user-manual-security.md`에 "USB 등 폐쇄 매체를 통한 APK 수동 설치" 및 "배포 시 제조사가 제공하는 SHA-256 해시값을 설치 전 수동 검증(`Get-FileHash`)" 절차가 문서화되어 있음 |

**실제 운영 배포 경로 (제조사 확인, 2026-07-16):**

제조사 확인 결과, 실제 배포 방법은 **USB를 통한 수동 설치**입니다. 새 APK 및 SHA-256 해시값을 USB 매체로 병원 측 기기에 직접 전달하여 설치하며, 이는 위 표의 "문서상 기재된 절차"(`section8-시험기준-준수명세.md`, `user-manual-security.md`의 "USB 등 폐쇄 매체를 통한 APK 수동 설치" + 설치 전 SHA-256 해시값 수동 검증 절차)와 정확히 일치합니다. 이 방식은 앱의 완전 오프라인 설계(자동 업데이트/OTA 기능 없음, 위 표 참조)와도 일관되며, 네트워크를 통한 배포 경로 자체가 없으므로 원격 경유 변조·가로채기 위험이 구조적으로 낮습니다.

**문서 기재용 원문:**

> 본 제품의 소프트웨어 업데이트는 제조사((주)더픽트)가 USB 등 폐쇄 매체를 통해 병원 측에 새 APK 파일을 직접 전달하고, 수신처에서 제조사가 함께 제공한 SHA-256 해시값을 설치 전 수동으로 검증(`Get-FileHash` 등)한 후 수동 설치하는 방식으로 이루어집니다. 앱 자체에는 네트워크를 통한 자동 업데이트(OTA) 기능이 없으며, Android OS가 설치 시 APK 서명 인증서를 자동 검증하여 기존 설치본과 서명이 다른 파일의 설치를 거부합니다.

---

## 참고 사항

1. **SI-09 배포 경로 — 해결됨:** 제조사 확인 결과 실제 배포 방법은 **USB를 통한 수동 설치**이며, 이는 이미 문서화되어 있던 절차(USB 폐쇄 매체 설치 + SHA-256 해시 수동 검증)와 일치함을 확인했습니다. 답변 8을 최종 확정 내용으로 갱신했습니다.
2. **SI-07 스크린샷 증적 공백 (잔여):** 본 문서는 오류 메시지의 완전한 텍스트 인벤토리를 제공하지만, 실기기/에뮬레이터에서의 화면 캡처는 자동화 도구가 없는 이 작업 환경에서는 생성할 수 없었습니다. 표에 나열된 각 조건을 실제로 재현하여 스크린샷을 촬영하는 수동 QA 작업이 별도로 필요합니다. (이 항목만 유일하게 남은 미해결 사항입니다.)
3. **SI-04 WASM 무결성 — 해결됨:** `scripts/generate-integrity.js`의 파일 필터에 `.wasm`을 추가하고 재빌드하여, SQLite 엔진 WASM 바이너리(`sql-wasm-*.wasm`)도 이제 `dist/integrity.json` 매니페스트에 포함되고 `main.jsx:integrityCheck()`가 동일하게 재검증합니다(코드 변경 없이 매니페스트 생성 범위만 확장 — `integrityCheck()`는 이미 파일 종류에 무관한 범용 루프였습니다). APK 패키지 자체의 무결성은 여전히 앱 코드가 아닌 Android OS의 서명 검증에 의존하며, 이는 SI-09에서 확인한 실제 배포 절차(USB 수동 설치 + 해시 수동 검증)로 보완되는 구조입니다.
4. **UC-04 정확성 정정 — 해결됨 (2026-07-16 당일 수정 반영):** 이 문서 작성 과정에서 `FILE_UPLOADED`, `FILE_DELETED`, `ANALYSIS_RUN`, `CALIBRATION_DELETED`, `PASSWORD_CHANGED` 5개 액션 코드가 상수로만 정의되어 있고 실제 호출부가 없다는 사실과, 백업/복원/비식별 내보내기의 **실패** 결과가 감사 로그에 남지 않는다는 사실이 함께 발견되었습니다. 이 중 `FILE_UPLOADED`/`FILE_DELETED`/`ANALYSIS_RUN`/`PASSWORD_CHANGED` 4건은 실제 로깅 호출을 추가했고, 백업/복원/비식별 내보내기 실패도 `BACKUP_CREATE_FAILED`/`BACKUP_RESTORE_FAILED`/`DEIDENTIFIED_EXPORT_FAILED` 3개 액션 코드를 신설해 각 `catch` 블록에서 기록하도록 수정했습니다(3-1·3-3절 참조). `CALIBRATION_DELETED`만 의도적으로 수정하지 않았습니다 — 그 대상이 되는 캘리브레이션 삭제 UI 기능 자체가 앱에 존재하지 않아, 없는 기능에 대한 로깅을 임의로 만들어 넣기보다 기능 신설 여부를 별도로 결정해 주실 것을 권장합니다.
5. **SI-07 부가 발견 — 해결됨:** `PatientDashboard.jsx`의 환자 삭제 확인 처리(`handleConfirmDelete()`)에 `try/catch`와 실패 토스트(`환자 삭제에 실패했습니다. 다시 시도해 주세요.`)를 `handleSaveEdit()`와 동일한 패턴으로 추가했습니다. 또한 분석 파이프라인(`analyzeFiles.js`)이 던지는 5가지 구체적 원인 메시지(VXP 형식 오류, 파일 미발견, 유효 데이터 없음 — 모두 내부 경로·스택트레이스 없이 사용자용으로 이미 작성된 한글 문구임을 코드로 확인)가 `AnalysisFileSelect.jsx`에서 하나의 공통 오류 문구로 대체되던 것을, `err.message`를 우선 표시하고 메시지가 없는 경우에만 기존 일반 문구로 대체하도록 수정했습니다(`AdminBackup.jsx:handleImport()`에 이미 있던 것과 동일한 패턴).

**요약:** 이번 대화에서 다룬 6개 항목(SI-09 배포 경로, SI-04 WASM 무결성, UC-04 이벤트 5종 + 백업 실패 로깅 3종, PatientDashboard 삭제 오류 처리, 분석 오류 메시지 구체화) 중 5개는 코드/문서에 직접 반영해 해결했습니다. SI-07 스크린샷 증적만 실기기 수동 QA가 필요한 잔여 항목으로 남아 있습니다. 전체 테스트(46건)가 모든 수정 후에도 통과함을 확인했습니다.
