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
import { exportDbBinaryBase64, importDbBinaryBase64 } from '@/db/sqliteDb';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { format } from 'date-fns';
import { PRODUCT_CODE, PRODUCT_CODE_LABEL } from '@/config/product';

/**
 * Saves export data to the native Documents directory on Android. `@capacitor/filesystem`
 * has no real-filesystem web implementation — in a browser it silently writes into an
 * IndexedDB shim instead of producing a retrievable file, so on the web this falls back
 * to the pre-Filesystem Blob + <a download> approach for local/dev testing.
 */
async function saveExportFile(fileName, data, mimeType) {
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: fileName,
      data,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return `기기 내 Documents/${fileName}`;
  }
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return `다운로드 폴더/${fileName}`;
}

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

const COLOR_ACTION_BTN = {
  blue: 'border-[#3B82F6]/40 bg-transparent text-[#3B82F6] shadow-none hover:border-[#3B82F6]/70 hover:bg-[#3B82F6]/10 hover:text-[#3B82F6]',
  green: 'border-[#22C55E]/40 bg-transparent text-[#22C55E] shadow-none hover:border-[#22C55E]/70 hover:bg-[#22C55E]/10 hover:text-[#22C55E]',
  purple: 'border-[#A78BFA]/40 bg-transparent text-[#A78BFA] shadow-none hover:border-[#A78BFA]/70 hover:bg-[#A78BFA]/10 hover:text-[#A78BFA]',
};

const BACKUP_KEYS = ['dibh_patients', 'dibh_calibrations', 'dibh_training_sessions', 'dibh_audit_log', 'dibh_users', 'dibh_calibration_sessions'];
const BACKUP_FORMAT_VERSION = 2;

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

export async function createBackup() {
  const payload = {};
  for (const key of BACKUP_KEYS) {
    const raw = localStorage.getItem(key);
    payload[key] = raw ? JSON.parse(raw) : [];
  }
  payload._created_at = new Date().toISOString();
  payload._version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
  payload._backup_format_version = BACKUP_FORMAT_VERSION;
  payload._sqlite_blob_base64 = await exportDbBinaryBase64();

  const json = JSON.stringify(payload);
  const hash = await sha256Hex(new TextEncoder().encode(json).buffer);
  const envelope = JSON.stringify({ hash, data: json });
  const encrypted = await encryptValue(envelope);
  return encrypted;
}

export async function restoreBackup(encryptedText) {
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
  if (payload._backup_format_version >= 2 && payload._sqlite_blob_base64) {
    await importDbBinaryBase64(payload._sqlite_blob_base64);
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
      const fileName = `dibh-backup-${format(new Date(), 'yyyyMMdd-HHmmss')}.enc`;
      const location = await saveExportFile(fileName, encrypted, 'text/plain');
      tryWriteAuditLog({ action: AUDIT_ACTIONS.BACKUP_CREATED, targetType: 'system', detail: `암호화된 백업 생성됨: ${fileName}` });
      setStatus({ type: 'success', message: `백업 파일이 생성되었습니다. (${location})` });
    } catch (err) {
      console.error('[AdminBackup] export failed:', err);
      tryWriteAuditLog({ action: AUDIT_ACTIONS.BACKUP_CREATE_FAILED, targetType: 'system', detail: err.message || String(err) });
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
      const fileName = `dibh-deidentified-${format(new Date(), 'yyyyMMdd')}.csv`;
      const location = await saveExportFile(fileName, '﻿' + csv, 'text/csv;charset=utf-8'); // BOM for Excel UTF-8 compatibility
      tryWriteAuditLog({ action: AUDIT_ACTIONS.DEIDENTIFIED_EXPORT, targetType: 'system', detail: `${decrypted.length}명 비식별 내보내기: ${fileName}` });
      setStatus({ type: 'success', message: `비식별 데이터가 내보내졌습니다 (${decrypted.length}명, ${location}). 이름·생년월일은 포함되지 않습니다.` });
    } catch (err) {
      console.error('[AdminBackup] de-identified export failed:', err);
      tryWriteAuditLog({ action: AUDIT_ACTIONS.DEIDENTIFIED_EXPORT_FAILED, targetType: 'system', detail: err.message || String(err) });
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
      tryWriteAuditLog({
        action: AUDIT_ACTIONS.BACKUP_RESTORE_FAILED,
        targetType: 'system',
        detail: isKeyMismatch ? '설치 키 불일치(다른 기기에서 생성된 백업)' : (err.message || String(err)),
      });
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
        <div className="sticky top-0 z-20 mb-6 flex items-center gap-3 bg-[#0D1117] py-1">
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-white">
                  <Download className="h-4 w-4 text-[#3B82F6]" /> 데이터 백업 (내보내기)
                </h2>
                <p className="text-sm text-[#8B949E]">
                  모든 환자·캘리브레이션·감사 로그를 AES-256으로 암호화한 파일로 내보냅니다.
                  백업 중에는 시스템 사용에 영향을 주지 않습니다.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}
                className={cn('shrink-0 gap-1.5', COLOR_ACTION_BTN.blue)}>
                <Download className="h-3.5 w-3.5" />
                <span>{exporting ? '생성 중…' : '백업 파일 생성'}</span>
              </Button>
            </div>
          </div>

          {/* De-identified export (DC-02) */}
          <div className="rounded-2xl border border-[#30363D] bg-[#1C2128] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-white">
                  <FileDown className="h-4 w-4 text-[#22C55E]" /> 비식별 데이터 내보내기 (DC-02)
                </h2>
                <p className="text-sm text-[#8B949E]">
                  이름·생년월일을 제외한 캘리브레이션 결과를 CSV로 내보냅니다.
                  환자 코드·성별·치료회차·분석결과만 포함됩니다.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={handleDeidentifiedExport} disabled={deidentifying}
                className={cn('shrink-0 gap-1.5', COLOR_ACTION_BTN.green)}>
                <FileDown className="h-3.5 w-3.5" />
                <span>{deidentifying ? '생성 중…' : '비식별 CSV 내보내기'}</span>
              </Button>
            </div>
          </div>

          {/* Import */}
          <div className="rounded-2xl border border-[#30363D] bg-[#1C2128] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
              <div className="flex-1">
                <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-white">
                  <Upload className="h-4 w-4 text-[#A78BFA]" /> 데이터 복구 (가져오기)
                </h2>
                <p className="text-sm text-[#8B949E]">
                  이전에 생성한 백업 파일(.enc)을 불러와 복구합니다.
                  무결성 검증 후 적용되며, 현재 데이터를 덮어씁니다.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                <span className="text-right text-xs text-[#EAB308]">⚠ 복구 시 현재 저장된 데이터가 백업 시점으로 대체됩니다.</span>
                <label className={cn('inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors',
                  COLOR_ACTION_BTN.purple,
                  importing ? 'pointer-events-none opacity-50' : 'cursor-pointer')}>
                  <Upload className="h-3.5 w-3.5" />
                  <span>{importing ? '복구 중…' : '백업 파일 선택'}</span>
                  <input type="file" accept=".enc" className="hidden" disabled={importing} onChange={handleImport} />
                </label>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-[#8B949E]">
          DIBH - Flow v{__APP_VERSION__} &nbsp;·&nbsp; {PRODUCT_CODE_LABEL} {PRODUCT_CODE}
        </p>
      </div>
    </div>
  );
}
