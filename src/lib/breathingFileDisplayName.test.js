import { describe, it, expect } from 'vitest';
import { breathingFileDisplayName } from './breathingFileDisplayName';

const PATIENT = { patient_code: 'PT-2026-001', name: '홍길동' };

describe('breathingFileDisplayName', () => {
  it('swaps the patient code for the patient name', () => {
    expect(breathingFileDisplayName('PT-2026-001_GEN_20260508.csv', PATIENT))
      .toBe('홍길동_GEN_20260508.csv');
    expect(breathingFileDisplayName('PT-2026-001_DIBH_20260508_2.vxp', PATIENT))
      .toBe('홍길동_DIBH_20260508_2.vxp');
  });

  it('leaves the name untouched when it does not start with the code', () => {
    expect(breathingFileDisplayName('TYPE_A_GEN_20260508.csv', PATIENT))
      .toBe('TYPE_A_GEN_20260508.csv');
    expect(breathingFileDisplayName('PT-2026-002_GEN_20260508.csv', PATIENT))
      .toBe('PT-2026-002_GEN_20260508.csv');
  });

  it('falls back to the stored name when the patient is unusable', () => {
    const stored = 'PT-2026-001_GEN_20260508.csv';
    expect(breathingFileDisplayName(stored, null)).toBe(stored);
    expect(breathingFileDisplayName(stored, {})).toBe(stored);
    expect(breathingFileDisplayName(stored, { patient_code: 'PT-2026-001' })).toBe(stored);
    expect(breathingFileDisplayName(stored, { name: '홍길동' })).toBe(stored);
  });

  it('never shows the decryption-failure placeholder as a filename', () => {
    const stored = 'PT-2026-001_GEN_20260508.csv';
    const broken = { patient_code: 'PT-2026-001', name: '[복호화 실패]', _decryptionFailed: true };
    expect(breathingFileDisplayName(stored, broken)).toBe(stored);
  });

  it('handles missing or malformed stored names', () => {
    expect(breathingFileDisplayName('', PATIENT)).toBe('');
    expect(breathingFileDisplayName(null, PATIENT)).toBe('');
    expect(breathingFileDisplayName(undefined, PATIENT)).toBe('');
  });
});
