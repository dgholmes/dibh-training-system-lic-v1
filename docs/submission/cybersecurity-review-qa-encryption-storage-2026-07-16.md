# 암호화 및 로컬 저장소 관련 사항 (Encryption & Local Storage)

**제품명:** DIBH 훈련 관리 시스템
**작성일:** 2026년 7월 16일
**작성자:** 개발팀
**문서 목적:** KTC 리뷰어 질의(암호화·로컬 저장소·DC-03)에 대한 기술적 답변

---

## 질문 1

> 최우선적으로 시험대상이 로컬에 저장하고 있는 모든 암호화 정보의 정확한 저장 경로와 파일명을 명시해 주시기 바랍니다.

## 질문 2

> 이와 함께 복호화 검증을 위한 암호화 키 생성 및 내부 저장 방법, 그리고 키와 IV를 조회할 수 있는 방법을 공유 부탁드립니다.

## 질문 3

> DC-03 (저장 데이터 암호화): [...] Key를 어떻게 생성하고 어디에 안전하게 저장하는지, 실제 암호화된 데이터가 기기 내 어느 경로에, 어떤 파일명으로 저장되는지 파악하기 용이하도록 표 형태로 상세히 정리해 주시기 바랍니다.

---

## 답변

두 개의 별도 저장 위치가 있습니다 — **(A) 앱이 상시 사용하는 실시간 데이터**와 **(B) 관리자가 수동으로 생성하는 백업 파일**입니다.

### 1. 로컬 저장 경로 및 파일명

**(A) 앱 실시간 데이터 — WebView 관리, 앱 비공개 영역**

Android 시스템 WebView(Capacitor, `androidScheme: https`)가 관리하며, 앱 전용 샌드박스 내부에 저장되어 루팅/ADB 없이는 접근 불가합니다.

| 저장소 | 물리적 경로(기기 내) | 키/파일명 | 내용 |
|---|---|---|---|
| localStorage | `/data/data/com.thepict.dibhtraining/app_webview/Default/Local Storage/leveldb/` | `dibh_patients` | 환자 레코드 (PII는 `_enc` 필드로 암호화) |
| 〃 | 〃 | `dibh_users` | 계정 (비밀번호는 해시, 평문 없음) |
| 〃 | 〃 | `dibh_install_key` | AES-256-GCM 설치별 키 원본(hex) |
| 〃 | 〃 | `dibh_audit_log` | 감사 로그 (최대 10,000건) |
| 〃 | 〃 | `dibh_training_sessions`, `dibh_calibrations`, `dibh_calibration_sessions` | 훈련/캘리브레이션 데이터(비-PII) |
| 〃 | 〃 | `dibh_usage_notice` | 로그인 화면 공지 문구(비민감) |
| sessionStorage | WebView 세션 메모리(앱 종료 시 삭제) | `dibh_session` | 로그인 세션 토큰 |
| IndexedDB(SQLite/sql.js) | `/data/data/com.thepict.dibhtraining/app_webview/Default/IndexedDB/` | DB명 `dibh_app`, 객체저장소 `sqlite`, 키 `main` | SQLite 전체 바이너리 — `breathing_files`(호흡파일 BLOB 원본+SHA-256 해시), `patients`(환자 PII 미러) |

**(B) 관리자 백업/CSV 내보내기 — `@capacitor/filesystem`, `Directory.Documents`**

| 경로 | 파일명 패턴 | 내용 |
|---|---|---|
| `/storage/emulated/0/Android/data/com.thepict.dibhtraining/files/Documents/` | `dibh-backup-{yyyyMMdd-HHmmss}.enc` | AES-256-GCM 암호화 전체 백업 (환자·계정·세션·감사로그·호흡파일 BLOB 전체) |
| 〃 | `dibh-deidentified-{yyyyMMdd}.csv` | 비식별 CSV (이름·생년월일 제외) |

USB 연결 또는 파일 관리자 앱으로 조회 가능합니다.

### 2. 암호화 키 생성/저장/조회 방법

