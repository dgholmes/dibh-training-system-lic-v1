# 사이버보안 검토 의견 회신 (통합본)

**제품명:** DIBH-Flow (방사선 치료 환자를 위한 DIBH 호흡 분석 및 분류 시스템)
**품목명:** D2AEXA1 · **모델명:** DIBH-Flow · **버전:** 1.1.4
**작성일:** 2026년 7월 16일
**작성자:** 개발팀
**문서 목적:** 2026-07-14 리뷰어 이메일의 전체 질의(암호화·로컬 저장소 / 백업·무결성 점검 / 문서 수정 공통사항 / 항목별 세부 요구사항 / 시험 진행 협조사항)에 대한 통합 회신. 기존에 개별적으로 작성된 3개 문서(`cybersecurity-review-qa-encryption-storage-2026-07-16.md`, `cybersecurity-review-qa-backup-integrity-2026-07-16.md`, `cybersecurity-review-qa-ia-uc-si-2026-07-16.md`)를 하나로 통합하고, 기존 제출 명세서(`사이버보안 준수명세서20260630 공유용.hwp`)와 실제 코드를 재대조하여 발견된 사실 오류를 함께 수정했습니다.

**이 문서에서 사용하는 표기:** 각 답변 하단의 `📝 메모` 블록은 오늘(2026-07-16) 코드 또는 문서에 실제로 반영한 수정 사항을 표시합니다. 수정 없이 기존 내용을 확인·유지한 경우 `📝 메모` 없이 답변만 기재했습니다.

---

## I. 암호화 및 로컬 저장소 관련 사항 (Encryption & Local Storage)

### 질문 1
> 최우선적으로 시험대상이 로컬에 저장하고 있는 모든 암호화 정보의 정확한 저장 경로와 파일명을 명시해 주시기 바랍니다.

### 질문 2
> 이와 함께 복호화 검증을 위한 암호화 키 생성 및 내부 저장 방법, 그리고 키와 IV를 조회할 수 있는 방법을 공유 부탁드립니다.

### 질문 3
> DC-03 (저장 데이터 암호화): [...] Key를 어떻게 생성하고 어디에 안전하게 저장하는지, 실제 암호화된 데이터가 기기 내 어느 경로에, 어떤 파일명으로 저장되는지 파악하기 용이하도록 표 형태로 상세히 정리해 주시기 바랍니다.

### 답변

두 개의 별도 저장 위치가 있습니다 — **(A) 앱이 상시 사용하는 실시간 데이터**와 **(B) 관리자가 수동으로 생성하는 백업 파일**입니다.

**(A) 앱 실시간 데이터 — Android WebView 관리, 앱 전용 샌드박스**

Capacitor WebView(`androidScheme: https`)가 관리하며, 앱 전용 디렉터리에 저장되어 루팅/ADB 없이는 다른 앱이나 사용자가 접근할 수 없습니다.

| 저장소 | 물리적 경로(기기 내) | 키/파일명 | 내용 |
|---|---|---|---|
| localStorage | `/data/data/com.thepict.dibhtraining/app_webview/Default/Local Storage/leveldb/` | `dibh_patients` | 환자 레코드 (PII는 `_enc` 필드로 AES-256-GCM 암호화, 환자코드 등 비식별 메타데이터는 평문) |
| 〃 | 〃 | `dibh_users` | 계정 (비밀번호는 PBKDF2-SHA256 해시, 평문 없음) |
| 〃 | 〃 | `dibh_install_key` | AES-256-GCM 설치별 키 원본(hex 인코딩) |
| 〃 | 〃 | `dibh_audit_log` | 감사 로그 (최대 10,000건, 추가 전용) |
| 〃 | 〃 | `dibh_training_sessions`, `dibh_calibrations`, `dibh_calibration_sessions` | 훈련/캘리브레이션 데이터(비-PII, 평문) |
| 〃 | 〃 | `dibh_usage_notice` | 로그인 화면 공지 문구(비민감, 평문) |
| sessionStorage | WebView 세션 메모리(앱 종료 시 자동 삭제) | `dibh_session` | 로그인 세션 토큰 |
| IndexedDB(SQLite/sql.js) | `/data/data/com.thepict.dibhtraining/app_webview/Default/IndexedDB/` | DB명 `dibh_app`, 객체저장소 `sqlite`, 키 `main` | SQLite 전체 바이너리 — `breathing_files`(호흡파일 BLOB, **AES-256-GCM 암호화** + SHA-256 무결성 해시), `patients`(환자 PII 미러, **AES-256-GCM 암호화**) |

**(B) 관리자 백업/CSV 내보내기 — `@capacitor/filesystem`, `Directory.Documents`**

| 경로 | 파일명 패턴 | 내용 |
|---|---|---|
| `/storage/emulated/0/Android/data/com.thepict.dibhtraining/files/Documents/` | `dibh-backup-{yyyyMMdd-HHmmss}.enc` | AES-256-GCM 암호화 전체 백업 (환자·계정·세션·감사로그·호흡파일 BLOB 전체) |
| 〃 | `dibh-deidentified-{yyyyMMdd}.csv` | 비식별 CSV (이름·생년월일 제외) |

USB 연결 또는 파일 관리자 앱으로 조회 가능합니다.

**암호화 키 생성/저장/조회 방법:**

- **생성:** `crypto.getRandomValues()`(Web Crypto API)로 256비트 난수 생성 — 앱 최초 실행 시 1회(`src/lib/crypto.js:initCrypto()`)
- **저장:** hex 인코딩된 원본 키를 `localStorage`의 `dibh_install_key`에 저장(설치별 고유)
- **사용:** `crypto.subtle.importKey(..., extractable: false)`로 가져와 메모리에 non-extractable `CryptoKey`로 캐시 — 이 객체에서 원본 바이트를 재추출할 수는 없으나, 이를 생성한 원본 hex 값 자체는 `localStorage`에서 직접 조회 가능
- **IV:** 매 암호화 연산마다 96비트(12바이트) 난수를 새로 생성, 암호문에 접두어로 포함 — 문자열 값은 `enc:<24자리 hex IV>:<암호문 hex>`, BLOB 값(호흡 파일)은 `[12바이트 IV][암호문]` 바이너리 결합
- **조회 방법(검증용):** `adb` 연결 후 `chrome://inspect`로 WebView 원격 디버깅 → Application 탭 → Local Storage → `https://localhost` → `dibh_install_key` 값 확인. 특정 레코드의 IV는 `enc:` 접두 문자열의 처음 24자리 hex(또는 BLOB의 첫 12바이트)
- **참고:** 비밀번호는 암호화가 아니라 PBKDF2-SHA256 단방향 해시(`dibh_users`의 `passwordHash`+`salt`)로, 복호화 대상이 아니며 위 AES 키와 무관

**DC-03 상세표:**

