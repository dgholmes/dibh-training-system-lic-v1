# v1.1.7 오류 메시지 목록 및 실제조건 화면 캡처

- 대상: DIBH-Flow **v1.1.7** (versionCode 10107)
- 작성일: 2026-09-09
- 캡처 환경 ①: Chromium, **Galaxy Tab S6 세로(portrait)** — CSS 800×1280 / DPR 2 → **PNG 1600×2560**
- 캡처 환경 ②: **Android 에뮬레이터(Galaxy Tab S6, 세로)** — `adb exec-out screencap` → **PNG 1600×2560**
- 캡처 방식: **실제 화면·실제 컴포넌트**. `/debug/errors` 증적 하네스를 사용하지 않았습니다.

## 이 폴더의 구성

| 파일 | 내용 |
|---|---|
| `SI-07-오류메시지-전수목록.md` | v1.1.7 기준 메시지 전수 목록 (82건) |
| `screens/` | 실제조건 화면 캡처 PNG |
| `frame-index.md` | **파일 ↔ 메시지 대응표** — 각 PNG가 어떤 번호를 담고 있는지 |
| `capture-results.json` | 캡처 결과 원본 (검증 여부·기대 문구·획득 방식 포함) |

## 캡처 방법

`scripts/capture-real-conditions.mjs` 가 Chrome DevTools Protocol로 앱을 조작합니다.
각 항목은 **조작자가 실제로 하는 동작**을 그대로 수행하여 메시지를 발생시킵니다 —
문자열을 화면에 그려 넣는 방식이 아닙니다.

```bash
npm run dev                                  # 또는 preview 서버
node scripts/capture-real-conditions.mjs
```

- 전제 조건이 클릭만으로 도달하기 어려운 경우(계정 잠금 상태, 비밀번호 경과일)에는
  **상태만 미리 심고**, 메시지 자체는 앱의 원래 코드 경로가 생성합니다.
- 각 캡처는 **기대 문구가 실제로 화면에 있는지 확인한 뒤에만** `verified`로 기록됩니다.
  문구가 없으면 `MISS`로 남습니다 — 나타나지 않은 메시지의 스크린샷은 증적이 아니라
  오해의 소지이기 때문입니다.

## 캡처 결과 — 표시 가능 78건 중 **76건**

