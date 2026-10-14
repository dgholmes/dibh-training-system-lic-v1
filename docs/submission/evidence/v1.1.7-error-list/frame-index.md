# 캡처 프레임 ↔ 메시지 대응표

PNG 53장이 커버하는 메시지를 각 프레임의 **화면 전체 텍스트**와 목록 문구를
대조하여 산출한 표입니다. 한 장에 여러 메시지가 담기므로 장수와 메시지 수는 다릅니다.

| 파일 | 담긴 메시지 | 획득 방식 |
|---|---|---|
| `M001_암호화_키_오류_실기기.png` | #1, #2 | 실기기 |
| `M003_무결성_검사_실패_파일변조_실기기.png` | #3, #4, #13 | 실기기 |
| `M007_Web_Crypto_API_사용_불가.png` | #5, #6, #7 | user-action |
| `M008_암호화_자가진단_실패.png` | #5, #6, #8 | user-action |
| `M009_sessionStorage_사용_불가.png` | #5, #6, #9 | user-action |
| `M010_localStorage_사용_불가.png` | #5, #6, #10 | user-action |
| `M011_무결성_매니페스트_로드불가_실기기.png` | #3, #4, #11 | 실기기 |
| `M012_무결성_검사_파일_로드_실패_실기기.png` | #3, #4, #12 | 실기기 |
| `M014_아이디_또는_비밀번호가_올바르지_않습니다_(남은_시도).png` | #14 | user-action |
| `M015_로그인_시도_횟수를_초과하여_계정이_잠금되었습니다.png` | #15 | user-action |
| `M016_계정이_잠금되었습니다_약_N분_후_다시_시도.png` | #16 | user-action |
| `M017_이_계정의_데이터가_손상되어_복호화할_수_없습니다.png` | #17 | user-action |
| `M018_초기_비밀번호_변경_필요.png` | #18, #19 | user-action |
| `M020_비밀번호_변경_주기_도래.png` | #20, #21 | user-action |
| `M023_비밀번호_변경_예정_안내.png` | #22, #23 | user-action |
| `M024b_비밀번호가_일치하지_않습니다.png` | #18, #19, #24 | user-action |
| `M025_비밀번호_정책_오류_5건.png` | #18, #19, #25, #26, #28, #29 | user-action |
| `M027_소문자(a-z)를_포함해야_합니다.png` | #18, #19, #27 | user-action |
| `M030_아이디를_입력하세요.png` | #30 | user-action |
| `M031_아이디는_영문_숫자_만_사용_가능하며_2~30자.png` | #31 | user-action |
| `M032_이미_존재하는_아이디입니다.png` | #32 | user-action |
| `M033_사용자를_찾을_수_없습니다.png` | #33 | user-action |
| `M034_마지막_관리자_계정의_권한은_변경할_수_없습니다.png` | #34 | user-action |
| `M037_공지_문구는_최대_N자까지_입력할_수_있습니다.png` | #37 | user-action |
| `M038_[복호화_실패]_환자_이름_표시값.png` | #38 | user-action |
| `M039_감사_로그_저장_공간_부족_(UC-05).png` | #39, #41, #42, #43 | user-action |
| `M040_감사_로그_저장_공간_경고_(UC-05).png` | #40 | seeded state |
| `M044_백업_생성에_실패했습니다.png` | #44 | user-action |
| `M045c_비식별_내보내기에_실패했습니다.png` | #45 | induced-fault (export write) |
| `M046d_백업_파일의_무결성_검증에_실패했습니다.png` | #46 | real artefact (envelope hash mismatch) + user action |
| `M047_복호화에_실패했습니다_(다른_설치_키로_만든_백업).png` | #47 | real artefact (foreign-key backup) + user action |
| `M048b_복구에_실패했습니다___올바른_백업_파일인지_확인해_주세요.png` | #48 | induced-fault (message-less error) |
| `M049_파일을_저장할_수_없습니다___파일_저장_중_오류.png` | #49, #50 | user-action |
| `M052_일반호흡_데이터는_최대_10개까지_저장됩니다.png` | #52, #53 | user-action |
| `M054_DIBH_데이터는_최대_10개까지_저장됩니다.png` | #54, #55 | user-action |
| `M056_CSV_또는_VXP만_업로드할_수_있습니다.png` | #56, #57 | user-action |
| `M060b_삭제_실패___파일_삭제_중_오류_(호흡_데이터_추가).png` | #60, #61 | induced-fault (database write) |
| `M062_환자를_찾을_수_없습니다.png` | #62, #63 | user-action |
| `M064_저장에_실패했습니다___환자_정보를_저장하는_중_오류.png` | #64, #65 | user-action |
| `M067_누락된_항목_안내.png` | #67, #80 | user-action |
| `M068_누락된_항목을_확인해_주세요.png` | #67, #68 | user-action |
| `M070_환자_정보_저장에_실패했습니다.png` | #51, #64, #70 | user-action |
| `M071b_파일_삭제_실패_(분석할_파일_선택).png` | #60, #61, #71 | induced-fault (database write) |
| `M072_분석_중_오류가_발생했습니다_(폴백).png` | #72 | induced-fault (message-less error) |
| `M073_일반호흡_파일을_찾을_수_없습니다.png` | #73 | user-action |
| `M074_DIBH_파일을_찾을_수_없습니다.png` | #74 | induced-fault (row removed after selection) |
| `M075_일반호흡_파일에_유효한_데이터가_없습니다.png` | #75 | user-action |
| `M076_DIBH_파일에_유효한_데이터가_없습니다.png` | #76 | user-action |
| `M077_VXP_파일에서_[Data]_섹션을_찾을_수_없습니다.png` | #77 | user-action |
| `M078c_파일_무결성_오류__저장된_이후_파일이_변경되었습니다.png` | #78 | induced-fault (contents re-encrypted, stored hash left stale) |
| `M080_생년월일을_확인해_주세요_예_19900512.png` | #80 | user-action |
| `M081_등록_전_확인_팝업_구분_주의.png` | #81 | user-action |
| `M082_파일명과_구분이_일치하지_않는_파일_경고.png` | #81, #82, #83 | user-action |

**합계: 53장 / 고유 메시지 76건**
