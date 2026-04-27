import { Patient } from '@/api/entities';

/** Next available `PT-{year}-{nnn}` code among all patients. */
export function nextPatientCode() {
  const year = new Date().getFullYear();
  const patients = Patient.list();
  let max = 0;
  for (const p of patients) {
    const m = String(p.patient_code || '').match(new RegExp(`^PT-${year}-(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `PT-${year}-${String(max + 1).padStart(3, '0')}`;
}
