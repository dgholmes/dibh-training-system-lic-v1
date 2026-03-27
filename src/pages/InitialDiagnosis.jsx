import React, { useState, useEffect } from 'react';
import { Smile, Meh, Frown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PatientFlowPageHeader } from '@/components/common/PatientFlowPageHeader';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Patient, TrainingSession } from '@/api/entities';
import { useQuery } from '@tanstack/react-query';
import StepIndicator from '@/components/common/StepIndicator';
import { cn } from '@/lib/utils';

export default function InitialDiagnosis() {
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

  const [formData, setFormData] = useState({
    condition: '',
    blood_pressure: 3,
    temperature: 3,
    heart_rate: 3,
    treatment_round: 1,
    notes: '',
  });

  const conditions = [
    { value: 'good', icon: Smile, label: '좋음', color: 'green' },
    { value: 'normal', icon: Meh, label: '보통', color: 'yellow' },
    { value: 'bad', icon: Frown, label: '나쁨', color: 'red' },
  ];

  const colorClasses = {
    green: 'border-[#22C55E] bg-[#22C55E]/20 text-[#22C55E]',
    yellow: 'border-[#EAB308] bg-[#EAB308]/20 text-[#EAB308]',
    red: 'border-[#EF4444] bg-[#EF4444]/20 text-[#EF4444]',
  };

  const vitalSigns = [
    { key: 'blood_pressure', label: '혈압' },
    { key: 'temperature', label: '체온' },
    { key: 'heart_rate', label: '심박' },
  ];

  const handleNext = async () => {
    // Store initial diagnosis data in patient record temporarily
    // This will be used when creating the training session later
    if (patientId) {
      await Patient.update(patientId, {
        pending_initial_diagnosis: formData
      });
    }
    
    navigate(createPageUrl('EquipmentCheck') + `?patientId=${patientId}`);
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-24">
      <PatientFlowPageHeader
        backHref={createPageUrl('Home')}
        title="당일 초기 진단"
        patient={patient}
      />

      {/* Step Indicator */}
      <StepIndicator currentStep={1} />

      {/* Form */}
      <div className="space-y-4 mt-4">
        {/* Condition */}
        <div className="bg-[#1C2128] rounded-xl p-4 border border-[#30363D]">
          <Label className="text-white font-semibold mb-3 block">컨디션</Label>
          <div className="grid grid-cols-3 gap-2">
            {conditions.map((cond) => {
              const Icon = cond.icon;
              return (
                <button
                  key={cond.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, condition: cond.value })}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                    formData.condition === cond.value
                      ? colorClasses[cond.color]
                      : "border-[#30363D] bg-[#0D1117] text-[#8B949E] hover:border-[#8B949E]"
                  )}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-xs font-medium">{cond.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Vital Signs */}
        <div className="bg-[#1C2128] rounded-xl p-6 border border-[#30363D]">
          <Label className="text-white font-semibold mb-3 block">활력징후</Label>
          <div className="space-y-3">
            {vitalSigns.map((vital) => (
              <div key={vital.key}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[#8B949E] text-sm">{vital.label}</span>
                  <span className="text-white text-sm font-medium">{formData[vital.key]}/5</span>
                </div>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFormData({ ...formData, [vital.key]: value })}
                      className={cn(
                        "flex-1 h-7 rounded-lg transition-all",
                        formData[vital.key] >= value
                          ? "bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6]"
                          : "bg-[#30363D] hover:bg-[#8B949E]/30"
                      )}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Treatment Round */}
        <div className="bg-[#1C2128] rounded-xl p-6 border border-[#30363D]">
          <Label htmlFor="treatment-round" className="text-white font-semibold mb-4 block">방사선치료 회차</Label>
          <Input
            id="treatment-round"
            type="number"
            min={1}
            value={formData.treatment_round}
            onChange={(e) => setFormData({ ...formData, treatment_round: parseInt(e.target.value) || 1 })}
            className="h-12 bg-[#0D1117] border-[#30363D] text-white focus:border-[#3B82F6] rounded-xl"
          />
        </div>

        {/* Notes */}
        <div className="bg-[#1C2128] rounded-xl p-6 border border-[#30363D]">
          <div className="flex justify-between items-center mb-4">
            <Label htmlFor="notes" className="text-white font-semibold">특이사항</Label>
            <span className="text-[#8B949E] text-sm">{formData.notes.length}/500자</span>
          </div>
          <Textarea
            id="notes"
            placeholder="특이사항을 입력하세요..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value.slice(0, 500) })}
            className="min-h-[120px] bg-[#0D1117] border-[#30363D] text-white placeholder:text-[#8B949E] focus:border-[#3B82F6] rounded-xl resize-none"
          />
        </div>

        {/* Submit Button */}
        <div className="flex justify-center mt-6">
          <Button
            onClick={handleNext}
            disabled={!formData.condition}
            className="w-[70%] h-12 text-base font-semibold bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] hover:from-[#2563EB] hover:to-[#7C3AED] text-white rounded-xl shadow-lg shadow-[#3B82F6]/25 disabled:opacity-50"
          >
            다음 단계
          </Button>
        </div>
      </div>
    </div>
  );
}