/**
 * Offline SQLite (sql.js) with IndexedDB persistence.
 * Capacitor-native SQLite can replace this module later while keeping the same SQL schema.
 */
import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

const IDB_NAME = 'dibh_app';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'main';

let dbPromise = null;
let SQLModule = null;
let persistQueue = Promise.resolve();

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
  });
}

async function loadDbBinary() {
  const idb = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(IDB_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function saveDbBinary(data) {
  const idb = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function runMigrations(db) {
  db.run('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS breathing_files (
      id TEXT PRIMARY KEY NOT NULL,
      patient_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('general', 'dibh')),
      original_name TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      mime TEXT,
      imported_at TEXT NOT NULL,
      content BLOB,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_breathing_files_patient ON breathing_files(patient_id);
    CREATE INDEX IF NOT EXISTS idx_breathing_files_cat ON breathing_files(patient_id, category);
  `);
}

async function migrateLocalStoragePatientsOnce(db) {
  const countRes = db.exec(`SELECT COUNT(*) FROM patients`);
  const count = countRes[0]?.values[0]?.[0] ?? 0;
  if (count > 0) return;

  try {
    const raw = localStorage.getItem('dibh_patients');
    if (!raw) return;
    const patients = JSON.parse(raw);
    if (!Array.isArray(patients) || patients.length === 0) return;

    const stmt = db.prepare(
      `INSERT INTO patients (id, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`
    );
    for (const p of patients) {
      const now = new Date().toISOString();
      stmt.run([
        p.id,
        JSON.stringify(p),
        p.created_at || now,
        p.updated_at || now,
      ]);
    }
    stmt.free();
    persistDb(db);
  } catch (e) {
    console.warn('sqliteDb: localStorage patient migration skipped', e);
  }
}

export function persistDb(db) {
  // Serialize all IndexedDB writes to prevent older snapshots from overwriting newer ones.
  // The .catch(() => {}) ensures a failed write doesn't kill the entire queue.
  persistQueue = persistQueue.catch(() => {}).then(() => {
    const data = db.export();
    return saveDbBinary(data);
  });
  return persistQueue;
}

const CHUNK_SIZE = 8192; // avoids spreading a large Uint8Array into String.fromCharCode's arguments

export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Exports the entire SQLite DB (all tables) as a base64 string, for inclusion in an encrypted backup. */
export async function exportDbBinaryBase64() {
  const db = await getSqliteDatabase();
  return bytesToBase64(db.export());
}

/**
 * Imports a base64-encoded SQLite DB binary, replacing the current IndexedDB-persisted DB.
 * Validates the blob is a loadable SQLite DB before committing (throws on corrupt/invalid input).
 * Does NOT reconcile the in-memory getSqliteDatabase() singleton — callers must instruct the
 * user to refresh the page (same pattern already used for localStorage-based restore), which
 * resets all JS module state including the cached dbPromise.
 */
export async function importDbBinaryBase64(base64) {
  await getSqliteDatabase(); // ensures SQLModule is initialized
  const bytes = base64ToBytes(base64);
  new SQLModule.Database(bytes); // throws if corrupt/invalid — caller catches
  await saveDbBinary(bytes);
}

export async function getSqliteDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    if (!SQLModule) {
      SQLModule = await initSqlJs({ locateFile: () => sqlWasmUrl });
    }

    const existing = await loadDbBinary();
    const db = existing
      ? new SQLModule.Database(new Uint8Array(existing))
      : new SQLModule.Database();

    runMigrations(db);
    await migrateLocalStoragePatientsOnce(db);
    await persistDb(db);
    return db;
  })().catch((err) => {
    // Allow retry on next call instead of caching the failure forever.
    dbPromise = null;
    throw err;
  });

  return dbPromise;
}

export async function withTransaction(fn) {
  const db = await getSqliteDatabase();
  db.run('BEGIN');
  try {
    const result = await fn(db);
    db.run('COMMIT');
    await persistDb(db);
    return result;
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
}
