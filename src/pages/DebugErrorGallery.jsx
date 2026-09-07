/**
 * MFDS SI-07 — user-facing message evidence harness.
 *
 * Renders every message in `errorCatalog.generated.js` through the *same* UI components the
 * application uses at runtime (the real Toaster for toasts, the real blocking-screen markup
 * for startup failures), one at a time, so each can be screen-captured for the submission.
 *
 * This exists because several messages are reachable only under conditions that cannot be
 * staged by hand on demand — a corrupted asset hash, an unrecoverable Keystore key, a SQLite
 * write failure. Reproducing all of them through the UI would mean deliberately damaging the
 * installation between captures. The catalogue is generated from source, so this harness
 * cannot silently omit a message that the code can still produce.
 *
 * SECURITY_DEBUG-gated: the route is only registered in a debug build (VITE_DEBUG_MODE=true)
 * and must never be reachable in a production/submission build.
 */

import { useCallback, useEffect, useState } from 'react';

import { ERROR_CATALOG } from '@/debug/errorCatalog.generated.js';
import { SECURITY_DEBUG } from '@/lib/securityDebug';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';

/** Mirrors renderBlockingError() in main.jsx — the startup failure screen. */
function BlockingScreen({ heading, message, detail }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0D1117', padding: '2rem' }}>
      <div style={{ maxWidth: 480, border: '1px solid #EF4444', borderRadius: 16, background: '#1C2128', padding: '2rem', textAlign: 'center', color: 'white' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠</div>
        <h2 style={{ color: '#EF4444', marginBottom: '1rem' }}>{heading}</h2>
        <p style={{ color: '#C9D1D9', marginBottom: '0.5rem' }}>{message}</p>
        <p style={{ color: '#8B949E', fontSize: '0.85rem' }}>{detail}</p>
      </div>
    </div>
  );
}

/** Detail text shown under the blocking heading, matching each real call site. */
const BLOCKING_BODY = {
  '암호화 키 오류': [
    '저장된 암호화 키를 복구할 수 없습니다. 환자 데이터를 복호화할 수 없으므로 앱을 시작할 수 없습니다. 관리자에게 문의하십시오.',
    '[secureKey] Stored key could not be unwrapped (KEK_INVALIDATED).',
  ],
  '무결성 검사 실패': [
    '앱 파일의 무결성을 확인할 수 없습니다. 파일이 변조되었을 수 있습니다.',
    '무결성 검사 실패 (파일 변조 감지): /assets/index-a1b2c3d4.js',
  ],
  '보안 자가진단 실패': ['시스템 보안 기능을 초기화할 수 없습니다.', '암호화 자가진단 실패'],
};

export default function DebugErrorGallery() {
  const [index, setIndex] = useState(0);
  const entry = ERROR_CATALOG[index];

  const show = useCallback(
    (i) => {
      const n = Math.max(0, Math.min(ERROR_CATALOG.length - 1, Number(i) || 0));
      setIndex(n);
      return ERROR_CATALOG[n];
    },
    [],
  );

  // Capture harness drives the gallery from the DevTools protocol.
  useEffect(() => {
    if (!SECURITY_DEBUG) return undefined;
    window.__dibhShowError = show;
    window.__dibhErrorCount = ERROR_CATALOG.length;
    window.__dibhCatalog = ERROR_CATALOG;
    return () => {
      delete window.__dibhShowError;
      delete window.__dibhErrorCount;
      delete window.__dibhCatalog;
    };
  }, [show]);

  if (!SECURITY_DEBUG) return null;
  if (!entry) return <div className="p-8 text-[#C9D1D9]">catalog is empty</div>;

  if (entry.variant === 'blocking') {
    const [message, detail] = BLOCKING_BODY[entry.text] ?? ['', ''];
    return (
      <>
        <CaptureHeader entry={entry} index={index} />
        <BlockingScreen heading={entry.text} message={message} detail={detail} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pt-24">
      <CaptureHeader entry={entry} index={index} />
      {entry.variant === 'inline' && (
        <div className="mx-auto mt-24 max-w-xl rounded-xl border border-[#30363D] bg-[#161B22] p-6">
          <p className="mb-2 text-sm text-[#8B949E]">오류 메시지</p>
          <p className="text-base font-medium text-[#F85149]">{entry.text}</p>
        </div>
      )}
      {entry.variant === 'toast' && <ToastCapture entry={entry} />}
    </div>
  );
}

/**
 * Renders a single toast with the application's own Toast components — the same ones
 * `components/ui/toaster.jsx` uses — rather than pushing onto the global toast queue.
 *
 * The live queue keeps up to five toasts and holds dismissed ones for several seconds, so
 * driving it produced captures with three or four unrelated messages stacked together. This
 * renders exactly one message per capture, with identical markup and styling, and a duration
 * long enough that it cannot self-close mid-screenshot.
 */
function ToastCapture({ entry }) {
  return (
    <ToastProvider duration={86_400_000}>
      <Toast open variant={entry.toastVariant === 'destructive' ? 'destructive' : 'default'}>
        <div className="grid gap-1">
          <ToastTitle>{entry.text}</ToastTitle>
          {entry.description && <ToastDescription>{entry.description}</ToastDescription>}
        </div>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>
  );
}

/** Identifies the capture in the screenshot itself, so evidence cannot be mislabelled. */
function CaptureHeader({ entry, index }) {
  return (
    <div className="fixed left-0 top-6 z-[9998] w-full bg-[#161B22] px-4 py-2 text-center text-xs text-[#8B949E]">
      <span className="font-bold text-[#58A6FF]">{entry.id}</span>
      {' · '}
      {index + 1}/{ERROR_CATALOG.length}
      {' · '}
      {entry.variant}
      {' · '}
      <span className="text-[#6E7681]">{entry.source}</span>
    </div>
  );
}
