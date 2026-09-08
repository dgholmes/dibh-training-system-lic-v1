/* eslint-disable react/prop-types -- three scalar props, documented below */
import { RECOMMENDED_ACTIONS, CLINICAL_DISCLAIMER } from '@/lib/breathingAnalysisReportContent';

/**
 * The measured values and what they imply, in one card.
 *
 * They belong together because they are one causal chain: determineDibhType()
 * derives the type from (avgDibh, cv), and the type selects the advice. Split
 * across two cards, the reader had to connect evidence to conclusion across
 * a gap.
 *
 * The two zones stay visually distinct, separated by a divider, on purpose.
 * 권장 조치 is advisory text carrying CLINICAL_DISCLAIMER; blended into a block
 * of measured values it would start to read as measurement — as objective
 * device output rather than a suggestion (RM-DBF-007, RM-DBF-014).
 *
 * The advice zone is omitted entirely for an unknown type rather than falling
 * back to another type's wording, and the disclaimer closes it so the advice
 * is never read without its caveat attached.
 *
 * @param {{
 *   dibhDuration: number|null,
 *   cv: number|null,
 *   type: 'A'|'B'|'C'|null,
 * }} props
 */
export default function AnalysisResultCard({ dibhDuration, cv, type }) {
  const copy = type ? RECOMMENDED_ACTIONS[type] : null;

  const durationText =
    dibhDuration != null && Number.isFinite(Number(dibhDuration))
      ? `${Math.round(Number(dibhDuration))}초`
      : '—';
  const cvText =
    cv != null && Number.isFinite(Number(cv)) ? `${Number(cv).toFixed(1)}%` : '—';

  return (
    <div className="rounded-2xl border border-[#30363D] bg-[#1C2128] px-5 py-5 sm:px-6">
      {/* Measured values */}
      <div className="grid grid-cols-2 gap-4 text-center">
        <div>
          <p className="mb-1 text-sm text-[#8B949E]">DIBH 유지 시간</p>
          <p className="text-2xl font-bold text-white">{durationText}</p>
        </div>
        <div>
          <p className="mb-1 text-sm text-[#8B949E]">호흡 안정성 (CV)</p>
          <p className="text-2xl font-bold text-white">{cvText}</p>
        </div>
      </div>

      {/* What they imply — advisory, and kept visually separate from the above */}
      {copy && (
        <div className="mt-5 border-t border-[#30363D] pt-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-5 w-1 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#8B5CF6]" />
            <h3 className="text-base font-bold text-white">권장 조치</h3>
          </div>

          <p className="mb-3 text-sm font-semibold text-white">{copy.headline}</p>
          <ul className="space-y-2">
            {copy.steps.map((line, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-snug text-[#C9D1D9]">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8B949E]"
                  aria-hidden
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 border-t border-[#30363D]/60 pt-3 text-xs leading-relaxed text-[#8B949E]">
            {CLINICAL_DISCLAIMER}
          </p>
        </div>
      )}
    </div>
  );
}
