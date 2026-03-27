import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const steps = [
  { id: 1, label: '초기진단' },
  { id: 2, label: '장비착용' },
  { id: 3, label: '캘리브레이션' },
  { id: 4, label: '완료' }
];

export default function StepIndicator({ currentStep = 1 }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all shadow-sm",
                step.id < currentStep && "bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white",
                step.id === currentStep && "bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white ring-4 ring-[#3B82F6]/20",
                step.id > currentStep && "bg-[#1C2128] text-[#8B949E] border-2 border-[#30363D]"
              )}
            >
              {step.id < currentStep ? <Check className="w-5 h-5" /> : step.id}
            </div>
            <span className={cn(
              "text-xs font-medium",
              step.id <= currentStep ? "text-white" : "text-[#8B949E]"
            )}>
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className="w-12 h-0.5 mb-5 bg-[#30363D]" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}