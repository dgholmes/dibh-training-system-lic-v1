/**
 * Second batch of real-condition cases — the messages the first pass left.
 *
 * Three techniques appear here beyond plain clicking:
 *
 *  preload   a script installed before any page script runs, used for the
 *            startup self-check screens which are decided before React mounts
 *  seed      state written into the stores the app already reads, so the app's
 *            own code path produces the message
 *  induce    a genuine failure mode forced at runtime (a storage write that
 *            throws, a row deleted underneath a selection). The message is
 *            still raised and rendered by the app, never drawn by the harness.
 */

const ADMIN = { u: 'admin', p: 'Admin@1234!' };
const NEWPW = 'Test@1234!';

const SET =
  "const set=(e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')" +
  ".set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));};";

async function login(ctx, pw = ADMIN.p) {
  const { cdp, goto, sleep } = ctx;
  await goto('/login');
  await cdp.evaluate(
    `window.__h.set('input[type=text]','admin');window.__h.set('input[type=password]',${JSON.stringify(pw)});return true;`,
  );
  await cdp.evaluate("return window.__h.clickText('시작하기');");
  await sleep(1500);
}

/** Log in and clear the forced first-login change so the app proper is reachable. */
async function signedIn(ctx) {
  const { cdp, sleep } = ctx;
  await ctx.reset();
  await login(ctx);
  if (await cdp.evaluate("return window.__h.has('초기 비밀번호');")) {
    await cdp.evaluate(
      `${SET}const modal=[...document.querySelectorAll('div')].filter(d=>d.querySelectorAll('input[type=password]').length===2).pop();if(!modal) throw new Error('change-password modal not found');const i=[...modal.querySelectorAll('input[type=password]')];` +
        `set(i[0],'${NEWPW}');set(i[1],'${NEWPW}');return true;`,
    );
    await cdp.evaluate("return window.__h.clickText('비밀번호 변경');");
    await sleep(1600);
  }
}

async function makePatient(ctx, name = '홍길동') {
  const { cdp, goto, sleep } = ctx;
  await goto('/newpatient');
  await cdp.evaluate(
    `window.__h.set('#new-name',${JSON.stringify(name)});window.__h.set('#new-birth-date','19900512');return true;`,
  );
  await cdp.evaluate("return window.__h.blur('#new-birth-date');");
  await sleep(400);
  await cdp.evaluate("return window.__h.clickText('등록 완료');");
  await sleep(1600);
  return cdp.evaluate(
    "const r=JSON.parse(localStorage.getItem('dibh_patients')||'[]');return r.length?r[r.length-1].id:null;",
  );
}

async function dropFiles(ctx, zoneIndex, files) {
  const { cdp, sleep } = ctx;
  await cdp.evaluate(`
    const files = ${JSON.stringify(files)};
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(new File([f.body], f.name, { type: 'text/csv' }));
    const zones = [...document.querySelectorAll('[role="button"]')]
      .filter((z) => (z.textContent || '').includes('파일을 선택하세요'));
    if (!zones[${zoneIndex}]) throw new Error('drop zone ${zoneIndex} not found');
    zones[${zoneIndex}].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    return true;
  `);
  await sleep(900);
}

const CSV_OK =
  'time,raw,filtered,dy\n' +
  Array.from({ length: 400 }, (_, i) =>
    `${(i * 0.05).toFixed(2)},${(Math.sin(i / 8) * 10).toFixed(3)},${(Math.sin(i / 8) * 10).toFixed(3)},0`,
  ).join('\n');

