import { describe, it, expect } from 'vitest';
import { determineDibhType } from './determineDibhType.js';

describe('determineDibhType', () => {
  it('classifies Type A when hold long and CV low', () => {
    expect(determineDibhType(15, 14.9)).toBe('A');
    expect(determineDibhType(20, 0)).toBe('A');
  });

  it('classifies Type C when hold short or CV high', () => {
    expect(determineDibhType(9.9, 10)).toBe('C');
    expect(determineDibhType(20, 30)).toBe('C');
  });

  it('classifies Type B for intermediate cases', () => {
    expect(determineDibhType(12, 20)).toBe('B');
    expect(determineDibhType(14, 20)).toBe('B');
  });

  it('returns null for invalid inputs', () => {
    expect(determineDibhType(null, 10)).toBeNull();
    expect(determineDibhType(15, NaN)).toBeNull();
  });
});
