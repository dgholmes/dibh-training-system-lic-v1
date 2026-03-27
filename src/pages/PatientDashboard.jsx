import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  LogOut,
  Plus,
  ChevronRight,
  Lock,
  Headphones,
  Edit,
  Trash2,
  X,
  Folder,
  Play,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl, getPatientIdFromSearchParams } from '@/utils';
import {
  Patient,
  Calibration,
  TrainingSession,
  listAllBreathingFilesByPatient,
} from '@/api/entities';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCalibrationStatus, getRecalibrationReason, needsRecalibration } from '@/utils/recalibration';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';

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
    expected_treatment_date: '',
    treatment_method: '',
    breathing_method: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => {
      const results = Patient.filter({ id: patientId });
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
  const needsRecal = patient ? needsRecalibration(patient) : true;

  const lastVisitDate = useMemo(() => {
    if (!trainingSessions.length) return null;
    const sorted = [...trainingSessions].sort(
      (a, b) => new Date(b.session_date || b.created_at || 0) - new Date(a.session_date || a.created_at || 0)
    );
    const d = sorted[0]?.session_date || sorted[0]?.created_at;
    return d ? parseISO(String(d)) : null;
  }, [trainingSessions]);

  const lastAnalysisLabel = useMemo(() => {
    const dates = [];
    if (calibrations.length) {
      const latest = [...calibrations].sort(
        (a, b) => new Date(b.calibration_date) - new Date(a.calibration_date)
      )[0];
      if (latest?.calibration_date) dates.push(new Date(latest.calibration_date));
    }
    breathingFiles.forEach((f) => {
      if (f.imported_at) dates.push(new Date(f.imported_at));
    });
    if (!dates.length) return null;
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    return format(max, 'yyyy.MM.dd');
  }, [calibrations, breathingFiles]);

  const hasBreathingData = breathingFiles.length > 0;
  const canOpenVr = hasBreathingData && !!patient?.training_type;
  const lastSession = trainingSessions.length
    ? [...trainingSessions].sort(
        (a, b) => new Date(b.session_date || b.created_at) - new Date(a.session_date || a.created_at)
      )[0]
    : null;

  const historyRows = useMemo(() => {
    const rows = [];
    breathingFiles.forEach((f) => {
      rows.push({
        id: `bf-${f.id}`,
        date: f.imported_at,
        category: f.category === 'general' ? '일반호흡' : 'DIBH',
        categoryBadge: '호흡 데이터',
        detail: f.original_name,
        result: '—',
        reportHref: null,
      });
    });
    calibrations.forEach((c) => {
      const t = c.training_type;
      const tl = typeLabels[t] || { label: `Type ${t || '—'}` };
      rows.push({
        id: `cal-${c.id}`,
        date: c.calibration_date,
        category: '캘리브레이션',
        categoryBadge: '캘리브레이션',
        detail: `Type ${t || '—'}`,
        result: tl.label,
        resultClass: tl.className,
        reportHref: null,
      });
    });
    return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [breathingFiles, calibrations]);

  const handleLogout = () => {
    navigate(createPageUrl('Login'));
  };

  const handleUploadBreathing = () => {
    navigate(createPageUrl('BreathingDataUpload') + `?patientId=${encodeURIComponent(patientId)}`);
  };

  const handleViewReport = () => {
    if (lastSession?.id) {
      navigate(
        createPageUrl('TrainingReport') +
          `?patientId=${encodeURIComponent(patientId)}&sessionId=${encodeURIComponent(lastSession.id)}`
      );
    }
  };

  const handleVrSim = () => {
    if (canOpenVr) navigate(createPageUrl('EquipmentCheck') + `?patientId=${encodeURIComponent(patientId)}`);
  };

  const handleStartTraining = () => {
    navigate(createPageUrl('InitialDiagnosis') + `?patientId=${encodeURIComponent(patientId)}`);
  };

  const handleRecalibrate = () => {
    navigate(createPageUrl('InitialDiagnosis') + `?patientId=${encodeURIComponent(patientId)}&recalibrate=true`);
  };

  const handleViewTrainingHistory = () => {
    navigate(createPageUrl('TrainingHistory') + `?patientId=${encodeURIComponent(patientId)}`);
  };

  const handleEdit = () => setShowEditModal(true);
  const handleDelete = () => setShowDeleteModal(true);

  const handleConfirmDelete = () => {
    if (patientId) {
      Patient.delete(patientId);
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      navigate(createPageUrl('Home'));
    }
    setShowDeleteModal(false);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (patientId) {
      setIsSaving(true);
      await Patient.update(patientId, editFormData);
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setIsSaving(false);
      setShowEditModal(false);
    }
  };

  useEffect(() => {
    if (showEditModal && patient) {
      setEditFormData({
        name: patient.name || '',
        birth_date: patient.birth_date || '',
        expected_treatment_date: patient.expected_treatment_date || '',
        treatment_method: patient.treatment_method || '',
        breathing_method: patient.breathing_method || '',
      });
    }
  }, [showEditModal, patient]);

  const treatmentMethods = [
    { value: 'intensity_modulated', label: '세기조절방사선치료' },
    { value: 'proton', label: '양성자치료' },
    { value: 'other', label: '기타' },
  ];

  const breathingMethods = [
    { value: 'normal', label: 'Normal' },
    { value: 'shallow', label: 'Shallow' },
    { value: 'dibh', label: 'DIBH' },
  ];

  const analysisBadge = (() => {
    if (!hasBreathingData && !patient?.training_type) {
      return { text: '데이터 없음', className: 'bg-[#30363D] text-[#8B949E] border-[#30363D]' };
    }
    if (patient?.training_type && typeLabels[patient.training_type]) {
      const t = typeLabels[patient.training_type];
      return { text: t.label, className: t.className };
    }
    return { text: '분석 대기', className: 'bg-[#3B82F6]/15 text-[#79B8FF] border-[#3B82F6]/40' };
  })();

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-28">
      <div className="mx-auto max-w-3xl">
        {/* Top bar */}
        <div className="mb-6 flex items-center gap-3">
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
            <div className="relative overflow-hidden rounded-2xl border border-[#30363D] bg-[#1C2128] pl-1">
              <div className="absolute bottom-0 left-0 top-0 w-1 rounded-l-2xl bg-[#3B82F6]" />
              <div className="p-5 pl-6 sm:p-6">
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
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

            {/* 호흡 분석 결과 */}
            <div className="rounded-2xl border border-[#3B82F6]/50 bg-[#1C2128] p-5 sm:p-6">
              <h3 className="mb-3 text-lg font-bold text-white">호흡 분석 결과</h3>
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span className="text-sm text-[#8B949E]">
                  최근 분석 상태
                  {lastAnalysisLabel ? ` (${lastAnalysisLabel})` : ''}
                </span>
                <span
                  className={cn(
                    'rounded-full border px-3 py-0.5 text-xs font-medium',
                    analysisBadge.className
                  )}
                >
                  {analysisBadge.text}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  onClick={handleUploadBreathing}
                  className="h-12 gap-2 bg-[#3B82F6] text-base font-semibold text-white hover:bg-[#2563EB] sm:h-14"
                >
                  <Plus className="h-5 w-5" />
                  데이터 추가
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!lastSession}
                  onClick={handleViewReport}
                  className="h-12 border-[#30363D] bg-[#252A32] text-white hover:bg-[#30363D] disabled:opacity-40 sm:h-14"
                >
                  분석 결과지 보기
                </Button>
              </div>
              {recalibrationReason && calibrationStatus && (
                <p
                  className={cn(
                    'mt-4 text-xs',
                    calibrationStatus === 'expired' ? 'text-[#EF4444]' : 'text-[#EAB308]'
                  )}
                >
                  {recalibrationReason}
                </p>
              )}
            </div>

            {/* VR 시뮬레이션 */}
            <div className="rounded-2xl border border-[#30363D] bg-[#1C2128] p-1">
              <button
                type="button"
                disabled={!canOpenVr}
                onClick={handleVrSim}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-4 py-4 text-left transition-colors sm:py-5',
                  canOpenVr
                    ? 'hover:bg-[#252A32]'
                    : 'cursor-not-allowed opacity-60'
                )}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0D1117]">
                  {canOpenVr ? (
                    <Headphones className="h-6 w-6 text-[#8B5CF6]" />
                  ) : (
                    <Lock className="h-6 w-6 text-[#8B949E]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white sm:text-base">
                    {canOpenVr
                      ? '환자 호흡 정보 기반 VR 치료 예측 시뮬레이션 바로가기'
                      : '시뮬레이션 불가 (호흡 데이터를 먼저 추가해주세요)'}
                  </p>
                </div>
                {canOpenVr && <ChevronRight className="h-5 w-5 shrink-0 text-[#8B949E]" />}
              </button>
            </div>

            {/* Training shortcuts */}
            <div className="flex flex-col gap-2 sm:flex-row">
              {patient?.training_type && !needsRecal && (
                <Button
                  type="button"
                  onClick={handleStartTraining}
                  className="h-12 flex-1 bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] font-semibold text-white"
                >
                  <Play className="mr-2 h-4 w-4" />
                  훈련 시작
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleRecalibrate}
                className="h-12 flex-1 border-[#30363D] bg-[#1C2128] text-white hover:bg-[#30363D]"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {patient?.training_type ? '재캘리브레이션' : '캘리브레이션'}
              </Button>
              {trainingSessions.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleViewTrainingHistory}
                  className="h-12 flex-1 border-[#30363D] bg-[#1C2128] text-white hover:bg-[#30363D]"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  훈련 이력
                </Button>
              )}
            </div>

            {/* History table */}
            <div className="overflow-hidden rounded-2xl border border-[#30363D] bg-[#1C2128]">
              <div className="border-b border-[#30363D] px-4 py-3 sm:px-5">
                <h3 className="text-base font-bold text-white">검사 및 시뮬레이션 히스토리</h3>
              </div>
              {historyRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <Folder className="mb-4 h-14 w-14 text-[#30363D]" />
                  <p className="mb-2 text-sm text-[#8B949E]">등록된 검사 및 시뮬레이션 내역이 없습니다.</p>
                  <p className="max-w-sm text-xs text-[#6E7681]">
                    상단의 [데이터 추가] 버튼을 눌러 첫 분석을 시작해 주세요.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#30363D] bg-[#0D1117]/80 text-[#8B949E]">
                        <th className="px-4 py-3 font-medium">일자</th>
                        <th className="px-4 py-3 font-medium">구분</th>
                        <th className="px-4 py-3 font-medium">상세 내용</th>
                        <th className="px-4 py-3 font-medium">결과</th>
                        <th className="px-4 py-3 font-medium">리포트</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((row) => (
                        <tr key={row.id} className="border-b border-[#30363D]/80 last:border-0">
                          <td className="whitespace-nowrap px-4 py-3 text-white">
                            {row.date ? format(parseISO(String(row.date)), 'MM.dd') : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-block rounded-full border border-[#30363D] bg-[#0D1117] px-2 py-0.5 text-xs text-[#C9D1D9]">
                              {row.categoryBadge}
                            </span>
                          </td>
                          <td className="max-w-[180px] truncate px-4 py-3 text-[#C9D1D9]" title={row.detail}>
                            {row.detail}
                          </td>
                          <td className="px-4 py-3">
                            {row.resultClass ? (
                              <span
                                className={cn(
                                  'text-xs font-medium',
                                  row.resultClass.includes('22C55E') && 'text-[#22C55E]',
                                  row.resultClass.includes('EAB308') && 'text-[#EAB308]',
                                  row.resultClass.includes('EF4444') && 'text-[#EF4444]'
                                )}
                              >
                                {row.result}
                              </span>
                            ) : (
                              <span className="text-[#8B949E]">{row.result}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {row.reportHref ? (
                              <button type="button" className="text-[#3B82F6] hover:underline">
                                결과지
                              </button>
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

      {/* Edit modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border border-[#30363D] bg-[#1C2128] p-0 text-white sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-[#30363D] px-6 py-4">
            <h2 className="text-lg font-bold">환자 정보 수정</h2>
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="text-[#8B949E] hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleSaveEdit} className="space-y-4 px-6 py-5">
            <div>
              <Label htmlFor="edit-name" className="text-[#8B949E]">
                환자명
              </Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                className="mt-1.5 h-12 rounded-xl border-[#30363D] bg-[#0D1117] text-white"
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-birth-date" className="text-[#8B949E]">
                생년월일
              </Label>
              <Input
                id="edit-birth-date"
                type="date"
                value={editFormData.birth_date}
                onChange={(e) => setEditFormData({ ...editFormData, birth_date: e.target.value })}
                className="mt-1.5 h-12 rounded-xl border-[#30363D] bg-[#0D1117] text-white"
              />
            </div>
            <div>
              <Label htmlFor="edit-treatment-date" className="text-[#8B949E]">
                예상 치료일
              </Label>
              <Input
                id="edit-treatment-date"
                type="date"
                value={editFormData.expected_treatment_date}
                onChange={(e) => setEditFormData({ ...editFormData, expected_treatment_date: e.target.value })}
                className="mt-1.5 h-12 rounded-xl border-[#30363D] bg-[#0D1117] text-white"
              />
            </div>
            <div>
              <Label className="text-[#8B949E]">치료 기법</Label>
              <Select
                value={editFormData.treatment_method}
                onValueChange={(value) => setEditFormData({ ...editFormData, treatment_method: value })}
              >
                <SelectTrigger className="mt-1.5 h-12 border-[#30363D] bg-[#0D1117] text-white">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent className="border-[#30363D] bg-[#1C2128]">
                  {treatmentMethods.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-white focus:bg-[#30363D]">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[#8B949E]">호흡 방식</Label>
              <Select
                value={editFormData.breathing_method}
                onValueChange={(value) => setEditFormData({ ...editFormData, breathing_method: value })}
              >
                <SelectTrigger className="mt-1.5 h-12 border-[#30363D] bg-[#0D1117] text-white">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent className="border-[#30363D] bg-[#1C2128]">
                  {breathingMethods.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-white focus:bg-[#30363D]">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditModal(false)}
                className="h-12 flex-1 border-[#30363D] bg-[#0D1117] text-white"
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !editFormData.name}
                className="h-12 flex-1 bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] font-semibold text-white disabled:opacity-50"
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
