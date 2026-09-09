/**
 * The cases driven by capture-real-conditions.mjs.
 *
 * Each entry reaches a message the way an operator would. Where a precondition is
 * expensive to reach by clicking (an account already locked out, an audit log near
 * capacity), the state is seeded first and the message is still produced by the
 * app's own code path — never by rendering the string directly.
 */

const ADMIN = { u: 'admin', p: 'Admin@1234!' };
const NEWPW = 'Test@1234!';

/** Log in and clear the forced first-login password change. */
async function signIn({ cdp, goto, sleep }, { pw = ADMIN.p, newPw = NEWPW } = {}) {
  await goto('/login');
  await cdp.evaluate(`
    window.__h.set('input[type=text]', ${JSON.stringify(ADMIN.u)});
    window.__h.set('input[type=password]', ${JSON.stringify(pw)});
    return true;
  `);
  await cdp.evaluate(`return window.__h.clickText('시작하기');`);
  await sleep(1200);
  // First run forces a change; satisfy it so later cases start from the app proper.
  const forced = await cdp.evaluate(`return window.__h.has('초기 비밀번호');`);
  if (forced) {
    await cdp.evaluate(`
      const modal=[...document.querySelectorAll('div')].find(d=>(d.textContent||'').includes('새 비밀번호 확인')&&d.querySelectorAll('input[type=password]').length>=2);if(!modal) throw new Error('change-password modal not found');const inputs=[...modal.querySelectorAll('input[type=password]')];
      const set = (el, v) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(inputs[0], ${JSON.stringify(newPw)});
      set(inputs[1], ${JSON.stringify(newPw)});
      return true;
    `);
    await cdp.evaluate(`return window.__h.clickText('비밀번호 변경');`);
    await sleep(1400);
  }
}

/** Create one patient through the real registration form; returns its id. */
async function makePatient(ctx, name = '홍길동', birth = '19900512') {
  const { cdp, goto, sleep } = ctx;
  await goto('/newpatient');
  await cdp.evaluate(`
    window.__h.set('#new-name', ${JSON.stringify(name)});
    window.__h.set('#new-birth-date', ${JSON.stringify(birth)});
    window.__h.blur('#new-birth-date');
    return true;
  `);
  await sleep(400);
  await cdp.evaluate(`return window.__h.clickText('등록 완료');`);
  await sleep(1500);
  return cdp.evaluate(`
    const raw = JSON.parse(localStorage.getItem('dibh_patients') || '[]');
    return raw.length ? raw[raw.length - 1].id : null;
  `);
}

/** Drop files onto a category drop zone by dispatching a real DataTransfer drop. */
async function dropFiles(ctx, zoneIndex, files) {
  const { cdp, sleep } = ctx;
  const spec = JSON.stringify(files);
  await cdp.evaluate(`
    const files = ${spec};
    const dt = new DataTransfer();
    for (const f of files) {
      dt.items.add(new File([f.body], f.name, { type: 'text/csv' }));
    }
    const zones = [...document.querySelectorAll('[role="button"]')]
      .filter((z) => (z.textContent || '').includes('파일을 선택하세요'));
    const zone = zones[${zoneIndex}];
    if (!zone) throw new Error('drop zone ${zoneIndex} not found');
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    return true;
  `);
  await sleep(900);
}

const CSV_OK = 'time,raw,filtered,dy\n' +
  Array.from({ length: 400 }, (_, i) =>
    `${(i * 0.05).toFixed(2)},${(Math.sin(i / 8) * 10).toFixed(3)},${(Math.sin(i / 8) * 10).toFixed(3)},0`).join('\n');

