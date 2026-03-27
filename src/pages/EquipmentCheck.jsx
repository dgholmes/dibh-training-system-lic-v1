import React, { useState } from 'react';
import { Bluetooth, Wifi, Check, Glasses, Activity, Loader2, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { PatientFlowPageHeader } from '@/components/common/PatientFlowPageHeader';
import { Patient } from '@/api/entities';
import { useQuery } from '@tanstack/react-query';
import StepIndicator from '@/components/common/StepIndicator';
import { cn } from '@/lib/utils';
import { needsRecalibration, getCalibrationStatus } from '@/utils/recalibration';
import { useGoDirect } from '@/context/GoDirectContext';

export default function EquipmentCheck() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const patientId = urlParams.get('patientId');

  // GoDirect Bluetooth connection
  const { 
    connected, 
    connecting, 
    latest, 
    error, 
    connect, 
    disconnect,
    clearError 
  } = useGoDirect();

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => {
      const results = Patient.filter({ id: patientId });
      return results[0] || null;
    },
    enabled: !!patientId,
  });

  const [vrChecked, setVrChecked] = useState(false);
  const [beltChecked, setBeltChecked] = useState(false);

  // Belt is checked when connected AND user confirms physical check
  const allChecked = vrChecked && beltChecked && connected;
  
  // Check if patient has valid calibration and can skip to training
  const canSkipCalibration = patient && 
    patient.training_type && 
    !needsRecalibration(patient) &&
    getCalibrationStatus(patient) === 'valid';

  const handleNext = () => {
    if (canSkipCalibration) {
      // Skip calibration and go directly to training
      navigate(createPageUrl('TrainingMonitor') + `?patientId=${patientId}&type=${patient.training_type}`);
    } else {
      // Proceed to calibration
      navigate(createPageUrl('Calibration') + `?patientId=${patientId}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-24">
      <PatientFlowPageHeader
        backHref={createPageUrl('InitialDiagnosis') + `?patientId=${patientId}`}
        title="장비 착용 체크리스트"
        patient={patient}
      />

      {/* Step Indicator */}
      <StepIndicator currentStep={2} />

      {/* Equipment Cards - Side by Side */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        {/* VR Headset Card */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setVrChecked(!vrChecked)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setVrChecked(!vrChecked);
            }
          }}
          className={cn(
            "bg-[#1C2128] rounded-xl p-4 border-2 transition-all w-full text-left cursor-pointer hover:border-[#3B82F6]/50 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:ring-offset-2 focus:ring-offset-[#0D1117]",
            vrChecked ? "border-[#22C55E]" : "border-[#30363D]"
          )}
        >
          <div className="flex items-center gap-2 mb-3">
            <Glasses className="w-5 h-5 text-[#3B82F6]" />
            <h3 className="text-white font-semibold text-sm">VR 헤드셋 착용</h3>
          </div>

          {/* VR Image */}
          <div className="w-full rounded-xl mb-3 overflow-hidden">
            <img 
              src="/vr_check.png" 
              alt="VR 헤드셋 착용 예시" 
              className="w-full h-auto object-cover"
            />
          </div>
          <p className="text-white text-xs mb-2">VR 헤드셋 착용 예시</p>

          <p className="text-[#8B949E] text-xs mb-3">
            헤드셋이 흔들리지 않게 고정되었나요?
          </p>

          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={vrChecked}
              onCheckedChange={setVrChecked}
              className="w-5 h-5 border-[#30363D] data-[state=checked]:bg-[#22C55E] data-[state=checked]:border-[#22C55E]"
            />
            <span className={cn(
              "text-xs font-medium transition-colors",
              vrChecked ? "text-[#22C55E]" : "text-[#8B949E]"
            )}>
              VR 헤드셋 착용 완료
            </span>
          </div>
        </div>

        {/* Breathing Belt Card */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setBeltChecked(!beltChecked)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setBeltChecked(!beltChecked);
            }
          }}
          className={cn(
            "bg-[#1C2128] rounded-xl p-4 border-2 transition-all w-full text-left cursor-pointer hover:border-[#06B6D4]/50 focus:outline-none focus:ring-2 focus:ring-[#06B6D4] focus:ring-offset-2 focus:ring-offset-[#0D1117]",
            beltChecked ? "border-[#22C55E]" : "border-[#30363D]"
          )}
        >
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5 text-[#06B6D4]" />
            <h3 className="text-white font-semibold text-sm">호흡 벨트 착용</h3>
          </div>

          {/* Belt Image */}
          <div className="w-full rounded-xl mb-3 overflow-hidden">
            <img 
              src="/belt_check.png" 
              alt="호흡 벨트 착용 예시" 
              className="w-full h-auto object-cover"
            />
          </div>
          <p className="text-white text-xs mb-2">명치 - 배꼽 사이</p>

          <p className="text-[#8B949E] text-xs mb-3">
            벨트가 복부 중앙에 위치해 있나요?
          </p>

          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={beltChecked}
              onCheckedChange={setBeltChecked}
              className="w-5 h-5 border-[#30363D] data-[state=checked]:bg-[#22C55E] data-[state=checked]:border-[#22C55E]"
            />
            <span className={cn(
              "text-xs font-medium transition-colors",
              beltChecked ? "text-[#22C55E]" : "text-[#8B949E]"
            )}>
              호흡 벨트 착용 완료
            </span>
          </div>
        </div>
      </div>

      {/* Bluetooth Connection Status */}
      <div className="bg-[#1C2128] rounded-xl p-4 border border-[#30363D] mt-4">
        {/* Error Alert */}
        {error && (
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-[#EF4444] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[#EF4444] text-sm whitespace-pre-line">{error}</p>
            </div>
            <button onClick={clearError} className="text-[#EF4444] hover:text-[#EF4444]/80">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Connection Status Display */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              connected ? "bg-[#22C55E]/20" : connecting ? "bg-[#3B82F6]/20" : "bg-[#30363D]"
            )}>
              {connecting ? (
                <Loader2 className="w-5 h-5 text-[#3B82F6] animate-spin" />
              ) : (
                <Bluetooth className={cn(
                  "w-5 h-5",
                  connected ? "text-[#22C55E]" : "text-[#8B949E]"
                )} />
              )}
            </div>
            <div>
              <p className="text-white font-medium text-sm">호흡 벨트 (Bluetooth)</p>
              <p className={cn(
                "text-xs",
                connected ? "text-[#22C55E]" : connecting ? "text-[#3B82F6]" : "text-[#8B949E]"
              )}>
                {connected ? '연결됨' : connecting ? '연결 중...' : '연결 안됨'}
              </p>
            </div>
          </div>
          
          {connected ? (
            <Button
              onClick={disconnect}
              variant="outline"
              size="sm"
              className="border-[#EF4444]/50 text-[#EF4444] hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
            >
              연결 해제
            </Button>
          ) : (
            <Button
              onClick={connect}
              disabled={connecting}
              size="sm"
              className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  연결 중
                </>
              ) : (
                '연결하기'
              )}
            </Button>
          )}
        </div>

        {/* Live Sensor Value Display (when connected) */}
        {connected && (
          <div className="bg-[#0D1117] rounded-lg p-3 border border-[#30363D]">
            <div className="flex items-center justify-between">
              <span className="text-[#8B949E] text-sm">실시간 센서 값</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
                <span className="text-white font-mono text-lg">
                  {typeof latest === 'number' ? latest.toFixed(3) : '---'} N
                </span>
              </div>
            </div>
          </div>
        )}

        {/* WiFi Status (always shown) */}
        <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-[#30363D]">
          <Wifi className="w-4 h-4 text-[#22C55E]" />
          <span className="text-[#8B949E] text-xs">WiFi</span>
          <span className="text-[#22C55E] text-xs">연결됨</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 mt-6">
        {canSkipCalibration && (
          <div className="bg-[#1C2128] rounded-xl p-4 border border-[#22C55E]/30 mb-2">
            <p className="text-[#22C55E] text-sm font-medium text-center">
              유효한 캘리브레이션이 있습니다. 캘리브레이션을 건너뛰고 훈련을 시작할 수 있습니다.
            </p>
          </div>
        )}
        <div className="flex gap-3">
          {canSkipCalibration && (
            <Button
              onClick={() => navigate(createPageUrl('Calibration') + `?patientId=${patientId}`)}
              variant="outline"
              disabled={!allChecked}
              className={cn(
                "flex-1 h-12 text-base font-semibold rounded-xl border-[#30363D] bg-[#1C2128] text-white hover:bg-[#30363D]",
                !allChecked && "opacity-50 cursor-not-allowed"
              )}
            >
              캘리브레이션 실행
            </Button>
          )}
          <Button
            onClick={handleNext}
            disabled={!allChecked}
            className={cn(
              "flex-1 h-12 text-base font-semibold rounded-xl shadow-lg transition-all",
              allChecked
                ? "bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] hover:from-[#2563EB] hover:to-[#7C3AED] text-white shadow-[#3B82F6]/25"
                : "bg-[#30363D] text-[#8B949E] cursor-not-allowed"
            )}
          >
            {canSkipCalibration ? '훈련 시작' : '다음 단계'}
          </Button>
        </div>
      </div>
    </div>
  );
}