| 데이터 | 저장소 | 실제 경로 | 키/파일명 | 보호방식 | 알고리즘 |
|---|---|---|---|---|---|
| 환자 PII(이름·생년월일·**담당의사명**) | localStorage | (A) 경로 | `dibh_patients`(레코드 내 `_enc`) | 암호화 | AES-256-GCM, 256비트 키, IV 96비트(레코드별 랜덤) |
| 사용자 비밀번호 | localStorage | 〃 | `dibh_users`(`.passwordHash`,`.salt`) | 단방향 해시 | PBKDF2-SHA256, 100,000회, 솔트 16바이트 |
| 설치 암호화 키 원본 | localStorage | 〃 | `dibh_install_key` | 평문(키 원본 자체) | AES-256-GCM용 256비트 키 소스 |
| 감사로그·세션·캘리브레이션 등 | localStorage | 〃 | `dibh_audit_log` 등 | 평문(비-PII) | 해당없음 |
| 환자 PII 미러(SQLite) | IndexedDB(SQLite) | (A) 경로 | `patients.payload` | 암호화 | AES-256-GCM(동일 `_enc` 방식) |
| 호흡파일 BLOB 원본 | IndexedDB(SQLite) | 〃 | `breathing_files.content` | 암호화 + 무결성 해시 | AES-256-GCM(레코드별 랜덤 IV) + SHA-256(평문 기준) |
| 암호화 백업파일 | Capacitor Filesystem | (B) 경로 | `dibh-backup-*.enc` | 암호화+무결성 | AES-256-GCM + SHA-256 |
| 비식별 CSV | 〃 | 〃 | `dibh-deidentified-*.csv` | 비식별화(PII 제외) | 해당없음 |

> 📝 **메모:** 위 표의 "환자 PII" 행은 **담당의사명**을 포함하도록 정정했습니다 — 기존 제출 명세서(`사이버보안 준수명세서20260630 공유용.hwp`)의 "제품사양 > 저장데이터" 요약표는 암호화 대상 PII를 "이름, 생년월일, **환자 코드**"로 기재하고 있었으나, 실제 코드(`src/lib/crypto.js`의 `PII_FIELDS = ['name', 'birth_date', 'assigned_doctor_name']`)를 확인한 결과 **환자 코드(patient_code)는 암호화 대상이 아니며(비식별 조회용 평문 메타데이터), 실제 암호화 대상은 이름·생년월일·담당의사명**입니다. 같은 문서의 뒷부분 DC-01 상세 섹션에는 이미 올바른 값("이름, 생년월일, 담당의사명")이 기재되어 있어 문서 내 자체 불일치가 있었습니다 — 요약표 쪽을 상세 섹션 기준으로 정정할 것을 권장합니다. 또한 `breathing_files.content`(호흡파일 BLOB)와 `patients.payload`(SQLite 환자 미러)는 오늘 자로 AES-256-GCM 암호화를 신규 적용했습니다(이전에는 각각 SHA-256 해시만 적용/평문 저장 — 아래 II장 및 III장에서 상세 설명).

---

## II. 백업 및 무결성 점검 관련 사항 (Backup & Integrity Check)

### 질문 1
> 시스템에서 백업을 수행하는 정보들을 파일 단위로 명확히 지정하고 해당 백업 파일들이 생성되어 보관되는 위치도 함께 명시하여 알려주시기 바랍니다.

### 답변

백업은 관리자가 `/admin/backup` 화면에서 수동으로 실행하며, `createBackup()`이 아래 데이터를 **하나의 암호화된 파일**로 합칩니다(여러 파일이 아님).

| 구분 | 소스 | 포함 데이터 |
|---|---|---|
| localStorage 6종 | `BACKUP_KEYS` 배열 | `dibh_patients`, `dibh_calibrations`, `dibh_training_sessions`, `dibh_audit_log`, `dibh_users`, `dibh_calibration_sessions` |
| SQLite 전체 바이너리 | `exportDbBinaryBase64()` → `payload._sqlite_blob_base64` | `patients` 테이블(환자 PII 미러) + `breathing_files` 테이블(업로드 CSV/VXP 원본 BLOB, 파일명·크기·MIME·무결성 해시 포함) 전체 |
| 메타데이터 | `_created_at`, `_version`(앱 버전), `_backup_format_version`(현재 `2`) | 백업 생성 시각, 앱 버전, 포맷 버전 |

전체 payload를 JSON 직렬화 → SHA-256 해시 계산 → `{hash, data}` 봉투 생성 → 봉투 전체를 AES-256-GCM(설치 키)으로 암호화하여 저장합니다.

**저장 위치:**

| 실행 환경 | 저장 방식 | 실제 경로 | 파일명 패턴 |
|---|---|---|---|
| Android 실기기(네이티브) | `@capacitor/filesystem` `Filesystem.writeFile({directory: Directory.Documents})` | `/storage/emulated/0/Android/data/com.thepict.dibhtraining/files/Documents/` | `dibh-backup-{yyyyMMdd-HHmmss}.enc` |
| 브라우저(개발/테스트용) | `Blob` + `<a download>` (Filesystem 플러그인이 웹에서는 실제 파일시스템에 쓰지 못하므로 폴백) | OS 기본 다운로드 폴더 | 〃 |

같은 화면의 **비식별 CSV 내보내기**(`dibh-deidentified-{yyyyMMdd}.csv`, DC-02)는 이름·생년월일을 제외한 캘리브레이션 결과만 담은 **별도 기능**이며, 암호화 백업(.enc)과 파일·목적이 다릅니다(같은 폴더에 나란히 생성될 뿐 백업 파일이 아님).

### 질문 2
> 무결성 점검을 수행하는 구체적인 방법과 함께 무결성 점검 대상이 되는 파일의 이름 및 경로, 그리고 검증의 기준이 되는 무결성 점검용 해시 파일의 이름과 경로를 모두 식별하여 제공해 주시기 바랍니다.

### 답변

실제 코드 기준으로 **3가지** 무결성 점검 메커니즘이 있습니다.

| # | 점검 대상 | 점검 방법 | 해시 저장 위치 | 별도 해시 파일 존재 여부 |
|---|---|---|---|---|
| ① | 업로드된 호흡 데이터 파일 원본 — SQLite `breathing_files.content` (IndexedDB `dibh_app/sqlite/main` 내부) | 업로드 시 원본 바이트의 SHA-256 계산 → 같은 행 `content_hash` 컬럼에 저장 → 매 조회 시 복호화 후 재해시하여 비교 | 같은 SQLite 테이블의 같은 행, `content_hash` 컬럼 | **없음** — 해시가 데이터와 같은 행에 내장 |
| ② | 암호화 백업 파일 전체(`dibh-backup-*.enc`) | 백업 생성 시 payload JSON 전체의 SHA-256 계산 → 암호화 전 봉투(`{hash, data}`)에 포함 → 복구 시 복호화 후 재해시 비교, 불일치 시 복구 중단 | 같은 `.enc` 파일 내부(암호화된 봉투 안의 `hash` 필드) | **없음** — 해시가 백업 데이터와 같은 암호화 봉투 안에 존재 |
| ③ | 앱 실행 번들 — `dist/assets/*.js`, `dist/assets/*.css`, `dist/assets/sql-wasm-*.wasm`(SQLite 엔진 바이너리) (APK 내 `assets/public/assets/`로 패키징, WebView `https://localhost/assets/*`로 서빙) | 빌드 시 `scripts/generate-integrity.js`가 SHA-256 해시 매니페스트 생성(`npm run build`/`cap:build`에 자동 연결) → 앱 시작 시(프로덕션 빌드에서만) `src/main.jsx:integrityCheck()`가 매니페스트를 불러와 각 파일을 재해시·비교 → 불일치 시 앱 마운트 차단 | **별도의 독립 해시 파일 있음:** `dist/integrity.json` → APK 내 `assets/public/integrity.json` → 런타임 조회 경로 `https://localhost/integrity.json` | **있음** — 데이터와 분리된 독립 해시(매니페스트) 파일 |