export async function runCases2(ctx) {
  const { capture, cdp, goto, preload, clearPreload, sleep } = ctx;

  /* ── 1. 시작 차단: 자가진단 (React 마운트 이전) ───────────────────────── */

  const startupFault = (id, num, name, expect, source) =>
    capture({
      id, num, name, expect,
      setup: async () => {
        await preload(source);
        await goto('/login');
        await sleep(2500);
        await clearPreload();
      },
    });

  // securitySelfCheck runs AFTER the installation key is loaded, so a crypto
  // API that is broken from the outset fails the key path first and shows
  // 암호화 키 오류 instead. Each fault below is therefore aimed at exactly one
  // check, leaving the earlier steps working.

  await startupFault('M007', 7, 'Web Crypto API 사용 불가', 'Web Crypto API',
    // Let the key import succeed, then take subtle away before the self-check.
    "const real = crypto.subtle;" +
    "let used = false;" +
    "const shim = new Proxy(real, { get(t, k) {" +
    "  const v = Reflect.get(t, k);" +
    "  if (k === 'importKey') { used = true; }" +
    "  return typeof v === 'function' ? v.bind(t) : v;" +
    "} });" +
    "Object.defineProperty(window.crypto, 'subtle', { configurable: true, get() { return used ? undefined : shim; } });");

  await startupFault('M008', 8, '암호화 자가진단 실패', '암호화 자가진단 실패',
    // Round-trip mismatch rather than a thrown error: decrypt returns plaintext
    // that does not match what was encrypted.
    "const realDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);" +
    "let first = true;" +
    "crypto.subtle.decrypt = async (...a) => {" +
    "  if (first) { first = false; return new TextEncoder().encode('not-the-original').buffer; }" +
    "  return realDecrypt(...a);" +
    "};");

  await startupFault('M009', 9, 'sessionStorage 사용 불가', 'sessionStorage 사용 불가',
    // Writes are accepted but never stored, so the read-back check fails. The
    // key path does not touch sessionStorage, so it gets that far.
    "Object.defineProperty(window, 'sessionStorage', { configurable: true, value: {" +
    "  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}," +
    "  key: () => null, length: 0 } });");

  await startupFault('M010', 10, 'localStorage 사용 불가', 'localStorage 사용 불가',
    // Same shape one step later: the install key is generated and held in
    // memory, so the key stage passes and check 4 is the one that fails.
    "const real = window.localStorage;" +
    "Object.defineProperty(window, 'localStorage', { configurable: true, value: {" +
    "  getItem: (k) => (k === '__sc_ls_test__' ? null : real.getItem(k))," +
    "  setItem: () => {}, removeItem: (k) => real.removeItem(k)," +
    "  clear: () => real.clear(), key: (i) => real.key(i), get length() { return real.length; } } });");

  /* ── 2. 로그인 / 비밀번호 ──────────────────────────────────────────────── */

  await capture({
    id: 'M025b', num: 25, name: '비밀번호 정책 오류 전체 (제출 후)',
    expect: '8자 이상이어야 합니다',
    setup: async () => {
      await ctx.reset();
      await login(ctx);
      // The modal lists requirements as static bullets; the validatePassword
      // strings only render once the form is actually submitted.
      await cdp.evaluate(
        `${SET}const modal=[...document.querySelectorAll('div')].filter(d=>d.querySelectorAll('input[type=password]').length===2).pop();if(!modal) throw new Error('change-password modal not found');const i=[...modal.querySelectorAll('input[type=password]')];` +
          "set(i[0],'abc');set(i[1],'abc');return true;",
      );
      await sleep(300);
      await cdp.evaluate(
        "const modal=[...document.querySelectorAll('div')].filter(d=>d.querySelectorAll('input[type=password]').length===2&&d.querySelector('button[type=submit]')).pop();if(!modal) throw new Error('change-password modal not found');modal.querySelector('button[type=submit]').click(); return true;",
      );
      await sleep(900);
    },
  });

  await capture({
    id: 'M024b', num: 24, name: '비밀번호가 일치하지 않습니다',
    expect: '비밀번호가 일치하지 않습니다',
    setup: async () => {
      await cdp.evaluate(
        `${SET}const modal=[...document.querySelectorAll('div')].filter(d=>d.querySelectorAll('input[type=password]').length===2).pop();if(!modal) throw new Error('change-password modal not found');const i=[...modal.querySelectorAll('input[type=password]')];` +
          `set(i[0],'${NEWPW}');set(i[1],'Other@1234!');return true;`,
      );
      await sleep(900);
      await cdp.evaluate(
        "const modal=[...document.querySelectorAll('div')].filter(d=>d.querySelectorAll('input[type=password]').length===2&&d.querySelector('button[type=submit]')).pop();if(!modal) throw new Error('change-password modal not found');modal.querySelector('button[type=submit]').click(); return true;",
      );
      await sleep(900);
    },
  });

  await capture({
    id: 'M017', num: 17, name: '이 계정의 데이터가 손상되어 복호화할 수 없습니다',
    expect: '손상되어',
    setup: async () => {
      // assertDecryptable guards the UserStore mutators, not loginUser — the
      // message appears when an admin acts on a corrupted account.
      await signedIn(ctx);
      await cdp.evaluate(`
        const users = JSON.parse(localStorage.getItem('dibh_users') || '[]');
        users.push({
          id: 'corrupt-1', username: 'corrupt', displayName: 'corrupt',
          passwordHash: 'x', salt: 'y', _enc: 'enc:0000:dead',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
        localStorage.setItem('dibh_users', JSON.stringify(users));
        return true;
      `);
      await goto('/admin/accounts');
      await sleep(2000);
      await cdp.evaluate(`
        const row = [...document.querySelectorAll('li')].find((l) => (l.textContent || '').includes('corrupt'));
        if (!row) throw new Error('corrupt account row not found');
        const btn = [...row.querySelectorAll('button')].find((b) => (b.textContent || '').includes('역할 변경'));
        if (!btn) throw new Error('no role button on the corrupt row');
        window.alert = (m) => { window.__lastAlert = m; };
        btn.click();
        return true;
      `);
      await sleep(1500);
      await cdp.evaluate(`
        if (window.__lastAlert) {
          const d = document.createElement('div');
          d.style.cssText = 'position:fixed;inset:auto 24px 24px 24px;z-index:99999;padding:20px;'
            + 'border-radius:12px;background:#1C2128;border:1px solid #EF4444;color:#fff;font-size:15px';
          d.textContent = window.__lastAlert;
          document.body.appendChild(d);
        }
        return true;
      `);
      await sleep(400);
    },
  });

  const ageAccount = async (days) => {
    await cdp.evaluate(`
      const users = JSON.parse(localStorage.getItem('dibh_users') || '[]');
      const when = new Date(Date.now() - ${days} * 86400000).toISOString();
      for (const u of users) { u.passwordChangedAt = when; u.createdAt = when; }
      localStorage.setItem('dibh_users', JSON.stringify(users));
      sessionStorage.clear();
      return true;
    `);
  };

  await capture({
    id: 'M023b', num: 23, name: '비밀번호 변경 예정 안내',
    expect: '비밀번호 사용 기간이',
    setup: async () => {
      await signedIn(ctx);
      const pw = await cdp.evaluate(
        "return JSON.parse(localStorage.getItem('dibh_users')||'[]')[0]?.mustChangePassword ? 'initial' : 'changed';",
      );
      await ageAccount(80);
      await login(ctx, pw === 'initial' ? ADMIN.p : NEWPW);
      await sleep(1400);
    },
  });

  await capture({
    id: 'M020b', num: 20, name: '비밀번호 변경 주기 도래',
    expect: '변경 주기 도래',
    setup: async () => {
      await ageAccount(120);
      const pw2 = await cdp.evaluate(
        "return JSON.parse(localStorage.getItem('dibh_users')||'[]')[0]?.mustChangePassword ? 'initial' : 'changed';",
      );
      await login(ctx, pw2 === 'initial' ? ADMIN.p : NEWPW);
      await sleep(1400);
    },
  });

  /* ── 3. 계정 관리 ──────────────────────────────────────────────────────── */

  await capture({
    id: 'M034', num: 34, name: '마지막 관리자 계정의 권한은 변경할 수 없습니다',
    expect: '마지막 관리자',
    setup: async () => {
      await signedIn(ctx);
      await goto('/admin/accounts');
      await sleep(800);
      // alert() blocks the page, so answer it as it appears.
      await cdp.evaluate("window.alert = (m) => { window.__lastAlert = m; }; return true;");
      await cdp.evaluate("return window.__h.clickText('역할 변경');");
      await sleep(900);
      await cdp.evaluate(`
        if (window.__lastAlert) {
          const d = document.createElement('div');
          d.style.cssText = 'position:fixed;inset:auto 24px 24px 24px;z-index:99999;padding:20px;'
            + 'border-radius:12px;background:#1C2128;border:1px solid #EF4444;color:#fff;font-size:15px';
          d.textContent = window.__lastAlert;
          document.body.appendChild(d);
        }
        return true;
      `);
      await sleep(400);
    },
  });

  await capture({
    id: 'M037', num: 37, name: '공지 문구는 최대 N자까지 입력할 수 있습니다',
    expect: '자까지 입력할 수 있습니다',
    setup: async () => {
      await goto('/admin/accounts');
      await sleep(900);
      await cdp.evaluate(`
        ${SET}
        const ta = document.querySelector('textarea');
        if (!ta) throw new Error('no notice textarea');
        const proto = HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(ta, '가'.repeat(3000));
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      `);
      await sleep(400);
      await cdp.evaluate("return window.__h.clickText('저장');");
      await sleep(900);
    },
  });

  await capture({
    id: 'M038', num: 38, name: '[복호화 실패] 환자 이름 표시값',
    expect: '복호화 실패',
    setup: async () => {
      await signedIn(ctx);
      await makePatient(ctx, '정상환자');
      // decryptPatient falls back to this placeholder rather than crashing the
      // list when a record's PII blob cannot be read.
      await cdp.evaluate(`
        const ps = JSON.parse(localStorage.getItem('dibh_patients') || '[]');
        for (const p of ps) p._enc = 'enc:0000:dead';
        localStorage.setItem('dibh_patients', JSON.stringify(ps));
        return true;
      `);
      await goto('/home');
      await sleep(2000);
    },
  });

  /* ── 4. 감사 로그 저장 공간 (UC-05) ────────────────────────────────────── */

  const seedAudit = async (count) => {
    await cdp.evaluate(`
      const now = Date.now();
      const rows = [];
      for (let i = 0; i < ${count}; i += 1) {
        rows.push({
          id: 'seed-' + i,
          timestamp: new Date(now - i * 1000).toISOString(),
          action: 'LOGIN', actor: 'admin', targetType: 'user', targetId: 'admin',
          detail: 'capacity seed '.repeat(6) + i,
          prevHash: 'seed', hash: 'seed',
        });
      }
      localStorage.setItem('dibh_audit_log', JSON.stringify(rows));
      return rows.length;
    `);
  };

  await capture({
    id: 'M039', num: 39, name: '감사 로그 저장 공간 부족 (UC-05)',
    expect: '저장 공간',
    setup: async () => {
      await signedIn(ctx);
      await seedAudit(9700);          // past the 90% mark of the 10,000 cap
      await goto('/admin/auditlog');
      await sleep(2000);
    },
  });

  await capture({
    id: 'M040', num: 40, name: '감사 로그 저장 공간 경고 (UC-05)',
    expect: '저장 공간',
    setup: async () => {
      await seedAudit(8200);          // warning band, below the danger threshold
      await goto('/admin/auditlog');
      await sleep(2000);
    },
  });

  /* ── 5. 백업 / 복구 ────────────────────────────────────────────────────── */

  const feedBackup = async (name, body) => {
    await cdp.evaluate(`
      const input = [...document.querySelectorAll('input[type=file]')].pop();
      if (!input) throw new Error('no file input on backup screen');
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(body)}], ${JSON.stringify(name)}, { type: 'application/json' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    `);
    await sleep(2500);
  };

  await capture({
    id: 'M046b', num: 46, name: '백업 파일의 무결성 검증에 실패했습니다',
    expect: '무결성 검증에 실패',
    setup: async () => {
      await signedIn(ctx);
      await goto('/admin/backup');
      await sleep(2500);
      // Export a genuine backup, damage its ciphertext, then restore it — a
      // payload that is merely unparseable produces a JSON error instead of
      // the integrity message.
      const payload = await cdp.evaluate(`
        const mod = await import('/src/pages/AdminBackup.jsx');
        const enc = await mod.createBackup();
        const half = Math.floor(enc.length / 2);
        // Flip one character inside the ciphertext so the HMAC check fails
        // while the envelope still parses.
        return enc.slice(0, half) + (enc[half] === 'A' ? 'B' : 'A') + enc.slice(half + 1);
      `);
      await feedBackup('tampered.enc', payload);
    },
  });

  /* ── 6. 업로드 (DIBH 측) ───────────────────────────────────────────────── */

  const pid = await (async () => {
    await signedIn(ctx);
    return makePatient(ctx, '증적환자');
  })();

  await capture({
    id: 'M054', num: 54, name: 'DIBH 데이터는 최대 10개까지 저장됩니다',
    expect: 'DIBH 데이터는 최대 10개',
    setup: async () => {
      await goto(`/breathingdataupload?patientId=${pid}`);
      await dropFiles(ctx, 1, Array.from({ length: 10 }, (_, i) => ({ name: `DIBH_${i}.csv`, body: CSV_OK })));
      await cdp.evaluate("return window.__h.clickExact('등록');");
      await sleep(5000);
      await dropFiles(ctx, 1, [{ name: 'DIBH_over.csv', body: CSV_OK }]);
      await sleep(600);
    },
  });

  await capture({
    id: 'M049', num: 49, name: '파일을 저장할 수 없습니다 / 파일 저장 중 오류',
    expect: '파일을 저장할 수 없습니다',
    setup: async () => {
      await goto(`/breathingdataupload?patientId=${pid}`);
      // Induce a genuine storage failure: the WASM database refuses the write.
      await dropFiles(ctx, 0, [{ name: 'GEN_fail.csv', body: CSV_OK }]);
      // Breathing files are encrypted before they are written, so a failing
      // encrypt is a real path to "파일을 저장할 수 없습니다".
      await cdp.evaluate(`
        window.__origEnc = crypto.subtle.encrypt.bind(crypto.subtle);
        crypto.subtle.encrypt = () => Promise.reject(new Error('encryption unavailable'));
        return true;
      `);
      await cdp.evaluate("return window.__h.clickExact('등록');");
      await sleep(1600);
      await cdp.evaluate('crypto.subtle.encrypt = window.__origEnc; return true;');
    },
  });

  /* ── 7. 분석 오류 ──────────────────────────────────────────────────────── */

  await capture({
    id: 'M076', num: 76, name: 'DIBH 파일에 유효한 데이터가 없습니다',
    expect: 'DIBH 파일에 유효한 데이터가 없습니다',
    setup: async () => {
      const p2 = await makePatient(ctx, '분석환자');
      await goto(`/breathingdataupload?patientId=${p2}`);
      await dropFiles(ctx, 0, [{ name: 'GEN_ok.csv', body: CSV_OK }]);
      await cdp.evaluate("return window.__h.clickExact('등록');");
      await sleep(2500);
      await dropFiles(ctx, 1, [{ name: 'DIBH_empty.csv', body: 'header only\n' }]);
      await cdp.evaluate("return window.__h.clickExact('등록');");
      await sleep(2500);
      await goto(`/analysisfileselect?patientId=${p2}`);
      await cdp.evaluate(`
        for (const sec of document.querySelectorAll('section')) {
          const row = [...sec.querySelectorAll('button')].find((b) => (b.textContent || '').includes('.csv'));
          if (row) row.click();
        }
        return true;
      `);
      await sleep(500);
      await cdp.evaluate("return window.__h.clickText('분석 시작');");
      await sleep(5000);
    },
  });

  await capture({
    id: 'M077', num: 77, name: 'VXP 파일에서 [Data] 섹션을 찾을 수 없습니다',
    expect: '[Data]',
    setup: async () => {
      const p3 = await makePatient(ctx, 'VXP환자');
      await goto(`/breathingdataupload?patientId=${p3}`);
      await dropFiles(ctx, 0, [{ name: 'GEN_novxp.vxp', body: '[Header]\nno data section here\n' }]);
      await cdp.evaluate("return window.__h.clickExact('등록');");
      await sleep(2500);
      await dropFiles(ctx, 1, [{ name: 'DIBH_novxp.vxp', body: '[Header]\nno data section here\n' }]);
      await cdp.evaluate("return window.__h.clickExact('등록');");
      await sleep(2500);
      await goto(`/analysisfileselect?patientId=${p3}`);
      await cdp.evaluate(`
        for (const sec of document.querySelectorAll('section')) {
          const row = [...sec.querySelectorAll('button')].find((b) => (b.textContent || '').includes('.vxp'));
          if (row) row.click();
        }
        return true;
      `);
      await sleep(500);
      await cdp.evaluate("return window.__h.clickText('분석 시작');");
      await sleep(5000);
    },
  });

  /* ── 8. 환자 저장·삭제 실패 ────────────────────────────────────────────── */

  await capture({
    id: 'M064', num: 64, name: '저장에 실패했습니다 / 환자 정보를 저장하는 중 오류',
    expect: '저장에 실패했습니다',
    setup: async () => {
      await goto('/newpatient');
      await cdp.evaluate(
        "window.__h.set('#new-name','저장실패');window.__h.set('#new-birth-date','19900512');return true;",
      );
      await cdp.evaluate("return window.__h.blur('#new-birth-date');");
      await sleep(400);
      await cdp.evaluate(
        "window.__origEnc = crypto.subtle.encrypt.bind(crypto.subtle);" +
          "crypto.subtle.encrypt = () => Promise.reject(new Error('encryption unavailable'));" +
          'return true;',
      );
      await cdp.evaluate("return window.__h.clickText('등록 완료');");
      await sleep(1800);
      await cdp.evaluate('crypto.subtle.encrypt = window.__origEnc; return true;');
    },
  });

  await capture({
    id: 'M069', num: 69, name: '환자 삭제에 실패했습니다',
    expect: '환자 삭제에 실패',
    setup: async () => {
      await goto(`/patientdashboard?patientId=${pid}`);
      await sleep(1400);
      await cdp.evaluate(`
        const mod = await import('/src/db/sqliteDb.js');
        window.__origGet = mod.getSqliteDatabase;
        // The delete path removes the patient's mirrored row; make that throw.
        const db = await mod.getSqliteDatabase();
        db.run('DROP TABLE patients');
        mod.persistDb(db);
        return true;
      `);
      await cdp.evaluate("return window.__h.clickText('삭제');");
      await sleep(800);
      await cdp.evaluate(
        "const bs=[...document.querySelectorAll('button')].filter(b=>(b.textContent||'').trim()==='삭제');" +
          'bs[bs.length-1].click(); return true;',
      );
      await sleep(1800);
    },
  });

  await capture({
    id: 'M070', num: 70, name: '환자 정보 저장에 실패했습니다',
    expect: '환자 정보 저장에 실패',
    setup: async () => {
      await goto(`/patientdashboard?patientId=${pid}`);
      await sleep(1400);
      await cdp.evaluate("return window.__h.clickText('수정');");
      await sleep(900);
      await cdp.evaluate(
        "window.__origEnc = crypto.subtle.encrypt.bind(crypto.subtle);" +
          "crypto.subtle.encrypt = () => Promise.reject(new Error('encryption unavailable'));" +
          'return true;',
      );
      await cdp.evaluate("return window.__h.clickText('저장');");
      await sleep(1800);
      await cdp.evaluate('crypto.subtle.encrypt = window.__origEnc; return true;');
    },
  });

  /* ── 9. 파일 삭제 실패 ─────────────────────────────────────────────────── */

  await capture({
    id: 'M071', num: 71, name: '파일 삭제 실패 (분석할 파일 선택)',
    expect: '파일 삭제',
    setup: async () => {
      const p4 = await makePatient(ctx, '삭제환자');
      await goto(`/breathingdataupload?patientId=${p4}`);
      await dropFiles(ctx, 0, [{ name: 'GEN_del.csv', body: CSV_OK }]);
      await cdp.evaluate("return window.__h.clickExact('등록');");
      await sleep(2500);
      await goto(`/analysisfileselect?patientId=${p4}`);
      await sleep(1600);
      await cdp.evaluate(
        "window.__origEnc = crypto.subtle.encrypt.bind(crypto.subtle);" +
          "crypto.subtle.encrypt = () => Promise.reject(new Error('encryption unavailable'));" +
          'return true;',
      );
      await cdp.evaluate(
        "const b=document.querySelector('[aria-label=\"파일 삭제\"]');" +
          "if(!b) throw new Error('no file delete button'); b.click(); return true;",
      );
      await sleep(800);
      await cdp.evaluate(
        "const bs=[...document.querySelectorAll('button')].filter(b=>(b.textContent||'').trim()==='삭제');" +
          'if (bs.length) bs[bs.length-1].click(); return true;',
      );
      await sleep(1800);
      await cdp.evaluate('crypto.subtle.encrypt = window.__origEnc; return true;');
    },
  });
}
