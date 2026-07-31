# 백업 파일 및 무결성 점검 관련 사항 (Backup Files & Integrity Check)

**제품명:** DIBH 훈련 관리 시스템
**작성일:** 2026년 7월 16일
**작성자:** 개발팀
**문서 목적:** KTC 리뷰어 질의(백업 대상/저장 위치, 무결성 점검 방법/대상/해시 파일)에 대한 기술적 답변

---

## 질문 1

> 시스템에서 백업을 수행하는 정보들을 파일 단위로 명확히 지정하고 해당 백업 파일들이 생성되어 보관되는 위치도 함께 명시하여 알려주시기 바랍니다.

## 질문 2

> 무결성 점검을 수행하는 구체적인 방법과 함께 무결성 점검 대상이 되는 파일의 이름 및 경로, 그리고 검증의 기준이 되는 무결성 점검용 해시 파일의 이름과 경로를 모두 식별하여 제공해 주시기 바랍니다.

---

## 답변

### 1. 백업 대상 정보 (파일 단위)

백업은 관리자가 `/admin/backup` 화면에서 수동으로 실행하며, `src/pages/AdminBackup.jsx`의 `createBackup()`이 아래 두 종류의 데이터 소스를 하나의 파일로 합쳐 암호화합니다.

| 구분 | 소스 | 포함 데이터 | 코드 근거 |
|---|---|---|---|
| localStorage 6종 | `BACKUP_KEYS` 배열 | `dibh_patients`(환자, PII 암호화 상태 그대로), `dibh_calibrations`, `dibh_training_sessions`, `dibh_audit_log`, `dibh_users`(계정, 비밀번호는 해시), `dibh_calibration_sessions` | `AdminBackup.jsx:74` |
| SQLite 전체 바이너리 | `exportDbBinaryBase64()` (`src/db/sqliteDb.js`) → `payload._sqlite_blob_base64` 필드에 base64로 포함 | `patients` 테이블(환자 PII 미러, `payload` 컬럼) + `breathing_files` 테이블(업로드된 CSV/VXP 원본 BLOB, 파일명·크기·MIME·`content_hash` 포함) 전체 | `AdminBackup.jsx:109`, `sqliteDb.js:133-136` |
| 메타데이터 | `_created_at`, `_version`(`__APP_VERSION__`), `_backup_format_version`(현재 `2`) | 백업 생성 시각, 앱 버전, 백업 포맷 버전 | `AdminBackup.jsx:106-108` |

이 전체 payload를 `JSON.stringify()`한 뒤, **AES-256-GCM(설치 키)으로 암호화된 하나의 파일**로 저장합니다. 즉 "백업 파일"은 여러 파일이 아니라 위 정보를 모두 담은 **단일 `.enc` 파일**입니다.

### 2. 백업 파일 생성 위치 (실제 저장 경로)

오늘 반영된 `saveExportFile()` 헬퍼(`AdminBackup.jsx:25-43`)가 `Capacitor.isNativePlatform()` 여부로 분기합니다.

| 실행 환경 | 저장 방식 | 실제 경로 | 파일명 패턴 |
|---|---|---|---|
| Android 실기기(네이티브) | `@capacitor/filesystem`의 `Filesystem.writeFile({ directory: Directory.Documents })` | `/storage/emulated/0/Android/data/com.thepict.dibhtraining/files/Documents/` | `dibh-backup-{yyyyMMdd-HHmmss}.enc` |
| 브라우저(웹, 개발/테스트용) | `Blob` + `<a download>` (Filesystem 플러그인은 웹에서 실제 파일시스템에 쓰지 못하고 IndexedDB shim으로 대체되므로 폴백 처리) | OS 기본 다운로드 폴더 | 〃 |

같은 헬퍼로 저장되는 **비식별 CSV 내보내기**(`dibh-deidentified-{yyyyMMdd}.csv`, DC-02)는 이름·생년월일을 제외한 캘리브레이션 결과만 담은 별도 기능이며, 위의 암호화 백업(.enc)과는 **다른 파일·다른 목적**입니다(같은 Documents 디렉터리에 나란히 생성될 뿐 백업 파일이 아님). 리뷰 시 혼동되지 않도록 구분해 주시기 바랍니다.