**검증 실패 시 사용자 노출 메시지:**
- ①: `파일 무결성 오류: 저장된 이후 파일이 변경되었습니다. (${original_name})`
- ②: `백업 파일의 무결성 검증에 실패했습니다. 파일이 손상되었거나 변조되었습니다.`
- ③: `무결성 검사 실패 (파일 변조 감지): ${filePath}` (화면 차단 후 "무결성 검사 실패" 오류 카드 표시)

**SI-03 자가진단과의 구분:** `main.jsx:securitySelfCheck()`(SI-03)는 ③과 별개로 매 시작마다 실행되는 **기능 자가진단**입니다 — 테스트 문자열의 AES-256-GCM 왕복 여부, `sessionStorage`/`localStorage` 가용성만 확인하며 **실제 파일 해시는 검사하지 않습니다.** 파일 자체의 위변조는 ③(`integrityCheck()`, SI-04)에서만 검증되며, 프로덕션 빌드에서만 동작합니다(`npm run dev`에서는 미동작).

> 📝 **메모 (1):** `breathing_files.content`는 오늘 자로 AES-256-GCM 암호화를 추가했습니다(`src/lib/crypto.js`에 `encryptBytes()`/`decryptBytes()` 신규 작성, `breathingFileRepository.js`의 업로드/조회 경로에 적용). 기존에는 SHA-256 무결성 해시만 있고 암호화가 없었습니다. 기존(적용 전) 레코드는 `content_encrypted` 컬럼으로 구분해 평문 그대로 읽는 하위 호환 경로를 유지합니다.
>
> 📝 **메모 (2):** `scripts/generate-integrity.js`의 파일 필터에 `.wasm`을 추가했습니다 — 기존에는 `.js`/`.css`만 대상이라 SQLite 엔진 WASM 바이너리(`sql-wasm-*.wasm`)가 매니페스트에서 제외되어 있었습니다. 재빌드하여 현재 `dist/integrity.json`에 해당 파일 해시가 포함됨을 직접 확인했습니다(코드 변경 없이 매니페스트 생성 범위만 확장 — `integrityCheck()`는 이미 파일 종류 무관 범용 루프였음).
>
> 📝 **메모 (3, 신규 발견 — III장·IV장과 연결):** 리뷰어의 SI-04/TRE-01 시험방법(제출된 명세서 원문)은 "무결성 점검 실패 이벤트가 감사로그에 기록되는지 확인한다"를 명시적으로 요구하고 있으나, 기존 `integrityCheck()`는 실패 시 화면을 차단할 뿐 **감사 로그에 기록하지 않았습니다.** 오늘 `AUDIT_ACTIONS.INTEGRITY_CHECK_FAILED`를 신설하고 `main.jsx`의 실패 처리 분기에서 `tryWriteAuditLog()`를 호출하도록 수정했습니다(대상·실패 사유를 `detail`에 기록). 이는 실제 시험 절차상 필수 항목이었으므로 우선 반영했습니다.

---

## III. 문서 수정 및 보완 공통 사항 (General Document Modifications)

### 질문 1
> 요구사항에 대해 기술되어 있는 내용들 중 실제로 구현되어 있지 않은데 적혀 있는 부분들 모두 삭제 부탁드립니다.

### 답변 — 발견된 사실 오류/과장 기재 및 수정 내역

기존 제출 명세서(`사이버보안 준수명세서20260630 공유용.hwp`)와 프로젝트 내부 문서를 실제 코드와 전수 대조한 결과, 아래 항목에서 "기술은 되어 있으나 실제로는 구현되지 않았던" 부분을 확인했습니다. **①·②는 오늘 코드에 직접 구현을 반영하여 기술 내용을 사실화했고, ③은 문서 자체의 표현을 정정할 것을 권장합니다.**

