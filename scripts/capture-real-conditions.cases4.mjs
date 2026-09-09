/**
 * Fourth batch — the failure-path messages the earlier passes could not force.
 *
 * The lever these needed is the SQLite handle itself. Breathing-file writes and
 * patient/account deletions all funnel through the one cached database object,
 * so replacing its `run` with a throwing stub fails exactly the operation the
 * screen is awaiting — the component's own catch block then renders the
 * message. Nothing here draws a string.
 *
 * Backup restore is different again: the three failure messages are chosen by
 * the *kind* of error, so each needs a genuinely different bad file.
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

const CSV_OK =
  'time,raw,filtered,dy\n' +
  Array.from({ length: 400 }, (_, i) =>
    `${(i * 0.05).toFixed(2)},${(Math.sin(i / 8) * 10).toFixed(3)},${(Math.sin(i / 8) * 10).toFixed(3)},0`,
  ).join('\n');

async function saveFile(ctx, pid, zone, name) {
  const { cdp, goto, sleep } = ctx;
  await goto(`/breathingdataupload?patientId=${pid}`);
  await cdp.evaluate(`
    const dt = new DataTransfer();
    dt.items.add(new File([${JSON.stringify(CSV_OK)}], ${JSON.stringify(name)}, { type: 'text/csv' }));
    const zones = [...document.querySelectorAll('[role="button"]')]
      .filter((z) => (z.textContent || '').includes('파일을 선택하세요'));
    zones[${zone}].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    return true;
  `);
  await sleep(900);
  await cdp.evaluate("return window.__h.clickExact('등록');");
  await sleep(2600);
}

/** Make every subsequent database write throw, and hand back a restore. */
const BREAK_DB = `
  const mod = await import('/src/db/sqliteDb.js');
  const db = await mod.getSqliteDatabase();
  if (!window.__origRun) window.__origRun = db.run.bind(db);
  db.run = () => { throw new Error('database write failed'); };
  return true;
`;
const FIX_DB = `
  const mod = await import('/src/db/sqliteDb.js');
  const db = await mod.getSqliteDatabase();
  if (window.__origRun) { db.run = window.__origRun; window.__origRun = null; }
  return true;
`;

