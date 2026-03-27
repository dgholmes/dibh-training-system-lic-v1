import React, { useState, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Patient } from '@/api/entities';
import { useQuery } from '@tanstack/react-query';

export default function EndSession() {
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

  const [countdown, setCountdown] = useState(5);

  const handleLogout = () => {
    navigate(createPageUrl('Home'));
  };

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  // Navigate when countdown reaches 0
  useEffect(() => {
    if (countdown === 0) {
      navigate(createPageUrl('Home'));
    }
  }, [countdown, navigate]);

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col items-center justify-center p-6">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#22C55E]/5 via-transparent to-[#06B6D4]/5" />
      
      <div className="relative z-10 text-center">
        {/* Success Icon */}
        <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#22C55E]/20 to-[#06B6D4]/20 flex items-center justify-center mx-auto mb-8 animate-pulse">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#22C55E] to-[#06B6D4] flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-white mb-2">훈련을 종료합니다</h1>
        <p className="text-[#8B949E] text-lg mb-12">수고하셨습니다</p>

        {/* Countdown */}
        <div className="relative w-24 h-24 mx-auto mb-6">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="42"
              stroke="#30363D"
              strokeWidth="4"
              fill="none"
            />
            <circle
              cx="48"
              cy="48"
              r="42"
              stroke="url(#countdownGradient)"
              strokeWidth="4"
              fill="none"
              strokeDasharray={`${(countdown / 5) * 264} 264`}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
            <defs>
              <linearGradient id="countdownGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22C55E" />
                <stop offset="100%" stopColor="#06B6D4" />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-4xl font-bold text-white">
            {countdown}
          </span>
        </div>
        <p className="text-[#8B949E] mb-8">초 후 환자 선택 페이지로 이동</p>

        {/* Patient info */}
        <div className="bg-[#1C2128] rounded-xl px-6 py-4 border border-[#30363D] inline-block mb-8">
          <p className="text-[#8B949E] text-sm">
            <span className="text-white font-medium">{patient?.name || ''}</span>님의 훈련이 정상적으로 완료되었습니다
          </p>
        </div>

        {/* Manual Logout Button */}
        <div>
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="text-[#8B949E] hover:text-white hover:bg-[#1C2128]"
          >
            바로 이동
          </Button>
        </div>
      </div>
    </div>
  );
}