| 번호 | 항목 | 기존 명세서/문서의 기술 | 실제 코드 확인 결과(수정 전) | 조치 |
|---|---|---|---|---|
| ① | UC-04 감사기록 | "로그인·계정 변경·환자 CRUD·**파일 업로드·분석**·캘리브레이션 등 전 이벤트 기록" | `FILE_UPLOADED`, `FILE_DELETED`, `ANALYSIS_RUN`, `PASSWORD_CHANGED` 액션 코드는 `AUDIT_ACTIONS`에 정의만 되어 있고 실제 `tryWriteAuditLog()` 호출부가 코드 전체에 **없었음**(전수 검색으로 확인) | 📝 오늘 4개 이벤트 모두 실제 로깅 호출을 추가해 **구현을 완료**함(IV장 UC-04 참조). 이로써 기술 내용이 사실이 됨 |
| ② | SI-04 무결성 점검 | (암묵적으로 "파일 위변조 시 사용 제한" 전반을 전제) | 무결성 점검 **실패 시 감사 로그 미기록** — 시험방법이 요구하는 "무결성 점검 실패 이벤트 감사기록" 항목 누락 | 📝 오늘 `INTEGRITY_CHECK_FAILED` 액션을 신설하고 실패 시 기록하도록 구현 완료(II장 메모(3) 참조) |
| ③ | 제품사양 > 저장데이터 요약표 | "AES-256-GCM 암호화 저장 (localStorage) — 환자 개인식별정보(PII): 이름, 생년월일, **환자 코드**" | 실제 암호화 대상은 `PII_FIELDS = ['name', 'birth_date', 'assigned_doctor_name']` — **환자 코드는 암호화되지 않는 평문 메타데이터**이며, 대신 **담당의사명**이 암호화 대상에 포함됨(문서 뒷부분 DC-01 섹션에는 이미 올바르게 기재되어 있어 문서 내 자체 불일치) | 📝 저장소 리포지토리 내 `docs/submission/section8-시험기준-준수명세.md`(DC-01)와 `docs/submission/사이버보안-준수명세서-작성내용.md`(5.2 저장데이터)를 오늘 직접 정정 완료. **다만 첨부해 주신 `.hwp` 원본 파일 자체는 당사가 직접 수정할 수 있는 형식이 아니므로, 위 두 마크다운 파일의 정정 내용을 참고하여 원본 HWP에도 동일하게 반영해 주시기 바랍니다.** |
| ④ | SI-05 입력값 검증 | "Zod 스키마 — 모든 폼 입력 유효성 검사" | 코드 전수 검색 결과 `zod`는 `package.json`에 의존성으로만 존재할 뿐 **`src/` 어디에서도 import되어 사용되지 않음**. `react-hook-form`도 실제 폼에서 `useForm`/`Controller`로 쓰이는 곳이 없음(전수 검색 결과 무관한 `AbortController`를 오탐한 것 외에는 사용처 없음). 실제 검증은 `passwordUtils.js:validatePassword()`, `usageNoticeStore.js:validateUsageNotice()`, `NewPatient.jsx`의 수기 검증 함수로 수행됨 | 📝 위와 동일한 3개 마크다운 파일(`section8-...md`의 SI-05, `사이버보안-준수명세서-작성내용.md`의 SI-05 체크리스트 행 + 데이터흐름도 라벨, `cybersecurity-checklist.md`의 SI-05 행) 모두 "Zod 스키마"를 삭제하고 실제 수기 검증 함수 기반 설명으로 오늘 정정 완료. **HWP 원본은 별도 반영 필요.** (SQL 인젝션 방지 "sql.js 파라미터화 쿼리", XSS 방지 "React DOM 기본 방지" 부분은 코드 재확인 결과 사실과 일치 — 문구만 유지, 세부 근거만 보강) |
| ⑤ | UC-04 (캘리브레이션 삭제) | "…캘리브레이션 등 전 이벤트 기록"에서 캘리브레이션 삭제(`CALIBRATION_DELETED`)까지 포함하는 것으로 읽힐 수 있음 | 캘리브레이션 결과를 삭제하는 **UI 기능 자체가 앱 어디에도 없음**(`Calibration.delete()`는 정의만 되어 있고 호출부 없음) — 감사 로그 누락이 아니라 대상 기능 자체가 없는 상태 | 📝 `section8-시험기준-준수명세.md`의 UC-04 항목을 오늘 정정 — 존재하지 않는 "CALIBRATION_COMPLETE" 액션명 표기를 삭제하고 실제 26개 액션 코드 전체를 정확한 이름으로 재기재했으며, `CALIBRATION_DELETED`가 현재 미구현 기능임을 명시하는 각주를 추가했습니다. **캘리브레이션 삭제 기능 자체를 신설할지 여부는 여전히 별도 결정이 필요합니다.** |

> 📝 **메모:** ①·②는 코드 수정으로 "적혀 있는 대로 실제 구현됨" 상태를 만들었습니다. ③·④·⑤는 실제 저장소의 마크다운 소스 문서 3종(`section8-시험기준-준수명세.md`, `사이버보안-준수명세서-작성내용.md`, `cybersecurity-checklist.md`)을 오늘 직접 정정했습니다 — 처음에는 이 표에 "정정 권장"이라고만 적어 두었으나, 정정 권장과 실제 정정은 다르다는 지적을 받고 곧바로 실제 파일을 열어 고쳤습니다. 다만 `.hwp` 원본 파일은 당사 도구로 직접 편집할 수 없는 바이너리 형식이라 텍스트 추출로 내용만 검증했으며, 원본 HWP에는 반영되지 않았으므로 위 마크다운 정정 내용을 참고해 별도로 반영해 주셔야 합니다.

### 질문 2
> 본 메일에 기재된 사항 외에 필요한 수정 요청사항들은 첨부해 드린 파일 내에 메모로 적어두었으니 함께 확인을 부탁드립니다. (아래에 있는 내용이 누락되어 있을 수도 있으니 수정 시 지난번에 보내드린 내용도 같이 확인 부탁드립니다.)

### 답변

> ⚠️ **확인 한계 고지:** 첨부 파일(`사이버보안 준수명세서20260630 공유용.hwp`)은 본문 텍스트를 변환 도구(`pyhwp`)로 추출하여 전체 내용을 검토했습니다. 다만 이 도구는 문서 **본문**은 안정적으로 추출하지만, 한글 워드프로세서의 **말풍선/여백 메모(주석 개체)**가 본문과 별도 스트림으로 존재하는 경우 이를 별도로 식별하지 못할 가능성이 있습니다. 본문 검토를 통해 위 III-①~⑤ 항목을 발견·반영했으나, **원본 HWP 파일을 한글(Hangul) 프로그램으로 직접 열어 "검토" 메뉴의 메모/주석이 남아 있는지 재확인해 주시기를 권장드립니다.** 별도 메모가 있다면 내용을 알려주시면 바로 반영하겠습니다.

### 질문 3
> 시험 대상 앱의 구동 권장 사양(Android OS 버전, 최소 하드웨어 Spec 등)을 문서에 추가해 주시기 바랍니다.

### 답변

기존 제출 명세서의 "제품사양" 표에 이미 아래 내용이 기재되어 있습니다(참고용으로 본 회신에도 재기재합니다):

| 항목 | 내용 |
|---|---|
| 권장 운영체제 | Android 12 이상 |
| 권장 최소 사양 | RAM 8GB 이상, Octa-core 프로세서(Snapdragon 855급 이상 권장), 저장공간 여유 32GB 이상 |
| 권장 화면 사양 | 10인치 이상 태블릿 화면 권장(파형 재생·리포트 조회 UI 최적화 기준) |
| 실제 시험 기기 참고값 | Samsung Galaxy Tab S6 (SM-T860) 기준 — Qualcomm Snapdragon 855 Octa-Core, LPDDR4X RAM 8GB, UFS 3.0 저장장치 |

### 질문 4
> 문서 수정 후에는 꼭 수정된 부분에 "메모" 남겨주시기 바랍니다.

### 답변

본 통합 회신 문서 전체에 걸쳐 오늘 실제로 코드 또는 문서를 변경한 지점마다 `📝 **메모**` 블록으로 표시했습니다(위 I·II·III장 및 아래 IV장 각 항목 참조). 향후 원본 HWP 명세서에 동일 수정 사항을 반영하실 때도 이 메모들을 그대로 근거 각주로 사용하실 수 있습니다.

### 질문 5
> 미적용으로 기술한 다른 요구사항들에서는 구체적으로 왜 미적용인지 "미적용 사유"를 자세하게 기술해주시기 바랍니다.

### 답변

기존 명세서의 "의료기기의 사이버보안 요구사항 미적용 사유" 절을 각 항목별로 구체화했습니다.

