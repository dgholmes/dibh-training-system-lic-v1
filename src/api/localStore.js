// Local storage-based data store to replace base44

import { upsertPatientRow, deletePatientRow } from '@/db/patientSqlite';
import { tryWriteAuditLog, AUDIT_ACTIONS } from './auditStore';
import { encryptPatient, decryptPatient, computeRecordHash } from '@/lib/crypto';

const STORAGE_KEYS = {
  PATIENTS: 'dibh_patients',
  TRAINING_SESSIONS: 'dibh_training_sessions',
  CALIBRATIONS: 'dibh_calibrations',
  CALIBRATION_SESSIONS: 'dibh_calibration_sessions',
};

// Helper functions for localStorage
const getStorageItem = (key, defaultValue = []) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error(`Error reading ${key} from localStorage:`, error);
    return defaultValue;
  }
};

const setStorageItem = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error writing ${key} to localStorage:`, error);
  }
};

// Generate unique ID
const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Patient entity — PII fields (name, birth_date, assigned_doctor_name) are AES-256-GCM
// encrypted at rest inside an `_enc` blob. Non-PII fields stay plain for filtering/sorting.
export const Patient = {
  // Sync list of raw (encrypted) records — used only by nextPatientCode() which reads patient_code only.
  listRaw: () => getStorageItem(STORAGE_KEYS.PATIENTS),

  async list(sortBy = null) {
    const raw = getStorageItem(STORAGE_KEYS.PATIENTS);
    const decrypted = await Promise.all(raw.map(decryptPatient));
    if (!sortBy) return decrypted;
    const isDesc = sortBy.startsWith('-');
    const field = isDesc ? sortBy.slice(1) : sortBy;
    return [...decrypted].sort((a, b) => {
      const av = a[field] || '', bv = b[field] || '';
      return isDesc ? (bv > av ? 1 : bv < av ? -1 : 0) : (av > bv ? 1 : av < bv ? -1 : 0);
    });
  },

  async filter(filters) {
    const raw = getStorageItem(STORAGE_KEYS.PATIENTS);
    // Filter on non-encrypted fields first (fast), then decrypt matched records
    const PII = ['name', 'birth_date', 'assigned_doctor_name'];
    const nonPiiFilters = Object.fromEntries(Object.entries(filters).filter(([k]) => !PII.includes(k)));
    const piiFilters = Object.fromEntries(Object.entries(filters).filter(([k]) => PII.includes(k)));

    const preFiltered = Object.keys(nonPiiFilters).length
      ? raw.filter(p => Object.entries(nonPiiFilters).every(([k, v]) => p[k] === v))
      : raw;

    const decrypted = await Promise.all(preFiltered.map(decryptPatient));

    if (!Object.keys(piiFilters).length) return decrypted;
    return decrypted.filter(p => Object.entries(piiFilters).every(([k, v]) => p[k] === v));
  },

  async get(id) {
    const raw = getStorageItem(STORAGE_KEYS.PATIENTS);
    const found = raw.find(p => p.id === id) || null;
    return found ? decryptPatient(found) : null;
  },

  async create(data) {
    const patients = getStorageItem(STORAGE_KEYS.PATIENTS);
    const plain = { id: generateId(), ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const encrypted = await encryptPatient(plain);
    patients.push(encrypted);
    setStorageItem(STORAGE_KEYS.PATIENTS, patients);
    void upsertPatientRow(encrypted).catch((e) => console.error('patientSqlite upsert', e));
    tryWriteAuditLog({ action: AUDIT_ACTIONS.PATIENT_CREATED, targetType: 'patient', targetId: plain.id, detail: plain.patient_code });
    return plain;
  },

  async update(id, data) {
    const patients = getStorageItem(STORAGE_KEYS.PATIENTS);
    const index = patients.findIndex(p => p.id === id);
    if (index === -1) throw new Error(`Patient with id ${id} not found`);
    const existing = await decryptPatient(patients[index]);
    const merged = { ...existing, ...data, updated_at: new Date().toISOString() };
    patients[index] = await encryptPatient(merged);
    setStorageItem(STORAGE_KEYS.PATIENTS, patients);
    void upsertPatientRow(patients[index]).catch((e) => console.error('patientSqlite upsert', e));
    tryWriteAuditLog({ action: AUDIT_ACTIONS.PATIENT_UPDATED, targetType: 'patient', targetId: id, detail: merged.patient_code });
    return merged;
  },

  delete(id) {
    const patients = getStorageItem(STORAGE_KEYS.PATIENTS);
    setStorageItem(STORAGE_KEYS.PATIENTS, patients.filter(p => p.id !== id));
    void deletePatientRow(id).catch((e) => console.error('patientSqlite delete', e));
    tryWriteAuditLog({ action: AUDIT_ACTIONS.PATIENT_DELETED, targetType: 'patient', targetId: id });
    return true;
  },
};

// Shared integrity-check helper for plaintext (non-PII) record types that only
// need tamper detection, not encryption (training sessions, calibrations).
async function verifyRecord(record, targetType) {
  if (!record) return record;
  if (!record._hash) return record; // legacy record — unverified, not flagged
  const expected = await computeRecordHash(record);
  if (expected === record._hash) return record;
  tryWriteAuditLog({
    action: AUDIT_ACTIONS.DATA_INTEGRITY_FAILED,
    targetType,
    targetId: record.id,
    detail: `${targetType} record hash mismatch — possible tampering`,
  });
  return { ...record, _integrityFailed: true };
}

async function verifyRecords(records, targetType) {
  return Promise.all(records.map((r) => verifyRecord(r, targetType)));
}

// TrainingSession entity — SHA-256 integrity-hashed (no encryption required for this data type)
export const TrainingSession = {
  list: async (sortBy = null) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const verified = await verifyRecords(sessions, 'training_session');

    if (sortBy) {
      const isDesc = sortBy.startsWith('-');
      const field = isDesc ? sortBy.substring(1) : sortBy;

      return [...verified].sort((a, b) => {
        const aVal = a[field] || '';
        const bVal = b[field] || '';

        if (isDesc) {
          return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
        } else {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        }
      });
    }

    return verified;
  },

  filter: async (filters) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const verified = await verifyRecords(sessions, 'training_session');

    if (filters.id) {
      return verified.filter(s => s.id === filters.id);
    }

    return verified.filter(session => {
      return Object.keys(filters).every(key => {
        return session[key] === filters[key];
      });
    });
  },

  get: async (id) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const found = sessions.find(s => s.id === id) || null;
    return found ? verifyRecord(found, 'training_session') : null;
  },

  create: async (data) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const newSession = {
      id: generateId(),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    newSession._hash = await computeRecordHash(newSession);
    sessions.push(newSession);
    setStorageItem(STORAGE_KEYS.TRAINING_SESSIONS, sessions);
    return newSession;
  },

  update: async (id, data) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const index = sessions.findIndex(s => s.id === id);

    if (index === -1) {
      throw new Error(`TrainingSession with id ${id} not found`);
    }

    const updated = {
      ...sessions[index],
      ...data,
      updated_at: new Date().toISOString(),
    };
    updated._hash = await computeRecordHash(updated);
    sessions[index] = updated;
    setStorageItem(STORAGE_KEYS.TRAINING_SESSIONS, sessions);
    return sessions[index];
  },

  delete: (id) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const filtered = sessions.filter(s => s.id !== id);
    setStorageItem(STORAGE_KEYS.TRAINING_SESSIONS, filtered);
    return true;
  },
};

// Calibration entity — SHA-256 integrity-hashed (no encryption required for this data type)
export const Calibration = {
  list: async (sortBy = null) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const verified = await verifyRecords(calibrations, 'calibration');

    if (sortBy) {
      const isDesc = sortBy.startsWith('-');
      const field = isDesc ? sortBy.substring(1) : sortBy;

      return [...verified].sort((a, b) => {
        const aVal = a[field] || '';
        const bVal = b[field] || '';

        if (isDesc) {
          return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
        } else {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        }
      });
    }

    return verified;
  },

  filter: async (filters) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const verified = await verifyRecords(calibrations, 'calibration');

    if (filters.id) {
      return verified.filter(c => c.id === filters.id);
    }

    return verified.filter(calibration => {
      return Object.keys(filters).every(key => {
        return calibration[key] === filters[key];
      });
    });
  },

  get: async (id) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const found = calibrations.find(c => c.id === id) || null;
    return found ? verifyRecord(found, 'calibration') : null;
  },

  create: async (data) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const newCalibration = {
      id: generateId(),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    newCalibration._hash = await computeRecordHash(newCalibration);
    calibrations.push(newCalibration);
    setStorageItem(STORAGE_KEYS.CALIBRATIONS, calibrations);
    return newCalibration;
  },

  update: async (id, data) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const index = calibrations.findIndex(c => c.id === id);

    if (index === -1) {
      throw new Error(`Calibration with id ${id} not found`);
    }

    const updated = {
      ...calibrations[index],
      ...data,
      updated_at: new Date().toISOString(),
    };
    updated._hash = await computeRecordHash(updated);
    calibrations[index] = updated;
    setStorageItem(STORAGE_KEYS.CALIBRATIONS, calibrations);
    return calibrations[index];
  },

  delete: (id) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const filtered = calibrations.filter(c => c.id !== id);
    setStorageItem(STORAGE_KEYS.CALIBRATIONS, filtered);
    return true;
  },
};

// CalibrationSession entity
export const CalibrationSession = {
  list: (sortBy = null) => {
    const sessions = getStorageItem(STORAGE_KEYS.CALIBRATION_SESSIONS);
    
    if (sortBy) {
      const isDesc = sortBy.startsWith('-');
      const field = isDesc ? sortBy.substring(1) : sortBy;
      
      return [...sessions].sort((a, b) => {
        const aVal = a[field] || '';
        const bVal = b[field] || '';
        
        if (isDesc) {
          return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
        } else {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        }
      });
    }
    
    return sessions;
  },

  filter: (filters) => {
    const sessions = getStorageItem(STORAGE_KEYS.CALIBRATION_SESSIONS);
    
    if (filters.id) {
      return sessions.filter(s => s.id === filters.id);
    }
    
    return sessions.filter(session => {
      return Object.keys(filters).every(key => {
        return session[key] === filters[key];
      });
    });
  },

  get: (id) => {
    const sessions = getStorageItem(STORAGE_KEYS.CALIBRATION_SESSIONS);
    return sessions.find(s => s.id === id) || null;
  },

  create: (data) => {
    const sessions = getStorageItem(STORAGE_KEYS.CALIBRATION_SESSIONS);
    const newSession = {
      id: generateId(),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    sessions.push(newSession);
    setStorageItem(STORAGE_KEYS.CALIBRATION_SESSIONS, sessions);
    return newSession;
  },

  update: (id, data) => {
    const sessions = getStorageItem(STORAGE_KEYS.CALIBRATION_SESSIONS);
    const index = sessions.findIndex(s => s.id === id);
    
    if (index === -1) {
      throw new Error(`CalibrationSession with id ${id} not found`);
    }
    
    sessions[index] = {
      ...sessions[index],
      ...data,
      updated_at: new Date().toISOString(),
    };
    setStorageItem(STORAGE_KEYS.CALIBRATION_SESSIONS, sessions);
    return sessions[index];
  },

  delete: (id) => {
    const sessions = getStorageItem(STORAGE_KEYS.CALIBRATION_SESSIONS);
    const filtered = sessions.filter(s => s.id !== id);
    setStorageItem(STORAGE_KEYS.CALIBRATION_SESSIONS, filtered);
    return true;
  },

  // Complete a session - convert to Calibration record
  complete: async (sessionId, results) => {
    const session = CalibrationSession.get(sessionId);
    if (!session) {
      throw new Error(`CalibrationSession with id ${sessionId} not found`);
    }

    const currentDate = new Date().toISOString().split('T')[0];

    // Create Calibration record
    const {
      training_type,
      dibh_duration,
      cv,
      algorithm_results,
      ...calibrationExtras
    } = results;

    const calibration = await Calibration.create({
      patient_id: session.patient_id,
      calibration_date: currentDate,
      training_type,
      dibh_duration,
      cv,
      algorithm_results: algorithm_results || {},
      stage_data: session.stage_data || {},
      ...calibrationExtras,
    });

    // Update patient with calibration data
    const currentPatient = await Patient.get(session.patient_id);
    if (currentPatient) {
      const currentCalibrationCount = currentPatient.calibration_count || 0;
      await Patient.update(session.patient_id, {
        training_type: results.training_type,
        last_calibration_date: currentDate,
        calibration_count: currentCalibrationCount + 1,
        sessions_since_calibration: 0,
        calibration_status: 'valid'
      });
    }

    // Delete the session
    CalibrationSession.delete(sessionId);

    tryWriteAuditLog({
      action: AUDIT_ACTIONS.ANALYSIS_RUN,
      targetType: 'calibration',
      targetId: calibration.id,
      detail: `patient: ${session.patient_id}, type: ${training_type}, cv: ${cv}`,
    });

    return calibration;
  },
};
