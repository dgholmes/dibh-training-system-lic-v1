import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { PatientFlowPageHeader } from '@/components/common/PatientFlowPageHeader';
import { createPageUrl, getPatientIdFromSearchParams } from '@/utils';
import { Patient, Calibration } from '@/api/entities';
import { useQuery } from '@tanstack/react-query';
import ComprehensiveBreathingReportCard from '@/components/breathing/ComprehensiveBreathingReportCard';
import BreathingTypeComparisonModal from '@/components/breathing/BreathingTypeComparisonModal';
import AnalysisPlaybackPanel from '@/components/breathing/AnalysisPlaybackPanel';

export default function TypeDecision() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const patientId = getPatientIdFromSearchParams(urlParams);

  const [comparisonOpen, setComparisonOpen] = useState(false);

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => {
      const results = Patient.filter({ id: patientId });
      return results[0] || null;
    },
    enabled: !!patientId,
  });

  const { data: latestCalibration, isFetched } = useQuery({
    queryKey: ['latestCalibration', patientId],
    queryFn: () => {
      const calibrations = Calibration.filter({ patient_id: patientId });
      if (calibrations.length === 0) return null;
      return calibrations.sort(
        (a, b) => new Date(b.calibration_date) - new Date(a.calibration_date)
      )[0];
    },
    enabled: !!patientId,
  });

  if (!patientId) {
    return <Navigate to={createPageUrl('Home')} replace />;
  }

  if (!isFetched) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D1117] p-6">
        <p className="text-sm text-[#8B949E]">불러오는 중…</p>
      </div>
    );
  }

  const hasReport = latestCalibration != null;
  const trainingType = latestCalibration?.training_type ?? patient?.training_type ?? null;

  const dibhDuration =
    latestCalibration?.dibh_duration != null && Number.isFinite(Number(latestCalibration.dibh_duration))
      ? Math.round(Number(latestCalibration.dibh_duration))
      : null;
  const cv =
    latestCalibration?.cv != null && Number.isFinite(Number(latestCalibration.cv))
      ? Math.round(Number(latestCalibration.cv))
      : null;

  const playback = latestCalibration?.playback ?? null;

  const handleHome = () => {
    navigate(createPageUrl('Home'));
  };

  const handleSaveAndExit = () => {
    navigate(createPageUrl('PatientDashboard') + `?patientId=${patientId}`);
  };

  const analysisSelectHref =
    createPageUrl('AnalysisFileSelect') + `?patientId=${encodeURIComponent(patientId)}`;

  if (!hasReport) {
    return (
      <div className="min-h-screen bg-[#0D1117] p-6 pb-28">
        <PatientFlowPageHeader
          backHref={createPageUrl('PatientDashboard') + `?patientId=${patientId}`}
          title="호흡 분석 결과"
          patient={patient}
        />
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-[#30363D] bg-[#1C2128] p-6 text-center">
          <p className="mb-2 text-base font-semibold text-white">저장된 분석 결과가 없습니다</p>
          <p className="mb-6 text-sm text-[#8B949E]">
            호흡 데이터를 업로드한 뒤 파일을 선택하여 분석을 실행해 주세요.
          </p>
          <Button
            asChild
            className="w-full bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] font-semibold text-white hover:from-[#2563EB] hover:to-[#7C3AED]"
          >
            <Link to={analysisSelectHref}>호흡 분석 하기</Link>
          </Button>
        </div>
      </div>
    );
  }

  const displayType = trainingType ?? 'B';

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-28">
      <PatientFlowPageHeader
        backHref={createPageUrl('PatientDashboard') + `?patientId=${patientId}`}
        title="호흡 분석 결과"
        patient={patient}
      />

      <div className="mx-auto mt-2 max-w-2xl space-y-5">
        <ComprehensiveBreathingReportCard
          trainingType={displayType}
          onOpenInfo={() => setComparisonOpen(true)}
        />

        <div className="rounded-2xl border border-[#30363D] bg-[#1C2128] px-5 py-6 sm:px-6">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="mb-1 text-sm text-[#8B949E]">DIBH 유지 시간</p>
              <p className="text-2xl font-bold text-white">
                {dibhDuration != null ? `${dibhDuration}초` : '—'}
              </p>
            </div>
            <div>
              <p className="mb-1 text-sm text-[#8B949E]">호흡 안정성 (CV)</p>
              <p className="text-2xl font-bold text-white">{cv != null ? `${cv}%` : '—'}</p>
            </div>
          </div>
        </div>

        <AnalysisPlaybackPanel playback={playback} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#30363D] bg-[#0D1117]/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleHome}
            className="h-12 flex-1 border-[#30363D] bg-[#1C2128] text-base font-semibold text-white hover:bg-[#30363D]"
          >
            처음으로
          </Button>
          <Button
            type="button"
            onClick={handleSaveAndExit}
            className="h-12 flex-[1.15] bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-base font-semibold text-white hover:from-[#2563EB] hover:to-[#7C3AED]"
          >
            저장 및 종료
          </Button>
        </div>
      </div>

      <BreathingTypeComparisonModal open={comparisonOpen} onOpenChange={setComparisonOpen} />
    </div>
  );
}