| 요구사항 | 기존 미적용 사유(요약) | 구체화된 미적용 사유 |
|---|---|---|
| SI-01 (통신 무결성) | 독립형 SaMD로서 외부 네트워크 통신 기능 없음 | `package.json` 전체 의존성 검토 결과 HTTP 클라이언트·소켓·WebSocket 등 네트워킹 라이브러리 전무(axios, fetch 래퍼, socket.io 등 없음). 앱의 유일한 "통신"은 Android WebView가 로컬 번들(`https://localhost/...`)을 서빙하는 것뿐이며 원격 서버 호출 코드가 없어, "전송 중 정보"라는 개념 자체가 성립하지 않음 |
| SI-02 (악성코드 보호) | 브라우저 샌드박스·CSP 및 호스트 OS 보안에 의존 | (1) 네트워크 공격 표면 없음(위 SI-01과 동일 근거) (2) 업로드 허용 확장자는 `.csv`/`.vxp`뿐이며 파싱 로직은 숫자형 시계열 데이터만 읽는 순수 데이터 파서로 매크로·스크립트 실행 기능 없음 (3) APK는 서명된 패키지로만 설치되며 앱 코드에 셸 실행(`exec`)이나 임의 네이티브 바이너리 실행 기능 없음 (4) USB/외장 저장소 자동 스캔·실행 기능 없음(파일 선택은 사용자가 명시적으로 트리거하는 `<input type="file">` 다이얼로그로만 이루어짐) |
| SI-06 (사전 결정된 상태 출력) | 자동화된 치료 프로세스에 연결되지 않는 SaMD | 본 제품은 인슐린 주입기·환자감시장치처럼 실시간 생체신호 제어나 자동 투약에 관여하지 않는 **사후 분석·훈련 보조 소프트웨어**임. 분석 실패 시에도 물리적 액추에이터나 치료 장비에 어떠한 명령도 전달하지 않으며, 오류 시 단순히 오류 메시지를 표시하고 이전 화면 상태를 유지함 — "사전 결정된 상태로의 출력"이 적용될 자동화 대상 자체가 없음 |
| SI-10 (물리적 변조 방지) | 하드웨어 미포함 독립형 소프트웨어 | 본 제품은 범용 Android 태블릿에 설치되는 SaMD로, 제조사가 하드웨어를 설계·공급하지 않음. 물리적 잠금장치·캡슐화·보안 나사는 하드웨어 제조사(Samsung 등)의 책임 범위이며 앱 레벨에서 구현 불가능한 요구사항임 |
| SI-11 (부트 무결성) | Android Verified Boot 등 OS/하드웨어 제조사 책임 | 부트로더·커널 무결성 검증은 Android OS 및 기기 제조사가 Verified Boot로 이미 수행하는 영역이며, 사용자 공간(user space)에서 실행되는 앱은 부트 프로세스에 개입할 수 있는 권한 자체가 없음(루팅 없이는 접근 불가) |
| RA-01 (DoS 방지) | 오프라인 단일 사용자 앱 — 네트워크 DoS 해당없음 | 앱이 리스닝하는 네트워크 포트·서비스가 전혀 없어(완전 오프라인) 원격 DoS 공격 표면이 구조적으로 존재하지 않음. 유일하게 존재하는 "부하" 유형 공격인 로그인 무차별대입은 IA-07의 5회 실패 시 15분 계정 잠금으로 대응함 |
| RA-04 (네트워크 보안 구성) | 외부 네트워크 미사용 | 앱이 자체적으로 열거나 설정하는 네트워크 포트/프로토콜이 없으며, 기기 자체의 Wi-Fi/블루투스 등 네트워크 설정은 병원 IT 관리 정책 범위이자 Android OS 설정 화면의 책임 범위로, 앱이 관여하거나 관여해서는 안 되는 영역임 |

---

## IV. 항목별 세부 요구사항 (Item-Specific Requirements)

### IA-08 — 시스템 사용 알림 메시지
> 시스템 사용 알림 메시지 설정과 관련된 구체적인 내용을 문서에 추가해 주시기 바랍니다.

| 항목 | 내용 |
|---|---|
| 저장 위치 | `localStorage`의 `dibh_usage_notice` 키(평문, PII 아님) |
| 최대 길이 | 1,000자 — `validateUsageNotice()`가 초과 시 저장 거부 |
| 설정 권한 | 관리자만 가능 — `/admin/accounts`(`AdminRoute`로 보호, `session.role !== 'admin'`이면 `/home`으로 강제 리다이렉트) |
| 기본값(미설정 시) | `getCustomUsageNotice()`가 `null` 반환 → `Login.jsx`의 `UsageNoticeBanner`가 하드코딩된 기본 4문단 표시(공백만 입력해도 트림 후 키 삭제되어 기본값으로 취급) |
| 표시 위치·시점 | 로그인 폼 렌더링 **이전** 단계에서 전체 화면 표시 — "확인하고 계속하기" 버튼을 눌러야 아이디/비밀번호 입력 UI 노출 (인증 시도 이전, 매 로그인 세션마다 노출) |
| 재설정 | `/admin/accounts`의 "기본값으로 재설정" 버튼 → `resetUsageNotice()` → 키 삭제 |
| 감사 로그 | `USAGE_NOTICE_UPDATED` 액션으로 저장/재설정 모두 기록(`targetType: 'system'`, 변경 사실만 기록하고 문구 원문은 남기지 않음) |

### UC-01 — 계정별 접근 권한
> 계정별로 부여된 접근 권한을 명확히 파악할 수 있도록 표 형태로 정리해 주시기 바랍니다.

`role` 필드는 `'admin'` | `'clinician'` 두 값만 존재합니다. `AdminRoute`는 `session.role !== 'admin'`이면 `/home`으로 리다이렉트하고, 그 외 일반 화면은 `ProtectedRoute`(로그인 여부만 확인, 역할 구분 없음)로 보호됩니다.

| 라우트/기능 | 가드 | 관리자(admin) | 임상의(clinician) |
|---|---|---|---|
| `/login` | 없음(공개) | O | O |
| `/home`(환자 목록) | `ProtectedRoute` | O | O |
| `/newpatient`(환자 등록) | `ProtectedRoute` | O | O |
| `/patientdashboard` | `ProtectedRoute` | O | O |
| `/breathingdataupload` | `ProtectedRoute` | O | O |
| `/analysisfileselect`(분석 실행) | `ProtectedRoute` | O | O |
| `/calibrationreport` | `ProtectedRoute` | O | O |
| `/traininghistory` | `ProtectedRoute` | O | O |
| `/typedecision` | `ProtectedRoute` | O | O |
| `/admin/accounts`(계정 관리 + IA-08 문구 편집) | `AdminRoute` | O | **X**(`/home`으로 리다이렉트) |
| `/admin/auditlog`(감사 로그 조회) | `AdminRoute` | O | **X** |
| `/admin/backup`(백업/복구, 비식별 내보내기) | `AdminRoute` | O | **X** |

**요약:** 두 역할의 차이는 관리자 전용 3개 화면(계정 관리·감사 로그·백업) 접근 여부뿐이며, 환자 진료 관련 기능(등록·업로드·분석·리포트·이력)은 인증된 모든 계정이 동일하게 사용합니다.

### UC-04 — 감사 로그 항목 구조
> 감사 로그에 기록되는 항목(타임스탬프, 출처, 카테고리, 유형, 이벤트 ID, 이벤트 결과 등)을 가독성 있게 표로 구조화하여 작성해 주시기 바랍니다.

