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
import AnalysisResultCard from '@/components/breathing/AnalysisResultCard';
import { getLatestCalibration } from '@/lib/calibration/sortCalibrations';

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
    queryFn: async () => {
      const results = await Patient.filter({ id: patientId });
      return results[0] || null;
    },
    enabled: !!patientId,
  });

  const { data: calibration } = useQuery({
    queryKey: ['calibrationForReport', patientId, calibrationId],
    queryFn: async () => {
      if (!patientId) return null;
      if (calibrationId) {
        const c = await Calibration.get(calibrationId);
        if (c && c.patient_id === patientId) return c;
        return null;
      }
      const list = await Calibration.filter({ patient_id: patientId });
      return getLatestCalibration(list);
    },
    enabled: !!patientId,
  });

  // Only a real calibration supplies a type; with none, nothing is classified
  // (the report card shows "no result" rather than a default type).
  const trainingType = calibration?.training_type ?? null;

  const dibhDuration =
    calibration?.dibh_duration != null ? Math.round(Number(calibration.dibh_duration)) : null;
  const cv = calibration?.cv != null ? Number(calibration.cv) : null;

  const playback = calibration?.playback ?? null;

  const handleDashboard = () => {
    if (patientId) {
      navigate(
        `${createPageUrl('PatientDashboard')}?patientId=${encodeURIComponent(patientId)}`
      );
    } else {
      navigate(createPageUrl('Home'));
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-20">
      <PatientFlowPageHeader
        backHref={
          patientId
            ? `${createPageUrl('PatientDashboard')}?patientId=${encodeURIComponent(patientId)}`
            : createPageUrl('Home')
        }
        title="호흡 분석 결과"
        patient={patient}
      />

      <div className="mx-auto mt-2 max-w-2xl space-y-4">
        <ComprehensiveBreathingReportCard
          trainingType={trainingType}
          onOpenInfo={() => setComparisonOpen(true)}
        />

        {/*
          trainingType is null without a real calibration, so no advice is shown
          for a patient who has not been analysed (RM-DBF-014).
        */}
        <AnalysisResultCard dibhDuration={dibhDuration} cv={cv} type={trainingType} />

        <AnalysisPlaybackPanel playback={playback} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0D1117]/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Button
            type="button"
            onClick={handleDashboard}
            className="h-11 w-full bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-base font-semibold text-white hover:from-[#2563EB] hover:to-[#7C3AED]"
          >
            환자 대시보드로 이동
          </Button>
        </div>
      </div>

      <BreathingTypeComparisonModal open={comparisonOpen} onOpenChange={setComparisonOpen} />
    </div>
  );
}
