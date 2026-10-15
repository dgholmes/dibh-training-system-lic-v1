import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeFiles } from './analyzeFiles.js';

vi.mock('@/api/breathingFileRepository', () => ({
  getBreathingFileContent: vi.fn(),
}));

import { getBreathingFileContent } from '@/api/breathingFileRepository';

function toBuf(csv) {
  return new TextEncoder().encode(csv).buffer;
}

/** Many breath cycles for Stage 1 (t in seconds, raw ~ tidal sine). */
function buildGeneralCsv() {
  const rows = [];
  for (let i = 0; i <= 2500; i++) {
    const t = i * 0.05;
    const raw = 50 + 8 * Math.sin(t * 1.1);
    rows.push(`${t.toFixed(3)},${raw.toFixed(4)}`);
  }
  return rows.join('\n');
}

/** DIBH segment: inhale then plateau (Stage 3 looks for hold). */
function buildDibhCsv() {
  const rows = [];
  let t = 0;
  const dt = 0.05;
  for (let i = 0; i < 800; i++) {
    let raw;
    if (t < 4) raw = 50 + (t / 4) * 25;
    else if (t < 18) raw = 75;
    else raw = 75 - (t - 18) * 2;
    rows.push(`${t.toFixed(3)},${raw.toFixed(4)}`);
    t += dt;
  }
  return rows.join('\n');
}

describe('analyzeFiles (mocked files)', () => {
  beforeEach(() => {
    vi.mocked(getBreathingFileContent).mockImplementation(async (id) => {
      if (id === 'gen-mock') {
        return {
          arrayBuffer: toBuf(buildGeneralCsv()),
          original_name: 'P001_GEN_20260101.csv',
          mime: 'text/csv',
        };
      }
      if (id === 'dibh-mock') {
        return {
          arrayBuffer: toBuf(buildDibhCsv()),
          original_name: 'P001_DIBH_20260101.csv',
          mime: 'text/csv',
        };
      }
      return null;
    });
  });

  it('returns trainingType A/B/C, numeric cv and avgDibh, and file_analysis playback', async () => {
    const result = await analyzeFiles('gen-mock', 'dibh-mock');
    expect(['A', 'B', 'C']).toContain(result.trainingType);
    expect(result.cv).not.toBeNull();
    // A classified result always carries both metrics — a missing one aborts the analysis instead.
    expect(typeof result.avgDibh).toBe('number');
    expect(result.source).toBe('file_analysis');
    expect(result.playback?.source).toBe('file_analysis');
    expect(result.playback?.general?.chartData?.length).toBeGreaterThan(0);
    expect(result.playback?.dibh?.chartData?.length).toBeGreaterThan(0);
    expect(result.algorithmResults.stage2).toBeNull();
  });

  // Regression: a missing metric used to be coerced to 0, so a general file with
  // no usable cycles (CV null → 0%) next to a long DIBH hold came out as Type A.
  it('refuses to classify when the general file has no usable breathing cycles', async () => {
    const flat = Array.from({ length: 2501 }, (_, i) => `${(i * 0.05).toFixed(3)},50.0000`).join('\n');
    vi.mocked(getBreathingFileContent).mockImplementation(async (id) => {
      if (id === 'flat-gen') {
        return { arrayBuffer: toBuf(flat), original_name: 'P001_GEN_20260101.csv', mime: 'text/csv' };
      }
      if (id === 'dibh-mock') {
        return { arrayBuffer: toBuf(buildDibhCsv()), original_name: 'P001_DIBH_20260101.csv', mime: 'text/csv' };
      }
      return null;
    });
    await expect(analyzeFiles('flat-gen', 'dibh-mock')).rejects.toThrow(/호흡 주기를 충분히 검출하지 못해/);
  });

  it('refuses to classify when the DIBH file has no breath-hold', async () => {
    vi.mocked(getBreathingFileContent).mockImplementation(async (id) => {
      if (id === 'gen-mock' || id === 'no-hold-dibh') {
        return {
          arrayBuffer: toBuf(buildGeneralCsv()),
          original_name: id === 'gen-mock' ? 'P001_GEN_20260101.csv' : 'P001_DIBH_20260101.csv',
          mime: 'text/csv',
        };
      }
      return null;
    });
    await expect(analyzeFiles('gen-mock', 'no-hold-dibh')).rejects.toThrow(/숨참기\(hold\) 구간을 검출하지 못해/);
  });

  it('accepts VXP general file and runs analysis without error', async () => {
    const vxpContent =
      '[Header]\nData_layout=amplitude,phase,timestamp,validflag,ttlin,mark,ttlout\n[Data]\n' +
      Array.from({ length: 2501 }, (_, i) => {
        const tMs = i * 40;
        const amp = 50 + 8 * Math.sin((tMs / 1000) * 1.1);
        return `${amp.toFixed(4)},0.0,${tMs},0,1,,0`;
      }).join('\n') +
      '\n';
    vi.mocked(getBreathingFileContent).mockImplementation(async (id) => {
      if (id === 'vxp-gen') {
        return {
          arrayBuffer: toBuf(vxpContent),
          original_name: 'P001_GEN_20260101.vxp',
          mime: 'application/octet-stream',
        };
      }
      if (id === 'ok-dibh') {
        return {
          arrayBuffer: toBuf(buildDibhCsv()),
          original_name: 'P001_DIBH_20260101.csv',
          mime: 'text/csv',
        };
      }
      return null;
    });
    const result = await analyzeFiles('vxp-gen', 'ok-dibh');
    expect(['A', 'B', 'C']).toContain(result.trainingType);
    expect(result.cv).not.toBeNull();
    expect(result.source).toBe('file_analysis');
  });
});
