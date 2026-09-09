import { encryptValue, decryptValue } from '@/lib/crypto';

/**
 * Doctor names typed through 직접 입력, remembered so they can be picked again.
 *
 * The 담당 의사 dropdown is primarily a list of registered accounts (#3 exists
 * to stop free-text spelling variants). This roster covers the case an account
 * cannot: a physician with no login who is recorded across many patients, where
 * retyping the name every time is both tedious and its own source of variants.
 *
 * Two things keep the list from becoming the duplication problem again:
 * entries are matched case-insensitively with whitespace collapsed, and the
 * roster is capped and ordered by recency so a one-off typo falls off instead
 * of living forever.
 *
 * Stored as a single AES-256-GCM blob, matching `assigned_doctor_name` on the
 * patient record — the same names, so the same protection. The blob is wrapped
 * in a JSON envelope because AdminBackup JSON.parses every key it backs up; a
 * bare `enc:` string there would break backup creation outright.
 */

const STORAGE_KEY = 'dibh_doctor_roster';

/** Beyond this the oldest entry is dropped. */
export const MAX_ROSTER_ENTRIES = 20;

/** Writes are read-modify-write, so serialize them (cf. mutateUsers in authStore). */
let writeQueue = Promise.resolve();

/** Case and inner whitespace are not meaningful differences between two names. */
function identity(name) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalize(name) {
  return name.trim().replace(/\s+/g, ' ');
}

/** @returns {Promise<Array<{name: string, lastUsedAt: string}>>} */
async function readEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const envelope = JSON.parse(raw);
    if (!envelope || typeof envelope.data !== 'string') return [];
    const parsed = JSON.parse(await decryptValue(envelope.data));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Unreadable blob (key changed, corrupted). The roster is a convenience,
    // never a record of care — start over rather than block the field.
    console.warn('[doctorRoster] roster could not be read; treating as empty');
    return [];
  }
}

async function writeEntries(entries) {
  const envelope = { v: 1, data: await encryptValue(JSON.stringify(entries)) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

/**
 * Names previously entered by hand, most recently used first.
 * @returns {Promise<string[]>}
 */
export async function listDoctorRoster() {
  const entries = await readEntries();
  return entries
    .slice()
    .sort((a, b) => String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')))
    .map((e) => e.name);
}

/**
 * Record a hand-entered name. Called when a patient is saved, not while typing,
 * so only names actually committed to a record are remembered.
 *
 * @param {string} name
 */
export async function rememberDoctorName(name) {
  if (typeof name !== 'string') return;
  const clean = normalize(name);
  if (!clean) return;

  writeQueue = writeQueue.then(async () => {
    const entries = await readEntries();
    const key = identity(clean);
    // Keep the newest spelling of a name we already know.
    const others = entries.filter((e) => identity(String(e.name ?? '')) !== key);
    const next = [{ name: clean, lastUsedAt: new Date().toISOString() }, ...others]
      .sort((a, b) => String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')))
      .slice(0, MAX_ROSTER_ENTRIES);
    await writeEntries(next);
  });

  return writeQueue;
}

/**
 * Drop a remembered name. The roster is a convenience list, so an operator can
 * clear out a mistyped entry without waiting for it to age off the cap.
 *
 * Only the roster is touched — a patient already assigned this doctor keeps
 * the name on their record, and the field falls back to showing it as free
 * text.
 *
 * @param {string} name
 */
export async function forgetDoctorName(name) {
  if (typeof name !== 'string') return;
  const clean = normalize(name);
  if (!clean) return;

  writeQueue = writeQueue.then(async () => {
    const entries = await readEntries();
    const key = identity(clean);
    const next = entries.filter((e) => identity(String(e.name ?? '')) !== key);
    if (next.length !== entries.length) await writeEntries(next);
  });

  return writeQueue;
}