- **생성:** `crypto.getRandomValues()`(Web Crypto API)로 256비트 난수 생성 — 앱 최초 실행 시 1회 (`src/lib/crypto.js:initCrypto()`)
- **저장:** hex 인코딩된 원본 키를 `localStorage`의 `dibh_install_key`에 저장 (설치별 고유, 위 표 (A) 경로)
- **사용:** `crypto.subtle.importKey(..., extractable: false)`로 가져와 메모리에 non-extractable `CryptoKey`로 캐시 — 런타임 중 이 객체에서 원본 바이트를 다시 추출할 수는 없으나, 이를 생성한 원본 hex 값 자체는 여전히 `localStorage`에서 직접 조회 가능
- **IV:** 매 암호화 연산마다 96비트(12바이트) 난수를 새로 생성, 별도 저장하지 않고 암호문 문자열에 접두어로 포함 — 형식: `enc:<24자리 hex IV>:<암호문 hex>`
- **조회 방법(검증용):**
  - 키 값 — `adb` 연결 후 `chrome://inspect`로 기기의 WebView를 원격 디버깅 → Application 탭 → Local Storage → `https://localhost` origin → `dibh_install_key` 값 확인
  - 특정 레코드의 IV — 해당 필드의 `enc:` 문자열에서 `enc:` 뒤 24자리 hex가 IV
  - 참고: 비밀번호는 암호화가 아니라 **PBKDF2-SHA256 단방향 해시**(`dibh_users`의 `passwordHash`+`salt`)로, 복호화 대상이 아니며 위 AES 키와는 무관

### 3. DC-03 상세표

| 데이터 | 저장소 | 실제 경로 | 키/파일명 | 보호방식 | 알고리즘 |
|---|---|---|---|---|---|
| 환자 PII(이름·생년월일·담당의) | localStorage | (A) 경로 | `dibh_patients`(레코드 내 `_enc`) | 암호화 | AES-256-GCM, 256비트 키, IV 96비트(레코드별 랜덤) |
| 사용자 비밀번호 | localStorage | 〃 | `dibh_users`(`.passwordHash`,`.salt`) | 단방향 해시 | PBKDF2-SHA256, 100,000회, 솔트 16바이트 |
| 설치 암호화 키 원본 | localStorage | 〃 | `dibh_install_key` | 평문(키 원본 자체) | AES-256-GCM용 256비트 키 소스 |
| 감사로그·세션·캘리브레이션 등 | localStorage | 〃 | `dibh_audit_log` 등 | 평문(비-PII) | 해당없음 |
| 환자 PII 미러(SQLite) | IndexedDB(SQLite) | (A) 경로 | `patients.payload` | 암호화 | AES-256-GCM(동일 `_enc` 방식) |
| 호흡파일 BLOB 원본 | IndexedDB(SQLite) | 〃 | `breathing_files.content` | 암호화 + 무결성 해시 | AES-256-GCM(레코드별 랜덤 IV) + SHA-256(평문 기준) |
| 암호화 백업파일 | Capacitor Filesystem | (B) 경로 | `dibh-backup-*.enc` | 암호화+무결성 | AES-256-GCM + SHA-256 |
| 비식별 CSV | 〃 | 〃 | `dibh-deidentified-*.csv` | 비식별화(PII 제외) | 해당없음 |

---

## 참고 사항

**작업 중 발견 및 수정한 사항 (1):** SQLite `patients` 테이블의 `payload` 컬럼(위 표의 "환자 PII 미러")이 기존에는 **평문**으로 저장되고 있었습니다 — `src/api/localStore.js`와 `breathingFileRepository.js`가 복호화된 환자 객체를 그대로 SQLite에 넘기고 있었기 때문입니다. 이는 DC-01의 시험방법(저장 정보는 평문으로 저장되지 않아야 함)에 위배되는 부분이라 2026년 7월 16일 세 곳을 수정해 동일한 AES-256-GCM 암호화 형태(`_enc`)로 저장하도록 고쳤습니다.

**작업 중 발견 및 수정한 사항 (2):** `breathing_files.content`(호흡 파형 원본 BLOB)도 기존에는 SHA-256 무결성 해시만 있고 AES 암호화는 적용되어 있지 않았습니다. `src/lib/crypto.js`에 `encryptBytes()`/`decryptBytes()`(AES-256-GCM, `[12바이트 IV][암호문]` 형식, 레코드별 랜덤 IV)를 추가하고, `src/api/breathingFileRepository.js`의 업로드 경로(`createBreathingFile`)에서 암호화 후 저장, 읽기 경로(`getBreathingFileContent`)에서 복호화 후 SHA-256 무결성 검증을 수행하도록 수정했습니다. 무결성 해시는 기존과 동일하게 **평문 기준**으로 계산되어 복호화 후 재검증됩니다. 기존(암호화 적용 전) 레코드는 `content_encrypted` 컬럼으로 구분해 평문 그대로 읽어오는 하위 호환 경로를 유지합니다.

전체 테스트(46건, 신규 `encryptBytes`/`decryptBytes` 라운드트립·변조탐지·IV 재사용 방지 테스트 4건 포함)가 모두 통과함을 확인했습니다.
