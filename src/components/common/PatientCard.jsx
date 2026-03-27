import React from 'react';
import { ChevronRight, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { getCalibrationStatus, getStatusColor } from '@/utils/recalibration';

export default function PatientCard({ patient, onClick }) {
  const typeColors = {
    A: 'bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/30',
    B: 'bg-[#EAB308]/20 text-[#EAB308] border-[#EAB308]/30',
    C: 'bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/30',
  };

  const calibrationStatus = patient ? getCalibrationStatus(patient) : null;
  const statusColor = getStatusColor(calibrationStatus);

  return (
    <button
      onClick={onClick}
      className="w-full bg-[#1C2128] rounded-xl p-5 border border-[#30363D] flex items-center gap-4 hover:border-[#3B82F6] hover:bg-[#1C2128]/80 transition-all group relative"
    >
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] flex items-center justify-center shadow-sm">
        <User className="w-7 h-7 text-white" />
      </div>
      <div className="flex-1 text-left">
        <div className="flex items-center gap-2">
          <p className="text-white font-bold text-lg">{patient.name}</p>
          {/* Status indicator dot */}
          <div 
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: statusColor }}
            title={
              calibrationStatus === 'valid' ? '정상' :
              calibrationStatus === 'expiring' ? '만료 예정' :
              calibrationStatus === 'expired' ? '재캘리브레이션 필요' :
              '캘리브레이션 필요'
            }
          />
        </div>
        <p className="text-[#8B949E] text-sm font-medium">{patient.patient_code}</p>
        {patient.last_training_date && (
          <p className="text-[#6B7280] text-xs mt-1">
            마지막 훈련: {format(new Date(patient.last_training_date), 'yyyy.MM.dd')}
          </p>
        )}
      </div>
      {patient.training_type && (
        <span className={cn(
          "px-4 py-2 rounded-full text-sm font-bold border-2",
          typeColors[patient.training_type]
        )}>
          Type {patient.training_type}
        </span>
      )}
      <ChevronRight className="w-6 h-6 text-[#8B949E] group-hover:text-[#3B82F6] transition-colors" />
    </button>
  );
}