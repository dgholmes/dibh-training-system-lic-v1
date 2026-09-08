import { describe, it, expect } from 'vitest';
import { normalizeBirthDateInput, formatBirthDateForDisplay } from './birthDate';

const TODAY = new Date(2026, 8, 8); // 2026-09-08, local

describe('normalizeBirthDateInput', () => {
  it('accepts the primary 8-digit form', () => {
    expect(normalizeBirthDateInput('19900512', TODAY)).toBe('1990-05-12');
    expect(normalizeBirthDateInput('20001231', TODAY)).toBe('2000-12-31');
  });

  it('accepts separators and normalizes them away', () => {
    expect(normalizeBirthDateInput('1990-05-12', TODAY)).toBe('1990-05-12');
    expect(normalizeBirthDateInput('1990.05.12', TODAY)).toBe('1990-05-12');
    expect(normalizeBirthDateInput('1990/05/12', TODAY)).toBe('1990-05-12');
    expect(normalizeBirthDateInput(' 1990 05 12 ', TODAY)).toBe('1990-05-12');
  });

  it('rejects dates that do not exist', () => {
    expect(normalizeBirthDateInput('19900231', TODAY)).toBeNull(); // Feb 31
    expect(normalizeBirthDateInput('19901301', TODAY)).toBeNull(); // month 13
    expect(normalizeBirthDateInput('19900500', TODAY)).toBeNull(); // day 0
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(normalizeBirthDateInput('20000229', TODAY)).toBe('2000-02-29');
    expect(normalizeBirthDateInput('19000229', TODAY)).toBeNull();
  });

  it('rejects future dates', () => {
    expect(normalizeBirthDateInput('20260909', TODAY)).toBeNull();
    expect(normalizeBirthDateInput('20260908', TODAY)).toBe('2026-09-08'); // today is allowed
  });

  it('rejects years before 1900', () => {
    expect(normalizeBirthDateInput('18991231', TODAY)).toBeNull();
    expect(normalizeBirthDateInput('19000101', TODAY)).toBe('1900-01-01');
  });

  it('rejects wrong-length and non-numeric input', () => {
    expect(normalizeBirthDateInput('199005', TODAY)).toBeNull();
    expect(normalizeBirthDateInput('199005123', TODAY)).toBeNull();
    expect(normalizeBirthDateInput('abcdefgh', TODAY)).toBeNull();
    expect(normalizeBirthDateInput('', TODAY)).toBeNull();
    expect(normalizeBirthDateInput(null, TODAY)).toBeNull();
  });
});

describe('formatBirthDateForDisplay', () => {
  it('renders a stored ISO date as yyyy-MM-dd', () => {
    expect(formatBirthDateForDisplay('1990-05-12')).toBe('1990-05-12');
  });

  it('returns an empty string for missing or malformed values', () => {
    expect(formatBirthDateForDisplay('')).toBe('');
    expect(formatBirthDateForDisplay(null)).toBe('');
    expect(formatBirthDateForDisplay('not-a-date')).toBe('');
  });
});
