import { useState, useRef, useCallback, useEffect } from 'react';
import { CloudUpload, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PatientFlowPageHeader } from '@/components/common/PatientFlowPageHeader';
import { createPageUrl, getPatientIdFromSearchParams } from '@/utils';
import {
  Patient,
  createBreathingFile,
  listBreathingFilesByPatient,
  deleteBreathingFile,
} from '@/api/entities';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { formatFileSize, fileTypeBadge } from '@/lib/files';
import { cn } from '@/lib/utils';
import { isAllowedBreathingUploadFile } from '@/lib/breathingFileFormat';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

function formatImportedAt(iso) {
  try {
    return format(new Date(iso), 'yyyy.MM.dd HH:mm');
  } catch {
    return iso;
  }
}

function PatientBreathingUploadSection({
  title,
  accentClass,
  savedFiles,
  pendingFiles,
  onAddFiles,
  onRemovePending,
  onRequestDeleteSaved,
  inputRef,
}) {
  const onDrop = (e) => {
    e.preventDefault();
    const list = e.dataTransfer?.files;
    if (list?.length) onAddFiles(list);
  };

  const totalCount = savedFiles.length + pendingFiles.length;

  return (
    <div className="rounded-xl border border-[#30363D] bg-[#1C2128] p-6">
      <h2 className="mb-6 flex items-center gap-2 text-lg font-bold text-white">
        <span className={cn('h-5 w-1 rounded-full bg-gradient-to-b', accentClass)} />
        {title}
      </h2>

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
        className="mb-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#30363D] bg-[#0D1117]/50 px-4 py-10 text-center transition-colors hover:border-[#8B5CF6]/55 hover:bg-[#0D1117]"
      >
        <CloudUpload className="mb-3 h-10 w-10 text-[#8B949E]" />
        <p className="text-sm font-medium text-white">파일을 선택하세요</p>
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

      {totalCount > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-[#8B949E]">등록된 파일 ({totalCount})</p>
          <ul className="space-y-3">
            {savedFiles.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-2xl border border-[#30363D]/80 bg-[#252A32] px-4 py-3"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#30363D] bg-[#1C2128] text-[10px] font-bold uppercase leading-none tracking-wide text-[#C9D1D9]"
                  aria-hidden
                >
                  {fileTypeBadge(f.original_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{f.original_name}</p>
                  <p className="mt-0.5 text-xs text-[#9BA1A6]">
                    {formatFileSize(f.size_bytes)} · 업로드 완료 ({formatImportedAt(f.imported_at)})
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden>
                    <Check className="h-4 w-4 text-[#A78BFA]" strokeWidth={2} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDeleteSaved({ id: f.id, name: f.original_name });
                    }}
                    aria-label="파일 삭제"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </Button>
                </div>
              </li>
            ))}
            {pendingFiles.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-2xl border border-[#30363D]/80 bg-[#252A32] px-4 py-3"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#30363D] bg-[#1C2128] text-[10px] font-bold uppercase leading-none tracking-wide text-[#C9D1D9]"
                  aria-hidden
                >
                  {fileTypeBadge(f.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{f.name}</p>
                  <p className="mt-0.5 text-xs text-[#9BA1A6]">
                    {f.status === 'error'
                      ? f.error || '저장 실패'
                      : f.status === 'persisting'
                        ? `${formatFileSize(f.size)} · 저장 중…`
                        : `${formatFileSize(f.size)} · ${Math.round(f.progress)}% 업로드 중…`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {f.status === 'uploading' ? (
                    <div
                      className="h-2 w-[88px] overflow-hidden rounded-full bg-[#0D1117]"
                      role="progressbar"
                      aria-valuenow={Math.round(f.progress)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full bg-white/90 transition-[width] duration-200 ease-out"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                  ) : f.status === 'persisting' ? (
                    <div className="h-2 w-[88px] overflow-hidden rounded-full bg-[#0D1117]">
                      <div className="h-full w-full animate-pulse rounded-full bg-[#8B5CF6]/60" />
                    </div>
                  ) : f.status === 'error' ? null : (
                    <Check className="h-4 w-4 shrink-0 text-[#A78BFA]" />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePending(f.id);
                    }}
                    aria-label={f.status === 'uploading' ? '업로드 취소' : '항목 제거'}
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function BreathingDataUpload() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const patientId = getPatientIdFromSearchParams(searchParams);

  const generalInputRef = useRef(null);
  const dibhInputRef = useRef(null);

  const [generalPending, setGeneralPending] = useState([]);
  const [dibhPending, setDibhPending] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => {
      const results = Patient.filter({ id: patientId });
      return results[0] || null;
    },
    enabled: !!patientId,
  });

  const { data: generalSaved = [], isLoading: loadingG } = useQuery({
    queryKey: ['breathingFiles', patientId, 'general'],
    queryFn: () => listBreathingFilesByPatient(patientId, 'general'),
    enabled: !!patientId,
    staleTime: 0,
  });

  const { data: dibhSaved = [], isLoading: loadingD } = useQuery({
    queryKey: ['breathingFiles', patientId, 'dibh'],
    queryFn: () => listBreathingFilesByPatient(patientId, 'dibh'),
    enabled: !!patientId,
    staleTime: 0,
  });

  const loading = loadingG || loadingD;

  const invalidateBreathing = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['breathingFiles'] });
  }, [queryClient]);

  const simulateUploadAndPersist = useCallback(
    (items, category, setList) => {
      items.forEach((item) => {
        const { id, file } = item;
        const tick = setInterval(() => {
          setList((prev) =>
            prev.map((f) =>
              f.id === id && f.status === 'uploading'
                ? { ...f, progress: Math.min(100, f.progress + 12 + Math.random() * 15) }
                : f
            )
          );
        }, 220);
        const doneAt = 800 + Math.random() * 900;
        setTimeout(async () => {
          clearInterval(tick);
          setList((prev) =>
            prev.map((f) => (f.id === id ? { ...f, progress: 100, status: 'persisting' } : f))
          );
          try {
            if (!patientId) throw new Error('patientId 없음');
            await createBreathingFile({ patientId, category, file });
            invalidateBreathing();
            setList((prev) => prev.filter((f) => f.id !== id));
          } catch (err) {
            console.error('createBreathingFile', err);
            const message = err instanceof Error ? err.message : String(err);
            toast({
              title: '파일을 저장할 수 없습니다',
              description: message,
              variant: 'destructive',
            });
            setList((prev) =>
              prev.map((f) =>
                f.id === id
                  ? {
                      ...f,
                      status: 'error',
                      error: message,
                    }
                  : f
              )
            );
          }
        }, doneAt);
      });
    },
    [patientId, invalidateBreathing]
  );

  const handleAddGeneral = useCallback(
    (fileList) => {
      const existingCount = generalSaved.length + generalPending.length;
      if (existingCount >= 10) {
        toast({
          title: '일반호흡 데이터는 최대 10개까지 저장됩니다',
          description: '오래된 일반호흡 데이터를 삭제한 뒤 다시 업로드해 주세요.',
          variant: 'destructive',
        });
        return;
      }
      const incoming = Array.from(fileList).filter(isAllowedBreathingUploadFile);
      const skipped = Array.from(fileList).length - incoming.length;
      if (skipped > 0) {
        toast({
          title: 'CSV 또는 VXP만 업로드할 수 있습니다',
          description: `${skipped}개 파일은 지원 형식이 아니어서 제외되었습니다.`,
          variant: 'destructive',
        });
      }
      const room = Math.max(0, 10 - existingCount);
      const limited = incoming.slice(0, room);
      const newItems = limited.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'uploading',
      }));
      if (newItems.length === 0) return;
      setGeneralPending((prev) => [...prev, ...newItems]);
      simulateUploadAndPersist(newItems, 'general', setGeneralPending);
    },
    [simulateUploadAndPersist, generalSaved.length, generalPending.length]
  );

  const handleAddDibh = useCallback(
    (fileList) => {
      const existingCount = dibhSaved.length + dibhPending.length;
      if (existingCount >= 10) {
        toast({
          title: 'DIBH 데이터는 최대 10개까지 저장됩니다',
          description: '오래된 DIBH 데이터를 삭제한 뒤 다시 업로드해 주세요.',
          variant: 'destructive',
        });
        return;
      }
      const incoming = Array.from(fileList).filter(isAllowedBreathingUploadFile);
      const skipped = Array.from(fileList).length - incoming.length;
      if (skipped > 0) {
        toast({
          title: 'CSV 또는 VXP만 업로드할 수 있습니다',
          description: `${skipped}개 파일은 지원 형식이 아니어서 제외되었습니다.`,
          variant: 'destructive',
        });
      }
      const room = Math.max(0, 10 - existingCount);
      const limited = incoming.slice(0, room);
      const newItems = limited.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'uploading',
      }));
      if (newItems.length === 0) return;
      setDibhPending((prev) => [...prev, ...newItems]);
      simulateUploadAndPersist(newItems, 'dibh', setDibhPending);
    },
    [simulateUploadAndPersist, dibhSaved.length, dibhPending.length]
  );

  const busyGeneral = generalPending.some((f) => f.status === 'uploading' || f.status === 'persisting');
  const busyDibh = dibhPending.some((f) => f.status === 'uploading' || f.status === 'persisting');
  const hasBusy = busyGeneral || busyDibh;

  const handleDone = () => {
    if (hasBusy) {
      toast({
        title: '업로드 진행 중입니다',
        description: '모든 파일 저장이 끝난 뒤 등록 완료를 눌러 주세요.',
        variant: 'destructive',
      });
      return;
    }
    navigate(`${createPageUrl('AnalysisFileSelect')}?patientId=${encodeURIComponent(patientId)}`);
  };

  const confirmDeleteSaved = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteBreathingFile(deleteTarget.id);
      invalidateBreathing();
      setDeleteTarget(null);
    } catch (err) {
      toast({
        title: '삭제 실패',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (!patientId) return;
    const exists = Patient.get(patientId);
    if (!exists) {
      toast({
        title: '환자를 찾을 수 없습니다',
        description: '목록에서 다시 선택해 주세요.',
        variant: 'destructive',
      });
      navigate(createPageUrl('Home'));
    }
  }, [patientId, navigate]);

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-28">
      <div className="mx-auto max-w-2xl">
        <PatientFlowPageHeader
          backHref={
            patientId
              ? `${createPageUrl('PatientDashboard')}?patientId=${encodeURIComponent(patientId)}`
              : createPageUrl('Home')
          }
          title="호흡 데이터 추가"
          patient={patient}
        />

        <p className="mb-6 text-sm text-[#8B949E]">
          일반호흡·DIBH 파일을 추가하면 &quot;분석할 파일 선택&quot; 화면 목록에 바로 반영됩니다.
        </p>

        {!patientId && <p className="text-sm text-[#EF4444]">patientId가 없습니다.</p>}

        {patientId && !loading && (
          <div className="space-y-6">
            <PatientBreathingUploadSection
              title="일반호흡 업로드 (필수)"
              accentClass="from-[#8B5CF6] to-[#6366F1]"
              savedFiles={generalSaved}
              pendingFiles={generalPending}
              onAddFiles={handleAddGeneral}
              onRemovePending={(id) => setGeneralPending((prev) => prev.filter((f) => f.id !== id))}
              onRequestDeleteSaved={setDeleteTarget}
              inputRef={generalInputRef}
            />
            <PatientBreathingUploadSection
              title="DIBH 호흡 업로드 (필수)"
              accentClass="from-[#6366F1] to-[#8B5CF6]"
              savedFiles={dibhSaved}
              pendingFiles={dibhPending}
              onAddFiles={handleAddDibh}
              onRemovePending={(id) => setDibhPending((prev) => prev.filter((f) => f.id !== id))}
              onRequestDeleteSaved={setDeleteTarget}
              inputRef={dibhInputRef}
            />
          </div>
        )}

        {patientId && loading && (
          <p className="text-sm text-[#8B949E]">파일 목록을 불러오는 중…</p>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#30363D] bg-[#0D1117]/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Button
            type="button"
            disabled={!patientId || hasBusy}
            className="h-12 w-full rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-base font-semibold text-white shadow-lg shadow-[#8B5CF6]/20 hover:from-[#7C3AED] hover:to-[#2563EB] disabled:opacity-50"
            onClick={handleDone}
          >
            등록 완료
          </Button>
          {hasBusy && (
            <p className="mt-2 text-center text-xs text-[#EAB308]">파일이 저장될 때까지 잠시만 기다려 주세요.</p>
          )}
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent
          hideClose
          className="max-w-[min(100%,380px)] gap-0 border border-[#30363D] bg-[#1C2128] p-0 shadow-2xl sm:rounded-2xl"
        >
          <DialogTitle className="sr-only">파일 삭제</DialogTitle>
          <DialogDescription className="sr-only">
            선택한 호흡 데이터 파일을 저장소에서 제거합니다.
          </DialogDescription>
          <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
            <div
              className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#EF4444]/15"
              aria-hidden
            >
              <span className="text-3xl font-bold leading-none text-[#EF4444]">!</span>
            </div>
            <p className="text-base font-bold leading-snug text-white sm:text-lg">파일을 삭제할까요?</p>
            <p className="mt-2 break-all text-sm text-[#8B949E]">{deleteTarget?.name}</p>
            <p className="mt-2 text-sm text-[#8B949E]">삭제 후 복구할 수 없습니다. 분석 화면에서도 제거됩니다.</p>
            <div className="mt-6 flex w-full gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1 rounded-xl border-[#30363D] bg-[#252A32] text-white hover:bg-[#30363D]"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                취소
              </Button>
              <Button
                type="button"
                className="h-12 flex-1 rounded-xl bg-[#EF4444] text-white hover:bg-[#DC2626]"
                onClick={confirmDeleteSaved}
                disabled={isDeleting}
              >
                {isDeleting ? '삭제 중…' : '삭제'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
