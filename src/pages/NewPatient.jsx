import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Calendar,
  RefreshCw,
  CloudUpload,
  X,
  Minus,
  Plus,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { PatientFlowPageHeader } from '@/components/common/PatientFlowPageHeader';
import { Patient, createBreathingFile } from '@/api/entities';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { formatFileSize, fileTypeBadge } from '@/lib/files';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';

function nextPatientCode() {
  const year = new Date().getFullYear();
  const patients = Patient.list();
  let max = 0;
  for (const p of patients) {
    const m = String(p.patient_code || '').match(new RegExp(`^PT-${year}-(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `PT-${year}-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Optional upload list + drop zone. Keeps same card/label/input scale as the rest of the page.
 */
function BreathingFileSection({ title, files, onAddFiles, onRemove, inputRef }) {
  const onDrop = (e) => {
    e.preventDefault();
    const list = e.dataTransfer?.files;
    if (list?.length) onAddFiles(list);
  };

  return (
    <div className="bg-[#1C2128] rounded-xl p-6 border border-[#30363D]">
      <h2 className="text-white font-bold text-lg mb-6 flex items-center gap-2">
        <span className="w-1 h-5 bg-gradient-to-b from-[#3B82F6] to-[#8B5CF6] rounded-full" />
        {title}
      </h2>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className="mb-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#30363D] bg-[#0D1117]/50 px-4 py-10 text-center transition-colors hover:border-[#3B82F6]/50 hover:bg-[#0D1117]"
      >
        <CloudUpload className="mb-3 h-10 w-10 text-[#8B949E]" />
        <p className="text-sm font-medium text-white">파일을 선택하세요</p>
        <p className="mt-1 text-xs text-[#8B949E]">CSV, VXP 파일 지원 (다중 선택 가능)</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.vxp,application/octet-stream"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onAddFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-[#8B949E]">업로드 파일 ({files.length})</p>
          <ul className="space-y-3">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-2xl border border-[#30363D]/80 bg-[#252A32] px-4 py-3"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#30363D] bg-[#1C2128] text-[10px] font-bold uppercase leading-none tracking-wide text-[#C9D1D9]"
                  aria-hidden
                >
                  {fileTypeBadge(f.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{f.name}</p>
                  <p className="mt-0.5 text-xs text-[#9BA1A6]">
                    {f.status === 'uploading'
                      ? `${formatFileSize(f.size)} · ${Math.round(f.progress)}% 업로드 중...`
                      : `${formatFileSize(f.size)} · 업로드 완료`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {f.status === 'uploading' ? (
                    <div
                      className="h-2 w-[88px] overflow-hidden rounded-full bg-[#0D1117]"
                      role="progressbar"
                      aria-valuenow={Math.round(f.progress)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#3B82F6] to-[#60A5FA] transition-[width] duration-200 ease-out"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                  ) : (
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center"
                      aria-hidden
                    >
                      <Check className="h-4 w-4 text-[#79B8FF]" strokeWidth={2} />
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-[#8B949E] hover:bg-[#30363D] hover:text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(f.id);
                    }}
                    aria-label="파일 제거"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function NewPatient() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const birthDateInputRef = useRef(null);
  const generalFileInputRef = useRef(null);
  const dibhFileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    birth_date: '',
    gender: 'male',
    treatment_session_count: 0,
    patient_code: '',
  });

  const [sessionManualMode, setSessionManualMode] = useState(false);
  const [generalFiles, setGeneralFiles] = useState([]);
  const [dibhFiles, setDibhFiles] = useState([]);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ name: false, birth_date: false });

  useEffect(() => {
    setFormData((prev) => ({ ...prev, patient_code: nextPatientCode() }));
  }, []);

  const simulateUpload = useCallback((items, setList) => {
    items.forEach(({ id }) => {
      const tick = setInterval(() => {
        setList((prev) =>
          prev.map((f) =>
            f.id === id && f.status === 'uploading'
              ? { ...f, progress: Math.min(100, f.progress + 12 + Math.random() * 15) }
              : f
          )
        );
      }, 220);
      const doneAt = 800 + Math.random() * 900;
      setTimeout(() => {
        clearInterval(tick);
        setList((prev) =>
          prev.map((f) => (f.id === id ? { ...f, progress: 100, status: 'done' } : f))
        );
      }, doneAt);
    });
  }, []);

  const handleAddFiles = useCallback(
    (fileList, setList) => {
      const incoming = Array.from(fileList);
      const newItems = incoming.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'uploading',
      }));
      setList((prev) => [...prev, ...newItems]);
      simulateUpload(newItems, setList);
    },
    [simulateUpload]
  );

  const regenerateCode = () => {
    setFormData((prev) => ({ ...prev, patient_code: nextPatientCode() }));
  };

  const validateBasicInfo = () => {
    const nameInvalid = !formData.name.trim();
    const birthInvalid = !formData.birth_date;
    return { nameInvalid, birthInvalid, ok: !nameInvalid && !birthInvalid };
  };

  const hasUploadInProgress =
    generalFiles.some((f) => f.status === 'uploading') ||
    dibhFiles.some((f) => f.status === 'uploading');

  const generalReady = generalFiles.filter((f) => f.status === 'done' && f.file);
  const dibhReady = dibhFiles.filter((f) => f.status === 'done' && f.file);
  const hasBothCategoriesForAnalysis = generalReady.length > 0 && dibhReady.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { nameInvalid, birthInvalid, ok } = validateBasicInfo();
    if (!ok) {
      setFieldErrors({ name: nameInvalid, birth_date: birthInvalid });
      setShowValidationModal(true);
      return;
    }
    setFieldErrors({ name: false, birth_date: false });

    if (hasUploadInProgress) {
      toast({
        title: '업로드 진행 중입니다',
        description: '모든 파일의 업로드가 완료된 뒤 등록 완료를 눌러 주세요. 진행 중에는 파일이 DB에 저장되지 않습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (!hasBothCategoriesForAnalysis) {
      const missing = [
        generalReady.length === 0 && '일반호흡',
        dibhReady.length === 0 && 'DIBH',
      ].filter(Boolean);
      toast({
        title: '호흡 데이터가 부족합니다',
        description: `분석할 파일 선택 화면에서는 일반호흡·DIBH 파일이 각각 필요합니다. 아직 없는 구역: ${missing.join(', ')}. 화면 위쪽(일반호흡)과 아래쪽(DIBH)에 각각 업로드해 주세요.`,
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    const general_breathing_files = generalFiles
      .filter((f) => f.status === 'done')
      .map(({ name, size }) => ({ name, size }));
    const dibh_files = dibhFiles.filter((f) => f.status === 'done').map(({ name, size }) => ({ name, size }));

    try {
      const newPatient = Patient.create({
        name: formData.name,
        birth_date: formData.birth_date,
        gender: formData.gender,
        treatment_session_count: formData.treatment_session_count,
        patient_code: formData.patient_code,
        general_breathing_files,
        dibh_files,
        expected_treatment_date: '',
        treatment_method: '',
        breathing_method: '',
      });

      const generalDone = generalReady;
      const dibhDone = dibhReady;
      for (const f of generalDone) {
        await createBreathingFile({
          patientId: newPatient.id,
          category: 'general',
          file: f.file,
        });
      }
      for (const f of dibhDone) {
        await createBreathingFile({
          patientId: newPatient.id,
          category: 'dibh',
          file: f.file,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ['breathingFiles'] });
      await queryClient.invalidateQueries({ queryKey: ['patient', newPatient.id] });

      navigate(`${createPageUrl('AnalysisFileSelect')}?patientId=${encodeURIComponent(newPatient.id)}`);
    } catch (err) {
      console.error('NewPatient: save failed', err);
      toast({
        title: '저장에 실패했습니다',
        description: err instanceof Error ? err.message : String(err),
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
                <Label htmlFor="new-birth-date" className="text-[#8B949E] mb-2 block font-medium">
                  생년월일
                </Label>
                <div
                  className="relative cursor-pointer"
                  onClick={() => { try { birthDateInputRef.current?.showPicker?.(); } catch { birthDateInputRef.current?.click(); } }}
                >
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8B949E] pointer-events-none z-10" />
                  <Input
                    id="new-birth-date"
                    ref={birthDateInputRef}
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) => {
                      setFormData({ ...formData, birth_date: e.target.value });
                      if (fieldErrors.birth_date) setFieldErrors((prev) => ({ ...prev, birth_date: false }));
                    }}
                    aria-invalid={fieldErrors.birth_date}
                    className={cn(
                      'pl-12 h-12 bg-[#0D1117] text-white focus:border-[#3B82F6] rounded-xl',
                      fieldErrors.birth_date
                        ? 'border-red-500 ring-1 ring-red-500/35 focus:border-red-500 focus-visible:ring-red-500/40'
                        : 'border-[#30363D]'
                    )}
                  />
                </div>
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
                <div className="flex gap-2">
                  <Input
                    id="new-patient-code"
                    value={formData.patient_code}
                    readOnly
                    className="h-12 flex-1 bg-[#0D1117] border-[#30363D] text-[#8B949E] rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 shrink-0 border-[#30363D] bg-transparent px-3 text-[#8B949E] hover:bg-[#30363D] hover:text-white sm:px-4"
                    onClick={regenerateCode}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    다시 생성하기
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <BreathingFileSection
            title="일반호흡 데이터 업로드(필수)"
            files={generalFiles}
            onAddFiles={(list) => handleAddFiles(list, setGeneralFiles)}
            onRemove={(id) => setGeneralFiles((prev) => prev.filter((f) => f.id !== id))}
            inputRef={generalFileInputRef}
          />

          <BreathingFileSection
            title="DIBH 데이터 업로드(필수)"
            files={dibhFiles}
            onAddFiles={(list) => handleAddFiles(list, setDibhFiles)}
            onRemove={(id) => setDibhFiles((prev) => prev.filter((f) => f.id !== id))}
            inputRef={dibhFileInputRef}
          />

          <div className="flex flex-col items-center justify-center mt-6 gap-2">
            {hasUploadInProgress && (
              <p className="text-center text-sm text-[#EAB308]">
                파일 업로드가 끝날 때까지 기다린 뒤 등록 완료를 눌러 주세요.
              </p>
            )}
            {!hasUploadInProgress && !hasBothCategoriesForAnalysis && (
              <p className="text-center text-sm text-[#EAB308]">
                일반호흡·DIBH 구역에 각각 최소 1개 파일을 올린 뒤 등록할 수 있습니다.
              </p>
            )}
            <Button
              type="submit"
              disabled={isLoading || hasUploadInProgress || !hasBothCategoriesForAnalysis}
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
      </div>
    </div>
  );
}
