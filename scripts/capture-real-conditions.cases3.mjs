/**
 * Third batch — the remainder, and the ones that turned out to need a specific
 * shape of failure rather than a generic one.
 */

const ADMIN = { u: 'admin', p: 'Admin@1234!' };
const NEWPW = 'Test@1234!';

const MODAL =
  "const modal=[...document.querySelectorAll('div')].filter(d=>d.querySelectorAll('input[type=password]').length===2).pop();" +
  "if(!modal) throw new Error('change-password modal not found');" +
  "const i=[...modal.querySelectorAll('input[type=password]')];" +
  "const set=(e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);" +
  "e.dispatchEvent(new Event('input',{bubbles:true}));};";

async function login(ctx, pw = ADMIN.p) {
  const { cdp, goto, sleep } = ctx;
  await goto('/login');
  await cdp.evaluate(
    `window.__h.set('input[type=text]','admin');window.__h.set('input[type=password]',${JSON.stringify(pw)});return true;`,
  );
  await cdp.evaluate("return window.__h.clickText('시작하기');");
  await sleep(1500);
}

async function signedIn(ctx) {
  const { cdp, sleep } = ctx;
  await ctx.reset();
  await login(ctx);
  if (await cdp.evaluate("return window.__h.has('초기 비밀번호');")) {
    await cdp.evaluate(`${MODAL}set(i[0],'${NEWPW}');set(i[1],'${NEWPW}');return true;`);
    await sleep(400);
    await cdp.evaluate(
      "const m=[...document.querySelectorAll('div')].filter(d=>d.querySelectorAll('input[type=password]').length===2&&d.querySelector('button[type=submit]')).pop();" +
        "m.querySelector('button[type=submit]').click(); return true;",
    );
    await sleep(1700);
  }
}

async function makePatient(ctx, name) {
  const { cdp, goto, sleep } = ctx;
  await goto('/newpatient');
  await cdp.evaluate(
    `window.__h.set('#new-name',${JSON.stringify(name)});window.__h.set('#new-birth-date','19900512');return true;`,
  );
  await cdp.evaluate("return window.__h.blur('#new-birth-date');");
  await sleep(400);
  await cdp.evaluate("return window.__h.clickText('등록 완료');");
  await sleep(1700);
  return cdp.evaluate(
    "const r=JSON.parse(localStorage.getItem('dibh_patients')||'[]');return r.length?r[r.length-1].id:null;",
  );
}

async function dropFiles(ctx, zone, files) {
  const { cdp, sleep } = ctx;
  await cdp.evaluate(`
    const dt = new DataTransfer();
    for (const f of ${JSON.stringify(files)}) dt.items.add(new File([f.body], f.name, { type: 'text/csv' }));
    const zones = [...document.querySelectorAll('[role="button"]')]
      .filter((z) => (z.textContent || '').includes('파일을 선택하세요'));
    if (!zones[${zone}]) throw new Error('drop zone ${zone} not found');
    zones[${zone}].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    return true;
  `);
  await sleep(900);
}

const CSV_OK =
  'time,raw,filtered,dy\n' +
  Array.from({ length: 400 }, (_, i) =>
    `${(i * 0.05).toFixed(2)},${(Math.sin(i / 8) * 10).toFixed(3)},${(Math.sin(i / 8) * 10).toFixed(3)},0`,
  ).join('\n');

/** Save one file for a patient and return once it is committed. */
async function saveOneFile(ctx, pid, zone, name) {
  const { cdp, goto, sleep } = ctx;
  await goto(`/breathingdataupload?patientId=${pid}`);
  await dropFiles(ctx, zone, [{ name, body: CSV_OK }]);
  await cdp.evaluate("return window.__h.clickExact('등록');");
  await sleep(2600);
}

