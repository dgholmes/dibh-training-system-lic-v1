import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { getSqliteDatabase } from '@/db/sqliteDb'
import { initCrypto, encryptValue, decryptValue, sha256Hex } from '@/lib/crypto'
import { secDbg } from '@/lib/securityDebug'

// Security self-check (SI-03) — verify critical security subsystems before mounting the app
async function securitySelfCheck() {
  // 1. Web Crypto API available
  if (!window.crypto?.subtle) throw new Error('Web Crypto API 사용 불가');
  secDbg('SI-03', 'Self-Check 1/4 — Web Crypto API', { status: 'PASS', api: 'window.crypto.subtle' });

  // 2. Encryption round-trip works
  const testPlain = 'dibh-selfcheck-ok';
  const enc = await encryptValue(testPlain);
  const dec = await decryptValue(enc);
  if (dec !== testPlain) throw new Error('암호화 자가진단 실패');
  secDbg('SI-03', 'Self-Check 2/4 — AES-256-GCM Round-Trip', {
    status: 'PASS',
    test: 'encrypt then decrypt produces original plaintext',
  });

  // 3. sessionStorage available (required for session management)
  const testKey = '__sc_test__';
  sessionStorage.setItem(testKey, '1');
  if (sessionStorage.getItem(testKey) !== '1') throw new Error('sessionStorage 사용 불가');
  sessionStorage.removeItem(testKey);
  secDbg('SI-03', 'Self-Check 3/4 — sessionStorage', {
    status: 'PASS',
    purpose: 'session token storage (cleared on tab close)',
  });

  // 4. localStorage available (required for data storage)
  const lsTestKey = '__sc_ls_test__';
  localStorage.setItem(lsTestKey, '1');
  if (localStorage.getItem(lsTestKey) !== '1') throw new Error('localStorage 사용 불가');
  localStorage.removeItem(lsTestKey);
  secDbg('SI-03', 'Self-Check 4/4 — localStorage', {
    status: 'PASS',
    purpose: 'encrypted patient data and audit log storage',
  });
  secDbg('SI-03', 'Startup Security Self-Check Complete', { result: 'ALL CHECKS PASSED — app mounting' });
}

// SI-04 — Runtime file integrity check (production only).
// Fetches the build-time manifest and re-hashes each listed file,
// blocking app mount if any hash mismatches.
async function integrityCheck() {
  const res = await fetch('/integrity.json');
  if (!res.ok) throw new Error('무결성 매니페스트를 로드할 수 없습니다 (integrity.json)');
  const { files, generated } = await res.json();

  secDbg('SI-04', 'Integrity Manifest Loaded', {
    manifest_generated: generated,
    files_to_check: Object.keys(files).length,
  });

  for (const [filePath, expectedHash] of Object.entries(files)) {
    const fileRes = await fetch(filePath);
    if (!fileRes.ok) throw new Error(`무결성 검사 파일 로드 실패: ${filePath}`);
    const buf = await fileRes.arrayBuffer();
    const hash = await sha256Hex(buf);
    if (hash !== expectedHash) {
      throw new Error(`무결성 검사 실패 (파일 변조 감지): ${filePath}`);
    }
    secDbg('SI-04', `File Integrity OK: ${filePath}`, {
      expected: expectedHash,
      computed: hash,
      status: 'MATCH',
    });
  }
  secDbg('SI-04', 'File Integrity Check Complete', {
    files_checked: Object.keys(files).length,
    result: 'ALL PASS',
  });
}

Promise.all([
  getSqliteDatabase().catch((e) => console.error('[Init] SQLite init failed:', e)),
  initCrypto().catch((e) => { console.error('[Init] Crypto init failed:', e); throw e; }),
]).then(async () => {
  if (import.meta.env.PROD) {
    await integrityCheck().catch((e) => {
      console.error('[IntegrityCheck] FAILED:', e);
      document.getElementById('root').innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0D1117;padding:2rem;">
          <div style="max-width:480px;border:1px solid #EF4444;border-radius:16px;background:#1C2128;padding:2rem;text-align:center;color:white;">
            <div style="font-size:2rem;margin-bottom:1rem;">⚠</div>
            <h2 style="color:#EF4444;margin-bottom:1rem;">무결성 검사 실패</h2>
            <p style="color:#C9D1D9;margin-bottom:0.5rem;">앱 파일의 무결성을 확인할 수 없습니다. 파일이 변조되었을 수 있습니다.</p>
            <p style="color:#8B949E;font-size:0.85rem;">${e.message}</p>
          </div>
        </div>`;
      throw e;
    });
  }

  await securitySelfCheck().catch((e) => {
    console.error('[SecuritySelfCheck] FAILED:', e);
    // Show a blocking alert — app cannot run safely without these subsystems
    document.getElementById('root').innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0D1117;padding:2rem;">
        <div style="max-width:480px;border:1px solid #EF4444;border-radius:16px;background:#1C2128;padding:2rem;text-align:center;color:white;">
          <div style="font-size:2rem;margin-bottom:1rem;">⚠</div>
          <h2 style="color:#EF4444;margin-bottom:1rem;">보안 자가진단 실패</h2>
          <p style="color:#C9D1D9;margin-bottom:0.5rem;">시스템 보안 기능을 초기화할 수 없습니다.</p>
          <p style="color:#8B949E;font-size:0.85rem;">${e.message}</p>
        </div>
      </div>`;
    throw e;
  });
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})