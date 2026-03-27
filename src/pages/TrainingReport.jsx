import React from 'react';
import { X, Printer, Building2, Calendar, User, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Patient, TrainingSession } from '@/api/entities';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LineChart, Line } from 'recharts';

export default function TrainingReport() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const patientId = urlParams.get('patientId');
  const sessionId = urlParams.get('sessionId');

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => {
      const results = Patient.filter({ id: patientId });
      return results[0] || null;
    },
    enabled: !!patientId,
  });

  const { data: session } = useQuery({
    queryKey: ['trainingSession', sessionId],
    queryFn: () => {
      if (!sessionId) return null;
      return TrainingSession.get(sessionId);
    },
    enabled: !!sessionId,
  });

  const treatmentMethods = {
    intensity_modulated: '세기조절방사선치료',
    proton: '양성자치료',
    other: '기타',
  };

  const breathingMethods = {
    normal: 'Normal',
    shallow: 'Shallow',
    dibh: 'DIBH',
  };

  // Sample data
  const chartData = [
    { session: '1회차', value: 70 },
    { session: '2회차', value: 75 },
    { session: '3회차', value: 78 },
    { session: '4회차', value: 82 },
    { session: '5회차', value: 87 },
  ];

  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    // If coming from TrainingHistory, go back there. Otherwise go to TrainingResult
    if (sessionId) {
      navigate(createPageUrl('TrainingHistory') + `?patientId=${patientId}`);
    } else {
      navigate(createPageUrl('TrainingResult') + `?patientId=${patientId}`);
    }
  };

  // Use session data if available, otherwise use patient data
  const reportData = session || patient;
  const reportDate = session?.session_date || session?.created_at || new Date();

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button
          onClick={handleClose}
          variant="ghost"
          size="icon"
          className="text-[#8B949E] hover:text-white hover:bg-[#1C2128]"
        >
          <X className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold text-white">훈련 보고서</h1>
        <Button
          onClick={handlePrint}
          variant="ghost"
          className="text-[#3B82F6] hover:text-[#3B82F6] hover:bg-[#3B82F6]/10"
        >
          <Printer className="w-4 h-4 mr-2" />
          인쇄하기
        </Button>
      </div>

      {/* Report Content */}
      <div className="bg-[#1C2128] rounded-xl border border-[#30363D] overflow-hidden">
        {/* Report Header */}
        <div className="bg-gradient-to-r from-[#1C2128] to-[#0D1117] p-6 border-b border-[#30363D]">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold">원주세브란스기독병원</p>
              <p className="text-[#8B949E] text-sm">DIBH 호흡훈련 결과보고서</p>
            </div>
          </div>
          <p className="text-[#8B949E] text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            생성일: {format(new Date(reportDate), 'yyyy년 MM월 dd일 HH:mm')}
          </p>
        </div>

        {/* Patient Info */}
        <div className="p-6 border-b border-[#30363D]">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-[#3B82F6]" />
            환자 정보
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[#8B949E]">환자명</p>
              <p className="text-white font-medium">{reportData?.patient_name || patient?.name || '-'}</p>
            </div>
            <div>
              <p className="text-[#8B949E]">환자 코드</p>
              <p className="text-white font-medium">{reportData?.patient_code || patient?.patient_code || '-'}</p>
            </div>
            <div>
              <p className="text-[#8B949E]">생년월일</p>
              <p className="text-white font-medium">
                {patient?.birth_date ? format(new Date(patient.birth_date), 'yyyy.MM.dd') : '-'}
              </p>
            </div>
            <div>
              <p className="text-[#8B949E]">치료 기법</p>
              <p className="text-white font-medium">
                {treatmentMethods[reportData?.treatment_method || patient?.treatment_method] || '-'}
              </p>
            </div>
            <div>
              <p className="text-[#8B949E]">호흡 방식</p>
              <p className="text-white font-medium">
                {breathingMethods[reportData?.breathing_method || patient?.breathing_method] || '-'}
              </p>
            </div>
            <div>
              <p className="text-[#8B949E]">방사선치료 회차</p>
              <p className="text-white font-medium">{reportData?.total_sessions || patient?.total_sessions || 1}회차</p>
            </div>
          </div>
        </div>

        {/* Training Results */}
        <div className="p-6 border-b border-[#30363D]">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#3B82F6]" />
            훈련 결과
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#8B949E] border-b border-[#30363D]">
                  <th className="text-left py-3 px-2">항목</th>
                  <th className="text-right py-3 px-2">결과</th>
                </tr>
              </thead>
              <tbody className="text-white">
                <tr className="border-b border-[#30363D]/50">
                  <td className="py-3 px-2">훈련 일시</td>
                  <td className="text-right py-3 px-2">
                    {format(new Date(reportDate), 'yyyy.MM.dd HH:mm')}
                  </td>
                </tr>
                <tr className="border-b border-[#30363D]/50">
                  <td className="py-3 px-2">훈련 타입</td>
                  <td className="text-right py-3 px-2">
                    <span className="px-2 py-1 rounded bg-[#22C55E]/20 text-[#22C55E]">
                      Type {reportData?.training_type || patient?.training_type || 'A'}
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-[#30363D]/50">
                  <td className="py-3 px-2">총 훈련 시간</td>
                  <td className="text-right py-3 px-2">
                    {session?.duration || session?.total_duration 
                      ? `${Math.floor((session.duration || session.total_duration) / 60)}:${String((session.duration || session.total_duration) % 60).padStart(2, '0')}`
                      : '12:45'}
                  </td>
                </tr>
                <tr className="border-b border-[#30363D]/50">
                  <td className="py-3 px-2">평균 정확도</td>
                  <td className="text-right py-3 px-2">
                    {session?.accuracy || session?.average_accuracy || '87'}%
                  </td>
                </tr>
                <tr className="border-b border-[#30363D]/50">
                  <td className="py-3 px-2">DIBH 유지시간</td>
                  <td className="text-right py-3 px-2">
                    {session?.dibh_duration || '18'}초
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-2">호흡 안정성 (CV)</td>
                  <td className="text-right py-3 px-2">
                    {session?.cv || '12'}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Improvement Chart */}
        <div className="p-6 border-b border-[#30363D]">
          <h3 className="text-white font-semibold mb-4">개선도 추이</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
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
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#3B82F6" 
                  strokeWidth={2}
                  dot={{ fill: '#3B82F6', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Analysis */}
        <div className="p-6">
          <h3 className="text-white font-semibold mb-4">분석 소견</h3>
          <div className="bg-[#0D1117] rounded-lg p-4 border border-[#30363D]">
            <p className="text-[#8B949E] leading-relaxed">
              환자는 안정적인 호흡 패턴을 유지하며 DIBH 기법에 적합합니다. 
              훈련 진행에 따라 호흡 안정성이 지속적으로 개선되고 있으며, 
              현재 수준으로 실전 치료가 가능할 것으로 판단됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Buttons */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0D1117] via-[#0D1117] to-transparent">
        <div className="flex gap-3">
          <Button
            onClick={handleClose}
            variant="outline"
            className="flex-1 h-14 text-lg font-semibold border-[#30363D] bg-[#1C2128] text-white hover:bg-[#30363D] hover:text-white rounded-xl"
          >
            닫기
          </Button>
          <Button
            onClick={handlePrint}
            className="flex-1 h-14 text-lg font-semibold bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] hover:from-[#2563EB] hover:to-[#7C3AED] text-white rounded-xl"
          >
            <Printer className="w-5 h-5 mr-2" />
            인쇄하기
          </Button>
        </div>
      </div>
    </div>
  );
}