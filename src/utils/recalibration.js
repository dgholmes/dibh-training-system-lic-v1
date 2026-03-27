import { RECALIBRATION_CONFIG } from '@/config/recalibration';

/**
 * Calculate days between a date string and today
 * @param {string} dateString - ISO date string
 * @returns {number} - Number of days, or null if dateString is invalid
 */
export function calculateDaysSince(dateString) {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch (error) {
    console.error('Error calculating days since:', error);
    return null;
  }
}

/**
 * Get the calibration status of a patient
 * @param {Object} patient - Patient object
 * @param {Object} config - Configuration object (optional, uses default if not provided)
 * @returns {'valid' | 'expired' | 'needed' | null}
 */
export function getCalibrationStatus(patient, config = RECALIBRATION_CONFIG) {
  if (!patient) return null;
  
  // New patient - no calibration data
  if (!patient.training_type || !patient.last_calibration_date) {
    return null;
  }
  
  const daysSince = calculateDaysSince(patient.last_calibration_date);
  const sessionsSince = patient.sessions_since_calibration || 0;
  
  // Check if expired based on time
  if (daysSince !== null && daysSince > config.timeThresholdDays) {
    return 'expired';
  }
  
  // Check if expired based on sessions
  if (sessionsSince >= config.sessionThreshold) {
    return 'expired';
  }
  
  // Check if expiring soon (within 7 days of threshold or 3 sessions from threshold)
  if (daysSince !== null && daysSince > config.timeThresholdDays - 7) {
    return 'expiring';
  }
  
  if (sessionsSince >= config.sessionThreshold - 3) {
    return 'expiring';
  }
  
  // Valid calibration
  return 'valid';
}

/**
 * Check if a patient needs recalibration
 * @param {Object} patient - Patient object
 * @param {Object} config - Configuration object (optional)
 * @param {boolean} forceManual - Force recalibration (manual trigger)
 * @returns {boolean}
 */
export function needsRecalibration(patient, config = RECALIBRATION_CONFIG, forceManual = false) {
  if (forceManual) return true;
  
  if (!patient) return true;
  
  // New patient - needs calibration
  if (!patient.training_type || !patient.last_calibration_date) {
    return true;
  }
  
  const status = getCalibrationStatus(patient, config);
  return status === 'expired' || status === 'needed';
}

/**
 * Get the reason why recalibration is needed
 * @param {Object} patient - Patient object
 * @param {Object} config - Configuration object (optional)
 * @returns {string | null} - Reason string or null if not needed
 */
export function getRecalibrationReason(patient, config = RECALIBRATION_CONFIG) {
  if (!patient) return '환자 정보가 없습니다';
  
  // New patient
  if (!patient.training_type || !patient.last_calibration_date) {
    return '캘리브레이션이 필요합니다';
  }
  
  const daysSince = calculateDaysSince(patient.last_calibration_date);
  const sessionsSince = patient.sessions_since_calibration || 0;
  
  const reasons = [];
  
  if (daysSince !== null && daysSince > config.timeThresholdDays) {
    reasons.push(`${daysSince}일 경과 (${config.timeThresholdDays}일 기준)`);
  }
  
  if (sessionsSince >= config.sessionThreshold) {
    reasons.push(`${sessionsSince}회차 훈련 완료 (${config.sessionThreshold}회차 기준)`);
  }
  
  if (reasons.length === 0) {
    return null;
  }
  
  return reasons.join(', ');
}

/**
 * Get status color for UI display
 * @param {string} status - Status value ('valid' | 'expired' | 'needed' | null)
 * @returns {string} - Color hex code
 */
export function getStatusColor(status) {
  if (!status) return RECALIBRATION_CONFIG.statusColors.new;
  return RECALIBRATION_CONFIG.statusColors[status] || RECALIBRATION_CONFIG.statusColors.new;
}