export async function runCases(ctx) {
  const { capture, cdp, goto, reset, sleep } = ctx;

  /* ── 2. 로그인 및 비밀번호 ─────────────────────────────────────────────── */

  await capture({
    id: 'M014', num: 14, name: '아이디 또는 비밀번호가 올바르지 않습니다 (남은 시도)',
    expect: '남은 시도',
    setup: async () => {
      await reset();
      await cdp.evaluate(`
        window.__h.set('input[type=text]', 'admin');
        window.__h.set('input[type=password]', 'WrongPass@1');
        return true;
      `);
      await cdp.evaluate(`return window.__h.clickText('시작하기');`);
      await sleep(1200);
    },
  });

  await capture({
    id: 'M015', num: 15, name: '로그인 시도 횟수를 초과하여 계정이 잠금되었습니다',
    expect: '잠금',
    setup: async () => {
      for (let i = 0; i < 4; i += 1) {
        await cdp.evaluate(`
          window.__h.set('input[type=text]', 'admin');
          window.__h.set('input[type=password]', 'WrongPass@' + ${i});
          return true;
        `);
        await cdp.evaluate(`return window.__h.clickText('시작하기');`);
        await sleep(900);
      }
    },
  });

  await capture({
    id: 'M016', num: 16, name: '계정이 잠금되었습니다 약 N분 후 다시 시도',
    expect: '분 후 다시 시도',
    setup: async () => {
      // The account is already locked from M015; a further correct attempt shows
      // the remaining-time form of the message.
      await cdp.evaluate(`
        window.__h.set('input[type=text]', 'admin');
        window.__h.set('input[type=password]', ${JSON.stringify(ADMIN.p)});
        return true;
      `);
      await cdp.evaluate(`return window.__h.clickText('시작하기');`);
      await sleep(1200);
    },
  });

  await capture({
    id: 'M018', num: 18, name: '초기 비밀번호 변경 필요',
    expect: '초기 비밀번호',
    setup: async () => {
      await reset();
      await cdp.evaluate(`
        window.__h.set('input[type=text]', 'admin');
        window.__h.set('input[type=password]', ${JSON.stringify(ADMIN.p)});
        return true;
      `);
      await cdp.evaluate(`return window.__h.clickText('시작하기');`);
      await sleep(1400);
    },
  });

  await capture({
    id: 'M025', num: 25, name: '비밀번호 정책 오류 (8자 대문자 소문자 숫자 특수문자)',
    expect: '8자 이상',
    setup: async () => {
      // Still on the forced-change modal from M018.
      await cdp.evaluate(`
        const modal=[...document.querySelectorAll('div')].find(d=>(d.textContent||'').includes('새 비밀번호 확인')&&d.querySelectorAll('input[type=password]').length>=2);if(!modal) throw new Error('change-password modal not found');const inputs=[...modal.querySelectorAll('input[type=password]')];
        const set = (el, v) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        set(inputs[0], 'abc');
        set(inputs[1], 'abc');
        return true;
      `);
      await sleep(600);
    },
  });

  await capture({
    id: 'M024', num: 24, name: '비밀번호가 일치하지 않습니다',
    expect: '일치하지 않습니다',
    setup: async () => {
      await cdp.evaluate(`
        const modal=[...document.querySelectorAll('div')].find(d=>(d.textContent||'').includes('새 비밀번호 확인')&&d.querySelectorAll('input[type=password]').length>=2);if(!modal) throw new Error('change-password modal not found');const inputs=[...modal.querySelectorAll('input[type=password]')];
        const set = (el, v) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        set(inputs[0], 'Test@1234!');
        set(inputs[1], 'Other@1234!');
        return true;
      `);
      await sleep(400);
      await cdp.evaluate(`
        const form = document.querySelector('form');
        const btn = [...document.querySelectorAll('button[type=submit]')].pop();
        if (btn) btn.click(); else form.requestSubmit();
        return true;
      `);
      await sleep(900);
    },
  });

  /* ── 7. 신규 환자 등록 ─────────────────────────────────────────────────── */

  await capture({
    id: 'M067', num: 67, name: '누락된 항목 안내',
    expect: '누락된 항목',
    setup: async () => {
      await reset();
      await signIn(ctx);
      await goto('/newpatient');
      await cdp.evaluate(`return window.__h.clickText('등록 완료');`);
      await sleep(900);
    },
  });

  /* ── 10. v1.1.7 신규 — 생년월일 검증 ───────────────────────────────────── */

  await capture({
    id: 'M080', num: 80, name: '생년월일을 확인해 주세요 예 19900512',
    expect: '생년월일을 확인해 주세요',
    setup: async () => {
      await goto('/newpatient');
      await cdp.evaluate(`
        window.__h.set('#new-birth-date', '19900231');
        return true;
      `);
      await cdp.evaluate(`return window.__h.blur('#new-birth-date');`);
      await sleep(700);
    },
  });

  /* ── 6. 호흡 데이터 업로드 ─────────────────────────────────────────────── */

  const patientId = await makePatient(ctx);

  await capture({
    id: 'M056', num: 56, name: 'CSV 또는 VXP만 업로드할 수 있습니다',
    expect: 'CSV 또는 VXP',
    setup: async () => {
      await goto(`/breathingdataupload?patientId=${patientId}`);
      await dropFiles(ctx, 0, [{ name: 'notes.txt', body: 'not a breathing file' }]);
    },
  });

  /* ── 10. v1.1.7 신규 — 업로드 구분 확인 ────────────────────────────────── */

  await capture({
    id: 'M081', num: 81, name: '등록 전 확인 팝업 구분 주의',
    expect: '구분을 잘못 지정하면',
    setup: async () => {
      await goto(`/breathingdataupload?patientId=${patientId}`);
      await dropFiles(ctx, 0, [{ name: 'TYPE_A_GEN_20260508.csv', body: CSV_OK }]);
    },
  });

  await capture({
    id: 'M082', num: 82, name: '파일명과 구분이 일치하지 않는 파일 경고',
    expect: '일치하지 않는 파일이',
    setup: async () => {
      await cdp.evaluate(`return window.__h.clickText('취소');`);
      await sleep(500);
      // A DIBH-named file dropped on the 일반호흡 zone — the mismatch case.
      await dropFiles(ctx, 0, [{ name: 'TYPE_A_DIBH_20260508.csv', body: CSV_OK }]);
    },
  });

  /* ── 9. 분석 오류 ──────────────────────────────────────────────────────── */

  await capture({
    id: 'M075', num: 75, name: '일반호흡 파일에 유효한 데이터가 없습니다',
    expect: '유효한 데이터가 없습니다',
    setup: async () => {
      await goto(`/breathingdataupload?patientId=${patientId}`);
      // Two files with no parseable rows, one per category.
      await dropFiles(ctx, 0, [{ name: 'GEN_empty.csv', body: 'header only\n' }]);
      await cdp.evaluate(`return window.__h.clickExact('등록');`);
      await sleep(1200);
      await dropFiles(ctx, 1, [{ name: 'DIBH_empty.csv', body: 'header only\n' }]);
      await cdp.evaluate(`return window.__h.clickExact('등록');`);
      await sleep(1200);
      await goto(`/analysisfileselect?patientId=${patientId}`);
      // File rows show the patient-name display form, so pick the first row in
      // each category section rather than matching the dropped filename.
      await cdp.evaluate(`
        const sections = [...document.querySelectorAll('section')];
        for (const sec of sections) {
          const row = [...sec.querySelectorAll('button')].find((b) => (b.textContent || '').includes('.csv'));
          if (row) row.click();
        }
        return true;
      `);
      await sleep(500);
      await cdp.evaluate(`return window.__h.clickText('분석 시작');`);
      await sleep(4000);
    },
  });

  /* ── 3. 계정 관리 ──────────────────────────────────────────────────────── */

  await capture({
    id: 'M030', num: 30, name: '아이디를 입력하세요',
    expect: '아이디를 입력하세요',
    setup: async () => {
      await goto('/admin/accounts');
      await cdp.evaluate(`return window.__h.clickText('계정 추가');`);
      await sleep(700);
      await cdp.evaluate(`return window.__h.clickText('생성');`);
      await sleep(700);
    },
  });

  await capture({
    id: 'M035', num: 35, name: '마지막 계정은 삭제할 수 없습니다',
    expect: '마지막 계정',
    setup: async () => {
      await goto('/admin/accounts');
      await sleep(600);
      await cdp.evaluate(`return window.__h.clickText('삭제');`);
      await sleep(700);
      await cdp.evaluate(`return window.__h.clickText('삭제');`);
      await sleep(900);
    },
  });


  /* ── seeded preconditions: IA-04 password age ──────────────────────────── */

  // The account record's passwordChangedAt is moved back in time, then a normal
  // login runs. The message is produced by loginUser's own age check.
  const ageAccount = async (daysAgo) => {
    await cdp.evaluate(`
      const users = JSON.parse(localStorage.getItem('dibh_users') || '[]');
      const when = new Date(Date.now() - ${'${daysAgo}'} * 86400000).toISOString();
      for (const u of users) { u.passwordChangedAt = when; }
      localStorage.setItem('dibh_users', JSON.stringify(users));
      sessionStorage.clear();
      return true;
    `.replace('${daysAgo}', String(daysAgo)));
  };

  await capture({
    id: 'M023', num: 23, name: '비밀번호 변경 예정 안내',
    expect: '비밀번호 사용 기간이',
    setup: async () => {
      await reset();
      await signIn(ctx);
      await ageAccount(80);            // inside the 14-day warning window
      await goto('/login');
      await cdp.evaluate(`
        window.__h.set('input[type=text]', 'admin');
        window.__h.set('input[type=password]', ${JSON.stringify(NEWPW)});
        return true;
      `);
      await cdp.evaluate(`return window.__h.clickText('시작하기');`);
      await sleep(1600);
    },
  });

  await capture({
    id: 'M020', num: 20, name: '비밀번호 변경 주기 도래',
    expect: '비밀번호 변경 주기 도래',
    setup: async () => {
      await ageAccount(100);           // past the 90-day maximum
      await goto('/login');
      await cdp.evaluate(`
        window.__h.set('input[type=text]', 'admin');
        window.__h.set('input[type=password]', ${JSON.stringify(NEWPW)});
        return true;
      `);
      await cdp.evaluate(`return window.__h.clickText('시작하기');`);
      await sleep(1600);
    },
  });

  /* ── 계정 관리 추가 ────────────────────────────────────────────────────── */

  await capture({
    id: 'M031', num: 31, name: '아이디는 영문 숫자 만 사용 가능하며 2~30자',
    expect: '2~30자',
    setup: async () => {
      await reset();
      await signIn(ctx);
      await goto('/admin/accounts');
      await cdp.evaluate(`return window.__h.clickText('계정 추가');`);
      await sleep(700);
      await cdp.evaluate(`
        const el = [...document.querySelectorAll('input')].find((i) => i.type === 'text');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, '한글아이디!!');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      `);
      await cdp.evaluate(`return window.__h.clickText('생성');`);
      await sleep(800);
    },
  });

  await capture({
    id: 'M032', num: 32, name: '이미 존재하는 아이디입니다',
    expect: '이미 존재하는',
    setup: async () => {
      await cdp.evaluate(`
        const el = [...document.querySelectorAll('input')].find((i) => i.type === 'text');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, 'admin');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        const pws = [...document.querySelectorAll('input[type=password]')];
        for (const pw of pws) {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(pw, 'Test@1234!');
          pw.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
      `);
      await sleep(300);
      await cdp.evaluate(`return window.__h.clickText('생성');`);
      await sleep(900);
    },
  });

  /* ── 업로드 한도 ───────────────────────────────────────────────────────── */

  await capture({
    id: 'M052', num: 52, name: '일반호흡 데이터는 최대 10개까지 저장됩니다',
    expect: '최대 10개까지',
    setup: async () => {
      await reset();
      await signIn(ctx);
      const pid = await makePatient(ctx, '한도환자');
      await goto(`/breathingdataupload?patientId=${pid}`);
      // Fill the category to its limit, then attempt one more.
      const batch = Array.from({ length: 10 }, (_, i) => ({ name: `GEN_${i}.csv`, body: CSV_OK }));
      await dropFiles(ctx, 0, batch);
      await cdp.evaluate(`return window.__h.clickExact('등록');`);
      await sleep(4000);
      await dropFiles(ctx, 0, [{ name: 'GEN_over.csv', body: CSV_OK }]);
      await sleep(600);
    },
  });

  /* ── 환자 조회 실패 ────────────────────────────────────────────────────── */

  await capture({
    id: 'M062', num: 62, name: '환자를 찾을 수 없습니다',
    expect: '환자를 찾을 수 없습니다',
    setup: async () => {
      await goto('/breathingdataupload?patientId=does-not-exist');
      await sleep(1500);
    },
  });

  // 시작 차단(암호화 키 오류)은 Android Keystore 경로에서만 발생하므로
  // 브라우저 실행에서는 다루지 않습니다 — scripts/capture-android-blocking.mjs 참조.

  /* ── 5. 백업 / 복구 ────────────────────────────────────────────────────── */

  await capture({
    id: 'M046', num: 46, name: '백업 파일의 무결성 검증에 실패했습니다',
    expect: '무결성 검증에 실패',
    setup: async () => {
      await goto('/admin/backup');
      await sleep(800);
      await cdp.evaluate(`
        const inputs = [...document.querySelectorAll('input[type=file]')];
        if (!inputs.length) throw new Error('no file input on backup screen');
        const dt = new DataTransfer();
        dt.items.add(new File(['not-a-valid-backup'], 'broken.dibhbak', { type: 'application/json' }));
        for (const input of inputs) {
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      `);
      await sleep(2000);
    },
  });
}
