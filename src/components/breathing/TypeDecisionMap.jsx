/* eslint-disable react/prop-types -- three scalar props, documented below */
import { THRESHOLDS, VIEW, TYPE_COLOR, sx, sy, regions } from '@/lib/typeDecisionGeometry';

/**
 * Where (avgDibh, cv) falls among the Type A/B/C regions.
 *
 * determineDibhType() applies a joint condition on two variables, so the regions
 * are not two independent bands: A is a rectangle, C is an L-shape, and B is
 * whatever is left. Two separate readouts cannot show that — a reader seeing
 * "12.6초" and "18.5%" side by side cannot tell which clause decided the type.
 *
 * Every rectangle is derived from THRESHOLDS through the scale functions rather
 * than hand-placed, so a drawing that disagrees with the rule cannot be produced
 * by editing one number. TypeDecisionMap.test.js asserts the agreement directly.
 */

const AXIS = '#8B949E';

export default function TypeDecisionMap({ dibhDuration, cv, type }) {
  const { W, H, L, R, TOP, X_MAX, Y_MAX } = VIEW;
  const { durC, durA, cvA, cvC } = THRESHOLDS;

  const dur = Number(dibhDuration);
  const cvNum = Number(cv);
  const hasPoint =
    dibhDuration != null && cv != null && Number.isFinite(dur) && Number.isFinite(cvNum);

  const baseline = sy(0);
  const dotColor = TYPE_COLOR[type] ?? '#F0F6FC';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label={
        hasPoint
          ? `판정 기준 그래프. 유지 시간 ${dur.toFixed(1)}초, CV ${cvNum.toFixed(1)}퍼센트로 Type ${type ?? '판정 없음'} 영역에 위치합니다.`
          : '판정 기준 그래프. 유지 시간과 CV 로 구분한 Type A, B, C 영역.'
      }
    >
      <g opacity="0.17">
        {regions().map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill={TYPE_COLOR[r.type]} />
        ))}
      </g>

      {/* Region letters, anchored inside each box rather than at fixed pixels. */}
      <g fontSize="12" fontWeight="700" textAnchor="middle">
        <text x={sx(durC / 2)} y={sy(Y_MAX) + 17} fill={TYPE_COLOR.C}>
          C
        </text>
        <text x={sx((durC + X_MAX) / 2)} y={sy(Y_MAX) + 17} fill={TYPE_COLOR.C}>
          C
        </text>
        <text x={sx((durC + durA) / 2)} y={baseline - 7} fill={TYPE_COLOR.B}>
          B
        </text>
        <text x={sx(X_MAX) - 18} y={sy(cvC) + 17} fill={TYPE_COLOR.B}>
          B
        </text>
        <text x={sx(X_MAX) - 18} y={baseline - 7} fill={TYPE_COLOR.A}>
          A
        </text>
      </g>

      {/* Threshold lines */}
      <g stroke="#30363D" strokeWidth="1" strokeDasharray="4 4">
        <line x1={sx(durC)} y1={sy(Y_MAX)} x2={sx(durC)} y2={baseline} />
        <line x1={sx(durA)} y1={sy(Y_MAX)} x2={sx(durA)} y2={baseline} />
        <line x1={sx(0)} y1={sy(cvC)} x2={sx(X_MAX)} y2={sy(cvC)} />
        <line x1={sx(0)} y1={sy(cvA)} x2={sx(X_MAX)} y2={sy(cvA)} />
      </g>

      {/* Axes */}
      <g stroke="#484F58" strokeWidth="1.2">
        <line x1={L} y1={baseline} x2={W - R} y2={baseline} />
        <line x1={L} y1={TOP} x2={L} y2={baseline} />
      </g>

      {/* X ticks */}
      <g fill={AXIS} fontSize="10.5" textAnchor="middle">
        {[0, durC, durA, X_MAX].map((v) => (
          <text key={v} x={sx(v)} y={baseline + 15}>
            {v}
          </text>
        ))}
      </g>
      <text x={(L + (W - R)) / 2} y={H - 6} fill={AXIS} fontSize="11" textAnchor="middle">
        DIBH 유지 시간 (초) → 길수록 양호
      </text>

      {/* Y ticks */}
      <g fill={AXIS} fontSize="10.5" textAnchor="end">
        {[0, cvA, cvC, Y_MAX].map((v) => (
          <text key={v} x={L - 7} y={sy(v) + 3.5}>
            {v}
          </text>
        ))}
      </g>
      <text
        transform={`translate(13,${(TOP + baseline) / 2}) rotate(-90)`}
        fill={AXIS}
        fontSize="11"
        textAnchor="middle"
      >
        CV (%) → 낮을수록 양호
      </text>

      {hasPoint && (
        <g transform={`translate(${sx(dur)},${sy(cvNum)})`}>
          <circle r="11" fill="none" stroke="#F0F6FC" strokeWidth="1" opacity="0.35" />
          <circle r="5.5" fill={dotColor} stroke="#1C2128" strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}