`AUDIT_ACTIONS`는 아래 **26개** 항목으로 구성됩니다(오늘 `INTEGRITY_CHECK_FAILED` 1건 추가 반영, 이전 정리 시점 대비 `BACKUP_CREATE_FAILED`/`BACKUP_RESTORE_FAILED`/`DEIDENTIFIED_EXPORT_FAILED` 3건도 추가).

| 이벤트 코드 | 카테고리 | 설명 | 실제 호출 위치 |
|---|---|---|---|
| `LOGIN` | 인증 | 로그인 성공 | `authStore.js:loginUser()` |
| `LOGOUT` | 인증 | 로그아웃 | `authStore.js:clearSession()` |
| `SESSION_TIMEOUT` | 인증 | 30분 비활동 자동 로그아웃 | `authStore.js:clearSessionForTimeout()` |
| `LOGIN_FAILED` | 인증 | 로그인 실패 | `authStore.js:loginUser()` |
| `ACCOUNT_LOCKED` | 인증 | 5회 연속 실패 후 계정 잠금 | `authStore.js:loginUser()` |
| `USER_CREATED` | 계정 관리 | 계정 생성 | `AdminAccounts.jsx` |
| `USER_DELETED` | 계정 관리 | 계정 삭제 | `AdminAccounts.jsx` |
| `USER_ROLE_CHANGED` | 계정 관리 | 역할 변경 | `AdminAccounts.jsx` |
| `USER_UNLOCKED` | 계정 관리 | 계정 잠금 수동 해제 | `AdminAccounts.jsx` |
| `PASSWORD_CHANGED` | 계정 관리 | 본인 비밀번호 변경 | `Login.jsx:ChangePasswordModal` **(📝 오늘 구현)** |
| `PASSWORD_RESET_BY_ADMIN` | 계정 관리 | 관리자의 비밀번호 초기화 | `AdminAccounts.jsx` |
| `PATIENT_CREATED` | 환자 관리 | 환자 등록 | `localStore.js:Patient.create()` |
| `PATIENT_UPDATED` | 환자 관리 | 환자 정보 수정 | `localStore.js:Patient.update()` |
| `PATIENT_DELETED` | 환자 관리 | 환자 삭제 | `localStore.js:Patient.delete()` |
| `FILE_UPLOADED` | 파일 관리 | 호흡 파일 업로드 완료 | `breathingFileRepository.js:createBreathingFile()` **(📝 오늘 구현)** |
| `FILE_DELETED` | 파일 관리 | 호흡 파일 삭제 | `breathingFileRepository.js:deleteBreathingFile()` **(📝 오늘 구현)** |
| `ANALYSIS_RUN` | 분석 | 분석 실행 완료(캘리브레이션 레코드 생성) | `localStore.js:CalibrationSession.complete()` **(📝 오늘 구현)** |
| `CALIBRATION_DELETED` | 분석 | 캘리브레이션 삭제 | **호출 위치 없음** — 삭제 UI 기능 자체 미구현(III장 참조) |
| `BACKUP_CREATED` | 백업/내보내기 | 백업 생성 성공 | `AdminBackup.jsx:handleExport()` |
| `BACKUP_CREATE_FAILED` | 백업/내보내기 | 백업 생성 실패 | `AdminBackup.jsx:handleExport()` catch **(📝 오늘 구현)** |
| `BACKUP_RESTORED` | 백업/내보내기 | 백업 복원 성공 | `AdminBackup.jsx:handleImport()` |
| `BACKUP_RESTORE_FAILED` | 백업/내보내기 | 백업 복원 실패 | `AdminBackup.jsx:handleImport()` catch **(📝 오늘 구현)** |
| `DEIDENTIFIED_EXPORT` | 백업/내보내기 | 비식별 CSV 내보내기 성공 | `AdminBackup.jsx:handleDeidentifiedExport()` |
| `DEIDENTIFIED_EXPORT_FAILED` | 백업/내보내기 | 비식별 CSV 내보내기 실패 | `AdminBackup.jsx:handleDeidentifiedExport()` catch **(📝 오늘 구현)** |
| `USAGE_NOTICE_UPDATED` | 시스템 설정 | IA-08 문구 저장/재설정 | `AdminAccounts.jsx` |
| `INTEGRITY_CHECK_FAILED` | 시스템 무결성 | SI-04 앱 번들 무결성 검증 실패(로그인 이전) | `main.jsx` **(📝 오늘 구현)** |
| `DEBUG_SEED_ENTRY` | (디버그 전용) | QA용 대량 테스트 항목 생성 | `SECURITY_DEBUG` 빌드 전용, 프로덕션에서는 실행 불가 |

**감사 로그 항목 필드 스키마:**

| 필드명 | 타입 | 설명 | 예시 |
|---|---|---|---|
| `id` | string | 로그 항목 고유 식별자 | `"1749650234123-k7x2m"` |
| `timestamp` | string | ISO 8601 UTC(`new Date().toISOString()`) | `"2026-07-16T10:30:45.123Z"` |
| `userId` | string | 작업 수행 계정 내부 ID(미인증 시 `"system"`) | `"1749500000000-abc1234"` |
| `username` | string | 작업 수행 계정 로그인 아이디(미인증 시 `"system"`) | `"admin"` |
| `action` | string | 이벤트 코드(위 표 참조) | `"LOGIN"` |
| `targetType` | string\|null | 작업 대상 유형 | `"user"`, `"patient"`, `"file"`, `"system"` |
| `targetId` | string\|null | 작업 대상 항목 ID | `"1749500000001-xyz"` |
| `detail` | string\|null | 부가 설명(자유 텍스트) | `"username: admin, attempt 2"` |

**리뷰어 요청 용어 ↔ 실제 필드 대응표:**

| 가이드라인 용어 | 코드상 대응 | 비고 |
|---|---|---|
| 타임스탬프 | `timestamp` | ISO 8601 UTC, 기기 시스템 시계 기반(UC-06) |
| 출처 | `userId` + `username` | 단일 기기·완전 오프라인 구조로 별도 IP/호스트명 필드 없음 — 작업 계정이 곧 출처 역할 |
| 카테고리 | 전용 필드 없음 — `action` 값의 의미로 그룹화(위 표의 "카테고리" 열이 문서 차원에서 제공) | 코드에는 카테고리 전용 컬럼 없음 |
| 유형 | `action` + `targetType` | 두 필드가 함께 "무엇에 대해 어떤 이벤트가 발생했는지"를 특정 |
| 이벤트 ID | `id` | 로그 레코드 자체의 PK 역할 |
| 이벤트 결과 | 전용 성공/실패 필드 없음 — 성공/실패가 **별도 액션 코드**로 구분(`LOGIN` vs `LOGIN_FAILED`, `BACKUP_CREATED` vs `BACKUP_CREATE_FAILED` 등) | 📝 백업/복원/비식별 내보내기 실패 및 무결성 검사 실패도 오늘부로 모두 액션 코드가 분리되어 기록됨 |

