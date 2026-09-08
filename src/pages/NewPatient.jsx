import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Minus, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/context/AuthContext';
import { PatientFlowPageHeader } from '@/components/common/PatientFlowPageHeader';
import { Patient } from '@/api/entities';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { nextPatientCode } from '@/lib/patientCode';
import { darkPopoverCalendarClassNames } from '@/lib/darkPopoverCalendar';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO, isValid } from 'date-fns';

export default function NewPatient() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    birth_date: '',
    gender: 'male',
    treatment_session_count: 0,
    patient_code: '',
    assigned_doctor_name: session?.displayName || session?.username || '',
    assigned_doctor_account_id: '',
  });

  const [sessionManualMode, setSessionManualMode] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ name: false, birth_date: false });
  const [birthDatePopoverOpen, setBirthDatePopoverOpen] = useState(false);
  const [postRegistrationModal, setPostRegistrationModal] = useState({
    open: false,
    patientId: null,
    message: '',
  });

  useEffect(() => {
    setFormData((prev) => ({ ...prev, patient_code: nextPatientCode() }));
  }, []);

  const validateBasicInfo = () => {
    const nameInvalid = !formData.name.trim() || formData.name.trim().length > 100;
    const birthInvalid = !formData.birth_date;
    return { nameInvalid, birthInvalid, ok: !nameInvalid && !birthInvalid };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { nameInvalid, birthInvalid, ok } = validateBasicInfo();
    if (!ok) {
      setFieldErrors({ name: nameInvalid, birth_date: birthInvalid });
      setShowValidationModal(true);
      return;
    }
    setFieldErrors({ name: false, birth_date: false });

    setIsLoading(true);

    try {
      const newPatient = await Patient.create({
        name: formData.name,
        birth_date: formData.birth_date,
        gender: formData.gender,
        treatment_session_count: formData.treatment_session_count,
        patient_code: formData.patient_code,
        assigned_doctor_name: formData.assigned_doctor_name.trim(),
        assigned_doctor_account_id: formData.assigned_doctor_account_id,
        expected_treatment_date: '',
        treatment_method: '',
        breathing_method: '',
      });

      await queryClient.invalidateQueries({ queryKey: ['patients'] });

      setPostRegistrationModal({
        open: true,
        patientId: newPatient.id,
        message: '등록이 완료되었습니다. 호흡 데이터는 환자 대시보드에서 추가할 수 있습니다.',
      });
    } catch (err) {
      console.error('NewPatient: save failed', err);
      console.error('[NewPatient] save failed:', err);
      toast({
        title: '저장에 실패했습니다',
        description: '환자 정보를 저장하는 중 오류가 발생했습니다. 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const genderOptions = [
    { value: 'male', label: '남성' },
    { value: 'female', label: '여성' },
    { value: 'unspecified', label: '선택안함' },
  ];

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-24">
      <div className="max-w-2xl mx-auto">
        <PatientFlowPageHeader
          backHref={createPageUrl('Home')}
          title="신규 환자 등록"
          patient={null}
          className="mb-6"
        />

        <form noValidate onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-[#1C2128] rounded-xl p-6 border border-[#30363D]">
            <h2 className="text-white font-bold text-lg mb-6 flex items-center gap-2">
              <span className="w-1 h-5 bg-gradient-to-b from-[#3B82F6] to-[#8B5CF6] rounded-full" />
              기본 정보(필수)
            </h2>

            <div className="space-y-5">
              <div>
                <Label htmlFor="new-name" className="text-[#8B949E] mb-2 block font-medium">
                  환자 이름
                </Label>
                <Input
                  id="new-name"
                  placeholder="환자 이름을 입력하세요"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: false }));
                  }}
                  aria-invalid={fieldErrors.name}
                  className={cn(
                    'h-12 bg-[#0D1117] text-white placeholder:text-[#8B949E] focus:border-[#3B82F6] rounded-xl',
                    fieldErrors.name
                      ? 'border-red-500 ring-1 ring-red-500/35 focus:border-red-500 focus-visible:ring-red-500/40'
                      : 'border-[#30363D]'
                  )}
                />
              </div>

              <div>
                <Label htmlFor="new-doctor" className="text-[#8B949E] mb-2 block font-medium">
                  담당 의사
                </Label>
                <Input
                  id="new-doctor"
                  placeholder="담당 의사 이름을 입력하세요"
                  value={formData.assigned_doctor_name}
                  onChange={(e) => setFormData({ ...formData, assigned_doctor_name: e.target.value })}
                  className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] text-white placeholder:text-[#8B949E] focus:border-[#3B82F6]"
                />
              </div>

              <div>
                <Label htmlFor="new-birth-date-trigger" className="text-[#8B949E] mb-2 block font-medium">
                  생년월일
                </Label>
                <Popover open={birthDatePopoverOpen} onOpenChange={setBirthDatePopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      id="new-birth-date-trigger"
                      type="button"
                      aria-invalid={fieldErrors.birth_date}
                      className={cn(
                        'flex h-12 w-full items-center gap-3 rounded-xl border bg-[#0D1117] px-4 text-left text-sm transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50',
                        fieldErrors.birth_date
                          ? 'border-red-500 ring-1 ring-red-500/35'
                          : 'border-[#30363D] hover:border-[#8B949E]/50'
                      )}
                    >
                      <CalendarIcon className="h-5 w-5 shrink-0 text-[#8B949E]" aria-hidden />
                      <span
                        className={
                          formData.birth_date && isValid(parseISO(formData.birth_date))
                            ? 'text-white'
                            : 'text-[#6E7681]'
                        }
                      >
                        {formData.birth_date && isValid(parseISO(formData.birth_date))
                          ? format(parseISO(formData.birth_date), 'MM/dd/yyyy')
                          : 'mm/dd/yyyy'}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto border border-[#30363D] bg-[#1C2128] p-0 text-white"
                    align="start"
                    sideOffset={8}
                  >
                    <Calendar
                      mode="single"
                      selected={
                        formData.birth_date && isValid(parseISO(formData.birth_date))
                          ? parseISO(formData.birth_date)
                          : undefined
                      }
                      onSelect={(date) => {
                        setFormData({ ...formData, birth_date: date ? format(date, 'yyyy-MM-dd') : '' });
                        if (fieldErrors.birth_date) setFieldErrors((prev) => ({ ...prev, birth_date: false }));
                        setBirthDatePopoverOpen(false);
                      }}
                      defaultMonth={
                        formData.birth_date && isValid(parseISO(formData.birth_date))
                          ? parseISO(formData.birth_date)
                          : new Date()
                      }
                      initialFocus
                      className="rounded-md border-0 bg-transparent text-white"
                      classNames={darkPopoverCalendarClassNames}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label className="text-[#8B949E] mb-2 block font-medium">성별</Label>
                <div className="flex flex-wrap gap-2">
                  {genderOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, gender: opt.value })}
                      className={cn(
                        'flex-1 min-w-[5.5rem] rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors sm:flex-none sm:px-4',
                        formData.gender === opt.value
                          ? 'border-[#3B82F6] bg-[#3B82F6]/10 text-white ring-1 ring-[#3B82F6]/40'
                          : 'border-[#30363D] bg-[#0D1117] text-[#8B949E] hover:border-[#8B949E]/50 hover:text-white'
                      )}
                    >
                      <span
                        className={cn(
                          'mr-2 inline-block h-2.5 w-2.5 shrink-0 rounded-full border align-middle',
                          formData.gender === opt.value
                            ? 'border-[#3B82F6] bg-[#3B82F6]'
                            : 'border-[#8B949E] bg-transparent'
                        )}
                      />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-[#8B949E] mb-2 block font-medium">치료회차</Label>
                <div className="flex flex-wrap items-center gap-3">
                  {!sessionManualMode ? (
                    <div className="flex items-center gap-2 rounded-xl border border-[#30363D] bg-[#0D1117] p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            treatment_session_count: Math.max(0, prev.treatment_session_count - 1),
                          }))
                        }
                      >
                        <Minus className="h-5 w-5" />
                      </Button>
                      <span className="min-w-[2.5rem] text-center text-sm font-semibold text-white">
                        {formData.treatment_session_count}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            treatment_session_count: prev.treatment_session_count + 1,
                          }))
                        }
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      value={formData.treatment_session_count}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          treatment_session_count: Math.max(0, parseInt(e.target.value, 10) || 0),
                        })
                      }
                      className="h-12 w-32 bg-[#0D1117] border-[#30363D] text-white rounded-xl"
                    />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 border-[#30363D] bg-transparent text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                    onClick={() => setSessionManualMode((m) => !m)}
                  >
                    직접입력
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="new-patient-code" className="text-[#8B949E] mb-2 block font-medium">
                  환자 코드
                </Label>
                <Input
                  id="new-patient-code"
                  value={formData.patient_code}
                  readOnly
                  className="h-12 bg-[#0D1117] border-[#30363D] text-[#8B949E] rounded-xl"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center justify-center gap-2">
            <p className="text-center text-sm text-[#8B949E]">
              호흡 데이터는 등록 후 환자 대시보드의 [호흡 데이터 · 분석]에서 추가합니다.
            </p>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-[70%] h-12 text-base font-semibold bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] hover:from-[#2563EB] hover:to-[#7C3AED] text-white rounded-xl shadow-lg shadow-[#3B82F6]/25 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                '등록 완료'
              )}
            </Button>
          </div>
        </form>

        <Dialog open={showValidationModal} onOpenChange={setShowValidationModal}>
          <DialogContent
            hideClose
            className="max-w-[min(100%,380px)] gap-0 border border-[#30363D] bg-[#1C2128] p-0 shadow-2xl sm:rounded-2xl"
          >
            <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
              <div
                className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#EF4444]/15"
                aria-hidden
              >
                <span className="text-3xl font-bold leading-none text-[#EF4444]">!</span>
              </div>
              <p className="text-base font-bold leading-snug text-white sm:text-lg">
                기본정보(필수입력)를 모두 입력하세요.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#8B949E]">
                {fieldErrors.name || fieldErrors.birth_date
                  ? `누락된 항목: ${[
                      fieldErrors.name && '환자 이름',
                      fieldErrors.birth_date && '생년월일',
                    ]
                      .filter(Boolean)
                      .join(', ')}`
                  : '누락된 항목을 확인해 주세요.'}
              </p>
              <Button
                type="button"
                className="mt-8 h-12 w-full rounded-xl text-base font-semibold bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white shadow-lg shadow-[#3B82F6]/25 transition-all hover:from-[#2563EB] hover:to-[#7C3AED]"
                onClick={() => setShowValidationModal(false)}
              >
                확인
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={postRegistrationModal.open}
          onOpenChange={(open) => {
            if (!open) {
              setPostRegistrationModal((prev) => ({ ...prev, open: false }));
            }
          }}
        >
          <DialogContent
            hideClose
            className="max-w-[min(100%,420px)] gap-0 border border-[#30363D] bg-[#1C2128] p-0 shadow-2xl sm:rounded-2xl"
          >
            <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
              <div
                className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#10B981]/15"
                aria-hidden
              >
                <Check className="h-7 w-7 text-[#10B981]" />
              </div>
              <p className="text-base font-bold leading-snug text-white sm:text-lg">
                환자 프로필이 저장되었습니다.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[#8B949E]">
                {postRegistrationModal.message}
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-1">
                <Button
                  type="button"
                  className="h-11 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] font-semibold text-white hover:from-[#2563EB] hover:to-[#7C3AED]"
                  onClick={() => {
                    const id = postRegistrationModal.patientId;
                    setPostRegistrationModal((prev) => ({ ...prev, open: false }));
                    if (id) {
                      navigate(
                        `${createPageUrl('PatientDashboard')}?patientId=${encodeURIComponent(id)}`
                      );
                    }
                  }}
                >
                  환자 대시보드로 이동
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
