/**
 * SI-04 Build-time integrity manifest generator.
 * Run automatically after `vite build` — writes dist/integrity.json
 * containing SHA-256 hashes of all JS, CSS, and WASM assets (e.g. the
 * sql.js SQLite engine binary that sqliteDb.js loads at runtime).
 *
 * At runtime, main.jsx fetches this manifest and re-hashes each file
 * to detect tampering before the app mounts.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import { join } from 'path';

const ASSETS_DIR = 'dist/assets';
const OUTPUT = 'dist/integrity.json';

async function main() {
  let files;
  try {
    files = await readdir(ASSETS_DIR);
  } catch {
    console.error('[integrity] dist/assets not found — run vite build first');
    process.exit(1);
  }

  const manifest = {};
  for (const file of files.sort()) {
    if (!file.endsWith('.js') && !file.endsWith('.css') && !file.endsWith('.wasm')) continue;
    const content = await readFile(join(ASSETS_DIR, file));
    const hash = createHash('sha256').update(content).digest('hex');
    manifest[`/assets/${file}`] = hash;
    console.log(`  [integrity] hashed: ${file}`);
  }

  const output = {
    generated: new Date().toISOString(),
    files: manifest,
  };

  await writeFile(OUTPUT, JSON.stringify(output, null, 2));
  console.log(`[integrity] manifest written → ${OUTPUT} (${Object.keys(manifest).length} files)`);
}

main();