### UC-05 — 감사 처리 실패 조건
> 현재 "감사 처리 실패 조건"에 대한 식별 내용이 누락되어 있습니다. 해당 조건을 명확히 식별하여 문서에 추가해 주시기 바랍니다.

| # | 실패 조건 | 코드상 근거 | 처리 방식 |
|---|---|---|---|
| 1 | `localStorage` 용량 초과(`QuotaExceededError`) | `writeAuditLog()`가 `e.name === 'QuotaExceededError' \|\| e.code === 22`로 감지 | 오래된 로그 20% 삭제 후 1회 재시도 → 재시도도 실패하면 예외를 다시 던짐 → `tryWriteAuditLog`가 이를 catch하여 `console.error`만 남기고 정상 반환(호출부 영향 없음) |
| 2 | 기존 로그 배열 JSON 파싱 실패(저장값 손상) | `loadLog()`의 `try/catch`가 파싱 실패 시 **빈 배열 반환** | 예외가 발생하지 않아 `tryWriteAuditLog`의 catch를 타지 않음 — 과거 로그가 조용히 유실되고 새 항목부터 다시 쌓이는 잔여 위험 존재 |
| 3 | `localStorage.setItem()` 실패(용량 초과 아닌 기타 사유) | `writeAuditLog()`가 즉시 `throw` | `tryWriteAuditLog`가 catch하여 `console.error`만 남김 — 호출부(로그인 등) 영향 없음 |
| 4 | `localStorage` 자체 사용 불가 환경 | `main.jsx:securitySelfCheck()`의 4단계 자가진단 중 "localStorage 가용성" 점검에서 이미 실패 | 감사 로그 개별 실패 이전에 **앱 마운트 자체가 차단**됨(SI-03) |

**최대 항목 수 정책:** 정상 흐름에서 `MAX_ENTRIES = 10,000` 초과 시 가장 오래된 항목부터 자동 삭제하여 최신 10,000건을 항상 유지합니다(위 실패 조건과 별개로 매 쓰기마다 수행).

**요약:** 감사 로그 쓰기 실패는 두 층위로 처리됩니다 — ① 용량 초과 시 자동 트림 후 재시도, 실패 시 예외 전파. ② 모든 실제 호출부는 `tryWriteAuditLog()`로 감싸져 있어 예외가 콘솔 오류로만 기록되고 핵심 기능은 계속 동작합니다. 다만 로그 배열 자체가 손상된 경우는 예외 없이 빈 배열로 대체되어 과거 로그가 조용히 유실될 수 있는 잔여 위험이 있습니다.

### SI-02 — 악성코드로부터 보호
> 미적용을 유지하실 경우 규제 기관이 납득할 수 있는 구체적인 "미적용 사유"를 기재해 주시고, 적용으로 변경하실 경우 그에 맞는 대응/시험 방안을 추가해 주시기 바랍니다.

**미적용(N/A) 유지를 권장**하며, 구체 사유는 위 III장 질문 5 표(SI-02 행)를 참조하시기 바랍니다. 백신 프로그램 도입은 권장하지 않으며, 대신 사용자 설명서에 "신뢰할 수 있는 보안 프로그램 설치·최신 유지", "출처 불명 앱/APK 설치 금지", "공식 앱스토어 외 경로 설치 금지" 등 사용자 교육 문구로 보완합니다.

### SI-04 — 기타 무결성 점검 대상 파일 및 해시 저장 위치
> "기타 위변조 시 제품 동작 또는 보안 기능에 영향을 줄 수 있는 파일"이 무엇인지 명시해 주시고, 산출된 무결성 기준값(해시 등)이 시스템 내 어느 위치에 저장되는지 확인 부탁드립니다.

(호흡 파일·백업 파일 해시는 II장 참조) 그 외 위변조 시 영향을 줄 수 있는 파일은 아래와 같습니다.

| 대상 파일 | 위변조 시 영향 | 해시 계산/저장 여부 | 해시 저장 위치 |
|---|---|---|---|
| JS/CSS/WASM 앱 번들(`dist/assets/*.js`, `*.css`, `sql-wasm-*.wasm`) | 앱 로직·화면·SQLite 엔진 자체가 변조된 코드/바이너리로 대체될 수 있음 | **적용됨**(오늘 WASM까지 확장 완료 — II장 메모(2) 참조) | `dist/integrity.json` → APK 내 `assets/public/integrity.json` → 런타임 `https://localhost/integrity.json` |
| Android APK 패키지 자체(서명·매니페스트·네이티브 코드) | APK 전체 재서명 배포 시 위 파일들이 함께 위조될 수 있음(앱 레벨 점검의 근본적 한계) | 앱 자체 로직으로는 미적용 — Android OS가 설치 시 서명 인증서 자동 검증으로 대체(SI-09) | 해당없음(OS 책임 범위) |
| localStorage 저장 데이터(계정, 환자, 감사 로그 등) | 위변조 시 인증·권한·이력 추적 기능 왜곡 가능 | 부분 적용 — 환자 PII(`_enc`)는 AES-256-GCM 인증 태그로 위변조 시 복호화 자체가 실패해 탐지됨. 그 외 평문 필드는 별도 무결성 해시 없음 | 해당없음 |

### SI-07 — 오류 메시지 전체 식별
> 시스템에서 발생하는 오류 메시지들을 모두 식별하여 기재해 주시고, 관련 증적(화면 캡처 등)을 문서에 추가해 주시기 바랍니다.

전체 코드베이스에서 사용자에게 노출되는 한글 오류·경고 메시지를 화면/기능 단위로 전수 조사했습니다(약 78개 문자열, 인증/계정·파일업로드/무결성·분석 파이프라인·백업복구·앱시작 자가진단·감사로그 용량경고·암호화 관련 7개 그룹으로 분류). 전체 목록은 `docs/submission/cybersecurity-review-qa-ia-uc-si-2026-07-16.md`의 "답변 7"에 표로 정리되어 있습니다.

> 📝 **메모:** 조사 과정에서 발견한 2가지 오류 처리 공백을 오늘 수정했습니다.
> 1. `PatientDashboard.jsx`의 환자 삭제 확인 처리(`handleConfirmDelete()`)가 `try/catch` 없이 `Patient.delete()`를 호출해 실패 시 처리되지 않은 예외로 남을 수 있었습니다 → `handleSaveEdit()`와 동일한 패턴(try/catch + 실패 토스트)을 추가했습니다.
> 2. 분석 파이프라인(`analyzeFiles.js`)이 던지는 5가지 구체적 원인 메시지(VXP 형식 오류, 파일 미발견, 유효 데이터 없음 — 모두 내부 경로·스택트레이스 없이 이미 사용자용으로 작성된 안전한 한글 문구임을 코드로 확인)가 `AnalysisFileSelect.jsx`에서 하나의 공통 오류 문구로 대체되고 있었습니다 → `err.message`를 우선 표시하고, 메시지가 없을 때만 기존 일반 문구로 대체하도록 수정했습니다(`AdminBackup.jsx:handleImport()`에 이미 있던 것과 동일한 패턴).

