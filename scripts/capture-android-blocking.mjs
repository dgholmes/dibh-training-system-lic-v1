/**
 * SI-07 / SI-04 — capture the startup blocking screens on a real Android build.
 *
 * These five messages cannot be produced in a browser:
 *
 *   암호화 키 오류        the sealed installation key is an Android Keystore path,
 *                        so a browser build never takes it (DC-03)
 *   무결성 검사 실패      integrityCheck() runs only under import.meta.env.PROD
 *
 * Screens are photographed with `adb exec-out screencap`, so the frame is the
 * device's own output including the status bar — not a WebView render.
 *
 * Usage:
 *   node scripts/capture-android-blocking.mjs <case> [outDir] [serial]
 *
 *   case = keyerror   corrupt the wrapped install key, then relaunch
 *          asis       photograph the app as currently installed
 *
 * A tampered-bundle APK produces the integrity screens; see the folder README
 * for how those builds are made.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CASE = process.argv[2] || 'asis';
const OUT = process.argv[3] || 'docs/submission/evidence/v1.1.7-error-list/screens';
const SERIAL = process.argv[4] || 'emulator-5626';
const ADB = join(homedir(), 'AppData/Local/Android/Sdk/platform-tools/adb.exe');
const PKG = 'com.thepict.dibhtraining';
const PORT = 9222;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (args, opts = {}) =>
  execFileSync(ADB, ['-s', SERIAL, ...args], { maxBuffer: 128 * 1024 * 1024, ...opts });
const adbText = (args) => adb(args, { encoding: 'utf8' });

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', res);
      this.ws.addEventListener('error', rej);
    });
    this.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.error) p.reject(new Error(JSON.stringify(m.error)));
      else p.resolve(m.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => this.pending.has(id) && (this.pending.delete(id), rej(new Error(`${method} timed out`))), 20000);
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'page error');
    return r.result?.value;
  }
}

/**
 * Forward the app's WebView debugging socket and attach to its page target.
 *
 * The socket name carries the process id, so it changes on every relaunch. The
 * old forward is torn down first and the socket belonging to the *current* pid
 * is chosen — otherwise this attaches to a dead target and hangs.
 */
async function attach() {
  try { adbText(['forward', '--remove', `tcp:${PORT}`]); } catch { /* none set */ }

  const pid = adbText(['shell', 'pidof', PKG]).trim().split(/\s+/)[0];
  if (!pid) throw new Error('app is not running');

  let socket = null;
  for (let i = 0; i < 20 && !socket; i += 1) {
    const names = adbText(['shell', 'cat', '/proc/net/unix'])
      .split(/\r?\n/)
      .map((l) => (l.match(/webview_devtools_remote_\d+/) || [])[0])
      .filter(Boolean);
    socket = names.find((n) => n.endsWith(`_${pid}`)) || null;
    if (!socket) await sleep(500);
  }
  if (!socket) throw new Error(`no WebView socket for pid ${pid} — debuggable build?`);
  adbText(['forward', `tcp:${PORT}`, `localabstract:${socket}`]);

  for (let i = 0; i < 40; i += 1) {
    await sleep(300);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page');
      if (!page) continue;
      const cdp = new Cdp(page.webSocketDebuggerUrl);
      // Never wait forever on a stale target.
      await Promise.race([
        cdp.ready,
        new Promise((_, rej) => setTimeout(() => rej(new Error('ws open timed out')), 4000)),
      ]);
      await cdp.send('Runtime.enable');
      return cdp;
    } catch { /* try the next poll */ }
  }
  throw new Error('WebView target never appeared');
}

/**
 * The tablet is used in portrait; make the emulator match before capturing.
 * A Tab S6 AVD is landscape-native, so rotation 0 is landscape and 1 is the
 * portrait we want — 1600x2560 rather than 2560x1600.
 */
function forcePortrait() {
  try {
    adbText(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
    adbText(['shell', 'settings', 'put', 'system', 'user_rotation', '1']);
  } catch { /* best effort */ }
}

function screencap(file) {
  const png = adb(['exec-out', 'screencap', '-p']);
  writeFileSync(join(OUT, file), png);
  return png.length;
}

const relaunch = async () => {
  adbText(['shell', 'am', 'force-stop', PKG]);
  await sleep(1200);
  adbText(['shell', 'am', 'start', '-n', `${PKG}/.MainActivity`]);
  await sleep(6000);
};

mkdirSync(OUT, { recursive: true });
forcePortrait();
await sleep(2000);

if (CASE === 'keyerror') {
  // Replace the wrapped key with something that cannot be unwrapped. DC-03
  // requires the app to fail closed here rather than mint a replacement, which
  // would leave every stored record permanently undecryptable.
  let cdp = await attach();
  const before = await cdp.evaluate(`return Object.keys(localStorage).join(',');`);
  console.log('storage keys before:', before);

  // Reload rather than force-stop: the WebView flushes localStorage to LevelDB
  // asynchronously, so killing the process can discard the write before it lands.
  // A reload re-runs main.jsx against the corrupted key in the same process.
  await cdp.evaluate(`
    localStorage.setItem('dibh_install_key_v2', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    setTimeout(() => location.reload(), 200);
    return true;
  `);
  await sleep(9000);

  cdp = await attach();
  const stored = await cdp.evaluate(`return (localStorage.getItem('dibh_install_key_v2') || '').slice(0, 12);`);
  console.log('key value after reload starts with:', stored);
  const text = await cdp.evaluate(`return (document.body.innerText || '').slice(0, 400);`);
  console.log('\n--- screen after relaunch ---\n' + text + '\n');
  const bytes = screencap('M001_암호화_키_오류_실기기.png');
  console.log(`captured M001 (${bytes} bytes)`);
} else {
  const cdp = await attach();
  const text = await cdp.evaluate(`return (document.body.innerText || '').slice(0, 400);`);
  console.log('--- current screen ---\n' + text);
  const bytes = screencap('android-asis.png');
  console.log(`captured (${bytes} bytes)`);
}

// The CDP socket keeps the event loop alive; nothing left to wait for.
process.exit(0);
