# KTC 심사 의견 대응 검토 — 2026-07-14

**대상 문서:** 사이버보안 준수명세서 (제출본 20260630)
**출처:** 인증기관(시험기관) 회신 메일 + PDF 첨부파일 검토
**작성 방식:** 메일 본문의 요청사항을 코드베이스(`src/`, `android/`, `capacitor.config.ts`, `package.json`) 대조 검증하여 정리

> ✅ **업데이트 (2026-07-14):** 메일에서 언급된 HWP 첨부파일(`사이버보안 준수명세서20260630 공유용.hwp`) 확보 및 메모 추출 완료 — §0 참조.

---

## 0. HWP 첨부파일 리뷰어 메모 (신규 추출)

### 추출 방법 및 한계
HWP는 구버전 바이너리 포맷(OLE Compound File, `D0 CF 11 E0` 매직 바이트)이라 직접 파싱 불가 — `pyhwp` 라이브러리를 설치하여 `hwp5txt`로 텍스트 추출함. **본문 표 내용은 `<표>` placeholder로만 나오고(원본 PDF로 이미 확보한 내용과 동일하다고 가정), 리뷰어가 남긴 메모(코멘트)는 HWP 내부에서 본문과 별도의 "Memo" 주석 스트림에 저장되어 있어 전부 문서 맨 뒤에 묶여서 추출됨** — 즉 어느 메모가 정확히 몇 페이지/몇 번째 표에 달렸는지는 원본 파일의 시각적 배치(도구로 자동 확인 불가, HWP XML 모델 덤프로도 메모 내용이 비어있는 `<MemoList/>`로만 나와 앵커를 복원하지 못함)를 봐야 확실합니다.

**아래는 추출된 23개 메모 원문 그대로 + 문서 순서·내용 기반으로 추정한 매칭 섹션입니다. 순서는 추출 원문 그대로이며, 섹션 매칭은 추정(신뢰도 표시)이니 실제 HWP를 열어 정확한 위치를 한 번 확인하시는 걸 권장합니다.**

| # | 메모 원문 | 추정 위치 | 신뢰도 | 코드 대조 결과 |
|---|---|---|---|---|
| 1 | 권장사양으로 사양 서술(사용하지 않는 인터페이스는 서술 x / 예: 무선 통신, 유선통신 등) | 1p 제품사양 / 하드웨어 표 | 높음 | Wi-Fi/BLE/GPS·USB 데이터통신은 코드상 미사용 확인됨(§1 본문 참조) — 삭제 대상 |
| 2 | 제품명 모델명 그리고 버전은 애플리케이션에서 명확하게 확인할 수 있게 구현 필요 | 1p 제품사양 또는 SI-08 | 중간 | ⚠️ **문서 수정이 아니라 기능 구현 요청** — 현재 `__APP_VERSION__`은 로그인 화면 하단에 버전만 표시. 제품명·모델명도 화면에 명시적으로 표시되는지 확인 필요 |
| 3 | 시험대상의 기능에 대해 간단하게 서술 | 2p "주요활용분야" 필드 | 높음 | 원본 PDF 확인 결과 해당 필드가 **공란**으로 남아있음 — 반드시 채워야 함 |
| 4 | 사용하지 않는다면 삭제 | 하드웨어 표 "무선통신"(Wi-Fi/BLE/GPS) 행 | 중간 | 코드상 미사용 확인 |
| 5 | 사용하지 않는다면 삭제 | 2.1 Bluetooth 통신모듈 섹션 전체 | 중간 | ⚠️ **문서 내부 모순 발견**: 2.1절은 "Bluetooth 5.0 BLE, 보안모드1/보안레벨4"로 기재했으나, 7절 체크리스트 서두는 "사용되는 통신 기술: 해당없음"이라고 명시 — 실제 코드(`capacitor.config.ts`)에도 BLE 플러그인 미등록 확인됨. 2.1절 전체 삭제 필요 |
| 6 | 암호화 복호화 라이브러리 누락 | 3p 소프트웨어 정보 표, 3rd Party 라이브러리 목록 | 높음 | Web Crypto API(브라우저 내장, AES-256-GCM/PBKDF2/SHA-256)가 목록에 누락 — 추가 필요 |
| 7 | 버전 누락 | 3p 소프트웨어 정보 표 또는 3p 운영체제 정보 | 낮음 | 구체적으로 어느 필드인지 불명확 — HWP 원본에서 위치 확인 권장 |
| 8 | 무결성 보장 필수 | **[확정 — 스크린샷 정밀 확인]** 4p 저장데이터(5.2) 표, "평문 저장(localStorage)" 행 중 **훈련 세션 정보, 캘리브레이션 결과** | 매우 높음 (실물 확인) | `dibh_training_sessions`, `dibh_calibrations` — 현재 무결성 보호 전무(평문 JSON, 변조 탐지 불가). **암호화까지는 요구되지 않음, 무결성(해시 등)만 요구됨** |
| 9 | 암호화 필수 | **[확정 — 스크린샷 정밀 확인]** 동일 행 중 **사용자 계정 메타데이터(역할·잠금 상태 등)** | 매우 높음 (실물 확인) | ⚠️ **이전 추정 정정**: 호흡 파일 BLOB이 아니라 `dibh_users`의 역할(role)·잠금상태(lockedUntil/lockoutTicksRemaining) 등 메타데이터 필드 대상. 비밀번호(PBKDF2 해시)는 이미 별도 행에서 보호되고 있으므로 **이 필드들만** 암호화 필요 |
| 10 | 무결성 보장 필수 | **[확정 — 스크린샷 정밀 확인]** 동일 행 중 **감사 로그 (최대 10,000건, 추가 전용)** | 매우 높음 (실물 확인) | `dibh_audit_log` — 무결성 보호 필요(암호화는 아님). append-only 로그 특성상 해시체인(hash-chain) 방식이 변조 탐지 + UC-07 부인방지 둘 다에 적합 |