**증적(스크린샷) 관련 한계:** 본 문서는 코드 정적 분석 및 텍스트 인벤토리로 작성되었으며, 실기기/에뮬레이터 화면 캡처는 자동화 도구가 없는 현재 작업 환경에서는 생성할 수 없었습니다. 위 인벤토리는 스크린샷 증적 작업 시 재현·촬영해야 할 조건을 빠짐없이 식별한 목록이며, 실제 캡처는 사람이 실기기에서 각 조건을 재현하는 수동 QA로 별도 진행이 필요합니다.

### SI-09 — 실제 배포 경로
> "업데이트 파일이 제조자가 승인한 배포 경로를 통해 제공되었는지 확인한다."라는 시험 기준과 관련하여, 실제 운영 시 구체적으로 어떤 '배포 방법(경로)'을 사용하는지 상세히 기술해 주시기 바랍니다.

**확정된 답변:** 실제 배포 방법은 **USB를 통한 수동 설치**입니다. 이는 기존 제출 명세서의 "업데이트 방식" 필드(제품사양 표) 및 "업데이트 절차"(기기 운영 절차 섹션)에 이미 다음과 같이 기술되어 있으며, 실제 운영 방식과 일치함을 확인했습니다.

1. 제조사가 신규 APK 파일 및 SHA-256 해시 매니페스트를 배포
2. 병원 관리자가 APK를 USB 등 폐쇄 매체로 Android 기기에 전달
3. 관리자가 SHA-256 해시를 매니페스트와 비교하여 무결성 확인
4. Android 패키지 관리자로 APK 수동 설치
5. 앱 최초 실행 시 보안 자가진단(Web Crypto 가용성·암호화 라운드트립, 그리고 오늘부터는 앱 번들 SHA-256 무결성 검증까지) 수행
6. 로그인 화면 하단에 새 버전 번호 표시

앱 자체에는 네트워크를 통한 자동 업데이트(OTA) 기능이 없으며(완전 오프라인 설계와 일관), Android OS가 설치 시 APK 서명 인증서를 자동 검증하여 기존 설치본과 서명이 다른 파일의 설치를 거부합니다.

---

## V. 시험 진행 및 기타 협조 사항 (Testing Preparation & Cooperation)

### 질문 1 (답변 필요)
> 시험 과정 중 애플리케이션 초기화 단계를 확인하고자 하니, 실제 환경에서 기존 앱을 삭제한 후 재설치해도 괜찮은지 문의드립니다.

### 답변

**예, 재설치하셔도 무방합니다.** 다만 아래 기술적 사실을 참고해 주시기 바랍니다.

| 항목 | 재설치(삭제 후 재설치) 시 동작 |
|---|---|
| 앱 데이터(환자, 계정, 감사 로그, 호흡 파일 등) | Android가 앱 전용 데이터 디렉터리(`/data/data/com.thepict.dibhtraining/`)를 완전히 삭제하므로 **모두 초기화**됩니다. 기존 데이터를 보존하려면 재설치 전 `/admin/backup`에서 암호화 백업 파일을 생성해 두시기 바랍니다(단, 백업은 **동일 설치의 암호화 키로만 복원 가능**하므로, 삭제 후 재설치하면 새 설치 키가 생성되어 이전 백업을 복원할 수 없습니다 — 완전 초기화 테스트가 목적이라면 문제없으나, 기존 데이터를 유지한 채 재설치하는 시나리오라면 별도 협의가 필요합니다) |
| 기본 관리자 계정 | 앱 최초 실행 시 `admin` / `Admin@1234!` 계정이 자동 재생성됩니다(반드시 최초 로그인 시 비밀번호 변경 필요) |
| 암호화 키(`dibh_install_key`) | 재설치 시 새로운 256비트 키가 새로 생성됩니다(이전 키는 완전히 소실) |
| 앱 시작 자가진단 | 재설치 후 최초 실행 시 SI-03 자가진단 및 SI-04 무결성 검사(프로덕션 빌드의 경우)가 정상적으로 재수행되는 것을 확인하실 수 있습니다 — 오히려 "애플리케이션 초기화 단계" 확인 목적에 부합하는 시나리오입니다 |

### 질문 2
> 대면 방문 시, 앱이 설치된 테스트용 태블릿을 지참해 주시기 바랍니다. (시험 진행용)

### 답변

확인했습니다. 대면 방문 시 DIBH-Flow가 설치된 테스트용 태블릿(위 III장 질문 3의 권장 사양 충족 기기)을 지참하겠습니다.

---

## 부록 — 오늘(2026-07-16) 반영된 코드 수정 사항 요약

| # | 파일 | 수정 내용 |
|---|---|---|
| 1 | `src/lib/crypto.js` | `encryptBytes()`/`decryptBytes()` 신규 추가(AES-256-GCM, BLOB용) |
| 2 | `src/api/breathingFileRepository.js` | 호흡 파일 BLOB 암호화 적용(`content_encrypted` 컬럼으로 하위 호환), `FILE_UPLOADED`/`FILE_DELETED` 감사 로깅 추가 |
| 3 | `src/api/localStore.js` | SQLite `patients.payload`를 암호화된 형태로 저장하도록 수정(기존 평문 버그 수정), `ANALYSIS_RUN` 감사 로깅 추가 |
| 4 | `src/pages/Login.jsx` | 본인 비밀번호 변경 시 `PASSWORD_CHANGED` 감사 로깅 추가 |
| 5 | `src/pages/AdminBackup.jsx` | 백업 생성/복원/비식별 내보내기 **실패** 시 감사 로깅 추가, 브라우저/네이티브 환경별 저장 방식 분기(`saveExportFile`) |
| 6 | `src/pages/PatientDashboard.jsx` | 환자 삭제 실패 시 try/catch + 오류 토스트 추가 |
| 7 | `src/pages/AnalysisFileSelect.jsx` | 분석 실패 시 구체적 원인 메시지 노출(기존 일반 문구 대체) |
| 8 | `src/api/auditStore.js` | `BACKUP_CREATE_FAILED`, `BACKUP_RESTORE_FAILED`, `DEIDENTIFIED_EXPORT_FAILED`, `INTEGRITY_CHECK_FAILED` 액션 코드 신설 |
| 9 | `src/main.jsx` | 앱 번들 무결성 검사 실패 시 감사 로그 기록 추가 |
| 10 | `src/pages/AdminAuditLog.jsx` | 신규/누락 액션 코드에 대한 색상 매핑 보강 |
| 11 | `scripts/generate-integrity.js` | 무결성 매니페스트 대상에 `.wasm` 파일 포함 |

전체 자동화 테스트(46건) 및 프로덕션 빌드(`npm run build`)를 통해 위 변경사항이 정상 동작함을 확인했습니다.
