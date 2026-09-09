/**
 * SI-07 — capture user-facing messages as they actually occur.
 *
 * Unlike scripts/capture-error-screens.mjs, which renders each message through the
 * /debug/errors harness, this drives the real screens: it seeds the state a message
 * needs, performs the actions an operator would, and photographs whatever the app
 * puts on screen. Nothing is simulated — every frame is the real component in the
 * real page, reached the real way.
 *
 * Viewport is the Galaxy Tab S6 in portrait. The panel is 1600x2560, but the app
 * lays out against CSS pixels, which at DPR 2 is 800x1280; screenshots are captured
 * at deviceScaleFactor 2 so the PNG comes out at the panel's own resolution.
 *
 * Transport is the Chrome DevTools Protocol over Node's built-in WebSocket, so this
 * adds no dependency — same reason the existing capture script works that way.
 *
 * Usage:
 *   node scripts/capture-real-conditions.mjs [outDir] [baseUrl]
 *
 * Requires a dev server (npm run dev) or a preview server already running.
 */
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'docs/submission/evidence/v1.1.7-error-list/screens';
const BASE = (process.argv[3] || 'http://localhost:5180').replace(/\/$/, '');
const PORT = 9333;
const CHROME =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE = join(process.env.TEMP || '/tmp', `dibh-capture-${Date.now()}`);

// Galaxy Tab S6, portrait. CSS pixels; the PNG is 2x this.
const VIEW = { width: 800, height: 1280, deviceScaleFactor: 2, mobile: true };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── CDP ──────────────────────────────────────────────────────────────────── */

class Cdp {
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
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 30000);
    });
  }

  /** Evaluate in the page and return the value. Throws page-side errors. */
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || 'page error');
    }
    return r.result?.value;
  }
}

/* ── page helpers, injected once per navigation ───────────────────────────── */

const HELPERS = `
window.__h = {
  // React tracks its own value on the DOM node, so assigning .value directly is
  // ignored. Go through the native setter and fire the event React listens for.
  set(sel, value) {
    const el = document.querySelector(sel);
    if (!el) throw new Error('no element: ' + sel);
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  },
  click(sel) {
    const el = document.querySelector(sel);
    if (!el) throw new Error('no element: ' + sel);
    el.click();
    return true;
  },
  // Click the first element whose trimmed text matches, searching leaf-first so a
  // button is preferred over the container that happens to include its text.
  clickText(text, sel) {
    const nodes = [...document.querySelectorAll(sel || 'button, a, [role="button"], [role="option"]')];
    const hit = nodes.reverse().find((n) => (n.textContent || '').trim().includes(text));
    if (!hit) throw new Error('no element with text: ' + text);
    hit.click();
    return true;
  },
  has(text) { return (document.body.innerText || '').includes(text); },
  // React listens for focusout at the root, and 'blur' does not bubble — a
  // synthetic Event('blur') is invisible to it. Focus then blur for real, and
  // also emit focusout directly so this holds even if the page is unfocused.
  blur(sel) {
    const el = document.querySelector(sel);
    if (!el) throw new Error('no element: ' + sel);
    el.focus();
    el.blur();
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    return true;
  },
};
true;
`;

/* ── driver ───────────────────────────────────────────────────────────────── */

let chrome;
let cdp;
const results = [];

async function connect() {
  mkdirSync(PROFILE, { recursive: true });
  chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,MediaRouter',
      `--window-size=${VIEW.width},${VIEW.height}`,
      'about:blank',
    ],
    { stdio: 'ignore', detached: false },
  );

  let target = null;
  for (let i = 0; i < 60 && !target; i += 1) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      target = list.find((t) => t.type === 'page');
    } catch {
      /* not up yet */
    }
  }
  if (!target) throw new Error('Chrome did not expose a debugging target');

  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', VIEW);
  // Headless pages are unfocused, so element.focus() is a no-op and blur() never
  // fires. Without this the app's onBlur validation can never run.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
}

async function goto(path) {
  await cdp.send('Page.navigate', { url: `${BASE}${path}` });
  await sleep(1500);
  await cdp.evaluate(HELPERS);
  // IA-08 usage notice stands in front of the login form on every fresh load.
  await cdp.evaluate(`
    if (window.__h.has('시스템 사용 알림')) {
      try { window.__h.clickText('확인하고 계속하기'); } catch {}
    }
    return true;
  `);
  await sleep(600);
}

/** Wipe app state so each case starts from a known place. */
async function reset() {
  await goto('/login');
  await cdp.evaluate(`
    localStorage.clear(); sessionStorage.clear();
    try { indexedDB.deleteDatabase('dibh'); } catch {}
    return true;
  `);
  await goto('/login');
}

async function shoot(id, name) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  const safe = name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 70);
  const file = `${id}_${safe}.png`;
  writeFileSync(join(OUT, file), Buffer.from(data, 'base64'));
  return file;
}

/**
 * Run one case. `expect` is text that must be on screen for the shot to count —
 * a screenshot of a message that never appeared is worse than no screenshot.
 */
async function capture({ id, num, name, expect, setup }) {
  try {
    await setup();
    const seen = expect ? await cdp.evaluate(`return window.__h.has(${JSON.stringify(expect)});`) : true;
    const file = await shoot(id, name);
    // Record everything visible, not just the string we checked — a frame often
    // carries several catalogued messages, and coverage has to be countable.
    const screenText = await cdp.evaluate(`return (document.body.innerText || '').slice(0, 4000);`);
    results.push({ id, num, name, file, verified: seen, expect, screenText });
    console.log(`${seen ? '  ok ' : ' MISS'} ${id}  ${name}`);
  } catch (err) {
    results.push({ id, num, name, file: null, verified: false, error: String(err.message || err) });
    console.log(` FAIL ${id}  ${name}  — ${err.message}`);
  }
}

export { capture, cdp, connect, goto, reset, results, sleep, shoot, OUT, PROFILE, chrome };

/* ── entry ────────────────────────────────────────────────────────────────── */

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(OUT, { recursive: true });
  const { runCases } = await import('./capture-real-conditions.cases.mjs');
  await connect();
  try {
    await runCases({ capture, cdp, goto, reset, sleep });
  } finally {
    try { chrome.kill(); } catch { /* already gone */ }
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* leave it */ }
  }
  writeFileSync(join(OUT, '..', 'capture-results.json'), JSON.stringify(results, null, 2), 'utf8');
  const ok = results.filter((r) => r.verified).length;
  console.log(`\ncaptured ${ok}/${results.length} verified`);
  const missed = results.filter((r) => !r.verified);
  if (missed.length) {
    console.log('\nnot verified:');
    missed.forEach((r) => console.log(`  ${r.id} ${r.name} ${r.error ? '— ' + r.error : '(message not on screen)'}`));
  }
}
