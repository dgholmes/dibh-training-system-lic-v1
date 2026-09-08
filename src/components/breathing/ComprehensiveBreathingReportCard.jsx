import React from 'react';
import { Info, Check } from 'lucide-react';
import { REPORT_CARD_COPY } from '@/lib/breathingAnalysisReportContent';
import { cn } from '@/lib/utils';

// Diagonal gradient: top-left (type color) → bottom-right (dark)
const TYPE_BOX_STYLE = {
  A: {
    background:
      'linear-gradient(135deg, rgba(34,197,94,0.22) 0%, rgba(34,197,94,0.08) 40%, rgba(13,17,23,1) 100%)',
  },
  B: {
    background:
      'linear-gradient(135deg, rgba(234,179,8,0.22) 0%, rgba(234,179,8,0.08) 40%, rgba(13,17,23,1) 100%)',
  },
  C: {
    background:
      'linear-gradient(135deg, rgba(239,68,68,0.22) 0%, rgba(239,68,68,0.08) 40%, rgba(13,17,23,1) 100%)',
  },
};


export default function ComprehensiveBreathingReportCard({ trainingType, onOpenInfo }) {
  const t = trainingType === 'C' ? 'C' : trainingType === 'B' ? 'B' : 'A';
  const copy = REPORT_CARD_COPY[t];

  return (
    <button
      type="button"
      onClick={onOpenInfo}
      className="w-full rounded-2xl border border-[#30363D] bg-[#1C2128] p-5 text-left transition-colors hover:border-[#3B82F6]/40 hover:bg-[#222830] sm:p-6"
    >
      {/* Header */}
      <div className="mb-5 flex items-center gap-2">
        <span className="h-5 w-1 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#8B5CF6]" />
        <h2 className="text-base font-bold text-white sm:text-lg">종합 호흡 분석 진단리포트</h2>
        <Info className="h-4 w-4 shrink-0 text-[#8B949E]" aria-hidden />
      </div>

      {/* Body: type card + summary */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-stretch">
        {/* Type card with linear gradient top→bottom */}
        <div
          className={cn(
            'flex w-full shrink-0 flex-col items-center justify-center rounded-2xl border-2 px-4 py-6 sm:aspect-square sm:w-40 sm:py-4',
            copy.boxClass
          )}
          style={TYPE_BOX_STYLE[t]}
        >
          <span className={cn('text-xs font-semibold tracking-wide', copy.typeSmallClass)}>Type</span>
          <span className={cn('my-1.5 text-5xl font-extrabold leading-none sm:text-6xl', copy.letterClass)}>
            {t}
          </span>
          <span className={cn('whitespace-nowrap text-center text-[10px] font-semibold sm:text-xs', copy.typeSmallClass)}>
            {copy.typeLabel}
          </span>
        </div>

        {/* Summary text + bullets */}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="mb-3.5 text-sm font-bold leading-relaxed text-white sm:text-base">
            {copy.summary}
          </p>
          <ul className="space-y-2.5">
            {copy.bullets.map((line, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-snug text-[#C9D1D9]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#3B82F6]/20">
                  <Check className="h-3 w-3 text-[#60A5FA]" strokeWidth={3} />
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </button>
  );
}
