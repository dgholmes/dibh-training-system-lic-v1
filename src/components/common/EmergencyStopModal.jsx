import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function EmergencyStopModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-[#1C2128] rounded-2xl p-8 max-w-lg mx-4 border border-[#30363D] shadow-2xl animate-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8B949E] hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-[#EF4444]/10 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-[#EF4444]" />
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-3">긴급정지</h2>
          <p className="text-[#8B949E] text-lg mb-8">
            훈련을 즉시 중단하고 종료하시겠습니까?
          </p>
          
          <div className="bg-[#1C2128] rounded-xl p-5 mb-8 text-left border border-[#30363D]">
            <ul className="space-y-3 text-sm text-[#8B949E]">
              <li className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-[#8B949E]" />
                VR 화면이 강제 종료됩니다
              </li>
              <li className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-[#8B949E]" />
                호흡벨트 측정이 종료됩니다
              </li>
              <li className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-[#8B949E]" />
                현재까지의 데이터는 저장됩니다
              </li>
            </ul>
          </div>
          
          <div className="flex gap-4">
            <Button
              variant="outline"
              className="flex-1 h-14 text-base border border-[#30363D] bg-[#1C2128] text-white hover:bg-[#30363D] hover:text-white"
              onClick={onClose}
            >
              취소
            </Button>
            <Button
              className="flex-1 h-14 text-base bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-lg shadow-[#EF4444]/25"
              onClick={onConfirm}
            >
              정지
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}