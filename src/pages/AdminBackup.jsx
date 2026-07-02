/**
 * Encrypted backup & restore — MFDS RA-02, RA-03
 * Exports all patient + calibration data as an AES-256-GCM encrypted JSON file.
 * The backup itself is encrypted with the same installation key used for PII storage,
 * plus a SHA-256 integrity hash so tampering is detected on restore.
 */
import { useState } from 'react';
import { ArrowLeft, Download, Upload, ShieldCheck, Users, ClipboardList, FileDown } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { encryptValue, decryptValue, sha256Hex, decryptPatient } from '@/lib/crypto';
import { tryWriteAuditLog, AUDIT_ACTIONS } from '@/api/auditStore';
import { format } from 'date-fns';

function AdminNav() {
  const { pathname } = useLocation();
  const tabs = [
    { to: '/admin/accounts', label: '계정 관리', icon: Users },
    { to: '/admin/auditlog', label: '감사 로그', icon: ClipboardList },
    { to: '/admin/backup', label: '백업/복구', icon: ShieldCheck },
  ];
  return (
    <div className="mb-6 flex gap-1 rounded-xl border border-[#30363D] bg-[#1C2128] p-1">
      {tabs.map(({ to, label, icon: Icon }) => (
        <Link key={to} to={to}
          className={cn('flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            pathname === to
              ? 'bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white'
              : 'text-[#8B949E] hover:bg-[#30363D] hover:text-white')}>
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </div>
  );
}

const BACKUP_KEYS = ['dibh_patients', 'dibh_calibrations', 'dibh_training_sessions', 'dibh_audit_log'];

/** SHA-256 hex of a string — used for pseudonymisation (DC-02) */
async function pseudonymize(value) {
  if (!value) return '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function createDeidentifiedCsv(patients, calibrations) {
  const rows = ['환자ID,환자코드,성별,치료회차,분석유형,DIBH유지시간(s),CV(%)'];
  for (const p of patients) {
    const cals = calibrations.filter(c => c.patient_id === p.id);
    if (cals.length === 0) {
      rows.push([p.id, p.patient_code, p.gender, p.treatment_session_count, '', '', ''].join(','));
    } else {
      for (const c of cals) {
        rows.push([p.id, p.patient_code, p.gender, p.treatment_session_count,
          c.training_type, c.dibh_duration ?? '', c.cv ?? ''].join(','));
      }
    }
  }
  return rows.join('\n');
}

async function createBackup() {
  const payload = {};
  for (const key of BACKUP_KEYS) {
    const raw = localStorage.getItem(key);
    payload[key] = raw ? JSON.parse(raw) : [];
  }
  payload._created_at = new Date().toISOString();
  payload._version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

  const json = JSON.stringify(payload);
  const hash = await sha256Hex(new TextEncoder().encode(json).buffer);
  const envelope = JSON.stringify({ hash, data: json });
  const encrypted = await encryptValue(envelope);
  return encrypted;
}

async function restoreBackup(encryptedText) {
  const envelopeJson = await decryptValue(encryptedText.trim());
  const envelope = JSON.parse(envelopeJson);
  const { hash, data } = envelope;

  const actualHash = await sha256Hex(new TextEncoder().encode(data).buffer);
  if (actualHash !== hash) {
    throw new Error('백업 파일의 무결성 검증에 실패했습니다. 파일이 손상되었거나 변조되었습니다.');
  }

  const payload = JSON.parse(data);
  for (const key of BACKUP_KEYS) {
    if (Array.isArray(payload[key])) {
      localStorage.setItem(key, JSON.stringify(payload[key]));
    }
  }
  return { created_at: payload._created_at, version: payload._version };
}

export default function AdminBackup() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deidentifying, setDeidentifying] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success'|'error', message }

  const handleExport = async () => {
    setExporting(true);
    setStatus(null);
    try {
      const encrypted = await createBackup();
      const blob = new Blob([encrypted], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dibh-backup-${format(new Date(), 'yyyyMMdd-HHmmss')}.enc`;
      a.click();
      URL.revokeObjectURL(url);
      tryWriteAuditLog({ action: AUDIT_ACTIONS.BACKUP_CREATED, targetType: 'system', detail: '암호화된 백업 생성됨' });
      setStatus({ type: 'success', message: '백업 파일이 생성되었습니다.' });
    } catch (err) {
      console.error('[AdminBackup] export failed:', err);
      setStatus({ type: 'error', message: '백업 생성에 실패했습니다.' });
    } finally {
      setExporting(false);
    }
  };

  const handleDeidentifiedExport = async () => {
    setDeidentifying(true);
    setStatus(null);
    try {
      const patients = JSON.parse(localStorage.getItem('dibh_patients') || '[]');
      const calibrations = JSON.parse(localStorage.getItem('dibh_calibrations') || '[]');
      // Decrypt patient PII first
      const decrypted = await Promise.all(patients.map(decryptPatient));
      const csv = await createDeidentifiedCsv(decrypted, calibrations);
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dibh-deidentified-${format(new Date(), 'yyyyMMdd')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      tryWriteAuditLog({ action: 'DEIDENTIFIED_EXPORT', targetType: 'system', detail: `${decrypted.length}명 비식별 내보내기` });
      setStatus({ type: 'success', message: `비식별 데이터가 내보내졌습니다 (${decrypted.length}명). 이름·생년월일은 포함되지 않습니다.` });
    } catch (err) {
      console.error('[AdminBackup] de-identified export failed:', err);
      setStatus({ type: 'error', message: '비식별 내보내기에 실패했습니다.' });
    } finally {
      setDeidentifying(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setStatus(null);
    try {
      const text = await file.text();
      const { created_at, version } = await restoreBackup(text);
      tryWriteAuditLog({ action: AUDIT_ACTIONS.BACKUP_RESTORED, targetType: 'system', detail: `복구됨: v${version}, ${created_at}` });
      setStatus({ type: 'success', message: `복구 완료 (백업일: ${created_at ? format(new Date(created_at), 'yyyy.MM.dd HH:mm') : '알 수 없음'}, v${version}). 새로고침하면 변경사항이 반영됩니다.` });
    } catch (err) {
      console.error('[AdminBackup] restore failed:', err);
      const isKeyMismatch = err instanceof DOMException && err.name === 'OperationError';
      setStatus({
        type: 'error',
        message: isKeyMismatch
          ? '복호화에 실패했습니다. 이 백업은 현재 설치 키와 다른 키로 암호화되어 있습니다. 백업을 생성한 기기에서만 복구할 수 있습니다.'
          : (err.message || '복구에 실패했습니다. 올바른 백업 파일인지 확인해 주세요.'),
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-24">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/home">
            <Button variant="ghost" size="icon" className="text-[#8B949E] hover:bg-[#1C2128] hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">백업 및 복구</h1>
            <p className="text-xs text-[#8B949E]">관리자 전용 — AES-256 암호화 백업 (RA-02, RA-03)</p>
          </div>
        </div>

        <AdminNav />

        {status && (
          <div className={cn('mb-6 rounded-xl border px-5 py-4 text-sm',
            status.type === 'success'
              ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]'
              : 'border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]')}>
            {status.message}
          </div>
        )}

        <div className="space-y-4">
          {/* Export */}
          <div className="rounded-2xl border border-[#30363D] bg-[#1C2128] p-6">
            <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-white">
              <Download className="h-4 w-4 text-[#3B82F6]" /> 데이터 백업 (내보내기)
            </h2>
            <p className="mb-5 text-sm text-[#8B949E]">
              모든 환자·캘리브레이션·감사 로그를 AES-256으로 암호화한 파일로 내보냅니다.
              백업 중에는 시스템 사용에 영향을 주지 않습니다.
            </p>
            <Button onClick={handleExport} disabled={exporting}
              className="gap-2 bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white">
              <Download className="h-4 w-4" />
              {exporting ? '생성 중…' : '백업 파일 생성'}
            </Button>
          </div>

          {/* De-identified export (DC-02) */}
          <div className="rounded-2xl border border-[#30363D] bg-[#1C2128] p-6">
            <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-white">
              <FileDown className="h-4 w-4 text-[#22C55E]" /> 비식별 데이터 내보내기 (DC-02)
            </h2>
            <p className="mb-5 text-sm text-[#8B949E]">
              이름·생년월일을 제외한 캘리브레이션 결과를 CSV로 내보냅니다.
              환자 코드·성별·치료회차·분석결과만 포함됩니다.
            </p>
            <Button onClick={handleDeidentifiedExport} disabled={deidentifying} variant="outline"
              className="gap-2 border-[#22C55E]/40 text-[#22C55E] hover:bg-[#22C55E]/10">
              <FileDown className="h-4 w-4" />
              {deidentifying ? '생성 중…' : '비식별 CSV 내보내기'}
            </Button>
          </div>

          {/* Import */}
          <div className="rounded-2xl border border-[#30363D] bg-[#1C2128] p-6">
            <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-white">
              <Upload className="h-4 w-4 text-[#A78BFA]" /> 데이터 복구 (가져오기)
            </h2>
            <p className="mb-2 text-sm text-[#8B949E]">
              이전에 생성한 백업 파일(.enc)을 불러와 복구합니다.
              무결성 검증 후 적용되며, 현재 데이터를 덮어씁니다.
            </p>
            <div className="mb-5 rounded-xl border border-[#EAB308]/30 bg-[#EAB308]/10 px-4 py-3 text-xs text-[#EAB308]">
              ⚠ 복구 시 현재 저장된 데이터가 백업 시점으로 대체됩니다.
            </div>
            <label className={cn('inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors',
              importing ? 'bg-[#30363D] opacity-60' : 'bg-[#8B5CF6] hover:bg-[#7C3AED]')}>
              <Upload className="h-4 w-4" />
              {importing ? '복구 중…' : '백업 파일 선택'}
              <input type="file" accept=".enc" className="hidden" disabled={importing} onChange={handleImport} />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
