import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, LogOut, Plus, Edit, Trash2, Folder, RefreshCw, Calendar as CalendarIcon, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl, getPatientIdFromSearchParams } from '@/utils';
import {
  Patient,
  Calibration,
  TrainingSession,
  listAllBreathingFilesByPatient,
} from '@/api/entities';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCalibrationStatus, getRecalibrationReason } from '@/utils/recalibration';
import { getLatestCalibration, sortCalibrationsDesc } from '@/lib/calibration/sortCalibrations';
import { format, parseISO, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { darkPopoverCalendarClassNames } from '@/lib/darkPopoverCalendar';
import { nextPatientCode } from '@/lib/patientCode';
import { BreathingTypeBadge } from '@/components/breathing/BreathingTypeBadge';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from '@/components/ui/use-toast';

const genderOptions = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
  { value: 'unspecified', label: '선택안함' },
];

const typeLabels = {
  A: { label: '우수 호흡', className: 'bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/40' },
  B: { label: '보통', className: 'bg-[#EAB308]/20 text-[#EAB308] border-[#EAB308]/40' },
  C: { label: '얕은 호흡', className: 'bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/40' },
};

function genderShort(g) {
  if (g === 'male') return 'M';
  if (g === 'female') return 'F';
  return '—';
}

export default function PatientDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const patientId = getPatientIdFromSearchParams(urlParams);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    birth_date: '',
    gender: 'male',
    treatment_session_count: 0,
    patient_code: '',
    assigned_doctor_name: '',
  });
  const [editSessionManualMode, setEditSessionManualMode] = useState(false);
  const [editBirthPopoverOpen, setEditBirthPopoverOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: async () => {
      const results = await Patient.filter({ id: patientId });
      return results[0] || null;
    },
    enabled: !!patientId,
  });

  const { data: calibrations = [] } = useQuery({
    queryKey: ['calibrations', patientId],
    queryFn: () => Calibration.filter({ patient_id: patientId }),
    enabled: !!patientId,
  });

  const { data: trainingSessions = [] } = useQuery({
    queryKey: ['trainingSessions', patientId],
    queryFn: () => TrainingSession.filter({ patient_id: patientId }),
    enabled: !!patientId,
  });

  const { data: breathingFiles = [] } = useQuery({
    queryKey: ['breathingFiles', patientId, 'all'],
    queryFn: () => listAllBreathingFilesByPatient(patientId),
    enabled: !!patientId,
  });

  const calibrationStatus = patient ? getCalibrationStatus(patient) : null;
  const recalibrationReason = patient ? getRecalibrationReason(patient) : null;

  /** 최근 방문일: 등록일(created_at)을 기준으로 두고, 훈련(치료)이 있을 때마다 해당 세션 시각으로 갱신되어 보이는 최댓값. */
  const lastVisitDate = useMemo(() => {
    const candidates = [];
    if (patient?.created_at) {
      const t = parseISO(String(patient.created_at));
      if (isValid(t)) candidates.push(t);
    }
    trainingSessions.forEach((s) => {
      const raw = s.completed_at || s.session_date || s.created_at;
      if (!raw) return;
      const t = parseISO(String(raw));
      if (isValid(t)) candidates.push(t);
    });
    if (!candidates.length) return null;
    return new Date(Math.max(...candidates.map((d) => d.getTime())));
  }, [patient, trainingSessions]);

  const lastAnalysisLabel = useMemo(() => {
    const dates = [];
    if (calibrations.length) {
      const latest = getLatestCalibration(calibrations);
      if (latest?.calibration_date) dates.push(new Date(latest.calibration_date));
    }
    breathingFiles.forEach((f) => {
      if (f.imported_at) dates.push(new Date(f.imported_at));
    });
    if (!dates.length) return null;
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    return format(max, 'yyyy.MM.dd');
  }, [calibrations, breathingFiles]);

  const historyRows = useMemo(() => {
    const rows = [];
    sortCalibrationsDesc(calibrations).forEach((c) => {
      const t = c.training_type;
      const tl = typeLabels[t] || { label: `Type ${t || '—'}`, className: '' };
      const fileDetail = (() => {
        if (c.source_files && Array.isArray(c.source_files) && c.source_files.length) {
          return c.source_files.join(', ');
        }
        const ids = c.breathing_file_ids;
        if (ids && typeof ids === 'object' && (ids.general || ids.dibh)) {
          const parts = [];
          if (ids.general) parts.push('일반 호흡');
          if (ids.dibh) parts.push('DIBH');
          return parts.join(', ');
        }
        return null;
      })();
      rows.push({
        id: `cal-${c.id}`,
        date: c.calibration_date,
        detail: fileDetail,
        result: t ? `Type ${t}` : '—',
        resultClass: tl.className,
        reportHref:
          `/CalibrationReport?patientId=${encodeURIComponent(patientId)}&calibrationId=${encodeURIComponent(c.id)}`,
      });
    });
    return rows;
  }, [patientId, calibrations]);

  const latestCalibration = useMemo(() => getLatestCalibration(calibrations), [calibrations]);

  const analysisReportCardHref = useMemo(() => {
    if (!patientId || !latestCalibration?.id) return null;
    return `/CalibrationReport?patientId=${encodeURIComponent(patientId)}&calibrationId=${encodeURIComponent(latestCalibration.id)}`;
  }, [patientId, latestCalibration?.id]);

  const { logout } = useAuth();
  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleRecalibrate = () => {
    navigate(createPageUrl('AnalysisFileSelect') + `?patientId=${encodeURIComponent(patientId)}`);
  };

  const handleEdit = () => setShowEditModal(true);
  const handleDelete = () => setShowDeleteModal(true);

  const handleConfirmDelete = async () => {
    if (patientId) {
      try {
        await Patient.delete(patientId);
        queryClient.invalidateQueries({ queryKey: ['patients'] });
        navigate(createPageUrl('Home'));
      } catch (err) {
        console.error('[PatientDashboard] delete failed:', err);
        toast({
          title: '삭제 실패',
          description: '환자 삭제에 실패했습니다. 다시 시도해 주세요.',
          variant: 'destructive',
        });
      }
    }
    setShowDeleteModal(false);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!patientId) return;
    if (!editFormData.name.trim() || editFormData.name.trim().length > 100 || !editFormData.birth_date) {
      return;
    }
    setIsSaving(true);
    try {
      await Patient.update(patientId, {
        name: editFormData.name.trim(),
        birth_date: editFormData.birth_date,
        gender: editFormData.gender,
        treatment_session_count: editFormData.treatment_session_count,
        patient_code: editFormData.patient_code,
        assigned_doctor_name: editFormData.assigned_doctor_name.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      setShowEditModal(false);
    } catch (err) {
      console.error('[PatientDashboard] save edit failed:', err);
      toast({
        title: '저장 실패',
        description: '환자 정보 저장에 실패했습니다. 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (showEditModal && patient) {
      setEditSessionManualMode(false);
      setEditBirthPopoverOpen(false);
      setEditFormData({
        name: patient.name || '',
        birth_date: patient.birth_date || '',
        gender: patient.gender || 'male',
        treatment_session_count: patient.treatment_session_count ?? 0,
        patient_code: patient.patient_code || nextPatientCode(),
        assigned_doctor_name: patient.assigned_doctor_name || '',
      });
    }
  }, [showEditModal, patient]);

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-28">
      <div className="mx-auto max-w-3xl">
        {/* Top bar */}
        <div className="sticky top-0 z-20 mb-6 flex items-center gap-3 bg-[#0D1117] py-1">
          <Link to={createPageUrl('Home')}>
            <Button variant="ghost" size="icon" className="text-[#8B949E] hover:bg-[#1C2128] hover:text-white">
              <ArrowLeft className="h-6 w-6" />
            </Button>
          </Link>
          <h1 className="flex-1 text-xl font-bold text-white sm:text-2xl">환자 차트 (대시보드)</h1>
          <Button
            type="button"
            variant="ghost"
            onClick={handleLogout}
            className="gap-2 text-[#8B949E] hover:bg-[#1C2128] hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">로그아웃</span>
          </Button>
        </div>

        {!patientId && (
          <p className="text-sm text-[#EF4444]">patientId가 없습니다.</p>
        )}

        {patientId && (
          <div className="space-y-5">
            {/* Patient summary card */}
            <div className="rounded-2xl border border-[#30363D] bg-[#1C2128]">
              <div className="p-5 sm:p-6">
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#8B5CF6]" />
                    <h2 className="text-2xl font-bold text-white sm:text-3xl">{patient?.name ?? '—'}</h2>
                    {patient?.patient_code && (
                      <span className="rounded-full border border-[#30363D] bg-[#0D1117] px-3 py-1 text-xs font-medium text-[#8B949E]">
                        {patient.patient_code}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleEdit}
                      className="border-[#30363D] bg-[#252A32] text-white hover:bg-[#30363D]"
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      정보 수정
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDelete}
                      className="border-[#EF4444]/50 bg-transparent text-[#EF4444] hover:bg-[#EF4444]/10"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      삭제
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs text-[#8B949E]">생년월일(성별)</p>
                    <p className="text-sm font-medium text-white">
                      {patient?.birth_date
                        ? `${format(parseISO(patient.birth_date), 'yyyy.MM.dd')} (${genderShort(patient.gender)})`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-[#8B949E]">담당 의사</p>
                    <p className="text-sm font-medium text-white">
                      {patient?.assigned_doctor_name || patient?.assigned_doctor || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-[#8B949E]">치료 회차</p>
                    <p className="text-sm font-medium">
                      <span className="text-[#3B82F6]">{patient?.treatment_session_count ?? 0}</span>
                      <span className="text-white">회차</span>
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-[#8B949E]">방문일</p>
                    <p className="text-sm font-medium text-white">
                      {lastVisitDate ? format(lastVisitDate, 'yyyy.MM.dd') : '이력 없음'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 호흡 분석 결과 – dashboard card (entire card opens CalibrationReport when data exists) */}
            {analysisReportCardHref ? (
              <Link
                to={analysisReportCardHref}
                className="block rounded-2xl border border-[#30363D] bg-[#1C2128] p-5 sm:p-6 transition-colors hover:border-[#3B82F6]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117]"
                aria-label="호흡 분석 결과 상세 보기"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                    <span className="h-5 w-1 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#8B5CF6]" />
                    호흡 분석 결과
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-[#8B949E]">
                    <span>최근 분석 상태</span>
                    <span className="rounded-full border border-[#30363D] bg-[#0D1117] px-2 py-0.5 text-[11px] font-medium">
                      {lastAnalysisLabel ?? '없음'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-10">
                  <BreathingTypeBadge
                    type={latestCalibration.training_type || patient?.training_type || 'A'}
                    compact
                    className="bg-[#0D1117]"
                  />

                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 sm:gap-4">
                    <p className="text-sm font-medium text-[#C9D1D9] sm:text-base">
                      현재 환자는{' '}
                      <span className="font-semibold text-white">
                        {latestCalibration.training_type === 'C'
                          ? 'DIBH 비권장 상태'
                          : 'DIBH 가능 상태'}
                      </span>
                      입니다.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="mb-1 text-xs text-[#8B949E]">DIBH 유지 시간</p>
                        <p className="text-2xl font-bold text-white">
                          {latestCalibration.dibh_duration != null
                            ? `${latestCalibration.dibh_duration}초`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-[#8B949E]">호흡 안정성 (CV)</p>
                        <p className="text-2xl font-bold text-white">
                          {latestCalibration.cv != null ? `${latestCalibration.cv}%` : '—'}
                        </p>
                      </div>
                    </div>
                    {recalibrationReason && calibrationStatus && (
                      <p
                        className={cn(
                          'mt-1 text-xs',
                          calibrationStatus === 'expired' ? 'text-[#EF4444]' : 'text-[#EAB308]'
                        )}
                      >
                        {recalibrationReason}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ) : (
              <div className="rounded-2xl border border-[#30363D] bg-[#1C2128] p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                    <span className="h-5 w-1 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#8B5CF6]" />
                    호흡 분석 결과
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-[#8B949E]">
                    <span>최근 분석 상태</span>
                    <span className="rounded-full border border-[#30363D] bg-[#0D1117] px-2 py-0.5 text-[11px] font-medium">
                      {lastAnalysisLabel ?? '없음'}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-dashed border-[#30363D] bg-[#161B22] px-4 py-5 text-sm text-[#8B949E] sm:px-5">
                  <p className="font-medium text-white mb-1.5">아직 호흡 분석 결과가 없습니다.</p>
                  <p>
                    상단의 <span className="font-semibold text-[#3B82F6]">[데이터 추가]</span>로 일반·DIBH
                    데이터(CSV 또는 VXP)를 업로드한 뒤,{' '}
                    <span className="font-semibold text-[#3B82F6]">[호흡 분석]</span>에서 파일을 선택해
                    분석을 실행해 주세요.
                  </p>
                </div>
              </div>
            )}

            {/* Upload and analysis are one screen now (formative evaluation #9) */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={handleRecalibrate}
                className="h-12 flex-1 bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] font-semibold text-white hover:from-[#2563EB] hover:to-[#7C3AED]"
              >
                {latestCalibration ? (
                  <RefreshCw className="mr-2 h-4 w-4" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                {latestCalibration ? '다시 분석' : '호흡 데이터 · 분석'}
              </Button>
            </div>

            {/* Calibration history table */}
            <div className="overflow-hidden rounded-2xl border border-[#30363D] bg-[#1C2128]">
              <div className="border-b border-[#30363D] px-4 py-3 sm:px-5">
                <h3 className="text-base font-bold text-white">캘리브레이션 히스토리</h3>
              </div>
              {historyRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <Folder className="mb-4 h-14 w-14 text-[#30363D]" />
                  <p className="mb-2 text-sm text-[#8B949E]">캘리브레이션 이력이 없습니다.</p>
                  <p className="max-w-sm text-xs text-[#6E7681]">
                    상단의 [데이터 추가] 버튼을 눌러 첫 분석을 시작해 주세요.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#30363D] bg-[#0D1117]/80 text-[#8B949E]">
                        <th className="px-4 py-3 font-medium">일자</th>
                        <th className="px-4 py-3 font-medium">사용 파일</th>
                        <th className="px-4 py-3 font-medium">결과</th>
                        <th className="px-4 py-3 font-medium">리포트</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((row) => (
                        <tr key={row.id} className="border-b border-[#30363D]/80 last:border-0">
                          <td className="whitespace-nowrap px-4 py-3 text-white">
                            {row.date ? format(parseISO(String(row.date)), 'yyyy.MM.dd') : '—'}
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-3 text-[#8B949E] text-xs" title={row.detail}>
                            {row.detail || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold',
                                row.resultClass?.includes('22C55E')
                                  ? 'bg-[#22C55E]/15 text-[#22C55E]'
                                  : row.resultClass?.includes('EAB308')
                                  ? 'bg-[#EAB308]/15 text-[#EAB308]'
                                  : row.resultClass?.includes('EF4444')
                                  ? 'bg-[#EF4444]/15 text-[#EF4444]'
                                  : 'bg-[#8B949E]/15 text-[#8B949E]'
                              )}
                            >
                              {row.result || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {row.reportHref ? (
                              <Link
                                to={row.reportHref}
                                className="font-medium text-[#3B82F6] hover:underline"
                              >
                                결과지
                              </Link>
                            ) : (
                              <span className="text-[#6E7681]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 환자 정보 수정: 이름·생년월일·성별·치료회차·환자 코드만 저장 */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent
          hideClose
          className="max-h-[92vh] max-w-lg overflow-y-auto border border-[#30363D] bg-[#1C2128] p-0 text-white sm:rounded-2xl"
        >
          <DialogTitle className="sr-only">환자 정보 수정</DialogTitle>
          <DialogDescription className="sr-only">환자의 기본 정보를 수정합니다.</DialogDescription>
          <form onSubmit={handleSaveEdit} className="pb-6">
            <div className="flex items-center justify-between border-b border-[#30363D] px-6 py-4">
              <p className="text-sm font-semibold text-[#C9D1D9]">환자 정보 수정</p>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="rounded-lg p-1 text-[#8B949E] transition-colors hover:bg-[#30363D] hover:text-white"
                aria-label="닫기"
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </div>

            <div className="space-y-5 px-6 pt-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                <span className="h-5 w-1 shrink-0 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#8B5CF6]" />
                기본 정보(필수)
              </h2>

              <div>
                <Label htmlFor="edit-name" className="mb-2 block font-medium text-[#8B949E]">
                  환자 이름
                </Label>
                <Input
                  id="edit-name"
                  placeholder="환자 이름을 입력하세요"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] text-white placeholder:text-[#6E7681] focus-visible:ring-[#3B82F6]/40"
                  autoComplete="name"
                />
              </div>

              <div>
                <Label htmlFor="edit-doctor" className="mb-2 block font-medium text-[#8B949E]">
                  담당 의사
                </Label>
                <Input
                  id="edit-doctor"
                  placeholder="담당 의사 이름을 입력하세요"
                  value={editFormData.assigned_doctor_name}
                  onChange={(e) => setEditFormData({ ...editFormData, assigned_doctor_name: e.target.value })}
                  className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] text-white placeholder:text-[#6E7681] focus-visible:ring-[#3B82F6]/40"
                />
              </div>

              <div>
                <Label className="mb-2 block font-medium text-[#8B949E]">생년월일</Label>
                <Popover open={editBirthPopoverOpen} onOpenChange={setEditBirthPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'flex h-12 w-full items-center gap-3 rounded-xl border bg-[#0D1117] px-4 text-left text-sm transition-colors',
                        'border-[#30363D] hover:border-[#8B949E]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50'
                      )}
                    >
                      <CalendarIcon className="h-5 w-5 shrink-0 text-[#8B949E]" aria-hidden />
                      <span className={editFormData.birth_date ? 'text-white' : 'text-[#6E7681]'}>
                        {editFormData.birth_date && isValid(parseISO(editFormData.birth_date))
                          ? format(parseISO(editFormData.birth_date), 'MM/dd/yyyy')
                          : 'mm/dd/yyyy'}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto border border-[#30363D] bg-[#1C2128] p-0 text-white"
                    align="start"
                    sideOffset={8}
                  >
                    <Calendar
                      mode="single"
                      selected={
                        editFormData.birth_date && isValid(parseISO(editFormData.birth_date))
                          ? parseISO(editFormData.birth_date)
                          : undefined
                      }
                      onSelect={(date) => {
                        setEditFormData({
                          ...editFormData,
                          birth_date: date ? format(date, 'yyyy-MM-dd') : '',
                        });
                        setEditBirthPopoverOpen(false);
                      }}
                      defaultMonth={
                        editFormData.birth_date && isValid(parseISO(editFormData.birth_date))
                          ? parseISO(editFormData.birth_date)
                          : new Date()
                      }
                      initialFocus
                      className="rounded-md border-0 bg-transparent text-white"
                      classNames={darkPopoverCalendarClassNames}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label className="mb-2 block font-medium text-[#8B949E]">성별</Label>
                <div className="flex flex-wrap gap-2">
                  {genderOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditFormData({ ...editFormData, gender: opt.value })}
                      className={cn(
                        'flex min-w-[5.5rem] flex-1 items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors sm:flex-none sm:px-4',
                        editFormData.gender === opt.value
                          ? 'border-[#3B82F6] bg-[#3B82F6]/10 text-white ring-1 ring-[#3B82F6]/40'
                          : 'border-[#30363D] bg-[#0D1117] text-[#8B949E] hover:border-[#8B949E]/50 hover:text-white'
                      )}
                    >
                      <span
                        className={cn(
                          'mr-2 inline-block h-2.5 w-2.5 shrink-0 rounded-full border align-middle',
                          editFormData.gender === opt.value
                            ? 'border-[#3B82F6] bg-[#3B82F6]'
                            : 'border-[#8B949E] bg-transparent'
                        )}
                      />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2 block font-medium text-[#8B949E]">치료회차</Label>
                <div className="flex flex-wrap items-center gap-3">
                  {!editSessionManualMode ? (
                    <div className="flex items-center gap-0.5 rounded-full border border-[#30363D] bg-[#0D1117] p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                        onClick={() =>
                          setEditFormData((prev) => ({
                            ...prev,
                            treatment_session_count: Math.max(0, prev.treatment_session_count - 1),
                          }))
                        }
                      >
                        <Minus className="h-5 w-5" />
                      </Button>
                      <span className="min-w-[2.75rem] text-center text-sm font-semibold tabular-nums text-white">
                        {editFormData.treatment_session_count}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                        onClick={() =>
                          setEditFormData((prev) => ({
                            ...prev,
                            treatment_session_count: prev.treatment_session_count + 1,
                          }))
                        }
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      value={editFormData.treatment_session_count}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          treatment_session_count: Math.max(0, parseInt(e.target.value, 10) || 0),
                        })
                      }
                      className="h-12 w-32 rounded-xl border-[#30363D] bg-[#0D1117] text-white"
                    />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 rounded-xl border-[#30363D] bg-transparent text-[#C9D1D9] hover:bg-[#30363D] hover:text-white"
                    onClick={() => setEditSessionManualMode((m) => !m)}
                  >
                    직접입력
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="edit-patient-code" className="mb-2 block font-medium text-[#8B949E]">
                  환자 코드
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="edit-patient-code"
                    readOnly
                    value={editFormData.patient_code}
                    className="h-12 flex-1 rounded-xl border-[#30363D] bg-[#0D1117] text-[#C9D1D9]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 shrink-0 rounded-xl border-[#30363D] bg-transparent px-3 text-[#C9D1D9] hover:bg-[#30363D] hover:text-white sm:px-4"
                    onClick={() => setEditFormData((prev) => ({ ...prev, patient_code: nextPatientCode() }))}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    다시 생성하기
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-8 flex gap-3 px-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditModal(false)}
                className="h-12 flex-1 rounded-xl border-[#30363D] bg-[#0D1117] text-white hover:bg-[#252A32]"
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !editFormData.name.trim() || !editFormData.birth_date}
                className="h-12 flex-1 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] font-semibold text-white hover:from-[#2563EB] hover:to-[#7C3AED] disabled:opacity-50"
              >
                {isSaving ? '저장 중…' : '저장'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — same visual language as upload validation modals */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent
          hideClose
          className="max-w-[min(100%,420px)] gap-0 overflow-hidden border border-[#30363D] bg-[#1C2128] p-0 shadow-2xl sm:rounded-2xl"
        >
          <DialogTitle className="sr-only">환자 삭제</DialogTitle>
          <DialogDescription className="sr-only">환자 정보를 영구 삭제합니다.</DialogDescription>
          <div className="h-1 w-full bg-[#EF4444]/90" aria-hidden />
          <div className="px-6 pb-6 pt-8 text-center">
            <div
              className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#EF4444]/15"
              aria-hidden
            >
              <span className="text-3xl font-bold leading-none text-[#EF4444]">!</span>
            </div>
            <p className="text-base font-bold text-white sm:text-lg">환자 정보를 정말 삭제하시겠습니까?</p>
            <p className="mt-3 text-sm leading-relaxed text-[#8B949E]">
              등록된 환자의 개인정보 및 호흡 데이터, 시뮬레이션 결과가 모두 시스템에서 영구적으로 삭제됩니다.
            </p>
            <div className="mt-4 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-center text-sm text-[#FCA5A5]">
              삭제된 데이터는 복구할 수 없습니다.
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl border-[#30363D] bg-[#252A32] text-white hover:bg-[#30363D]"
                onClick={() => setShowDeleteModal(false)}
              >
                아니오, 취소합니다
              </Button>
              <Button
                type="button"
                className="h-12 rounded-xl bg-[#EF4444] font-semibold text-white hover:bg-[#DC2626]"
                onClick={handleConfirmDelete}
              >
                예, 삭제합니다
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
