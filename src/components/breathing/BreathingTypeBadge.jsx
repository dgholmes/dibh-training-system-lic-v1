import React from 'react';
import { REPORT_CARD_COPY } from '@/lib/breathingAnalysisReportContent';
import { cn } from '@/lib/utils';

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

/**
 * Shared Type A/B/C badge used on 분석 결과 + 대시보드.
 * Compact mode keeps the same look with reduced height for row layouts.
 */
export function BreathingTypeBadge({ type, compact = false, className }) {
  const key = type === 'C' ? 'C' : type === 'B' ? 'B' : 'A';
  const copy = REPORT_CARD_COPY[key];
  const base = compact
    ? 'flex h-28 w-full max-w-[190px] shrink-0 flex-col items-center justify-center rounded-2xl border-2 px-4'
    : 'flex h-32 w-full max-w-[210px] shrink-0 flex-col items-center justify-center rounded-2xl border-2 px-4';

  return (
    <div className={cn(base, copy.boxClass, className)} style={TYPE_BOX_STYLE[key]}>
      <p className={cn('text-[11px] font-semibold tracking-wide', copy.typeSmallClass)}>Type</p>
      <p className={cn('my-1 text-4xl font-extrabold leading-none sm:text-5xl', copy.letterClass)}>
        {key}
      </p>
      <p
        className={cn(
          'mt-0.5 whitespace-nowrap text-center text-[11px] font-semibold',
          copy.typeSmallClass
        )}
      >
        {copy.typeLabel}
      </p>
    </div>
  );
}