**⚠️ 이전 초안 정정 (2차)**: 세 코멘트가 같은 행 전체가 아니라 **행 안의 서로 다른 데이터 항목 각각에 개별적으로** 달려 있었음(스크린샷 정밀 확인 결과). 최종 정리:
- **훈련 세션 정보, 캘리브레이션 결과** → 무결성(integrity)만 필요 — 암호화는 요구되지 않음
- **사용자 계정 메타데이터(역할·잠금 상태)** → 암호화(encryption)만 필요
- **감사 로그** → 무결성(integrity)만 필요 — 암호화는 요구되지 않음
- 호흡 파일 BLOB(SQLite 행)은 이번 리뷰에서 명시적으로 요구된 사항이 아님
| 11 | 1만개 로그 쌓이면 오래된 로그부터 차례대로 삭제하는 증적 추가 + 시험할 수 있게 환경 세팅할 수 있는 방법 추가 | UC-04 감사기록 생성 | 높음 | `auditStore.js`의 `MAX_ENTRIES=10000` FIFO 트림 로직은 실제 구현되어 있음(`auditStore.js:8,54`) — 증적(스크린샷 등) 추가 + 테스트용으로 임계값을 낮출 수 있는 설정 방법 추가 필요 |
| 12 | 감사처리 실패 조건이 없음. 감사처리 실패 조건 + 감사처리 실패 시 어떻게 감사 처리 실패에 대응하는지 추가 | UC-05 | 매우 높음 | 이메일 요청사항과 동일 — §4 본문에 이미 정리한 3가지 조건(quota 초과/재시도 실패/storage 미지원) 사용 가능 |
| 13 | 미적용이 가능하다면 자세한 미적용 사유 | SI-01/02/06/10/11, RA-01/04 전반 | 매우 높음 | 이메일 요청사항과 동일 |
| 14 | 적용이라면 적용 사유에 대해 설명 | SI-02 (또는 13번과 짝) | 중간 | 미적용 유지 vs 적용 전환 결정에 따라 사유 서술 방향이 달라짐 — 회사 결정 필요 |
| 15 | 암호화 되는 파일하고 무결성 점검파일들 그리고 무결성 검증파일들에 대한 경로 필요 | DC-03 / SI-04 | 매우 높음 | 이메일 요청사항과 동일 — §1, §2 본문의 표 사용 가능 |
| 16 | 암호화 기능 점검을 어떻게하는지, 점검 후 감사로그 남기는지 여부 확인 필요 | SI-03 | 매우 높음 | `securitySelfCheck()`(`main.jsx`)는 Web Crypto 가용성+AES 라운드트립+session/localStorage 점검만 수행하며 **감사로그를 남기지 않음** — 확인됨, 보강 필요 |
| 17 | 어떤 파일을 점검하는지 파일명으로 기술(역할과 같이) | SI-04 | 매우 높음 | §2 본문 표(dist/assets/*.js,*.css + integrity.json) 사용 가능 |
| 18 | 구현되어 있는 기능이 아니라면 삭제 | 문서 전반 공통 지침 | 매우 높음 | 이메일 공통사항과 동일 — §3 목록의 6개 항목이 해당 |
| 19 | 모든 오류 메시지들을 식별 후 표로 정리 | SI-07 | 매우 높음 | 이메일 요청사항과 동일 |
| 20 | 앱 설치전에 확인 x | SI-09 또는 UC-02 시험방법 서술 | 낮음 | "설치 전 확인"이라고 서술된 절차가 실제로는 검증되지 않는다는 지적으로 추정 — 정확한 위치 확인 필요 |
| 21 | 앱 자체에 대한 무결성 확인이 어떻게 이루어지는지 확인(앱 설정파일 말고) | SI-04 | 매우 높음 | **§2 본문에서 이미 확인된 핵심 갭과 정확히 일치**: `integrityCheck()`는 JS/CSS 번들 자산만 검증하고 APK 실행파일 자체나 앱 설정파일은 검증 대상이 아님 |
| 22 | 업데이트 검증에 대한 내용이 어떻게 이루어지는지 정확하게 기술 필요. | SI-09 | 매우 높음 | §3 목록 3번과 동일 이슈 |
| 23 | 업데이트 파일(APK)에 대해 해시검증한다고 문서 전체에 걸쳐 명시되어있는데 해당되지 않을 시 해당 내용 삭제 후 업데이트 파일에 대한 검증이 어떻게 이루어지는지 기술 추가 | SI-09 | 매우 높음 | **코드 전체 grep 결과 전자서명/해시 검증 로직 0건 확인** — 문서의 APK 해시검증 서술은 전부 삭제하고 실제 절차(수동 USB 전달 + Android OS 자체 서명 검증)로 재서술 필요 |

### 핵심 발견 — 이메일 요청사항과 HWP 메모가 사실상 동일한 항목을 지적함
메모 11개(#12,13,15,16,17,18,19,21,22,23 등)가 이메일 본문에서 언급된 요청사항과 **내용이 정확히 일치**합니다. 즉 이메일은 HWP 메모의 요약본 성격이며, HWP 메모가 더 구체적인 지적(예: #5 Bluetooth 섹션 자체 모순, #9 호흡데이터 암호화 누락, #2 제품명/버전 앱 내 표시 요구)을 추가로 포함하고 있습니다. **아래 신규 항목은 이메일에는 없었던 추가 발견 사항**이니 특히 주의 필요:
- **#2**: 제품명/모델명/버전을 앱 화면에서 명확히 확인 가능하게 구현 — 문서 수정이 아니라 실제 기능 구현이 필요할 수 있음
- **#5**: Bluetooth 통신모듈(2.1절)이 7절 체크리스트("통신 기술: 해당없음")와 모순 — 삭제 필요
- **#9**: 호흡 데이터(SQLite BLOB)가 암호화되지 않음 — PII만 암호화 중이며, 실제 의료 파형 데이터는 평문 저장. 문서 정정만으로 끝날 사안이 아니라 **암호화 범위를 넓히는 코드 변경이 필요할 수 있음**

---

## 1. 암호화 및 로컬 저장소 (Encryption & Local Storage)

### 요청사항
- 로컬에 저장 중인 모든 암호화 정보의 정확한 저장 경로/파일명 명시
- 암호화 키 생성 방법 및 내부 저장 방법, 키와 IV 조회 방법 공유
- DC-03: Key 생성/저장 위치 + 실제 암호화된 데이터의 기기 내 경로·파일명을 표로 상세 정리

### 검증된 사실 (코드 근거 포함)

| 항목 | 값 | 근거 |
|---|---|---|
| 암호화 키 생성 | `crypto.getRandomValues()`로 256bit 난수 생성, 앱 최초 실행 시 1회 | `src/lib/crypto.js:35-38` |
| 암호화 키 저장 위치 | **localStorage**, 키 이름 `dibh_install_key` (hex 문자열, 평문 저장) | `src/lib/crypto.js:11` |
| 키 조회 방법 | `localStorage.getItem('dibh_install_key')`로 raw hex 조회 가능. 단, 앱 내부에서는 `extractable:false`인 `CryptoKey`로 재수입 후 메모리에서만 사용 — JS 코드상 재추출 불가 | `src/lib/crypto.js:40-46` |
| IV 조회 방법 | 별도 저장소 없음. 암호문 문자열 자체에 포함됨: `enc:<24자hex IV>:<ciphertext hex>` | `src/lib/crypto.js:58-79, 86-118` |
| 암호화된 데이터 저장 경로/파일명 | **localStorage** 키 `dibh_patients` 내 각 레코드의 `_enc` 필드 (이름·생년월일·담당의사명만 암호화) | `src/lib/crypto.js:137-152`, `src/api/localStore.js` |
| 그 외 저장 데이터 (평문, PII 아님) | `dibh_training_sessions`, `dibh_calibrations`, `dibh_calibration_sessions`, `dibh_users`(계정 — 비밀번호는 PBKDF2 해시), `dibh_audit_log` — 모두 localStorage | `src/api/localStore.js`, `src/api/authStore.js:7`, `src/api/auditStore.js:7` |
| SQLite/파일 BLOB | IndexedDB, DB명 `dibh_app`, object store명 `sqlite`, 단일 key `'main'` (sql.js 전체 DB를 하나의 바이너리 blob으로 저장) | `src/db/sqliteDb.js:8-10, 105-113` |
| SQLite 내부 테이블 | `patients(id, payload, created_at, updated_at)` — localStorage 미러 캐시; `breathing_files(id, patient_id, category, original_name, size_bytes, mime, imported_at, content BLOB, content_hash)` — 호흡 파일 원본 | `src/db/sqliteDb.js:48-71`, `breathingFileRepository.js:102` |
| Android 파일시스템 실경로 | `/data/data/com.thepict.dibhtraining/app_webview/Default/Local Storage/` (localStorage), `/data/data/com.thepict.dibhtraining/app_webview/Default/IndexedDB/` (IndexedDB) — WebView 엔진이 관리하는 OS 표준 위치, 앱 코드가 직접 관리하지 않음 | Capacitor/Android WebView 표준 동작 |

### 조치
위 표를 DC-03 섹션에 그대로 삽입하면 "표 형태 상세 정리" 요건 충족.

---

## 2. 백업 및 무결성 점검 (Backup & Integrity Check)

### 요청사항
- 백업 대상 정보를 파일 단위로 명확히 지정 + 백업 파일 생성·보관 위치 명시
- 무결성 점검 방법, 점검 대상 파일명/경로, 기준 해시 파일명/경로 모두 식별

### 백업 — 문서의 "전체 백업" 표현은 부정확 (⚠️ 수정 필요)

`AdminBackup.jsx`의 `BACKUP_KEYS`는 정확히 4개:
`dibh_patients`, `dibh_calibrations`, `dibh_training_sessions`, `dibh_audit_log`
(`src/pages/AdminBackup.jsx:45`)

**백업 범위에서 빠진 것:**
- `dibh_users` (계정 정보)
- `dibh_calibration_sessions` (진행 중 캘리브레이션 세션)
- IndexedDB의 호흡 파일 BLOB 원본 전체 (`dibh_app` / `sqlite` 스토어) — **업로드된 실제 호흡 데이터 파일은 백업에 전혀 포함되지 않음**

→ RA-02 "AES-256-GCM 암호화 전체 백업" 표현을 "환자 메타데이터·캘리브레이션·훈련세션·감사로그(4종) 암호화 백업 — 계정정보 및 호흡파일 원본은 백업 범위 제외"로 정정 필요.

**백업 파일 형식 및 저장 위치:**
- 형식: JSON 배열 + `_created_at`/`_version` → `sha256Hex` 해시로 envelope 구성 → AES-256-GCM 암호화 → `enc:<iv>:<ciphertext>` 단일 문자열 (`src/pages/AdminBackup.jsx:70-84`)
- 파일명: `dibh-backup-{yyyyMMdd-HHmmss}.enc`
- 저장 방식: **`@capacitor/filesystem` 플러그인 미설치** — 브라우저 `Blob` + `<a download>` 앵커 클릭 방식으로 내보냄 (`src/pages/AdminBackup.jsx:111-131`). 앱이 특정 디렉터리에 명시적으로 쓰는 게 아니라 WebView 다운로드 처리에 위임됨 — **실기기에서 실제 저장 폴더를 확인 후 문서에 기재 필요** (일반적으로 Android `Download/` 폴더로 추정되나 코드로 보장되지 않음)
- 비식별 CSV 내보내기는 별도 기능: `dibh-deidentified-{yyyyMMdd}.csv` (평문, 동일한 다운로드 방식) (`src/pages/AdminBackup.jsx:133-157`)
- 복원 시 무결성 검증: envelope 내 해시와 재계산 해시 비교, 불일치 시 복원 차단 (`src/pages/AdminBackup.jsx:86-103`)
- 감사로그: `BACKUP_CREATED`, `BACKUP_RESTORED`, `DEIDENTIFIED_EXPORT` 정상 기록됨 (`src/pages/AdminBackup.jsx:123, 149, 168`)

### 무결성 점검 — 세 갈래로 분리되어 있음 (문서상 혼동 소지)

| 점검 종류 | 대상 | 기준값 저장 위치/파일명 | 실패 시 동작 |
|---|---|---|---|
| 앱 자산 무결성 (`main.jsx: integrityCheck()`, SI-04) | `dist/assets/*.js`, `*.css` **만** (APK 실행파일·네이티브 코드는 대상 아님) | 빌드 시 생성된 `dist/integrity.json` — **검증 대상과 같은 APK 안에 함께 패키징됨** | 앱 마운트 차단(화면 표시) + `console.error`만, **감사로그 미기록**. 프로덕션 빌드에서만 동작(`import.meta.env.PROD`) |
| 호흡 파일 무결성 (`breathingFileRepository.js`) | 업로드된 CSV/VXP 파일 | SQLite `breathing_files.content_hash` 컬럼 | 예외 throw로 분석 차단, **감사로그 미기록**. `content_hash`가 NULL인 구버전 레코드는 검증 자체를 건너뜀 |
| 백업 파일 무결성 (`AdminBackup.jsx`) | 백업/복원 파일 | 백업 파일 자체 내부 해시 envelope | 복원 차단, 정상 동작(감사로그 있음) |

**중요 caveat:** `dist/integrity.json`은 검증 대상 자산과 동일한 패키지(APK) 안에 함께 들어있어, 엄밀한 의미의 "외부에 사전 등록된 독립 기준값"이 아님. 공격자가 APK를 통째로 재빌드/재서명하면 매니페스트도 함께 조작 가능 — 이 한계를 문서에 명시하거나(권장), 별도 서명·외부 배포 체계로 보강 필요.

---

## 3. 문서 공통 수정사항 — 실제 미구현인데 "적용"으로 기재된 항목

| # | 항목 | 문제 | 조치 방향 |
|---|---|---|---|
| 1 | **IA-08** 시스템 사용 알림 메시지 | "인가된 사용자에 의해 설정 가능"이라 명시했으나, `UsageNoticeBanner`(`src/pages/Login.jsx:19-45`)는 완전히 하드코딩된 문자열. 앱 전체에 편집 UI 전무(grep 확인) | 삭제하거나 실제 admin 설정 기능 구현 필요 |
| 2 | **SI-04** 세부 시험방법 서술 (문서 59-60p) | "앱 실행파일(APK)" 해시 검증이라 서술하지만, 실제로는 JS/CSS 번들 자산만 검증. APK 자체·네이티브 코드 검증 없음 | 검증 범위를 정확히 좁혀 재서술 |
| 3 | **SI-09** 업데이트 전자서명 검증 | 코드 전체 grep 결과 전자서명 검증 로직 0건 | "앱 내부 기능"이 아니라 "제조사·관리자의 수동 절차(Android APK 서명 검증은 OS 레벨 책임)"로 재서술 |
| 4 | **CSP `frame-ancestors`** | `vite.config.js`의 CSP 헤더는 **개발 서버 전용**이며 프로덕션 APK에는 전혀 적용 안 됨. `index.html`의 meta 태그는 스펙상 `frame-ancestors` 자체를 지원 불가 | 프로덕션 보호로 주장하는 서술이 있다면 정정 |
| 5 | **`AndroidManifest.xml`의 `allowBackup="true"`** | OS 레벨 자동 백업 활성화 — adb backup 등으로 앱의 WebView 저장 데이터가 외부 추출 가능, RA-02/DC-01 취지와 상충 | `allowBackup="false"`로 변경 또는 문서에 리스크 명시 |
| 6 | **의존성 버전 표 (3p)** | package.json이 caret(`^`) 범위라 11개 중 7개가 문서 기재 버전보다 이미 최신으로 드리프트 (예: react 18.2.0→18.3.1, react-router-dom 7.2.0→7.12.0, react-hook-form 7.54.2→7.71.0, zod 3.24.2→3.25.76, recharts 2.15.1→2.15.4, framer-motion 12.4.7→12.25.0, sonner 2.0.1→2.0.7, tailwindcss 3.4.17→3.4.19) | 버전 고정(exact pin) 또는 표를 현재 lockfile 기준으로 갱신 |

---

## 4. 항목별 세부 요구사항 대응

- **UC-04 (감사기록 표)**: `AdminAuditLog.jsx`가 이미 일시/사용자/액션/대상/상세 컬럼을 표시 중 — 그대로 표로 옮기면 됨.
- **UC-05 (감사 처리 실패 조건)**: `auditStore.js`의 `writeAuditLog` 기준으로 다음 3가지 조건 명시 가능:
  1. localStorage 저장공간 초과(`QuotaExceededError`) — 오래된 로그 20% 자동 삭제 후 1회 재시도
  2. 재시도 후에도 실패 시 예외 전파 → 호출부는 `tryWriteAuditLog`로 감싸 콘솔 로그만 남기고 앱 기능은 계속 동작(필수 기능 손실 없음)
  3. localStorage 자체를 사용할 수 없는 환경(비활성화/미지원 브라우저 설정)
- **UC-01 (권한 부여 표)**: `AdminRoute`(admin 전용: `/admin/accounts`, `/admin/auditlog`, `/admin/backup`) vs `ProtectedRoute`(모든 인증 사용자: 환자·훈련·분석 전체 라우트) — 아래 라우트 목록으로 표 작성 가능

  | 라우트 | 가드 | 필요 권한 |
  |---|---|---|
  | `/login` | 없음 | 공개 |
  | `/home`, `/newpatient`, `/patientdashboard`, `/traininghistory`, `/calibrationreport`, `/typedecision`, `/analysisfileselect`, `/breathingdataupload` | `ProtectedRoute` | 인증된 모든 사용자 |
  | `/admin/accounts`, `/admin/auditlog`, `/admin/backup` | `AdminRoute` | admin 전용 |
  | 레거시 라우트(`/calibration`, `/trainingmonitor` 등) | `ProtectedRoute` → 리다이렉트 | 인증된 모든 사용자 (사용 안 함) |

- **SI-02 (미적용 유지 시 사유 보강)**: 현재 사유("호스트 OS·브라우저 샌드박스 의존")는 방향은 맞으나, 구체적 방어 계층 추가 서술 권장 — Android WebView 프로세스 격리, CSP, `allowMixedContent=false`, 서명된 APK만 설치 가능(Android 패키지 서명 검증) 등.
- **SI-07 (오류 메시지 전수 조사)**: 코드 전체에서 사용자향 오류 문자열 목록화 필요 (로그인 실패, 계정 잠금, 무결성 오류, 백업 실패, 입력값 검증 등 카테고리별). 실기기 스크린샷 증적은 별도 작업 필요.
- **SI-09 (배포 경로 상세 서술)**: 현재 문서(4p, 6.2절)에 "USB 등 폐쇄 매체로 전달, Android 패키지 관리자로 수동 설치"까지는 기재되어 있음 — 심사원이 요구하는 수준(제조사→병원 IT관리자 전달의 구체적 물리적 경로, 누가 언제 어떻게 전달하는지)은 회사의 실제 운영 프로세스에 대한 추가 서술이 필요 (코드로 답변 불가, 비즈니스 프로세스 확인 필요).

---

## 5. 시험 진행 및 기타 협조 사항 — 회신 필요 (회사 결정 사항)

1. **앱 삭제 후 재설치 허용 여부** — 시험 기관 문의에 대한 답변 필요.
2. **권장 구동 사양 기재값** — Android 12 이상(`minSdkVersion=24`이지만 실기기 기준 Android 12), RAM 8GB, Snapdragon 855급으로 확정할지.
3. **대면 방문 시 태블릿 지참** — 확인/준비 사항.

---

## 미해결 항목

- [ ] 심사원이 별도 첨부파일(HWP 등)에 남긴 메모 — 파일 공유 대기 중
- [ ] IA-08 설정 기능 구현 여부 결정
- [ ] SI-04/SI-09 실제 구현 보강 vs 문서 범위 축소 결정
- [ ] `allowBackup` 정책 결정
- [ ] 백업 파일 실제 저장 폴더 실기기 확인
