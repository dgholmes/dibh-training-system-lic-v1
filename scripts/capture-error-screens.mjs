/**
 * MFDS SI-07 — screenshot every user-facing message from a running debug build.
 *
 * Drives the SECURITY_DEBUG-only /debug/errors harness over the Chrome DevTools protocol
 * and captures one PNG per catalogue entry with `adb exec-out screencap`, then writes an
 * index (README.md + index.csv) mapping each file to its message and source location.
 *
 * Prerequisites
 *   - a DEBUG build (VITE_DEBUG_MODE=true) installed and running on the device
 *   - adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>   (done automatically)
 *
 * Usage: node scripts/capture-error-screens.mjs [outputDir] [adbSerial]
 */

import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const OUT_DIR = process.argv[2] || 'docs/submission/evidence/SI-07-error-messages';
const SERIAL = process.argv[3] || 'emulator-5626';
const ADB = join(homedir(), 'AppData/Local/Android/Sdk/platform-tools/adb.exe');
const PORT = 9222;

const adb = (args, opts = {}) =>
  execFileSync(ADB, ['-s', SERIAL, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal DevTools protocol client over the built-in WebSocket. */
class Devtools {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.result?.exceptionDetails) p.reject(new Error(JSON.stringify(msg.result.exceptionDetails)));
      else p.resolve(msg.result?.result);
    });
  }

  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => this.pending.has(id) && reject(new Error(`${method} timed out`)), 20000);
    });
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r?.value;
  }

  close() {
    this.ws.close();
  }
}

function slug(text) {
  return text
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
}

async function main() {
  // Locate the WebView and forward its DevTools socket.
  const unix = adb(['shell', 'cat', '/proc/net/unix']);
  const sock = unix.match(/webview_devtools_remote_\d+/)?.[0];
  if (!sock) throw new Error('No WebView DevTools socket. Is the DEBUG build running?');
  adb(['forward', `tcp:${PORT}`, `localabstract:${sock}`]);

  const pages = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json());
  const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
  if (!page) throw new Error('No debuggable page found');

  const dt = new Devtools(page.webSocketDebuggerUrl);
  await dt.ready;

  // Navigate to the harness without a reload (BrowserRouter listens for popstate).
  await dt.evaluate(`
    history.pushState({}, '', '/debug/errors');
    window.dispatchEvent(new PopStateEvent('popstate'));
    'ok'
  `);
  await sleep(1500);

  const count = await dt.evaluate('window.__dibhErrorCount ?? 0');
  if (!count) {
    throw new Error(
      'The /debug/errors harness is not present. This build is not a debug build ' +
        '(VITE_DEBUG_MODE=true), or the route was not registered.',
    );
  }
  const catalog = await dt.evaluate('JSON.stringify(window.__dibhCatalog)').then(JSON.parse);
  console.log(`[si07] harness reports ${count} messages`);

  mkdirSync(OUT_DIR, { recursive: true });
  const rows = [];

  for (let i = 0; i < count; i++) {
    const entry = await dt.evaluate(`JSON.stringify(window.__dibhShowError(${i}))`).then(JSON.parse);
    // Toast: 250ms dismiss gap + mount/animation. Static screens settle immediately.
    await sleep(entry.variant === 'toast' ? 1100 : 700);

    const name = `${String(i + 1).padStart(3, '0')}_${entry.id}_${slug(entry.text)}.png`;
    const png = execFileSync(ADB, ['-s', SERIAL, 'exec-out', 'screencap', '-p'], {
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'buffer',
    });
    writeFileSync(join(OUT_DIR, name), png);
    rows.push({ ...entry, file: name });
    console.log(`  [${i + 1}/${count}] ${entry.id} ${entry.variant.padEnd(8)} ${entry.text.slice(0, 46)}`);
  }

  dt.close();

  const csv = [
    'no,id,variant,file,message,description,source',
    ...rows.map((r, i) =>
      [
        i + 1,
        r.id,
        r.variant,
        r.file,
        `"${(r.text || '').replace(/"/g, '""')}"`,
        `"${(r.description || '').replace(/"/g, '""')}"`,
        r.source,
      ].join(','),
    ),
  ].join('\n');
  writeFileSync(join(OUT_DIR, 'index.csv'), `﻿${csv}`, 'utf8');

  const md = [
    '# SI-07 오류 메시지 화면 캡처 증적',
    '',
    `- 캡처 대상: ${rows.length}건 (전수)`,
    '- 캡처 환경: DIBH-Flow 디버그 빌드 (VITE_DEBUG_MODE=true), Galaxy Tab S6 에뮬레이터',
    '- 캡처 방식: `/debug/errors` 증적 하네스를 통해 각 메시지를 **실제 UI 컴포넌트**로 렌더링 후 캡처',
    '  (토스트는 실제 Toaster, 시작 차단 화면은 실제 차단 화면 마크업)',
    '- 메시지 목록은 `scripts/generate-error-catalog.js`가 **소스에서 자동 추출**하므로 누락이 발생하지 않습니다.',
    '- 각 캡처 상단에 메시지 ID·순번·표시형태·소스 위치가 함께 표시됩니다.',
    '',
    '> 본 하네스 화면은 `SECURITY_DEBUG` 빌드에서만 등록되며 프로덕션/제출 빌드에는 존재하지 않습니다.',
    '',
    '| No | ID | 표시형태 | 메시지 | 설명 | 소스 | 캡처 파일 |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r, i) =>
      `| ${i + 1} | ${r.id} | ${r.variant} | ${r.text} | ${r.description || ''} | \`${r.source}\` | ${r.file} |`,
    ),
    '',
  ].join('\n');
  writeFileSync(join(OUT_DIR, 'README.md'), md, 'utf8');

  console.log(`\n[si07] ${rows.length} screenshots + index.csv + README.md → ${OUT_DIR}`);
  if (rows.length !== catalog.length) {
    console.warn(`[si07] WARNING: captured ${rows.length} but catalogue has ${catalog.length}`);
  }
}

main().catch((e) => {
  console.error('[si07] FAILED:', e.message);
  process.exit(1);
});