### 3. 백업 파일 자체의 보호 방식

- 전체 payload JSON → SHA-256 해시 계산(`hash`) → `{ hash, data: json }` 형태의 봉투(envelope) 생성 → 이 봉투 전체를 `encryptValue()`로 AES-256-GCM 암호화 → 결과 문자열을 파일로 저장(`AdminBackup.jsx:111-115`).
- 복구(`restoreBackup()`) 시에는 반대 순서로 복호화 → 해시 재계산 → 비교 후 일치할 때만 localStorage 6종 + SQLite 바이너리를 실제 반영합니다(`AdminBackup.jsx:118-137`).

---

### 4. 무결성 점검 메커니즘 (실제 코드 기준, 총 3가지)

| # | 점검 대상(파일/경로) | 점검 방법 | 해시 값이 저장된 위치 | 별도 해시 파일 존재 여부 |
|---|---|---|---|---|
| ① | 업로드된 호흡 데이터 파일 원본 — SQLite `breathing_files` 테이블의 `content` 컬럼(BLOB, AES-256-GCM 암호화됨), 논리적 경로 `IndexedDB(dibh_app/sqlite/main)` 내부 | 업로드 시 원본 바이트에 대해 SHA-256 계산(`src/lib/crypto.js:sha256Hex()`) 후 AES-256-GCM으로 암호화(`encryptBytes()`)하여 저장 → 같은 행의 `content_hash` 컬럼에 평문 기준 해시 저장. 매 조회(`getBreathingFileContent()`)마다 저장된 BLOB을 복호화(`decryptBytes()`)한 뒤 다시 SHA-256 해시하여 `content_hash`와 바이트 단위로 비교 | **같은 SQLite 테이블의 같은 행**, `content_hash` 컬럼 (`breathingFileRepository.js`) | **없음** — 별도의 해시 파일은 존재하지 않으며, 해시 값은 데이터와 같은 행에 필드로 내장되어 있음 |
| ② | 암호화 백업 파일 전체 — `dibh-backup-*.enc` (위 2번 표의 경로) | 백업 생성 시 payload JSON 전체에 대해 SHA-256 계산 → 암호화 전 봉투 JSON(`{hash, data}`)에 포함. 복구 시 복호화 후 `data`를 다시 SHA-256 해시하여 `hash`와 비교, 불일치 시 복구 중단 | **같은 `.enc` 파일 내부**(암호화된 봉투 JSON 안의 `hash` 필드) | **없음** — 별도의 `.sha256` 등 해시 파일은 없으며, 해시 값은 백업 데이터와 같은 암호화 봉투 안에 함께 저장됨 |
| ③ | 앱 실행 번들 파일 — `dist/assets/*.js`, `dist/assets/*.css`, `dist/assets/sql-wasm-*.wasm`(SQLite 엔진 바이너리) (Android APK 내 `assets/public/assets/` 로 패키징되어 WebView `https://localhost/assets/*`로 서빙) | 빌드 시 `scripts/generate-integrity.js`가 `dist/assets/` 내 `.js`/`.css`/`.wasm` 파일을 SHA-256 해시하여 매니페스트 생성(`npm run build` / `cap:build` 스크립트에 자동 연결). 앱 시작 시(프로덕션 빌드에서만, `src/main.jsx:integrityCheck()`) 매니페스트를 `fetch('/integrity.json')`로 불러온 뒤, 목록의 각 파일을 다시 `fetch`해 SHA-256 재계산 → 매니페스트 값과 비교. 하나라도 불일치하면 앱 마운트를 차단하고 오류 화면 표시. **2026-07-16 수정 반영:** 이 문서 초안 작성 시점에는 필터가 `.js`/`.css`만 대상으로 해 SQLite 엔진 WASM 바이너리가 매니페스트에서 제외되어 있었으나, 같은 날 필터에 `.wasm`을 추가하고 재빌드하여 현재 `dist/integrity.json`에 `sql-wasm-*.wasm` 해시가 포함됨을 직접 확인했습니다 | **별도의 독립 해시 파일 있음**: `dist/integrity.json` → 빌드/동기화 후 APK 내 `assets/public/integrity.json`로 패키징, 런타임에는 WebView 원점 기준 `https://localhost/integrity.json` 경로로 조회됨 | **있음** — 이 항목만 유일하게 데이터 파일과 분리된 독립 해시(매니페스트) 파일이 존재함 |

