import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { getSqliteDatabase } from '@/db/sqliteDb'
import { initCrypto, encryptValue, decryptValue, sha256Hex } from '@/lib/crypto'
import { secDbg } from '@/lib/securityDebug'
import { tryWriteAuditLog, AUDIT_ACTIONS } from '@/api/auditStore'

// Security self-check (SI-03) — verify critical security subsystems before mounting the app
async function securitySelfCheck() {
  // 1. Web Crypto API available
  if (!window.crypto?.subtle) throw new Error('Web Crypto API 사용 불가');
  secDbg('SI-03', '자가진단 1/4 — Web Crypto API 가용성 확인 | Self-Check 1/4 — Web Crypto API', {
    설명: 'window.crypto.subtle API가 존재하는지 확인합니다. 이 API가 없으면 AES-256-GCM 암호화를 사용할 수 없습니다.',
    description: 'Verifies window.crypto.subtle is available. Without it, AES-256-GCM encryption cannot function.',
    result: 'PASS', api: 'window.crypto.subtle',
  });

  // 2. Encryption round-trip works
  const testPlain = 'dibh-selfcheck-ok';
  const enc = await encryptValue(testPlain);
  const dec = await decryptValue(enc);
  if (dec !== testPlain) throw new Error('암호화 자가진단 실패');
  secDbg('SI-03', '자가진단 2/4 — AES-256-GCM 라운드트립 검증 | Self-Check 2/4 — AES-256-GCM Round-Trip', {
    설명: '테스트 문자열을 AES-256-GCM으로 암호화한 후 복호화하여 원본과 일치하는지 확인합니다.',
    description: 'Encrypts a test string with AES-256-GCM then decrypts it — verifies the result matches the original.',
    result: 'PASS', test: '암호화 → 복호화 후 원본과 비교 | encrypt → decrypt → compare to original',
  });

  // 3. sessionStorage available (required for session management)
  const testKey = '__sc_test__';
  sessionStorage.setItem(testKey, '1');
  if (sessionStorage.getItem(testKey) !== '1') throw new Error('sessionStorage 사용 불가');
  sessionStorage.removeItem(testKey);
  secDbg('SI-03', '자가진단 3/4 — sessionStorage 가용성 확인 | Self-Check 3/4 — sessionStorage', {
    설명: '세션 토큰 저장에 사용되는 sessionStorage의 읽기/쓰기 가능 여부를 확인합니다. 탭 종료 시 자동 삭제됩니다.',
    description: 'Verifies sessionStorage read/write is available. Used for session tokens — cleared automatically on tab close.',
    result: 'PASS', purpose: '세션 토큰 저장 (탭 닫힘 시 자동 삭제) | session token storage (cleared on tab close)',
  });

  // 4. localStorage available (required for data storage)
  const lsTestKey = '__sc_ls_test__';
  localStorage.setItem(lsTestKey, '1');
  if (localStorage.getItem(lsTestKey) !== '1') throw new Error('localStorage 사용 불가');
  localStorage.removeItem(lsTestKey);
  secDbg('SI-03', '자가진단 4/4 — localStorage 가용성 확인 | Self-Check 4/4 — localStorage', {
    설명: '환자 데이터 및 감사 로그 저장에 사용되는 localStorage의 읽기/쓰기 가능 여부를 확인합니다.',
    description: 'Verifies localStorage read/write is available. Used for encrypted patient data and the audit log.',
    result: 'PASS', purpose: '암호화된 환자 데이터 및 감사 로그 저장 | encrypted patient data & audit log storage',
  });
  secDbg('SI-03', '시작 보안 자가진단 완료 | Startup Security Self-Check Complete', {
    설명: '앱 마운트 전 4가지 보안 기능 자가진단이 모두 완료되었습니다.',
    description: 'All 4 security subsystem checks passed before React mounts. App is safe to start.',
    result: '전체 통과 — 앱 마운트 진행 | all passed — mounting app',
    checks: 4,
  });
}

// SI-04 — Runtime file integrity check (production only).
// Fetches the build-time manifest and re-hashes each listed file,
// blocking app mount if any hash mismatches.
async function integrityCheck() {
  const res = await fetch('/integrity.json');
  if (!res.ok) throw new Error('무결성 매니페스트를 로드할 수 없습니다 (integrity.json)');
  const { files, generated } = await res.json();

  secDbg('SI-04', '무결성 매니페스트 로드 완료 | Integrity Manifest Loaded', {
    설명: '빌드 시점에 생성된 integrity.json 파일을 로드했습니다. 각 앱 번들 파일의 SHA-256 해시값이 포함되어 있습니다.',
    description: 'Loaded integrity.json generated at build time. Contains expected SHA-256 hashes for each app bundle file.',
    manifest_generated_at: generated,
    files_to_verify: Object.keys(files).length,
  });

  for (const [filePath, expectedHash] of Object.entries(files)) {
    const fileRes = await fetch(filePath);
    if (!fileRes.ok) throw new Error(`무결성 검사 파일 로드 실패: ${filePath}`);
    const buf = await fileRes.arrayBuffer();
    const hash = await sha256Hex(buf);
    if (hash !== expectedHash) {
      throw new Error(`무결성 검사 실패 (파일 변조 감지): ${filePath}`);
    }
    secDbg('SI-04', `파일 무결성 검증 성공 | File Integrity OK: ${filePath}`, {
      설명: '파일의 SHA-256 해시값이 빌드 시점 기록값과 일치합니다. 파일 변조 없음.',
      description: 'SHA-256 hash matches the build-time record. File has not been tampered with.',
      expected_hash: expectedHash,
      computed_hash: hash,
      result: '일치 (변조 없음) | match (no tampering)',
    });
  }
  secDbg('SI-04', '파일 무결성 검증 전체 완료 | All File Integrity Checks Passed', {
    설명: '모든 앱 번들 파일의 SHA-256 해시값 검증이 완료되었습니다. 파일 변조가 감지되지 않았습니다.',
    description: 'All app bundle files verified against build-time SHA-256 hashes. No tampering detected.',
    files_verified: Object.keys(files).length,
    result: '전체 통과 (변조 없음) | all passed (no tampering)',
  });
}

Promise.all([
  getSqliteDatabase().catch((e) => console.error('[Init] SQLite init failed:', e)),
  initCrypto().catch((e) => { console.error('[Init] Crypto init failed:', e); throw e; }),
]).then(async () => {
  if (import.meta.env.PROD) {
    await integrityCheck().catch((e) => {
      console.error('[IntegrityCheck] FAILED:', e);
      // SI-04 / TRE-01 test procedure requires the integrity-check failure itself to be
      // audit-logged (timestamp, target, result, reason) — not just blocked from the UI.
      tryWriteAuditLog({
        action: AUDIT_ACTIONS.INTEGRITY_CHECK_FAILED,
        targetType: 'system',
        detail: e.message || String(e),
      });
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