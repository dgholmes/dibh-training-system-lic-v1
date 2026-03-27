import React, { useState, useEffect, useRef } from 'react';
import { Clock, Target, TrendingUp, RefreshCw, AlertOctagon, Bluetooth } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Patient, TrainingSession } from '@/api/entities';
import { useQuery } from '@tanstack/react-query';
import { PatientFlowPageHeader } from '@/components/common/PatientFlowPageHeader';
import StatsCard from '@/components/common/StatsCard';
import BreathingChart from '@/components/common/BreathingChart';
import EmergencyStopModal from '@/components/common/EmergencyStopModal';
import { cn } from '@/lib/utils';
import { useGoDirect } from '@/context/GoDirectContext';

export default function TrainingMonitor() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const patientId = urlParams.get('patientId');
  const trainingType = urlParams.get('type') || 'A';

  // GoDirect Bluetooth connection for real sensor data
  const { connected, latest, startReading } = useGoDirect();

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => {
      const results = Patient.filter({ id: patientId });
      return results[0] || null;
    },
    enabled: !!patientId,
  });

  const [elapsedTime, setElapsedTime] = useState(0);
  const [accuracy, setAccuracy] = useState(92);
  const [progress, setProgress] = useState(0);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [chartData, setChartData] = useState([]);
  const sessionCreatedRef = useRef(false);
  const startTimeRef = useRef(null);

  const typeColors = {
    A: 'bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/30',
    B: 'bg-[#EAB308]/20 text-[#EAB308] border-[#EAB308]/30',
    C: 'bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/30',
  };

  // Create training session when component mounts (training starts)
  useEffect(() => {
    if (patientId && patient && !sessionCreatedRef.current) {
      const initialDiagnosis = patient.pending_initial_diagnosis || {};
      
      // Create training session
      TrainingSession.create({
        patient_id: patientId,
        patient_name: patient?.name,
        patient_code: patient?.patient_code,
        session_date: new Date().toISOString().split('T')[0],
        ...initialDiagnosis,
        status: 'in_progress',
      });
      
      // Clear pending initial diagnosis from patient record
      if (patient.pending_initial_diagnosis) {
        Patient.update(patientId, {
          pending_initial_diagnosis: null
        });
      }
      
      sessionCreatedRef.current = true;
    }
  }, [patientId, patient]);

  // Ensure sensor is reading when training starts
  useEffect(() => {
    if (connected) {
      startReading();
    }
  }, [connected, startReading]);

  // Capture real sensor data from the belt
  useEffect(() => {
    if (!connected || typeof latest !== 'number') return;

    const now = Date.now();
    if (startTimeRef.current === null) {
      startTimeRef.current = now;
    }

    const timeFromStart = (now - startTimeRef.current) / 1000;
    
    setChartData(prev => {
      const newPoint = { time: timeFromStart, value: latest };
      return [...prev.slice(-59), newPoint];
    });
  }, [latest, connected]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          navigate(createPageUrl('TrainingResult') + `?patientId=${patientId}&type=${trainingType}&duration=${elapsedTime}&accuracy=${Math.round(accuracy)}`);
          return 100;
        }
        return prev + 10;
      });
      setAccuracy(prev => Math.min(100, Math.max(80, prev + (Math.random() - 0.5) * 3)));

      // Only generate simulated data if NOT connected to real belt
      if (!connected) {
        setChartData(prev => {
          const newPoint = {
            time: prev.length,
            value: Math.sin(prev.length * 0.3) * 30 + 50 + Math.random() * 10,
          };
          return [...prev.slice(-60), newPoint];
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [elapsedTime, accuracy, patientId, trainingType, navigate, connected]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEmergencyStop = () => {
    navigate(createPageUrl('Home'));
  };

  const handleRestart = () => {
    setElapsedTime(0);
    setProgress(0);
    setAccuracy(92);
    setChartData([]);
    startTimeRef.current = null;
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-24">
      <PatientFlowPageHeader
        className="mb-6"
        backHref={createPageUrl('PatientDashboard') + `?patientId=${patientId}`}
        title="훈련 모니터링"
        patient={patient}
        trailing={
          <span
            className={cn('rounded-full border px-4 py-2 text-sm font-medium', typeColors[trainingType])}
          >
            Type {trainingType}
          </span>
        }
      />

      {/* Bluetooth Connection Status */}
      {!connected && (
        <div className="bg-[#EAB308]/10 rounded-xl p-3 mb-4 border border-[#EAB308]/30 flex items-center gap-2">
          <Bluetooth className="w-4 h-4 text-[#EAB308]" />
          <span className="text-[#EAB308] text-sm">시뮬레이션 데이터 사용 중</span>
        </div>
      )}

      {connected && (
        <div className="bg-[#22C55E]/10 rounded-xl p-3 mb-4 border border-[#22C55E]/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
            <span className="text-[#22C55E] text-sm font-medium">호흡 벨트 연결됨</span>
          </div>
          <span className="text-white font-mono text-sm">
            {typeof latest === 'number' ? `${latest.toFixed(2)} N` : '---'}
          </span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatsCard
          title="훈련 시간"
          value={formatTime(elapsedTime)}
          icon={Clock}
          color="cyan"
        />
        <StatsCard
          title="호흡 정확도"
          value={`${Math.round(accuracy)}%`}
          subtitle="목표호흡곡선 대비 ±5%"
          icon={Target}
          color={accuracy >= 85 ? 'green' : accuracy >= 70 ? 'yellow' : 'red'}
        />
        <StatsCard
          title="진행률"
          value={`${Math.round(progress)}%`}
          icon={TrendingUp}
          color="purple"
        />
      </div>

      {/* Breathing Chart */}
      <BreathingChart data={chartData} />

      {/* Session Progress */}
      <div className="mt-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-[#8B949E]">세션 진행률</span>
          <span className="text-white">{Math.round(progress)}%</span>
        </div>
        <div className="h-3 bg-[#1C2128] rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Fixed Bottom Buttons */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0D1117] via-[#0D1117] to-transparent">
        <div className="flex gap-3">
          <Button
            onClick={() => setShowEmergencyModal(true)}
            className="flex-1 h-14 text-lg font-semibold bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-xl"
          >
            <AlertOctagon className="w-5 h-5 mr-2" />
            긴급정지
          </Button>
          <Button
            onClick={handleRestart}
            variant="outline"
            className="flex-1 h-14 text-lg font-semibold border-[#30363D] bg-[#1C2128] text-white hover:bg-[#30363D] hover:text-white rounded-xl"
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            재시작
          </Button>
        </div>
      </div>

      {/* Emergency Stop Modal */}
      <EmergencyStopModal
        isOpen={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        onConfirm={handleEmergencyStop}
      />
    </div>
  );
}