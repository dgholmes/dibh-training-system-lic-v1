import { useState, useRef, useCallback, useEffect } from 'react';
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
import { isAllowedBreathingUploadFile } from '@/lib/breathingFileFormat';
import { buildUploadConfirmItems } from '@/lib/breathingFileCategory';
import BreathingCategorySection from '@/components/breathing/BreathingCategorySection';
import UploadConfirmDialog from '@/components/breathing/UploadConfirmDialog';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/** Per patient, per category (RM-DBF-012). */
const MAX_FILES_PER_CATEGORY = 10;

const CATEGORY_LABEL = { general: '일반호흡', dibh: 'DIBH' };

/**
 * 호흡 데이터 추가 — saves breathing files for a patient. Selecting which files
 * to analyse is a separate screen (분석할 파일 선택 / AnalysisFileSelect).
 *
 * Uploading a file into the wrong category changes the resulting DIBH type, so
 * every add passes through the RM-DBF-010 confirmation gate before anything is
 * written: the filename's category is detected, a mismatch with the chosen
 * section is flagged in red, and storage is only touched once the operator
 * confirms.
 */
export default function BreathingDataUpload() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const patientId = getPatientIdFromSearchParams(searchParams);

  const [pending, setPending] = useState({ general: [], dibh: [] });
  const [confirmState, setConfirmState] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const generalInputRef = useRef(null);
  const dibhInputRef = useRef(null);

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: async () => {
      const results = await Patient.filter({ id: patientId });
      return results[0] || null;
    },
    enabled: !!patientId,
  });

  const { data: generalSaved = [], isLoading: loadingG } = useQuery({
    queryKey: ['breathingFiles', patientId, 'general'],
    queryFn: () => listBreathingFilesByPatient(patientId, 'general'),
    enabled: !!patientId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const { data: dibhSaved = [], isLoading: loadingD } = useQuery({
    queryKey: ['breathingFiles', patientId, 'dibh'],
    queryFn: () => listBreathingFilesByPatient(patientId, 'dibh'),
    enabled: !!patientId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const loading = loadingG || loadingD;

  useEffect(() => {
    if (!patientId) return;
    Patient.get(patientId).then((exists) => {
      if (!exists) {
        toast({
          title: '환자를 찾을 수 없습니다',
          description: '목록에서 다시 선택해 주세요.',
          variant: 'destructive',
        });
        navigate(createPageUrl('Home'));
      }
    });
  }, [patientId, navigate]);

  /**
   * Writes straight to storage. There is no simulated progress: the previous
   * version animated 0.8-1.7s of fake progress before touching the database,
   * which made a local SQLite write look slow for no reason.
   */
  const persistFiles = useCallback(
    async (files, category) => {
      for (const file of files) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        setPending((p) => ({
          ...p,
          [category]: [...p[category], { id, name: file.name, status: 'saving' }],
        }));
        try {
          await createBreathingFile({ patientId, category, file });
          setPending((p) => ({ ...p, [category]: p[category].filter((f) => f.id !== id) }));
        } catch (err) {
          console.error('[BreathingDataUpload] createBreathingFile failed:', err);
          setPending((p) => ({
            ...p,
            [category]: p[category].map((f) =>
              f.id === id
                ? {
                    ...f,
                    status: 'failed',
                    error: '파일 저장 중 오류가 발생했습니다. 다시 시도해 주세요.',
                  }
                : f
            ),
          }));
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['breathingFiles'] });
    },
    [patientId, queryClient]
  );

  const handleAddFiles = useCallback(
    (fileList, category) => {
      const savedCount = category === 'general' ? generalSaved.length : dibhSaved.length;
      const existingCount = savedCount + pending[category].length;
      if (existingCount >= MAX_FILES_PER_CATEGORY) {
        toast({
          title: `${CATEGORY_LABEL[category]} 데이터는 최대 ${MAX_FILES_PER_CATEGORY}개까지 저장됩니다`,
          description: `오래된 ${CATEGORY_LABEL[category]} 데이터를 삭제한 뒤 다시 업로드해 주세요.`,
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

      const room = Math.max(0, MAX_FILES_PER_CATEGORY - existingCount);
      const limited = incoming.slice(0, room);
      if (!limited.length) return;

      setConfirmState({
        category,
        files: limited,
        items: buildUploadConfirmItems(limited, category),
      });
    },
    [generalSaved.length, dibhSaved.length, pending]
  );

  const hasBusy = pending.general.some((f) => f.status === 'saving') ||
    pending.dibh.some((f) => f.status === 'saving');

  const handleDone = () => {
    if (hasBusy) {
      toast({
        title: '저장 진행 중입니다',
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
      await queryClient.invalidateQueries({ queryKey: ['breathingFiles'] });
      setDeleteTarget(null);
    } catch (err) {
      console.error('[BreathingDataUpload] delete failed:', err);
      toast({
        title: '파일 삭제 실패',
        description: '파일 삭제 중 오류가 발생했습니다. 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

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

        {patientId && (
          <div className="space-y-6">
            <BreathingCategorySection
              category="general"
              patient={patient}
              savedFiles={generalSaved}
              pendingFiles={pending.general}
              loading={loading}
              showUpload
              onAddFiles={(list) => handleAddFiles(list, 'general')}
              onRequestDeleteSaved={setDeleteTarget}
              inputRef={generalInputRef}
            />
            <BreathingCategorySection
              category="dibh"
              patient={patient}
              savedFiles={dibhSaved}
              pendingFiles={pending.dibh}
              loading={loading}
              showUpload
              onAddFiles={(list) => handleAddFiles(list, 'dibh')}
              onRequestDeleteSaved={setDeleteTarget}
              inputRef={dibhInputRef}
            />
          </div>
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
            <p className="mt-2 text-center text-xs text-[#EAB308]">
              파일이 저장될 때까지 잠시만 기다려 주세요.
            </p>
          )}
        </div>
      </div>

      <UploadConfirmDialog
        open={!!confirmState}
        items={confirmState?.items ?? []}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          const { files, category } = confirmState;
          setConfirmState(null);
          void persistFiles(files, category);
        }}
      />

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
            <p className="text-base font-bold leading-snug text-white sm:text-lg">
              파일을 삭제할까요?
            </p>
            <p className="mt-2 break-all text-sm text-[#8B949E]">{deleteTarget?.name}</p>
            <p className="mt-2 text-sm text-[#8B949E]">
              삭제 후 복구할 수 없습니다. 분석 화면에서도 제거됩니다.
            </p>
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
