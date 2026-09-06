/**
 * MFDS SI-01 (통신 무결성 / no external communication) and UC-02 (모바일 코드 사용 통제)
 * regression guard.
 *
 * The device is certified as an offline-only medical device: it must have no capability
 * to communicate, not merely no intention to. These assertions fail the moment a font
 * CDN, analytics snippet, HTTP client or the INTERNET permission is reintroduced.
 *
 * Companion checks:
 *   - scripts/verify-offline.js scans the *built* bundle (runs as part of `npm run build`)
 *   - this file scans the *sources* and the Android manifest
 */

import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** Every external origin previously referenced by the app, plus common analytics hosts. */
const FORBIDDEN_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'google-analytics.com',
  'googletagmanager.com',
  'sentry.io',
];

/** Packages that would give the app the ability to open a connection. */
const FORBIDDEN_DEPENDENCIES = [
  'axios',
  'node-fetch',
  'superagent',
  'got',
  'ky',
  'socket.io-client',
  'ws',
  'mqtt',
  '@capacitor/http',
  '@capacitor-community/http',
  'firebase',
  '@sentry/browser',
];

function collectSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (/\.(jsx?|css)$/.test(entry) && !/\.test\.jsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('SI-01 — the app has no external communication capability', () => {
  it('declares no INTERNET permission in the Android manifest', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const declared = [...manifest.matchAll(/<uses-permission[^>]*android:name\s*=\s*"([^"]+)"/g)]
      .map((m) => m[1])
      // A commented-out block is documentation, not a declaration.
      .filter((name) => !manifest.includes(`<!--`) || manifest.split(name).length > 1);

    expect(manifest).not.toMatch(/^\s*<uses-permission[^>]*android\.permission\.INTERNET/m);
    expect(declared).not.toContain('android.permission.INTERNET');
  });

  it('disables Android cloud backup so encrypted PHI never leaves the device', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/android:allowBackup\s*=\s*"false"/);
  });

  it('opts the WebView out of Safe Browsing and metrics reporting', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/android\.webkit\.WebView\.EnableSafeBrowsing"\s+android:value="false"/);
    expect(manifest).toMatch(/android\.webkit\.WebView\.MetricsOptOut"\s+android:value="true"/);
  });

  it('ships no networking dependency', () => {
    const pkg = JSON.parse(read('package.json'));
    const installed = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const forbidden of FORBIDDEN_DEPENDENCIES) {
      expect(installed).not.toContain(forbidden);
    }
  });

  it('references no external host from index.html or any source file', () => {
    const files = ['index.html', ...collectSourceFiles(join(root, 'src'))];
    for (const file of files) {
      const content = file === 'index.html' ? read('index.html') : readFileSync(file, 'utf8');
      for (const host of FORBIDDEN_HOSTS) {
        expect(`${file}: ${content.includes(host) ? host : 'clean'}`).toBe(`${file}: clean`);
      }
    }
  });

  it('uses no connection-opening browser API in application code', () => {
    for (const file of collectSourceFiles(join(root, 'src'))) {
      const content = readFileSync(file, 'utf8');
      for (const api of ['XMLHttpRequest', 'new WebSocket', 'EventSource(', 'sendBeacon']) {
        expect(`${file}: ${content.includes(api) ? api : 'clean'}`).toBe(`${file}: clean`);
      }
    }
  });

  it('only ever fetches same-origin, relative paths', () => {
    for (const file of collectSourceFiles(join(root, 'src'))) {
      const content = readFileSync(file, 'utf8');
      for (const match of content.matchAll(/fetch\(\s*(['"`])([^'"`]*)\1/g)) {
        expect(match[2]).not.toMatch(/^(?:https?:)?\/\//);
      }
    }
  });
});

describe('UC-02 — mobile code execution is restricted to the bundle', () => {
  const cspOf = (html) =>
    html.match(/http-equiv="Content-Security-Policy"\s*[\r\n\s]*content="([^"]+)"/)?.[1] ?? '';

  it('defines a Content-Security-Policy that whitelists no external origin', () => {
    const csp = cspOf(read('index.html'));
    expect(csp).not.toBe('');
    expect(csp).not.toMatch(/https?:\/\//);
    for (const host of FORBIDDEN_HOSTS) {
      expect(csp).not.toContain(host);
    }
  });

  it('locks down the directives that control code execution and exfiltration', () => {
    const csp = cspOf(read('index.html'));
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
      "frame-src 'none'",
      "connect-src 'self' blob:",
      "font-src 'self'",
    ]) {
      expect(csp).toContain(directive);
    }
  });

  it('keeps the dev-server CSP in step with the shipped one', () => {
    const viteConfig = read('vite.config.js');
    expect(viteConfig).not.toMatch(/"(?:style|font|connect|script|img)-src[^"]*https?:\/\//);
    expect(viteConfig).toContain("frame-ancestors 'none'");
  });

  it('loads no script from public/ that is not part of the build', () => {
    const html = read('index.html');
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
    // The Vite entry module is the only permitted script tag.
    expect(scripts).toEqual(['/src/main.jsx']);
  });
});
