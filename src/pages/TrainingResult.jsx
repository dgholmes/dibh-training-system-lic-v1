import React, { useEffect } from 'react';
import { CheckCircle, Clock, Target, Timer, TrendingUp, FileText, LogOut, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Patient, TrainingSession } from '@/api/entities';
import { useQuery } from '@tanstack/react-query';
import StatsCard from '@/components/common/StatsCard';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import { cn } from '@/lib/utils';
import { getCalibrationStatus } from '@/utils/recalibration';

export default function TrainingResult() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const patientId = urlParams.get('patientId');
  const trainingType = urlParams.get('type') || 'A';
  const duration = parseInt(urlParams.get('duration')) || 765;
  const accuracy = parseInt(urlParams.get('accuracy')) || 87;

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => {
      const results = Patient.filter({ id: patientId });
      return results[0] || null;
    },
    enabled: !!patientId,
  });

  // Get the most recent completed session for this patient
  const { data: currentSession } = useQuery({
    queryKey: ['currentTrainingSession', patientId],
    queryFn: () => {
      if (!patientId) return null;
      const sessions = TrainingSession.filter({ patient_id: patientId });
      // Get the most recent completed session
      const completedSessions = sessions
        .filter(s => s.status === 'completed')
        .sort((a, b) => {
          const dateA = new Date(a.completed_at || a.created_at || 0);
          const dateB = new Date(b.completed_at || b.created_at || 0);
          return dateB - dateA;
        });
      return completedSessions[0] || null;
    },
    enabled: !!patientId,
  });

  const typeColors = {
    A: 'bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/30',
    B: 'bg-[#EAB308]/20 text-[#EAB308] border-[#EAB308]/30',
    C: 'bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/30',
  };

  const dibhDuration = Math.floor(Math.random() * 5) + 16;
  const improvement = Math.floor(Math.random() * 15) + 5;

  // Sample data for the chart
  const chartData = [
    { session: '1회차', value: 70 },
    { session: '2회차', value: 75 },
    { session: '3회차', value: 78 },
    { session: '4회차', value: 82 },
    { session: '5회차', value: accuracy },
  ];

  // Update patient training data and complete training session when component mounts
  useEffect(() => {
    if (patientId && patient) {
      const currentDate = new Date().toISOString().split('T')[0];
      const currentSessions = patient.sessions_since_calibration || 0;
      const calibrationStatus = getCalibrationStatus(patient);
      
      // Find and update the in-progress training session
      const inProgressSessions = TrainingSession.filter({ 
        patient_id: patientId, 
        status: 'in_progress' 
      });
      
      if (inProgressSessions.length > 0) {
        const session = inProgressSessions[0];
        TrainingSession.update(session.id, {
          status: 'completed',
          duration: duration,
          accuracy: accuracy,
          average_accuracy: accuracy,
          dibh_duration: dibhDuration,
          cv: improvement,
          completed_at: new Date().toISOString(),
        });
      }
      
      Patient.update(patientId, {
        last_training_date: currentDate,
        sessions_since_calibration: currentSessions + 1,
        calibration_status: calibrationStatus
      });
    }
  }, [patientId, patient, duration, accuracy, dibhDuration]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEndTraining = () => {
    navigate(createPageUrl('EndSession') + `?patientId=${patientId}`);
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-[#22C55E]/20 flex items-center justify-center">
          <CheckCircle className="w-5 h-5 text-[#22C55E]" />
        </div>
        <h1 className="text-xl font-bold text-white">훈련 결과</h1>
      </div>

      {/* Result Card */}
      <div className="bg-gradient-to-br from-[#1C2128] to-[#0D1117] rounded-xl p-6 border border-[#30363D] mb-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[#22C55E]/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-[#22C55E]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">훈련이 완료되었습니다!</h2>
        <span className={cn(
          "inline-flex px-4 py-2 rounded-full text-sm font-medium border",
          typeColors[trainingType]
        )}>
          Type {trainingType}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatsCard
          title="총 훈련 시간"
          value={formatTime(duration)}
          icon={Clock}
          color="cyan"
        />
        <StatsCard
          title="평균 정확도"
          value={`${accuracy}%`}
          subtitle="목표호흡곡선 대비"
          icon={Target}
          color="green"
        />
        <StatsCard
          title="DIBH 유지시간"
          value={`${dibhDuration}초`}
          icon={Timer}
          color="blue"
        />
        <StatsCard
          title="개선도"
          value={`+${improvement}%`}
          icon={TrendingUp}
          color="green"
        />
      </div>

      {/* Stability Chart */}
      <div className="bg-[#1C2128] rounded-xl p-6 border border-[#30363D] mb-6">
        <h3 className="text-white font-semibold mb-4">호흡 안정성 추이</h3>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <XAxis 
                dataKey="session" 
                stroke="#8B949E" 
                tick={{ fill: '#8B949E', fontSize: 10 }}
                axisLine={{ stroke: '#30363D' }}
              />
              <YAxis 
                stroke="#8B949E" 
                tick={{ fill: '#8B949E', fontSize: 10 }}
                axisLine={{ stroke: '#30363D' }}
                domain={[0, 100]}
                width={40}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={index === chartData.length - 1 ? '#3B82F6' : '#8B5CF6'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Analysis */}
      <div className="bg-[#1C2128] rounded-xl p-4 border border-[#30363D] flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#22C55E]/20 flex items-center justify-center">
          <Activity className="w-5 h-5 text-[#22C55E]" />
        </div>
        <p className="text-[#22C55E] text-sm flex-1">
          안정적인 패턴의 호흡을 유지했습니다
        </p>
      </div>

      {/* Fixed Bottom Buttons */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0D1117] via-[#0D1117] to-transparent">
        <div className="flex gap-3">
          <Link 
            to={createPageUrl('TrainingReport') + `?patientId=${patientId}${currentSession ? `&sessionId=${currentSession.id}` : ''}`} 
            className="flex-1"
          >
            <Button className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] hover:from-[#2563EB] hover:to-[#7C3AED] text-white rounded-xl">
              <FileText className="w-5 h-5 mr-2" />
              보고서 조회
            </Button>
          </Link>
          <Button
            onClick={handleEndTraining}
            variant="outline"
            className="flex-1 h-14 text-lg font-semibold border-[#30363D] bg-[#1C2128] text-white hover:bg-[#30363D] hover:text-white rounded-xl"
          >
            <LogOut className="w-5 h-5 mr-2" />
            훈련 종료
          </Button>
        </div>
      </div>
    </div>
  );
}