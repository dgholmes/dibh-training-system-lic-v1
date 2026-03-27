import React from 'react';
import { Info, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { COMPARISON_MODAL_ROWS } from '@/lib/breathingAnalysisReportContent';
import { cn } from '@/lib/utils';

export default function BreathingTypeComparisonModal({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,760px)] max-w-[min(95%,920px)] gap-0 overflow-y-auto border border-[#30363D] bg-[#161B22] p-0 sm:rounded-2xl"
        hideClose
      >
        <DialogTitle className="sr-only">종합 호흡 진단 타입 비교</DialogTitle>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#30363D] bg-[#161B22] px-5 py-5 sm:px-7">
          <div className="flex gap-3 pr-10">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#8B949E]" aria-hidden />
            <div>
              <h2 className="text-lg font-bold text-white sm:text-xl">
                종합 호흡 진단 타입 비교
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-[#8B949E] sm:text-sm">
                ASTRO 2020 가이드라인의 정량적 호흡 지표 (주기, 흡·호기 비율, 허용 변동성)를 근거로
                산출된 환자의 표적 치료 적합성 및 호흡 안정성 평가 결과
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-[#8B949E] hover:bg-[#30363D] hover:text-white"
            onClick={() => onOpenChange(false)}
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-7">
          {/* Type badges row */}
          <div className="mb-5 grid grid-cols-[minmax(7rem,1fr)_1fr_1fr_1fr] gap-2.5 sm:gap-3">
            {/* Empty corner cell */}
            <div />

            {/* A type badge */}
            <div className="rounded-xl border-2 border-[#22C55E] bg-[#22C55E]/[0.15] px-3 py-3 text-center">
              <p className="text-base font-bold text-[#22C55E] sm:text-lg">A type</p>
              <p className="mt-0.5 text-[11px] text-[#22C55E]/70 sm:text-xs">DIBH</p>
            </div>

            {/* B type badge */}
            <div className="rounded-xl border-2 border-[#EAB308] bg-[#EAB308]/[0.15] px-3 py-3 text-center">
              <p className="text-base font-bold text-[#EAB308] sm:text-lg">B type</p>
              <p className="mt-0.5 text-[11px] text-[#EAB308]/70 sm:text-xs">Normal Breathing</p>
            </div>

            {/* C type badge */}
            <div className="rounded-xl border-2 border-[#EF4444] bg-[#EF4444]/[0.15] px-3 py-3 text-center">
              <p className="text-base font-bold text-[#EF4444] sm:text-lg">C type</p>
              <p className="mt-0.5 text-[11px] text-[#EF4444]/70 sm:text-xs">Shallow Breathing</p>
            </div>
          </div>

          {/* Comparison rows */}
          <div className="rounded-xl border border-[#30363D] bg-[#1C2128]/60 overflow-hidden">
            {COMPARISON_MODAL_ROWS.map((row, rowIdx) => (
              <div
                key={row.key}
                className={cn(
                  'grid grid-cols-[minmax(7rem,1fr)_1fr_1fr_1fr] gap-0',
                  rowIdx > 0 && 'border-t border-[#30363D]/70'
                )}
              >
                {/* Label cell */}
                <div className="flex items-start gap-2 px-4 py-4 sm:px-5">
                  <span className="mt-0.5 inline-block h-4 w-1 shrink-0 rounded-full bg-[#3B82F6]" />
                  <span className="text-xs font-semibold text-white sm:text-sm">{row.label}</span>
                </div>

                {/* Data cells */}
                {['A', 'B', 'C'].map((col) => {
                  const cell = row[col];
                  const isObj = cell && typeof cell === 'object' && 'text' in cell;
                  return (
                    <div
                      key={col}
                      className="border-l border-[#30363D]/50 px-3 py-4 text-xs leading-relaxed text-[#C9D1D9] sm:px-4 sm:text-sm"
                    >
                      {isObj ? (
                        <span className={cn('font-semibold', cell.color)}>{cell.text}</span>
                      ) : typeof cell === 'string' && cell.includes('\n') ? (
                        <span className="whitespace-pre-line">{cell}</span>
                      ) : (
                        <span>{cell}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
