import { getSqliteDatabase, persistDb } from './sqliteDb';

/**
 * Keeps SQLite `patients` row in sync with localStorage-backed Patient records.
 */
export async function upsertPatientRow(patient) {
  if (!patient?.id) return;
  const db = await getSqliteDatabase();
  db.run('PRAGMA foreign_keys = ON');
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO patients (id, payload, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`
  );
  stmt.run([
    patient.id,
    JSON.stringify(patient),
    patient.created_at || now,
    patient.updated_at || now,
  ]);
  stmt.free();
  await persistDb(db);
}

export async function deletePatientRow(patientId) {
  const db = await getSqliteDatabase();
  db.run('PRAGMA foreign_keys = ON');
  db.run('DELETE FROM patients WHERE id = ?', [patientId]);
  await persistDb(db);
}