export async function runCases3(ctx) {
  const { capture, cdp, goto, sleep } = ctx;

  /* ── #27 소문자 규칙만 위반 ────────────────────────────────────────────── */

  await capture({
    id: 'M027', num: 27, name: '소문자(a-z)를 포함해야 합니다',
    expect: '소문자(a-z)를 포함해야 합니다',
    setup: async () => {
      await ctx.reset();
      await login(ctx);
      // Everything except a lowercase letter, so this rule is the one that fails.
      await cdp.evaluate(`${MODAL}set(i[0],'ABCD1234!');set(i[1],'ABCD1234!');return true;`);
      await sleep(500);
      await cdp.evaluate(
        "const m=[...document.querySelectorAll('div')].filter(d=>d.querySelectorAll('input[type=password]').length===2&&d.querySelector('button[type=submit]')).pop();" +
          "m.querySelector('button[type=submit]').click(); return true;",
      );
      await sleep(900);
    },
  });

  /* ── #68 누락된 항목을 확인해 주세요 ───────────────────────────────────── */

  await capture({
    id: 'M068', num: 68, name: '누락된 항목을 확인해 주세요',
    expect: '누락된 항목을 확인해 주세요',
    setup: async () => {
      await signedIn(ctx);
      await goto('/newpatient');
      // The generic line shows when the modal is open with no field flagged —
      // reachable by clearing the flags while the dialog is up.
      await cdp.evaluate("return window.__h.clickText('등록 완료');");
      await sleep(700);
      await cdp.evaluate(
        "window.__h.set('#new-name','이름있음');window.__h.set('#new-birth-date','19900512');return true;",
      );
      await cdp.evaluate("return window.__h.blur('#new-birth-date');");
      await sleep(700);
    },
  });

  /* ── #33 / #36 계정 관리 실패 ──────────────────────────────────────────── */

  await capture({
    id: 'M033', num: 33, name: '사용자를 찾을 수 없습니다',
    expect: '사용자를 찾을 수 없습니다',
    setup: async () => {
      await signedIn(ctx);
      await cdp.evaluate(`
        const users = JSON.parse(localStorage.getItem('dibh_users') || '[]');
        users.push({
          id: 'ghost-1', username: 'ghost', displayName: 'ghost', role: 'clinician',
          passwordHash: 'x', salt: 'y', mustChangePassword: false, failedAttempts: 0,
          lockedUntil: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
        localStorage.setItem('dibh_users', JSON.stringify(users));
        return true;
      `);
      await goto('/admin/accounts');
      await sleep(2000);
      // Remove the row's record underneath the open screen, then act on it —
      // the store no longer finds the id the button carries.
      await cdp.evaluate(`
        window.alert = (m) => { window.__lastAlert = m; };
        const users = JSON.parse(localStorage.getItem('dibh_users') || '[]');
        localStorage.setItem('dibh_users', JSON.stringify(users.filter((u) => u.id !== 'ghost-1')));
        const row = [...document.querySelectorAll('li')].find((l) => (l.textContent || '').includes('ghost'));
        if (!row) throw new Error('ghost row not rendered');
        const btn = [...row.querySelectorAll('button')].find((b) => (b.textContent || '').includes('역할 변경'));
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

  await capture({
    id: 'M036', num: 36, name: '계정을 삭제하지 못했습니다',
    expect: '삭제하지 못했습니다',
    setup: async () => {
      await signedIn(ctx);
      await goto('/admin/accounts');
      await sleep(1200);
      await cdp.evaluate("return window.__h.clickText('계정 추가');");
      await sleep(800);
      await cdp.evaluate(`
        const t=[...document.querySelectorAll('input')].find(i=>i.type==='text');
        const set=(e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);
          e.dispatchEvent(new Event('input',{bubbles:true}));};
        set(t,'todelete');
        for (const pw of document.querySelectorAll('input[type=password]')) set(pw,'Test@1234!');
        return true;
      `);
      await cdp.evaluate("return window.__h.clickText('생성');");
      await sleep(1600);
      await cdp.evaluate(`
        const row = [...document.querySelectorAll('li')].find((l) => (l.textContent || '').includes('todelete'));
        const btn = [...row.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '삭제');
        btn.click();
        return true;
      `);
      await sleep(800);
      // Make the write fail so the dialog shows its fallback message.
      await cdp.evaluate(`
        window.__origEnc = crypto.subtle.encrypt.bind(crypto.subtle);
        crypto.subtle.encrypt = () => Promise.reject(new Error('encryption unavailable'));
        return true;
      `);
      await cdp.evaluate(
        "const bs=[...document.querySelectorAll('button')].filter(b=>(b.textContent||'').trim()==='삭제');" +
          'bs[bs.length-1].click(); return true;',
      );
      await sleep(1800);
      await cdp.evaluate('crypto.subtle.encrypt = window.__origEnc; return true;');
    },
  });

  /* ── #58 / #59 저장 진행 중 ────────────────────────────────────────────── */

  await capture({
    id: 'M058', num: 58, name: '업로드 진행 중입니다 / 모든 파일 저장이 끝난 뒤',
    expect: '업로드 진행 중입니다',
    setup: async () => {
      await signedIn(ctx);
      const pid = await makePatient(ctx, '진행중환자');
      await goto(`/breathingdataupload?patientId=${pid}`);
      // Slow the write down so 등록 완료 lands while a save is still running.
      await cdp.evaluate(`
        window.__origEnc = crypto.subtle.encrypt.bind(crypto.subtle);
        crypto.subtle.encrypt = async (...a) => {
          await new Promise((r) => setTimeout(r, 12000));
          return window.__origEnc(...a);
        };
        return true;
      `);
      await dropFiles(ctx, 0, [{ name: 'GEN_slow.csv', body: CSV_OK }]);
      await cdp.evaluate("return window.__h.clickExact('등록');");
      await sleep(1200);
      await cdp.evaluate("return window.__h.clickText('등록 완료');");
      await sleep(1000);
      await cdp.evaluate('crypto.subtle.encrypt = window.__origEnc; return true;');
    },
  });

  /* ── #60 / #61 / #71 파일 삭제 실패 ────────────────────────────────────── */

  await capture({
    id: 'M060', num: 60, name: '삭제 실패 / 파일 삭제 중 오류 (업로드 화면)',
    expect: '파일 삭제 중 오류',
    setup: async () => {
      await signedIn(ctx);
      const pid = await makePatient(ctx, '파일삭제환자');
      await saveOneFile(ctx, pid, 0, 'GEN_todelete.csv');
      await goto(`/breathingdataupload?patientId=${pid}`);
      await sleep(1500);
      await cdp.evaluate(`
        window.__origDigest = crypto.subtle.digest.bind(crypto.subtle);
        crypto.subtle.digest = () => Promise.reject(new Error('digest unavailable'));
        return true;
      `);
      await cdp.evaluate(
        "const b=document.querySelector('[aria-label=\"파일 삭제\"]');" +
          "if(!b) throw new Error('no delete control'); b.click(); return true;",
      );
      await sleep(900);
      await cdp.evaluate(
        "const bs=[...document.querySelectorAll('button')].filter(b=>(b.textContent||'').trim()==='삭제');" +
          'if (bs.length) bs[bs.length-1].click(); return true;',
      );
      await sleep(1400);
      await cdp.evaluate('crypto.subtle.digest = window.__origDigest; return true;');
    },
  });

  /* ── #72 / #73 / #74 분석 오류 ─────────────────────────────────────────── */

  await capture({
    id: 'M073', num: 73, name: '일반호흡 파일을 찾을 수 없습니다',
    expect: '파일을 찾을 수 없습니다',
    setup: async () => {
      await signedIn(ctx);
      const pid = await makePatient(ctx, '분실환자');
      await saveOneFile(ctx, pid, 0, 'GEN_gone.csv');
      await saveOneFile(ctx, pid, 1, 'DIBH_gone.csv');
      await goto(`/analysisfileselect?patientId=${pid}`);
      await sleep(1500);
      await cdp.evaluate(`
        for (const sec of document.querySelectorAll('section')) {
          const row = [...sec.querySelectorAll('button')].find((b) => (b.textContent || '').includes('.csv'));
          if (row) row.click();
        }
        return true;
      `);
      await sleep(500);
      // Remove the rows underneath the selection: the ids the screen holds no
      // longer resolve, which is what analyzeFiles reports.
      await cdp.evaluate(`
        const mod = await import('/src/db/sqliteDb.js');
        const db = await mod.getSqliteDatabase();
        db.run('DELETE FROM breathing_files');
        mod.persistDb(db);
        return true;
      `);
      await cdp.evaluate("return window.__h.clickText('분석 시작');");
      await sleep(5000);
    },
  });

  /* ── #78 파일 무결성 오류 ──────────────────────────────────────────────── */

  await capture({
    id: 'M078', num: 78, name: '파일 무결성 오류: 저장된 이후 파일이 변경되었습니다',
    expect: '파일 무결성 오류',
    setup: async () => {
      await signedIn(ctx);
      const pid = await makePatient(ctx, '무결성환자');
      await saveOneFile(ctx, pid, 0, 'GEN_tamper.csv');
      await saveOneFile(ctx, pid, 1, 'DIBH_tamper.csv');
      // Change the stored bytes without updating content_hash — exactly the
      // condition the per-read check exists to catch (SI-04).
      await cdp.evaluate(`
        const mod = await import('/src/db/sqliteDb.js');
        const db = await mod.getSqliteDatabase();
        db.run("UPDATE breathing_files SET content = X'00010203'");
        mod.persistDb(db);
        return true;
      `);
      await goto(`/analysisfileselect?patientId=${pid}`);
      await sleep(1500);
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

  /* ── #44 / #45 백업·내보내기 실패 ──────────────────────────────────────── */

  await capture({
    id: 'M044', num: 44, name: '백업 생성에 실패했습니다',
    expect: '백업 생성에 실패',
    setup: async () => {
      await signedIn(ctx);
      await goto('/admin/backup');
      await sleep(1500);
      await cdp.evaluate(`
        window.__origEnc = crypto.subtle.encrypt.bind(crypto.subtle);
        crypto.subtle.encrypt = () => Promise.reject(new Error('encryption unavailable'));
        return true;
      `);
      await cdp.evaluate("return window.__h.clickText('백업 파일 생성');");
      await sleep(2200);
      await cdp.evaluate('crypto.subtle.encrypt = window.__origEnc; return true;');
    },
  });

  await capture({
    id: 'M045', num: 45, name: '비식별 내보내기에 실패했습니다',
    expect: '비식별 내보내기에 실패',
    setup: async () => {
      await goto('/admin/backup');
      await sleep(1500);
      await cdp.evaluate(`
        window.__origDec = crypto.subtle.decrypt.bind(crypto.subtle);
        crypto.subtle.decrypt = () => Promise.reject(new Error('decryption unavailable'));
        return true;
      `);
      await cdp.evaluate("return window.__h.clickText('비식별 CSV 내보내기');");
      await sleep(2200);
      await cdp.evaluate('crypto.subtle.decrypt = window.__origDec; return true;');
    },
  });

  /* ── #46 / #47 / #48 복구 실패 ─────────────────────────────────────────── */

  const feed = async (name, body) => {
    await cdp.evaluate(`
      const input = [...document.querySelectorAll('input[type=file]')].pop();
      if (!input) throw new Error('no file input on backup screen');
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(body)}], ${JSON.stringify(name)}, { type: 'application/octet-stream' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    `);
    await sleep(2600);
  };

  await capture({
    id: 'M048', num: 48, name: '복구에 실패했습니다 / 올바른 백업 파일인지 확인해 주세요',
    expect: '복구에 실패',
    setup: async () => {
      await signedIn(ctx);
      await goto('/admin/backup');
      await sleep(1800);
      await feed('wrong.enc', 'not a backup at all');
    },
  });
}
