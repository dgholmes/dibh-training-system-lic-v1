/**
 * GENERATED FILE — do not edit by hand.
 * Produced by scripts/generate-error-catalog.js (npm run error-catalog).
 *
 * MFDS SI-07 evidence: every user-facing Korean message in the application, extracted
 * from source so the list cannot silently fall out of step with the code.
 */

export const ERROR_CATALOG = [
  {
    "id": "SI07-001",
    "variant": "blocking",
    "text": "암호화 키 오류",
    "source": "src/main.jsx:124"
  },
  {
    "id": "SI07-002",
    "variant": "blocking",
    "text": "무결성 검사 실패",
    "source": "src/main.jsx:154"
  },
  {
    "id": "SI07-003",
    "variant": "blocking",
    "text": "보안 자가진단 실패",
    "source": "src/main.jsx:166"
  },
  {
    "id": "SI07-004",
    "variant": "toast",
    "toastVariant": "default",
    "text": "저장되었습니다",
    "description": "로그인 화면에 새 공지 문구가 표시됩니다.",
    "source": "src/pages/AdminAccounts.jsx:80"
  },
  {
    "id": "SI07-005",
    "variant": "toast",
    "toastVariant": "default",
    "text": "기본 문구로 재설정되었습니다",
    "description": "",
    "source": "src/pages/AdminAccounts.jsx:91"
  },
  {
    "id": "SI07-006",
    "variant": "toast",
    "toastVariant": "destructive",
    "text": "파일 삭제 실패",
    "description": "파일 삭제 중 오류가 발생했습니다. 다시 시도해 주세요.",
    "source": "src/pages/AnalysisFileSelect.jsx:172"
  },
  {
    "id": "SI07-007",
    "variant": "toast",
    "toastVariant": "destructive",
    "text": "파일을 저장할 수 없습니다",
    "description": "",
    "source": "src/pages/BreathingDataUpload.jsx:260"
  },
  {
    "id": "SI07-008",
    "variant": "toast",
    "toastVariant": "destructive",
    "text": "일반호흡 데이터는 최대 10개까지 저장됩니다",
    "description": "오래된 일반호흡 데이터를 삭제한 뒤 다시 업로드해 주세요.",
    "source": "src/pages/BreathingDataUpload.jsx:281"
  },
  {
    "id": "SI07-009",
    "variant": "toast",
    "toastVariant": "destructive",
    "text": "CSV 또는 VXP만 업로드할 수 있습니다",
    "description": "…개 파일은 지원 형식이 아니어서 제외되었습니다.",
    "source": "src/pages/BreathingDataUpload.jsx:291"
  },
  {
    "id": "SI07-010",
    "variant": "toast",
    "toastVariant": "destructive",
    "text": "DIBH 데이터는 최대 10개까지 저장됩니다",
    "description": "오래된 DIBH 데이터를 삭제한 뒤 다시 업로드해 주세요.",
    "source": "src/pages/BreathingDataUpload.jsx:318"
  },
  {
    "id": "SI07-011",
    "variant": "toast",
    "toastVariant": "destructive",
    "text": "업로드 진행 중입니다",
    "description": "모든 파일 저장이 끝난 뒤 등록 완료를 눌러 주세요.",
    "source": "src/pages/BreathingDataUpload.jsx:357"
  },
  {
    "id": "SI07-012",
    "variant": "toast",
    "toastVariant": "destructive",
    "text": "삭제 실패",
    "description": "파일 삭제 중 오류가 발생했습니다. 다시 시도해 주세요.",
    "source": "src/pages/BreathingDataUpload.jsx:376"
  },
  {
    "id": "SI07-013",
    "variant": "toast",
    "toastVariant": "destructive",
    "text": "환자를 찾을 수 없습니다",
    "description": "목록에서 다시 선택해 주세요.",
    "source": "src/pages/BreathingDataUpload.jsx:390"
  },
  {
    "id": "SI07-014",
    "variant": "toast",
    "toastVariant": "destructive",
    "text": "업로드 진행 중입니다",
    "description": "모든 파일의 업로드가 완료된 뒤 등록 완료를 눌러 주세요. 진행 중에는 파일이 DB에 저장되지 않습니다.",
    "source": "src/pages/NewPatient.jsx:252"
  },
  {
    "id": "SI07-015",
    "variant": "toast",
    "toastVariant": "destructive",
    "text": "저장에 실패했습니다",
    "description": "환자 정보를 저장하는 중 오류가 발생했습니다. 다시 시도해 주세요.",
    "source": "src/pages/NewPatient.jsx:316"
  },
  {
    "id": "SI07-016",
    "variant": "toast",
    "toastVariant": "destructive",
    "text": "삭제 실패",
    "description": "환자 삭제에 실패했습니다. 다시 시도해 주세요.",
    "source": "src/pages/PatientDashboard.jsx:191"
  },
  {
    "id": "SI07-017",
    "variant": "toast",
    "toastVariant": "destructive",
    "text": "저장 실패",
    "description": "환자 정보 저장에 실패했습니다. 다시 시도해 주세요.",
    "source": "src/pages/PatientDashboard.jsx:222"
  },
  {
    "id": "SI07-018",
    "variant": "inline",
    "text": "이미 존재하는 아이디입니다.",
    "source": "src/api/authStore.js:361"
  },
  {
    "id": "SI07-019",
    "variant": "inline",
    "text": "사용자를 찾을 수 없습니다.",
    "source": "src/api/authStore.js:387"
  },
  {
    "id": "SI07-020",
    "variant": "inline",
    "text": "마지막 계정은 삭제할 수 없습니다.",
    "source": "src/api/authStore.js:450"
  },
  {
    "id": "SI07-021",
    "variant": "inline",
    "text": "파일 무결성 오류: 저장된 이후 파일이 변경되었습니다. (PT-2026-001_GEN_20260907.csv)",
    "source": "src/api/breathingFileRepository.js:231"
  },
  {
    "id": "SI07-022",
    "variant": "inline",
    "text": "한 환자당 일반호흡 데이터는 최대 10개까지만 보관할 수 있습니다. 오래된 데이터를 삭제한 뒤 다시 업로드해 주세요.",
    "source": "src/api/breathingFileRepository.js:86"
  },
  {
    "id": "SI07-023",
    "variant": "inline",
    "text": "VXP 파일에서 [Data] 섹션을 찾을 수 없습니다.",
    "source": "src/lib/calibration/analyzeFiles.js:125"
  },
  {
    "id": "SI07-024",
    "variant": "inline",
    "text": "일반호흡 파일을 찾을 수 없습니다.",
    "source": "src/lib/calibration/analyzeFiles.js:243"
  },
  {
    "id": "SI07-025",
    "variant": "inline",
    "text": "DIBH 파일을 찾을 수 없습니다.",
    "source": "src/lib/calibration/analyzeFiles.js:244"
  },
  {
    "id": "SI07-026",
    "variant": "inline",
    "text": "일반호흡 파일에 유효한 데이터가 없습니다.",
    "source": "src/lib/calibration/analyzeFiles.js:251"
  },
  {
    "id": "SI07-027",
    "variant": "inline",
    "text": "DIBH 파일에 유효한 데이터가 없습니다.",
    "source": "src/lib/calibration/analyzeFiles.js:254"
  },
  {
    "id": "SI07-028",
    "variant": "inline",
    "text": "Web Crypto API 사용 불가",
    "source": "src/main.jsx:13"
  },
  {
    "id": "SI07-029",
    "variant": "inline",
    "text": "암호화 자가진단 실패",
    "source": "src/main.jsx:24"
  },
  {
    "id": "SI07-030",
    "variant": "inline",
    "text": "sessionStorage 사용 불가",
    "source": "src/main.jsx:34"
  },
  {
    "id": "SI07-031",
    "variant": "inline",
    "text": "localStorage 사용 불가",
    "source": "src/main.jsx:45"
  },
  {
    "id": "SI07-032",
    "variant": "inline",
    "text": "무결성 매니페스트를 로드할 수 없습니다 (integrity.json)",
    "source": "src/main.jsx:65"
  },
  {
    "id": "SI07-033",
    "variant": "inline",
    "text": "무결성 검사 파일 로드 실패: /assets/index-a1b2c3d4.js",
    "source": "src/main.jsx:77"
  },
  {
    "id": "SI07-034",
    "variant": "inline",
    "text": "무결성 검사 실패 (파일 변조 감지): /assets/index-a1b2c3d4.js",
    "source": "src/main.jsx:81"
  },
  {
    "id": "SI07-035",
    "variant": "inline",
    "text": "백업 파일의 무결성 검증에 실패했습니다. 파일이 손상되었거나 변조되었습니다.",
    "source": "src/pages/AdminBackup.jsx:126"
  },
  {
    "id": "SI07-036",
    "variant": "inline",
    "text": "백업 파일이 생성되었습니다. (Documents/DIBH-Flow)",
    "source": "src/pages/AdminBackup.jsx:155"
  },
  {
    "id": "SI07-037",
    "variant": "inline",
    "text": "백업 생성에 실패했습니다.",
    "source": "src/pages/AdminBackup.jsx:159"
  },
  {
    "id": "SI07-038",
    "variant": "inline",
    "text": "비식별 데이터가 내보내졌습니다 (3명, Documents/DIBH-Flow). 이름·생년월일은 포함되지 않습니다.",
    "source": "src/pages/AdminBackup.jsx:177"
  },
  {
    "id": "SI07-039",
    "variant": "inline",
    "text": "비식별 내보내기에 실패했습니다.",
    "source": "src/pages/AdminBackup.jsx:181"
  },
  {
    "id": "SI07-040",
    "variant": "inline",
    "text": "복구 완료 (백업일: 2026.09.07 10:30, v…). 새로고침하면 변경사항이 반영됩니다.",
    "source": "src/pages/AdminBackup.jsx:197"
  },
  {
    "id": "SI07-041",
    "variant": "inline",
    "text": "patientId 없음",
    "source": "src/pages/BreathingDataUpload.jsx:253"
  }
];

export default ERROR_CATALOG;
