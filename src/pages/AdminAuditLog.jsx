import { useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { ArrowLeft, Search, ShieldCheck, Users, ClipboardList, Database, AlertTriangle, Bug } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SECURITY_DEBUG } from '@/lib/securityDebug';

function AdminNav() {
  const { pathname } = useLocation();
  const tabs = [
    { to: '/admin/accounts', label: '계정 관리', icon: Users },
    { to: '/admin/auditlog', label: '감사 로그', icon: ClipboardList },
    { to: '/admin/backup', label: '백업/복구', icon: Database },
  ];
  return (
    <div className="mb-6 flex gap-1 rounded-xl border border-[#30363D] bg-[#1C2128] p-1">
      {tabs.map(({ to, label, icon: Icon }) => (
        <Link key={to} to={to}
          className={cn('flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            pathname === to
              ? 'bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white'
              : 'text-[#8B949E] hover:bg-[#30363D] hover:text-white')}>
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </div>
  );
}
import { getAuditLogEntries, getAuditLogCapacity, seedDebugAuditEntries, verifyAuditChain } from '@/api/auditStore';
import { format } from 'date-fns';

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

// Table row height is fixed by the Tailwind classes below (px-4 py-2.5/py-3
// with text-sm/text-xs) — both header and body rows render at ~40px.
const ROW_HEIGHT_PX = 40;
const MIN_PAGE_SIZE = 5;
const DEFAULT_PAGE_SIZE = 10;
// Space reserved below the table: pagination controls + version footer + page bottom padding (p-6 = 24px).
const RESERVED_BELOW_TABLE_PX = 130;

const ACTION_COLORS = {
  LOGIN: 'text-[#22C55E]',
  LOGOUT: 'text-[#8B949E]',
  SESSION_TIMEOUT: 'text-[#8B949E]',
  LOGIN_FAILED: 'text-[#EAB308]',
  ACCOUNT_LOCKED: 'text-[#EF4444]',
  USER_CREATED: 'text-[#3B82F6]',
  USER_DELETED: 'text-[#EF4444]',
  USER_ROLE_CHANGED: 'text-[#A78BFA]',
  USER_UNLOCKED: 'text-[#22C55E]',
  PASSWORD_CHANGED: 'text-[#EAB308]',
  PASSWORD_RESET_BY_ADMIN: 'text-[#EAB308]',
  PATIENT_CREATED: 'text-[#3B82F6]',
  PATIENT_UPDATED: 'text-[#8B949E]',
  PATIENT_DELETED: 'text-[#EF4444]',
  FILE_UPLOADED: 'text-[#3B82F6]',
  FILE_DELETED: 'text-[#EF4444]',
  ANALYSIS_RUN: 'text-[#A78BFA]',
  CALIBRATION_DELETED: 'text-[#EF4444]',
  BACKUP_CREATED: 'text-[#3B82F6]',
  BACKUP_CREATE_FAILED: 'text-[#EF4444]',
  BACKUP_RESTORED: 'text-[#22C55E]',
  BACKUP_RESTORE_FAILED: 'text-[#EF4444]',
  DEIDENTIFIED_EXPORT: 'text-[#3B82F6]',
  DEIDENTIFIED_EXPORT_FAILED: 'text-[#EF4444]',
  USAGE_NOTICE_UPDATED: 'text-[#A78BFA]',
  DEBUG_SEED_ENTRY: 'text-[#8B949E]',
  INTEGRITY_CHECK_FAILED: 'text-[#EF4444]',
};

export default function AdminAuditLog() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [refreshKey, setRefreshKey] = useState(0);
  const [chainStatus, setChainStatus] = useState(null); // null = not yet checked this session
  const [verifyingChain, setVerifyingChain] = useState(false);

  const handleVerifyChain = async () => {
    setVerifyingChain(true);
    try {
      const result = await verifyAuditChain();
      setChainStatus(result);
    } finally {
      setVerifyingChain(false);
    }
  };

  const tableWrapRef = useRef(null);

  // Fit as many rows as the current viewport allows below the table's
  // position on the page, so the whole page never needs to scroll.
  const recalcPageSize = useCallback(() => {
    const el = tableWrapRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const available = window.innerHeight - top - RESERVED_BELOW_TABLE_PX - ROW_HEIGHT_PX /* header row */;
    const fit = Math.floor(available / ROW_HEIGHT_PX);
    setPageSize((prev) => {
      const next = Math.max(MIN_PAGE_SIZE, fit);
      return prev === next ? prev : next;
    });
  }, []);

  useLayoutEffect(() => {
    recalcPageSize();
  });

  useLayoutEffect(() => {
    let timeoutId;
    const onResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(recalcPageSize, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(timeoutId);
    };
  }, [recalcPageSize]);

  const { entries, total } = useMemo(
    () => getAuditLogEntries({ search, limit: pageSize, offset: page * pageSize }),
    [search, page, pageSize, refreshKey]
  );

  const capacity = useMemo(() => getAuditLogCapacity(), [total, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useLayoutEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const handleSearch = (v) => { setSearch(v); setPage(0); };

  const handleDebugSeed = async () => {
    await seedDebugAuditEntries(10_000);
    setPage(0);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="bg-[#0D1117] p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="sticky top-0 z-20 mb-6 flex items-center gap-3 bg-[#0D1117] py-1">
          <Link to="/home">
            <Button variant="ghost" size="icon" className="text-[#8B949E] hover:bg-[#1C2128] hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">감사 로그</h1>
            <p className="text-xs text-[#8B949E]">읽기 전용 — 관리자 전용 (TRE-01)</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#22C55E]" />
            <span className="text-xs font-medium text-[#22C55E]">읽기 전용</span>
          </div>
          {SECURITY_DEBUG && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDebugSeed}
              className="ml-2 gap-1.5 border-[#EF4444]/40 bg-transparent text-[#EF4444] shadow-none hover:bg-[#EF4444]/10"
            >
              <Bug className="h-3.5 w-3.5" />
              디버그: 10,000건 생성
            </Button>
          )}
        </div>

        <AdminNav />

        {/* UC-07 — Audit log hash-chain integrity */}
        <div className="mb-4 flex items-center justify-between rounded-xl border border-[#30363D] bg-[#1C2128] px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            {chainStatus == null ? (
              <span className="text-[#8B949E]">체인 무결성: 검증 필요 (UC-07)</span>
            ) : chainStatus.valid ? (
              <span className="flex items-center gap-1.5 text-[#22C55E]">
                <ShieldCheck className="h-4 w-4" />
                체인 무결성: 정상 ({chainStatus.checkedCount.toLocaleString()}건 검증)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[#EF4444]">
                <AlertTriangle className="h-4 w-4" />
                체인 무결성 손상 — 항목 #{chainStatus.brokenAtIndex} (id: {chainStatus.brokenAtId})
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={handleVerifyChain} disabled={verifyingChain}
            className="border-[#30363D] bg-transparent text-[#C9D1D9] shadow-none hover:bg-[#30363D] hover:text-white">
            {verifyingChain ? '검증 중…' : '지금 검증'}
          </Button>
        </div>

        {/* UC-05 — Capacity warnings (entry count + device storage) */}
        {(capacity.pct >= 80 || capacity.storagePct >= 80) && (() => {
          const isCritical = capacity.pct >= 90 || capacity.storagePct >= 90;
          return (
            <div className={cn(
              'mb-4 flex items-start gap-3 rounded-xl border px-4 py-3',
              isCritical
                ? 'border-[#EF4444]/40 bg-[#EF4444]/10 text-[#EF4444]'
                : 'border-[#EAB308]/40 bg-[#EAB308]/10 text-[#EAB308]'
            )}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-0.5 text-sm">
                <p className="font-semibold">
                  {isCritical ? '감사 로그 저장 공간 부족 (UC-05)' : '감사 로그 저장 공간 경고 (UC-05)'}
                </p>
                {capacity.pct >= 80 && (
                  <p className="text-xs opacity-80">
                    로그 항목: {capacity.count.toLocaleString()} / {capacity.max.toLocaleString()}건 ({capacity.pct}%)
                    {capacity.pct >= 90 && ' — 오래된 항목이 자동 삭제됩니다.'}
                  </p>
                )}
                {capacity.storagePct >= 80 && (
                  <p className="text-xs opacity-80">
                    기기 저장소: {fmtBytes(capacity.totalBytes)} 사용 중 (감사 로그 {fmtBytes(capacity.auditBytes)})
                    {capacity.storagePct >= 90 && ' — 저장소 용량이 부족합니다.'}
                  </p>
                )}
                {isCritical && <p className="text-xs font-medium">백업 후 데이터를 내보내기하세요.</p>}
              </div>
            </div>
          );
        })()}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B949E]" />
          <input type="text" placeholder="사용자명, 액션, 날짜 검색…" value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-12 w-full rounded-xl border border-[#30363D] bg-[#1C2128] pl-11 pr-4 text-sm text-white placeholder:text-[#8B949E] outline-none focus:border-[#3B82F6]" />
        </div>

        <p className="mb-3 text-xs text-[#8B949E]">
          총 {total.toLocaleString()}건 · 페이지 {page + 1}/{totalPages}
          <span className="ml-3 opacity-60">· 감사 로그 {fmtBytes(capacity.auditBytes)} · 저장소 전체 {fmtBytes(capacity.totalBytes)}</span>
        </p>

        {/* Log table */}
        <div ref={tableWrapRef} className="overflow-hidden rounded-2xl border border-[#30363D] bg-[#1C2128]">
          {entries.length === 0 ? (
            <div className="py-16 text-center text-sm text-[#8B949E]">
              {search ? '검색 결과가 없습니다.' : '기록된 감사 로그가 없습니다.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#30363D] bg-[#0D1117]/80 text-xs text-[#8B949E]">
                    <th className="px-4 py-3 font-medium">일시</th>
                    <th className="px-4 py-3 font-medium">사용자</th>
                    <th className="px-4 py-3 font-medium">액션</th>
                    <th className="px-4 py-3 font-medium">대상</th>
                    <th className="px-4 py-3 font-medium">상세</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-[#30363D]/60 last:border-0 hover:bg-[#0D1117]/40">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-[#8B949E]">
                        {e.timestamp ? format(new Date(e.timestamp), 'MM.dd HH:mm:ss') : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-[#C9D1D9]">{e.username || '—'}</td>
                      <td className={cn('whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium', ACTION_COLORS[e.action] || 'text-[#C9D1D9]')}>
                        {e.action}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#8B949E]">
                        {e.targetType ? `${e.targetType}` : '—'}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-xs text-[#8B949E]" title={e.detail || ''}>
                        {e.detail || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="border-[#30363D] bg-[#1C2128] text-white hover:bg-[#30363D]">
              이전
            </Button>
            <span className="text-sm text-[#8B949E]">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="border-[#30363D] bg-[#1C2128] text-white hover:bg-[#30363D]">
              다음
            </Button>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-[#8B949E]">DIBH - Flow v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}
