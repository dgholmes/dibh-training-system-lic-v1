import { describe, it, expect } from 'vitest';
import { detectCategoryFromFileName } from './breathingFileCategory';

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
