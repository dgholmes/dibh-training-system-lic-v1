import React from 'react';
import { FileText, Calendar, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PatientFlowPageHeader } from '@/components/common/PatientFlowPageHeader';
import { createPageUrl } from '@/utils';
import { Patient, Calibration } from '@/api/entities';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { BreathingTypeBadge } from '@/components/breathing/BreathingTypeBadge';
import { sortCalibrationsDesc } from '@/lib/calibration/sortCalibrations';

export default function CalibrationHistory() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const patientId = urlParams.get('patientId');

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
    queryFn: async () => {
      if (!patientId) return [];
      return sortCalibrationsDesc(await Calibration.filter({ patient_id: patientId }));
    },
    enabled: !!patientId,
  });

  const [searchTerm, setSearchTerm] = React.useState('');

  const filtered = React.useMemo(() => {
    if (!searchTerm) return calibrations;
    const term = searchTerm.toLowerCase();
    return calibrations.filter((c) => {
      const dateStr = c.calibration_date ? String(c.calibration_date).split('T')[0] : '';
      return dateStr.includes(term);
    });
  }, [calibrations, searchTerm]);

  const handleViewReport = (cal) => {
    navigate(
      `/CalibrationReport?patientId=${encodeURIComponent(patientId)}&calibrationId=${encodeURIComponent(cal.id)}`
    );
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-24">
      <PatientFlowPageHeader
        backHref={createPageUrl('PatientDashboard') + `?patientId=${patientId}`}
        title="교정 이력 조회"
        patient={patient}
      />

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8B949E]" />
        <input
          type="text"
          placeholder="날짜로 검색 (예: 2025-03)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-14 pl-14 pr-5 bg-[#1C2128] border border-[#30363D] text-white placeholder:text-[#8B949E] focus:border-[#3B82F6] rounded-xl text-base outline-none"
        />
      </div>

      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((cal) => (
            <div
              key={cal.id}
              className="bg-[#1C2128] rounded-xl p-5 border border-[#30363D] hover:border-[#3B82F6]/50 transition-all cursor-pointer"
              onClick={() => handleViewReport(cal)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#3B82F6]/20 to-[#8B5CF6]/20 flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6 text-[#3B82F6]" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">호흡 분석</h3>
                    <div className="flex items-center gap-2 text-[#8B949E] text-sm">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {cal.calibration_date
                          ? format(parseISO(String(cal.calibration_date)), 'yyyy년 MM월 dd일')
                          : cal.created_at
                          ? format(new Date(cal.created_at), 'yyyy년 MM월 dd일')
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <BreathingTypeBadge type={cal.training_type} compact />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#30363D]">
                <div>
                  <p className="text-[#8B949E] text-xs mb-1">DIBH 유지 시간</p>
                  <p className="text-white text-sm font-semibold">
                    {cal.dibh_duration != null ? `${cal.dibh_duration}초` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[#8B949E] text-xs mb-1">호흡 안정성 (CV)</p>
                  <p className="text-white text-sm font-semibold">
                    {cal.cv != null ? `${cal.cv}%` : '—'}
                  </p>
                </div>
              </div>

              {cal.source_files && Array.isArray(cal.source_files) && cal.source_files.length > 0 && (
                <p className="mt-3 text-xs text-[#8B949E] truncate" title={cal.source_files.join(', ')}>
                  파일: {cal.source_files.join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[#1C2128] rounded-xl p-12 border border-[#30363D] text-center">
          <FileText className="w-16 h-16 text-[#8B949E] mx-auto mb-4 opacity-50" />
          <p className="text-[#8B949E] text-lg mb-2">
            {searchTerm ? '검색 결과가 없습니다' : '교정 이력이 없습니다'}
          </p>
          <p className="text-[#8B949E] text-sm">
            {searchTerm
              ? '다른 검색어를 시도해보세요'
              : '호흡 분석을 완료하면 이력이 표시됩니다'}
          </p>
        </div>
      )}
    </div>
  );
}
