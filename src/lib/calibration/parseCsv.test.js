import { describe, it, expect } from 'vitest';
import { parseCsv } from './analyzeFiles.js';

describe('parseCsv', () => {
  it('parses numeric rows and skips non-numeric header-like lines', () => {
    const text = `ignored header
0,1.5
0.1,1.6,9.9,0.1
`;
    const buf = new TextEncoder().encode(text).buffer;
    const samples = parseCsv(buf);
    expect(samples.length).toBe(2);
    expect(samples[0]).toMatchObject({ t: 0, raw: 1.5 });
    expect(samples[1]).toMatchObject({ t: 0.1, raw: 1.6, filtered: 9.9, dy: 0.1 });
  });
});
