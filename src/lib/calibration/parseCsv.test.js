import { describe, it, expect } from 'vitest';
import { parseCsv, parseVxp, parseBreathingFile } from './analyzeFiles.js';

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

describe('parseVxp', () => {
  function toVxpBuf(headerExtra, dataLines) {
    const text =
      '[Header]\nData_layout=amplitude,phase,timestamp,validflag,ttlin,mark,ttlout\n' +
      headerExtra +
      '[Data]\n' +
      dataLines.join('\n') +
      '\n';
    return new TextEncoder().encode(text).buffer;
  }

  it('parses data rows and converts timestamp ms to seconds', () => {
    const buf = toVxpBuf('', [
      '-13.1569,1.0799,0,0,1,,0',
      '-13.1208,1.1781,40,0,1,,0',
      '-13.1050,1.2763,80,0,1,,0',
    ]);
    const samples = parseVxp(buf);
    expect(samples.length).toBe(3);
    expect(samples[0]).toMatchObject({ t: 0, raw: -13.1569 });
    expect(samples[1].t).toBeCloseTo(0.04);
    expect(samples[1].raw).toBe(-13.1208);
    expect(samples[2].t).toBeCloseTo(0.08);
  });

  it('skips blank lines and non-numeric rows in [Data]', () => {
    const buf = toVxpBuf('', [
      '-13.1569,1.0799,0,0,1,,0',
      '',
      'not,a,data,row',
      '-13.1208,1.1781,40,0,1,,0',
    ]);
    const samples = parseVxp(buf);
    expect(samples.length).toBe(2);
  });

  it('throws if [Data] section is missing', () => {
    const text = '[Header]\nVersion=1.6\nSome_key=val\n';
    const buf = new TextEncoder().encode(text).buffer;
    expect(() => parseVxp(buf)).toThrow('VXP 파일에서 [Data] 섹션을 찾을 수 없습니다.');
  });

  it('falls back to column indices 0,2 when Data_layout is absent', () => {
    const text = '[Header]\n[Data]\n-5.0,0.0,200,0,1,,0\n';
    const buf = new TextEncoder().encode(text).buffer;
    const samples = parseVxp(buf);
    expect(samples.length).toBe(1);
    expect(samples[0].raw).toBe(-5.0);
    expect(samples[0].t).toBeCloseTo(0.2);
  });
});

describe('parseBreathingFile', () => {
  it('dispatches to parseVxp for .vxp filename', () => {
    const text =
      '[Header]\nData_layout=amplitude,phase,timestamp,validflag,ttlin,mark,ttlout\n[Data]\n-1.0,0,0,0,1,,0\n';
    const buf = new TextEncoder().encode(text).buffer;
    const samples = parseBreathingFile(buf, 'PT001_GEN_20260101.vxp');
    expect(samples.length).toBe(1);
    expect(samples[0]).toMatchObject({ t: 0, raw: -1.0 });
  });

  it('dispatches to parseCsv for .csv filename', () => {
    const text = '0.0,5.0\n0.04,5.1\n';
    const buf = new TextEncoder().encode(text).buffer;
    const samples = parseBreathingFile(buf, 'PT001_GEN_20260101.csv');
    expect(samples.length).toBe(2);
    expect(samples[0]).toMatchObject({ t: 0, raw: 5.0 });
  });
});
