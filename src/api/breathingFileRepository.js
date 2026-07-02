import { format } from 'date-fns';
import { getSqliteDatabase, persistDb } from '@/db/sqliteDb';
import { upsertPatientRow } from '@/db/patientSqlite';
import { Patient } from './localStore';
import { sha256Hex } from '@/lib/crypto';

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} fileName */
function getExtensionWithDot(fileName) {
  const base = fileName.replace(/^.*[/\\]/, '');
  const i = base.lastIndexOf('.');
  if (i <= 0 || i === base.length - 1) return '';
  return base.slice(i).toLowerCase();
}

/**
 * Stored name: {patient_code}_{GEN|DIBH}_{YYYYMMDD}[_{seq}].ext
 * First file of the day/category/ext has no _seq; further uploads append _2, _3, …
 *
 * @param {{ patient_code?: string, id: string }} patient
 * @param {'general'|'dibh'} category
 * @param {string} sourceFileName
 * @param {string} importedAt ISO
 * @param {Array<{ original_name: string }>} existingSameCategory
 */
export function computeStoredBreathingFileName(
  patient,
  category,
  sourceFileName,
  importedAt,
  existingSameCategory
) {
  const rawCode = patient.patient_code && String(patient.patient_code).trim();
  const code =
    rawCode ||
    `PAT-${patient.id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12) || 'UNKNOWN'}`;
  const tag = category === 'general' ? 'GEN' : 'DIBH';
  const dateStr = format(new Date(importedAt), 'yyyyMMdd');
  let ext = getExtensionWithDot(sourceFileName);
  if (!ext) ext = '.bin';

  const base = `${code}_${tag}_${dateStr}`;
  const re = new RegExp(`^${escapeRegExp(base)}(?:_([0-9]+))?${escapeRegExp(ext)}$`);

  let maxSeq = 0;
  for (const row of existingSameCategory) {
    const m = row.original_name.match(re);
    if (m) {
      const n = m[1] ? parseInt(m[1], 10) : 1;
      if (!Number.isNaN(n)) maxSeq = Math.max(maxSeq, n);
    }
  }

  return maxSeq === 0 ? `${base}${ext}` : `${base}_${maxSeq + 1}${ext}`;
}

/**
 * Persist uploaded breathing data files (CSV / VXP bytes) in SQLite. Analysis uses CSV only until VXP decoding exists.
 * List views omit BLOB content for performance.
 */

export async function createBreathingFile({ patientId, category, file }) {
  if (!file || !(file instanceof Blob)) {
    throw new Error('createBreathingFile: expected Blob/File');
  }
  // Must exist in SQLite before breathing_files INSERT (FK). Patient.create only schedules upsertPatientRow.
  const patient = await Patient.get(patientId);
  if (!patient) {
    throw new Error(
      `createBreathingFile: patient "${patientId}" not found in local storage; cannot save file`
    );
  }
  await upsertPatientRow(patient);
  const buf = await file.arrayBuffer();
  const id = genId();
  const importedAt = new Date().toISOString();
  const existingSameCategory = await listBreathingFilesByPatient(patientId, category);
  if (existingSameCategory.length >= 10) {
    const label = category === 'general' ? '일반호흡' : 'DIBH';
    throw new Error(
      `한 환자당 ${label} 데이터는 최대 10개까지만 보관할 수 있습니다. 오래된 데이터를 삭제한 뒤 다시 업로드해 주세요.`
    );
  }
  const storedName = computeStoredBreathingFileName(
    patient,
    category,
    file.name,
    importedAt,
    existingSameCategory
  );

  const contentHash = await sha256Hex(buf);

  const db = await getSqliteDatabase();
  db.run('PRAGMA foreign_keys = ON');
  // Add content_hash column if it doesn't exist yet (migration for existing installs)
  try { db.run(`ALTER TABLE breathing_files ADD COLUMN content_hash TEXT`); } catch { /* already exists */ }

  const stmt = db.prepare(
    `INSERT INTO breathing_files (id, patient_id, category, original_name, size_bytes, mime, imported_at, content, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  try {
    stmt.run([
      id,
      patientId,
      category,
      storedName,
      file.size,
      file.type || '',
      importedAt,
      new Uint8Array(buf),
      contentHash,
    ]);
  } catch (err) {
    stmt.free();
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`breathing_files INSERT failed: ${msg}`);
  }
  stmt.free();

  await persistDb(db);
  return {
    id,
    patient_id: patientId,
    category,
    original_name: storedName,
    size_bytes: file.size,
    mime: file.type || '',
    imported_at: importedAt,
  };
}

/** @param {'general'|'dibh'} category */
export async function listBreathingFilesByPatient(patientId, category) {
  const db = await getSqliteDatabase();

  const stmt = db.prepare(
    `SELECT id, patient_id, category, original_name, size_bytes, mime, imported_at
     FROM breathing_files WHERE patient_id = ? AND category = ?
     ORDER BY imported_at ASC`
  );
  const rows = [];
  try {
    stmt.bind([patientId, category]);
    while (stmt.step()) {
      const row = stmt.get();
      rows.push({
        id: row[0],
        patient_id: row[1],
        category: row[2],
        original_name: row[3],
        size_bytes: row[4],
        mime: row[5],
        imported_at: row[6],
      });
    }
  } finally {
    stmt.free();
  }
  return rows;
}

export async function listAllBreathingFilesByPatient(patientId) {
  const db = await getSqliteDatabase();
  const stmt = db.prepare(
    `SELECT id, patient_id, category, original_name, size_bytes, mime, imported_at
     FROM breathing_files WHERE patient_id = ?
     ORDER BY category, imported_at ASC`
  );
  const rows = [];
  try {
    stmt.bind([patientId]);
    while (stmt.step()) {
      const row = stmt.get();
      rows.push({
        id: row[0],
        patient_id: row[1],
        category: row[2],
        original_name: row[3],
        size_bytes: row[4],
        mime: row[5],
        imported_at: row[6],
      });
    }
  } finally {
    stmt.free();
  }
  return rows;
}

/** Load file bytes for analysis pipeline — verifies SHA-256 integrity (SI-04) */
export async function getBreathingFileContent(fileId) {
  const db = await getSqliteDatabase();
  const stmt = db.prepare(`SELECT content, original_name, mime, content_hash FROM breathing_files WHERE id = ?`);
  try {
    stmt.bind([fileId]);
    if (!stmt.step()) return null;
    const row = stmt.get();
    const content = row[0];
    const original_name = row[1];
    const mime = row[2];
    const storedHash = row[3];
    const u8 = content instanceof Uint8Array ? content : new Uint8Array(content);
    const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

    // Verify integrity if a stored hash exists
    if (storedHash) {
      const actualHash = await sha256Hex(buf);
      if (actualHash !== storedHash) {
        throw new Error(`파일 무결성 오류: 저장된 이후 파일이 변경되었습니다. (${original_name})`);
      }
    }

    return { arrayBuffer: buf, original_name, mime };
  } finally {
    stmt.free();
  }
}

export async function deleteBreathingFile(fileId) {
  const db = await getSqliteDatabase();
  db.run('DELETE FROM breathing_files WHERE id = ?', [fileId]);
  await persistDb(db);
}
