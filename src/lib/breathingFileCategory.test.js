import { describe, it, expect } from 'vitest';
import {
  detectCategoryFromFileName,
  buildUploadConfirmItems,
  countCategoryMismatches,
} from './breathingFileCategory';

describe('detectCategoryFromFileName', () => {
  it('reads the GEN token from the real sample names', () => {
    expect(detectCategoryFromFileName('TYPE_A_GEN_20260508.csv')).toBe('general');
    expect(detectCategoryFromFileName('TYPE_B_GEN_20260508.vxp')).toBe('general');
    expect(detectCategoryFromFileName('PT-2026-001_GEN_20260508.csv')).toBe('general');
  });

  it('reads the DIBH token from the real sample names', () => {
    expect(detectCategoryFromFileName('TYPE_A_DIBH_20260508.csv')).toBe('dibh');
    expect(detectCategoryFromFileName('TYPE_C_DIBH_20260508.vxp')).toBe('dibh');
    expect(detectCategoryFromFileName('PT-2026-001_DIBH_20260508_2.csv')).toBe('dibh');
  });

  it('treats normal/general/free as general', () => {
    expect(detectCategoryFromFileName('synth_patient_1_normal.vxp')).toBe('general');
    expect(detectCategoryFromFileName('patient-general-0508.csv')).toBe('general');
    expect(detectCategoryFromFileName('free breathing 0508.csv')).toBe('general');
  });

  it('is case-insensitive', () => {
    expect(detectCategoryFromFileName('synth_patient_1_dibh.vxp')).toBe('dibh');
    expect(detectCategoryFromFileName('Type_A_Gen_20260508.csv')).toBe('general');
  });

  it('returns null when no token is present', () => {
    expect(detectCategoryFromFileName('breathing_2026.csv')).toBeNull();
    expect(detectCategoryFromFileName('20260508.vxp')).toBeNull();
  });

  it('returns null when both tokens are present rather than guessing', () => {
    expect(detectCategoryFromFileName('GEN_DIBH_compare.csv')).toBeNull();
    expect(detectCategoryFromFileName('normal_vs_dibh.csv')).toBeNull();
  });

  it('requires token boundaries — no substring matches', () => {
    expect(detectCategoryFromFileName('NONDIBH_0508.csv')).toBeNull();
    expect(detectCategoryFromFileName('REGENERATED_0508.csv')).toBeNull();
    expect(detectCategoryFromFileName('GENERATOR.csv')).toBeNull();
  });

  it('handles missing and malformed input without throwing', () => {
    expect(detectCategoryFromFileName('')).toBeNull();
    expect(detectCategoryFromFileName('   ')).toBeNull();
    expect(detectCategoryFromFileName(null)).toBeNull();
    expect(detectCategoryFromFileName(undefined)).toBeNull();
    expect(detectCategoryFromFileName(42)).toBeNull();
  });
});

describe('buildUploadConfirmItems', () => {
  const asFiles = (...names) => names.map((name) => ({ name }));

  it('pairs every file with its destination and its detected category', () => {
    const items = buildUploadConfirmItems(
      asFiles('TYPE_A_GEN_20260508.csv', 'TYPE_A_DIBH_20260508.csv'),
      'general'
    );
    expect(items).toEqual([
      { name: 'TYPE_A_GEN_20260508.csv', category: 'general', detected: 'general' },
      { name: 'TYPE_A_DIBH_20260508.csv', category: 'general', detected: 'dibh' },
    ]);
  });

  it('leaves detected null when the filename says nothing', () => {
    const items = buildUploadConfirmItems(asFiles('breathing_2026.csv'), 'dibh');
    expect(items).toEqual([{ name: 'breathing_2026.csv', category: 'dibh', detected: null }]);
  });

  it('returns an empty list for no files', () => {
    expect(buildUploadConfirmItems([], 'general')).toEqual([]);
  });
});

describe('countCategoryMismatches', () => {
  it('counts only files whose filename contradicts the destination', () => {
    const items = [
      { name: 'a_GEN.csv', category: 'general', detected: 'general' },
      { name: 'b_DIBH.csv', category: 'general', detected: 'dibh' },
      { name: 'c_DIBH.csv', category: 'dibh', detected: 'dibh' },
      { name: 'd_GEN.csv', category: 'dibh', detected: 'general' },
    ];
    expect(countCategoryMismatches(items)).toBe(2);
  });

  it('never counts an unreadable filename as a mismatch', () => {
    const items = [
      { name: 'x.csv', category: 'general', detected: null },
      { name: 'y.csv', category: 'dibh', detected: null },
    ];
    expect(countCategoryMismatches(items)).toBe(0);
  });

  it('is zero when everything agrees', () => {
    expect(
      countCategoryMismatches([{ name: 'a_GEN.csv', category: 'general', detected: 'general' }])
    ).toBe(0);
  });
});
