# SI-07 오류 메시지 화면 캡처 증적

- 캡처 대상: 41건 (전수)
- 캡처 환경: DIBH-Flow 디버그 빌드 (VITE_DEBUG_MODE=true), Galaxy Tab S6 에뮬레이터
- 캡처 방식: `/debug/errors` 증적 하네스를 통해 각 메시지를 **실제 UI 컴포넌트**로 렌더링 후 캡처
  (토스트는 실제 Toaster, 시작 차단 화면은 실제 차단 화면 마크업)
- 메시지 목록은 `scripts/generate-error-catalog.js`가 **소스에서 자동 추출**하므로 누락이 발생하지 않습니다.
- 각 캡처 상단에 메시지 ID·순번·표시형태·소스 위치가 함께 표시됩니다.

> 본 하네스 화면은 `SECURITY_DEBUG` 빌드에서만 등록되며 프로덕션/제출 빌드에는 존재하지 않습니다.

| No | ID | 표시형태 | 메시지 | 설명 | 소스 | 캡처 파일 |
|---|---|---|---|---|---|---|
| 1 | SI07-001 | blocking | 암호화 키 오류 |  | `src/main.jsx:124` | 001_SI07-001_암호화_키_오류.png |
| 2 | SI07-002 | blocking | 무결성 검사 실패 |  | `src/main.jsx:154` | 002_SI07-002_무결성_검사_실패.png |
| 3 | SI07-003 | blocking | 보안 자가진단 실패 |  | `src/main.jsx:166` | 003_SI07-003_보안_자가진단_실패.png |
| 4 | SI07-004 | toast | 저장되었습니다 | 로그인 화면에 새 공지 문구가 표시됩니다. | `src/pages/AdminAccounts.jsx:80` | 004_SI07-004_저장되었습니다.png |
| 5 | SI07-005 | toast | 기본 문구로 재설정되었습니다 |  | `src/pages/AdminAccounts.jsx:91` | 005_SI07-005_기본_문구로_재설정되었습니다.png |
| 6 | SI07-006 | toast | 파일 삭제 실패 | 파일 삭제 중 오류가 발생했습니다. 다시 시도해 주세요. | `src/pages/AnalysisFileSelect.jsx:172` | 006_SI07-006_파일_삭제_실패.png |
| 7 | SI07-007 | toast | 파일을 저장할 수 없습니다 |  | `src/pages/BreathingDataUpload.jsx:260` | 007_SI07-007_파일을_저장할_수_없습니다.png |
| 8 | SI07-008 | toast | 일반호흡 데이터는 최대 10개까지 저장됩니다 | 오래된 일반호흡 데이터를 삭제한 뒤 다시 업로드해 주세요. | `src/pages/BreathingDataUpload.jsx:281` | 008_SI07-008_일반호흡_데이터는_최대_10개까지_저장됩니다.png |
| 9 | SI07-009 | toast | CSV 또는 VXP만 업로드할 수 있습니다 | …개 파일은 지원 형식이 아니어서 제외되었습니다. | `src/pages/BreathingDataUpload.jsx:291` | 009_SI07-009_CSV_또는_VXP만_업로드할_수_있습니다.png |
| 10 | SI07-010 | toast | DIBH 데이터는 최대 10개까지 저장됩니다 | 오래된 DIBH 데이터를 삭제한 뒤 다시 업로드해 주세요. | `src/pages/BreathingDataUpload.jsx:318` | 010_SI07-010_DIBH_데이터는_최대_10개까지_저장됩니다.png |
| 11 | SI07-011 | toast | 업로드 진행 중입니다 | 모든 파일 저장이 끝난 뒤 등록 완료를 눌러 주세요. | `src/pages/BreathingDataUpload.jsx:357` | 011_SI07-011_업로드_진행_중입니다.png |
| 12 | SI07-012 | toast | 삭제 실패 | 파일 삭제 중 오류가 발생했습니다. 다시 시도해 주세요. | `src/pages/BreathingDataUpload.jsx:376` | 012_SI07-012_삭제_실패.png |
| 13 | SI07-013 | toast | 환자를 찾을 수 없습니다 | 목록에서 다시 선택해 주세요. | `src/pages/BreathingDataUpload.jsx:390` | 013_SI07-013_환자를_찾을_수_없습니다.png |
| 14 | SI07-014 | toast | 업로드 진행 중입니다 | 모든 파일의 업로드가 완료된 뒤 등록 완료를 눌러 주세요. 진행 중에는 파일이 DB에 저장되지 않습니다. | `src/pages/NewPatient.jsx:252` | 014_SI07-014_업로드_진행_중입니다.png |
| 15 | SI07-015 | toast | 저장에 실패했습니다 | 환자 정보를 저장하는 중 오류가 발생했습니다. 다시 시도해 주세요. | `src/pages/NewPatient.jsx:316` | 015_SI07-015_저장에_실패했습니다.png |
| 16 | SI07-016 | toast | 삭제 실패 | 환자 삭제에 실패했습니다. 다시 시도해 주세요. | `src/pages/PatientDashboard.jsx:191` | 016_SI07-016_삭제_실패.png |
| 17 | SI07-017 | toast | 저장 실패 | 환자 정보 저장에 실패했습니다. 다시 시도해 주세요. | `src/pages/PatientDashboard.jsx:222` | 017_SI07-017_저장_실패.png |
| 18 | SI07-018 | inline | 이미 존재하는 아이디입니다. |  | `src/api/authStore.js:361` | 018_SI07-018_이미_존재하는_아이디입니다..png |
| 19 | SI07-019 | inline | 사용자를 찾을 수 없습니다. |  | `src/api/authStore.js:387` | 019_SI07-019_사용자를_찾을_수_없습니다..png |
| 20 | SI07-020 | inline | 마지막 계정은 삭제할 수 없습니다. |  | `src/api/authStore.js:450` | 020_SI07-020_마지막_계정은_삭제할_수_없습니다..png |
| 21 | SI07-021 | inline | 파일 무결성 오류: 저장된 이후 파일이 변경되었습니다. (PT-2026-001_GEN_20260907.csv) |  | `src/api/breathingFileRepository.js:231` | 021_SI07-021_파일_무결성_오류_저장된_이후_파일이_변경되었습니다._(PT-2026-0.png |
| 22 | SI07-022 | inline | 한 환자당 일반호흡 데이터는 최대 10개까지만 보관할 수 있습니다. 오래된 데이터를 삭제한 뒤 다시 업로드해 주세요. |  | `src/api/breathingFileRepository.js:86` | 022_SI07-022_한_환자당_일반호흡_데이터는_최대_10개까지만_보관할_수_있습니다._오래.png |
| 23 | SI07-023 | inline | VXP 파일에서 [Data] 섹션을 찾을 수 없습니다. |  | `src/lib/calibration/analyzeFiles.js:125` | 023_SI07-023_VXP_파일에서_[Data]_섹션을_찾을_수_없습니다..png |
| 24 | SI07-024 | inline | 일반호흡 파일을 찾을 수 없습니다. |  | `src/lib/calibration/analyzeFiles.js:243` | 024_SI07-024_일반호흡_파일을_찾을_수_없습니다..png |
| 25 | SI07-025 | inline | DIBH 파일을 찾을 수 없습니다. |  | `src/lib/calibration/analyzeFiles.js:244` | 025_SI07-025_DIBH_파일을_찾을_수_없습니다..png |
| 26 | SI07-026 | inline | 일반호흡 파일에 유효한 데이터가 없습니다. |  | `src/lib/calibration/analyzeFiles.js:251` | 026_SI07-026_일반호흡_파일에_유효한_데이터가_없습니다..png |
| 27 | SI07-027 | inline | DIBH 파일에 유효한 데이터가 없습니다. |  | `src/lib/calibration/analyzeFiles.js:254` | 027_SI07-027_DIBH_파일에_유효한_데이터가_없습니다..png |
| 28 | SI07-028 | inline | Web Crypto API 사용 불가 |  | `src/main.jsx:13` | 028_SI07-028_Web_Crypto_API_사용_불가.png |
| 29 | SI07-029 | inline | 암호화 자가진단 실패 |  | `src/main.jsx:24` | 029_SI07-029_암호화_자가진단_실패.png |
| 30 | SI07-030 | inline | sessionStorage 사용 불가 |  | `src/main.jsx:34` | 030_SI07-030_sessionStorage_사용_불가.png |
| 31 | SI07-031 | inline | localStorage 사용 불가 |  | `src/main.jsx:45` | 031_SI07-031_localStorage_사용_불가.png |
| 32 | SI07-032 | inline | 무결성 매니페스트를 로드할 수 없습니다 (integrity.json) |  | `src/main.jsx:65` | 032_SI07-032_무결성_매니페스트를_로드할_수_없습니다_(integrity.json).png |
| 33 | SI07-033 | inline | 무결성 검사 파일 로드 실패: /assets/index-a1b2c3d4.js |  | `src/main.jsx:77` | 033_SI07-033_무결성_검사_파일_로드_실패_assetsindex-a1b2c3d4.js.png |
| 34 | SI07-034 | inline | 무결성 검사 실패 (파일 변조 감지): /assets/index-a1b2c3d4.js |  | `src/main.jsx:81` | 034_SI07-034_무결성_검사_실패_(파일_변조_감지)_assetsindex-a1b2c3d.png |
| 35 | SI07-035 | inline | 백업 파일의 무결성 검증에 실패했습니다. 파일이 손상되었거나 변조되었습니다. |  | `src/pages/AdminBackup.jsx:126` | 035_SI07-035_백업_파일의_무결성_검증에_실패했습니다._파일이_손상되었거나_변조되었습니.png |
| 36 | SI07-036 | inline | 백업 파일이 생성되었습니다. (Documents/DIBH-Flow) |  | `src/pages/AdminBackup.jsx:155` | 036_SI07-036_백업_파일이_생성되었습니다._(DocumentsDIBH-Flow).png |
| 37 | SI07-037 | inline | 백업 생성에 실패했습니다. |  | `src/pages/AdminBackup.jsx:159` | 037_SI07-037_백업_생성에_실패했습니다..png |
| 38 | SI07-038 | inline | 비식별 데이터가 내보내졌습니다 (3명, Documents/DIBH-Flow). 이름·생년월일은 포함되지 않습니다. |  | `src/pages/AdminBackup.jsx:177` | 038_SI07-038_비식별_데이터가_내보내졌습니다_(3명,_DocumentsDIBH-Flow.png |
| 39 | SI07-039 | inline | 비식별 내보내기에 실패했습니다. |  | `src/pages/AdminBackup.jsx:181` | 039_SI07-039_비식별_내보내기에_실패했습니다..png |
| 40 | SI07-040 | inline | 복구 완료 (백업일: 2026.09.07 10:30, v…). 새로고침하면 변경사항이 반영됩니다. |  | `src/pages/AdminBackup.jsx:197` | 040_SI07-040_복구_완료_(백업일_2026.09.07_1030,_v…)._새로고침하면_.png |
| 41 | SI07-041 | inline | patientId 없음 |  | `src/pages/BreathingDataUpload.jsx:253` | 041_SI07-041_patientId_없음.png |
