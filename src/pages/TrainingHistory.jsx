import React from 'react';
import { FileText, Calendar, Clock, Target, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { PatientFlowPageHeader } from '@/components/common/PatientFlowPageHeader';
import { createPageUrl } from '@/utils';
import { Patient, TrainingSession } from '@/api/entities';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function TrainingHistory() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const patientId = urlParams.get('patientId');

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => {
      const results = Patient.filter({ id: patientId });
      return results[0] || null;
    },
    enabled: !!patientId,
  });

  const { data: trainingSessions } = useQuery({
    queryKey: ['trainingSessions', patientId],
    queryFn: () => {
      if (!patientId) return [];
      const sessions = TrainingSession.filter({ patient_id: patientId });
      // Sort by date descending (most recent first)
      return sessions.sort((a, b) => {
        const dateA = new Date(a.session_date || a.created_at || 0);
        const dateB = new Date(b.session_date || b.created_at || 0);
        return dateB - dateA;
      });
    },
    enabled: !!patientId,
  });

  const [searchTerm, setSearchTerm] = React.useState('');

  const filteredSessions = React.useMemo(() => {
    if (!trainingSessions) return [];
    if (!searchTerm) return trainingSessions;
    
    const term = searchTerm.toLowerCase();
    return trainingSessions.filter(session => {
      const dateStr = session.session_date 
        ? format(new Date(session.session_date), 'yyyy-MM-dd')
        : '';
      return (
        dateStr.includes(term) ||
        session.patient_name?.toLowerCase().includes(term) ||
        session.patient_code?.toLowerCase().includes(term)
      );
    });
  }, [trainingSessions, searchTerm]);

  const formatTime = (seconds) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleViewReport = (sessionId) => {
    navigate(createPageUrl('TrainingReport') + `?patientId=${patientId}&sessionId=${sessionId}`);
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-24">
      <PatientFlowPageHeader
        backHref={createPageUrl('PatientDashboard') + `?patientId=${patientId}`}
        title="훈련 이력 조회"
        patient={patient}
      />

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8B949E]" />
        <input
          id="training-history-search"
          name="training-history-search"
          type="text"
          placeholder="날짜로 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-14 pl-14 pr-5 bg-[#1C2128] border border-[#30363D] text-white placeholder:text-[#8B949E] focus:border-[#3B82F6] rounded-xl text-base"
        />
      </div>

      {/* Sessions List */}
      {filteredSessions && filteredSessions.length > 0 ? (
        <div className="space-y-3">
          {filteredSessions.map((session) => (
            <div
              key={session.id}
              className="bg-[#1C2128] rounded-xl p-5 border border-[#30363D] hover:border-[#3B82F6]/50 transition-all cursor-pointer"
              onClick={() => handleViewReport(session.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#3B82F6]/20 to-[#8B5CF6]/20 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-[#3B82F6]" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">
                      훈련 세션
                    </h3>
                    <div className="flex items-center gap-2 text-[#8B949E] text-sm">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {session.session_date 
                          ? format(new Date(session.session_date), 'yyyy년 MM월 dd일')
                          : session.created_at
                          ? format(new Date(session.created_at), 'yyyy년 MM월 dd일')
                          : '-'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium",
                  session.status === 'completed' 
                    ? "bg-[#22C55E]/20 text-[#22C55E]"
                    : session.status === 'in_progress'
                    ? "bg-[#EAB308]/20 text-[#EAB308]"
                    : "bg-[#8B949E]/20 text-[#8B949E]"
                )}>
                  {session.status === 'completed' ? '완료' : 
                   session.status === 'in_progress' ? '진행중' : 
                   session.status || '알 수 없음'}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[#30363D]">
                <div>
                  <p className="text-[#8B949E] text-xs mb-1">훈련 타입</p>
                  <p className="text-white text-sm font-medium">
                    Type {session.training_type || patient?.training_type || 'A'}
                  </p>
                </div>
                <div>
                  <p className="text-[#8B949E] text-xs mb-1">훈련 시간</p>
                  <p className="text-white text-sm font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(session.duration || session.total_duration)}
                  </p>
                </div>
                <div>
                  <p className="text-[#8B949E] text-xs mb-1">평균 정확도</p>
                  <p className="text-white text-sm font-medium flex items-center gap-1">
                    <Target className="w-3 h-3" />
                    {session.accuracy || session.average_accuracy || '-'}%
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[#1C2128] rounded-xl p-12 border border-[#30363D] text-center">
          <FileText className="w-16 h-16 text-[#8B949E] mx-auto mb-4 opacity-50" />
          <p className="text-[#8B949E] text-lg mb-2">
            {searchTerm ? '검색 결과가 없습니다' : '훈련 이력이 없습니다'}
          </p>
          <p className="text-[#8B949E] text-sm">
            {searchTerm 
              ? '다른 검색어를 시도해보세요'
              : '훈련을 시작하면 이력이 표시됩니다'}
          </p>
        </div>
      )}
    </div>
  );
}
