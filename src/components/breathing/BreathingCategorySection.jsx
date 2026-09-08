/* eslint-disable react/prop-types -- file rows come straight from the repository query */
import { CloudUpload, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatFileSize, fileTypeBadge } from '@/lib/files';
import { breathingFileDisplayName } from '@/lib/breathingFileDisplayName';
import { format } from 'date-fns';

function formatImportedAt(iso) {
  try {
    return format(new Date(iso), 'yyyy.MM.dd HH:mm');
  } catch {
    return iso;
  }
}

/**
 * One breathing-data category, used by both breathing screens:
 *
 *   호흡 데이터 추가   showUpload  — drop zone above the stored file list
 *   분석할 파일 선택   selectable  — stored files with a selection control
 *
 * The two categories are deliberately hard to confuse — distinct accent, an
 * explicit GEN/DIBH badge and a per-category instruction line. Dropping a file
 * into the wrong one changes the resulting DIBH type (RM-DBF-010), so the
 * visual separation is a safety control, not decoration, and both screens get
 * it from here.
 */
const CATEGORY_STYLE = {
  general: {
    title: '일반호흡',
    tag: 'GEN',
    accent: 'from-[#8B5CF6] to-[#6366F1]',
    badge: 'border-[#8B5CF6]/50 bg-[#8B5CF6]/15 text-[#C4B5FD]',
    ring: 'hover:border-[#8B5CF6]/55',
    hint: '자유 호흡 상태로 측정한 데이터를 올려 주세요.',
  },
  dibh: {
    title: 'DIBH 호흡',
    tag: 'DIBH',
    accent: 'from-[#3B82F6] to-[#22D3EE]',
    badge: 'border-[#3B82F6]/50 bg-[#3B82F6]/15 text-[#93C5FD]',
    ring: 'hover:border-[#3B82F6]/55',
    hint: '숨을 참은 상태(DIBH)로 측정한 데이터를 올려 주세요.',
  },
};

export default function BreathingCategorySection({
  category,
  patient,
  savedFiles,
  pendingFiles = [],
  selectedId,
  loading,
  onSelect,
  onAddFiles,
  onRequestDeleteSaved,
  inputRef,
  showUpload = false,
  selectable = false,
}) {
  const style = CATEGORY_STYLE[category];

  const onDrop = (e) => {
    e.preventDefault();
    const list = e.dataTransfer?.files;
    if (list?.length) onAddFiles(list);
  };

  return (
    <section className="rounded-xl border border-[#30363D] bg-[#1C2128] p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-white">
        <span className={cn('h-5 w-1 rounded-full bg-gradient-to-b', style.accent)} />
        {style.title}
        <span
          className={cn('rounded-sm border px-2 py-1 text-[10px] font-bold leading-none tracking-wide', style.badge)}
        >
          {style.tag}
        </span>
      </h2>
      <p className="mb-5 pl-3 text-xs text-[#8B949E]">{style.hint}</p>

      {showUpload && (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'mb-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#30363D] bg-[#0D1117]/50 px-4 py-8 text-center transition-colors hover:bg-[#0D1117]',
            style.ring
          )}
        >
          <CloudUpload className="mb-2 h-9 w-9 text-[#8B949E]" />
          <p className="text-sm font-medium text-white">{style.title} 파일을 선택하세요</p>
          <p className="mt-1 text-xs text-[#8B949E]">CSV, VXP 지원 (다중 선택 가능 · 분석은 CSV만)</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".csv,.vxp,text/csv,application/octet-stream"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) onAddFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[#8B949E]">불러오는 중…</p>
      ) : savedFiles.length === 0 && pendingFiles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#30363D] px-4 py-6 text-center text-sm text-[#8B949E]">
          {showUpload ? '등록된 파일이 없습니다' : '등록된 파일이 없습니다. [데이터 추가]에서 먼저 업로드해 주세요.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {savedFiles.map((f) => {
            const active = selectedId === f.id;
            const shown = breathingFileDisplayName(f.original_name, patient);
            return (
              <li key={f.id} className="flex gap-2">
                <button
                  type="button"
                  onClick={selectable ? () => onSelect(f.id) : undefined}
                  disabled={!selectable}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                    selectable && active
                      ? 'border-[#3B82F6] bg-[#1C2128] ring-1 ring-[#3B82F6]/40'
                      : 'border-[#30363D]/80 bg-[#252A32]',
                    selectable && !active && 'hover:border-[#8B949E]/40',
                    !selectable && 'cursor-default'
                  )}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#30363D] bg-[#1C2128] text-[10px] font-bold uppercase tracking-wide text-[#C9D1D9]"
                    aria-hidden
                  >
                    {fileTypeBadge(f.original_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{shown}</span>
                    <span className="mt-0.5 block text-xs text-[#9BA1A6]">
                      {formatFileSize(f.size_bytes)} · {formatImportedAt(f.imported_at)} 업로드
                    </span>
                  </span>
                  {selectable && (
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                        active ? 'border-[#3B82F6] bg-[#3B82F6]' : 'border-[#8B949E] bg-transparent'
                      )}
                      aria-hidden
                    >
                      {active && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </span>
                  )}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-[52px] w-11 shrink-0 rounded-2xl text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                  aria-label="파일 삭제"
                  onClick={() => onRequestDeleteSaved({ id: f.id, name: shown })}
                >
                  <X className="h-5 w-5" />
                </Button>
              </li>
            );
          })}

          {pendingFiles.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-2xl border border-[#30363D]/80 bg-[#252A32]/60 px-4 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#C9D1D9]">{f.name}</span>
                <span className="mt-0.5 block text-xs">
                  {f.status === 'failed' ? (
                    <span className="text-[#EF4444]">{f.error}</span>
                  ) : (
                    <span className="text-[#8B949E]">저장 중…</span>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
