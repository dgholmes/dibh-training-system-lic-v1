import { describe, it, expect } from 'vitest';
import { parseCsv, parseVxp, parseBreathingFile, detectDibhHolds } from './analyzeFiles.js';

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

describe('detectDibhHolds', () => {
  /** Build a flat→ramp→hold→ramp→flat signal at 25 Hz. */
  function buildHoldSignal({ baselineVal = 10, holdVal = 20, holdSec = 20 } = {}) {
    const samples = [];
    const push = (t, raw) => samples.push({ t: parseFloat(t.toFixed(6)), raw });
    // 4s baseline
    for (let i = 0; i < 100; i++) push(i * 0.04, baselineVal);
    // 2s inhale ramp
    for (let i = 0; i < 50; i++) push(4 + i * 0.04, baselineVal + (i / 49) * (holdVal - baselineVal));
    // holdSec hold
    for (let i = 0; i < Math.round(holdSec / 0.04); i++) push(6 + i * 0.04, holdVal);
    // 1s exhale ramp
    for (let i = 0; i < 25; i++) push(6 + holdSec + i * 0.04, holdVal - (i / 24) * (holdVal - baselineVal));
    // 2s tail
    for (let i = 0; i < 50; i++) push(7 + holdSec + i * 0.04, baselineVal);
    return samples;
  }

  it('detects a single valid hold and returns correct duration', async () => {
    const samples = buildHoldSignal({ holdSec: 20 });
    // maxAmp=10 → hold_th=10+0.8*10=18, release_th=10+0.5*10=15
    const { holds, baseline, holdTh, releaseTh } = await detectDibhHolds(samples, 10);
    expect(holds.length).toBe(1);
    expect(holds[0].hold_duration).toBeGreaterThan(15);
    expect(holds[0].valid).toBe(true);
    expect(baseline).toBeCloseTo(10, 0);
    expect(holdTh).toBeCloseTo(18, 0);
    expect(releaseTh).toBeCloseTo(15, 0);
  });

  it('detects multiple holds in one file', async () => {
    const single = buildHoldSignal({ holdSec: 15 });
    const offset = single[single.length - 1].t + 1;
    const second = single.map(({ t, raw }) => ({ t: parseFloat((t + offset).toFixed(6)), raw }));
    const samples = [...single, ...second];
    const { holds } = await detectDibhHolds(samples, 10);
    expect(holds.length).toBe(2);
    expect(holds[0].hold_duration).toBeGreaterThan(10);
    expect(holds[1].hold_duration).toBeGreaterThan(10);
  });

  it('ignores holds shorter than 3 seconds', async () => {
    const samples = buildHoldSignal({ holdSec: 2 }); // 2s < min_hold_sec=3s
    const { holds } = await detectDibhHolds(samples, 10);
    expect(holds.length).toBe(0);
  });

  it('returns no holds when signal never crosses hold_th', async () => {
    // Sine wave peaking at 15 — hold_th=18 with maxAmp=10, never reached
    const samples = [];
    for (let i = 0; i < 300; i++) {
      const t = i * 0.04;
      samples.push({ t, raw: 10 + 5 * Math.sin(2 * Math.PI * t / 5) });
    }
    const { holds } = await detectDibhHolds(samples, 10);
    expect(holds.length).toBe(0);
  });

  it('chartData covers the full signal with smoothed values', async () => {
    const samples = buildHoldSignal({ holdSec: 10 });
    const { chartData } = await detectDibhHolds(samples, 10);
    expect(chartData.length).toBe(samples.length);
    expect(chartData[0]).toHaveProperty('time');
    expect(chartData[0]).toHaveProperty('value');
  });
});