export async function runCases4(ctx) {
  const { capture, cdp, goto, sleep } = ctx;

  /* ── 파일 삭제 실패 (#60, #61) ─────────────────────────────────────────── */

  await capture({
    id: 'M060b', num: 60, name: '삭제 실패 / 파일 삭제 중 오류 (호흡 데이터 추가)',
    expect: '파일 삭제 중 오류',
    method: 'induced-fault (database write)',
    setup: async () => {
      await signedIn(ctx);
      const pid = await makePatient(ctx, '삭제실패환자');
      await saveFile(ctx, pid, 0, 'GEN_del.csv');
      await goto(`/breathingdataupload?patientId=${pid}`);
      await sleep(1600);
      await cdp.evaluate(BREAK_DB);
      await cdp.evaluate(
        "const b=document.querySelector('[aria-label=\"파일 삭제\"]');" +
          "if(!b) throw new Error('no delete control'); b.click(); return true;",
      );
      await sleep(900);
      await cdp.evaluate(
        "const bs=[...document.querySelectorAll('button')].filter(b=>(b.textContent||'').trim()==='삭제');" +
          'bs[bs.length-1].click(); return true;',
      );
      await sleep(1600);
      await cdp.evaluate(FIX_DB);
    },
  });

  /* ── 파일 삭제 실패 — 분석할 파일 선택 (#71) ───────────────────────────── */

  await capture({
    id: 'M071b', num: 71, name: '파일 삭제 실패 (분석할 파일 선택)',
    expect: '파일 삭제 실패',
    method: 'induced-fault (database write)',
    setup: async () => {
      const pid = await makePatient(ctx, '선택삭제환자');
      await saveFile(ctx, pid, 0, 'GEN_sel.csv');
      await goto(`/analysisfileselect?patientId=${pid}`);
      await sleep(1600);
      await cdp.evaluate(BREAK_DB);
      await cdp.evaluate(
        "const b=document.querySelector('[aria-label=\"파일 삭제\"]');" +
          "if(!b) throw new Error('no delete control'); b.click(); return true;",
      );
      await sleep(900);
      await cdp.evaluate(
        "const bs=[...document.querySelectorAll('button')].filter(b=>(b.textContent||'').trim()==='삭제');" +
          'if (bs.length) bs[bs.length-1].click(); return true;',
      );
      await sleep(1600);
      await cdp.evaluate(FIX_DB);
    },
  });

  /* ── 환자 삭제 실패 (#69) ──────────────────────────────────────────────── */

  await capture({
    id: 'M069b', num: 69, name: '환자 삭제에 실패했습니다',
    expect: '환자 삭제에 실패',
    method: 'induced-fault (database write)',
    setup: async () => {
      const pid = await makePatient(ctx, '삭제실패대상');
      await goto(`/patientdashboard?patientId=${pid}`);
      await sleep(1600);
      await cdp.evaluate(BREAK_DB);
      await cdp.evaluate("return window.__h.clickText('삭제');");
      await sleep(900);
      await cdp.evaluate(
        "const bs=[...document.querySelectorAll('button')].filter(b=>(b.textContent||'').trim()==='삭제');" +
          'bs[bs.length-1].click(); return true;',
      );
      await sleep(1700);
      await cdp.evaluate(FIX_DB);
    },
  });

  /* ── 계정 삭제 실패 (#36) ──────────────────────────────────────────────── */

  await capture({
    id: 'M036b', num: 36, name: '계정을 삭제하지 못했습니다',
    expect: '삭제하지 못했습니다',
    method: 'induced-fault (encryption)',
    setup: async () => {
      await signedIn(ctx);
      await goto('/admin/accounts');
      await sleep(1400);
      await cdp.evaluate("return window.__h.clickText('계정 추가');");
      await sleep(900);
      await cdp.evaluate(`
        const t=[...document.querySelectorAll('input')].find(i=>i.type==='text');
        const set=(e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);
          e.dispatchEvent(new Event('input',{bubbles:true}));};
        set(t,'todelete');
        for (const pw of document.querySelectorAll('input[type=password]')) set(pw,'Test@1234!');
        return true;
      `);
      await cdp.evaluate("return window.__h.clickText('생성');");
      await sleep(1800);
      await cdp.evaluate(`
        const row=[...document.querySelectorAll('li')].find(l=>(l.textContent||'').includes('todelete'));
        if(!row) throw new Error('created account row not found');
        [...row.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='삭제').click();
        return true;
      `);
      await sleep(900);
      // UserStore.delete re-encrypts the remaining records before writing.
      await cdp.evaluate(`
        window.__origEnc = crypto.subtle.encrypt.bind(crypto.subtle);
        crypto.subtle.encrypt = () => Promise.reject(new Error('encryption unavailable'));
        return true;
      `);
      await cdp.evaluate(
        "const bs=[...document.querySelectorAll('button')].filter(b=>(b.textContent||'').trim()==='삭제');" +
          'bs[bs.length-1].click(); return true;',
      );
      await sleep(1700);
      await cdp.evaluate('crypto.subtle.encrypt = window.__origEnc; return true;');
    },
  });

  /* ── 백업 복구 실패 3종 (#46, #47, #48) ────────────────────────────────── */

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
    await sleep(2800);
  };

  // A genuine backup, produced by the app's own exporter, is the raw material
  // for the two interesting failures.
  await capture({
    id: 'M046c', num: 46, name: '백업 파일의 무결성 검증에 실패했습니다',
    expect: '무결성 검증에 실패',
    method: 'real artefact (tampered backup) + user action',
    setup: async () => {
      await signedIn(ctx);
      await makePatient(ctx, '백업환자');
      await goto('/admin/backup');
      await sleep(1800);
      const tampered = await cdp.evaluate(`
        const mod = await import('/src/pages/AdminBackup.jsx');
        const good = await mod.createBackup();
        // Flip one character deep inside the ciphertext: the envelope still
        // parses, so the HMAC check is what rejects it.
        const at = Math.floor(good.length * 0.7);
        return good.slice(0, at) + (good[at] === 'A' ? 'B' : 'A') + good.slice(at + 1);
      `);
      await feed('tampered.enc', tampered);
    },
  });

  await capture({
    id: 'M047', num: 47, name: '복호화에 실패했습니다 (다른 설치 키로 만든 백업)',
    expect: '다른 키로 암호화',
    method: 'real artefact (foreign-key backup) + user action',
    setup: async () => {
      const foreign = await cdp.evaluate(`
        const mod = await import('/src/pages/AdminBackup.jsx');
        return await mod.createBackup();
      `);
      // Rotate the installation key, so the backup now belongs to a different
      // install — the case the message describes.
      await cdp.evaluate(`
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('dibh_install_key', hex);
        localStorage.removeItem('dibh_install_key_v2');
        return true;
      `);
      await goto('/admin/backup');
      await sleep(2000);
      await feed('other-device.enc', foreign);
    },
  });

  await capture({
    id: 'M048b', num: 48, name: '복구에 실패했습니다 / 올바른 백업 파일인지 확인해 주세요',
    expect: '복구에 실패',
    method: 'induced-fault (message-less error)',
    setup: async () => {
      await signedIn(ctx);
      await goto('/admin/backup');
      await sleep(1800);
      // The fallback line shows only when the thrown error carries no message.
      await cdp.evaluate(`
        const mod = await import('/src/pages/AdminBackup.jsx');
        window.__origRestore = mod.restoreBackup;
        return true;
      `);
      await cdp.evaluate(`
        const proto = Object.getPrototypeOf(new Blob());
        window.__origText = proto.text;
        proto.text = function () { return Promise.reject(new Error('')); };
        return true;
      `);
      await feed('unreadable.enc', 'irrelevant');
      await cdp.evaluate(`
        const proto = Object.getPrototypeOf(new Blob());
        if (window.__origText) proto.text = window.__origText;
        return true;
      `);
    },
  });

  /* ── 비식별 내보내기 실패 (#45) ────────────────────────────────────────── */

  await capture({
    id: 'M045b', num: 45, name: '비식별 내보내기에 실패했습니다',
    expect: '비식별 내보내기에 실패',
    method: 'induced-fault (decryption)',
    setup: async () => {
      await signedIn(ctx);
      await makePatient(ctx, '비식별환자');
      await goto('/admin/backup');
      await sleep(1800);
      await cdp.evaluate(`
        window.__origDec = crypto.subtle.decrypt.bind(crypto.subtle);
        crypto.subtle.decrypt = () => Promise.reject(new Error('decryption unavailable'));
        return true;
      `);
      await cdp.evaluate("return window.__h.clickText('비식별 CSV 내보내기');");
      await sleep(2400);
      await cdp.evaluate('crypto.subtle.decrypt = window.__origDec; return true;');
    },
  });

  /* ── 저장 진행 중 (#58, #59) ───────────────────────────────────────────── */

  await capture({
    id: 'M058b', num: 58, name: '업로드 진행 중입니다 / 모든 파일 저장이 끝난 뒤',
    expect: '업로드 진행 중입니다',
    method: 'induced-fault (slowed write)',
    setup: async () => {
      await signedIn(ctx);
      const pid = await makePatient(ctx, '진행중대상');
      await goto(`/breathingdataupload?patientId=${pid}`);
      await sleep(1400);
      // Hold the write open so 등록 완료 lands while a save is still running.
      await cdp.evaluate(`
        const mod = await import('/src/db/sqliteDb.js');
        const db = await mod.getSqliteDatabase();
        window.__origRun = db.run.bind(db);
        db.run = function (...a) {
          const t0 = Date.now();
          while (Date.now() - t0 < 30) { /* slow each statement down */ }
          return window.__origRun(...a);
        };
        window.__origEnc = crypto.subtle.encrypt.bind(crypto.subtle);
        crypto.subtle.encrypt = async (...a) => {
          await new Promise((r) => setTimeout(r, 15000));
          return window.__origEnc(...a);
        };
        return true;
      `);
      await cdp.evaluate(`
        const dt = new DataTransfer();
        dt.items.add(new File([${JSON.stringify(CSV_OK)}], 'GEN_slow.csv', { type: 'text/csv' }));
        const zones = [...document.querySelectorAll('[role="button"]')]
          .filter((z) => (z.textContent || '').includes('파일을 선택하세요'));
        zones[0].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
        return true;
      `);
      await sleep(900);
      await cdp.evaluate("return window.__h.clickExact('등록');");
      await sleep(1500);
      await cdp.evaluate("return window.__h.clickText('등록 완료');");
      await sleep(1200);
      await cdp.evaluate(`
        crypto.subtle.encrypt = window.__origEnc;
        const mod = await import('/src/db/sqliteDb.js');
        const db = await mod.getSqliteDatabase();
        db.run = window.__origRun;
        return true;
      `);
    },
  });

  /* ── 분석 오류 (#72, #74, #78) ─────────────────────────────────────────── */

  const selectBoth = `
    for (const sec of document.querySelectorAll('section')) {
      const row = [...sec.querySelectorAll('button')].find((b) => (b.textContent || '').includes('.csv'));
      if (row) row.click();
    }
    return true;
  `;

  await capture({
    id: 'M074', num: 74, name: 'DIBH 파일을 찾을 수 없습니다',
    expect: 'DIBH 파일을 찾을 수 없습니다',
    method: 'induced-fault (row removed after selection)',
    setup: async () => {
      await signedIn(ctx);
      const pid = await makePatient(ctx, 'DIBH분실환자');
      await saveFile(ctx, pid, 0, 'GEN_keep.csv');
      await saveFile(ctx, pid, 1, 'DIBH_gone.csv');
      await goto(`/analysisfileselect?patientId=${pid}`);
      await sleep(1600);
      await cdp.evaluate(selectBoth);
      await sleep(500);
      // Drop only the DIBH row, so the general file still resolves.
      await cdp.evaluate(`
        const mod = await import('/src/db/sqliteDb.js');
        const db = await mod.getSqliteDatabase();
        db.run("DELETE FROM breathing_files WHERE category = 'dibh'");
        mod.persistDb(db);
        return true;
      `);
      await cdp.evaluate("return window.__h.clickText('분석 시작');");
      await sleep(5000);
    },
  });

  await capture({
    id: 'M078b', num: 78, name: '파일 무결성 오류: 저장된 이후 파일이 변경되었습니다',
    expect: '파일 무결성 오류',
    method: 'induced-fault (stored bytes altered, hash left intact)',
    setup: async () => {
      await signedIn(ctx);
      const pid = await makePatient(ctx, '무결성대상');
      await saveFile(ctx, pid, 0, 'GEN_int.csv');
      await saveFile(ctx, pid, 1, 'DIBH_int.csv');
      // Change the bytes but not content_hash — exactly what the per-read
      // check exists to detect (SI-04).
      await cdp.evaluate(`
        const mod = await import('/src/db/sqliteDb.js');
        const db = await mod.getSqliteDatabase();
        db.run("UPDATE breathing_files SET content = X'0001020304050607'");
        mod.persistDb(db);
        return true;
      `);
      await goto(`/analysisfileselect?patientId=${pid}`);
      await sleep(1600);
      await cdp.evaluate(selectBoth);
      await sleep(500);
      await cdp.evaluate("return window.__h.clickText('분석 시작');");
      await sleep(5000);
    },
  });

  await capture({
    id: 'M072', num: 72, name: '분석 중 오류가 발생했습니다 (폴백)',
    expect: '분석 중 오류가 발생했습니다',
    method: 'induced-fault (message-less error)',
    setup: async () => {
      await signedIn(ctx);
      const pid = await makePatient(ctx, '폴백환자');
      await saveFile(ctx, pid, 0, 'GEN_fb.csv');
      await saveFile(ctx, pid, 1, 'DIBH_fb.csv');
      await goto(`/analysisfileselect?patientId=${pid}`);
      await sleep(1600);
      await cdp.evaluate(selectBoth);
      await sleep(500);
      // The screen shows err.message when there is one, so the fallback needs
      // a failure that carries none.
      await cdp.evaluate(`
        const mod = await import('/src/db/sqliteDb.js');
        const db = await mod.getSqliteDatabase();
        window.__origPrep = db.prepare.bind(db);
        db.prepare = () => { throw new Error(''); };
        return true;
      `);
      await cdp.evaluate("return window.__h.clickText('분석 시작');");
      await sleep(4500);
      await cdp.evaluate(`
        const mod = await import('/src/db/sqliteDb.js');
        const db = await mod.getSqliteDatabase();
        db.prepare = window.__origPrep;
        return true;
      `);
    },
  });

  /* ── 감사 로그 경고 구간 (#40) ─────────────────────────────────────────── */

  await capture({
    id: 'M040b', num: 40, name: '감사 로그 저장 공간 경고 (UC-05)',
    expect: '저장 공간 경고',
    method: 'seeded state',
    setup: async () => {
      await signedIn(ctx);
      // Entry count inside the warning band and below the 90% danger line.
      await cdp.evaluate(`
        const rows = [];
        for (let i = 0; i < 7800; i += 1) {
          rows.push({
            id: 'seed-' + i, timestamp: new Date(Date.now() - i * 1000).toISOString(),
            action: 'LOGIN', actor: 'admin', targetType: 'user', targetId: 'admin',
            detail: 'x', prevHash: 'seed', hash: 'seed',
          });
        }
        localStorage.setItem('dibh_audit_log', JSON.stringify(rows));
        return rows.length;
      `);
      await goto('/admin/auditlog');
      await sleep(2200);
    },
  });
}
