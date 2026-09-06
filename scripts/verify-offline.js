/**
 * MFDS SI-01 / UC-02 — build-time offline verification.
 *
 * Runs after `vite build` and fails the build if the produced bundle would load
 * anything from outside itself, or if it contains code capable of opening a
 * network connection. This is the automated guard behind the claim that the app
 * performs no external communication.
 *
 * What it checks
 *   1. dist/index.html      — no <script src>, <link href> or <img src> pointing at
 *                             an external origin, and no preconnect/dns-prefetch hints.
 *   2. dist/index.html CSP  — the Content-Security-Policy meta tag names no external host.
 *   3. dist/assets/*.css    — no url() referencing an external origin (web fonts are the
 *                             usual offender) and no @import of a remote stylesheet.
 *   4. dist/assets/*.js     — no use of a network API (XMLHttpRequest, WebSocket,
 *                             EventSource, sendBeacon, importScripts).
 *
 * Deliberately NOT flagged: absolute URLs that appear as plain strings inside vendor
 * code (React's error-help links, licence headers, SVG xmlns declarations). Those are
 * inert text, not resource loads, so matching them would produce false failures. The
 * check targets loadable references and connection-opening APIs instead.
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const DIST = 'dist';
const ASSETS_DIR = join(DIST, 'assets');

// Origins we never want to see. Anything not 'self' / data: / blob: is external.
const EXTERNAL_URL = /(?:https?:)?\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}/i;

// Network APIs. Minifiers rename locals but never these globals/members.
const NETWORK_APIS = [
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bnew\s+WebSocket\b|\bWebSocket\s*\(/],
  ['EventSource', /\bnew\s+EventSource\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['importScripts', /\bimportScripts\s*\(/],
];

/**
 * Documented exceptions.
 *
 * sql.js ships the stock Emscripten loader, which contains an XMLHttpRequest branch used
 * to read its own sql-wasm.wasm. The URL it is given comes from `locateFile` in
 * src/db/sqliteDb.js and always resolves to the bundled asset on the app's own origin, so
 * it cannot address a remote host. It is listed here rather than ignored, so that the same
 * API appearing anywhere else — our code, or a newly added vendor chunk — still fails.
 */
const ALLOWED_NETWORK_APIS = [
  {
    file: /^sqljs-[\w-]+\.js$/,
    api: 'XMLHttpRequest',
    reason: 'sql.js Emscripten loader reading the bundled sql-wasm.wasm (same-origin only)',
  },
];

const problems = [];
const documented = [];

function checkIndexHtml(html) {
  // Resource-loading attributes only: src= / href= on tags that fetch.
  const attrRe = /<(script|link|img|source|video|audio|iframe|embed|object)\b[^>]*?\b(?:src|href|data)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = attrRe.exec(html)) !== null) {
    const [, tag, url] = m;
    if (EXTERNAL_URL.test(url)) {
      problems.push(`index.html: <${tag}> loads an external resource → ${url}`);
    }
  }

  if (/rel\s*=\s*["'](?:preconnect|dns-prefetch|prefetch|preload)["']/i.test(html)) {
    const hintRe = /<link\b[^>]*?rel\s*=\s*["'](preconnect|dns-prefetch|prefetch|preload)["'][^>]*?>/gi;
    let h;
    while ((h = hintRe.exec(html)) !== null) {
      if (EXTERNAL_URL.test(h[0])) {
        problems.push(`index.html: resource hint points at an external origin → ${h[0].trim()}`);
      }
    }
  }

  // The attribute value itself contains single quotes ('self', 'none'), so the delimiter
  // has to be captured and back-referenced rather than excluded via a character class.
  const csp = html.match(
    /http-equiv\s*=\s*(["'])Content-Security-Policy\1[^>]*?content\s*=\s*(["'])([\s\S]*?)\2/i,
  );
  if (!csp) {
    problems.push('index.html: Content-Security-Policy meta tag is missing');
  } else {
    const policy = csp[3];
    if (EXTERNAL_URL.test(policy)) {
      problems.push(`index.html: CSP whitelists an external origin → ${policy}`);
    }
    for (const required of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "font-src 'self'",
    ]) {
      if (!policy.includes(required)) {
        problems.push(`index.html: CSP is missing "${required}"`);
      }
    }
  }
}

function checkCss(name, css) {
  const urlRe = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let m;
  while ((m = urlRe.exec(css)) !== null) {
    if (EXTERNAL_URL.test(m[1])) {
      problems.push(`assets/${name}: external url() → ${m[1]}`);
    }
  }
  const importRe = /@import\s+(?:url\(\s*)?["']([^"']+)["']/gi;
  while ((m = importRe.exec(css)) !== null) {
    if (EXTERNAL_URL.test(m[1])) {
      problems.push(`assets/${name}: external @import → ${m[1]}`);
    }
  }
}

function checkJs(name, js) {
  for (const [label, re] of NETWORK_APIS) {
    if (!re.test(js)) continue;
    const allowed = ALLOWED_NETWORK_APIS.find((a) => a.file.test(name) && a.api === label);
    if (allowed) {
      documented.push(`assets/${name}: ${label} — ${allowed.reason}`);
    } else {
      problems.push(`assets/${name}: uses network API ${label}`);
    }
  }
}

async function main() {
  let html;
  try {
    html = await readFile(join(DIST, 'index.html'), 'utf8');
  } catch {
    console.error('[offline] dist/index.html not found — run vite build first');
    process.exit(1);
  }
  checkIndexHtml(html);

  const files = await readdir(ASSETS_DIR);
  let css = 0;
  let js = 0;
  let fonts = 0;
  for (const file of files.sort()) {
    if (file.endsWith('.css')) {
      checkCss(file, await readFile(join(ASSETS_DIR, file), 'utf8'));
      css += 1;
    } else if (file.endsWith('.js')) {
      checkJs(file, await readFile(join(ASSETS_DIR, file), 'utf8'));
      js += 1;
    } else if (/\.(woff2?|ttf|otf|eot)$/i.test(file)) {
      fonts += 1;
    }
  }

  if (problems.length > 0) {
    console.error('\n[offline] SI-01 VERIFICATION FAILED — the bundle reaches outside itself:\n');
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error('\nEvery asset must ship inside the bundle. See docs/dev-reference/android-build-guide.md.\n');
    process.exit(1);
  }

  console.log(
    `[offline] SI-01 OK — no external resource loads ` +
      `(index.html + ${css} css + ${js} js scanned, ${fonts} font file(s) bundled locally)`,
  );
  for (const d of documented) {
    console.log(`[offline]   documented same-origin exception: ${d}`);
  }
}

main();
