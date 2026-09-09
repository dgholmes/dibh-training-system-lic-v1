/**
 * Fifth batch — the last reachable messages, each needing a precisely shaped
 * failure rather than a general one.
 */

const ADMIN = { u: 'admin', p: 'Admin@1234!' };
const NEWPW = 'Test@1234!';

const MODAL =
  "const modal=[...document.querySelectorAll('div')].filter(d=>d.querySelectorAll('input[type=password]').length===2).pop();" +
  "if(!modal) throw new Error('change-password modal not found');" +
  "const i=[...modal.querySelectorAll('input[type=password]')];" +
  "const set=(e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);" +
  "e.dispatchEvent(new Event('input',{bubbles:true}));};";

async function signedIn(ctx) {
  const { cdp, goto, sleep } = ctx;
  await ctx.reset();
  await goto('/login');
  await cdp.evaluate(
    `window.__h.set('input[type=text]','admin');window.__h.set('input[type=password]','${ADMIN.p}');return true;`,
  );
  await cdp.evaluate("return window.__h.clickText('시작하기');");
  await sleep(1500);
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

export async function runCases5(ctx) {
  const { capture, cdp, goto, sleep } = ctx;

  /* ── #40 감사 로그 경고 구간 ───────────────────────────────────────────── */

  await capture({
    id: 'M040c', num: 40, name: '감사 로그 저장 공간 경고 (UC-05)',
    expect: '저장 공간 경고',
    method: 'seeded state',
    setup: async () => {
      await signedIn(ctx);
      // The banner appears from 80% and turns critical at 90%, so the warning
      // band is 8,000-8,999 entries. Details are kept short so the storage
      // percentage does not cross 90 and flip it to critical.
      await cdp.evaluate(`
        const rows = [];
        for (let i = 0; i < 8500; i += 1) {
          rows.push({
            id: 's' + i, timestamp: new Date(Date.now() - i * 1000).toISOString(),
            action: 'LOGIN', actor: 'a', targetType: 'u', targetId: 'a',
            detail: '', prevHash: '', hash: '',
          });
        }
        localStorage.setItem('dibh_audit_log', JSON.stringify(rows));
        return rows.length;
      `);
      await goto('/admin/auditlog');
      await sleep(2400);
    },
  });

  /* ── #46 백업 무결성 검증 실패 ─────────────────────────────────────────── */

  await capture({
    id: 'M046d', num: 46, name: '백업 파일의 무결성 검증에 실패했습니다',
    expect: '무결성 검증에 실패',
    method: 'real artefact (envelope hash mismatch) + user action',
    setup: async () => {
      await signedIn(ctx);
      await makePatient(ctx, '백업무결성환자');
      await goto('/admin/backup');
      await sleep(1800);
      // restoreBackup decrypts first, then compares sha256(data) with the hash
      // recorded beside it. Damaging the ciphertext fails decryption and gives
      // the key-mismatch message instead, so the envelope has to be rebuilt:
      // decrypt it, alter `data`, re-encrypt with the same key, leaving the
      // recorded hash stale.
      const forged = await cdp.evaluate(`
        const bak = await import('/src/pages/AdminBackup.jsx');
        const cry = await import('/src/lib/crypto.js');
        const good = await bak.createBackup();
        const envelope = JSON.parse(await cry.decryptValue(good));
        const payload = JSON.parse(envelope.data);
        payload._created_at = new Date(Date.now() - 86400000).toISOString();
        // hash left as-is, so it no longer matches the altered data
        return await cry.encryptValue(JSON.stringify({ hash: envelope.hash, data: JSON.stringify(payload) }));
      `);
      await cdp.evaluate(`
        const input = [...document.querySelectorAll('input[type=file]')].pop();
        const dt = new DataTransfer();
        dt.items.add(new File([${'`${forged}`'}], 'altered.enc', { type: 'application/octet-stream' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      `.replace('${forged}', forged));
      await sleep(2800);
    },
  });

  /* ── #78 파일 무결성 오류 ──────────────────────────────────────────────── */

  await capture({
    id: 'M078c', num: 78, name: '파일 무결성 오류: 저장된 이후 파일이 변경되었습니다',
    expect: '파일 무결성 오류',
    method: 'induced-fault (contents re-encrypted, stored hash left stale)',
    setup: async () => {
      await signedIn(ctx);
      const pid = await makePatient(ctx, '무결성검증환자');
      await saveFile(ctx, pid, 0, 'GEN_hash.csv');
      await saveFile(ctx, pid, 1, 'DIBH_hash.csv');
      // Random bytes would fail decryption first and report a different error.
      // Re-encrypt *valid but different* plaintext and leave content_hash as it
      // was, which is precisely what the per-read check is there to detect.
      await cdp.evaluate(`
        const db = await (await import('/src/db/sqliteDb.js')).getSqliteDatabase();
        const mod = await import('/src/db/sqliteDb.js');
        const cry = await import('/src/lib/crypto.js');
        const different = new TextEncoder().encode('time,raw\\n0,0\\n1,1\\n');
        const sealed = await cry.encryptBytes(different.buffer);
        const bytes = new Uint8Array(sealed);
        const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
        db.run("UPDATE breathing_files SET content = X'" + hex + "'");
        mod.persistDb(db);
        return hex.length;
      `);
      await goto(`/analysisfileselect?patientId=${pid}`);
      await sleep(1800);
      await cdp.evaluate(`
        for (const sec of document.querySelectorAll('section')) {
          const row = [...sec.querySelectorAll('button')].find((b) => (b.textContent || '').includes('.csv'));
          if (row) row.click();
        }
        return true;
      `);
      await sleep(600);
      await cdp.evaluate("return window.__h.clickText('분석 시작');");
      await sleep(5500);
    },
  });

  /* ── #58 / #59 저장 진행 중 ────────────────────────────────────────────── */

  await capture({
    id: 'M058c', num: 58, name: '업로드 진행 중입니다 / 모든 파일 저장이 끝난 뒤',
    expect: '업로드 진행 중입니다',
    method: 'induced-fault (write held open)',
    setup: async () => {
      await signedIn(ctx);
      const pid = await makePatient(ctx, '진행중대상2');
      await goto(`/breathingdataupload?patientId=${pid}`);
      await sleep(1600);
      // createBreathingFile hashes the contents; holding digest open keeps the
      // pending row in its 'persisting' state while 등록 완료 is pressed.
      await cdp.evaluate(`
        window.__origDigest = crypto.subtle.digest.bind(crypto.subtle);
        crypto.subtle.digest = async (...a) => {
          await new Promise((r) => setTimeout(r, 20000));
          return window.__origDigest(...a);
        };
        return true;
      `);
      await cdp.evaluate(`
        const dt = new DataTransfer();
        dt.items.add(new File([${JSON.stringify(CSV_OK)}], 'GEN_hold.csv', { type: 'text/csv' }));
        const zones = [...document.querySelectorAll('[role="button"]')]
          .filter((z) => (z.textContent || '').includes('파일을 선택하세요'));
        zones[0].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
        return true;
      `);
      await sleep(1000);
      await cdp.evaluate("return window.__h.clickExact('등록');");
      await sleep(2000);
      await cdp.evaluate("return window.__h.clickText('등록 완료');");
      await sleep(1200);
      await cdp.evaluate('crypto.subtle.digest = window.__origDigest; return true;');
    },
  });

  /* ── #45 비식별 내보내기 실패 ──────────────────────────────────────────── */

  await capture({
    id: 'M045c', num: 45, name: '비식별 내보내기에 실패했습니다',
    expect: '비식별 내보내기에 실패',
    method: 'induced-fault (export write)',
    setup: async () => {
      await signedIn(ctx);
      await makePatient(ctx, '비식별대상');
      await goto('/admin/backup');
      await sleep(1800);
      // The rows decrypt from cache, so breaking decryption does not stop the
      // export — the failure has to be on the way out, when the file is handed
      // to the browser.
      await cdp.evaluate(`
        window.__origBlob = window.Blob;
        window.Blob = function () { throw new Error('export failed'); };
        window.__origCreate = URL.createObjectURL;
        URL.createObjectURL = () => { throw new Error('export failed'); };
        return true;
      `);
      await cdp.evaluate("return window.__h.clickText('비식별 CSV 내보내기');");
      await sleep(2400);
      await cdp.evaluate(
        'window.Blob = window.__origBlob; URL.createObjectURL = window.__origCreate; return true;',
      );
    },
  });
}
