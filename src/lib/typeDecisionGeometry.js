/**
 * Plot geometry for the 판정 기준 chart (TypeDecisionMap).
 *
 * Kept out of the component for two reasons: the lint rule against exporting
 * non-components beside a component (it breaks fast refresh), and so the
 * geometry can be asserted against determineDibhType() in a node-environment
 * test without rendering anything.
 *
 * THRESHOLDS mirrors determineDibhType.js. Change one and the other must
 * follow — typeDecisionGeometry.test.js fails if they diverge.
 */

export const THRESHOLDS = { durC: 10, durA: 15, cvA: 15, cvC: 30 };

/**
 * Height is deliberately well under half the width: the card sits in a
 * max-w-2xl column on a tablet, and a squarer chart pushed 권장 조치 below
 * the fold.
 */
export const VIEW = { W: 560, H: 230, L: 52, R: 14, TOP: 10, BOT: 42, X_MAX: 30, Y_MAX: 40 };

export const TYPE_COLOR = { A: '#22C55E', B: '#EAB308', C: '#EF4444' };

/** seconds → svg x, clamped to the plot area */
export function sx(v) {
  const { W, L, R, X_MAX } = VIEW;
  return L + (Math.min(Math.max(v, 0), X_MAX) / X_MAX) * (W - L - R);
}

/** percent → svg y, inverted so 0% sits on the baseline, clamped to the plot area */
export function sy(v) {
  const { H, TOP, BOT, Y_MAX } = VIEW;
  return H - BOT - (Math.min(Math.max(v, 0), Y_MAX) / Y_MAX) * (H - BOT - TOP);
}

/**
 * The five rectangles that tile the plot area, in draw order.
 *
 * Derived from THRESHOLDS rather than hand-placed, so a drawing that disagrees
 * with the classifier cannot be produced by editing a single pixel value.
 * Each carries its data-space box so the test can ask determineDibhType() what
 * the region should have been called.
 */
export function regions() {
  const { X_MAX, Y_MAX } = VIEW;
  const { durC, durA, cvA, cvC } = THRESHOLDS;

  const rect = (type, durFrom, durTo, cvFrom, cvTo) => ({
    type,
    x: sx(durFrom),
    y: sy(cvTo),
    width: sx(durTo) - sx(durFrom),
    height: sy(cvFrom) - sy(cvTo),
    box: { durFrom, durTo, cvFrom, cvTo },
  });

  return [
    rect('C', 0, durC, 0, Y_MAX), // 유지 시간 미달
    rect('C', durC, X_MAX, cvC, Y_MAX), // CV 초과
    rect('B', durC, durA, 0, cvC),
    rect('B', durA, X_MAX, cvA, cvC),
    rect('A', durA, X_MAX, 0, cvA),
  ];
}
