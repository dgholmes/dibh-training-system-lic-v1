import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { PatientFlowPageHeader } from '@/components/common/PatientFlowPageHeader';
import { createPageUrl, getPatientIdFromSearchParams } from '@/utils';
import { Patient, Calibration } from '@/api/entities';
import { useQuery } from '@tanstack/react-query';
import ComprehensiveBreathingReportCard from '@/components/breathing/ComprehensiveBreathingReportCard';
import BreathingTypeComparisonModal from '@/components/breathing/BreathingTypeComparisonModal';
import AnalysisPlaybackPanel from '@/components/breathing/AnalysisPlaybackPanel';

/**
 * Calibration report (route: /CalibrationReport) — same UI as TypeDecision,
 * with data bound to `calibrationId` when present, else latest calibration for the patient.
 */
export default function TrainingReport() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const patientId = getPatientIdFromSearchParams(urlParams);
  const calibrationId = urlParams.get('calibrationId');

  const [comparisonOpen, setComparisonOpen] = useState(false);

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => {
      const results = Patient.filter({ id: patientId });
      return results[0] || null;
    },
    enabled: !!patientId,
  });

  const { data: calibration } = useQuery({
    queryKey: ['calibrationForReport', patientId, calibrationId],
    queryFn: () => {
      if (!patientId) return null;
      if (calibrationId) {
        const c = Calibration.get(calibrationId);
        if (c && c.patient_id === patientId) return c;
        return null;
      }
      const list = Calibration.filter({ patient_id: patientId });
      if (!list.length) return null;
      return [...list].sort(
        (a, b) =>
          new Date(b.calibration_date || b.created_at || 0) -
          new Date(a.calibration_date || a.created_at || 0)
      )[0];
    },
    enabled: !!patientId,
  });

  const trainingType = calibration?.training_type || patient?.training_type || 'A';

  const dibhDuration =
    calibration?.dibh_duration != null ? Math.round(Number(calibration.dibh_duration)) : 0;
  const cv = calibration?.cv != null ? Math.round(Number(calibration.cv)) : 0;

  const playback = calibration?.playback ?? null;

  const handleHome = () => {
    navigate(createPageUrl('Home'));
  };

  const handleSaveAndExit = () => {
    if (patientId) {
      navigate(
        `${createPageUrl('PatientDashboard')}?patientId=${encodeURIComponent(patientId)}`
      );
    } else {
      navigate(createPageUrl('Home'));
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-28">
      <PatientFlowPageHeader
        backHref={
          patientId
            ? `${createPageUrl('PatientDashboard')}?patientId=${encodeURIComponent(patientId)}`
            : createPageUrl('Home')
        }
        title="호흡 분석 결과"
        patient={patient}
      />

      <div className="mx-auto mt-2 max-w-2xl space-y-5">
        <ComprehensiveBreathingReportCard
          trainingType={trainingType}
          onOpenInfo={() => setComparisonOpen(true)}
        />

        <div className="rounded-2xl border border-[#30363D] bg-[#1C2128] px-5 py-6 sm:px-6">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="mb-1 text-sm text-[#8B949E]">DIBH 유지 시간</p>
              <p className="text-2xl font-bold text-white">{Number(dibhDuration)}초</p>
            </div>
            <div>
              <p className="mb-1 text-sm text-[#8B949E]">호흡 안정성 (CV)</p>
              <p className="text-2xl font-bold text-white">{Number(cv)}%</p>
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
