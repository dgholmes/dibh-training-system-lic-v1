import { describe, it, expect } from 'vitest';
import { THRESHOLDS, VIEW, sx, sy, regions } from './typeDecisionGeometry';
import { determineDibhType } from '@/lib/calibration/determineDibhType';

/**
 * The 판정 기준 chart claims to depict determineDibhType(). Nothing in the
 * rendering enforces that: a region could be redrawn, or a threshold changed in
 * one file and not the other, and the picture would still look plausible while
 * telling the operator the wrong thing.
 *
 * These tests close that gap. Every region is checked against the real
 * classifier, and the regions are checked to tile the plot area exactly.
 */

/** svg x → seconds */
function ix(px) {
  const { W, L, R, X_MAX } = VIEW;
  return ((px - L) / (W - L - R)) * X_MAX;
}

/** svg y → percent */
function iy(py) {
  const { H, TOP, BOT, Y_MAX } = VIEW;
  return ((H - BOT - py) / (H - BOT - TOP)) * Y_MAX;
}

describe('typeDecisionGeometry', () => {
  it('mirrors the thresholds in determineDibhType', () => {
    // determineDibhType.js: A is >= 15s and < 15%; C is < 10s or >= 30%.
    expect(THRESHOLDS).toEqual({ durC: 10, durA: 15, cvA: 15, cvC: 30 });
  });

  it('labels every region with the type determineDibhType returns inside it', () => {
    for (const r of regions()) {
      const { durFrom, durTo, cvFrom, cvTo } = r.box;
      const midDur = (durFrom + durTo) / 2;
      const midCv = (cvFrom + cvTo) / 2;
      expect(determineDibhType(midDur, midCv), `region ${r.type} @ ${midDur}s/${midCv}%`).toBe(
        r.type
      );
    }
  });

  it('places each rectangle exactly on the thresholds it represents', () => {
    for (const r of regions()) {
      expect(r.x).toBeCloseTo(sx(r.box.durFrom), 6);
      expect(r.x + r.width).toBeCloseTo(sx(r.box.durTo), 6);
      // y is inverted: the rect top edge is the upper cv bound.
      expect(r.y).toBeCloseTo(sy(r.box.cvTo), 6);
      expect(r.y + r.height).toBeCloseTo(sy(r.box.cvFrom), 6);
    }
  });

  it('tiles the plot area without gaps or overlap', () => {
    const total = regions().reduce((sum, r) => sum + r.width * r.height, 0);
    const plot = (sx(VIEW.X_MAX) - sx(0)) * (sy(0) - sy(VIEW.Y_MAX));
    expect(total).toBeCloseTo(plot, 6);
  });

  it('round-trips a plotted point back to its measurements', () => {
    for (const [dur, cv] of [
      [18.4, 11.2],
      [12.6, 18.5],
      [7.8, 26.3],
      [15.0, 15.0],
    ]) {
      expect(ix(sx(dur))).toBeCloseTo(dur, 6);
      expect(iy(sy(cv))).toBeCloseTo(cv, 6);
    }
  });

  it('clamps out-of-range measurements into the plot area', () => {
    // A 45s hold or a 120% CV must not be drawn outside the axes.
    expect(sx(45)).toBe(sx(VIEW.X_MAX));
    expect(sy(120)).toBe(sy(VIEW.Y_MAX));
    expect(sx(-3)).toBe(sx(0));
    expect(sy(-3)).toBe(sy(0));
  });

  it('keeps the chart wider than it is tall', () => {
    // The card sits in a max-w-2xl column; a squarer chart pushed 권장 조치
    // below the fold on a tablet.
    expect(VIEW.H).toBeLessThan(VIEW.W / 2);
  });
});