**검증 실패 시 사용자 노출 메시지(원문):**
- ①: `파일 무결성 오류: 저장된 이후 파일이 변경되었습니다. (${original_name})`
- ②: `백업 파일의 무결성 검증에 실패했습니다. 파일이 손상되었거나 변조되었습니다.`
- ③: `무결성 검사 실패 (파일 변조 감지): ${filePath}` (화면 차단 후 "무결성 검사 실패" 오류 카드 표시)

### 5. SI-03 자가진단과의 구분 (오해 방지)

`src/main.jsx:securitySelfCheck()`(SI-03)는 ③과 별개로, 앱 시작 시마다 매번 실행되는 **기능 자가진단**입니다 — 테스트 문자열을 AES-256-GCM으로 암호화·복호화해 왕복이 되는지, `sessionStorage`/`localStorage` 읽기·쓰기가 되는지만 확인하며, **실제 파일의 해시를 검사하지 않습니다.** 파일 자체의 위변조를 실제로 검증하는 것은 위 표의 ③ (`integrityCheck()`, SI-04)이며, 이는 `import.meta.env.PROD` 조건, 즉 **프로덕션 빌드에서만** 실행됩니다(개발 서버 `npm run dev` 환경에서는 동작하지 않음).

---

## 참고 사항

- **해시 값의 저장 형태:** 리뷰어께서 요청하신 "무결성 점검용 해시 파일의 이름과 경로" 중 위 표 ①·②는 **별도의 독립된 해시 파일이 존재하지 않습니다.** 두 경우 모두 해시 값이 보호 대상 데이터와 동일한 저장 단위(SQLite 행, 암호화 봉투) 안에 필드로 내장되어 있어, 물리적으로 분리된 해시 파일은 만들어지지 않는 구조입니다. 반면 ③(앱 번들 무결성)은 `dist/integrity.json`(런타임 경로 `https://localhost/integrity.json`)이라는 **실제 독립 해시 매니페스트 파일**을 사용합니다. 정확한 답변을 위해 이 차이를 있는 그대로 안내드립니다.
- **breathing_files.content의 기밀성 (2026-07-16 당일 수정 반영):** 본 문서 초안 작성 시점에는 `content` 컬럼에 SHA-256 무결성 해시(`content_hash`)만 적용되어 있고 암호화는 없었으나, 같은 날 `src/lib/crypto.js`에 `encryptBytes()`/`decryptBytes()`(AES-256-GCM, `[12바이트 IV][암호문]` 형식)를 추가하고 `breathingFileRepository.js`의 업로드(`createBreathingFile`)·조회(`getBreathingFileContent`) 경로에 적용해 이제 암호화 + 무결성 해시(복호화 후 평문 기준 재검증)가 함께 적용됩니다. 기존(적용 전) 레코드는 신규 `content_encrypted` 컬럼으로 구분해 평문 그대로 읽는 하위 호환 경로를 유지합니다. 위 표 ①의 "점검 대상" 설명도 이 변경을 반영한 것입니다.
- **기존 문서와의 차이:** `docs/submission/cybersecurity-review-qa.md`의 SI-04 항목은 "앱 실행 번들 해시 검증 — 미구현"으로 기재되어 있으나, 이는 해당 문서 작성 시점 기준이며 **현재 코드에는 위 표 ③의 방식으로 이미 구현되어 있습니다**(`scripts/generate-integrity.js` + `src/main.jsx:integrityCheck()`). 다만 그 문서는 이번 답변 작성 범위에 포함되지 않아 별도로 수정하지 않았으며, 추후 해당 문서도 최신 구현 상태로 갱신이 필요합니다.
- **백업 파일 자체는 암호화되어 저장되지만**, 저장 위치인 `Directory.Documents`는 앱 전용 샌드박스(`Android/data/com.thepict.dibhtraining/files/…`)로 다른 앱에서 접근하기 어렵지만, USB/파일관리자 앱으로는 사용자가 직접 열람·복사할 수 있는 경로입니다. 파일명 자체(`dibh-backup-*.enc`)에는 PII가 포함되지 않습니다.
