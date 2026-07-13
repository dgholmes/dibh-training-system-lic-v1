import { describe, it, expect } from 'vitest';
import { getLatestCalibration, sortCalibrationsDesc } from './sortCalibrations';

describe('getLatestCalibration', () => {
  it('returns null for an empty list', () => {
    expect(getLatestCalibration([])).toBeNull();
    expect(getLatestCalibration(undefined)).toBeNull();
  });

  it('picks the most recent calibration across different days', () => {
    const calibrations = [
      { id: 'a', calibration_date: '2026-07-08', created_at: '2026-07-08T09:00:00.000Z' },
      { id: 'b', calibration_date: '2026-07-10', created_at: '2026-07-10T09:00:00.000Z' },
      { id: 'c', calibration_date: '2026-07-09', created_at: '2026-07-09T09:00:00.000Z' },
    ];
    expect(getLatestCalibration(calibrations).id).toBe('b');
  });

  it('breaks same-day ties using created_at, not array order', () => {
    // All three calibrations were done on the same day (date-only field ties).
    // Array is in chronological creation order (oldest first), matching how
    // Calibration.create() appends to storage. The last one created (by
    // created_at) must win, regardless of its position in the array.
    const calibrations = [
      { id: 'morning', calibration_date: '2026-07-10', created_at: '2026-07-10T02:00:00.000Z' },
      { id: 'noon', calibration_date: '2026-07-10', created_at: '2026-07-10T05:00:00.000Z' },
      { id: 'evening', calibration_date: '2026-07-10', created_at: '2026-07-10T09:00:00.000Z' },
    ];
    expect(getLatestCalibration(calibrations).id).toBe('evening');
  });

  it('sortCalibrationsDesc orders same-day records by created_at, newest first', () => {
    const calibrations = [
      { id: 'morning', calibration_date: '2026-07-10', created_at: '2026-07-10T02:00:00.000Z' },
      { id: 'evening', calibration_date: '2026-07-10', created_at: '2026-07-10T09:00:00.000Z' },
      { id: 'noon', calibration_date: '2026-07-10', created_at: '2026-07-10T05:00:00.000Z' },
    ];
    expect(sortCalibrationsDesc(calibrations).map((c) => c.id)).toEqual(['evening', 'noon', 'morning']);
  });
});
