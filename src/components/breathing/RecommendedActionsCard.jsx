/* eslint-disable react/prop-types -- single string prop, documented below */
import { RECOMMENDED_ACTIONS, CLINICAL_DISCLAIMER } from '@/lib/breathingAnalysisReportContent';

/**
 * Type-specific next steps, shown on every screen that reports a result
 * (formative evaluation #5) — both 호흡 분석 결과 routes render this, so the
 * advice cannot appear on one and be missing from the other.
 *
 * The disclaimer sits at the top so it is read before the recommendations, not
 * after: RM-DBF-007 (analysis over-trusted) and RM-DBF-014 (result misread)
 * are the risks this card could otherwise aggravate.
 *
 * An unrecognised type renders nothing rather than falling back to some other
 * type's advice — showing the wrong recommendation would be worse than showing
 * none.
 *
 * @param {{ type: 'A'|'B'|'C' }} props
 */
export default function RecommendedActionsCard({ type }) {
  const copy = RECOMMENDED_ACTIONS[type];
  if (!copy) return null;

  return (
    <div className="rounded-2xl border border-[#30363D] bg-[#1C2128] px-5 py-6 sm:px-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex shrink-0 items-center gap-2">
          <span className="h-5 w-1 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#8B5CF6]" />
          <h3 className="text-base font-bold text-white sm:text-lg">권장 조치</h3>
        </div>
        <p className="text-xs leading-relaxed text-[#8B949E] sm:max-w-[58%] sm:text-right">
          {CLINICAL_DISCLAIMER}
        </p>
      </div>

      <p className="mb-4 text-sm font-semibold text-white">{copy.headline}</p>
      <ul className="space-y-2.5">
        {copy.steps.map((line, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-snug text-[#C9D1D9]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8B949E]" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
