/**
 * Shows a breathing file under the patient's name instead of the patient code
 * — a formative-evaluation request (#10).
 *
 * Display only. The stored `original_name` keeps the code, because
 * `breathing_files.original_name` is a plaintext column and its value is
 * copied into `Calibration.source_files`, which is not encrypted either.
 * Writing the name there would put PII in the clear in two stores
 * (RM-DBF-003). The patient's name is already decrypted in memory for the
 * rest of the screen, so composing it here costs nothing.
 *
 * @param {string} storedName e.g. 'PT-2026-001_GEN_20260508.csv'
 * @param {{patient_code?: string, name?: string, _decryptionFailed?: boolean}|null} patient
 * @returns {string} e.g. '홍길동_GEN_20260508.csv'
 */
export function breathingFileDisplayName(storedName, patient) {
  if (typeof storedName !== 'string' || !storedName) return '';
  if (!patient || patient._decryptionFailed) return storedName;

  const code = patient.patient_code;
  const name = patient.name;
  if (!code || !name) return storedName;
  if (!storedName.startsWith(code)) return storedName;

  return `${name}${storedName.slice(code.length)}`;
}
