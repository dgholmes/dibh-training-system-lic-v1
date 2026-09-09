import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PatientFlowPageHeader } from '@/components/common/PatientFlowPageHeader';
import { createPageUrl, getPatientIdFromSearchParams } from '@/utils';
import {
  Patient,
  CalibrationSession,
  listBreathingFilesByPatient,
  deleteBreathingFile,
} from '@/api/entities';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatFileSize, fileTypeBadge } from '@/lib/files';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { analyzeFiles } from '@/lib/calibration/analyzeFiles';
import { breathingFileDisplayName } from '@/lib/breathingFileDisplayName';
export default function AnalysisFileSelect() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const patientId = getPatientIdFromSearchParams(searchParams);

  const [selectedGeneral, setSelectedGeneral] = useState('');
  const [selectedDibh, setSelectedDibh] = useState('');
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const abortRef = useRef(null);

  // Abort analysis on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: async () => {
      const results = await Patient.filter({ id: patientId });
      return results[0] || null;
    },
    enabled: !!patientId,
  });

  const { data: generalFiles = [], isLoading: loadingG } = useQuery({
    queryKey: ['breathingFiles', patientId, 'general'],
    queryFn: () => listBreathingFilesByPatient(patientId, 'general'),
    enabled: !!patientId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const { data: dibhFiles = [], isLoading: loadingD } = useQuery({
    queryKey: ['breathingFiles', patientId, 'dibh'],
    queryFn: () => listBreathingFilesByPatient(patientId, 'dibh'),
    enabled: !!patientId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const loading = loadingG || loadingD;

  const handleStartAnalysis = async () => {
    if (!patientId) return;
    if (!selectedGeneral || !selectedDibh) {
      setShowValidationModal(true);
      return;
    }

    setShowAnalysisModal(true);
    setAnalysisError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Run analysis and enforce a minimum display time so the user sees the animation
      const MIN_DISPLAY_MS = 2500;
      const analysisStart = Date.now();

      const result = await analyzeFiles(selectedGeneral, selectedDibh, {
        signal: controller.signal,
      });

      // Wait for the remainder of minimum display time (if analysis was fast)
      const elapsed = Date.now() - analysisStart;
      if (elapsed < MIN_DISPLAY_MS) {
        await new Promise((r) => setTimeout(r, MIN_DISPLAY_MS - elapsed));
      }

      // Create a CalibrationSession and immediately complete it
      // — this creates a Calibration record and updates the Patient, same as Bluetooth flow
      const session = CalibrationSession.create({
        patient_id: patientId,
        status: 'in_progress',
        current_stage_index: 0,
        completed_stages: [],
        stage_data: {},
        source: 'file_analysis',
      });

      const genRow = generalFiles.find((f) => f.id === selectedGeneral);
      const dibhRow = dibhFiles.find((f) => f.id === selectedDibh);
      // Stored name, never the display name: this goes into the Calibration
      // record, which is hash-verified but not encrypted (RM-DBF-003).
      const source_files = [genRow?.original_name, dibhRow?.original_name].filter(Boolean);

      await CalibrationSession.complete(session.id, {
        training_type: result.trainingType,
        dibh_duration: result.avgDibh ?? 0,
        cv: result.cv ?? 0,
        algorithm_results: result.algorithmResults,
        source: result.source,
        playback: result.playback,
        breathing_file_ids: { general: selectedGeneral, dibh: selectedDibh },
        source_files,
      });

      await queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      await queryClient.invalidateQueries({ queryKey: ['calibrations', patientId] });
      await queryClient.invalidateQueries({ queryKey: ['latestCalibration', patientId] });
      await queryClient.invalidateQueries({ queryKey: ['breathingFiles'] });
      await queryClient.invalidateQueries({ queryKey: ['patients'] });

      setShowAnalysisModal(false);
      navigate(`${createPageUrl('TypeDecision')}?patientId=${encodeURIComponent(patientId)}`);
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled — just close modal
        setShowAnalysisModal(false);
        return;
      }
      console.error('[AnalysisFileSelect] Analysis failed:', err);
      // analyzeFiles() throws clean, user-facing Korean messages (missing file, no valid data, VXP
      // format error) — surface those directly; fall back to a generic message for anything else.
      setAnalysisError(err.message || '분석 중 오류가 발생했습니다. 파일을 확인하고 다시 시도해 주세요.');
    }
  };

  const handleCancelAnalysis = () => {
    abortRef.current?.abort();
    setShowAnalysisModal(false);
  };

  const handleHome = () => {
    navigate(createPageUrl('Home'));
  };

  const formatUploadedAt = (iso) => {
    try {
      return format(new Date(iso), 'yyyy.MM.dd HH:mm');
    } catch {
      return iso;
    }
  };

  const handleConfirmDeleteFile = async () => {
    if (!deleteTarget) return;
    setIsDeletingFile(true);
    try {
      await deleteBreathingFile(deleteTarget.id);
      if (selectedGeneral === deleteTarget.id) setSelectedGeneral('');
      if (selectedDibh === deleteTarget.id) setSelectedDibh('');
      queryClient.invalidateQueries({ queryKey: ['breathingFiles'] });
      setDeleteTarget(null);
    } catch (err) {
      console.error('[AnalysisFileSelect] delete failed:', err);
      toast({
        title: '파일 삭제 실패',
        description: '파일 삭제 중 오류가 발생했습니다. 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingFile(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-32">
      <div className="mx-auto max-w-2xl">
        <PatientFlowPageHeader
          backHref={
            patientId
              ? `${createPageUrl('PatientDashboard')}?patientId=${encodeURIComponent(patientId)}`
              : createPageUrl('Home')
          }
          title="분석할 파일 선택"
          patient={patient}
        />

        <div className="mb-6 space-y-2 text-sm text-[#8B949E]">
          <p>이 환자에게 등록된 호흡 데이터 목록입니다.</p>
          <p className="text-xs leading-relaxed text-[#6E7681]">
            업로드는 CSV·VXP 모두 가능합니다. 이 화면에서 실행하는 분석은{' '}
            <span className="font-medium text-[#8B949E]">일반·DIBH 각각 CSV 파일</span>을 선택해야 합니다.
          </p>
          {patientId ? (
            <p>
              <Link
                to={`${createPageUrl('BreathingDataUpload')}?patientId=${encodeURIComponent(patientId)}`}
                className="font-medium text-[#79B8FF] underline-offset-2 hover:underline"
              >
                호흡 파일 추가
              </Link>
              화면에서 일반·DIBH 파일을 더 등록할 수 있습니다.
            </p>
          ) : null}
        </div>

        {!patientId && (
          <p className="text-sm text-[#EF4444]">patientId가 없습니다.</p>
        )}

        {patientId && (
          <>
            <section className="mb-8">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
                <span className="h-5 w-1 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#8B5CF6]" />
                일반호흡 업로드 파일
              </h2>
              {loading ? (
                <p className="text-sm text-[#8B949E]">불러오는 중…</p>
              ) : generalFiles.length === 0 ? (
                <p className="rounded-xl border border-[#30363D] bg-[#1C2128] p-4 text-sm text-[#8B949E]">
                  등록된 일반호흡 파일이 없습니다. 환자 등록 시 업로드가 완료된 뒤 등록 완료를 눌렀는지 확인하거나, 업로드 진행 중에 등록하지 않았는지 확인해 주세요.
                </p>
              ) : (
                <ul className="space-y-3">
                  {generalFiles.map((f) => {
                    const active = selectedGeneral === f.id;
                    return (
                      <li key={f.id} className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedGeneral(f.id)}
                          className={cn(
                            'flex min-w-0 flex-1 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                            active
                              ? 'border-[#3B82F6] bg-[#1C2128] ring-1 ring-[#3B82F6]/40'
                              : 'border-[#30363D]/80 bg-[#252A32] hover:border-[#8B949E]/40'
                          )}
                        >
                          <div
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#30363D] bg-[#1C2128] text-[10px] font-bold uppercase tracking-wide text-[#C9D1D9]'
                            )}
                          >
                            {fileTypeBadge(f.original_name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">
                              {breathingFileDisplayName(f.original_name, patient)}
                            </p>
                            <p className="mt-0.5 text-xs text-[#9BA1A6]">
                              {formatFileSize(f.size_bytes)} · {formatUploadedAt(f.imported_at)} 업로드
                            </p>
                          </div>
                          <div
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                              active ? 'border-[#3B82F6] bg-[#3B82F6]' : 'border-[#8B949E] bg-transparent'
                            )}
                          >
                            {active && <span className="h-2 w-2 rounded-full bg-white" />}
                          </div>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-[52px] w-11 shrink-0 rounded-2xl text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                          aria-label="파일 삭제"
                          onClick={() =>
                            setDeleteTarget({
                              id: f.id,
                              name: breathingFileDisplayName(f.original_name, patient),
                            })
                          }
                        >
                          <X className="h-5 w-5" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="mb-8">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
                <span className="h-5 w-1 rounded-full bg-gradient-to-b from-[#8B5CF6] to-[#3B82F6]" />
                DIBH 업로드 파일
              </h2>
              {loading ? (
                <p className="text-sm text-[#8B949E]">불러오는 중…</p>
              ) : dibhFiles.length === 0 ? (
                <p className="rounded-xl border border-[#30363D] bg-[#1C2128] p-4 text-sm text-[#8B949E]">
                  등록된 DIBH 파일이 없습니다.
                </p>
              ) : (
                <ul className="space-y-3">
                  {dibhFiles.map((f) => {
                    const active = selectedDibh === f.id;
                    return (
                      <li key={f.id} className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedDibh(f.id)}
                          className={cn(
                            'flex min-w-0 flex-1 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                            active
                              ? 'border-[#3B82F6] bg-[#1C2128] ring-1 ring-[#3B82F6]/40'
                              : 'border-[#30363D]/80 bg-[#252A32] hover:border-[#8B949E]/40'
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#30363D] bg-[#1C2128] text-[10px] font-bold uppercase tracking-wide text-[#C9D1D9]">
                            {fileTypeBadge(f.original_name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">
                              {breathingFileDisplayName(f.original_name, patient)}
                            </p>
                            <p className="mt-0.5 text-xs text-[#9BA1A6]">
                              {formatFileSize(f.size_bytes)} · {formatUploadedAt(f.imported_at)} 업로드
                            </p>
                          </div>
                          <div
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                              active ? 'border-[#3B82F6] bg-[#3B82F6]' : 'border-[#8B949E] bg-transparent'
                            )}
                          >
                            {active && <span className="h-2 w-2 rounded-full bg-white" />}
                          </div>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-[52px] w-11 shrink-0 rounded-2xl text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                          aria-label="파일 삭제"
                          onClick={() =>
                            setDeleteTarget({
                              id: f.id,
                              name: breathingFileDisplayName(f.original_name, patient),
                            })
                          }
                        >
                          <X className="h-5 w-5" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0D1117]/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1 border-[#30363D] bg-[#1C2128] text-white hover:bg-[#30363D]"
            onClick={handleHome}
          >
            처음으로
          </Button>
          <Button
            type="button"
            disabled={!patientId || loading}
            className="h-12 flex-[1.2] bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-base font-semibold text-white hover:from-[#2563EB] hover:to-[#7C3AED] disabled:opacity-50"
            onClick={handleStartAnalysis}
          >
            분석 시작
          </Button>
        </div>
      </div>

      {/* Validation modal */}
      <Dialog open={showValidationModal} onOpenChange={setShowValidationModal}>
        <DialogContent
          hideClose
          className="max-w-[min(100%,380px)] gap-0 border border-[#30363D] bg-[#1C2128] p-0 shadow-2xl sm:rounded-2xl"
        >
          <DialogTitle className="sr-only">파일 선택 필요</DialogTitle>
          <DialogDescription className="sr-only">일반호흡 파일과 DIBH 파일을 각각 선택해야 합니다.</DialogDescription>
          <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
            <div
              className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#EF4444]/15"
              aria-hidden
            >
              <span className="text-3xl font-bold leading-none text-[#EF4444]">!</span>
            </div>
            <p className="text-base font-bold leading-snug text-white sm:text-lg">
              분석할 파일을 모두 선택해 주세요.
            </p>
            <p className="mt-2 text-sm text-[#8B949E]">
              일반호흡 파일과 DIBH 파일을 각각 1개씩 선택해야 다음 단계로 이동할 수 있습니다.
            </p>
            <Button
              type="button"
              className="mt-8 h-12 w-full rounded-xl text-base font-semibold bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white shadow-lg shadow-[#3B82F6]/25 transition-all hover:from-[#2563EB] hover:to-[#7C3AED]"
              onClick={() => setShowValidationModal(false)}
            >
              확인
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent
          hideClose
          className="max-w-[min(100%,380px)] gap-0 border border-[#30363D] bg-[#1C2128] p-0 shadow-2xl sm:rounded-2xl"
        >
          <DialogTitle className="sr-only">파일 삭제</DialogTitle>
          <DialogDescription className="sr-only">선택한 파일을 저장소에서 삭제합니다.</DialogDescription>
          <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
            <div
              className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#EF4444]/15"
              aria-hidden
            >
              <span className="text-3xl font-bold leading-none text-[#EF4444]">!</span>
            </div>
            <p className="text-base font-bold leading-snug text-white sm:text-lg">파일을 삭제할까요?</p>
            <p className="mt-2 break-all text-sm text-[#8B949E]">{deleteTarget?.name}</p>
            <p className="mt-2 text-sm text-[#8B949E]">삭제된 파일은 복구할 수 없습니다.</p>
            <div className="mt-6 flex w-full gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1 rounded-xl border-[#30363D] bg-[#252A32] text-white hover:bg-[#30363D]"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeletingFile}
              >
                취소
              </Button>
              <Button
                type="button"
                className="h-12 flex-1 rounded-xl bg-[#EF4444] text-white hover:bg-[#DC2626]"
                onClick={handleConfirmDeleteFile}
                disabled={isDeletingFile}
              >
                {isDeletingFile ? '삭제 중…' : '삭제'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Analysis loading modal */}
      <Dialog open={showAnalysisModal} onOpenChange={() => {}}>
        <DialogContent
          hideClose
          className="max-w-[min(90%,440px)] gap-0 border border-[#30363D] bg-[#161B22] p-0 shadow-2xl sm:rounded-2xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">호흡 데이터 분석 중</DialogTitle>
          <DialogDescription className="sr-only">업로드된 파일의 패턴을 분석하고 있습니다.</DialogDescription>

          <div className="flex flex-col items-center px-6 pb-6 pt-6 text-center">
            {/* Loading animation */}
            <div className="mb-4 w-full overflow-hidden rounded-xl bg-[#0D1117]">
              <img src="/analysis-loading.webp" alt="" className="w-full" />
            </div>

            {analysisError ? (
              <>
                <p className="text-base font-bold text-[#EF4444]">분석에 실패했습니다</p>
                <p className="mt-2 text-sm text-[#8B949E]">{analysisError}</p>
                <Button
                  type="button"
                  className="mt-6 h-12 w-full rounded-xl text-base font-semibold bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white"
                  onClick={() => {
                    setShowAnalysisModal(false);
                    setAnalysisError(null);
                  }}
                >
                  확인
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-white">호흡 데이터를 분석 중입니다</h3>
                <p className="mt-2 text-sm text-[#8B949E]">
                  업로드된 파일의 패턴을 정밀하게 추출하고 있습니다.
                </p>
                <p className="text-sm text-[#8B949E]">잠시만 기다려주세요.(창을 닫지 마세요)</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-6 h-10 rounded-xl border-[#30363D] bg-[#1C2128] text-sm text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                  onClick={handleCancelAnalysis}
                >
                  분석 취소
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
