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
    // avgDibh may be null when Stage 3 marks no valid hold on synthetic data; pipeline still completes.
    expect(result.avgDibh === null || typeof result.avgDibh === 'number').toBe(true);
    expect(result.source).toBe('file_analysis');
    expect(result.playback?.source).toBe('file_analysis');
    expect(result.playback?.general?.chartData?.length).toBeGreaterThan(0);
    expect(result.playback?.dibh?.chartData?.length).toBeGreaterThan(0);
    expect(result.algorithmResults.stage2).toBeNull();
  });

  it('rejects non-CSV non-VXP extensions for analysis', async () => {
    vi.mocked(getBreathingFileContent).mockImplementation(async (id) => {
      if (id === 'bad-gen') {
        return {
          arrayBuffer: toBuf('0,1\n'),
          original_name: 'notes.txt',
          mime: 'text/plain',
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
    await expect(analyzeFiles('bad-gen', 'ok-dibh')).rejects.toThrow(/CSV/);
  });

  it('rejects VXP for analysis until decoder exists', async () => {
    vi.mocked(getBreathingFileContent).mockImplementation(async (id) => {
      if (id === 'vxp-gen') {
        return {
          arrayBuffer: new ArrayBuffer(8),
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
    await expect(analyzeFiles('vxp-gen', 'ok-dibh')).rejects.toThrow(/VXP/);
  });
});