| 구분 | 건수 |
|---|---|
| 목록에 등재된 메시지 | 82 |
| 그중 **화면에 표시될 수 없음이 확인된 것** | 4 (#35, #36, #69, #79) |
| **실제 표시 가능한 메시지** | **78** |
| **실제조건 캡처를 확보한 메시지** | **76** |
| 미확보 | 2 (#58, #59) |
| PNG 파일 수 | 53 |

**한 장에 여러 메시지가 담기므로 파일 수(53)와 메시지 수(76)는 일치하지 않습니다.**
토스트는 제목과 설명이 각각 별개 항목이고, 시작 차단 화면은 제목·본문·상세 3건이
한 화면에 함께 나타납니다. 예를 들어 `M003…실기기.png` 한 장이 #3·#4·#13 을 담습니다.

어떤 파일이 어떤 번호를 담고 있는지는 `frame-index.md` 에 표로 정리되어 있으며,
미확보 항목은 `coverage.txt` 에 있습니다. 둘 다 각 프레임의 **화면 전체 텍스트**를
목록 문구와 대조하여 기계적으로 산출한 것입니다.

> **중복 정리 (2026-09-10)**: 재시도로 생긴 중복 2장과, **파일명이 실제로 담기지 않은
> 메시지를 가리키던 2장**을 제거했습니다. 후자는 `M025`(제출 전 화면이라 정책 오류 문구가
> 아직 없었음)와 `M040`(경고가 아니라 부족 상태였음)으로, 파일명만 보고 증적으로 쓰면
> 오해를 부를 수 있어 삭제하고 올바른 프레임에 그 이름을 부여했습니다.
> 제거 후에도 커버리지는 76건으로 변동 없습니다.

### 캡처 방식별 구분

`capture-results.json` 의 `method` 필드에 각 캡처의 획득 방식이 기록되어 있습니다.
증적으로서의 강도가 다르므로 구분해 두었습니다.

| method | 의미 | 강도 |
|---|---|---|
| `user-action` | 조작자와 동일한 조작으로 자연히 발생 | 가장 강함 |
| `seeded state` | 전제 상태(비밀번호 경과일, 감사 로그 적재량)를 미리 심고 앱이 판단 | 강함 |
| `real artefact + user action` | 실제 산출물(변조된 백업 파일)을 실제 조작으로 투입 | 강함 |
| `induced-fault (…)` | 하위 의존성(암호화·해시·DB 쓰기)을 실제로 실패시켜 앱이 오류를 일으키고 렌더링 | 보통 — 실패 원인은 인위적이나 메시지는 앱이 생성 |

**어떤 경우에도 문구를 화면에 그려 넣지 않았습니다.** 모든 프레임은 앱의 실제
컴포넌트가 실제로 렌더링한 결과이며, 기대 문구가 화면에 확인된 경우에만 파일로
남았습니다(미확인 프레임은 삭제, 시도 이력은 `capture-results.json` 에 보존).

### 미확보 2건

| # | 메시지 | 상태 |
|---|---|---|
| 58, 59 | 업로드 진행 중입니다 / 모든 파일 저장이 끝난 뒤 등록 완료를 눌러 주세요 | 저장이 진행 중인 동안 [등록 완료]를 눌러야 표시됩니다. 해시·암호화를 지연시켜 창을 확보하려 했으나 자동화로는 아직 타이밍을 잡지 못했습니다. **수동 조작이라면 큰 파일을 여러 개 올리고 곧바로 [등록 완료]를 누르는 것으로 쉽게 재현됩니다.** |

## 실기기(에뮬레이터) 캡처 — 시작 차단 화면 5건

브라우저에서 원리적으로 발생하지 않는 항목을 **Android 디버그 빌드**로 재현했습니다.
캡처는 `adb exec-out screencap` 이므로 상태표시줄을 포함한 **기기 화면 그대로**입니다.

| 파일 | 담긴 메시지 | 발생시킨 실제 조건 |
|---|---|---|
| `M001_암호화_키_오류_실기기.png` | #1 암호화 키 오류<br>#2 저장된 암호화 키를 복구할 수 없습니다… | 봉인된 설치 키(`dibh_install_key_v2`)를 복호화 불가능한 값으로 교체 후 재시작 |
| `M003_무결성_검사_실패_파일변조_실기기.png` | #3 무결성 검사 실패<br>#4 앱 파일의 무결성을 확인할 수 없습니다…<br>#13 무결성 검사 실패 (파일 변조 감지): `{파일}` | 빌드 후 `dist/assets/index-*.js` 에 1줄 추가하여 해시 불일치 유발 |
| `M011_무결성_매니페스트_로드불가_실기기.png` | #3, #4<br>#11 무결성 매니페스트를 로드할 수 없습니다 (integrity.json) | `dist/integrity.json` 삭제 후 APK 빌드 |
| `M012_무결성_검사_파일_로드_실패_실기기.png` | #3, #4<br>#12 무결성 검사 파일 로드 실패: `{파일}` | 매니페스트에 등재된 `dist/assets/web-*.js` 삭제 후 APK 빌드 |

`M001` 캡처에는 `secureKey.js` 가 던지는 **영문 상세 문구**
(`[secureKey] Stored key could not be unwrapped (null). …`)도 함께 담겨 있습니다.
목록 문서 1장에 기재한 미한글화 항목이며, 실제 화면에 표시됨이 확인되었습니다.

이 4장은 **DC-03 / SI-04 통제가 실기기에서 실제로 동작함**을 함께 보여줍니다 —
봉인 키를 복구할 수 없을 때 앱은 새 키를 만들지 않고 차단되며(fail-closed),
번들이 1줄이라도 바뀌면 시작이 차단됩니다.

### 재현 절차

```bash
# ① 암호화 키 오류 (#1, #2)
npm run cap:build && (cd android && ./gradlew assembleDebug)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
node scripts/capture-android-blocking.mjs keyerror

# ② 무결성 검사 실패 (#3, #4, #13) — 해시 불일치
npm run build
printf '\n// tampered\n' >> dist/assets/index-*.js     # 매니페스트 생성 '이후' 변조
npx cap sync android && (cd android && ./gradlew assembleDebug)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk && adb shell pm clear com.thepict.dibhtraining
node scripts/capture-android-blocking.mjs asis

# ③ 매니페스트 부재 (#11) — 위 ②에서 rm dist/integrity.json 으로 대체
# ④ 등재 파일 부재 (#12) — 위 ②에서 rm dist/assets/web-*.js 로 대체
```

> 마지막에 반드시 `npm run build && npx cap sync android` 로 **정상 번들을 복원**하십시오.

> **디버그 빌드를 사용한 이유**: WebView DevTools 접속(`adb forward`)이 필요하고,
> 무결성 검사는 `import.meta.env.PROD` 기준이므로 **디버그 APK에서도 웹 번들은 프로덕션
> 빌드**여서 검사가 그대로 수행됩니다. 즉 릴리즈와 동일한 코드 경로가 실행됩니다.

## WRONGKEY APK 에 대한 확인 결과

`dibh-Flow1.1.5_release_WRONGKEY.apk` 로는 위 무결성 화면을 재현할 수 **없습니다.**

```
$ adb install -r dibh-Flow1.1.5_release_WRONGKEY.apk
Failure [INSTALL_FAILED_VERSION_DOWNGRADE: Update version code 10105 is older than current 10106]
```

- 이 APK는 `CN=WRONG KEY - TEST ONLY - DO NOT SHIP` 인증서로 서명되어 있습니다.
- **서명 키가 다르면 Android 패키지 관리자가 설치 자체를 거부**합니다(동일 버전일 경우
  `INSTALL_FAILED_UPDATE_INCOMPATIBLE`). 앱이 실행되지 않으므로 앱 내부 메시지는 나올 수 없습니다.
- 앱의 무결성 검사는 **번들 자산의 SHA-256 을 `integrity.json` 과 대조**하는 것으로,
  APK 서명 키와는 무관합니다. 서명 키만 바꾼 APK는 (설치된다 하더라도) 무결성 검사를
  **통과**합니다.
- 따라서 WRONGKEY APK는 **서명 검증 증적**으로서는 유효하지만 SI-04 무결성 증적은 아니며,
  위 ②~④ 방식으로 번들을 변조해야 합니다.

## 기존 증적과의 관계

v1.1.6 시점에 취득한 증적은 그대로 유효하며, 본 폴더는 이를 대체하지 않습니다.

| 폴더 | 건수 | 방식 |
|---|---|---|
| `SI-07-error-messages/` | 41 | `/debug/errors` 하네스로 실제 컴포넌트 렌더링 |
| `SI-07-real-conditions/` | 16 | 실기기에서 실제 조건 유발 |
| `IA-04-password-cycle/` | 3 | 실기기 시계 기반 |
| **`v1.1.7-error-list/screens/`** | **57장 / 메시지 76건** | **실제 조건. 브라우저(Galaxy Tab S6 세로) + 실기기 에뮬레이터** |
