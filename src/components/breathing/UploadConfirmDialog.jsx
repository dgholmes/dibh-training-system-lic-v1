/* eslint-disable react/prop-types -- items are built inline by AnalysisFileSelect */
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { countCategoryMismatches } from '@/lib/breathingFileCategory';

const LABEL = { general: '일반호흡 (GEN)', dibh: 'DIBH 호흡 (DIBH)' };

/**
 * Registration confirmation before breathing files are written (MFDS
 * RM-DBF-010). Uploading into the wrong category changes the resulting DIBH
 * type, so the operator confirms the destination of every file explicitly and
 * nothing reaches storage until they do.
 *
 * A filename that reads as the other category is called out in red; a filename
 * the detector could not read produces no warning at all, so the red state
 * stays meaningful.
 *
 * @param {{
 *   open: boolean,
 *   items: Array<{name: string, category: 'general'|'dibh', detected: 'general'|'dibh'|null}>,
 *   onCancel: () => void,
 *   onConfirm: () => void,
 * }} props
 */
export default function UploadConfirmDialog({ open, items, onCancel, onConfirm }) {
  const mismatchCount = countCategoryMismatches(items);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        hideClose
        className="max-w-[min(100%,460px)] border border-[#30363D] bg-[#1C2128] p-0 shadow-2xl sm:rounded-2xl"
      >
        <DialogTitle className="sr-only">업로드 확인</DialogTitle>
        <DialogDescription className="sr-only">
          등록할 파일과 저장될 구분을 확인합니다.
        </DialogDescription>

        <div className="px-6 pb-6 pt-7">
          <p className="text-base font-bold text-white sm:text-lg">아래 내용으로 등록할까요?</p>
          <p className="mt-1.5 text-sm text-[#8B949E]">
            구분을 잘못 지정하면 분석 결과(Type)가 달라집니다.
          </p>

          <ul className="mt-5 max-h-[40vh] space-y-2 overflow-y-auto">
            {items.map((item, i) => {
              const bad = item.detected && item.detected !== item.category;
              return (
                <li
                  key={`${item.name}-${i}`}
                  className={cn(
                    'rounded-xl border px-4 py-3',
                    bad ? 'border-[#EF4444]/60 bg-[#EF4444]/10' : 'border-[#30363D] bg-[#252A32]'
                  )}
                >
                  <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                  <p className={cn('mt-1 text-xs', bad ? 'text-[#FCA5A5]' : 'text-[#8B949E]')}>
                    {LABEL[item.category]}(으)로 저장
                    {bad && ` · 파일명은 ${LABEL[item.detected]}(으)로 보입니다`}
                  </p>
                </li>
              );
            })}
          </ul>

          {mismatchCount > 0 && (
            <div className="mt-4 flex gap-2.5 rounded-xl border border-[#EF4444]/60 bg-[#EF4444]/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#EF4444]" aria-hidden />
              <p className="text-xs leading-relaxed text-[#FCA5A5]">
                파일명과 구분이 일치하지 않는 파일이 {mismatchCount}개 있습니다. 그대로 등록하면
                분석 결과가 달라질 수 있습니다.
              </p>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="h-12 flex-1 rounded-xl border-[#30363D] bg-[#252A32] text-white hover:bg-[#30363D]"
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              className={cn(
                'h-12 flex-1 rounded-xl font-semibold text-white',
                mismatchCount > 0
                  ? 'bg-[#EF4444] hover:bg-[#DC2626]'
                  : 'bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] hover:from-[#2563EB] hover:to-[#7C3AED]'
              )}
            >
              {mismatchCount > 0 ? '그대로 등록' : '등록'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
