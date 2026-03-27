// Local storage-based data store to replace base44

import { upsertPatientRow, deletePatientRow } from '@/db/patientSqlite';

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

// Patient entity
export const Patient = {
  list: (sortBy = null) => {
    const patients = getStorageItem(STORAGE_KEYS.PATIENTS);
    
    if (sortBy) {
      // Handle sort order like '-last_training_date'
      const isDesc = sortBy.startsWith('-');
      const field = isDesc ? sortBy.substring(1) : sortBy;
      
      return [...patients].sort((a, b) => {
        const aVal = a[field] || '';
        const bVal = b[field] || '';
        
        if (isDesc) {
          return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
        } else {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        }
      });
    }
    
    return patients;
  },

  filter: (filters) => {
    const patients = getStorageItem(STORAGE_KEYS.PATIENTS);
    
    if (filters.id) {
      return patients.filter(p => p.id === filters.id);
    }
    
    // Support other filters if needed
    return patients.filter(patient => {
      return Object.keys(filters).every(key => {
        return patient[key] === filters[key];
      });
    });
  },

  get: (id) => {
    const patients = getStorageItem(STORAGE_KEYS.PATIENTS);
    return patients.find(p => p.id === id) || null;
  },

  create: (data) => {
    const patients = getStorageItem(STORAGE_KEYS.PATIENTS);
    const newPatient = {
      id: generateId(),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    patients.push(newPatient);
    setStorageItem(STORAGE_KEYS.PATIENTS, patients);
    void upsertPatientRow(newPatient).catch((e) => console.error('patientSqlite upsert', e));
    return newPatient;
  },

  update: (id, data) => {
    const patients = getStorageItem(STORAGE_KEYS.PATIENTS);
    const index = patients.findIndex(p => p.id === id);
    
    if (index === -1) {
      throw new Error(`Patient with id ${id} not found`);
    }
    
    patients[index] = {
      ...patients[index],
      ...data,
      updated_at: new Date().toISOString(),
    };
    setStorageItem(STORAGE_KEYS.PATIENTS, patients);
    void upsertPatientRow(patients[index]).catch((e) => console.error('patientSqlite upsert', e));
    return patients[index];
  },

  delete: (id) => {
    const patients = getStorageItem(STORAGE_KEYS.PATIENTS);
    const filtered = patients.filter(p => p.id !== id);
    setStorageItem(STORAGE_KEYS.PATIENTS, filtered);
    void deletePatientRow(id).catch((e) => console.error('patientSqlite delete', e));
    return true;
  },
};

// TrainingSession entity
export const TrainingSession = {
  list: (sortBy = null) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    
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
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    
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
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    return sessions.find(s => s.id === id) || null;
  },

  create: (data) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const newSession = {
      id: generateId(),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    sessions.push(newSession);
    setStorageItem(STORAGE_KEYS.TRAINING_SESSIONS, sessions);
    return newSession;
  },

  update: (id, data) => {
    const sessions = getStorageItem(STORAGE_KEYS.TRAINING_SESSIONS);
    const index = sessions.findIndex(s => s.id === id);
    
    if (index === -1) {
      throw new Error(`TrainingSession with id ${id} not found`);
    }
    
    sessions[index] = {
      ...sessions[index],
      ...data,
      updated_at: new Date().toISOString(),
    };
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

// Calibration entity
export const Calibration = {
  list: (sortBy = null) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    
    if (sortBy) {
      const isDesc = sortBy.startsWith('-');
      const field = isDesc ? sortBy.substring(1) : sortBy;
      
      return [...calibrations].sort((a, b) => {
        const aVal = a[field] || '';
        const bVal = b[field] || '';
        
        if (isDesc) {
          return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
        } else {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        }
      });
    }
    
    return calibrations;
  },

  filter: (filters) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    
    if (filters.id) {
      return calibrations.filter(c => c.id === filters.id);
    }
    
    return calibrations.filter(calibration => {
      return Object.keys(filters).every(key => {
        return calibration[key] === filters[key];
      });
    });
  },

  get: (id) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    return calibrations.find(c => c.id === id) || null;
  },

  create: (data) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const newCalibration = {
      id: generateId(),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    calibrations.push(newCalibration);
    setStorageItem(STORAGE_KEYS.CALIBRATIONS, calibrations);
    return newCalibration;
  },

  update: (id, data) => {
    const calibrations = getStorageItem(STORAGE_KEYS.CALIBRATIONS);
    const index = calibrations.findIndex(c => c.id === id);
    
    if (index === -1) {
      throw new Error(`Calibration with id ${id} not found`);
    }
    
    calibrations[index] = {
      ...calibrations[index],
      ...data,
      updated_at: new Date().toISOString(),
    };
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
  complete: (sessionId, results) => {
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

    const calibration = Calibration.create({
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
    const currentPatient = Patient.get(session.patient_id);
    if (currentPatient) {
      const currentCalibrationCount = currentPatient.calibration_count || 0;
      Patient.update(session.patient_id, {
        training_type: results.training_type,
        last_calibration_date: currentDate,
        calibration_count: currentCalibrationCount + 1,
        sessions_since_calibration: 0,
        calibration_status: 'valid'
      });
    }

    // Delete the session
    CalibrationSession.delete(sessionId);

    return calibration;
  },
};
