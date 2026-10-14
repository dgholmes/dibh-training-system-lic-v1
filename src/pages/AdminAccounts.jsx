import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Unlock, ShieldCheck, ShieldAlert, UserCog, Eye, EyeOff, Users, ClipboardList, Database, KeyRound, MessageSquareWarning, X } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { UserStore } from '@/api/authStore';
import { tryWriteAuditLog, AUDIT_ACTIONS } from '@/api/auditStore';
import { validatePassword } from '@/lib/passwordUtils';
import { getCustomUsageNotice, setUsageNotice, resetUsageNotice, validateUsageNotice } from '@/api/usageNoticeStore';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { PRODUCT_CODE, PRODUCT_CODE_LABEL } from '@/config/product';

const ROLE_LABELS = { admin: '관리자', clinician: '임상의' };
const ROLE_COLORS = {
  admin: 'bg-[#8B5CF6]/15 text-[#A78BFA] border-[#8B5CF6]/30',
  clinician: 'bg-[#3B82F6]/15 text-[#60A5FA] border-[#3B82F6]/30',
};
const LIST_ACTION_BTN =
  'border-[#30363D] bg-transparent text-[#C9D1D9] shadow-none hover:bg-[#30363D] hover:text-white';

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

/** Blank create-account form. Shared by the initial state and the post-submit reset so
 *  the two cannot drift — dropping displayName here previously made the next create throw. */
const EMPTY_FORM = { username: '', displayName: '', password: '', role: 'clinician' };

export default function AdminAccounts() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPw, setResetPw] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetErrors, setResetErrors] = useState([]);
  const [resetting, setResetting] = useState(false);

  const reload = async () => setUsers(await UserStore.list());
  useEffect(() => { reload(); }, []);

  // ── Usage notice editor (IA-08) ─────────────────────────────────────────────
  const [noticeText, setNoticeText] = useState('');
  const [noticeErrors, setNoticeErrors] = useState([]);
  const [savingNotice, setSavingNotice] = useState(false);

  useEffect(() => { setNoticeText(getCustomUsageNotice() ?? ''); }, []);

  const handleSaveNotice = () => {
    const errors = validateUsageNotice(noticeText);
    if (errors.length) { setNoticeErrors(errors); return; }
    setSavingNotice(true);
    try {
      setUsageNotice(noticeText);
      tryWriteAuditLog({ action: AUDIT_ACTIONS.USAGE_NOTICE_UPDATED, targetType: 'system', detail: '시스템 사용 알림 문구 변경' });
      setNoticeErrors([]);
      toast({ title: '저장되었습니다', description: '로그인 화면에 새 공지 문구가 표시됩니다.' });
    } finally {
      setSavingNotice(false);
    }
  };

  const handleResetNotice = () => {
    resetUsageNotice();
    setNoticeText('');
    setNoticeErrors([]);
    tryWriteAuditLog({ action: AUDIT_ACTIONS.USAGE_NOTICE_UPDATED, targetType: 'system', detail: '기본 문구로 재설정' });
    toast({ title: '기본 문구로 재설정되었습니다' });
  };

  // ── Create user form ────────────────────────────────────────────────────────
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPw, setShowPw] = useState(false);
  const [formErrors, setFormErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    const pwErrors = validatePassword(form.password);
    if (!form.username.trim()) { setFormErrors(['아이디를 입력하세요.']); return; }
    if (!/^[a-zA-Z0-9_.\-]{2,30}$/.test(form.username.trim())) {
      setFormErrors(['아이디는 영문·숫자·_.- 만 사용 가능하며 2~30자여야 합니다.']); return;
    }
    if (pwErrors.length) { setFormErrors(pwErrors); return; }
    setSaving(true);
    try {
      const created = await UserStore.create({ username: form.username.trim(), displayName: form.displayName.trim(), password: form.password, role: form.role });
      tryWriteAuditLog({ action: AUDIT_ACTIONS.USER_CREATED, targetType: 'user', targetId: created.id, detail: `username: ${created.username}, role: ${created.role}` });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      setFormErrors([]);
      await reload();
    } catch (err) {
      setFormErrors([err.message]);
    } finally {
      setSaving(false);
    }
  };

  const handleRoleToggle = async (user) => {
    const newRole = user.role === 'admin' ? 'clinician' : 'admin';
    // Prevent removing last admin
    if (user.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) {
      alert('마지막 관리자 계정의 권한은 변경할 수 없습니다.');
      return;
    }
    try {
      await UserStore.setRole(user.id, newRole);
      tryWriteAuditLog({ action: AUDIT_ACTIONS.USER_ROLE_CHANGED, targetType: 'user', targetId: user.id, detail: `username: ${user.username}, role: ${user.role} → ${newRole}` });
      await reload();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUnlock = async (user) => {
    try {
      await UserStore.unlock(user.id);
      tryWriteAuditLog({ action: AUDIT_ACTIONS.USER_UNLOCKED, targetType: 'user', targetId: user.id, detail: `username: ${user.username}` });
      await reload();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async () => {
    // The dialog stays mounted while the delete is in flight, so a second tap used to
    // re-enter this after setDeleteTarget(null) and dereference null. Take the target
    // once and refuse re-entry.
    const target = deleteTarget;
    if (!target || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await UserStore.delete(target.id);
      tryWriteAuditLog({ action: AUDIT_ACTIONS.USER_DELETED, targetType: 'user', targetId: target.id, detail: `username: ${target.username}` });
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      // Shown inside the dialog — a native alert() would surface an untranslated
      // JavaScript message to a clinical user.
      setDeleteError(err.message || '계정을 삭제하지 못했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    const pwErrors = validatePassword(resetPw);
    if (pwErrors.length) { setResetErrors(pwErrors); return; }
    setResetting(true);
    try {
      await UserStore.resetPassword(resetTarget.id, resetPw);
      tryWriteAuditLog({
        action: AUDIT_ACTIONS.PASSWORD_RESET_BY_ADMIN,
        targetType: 'user',
        targetId: resetTarget.id,
        detail: `username: ${resetTarget.username} — 관리자에 의한 비밀번호 초기화`,
      });
      setResetTarget(null);
      setResetPw('');
      setResetErrors([]);
    } catch (err) {
      setResetErrors([err.message]);
    } finally {
      setResetting(false);
    }
  };

  const isLocked = (u) => u.lockedUntil && new Date(u.lockedUntil) > new Date();

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-24">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="sticky top-0 z-20 mb-6 flex items-center gap-3 bg-[#0D1117] py-1">
          <Link to="/home">
            <Button variant="ghost" size="icon" className="text-[#8B949E] hover:bg-[#1C2128] hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">계정 관리</h1>
            <p className="text-xs text-[#8B949E]">관리자 전용 — 사용자 계정 생성·수정·삭제</p>
          </div>
          <Button
            onClick={() => { setShowCreate(true); setFormErrors([]); }}
            className="gap-2 bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white"
          >
            <Plus className="h-4 w-4" />
            계정 추가
          </Button>
        </div>

        <AdminNav />

        {/* User list */}
        <div className="overflow-hidden rounded-2xl border border-[#30363D] bg-[#1C2128]">
          <div className="border-b border-[#30363D] px-5 py-3">
            <h2 className="text-sm font-semibold text-[#C9D1D9]">등록된 계정 ({users.length})</h2>
          </div>
          {users.length === 0 ? (
            <div className="py-16 text-center text-sm text-[#8B949E]">계정이 없습니다.</div>
          ) : (
            <ul className="divide-y divide-[#30363D]">
              {users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#30363D]">
                    <UserCog className="h-4 w-4 text-[#8B949E]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{u.displayName || u.username}</span>
                      {u.displayName && u.displayName !== u.username && (
                        <span className="text-xs text-[#8B949E]">({u.username})</span>
                      )}
                      {u.id === session?.userId && (
                        <span className="rounded-full bg-[#22C55E]/15 px-2 py-0.5 text-[10px] font-medium text-[#22C55E]">나</span>
                      )}
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', ROLE_COLORS[u.role] || ROLE_COLORS.clinician)}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                      {u.mustChangePassword && (
                        <span className="rounded-full bg-[#EAB308]/15 px-2 py-0.5 text-[10px] font-medium text-[#EAB308]">비밀번호 변경 필요</span>
                      )}
                      {isLocked(u) && (
                        <span className="rounded-full bg-[#EF4444]/15 px-2 py-0.5 text-[10px] font-medium text-[#EF4444]">잠금</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-[#8B949E]">
                      생성: {u.createdAt ? format(new Date(u.createdAt), 'yyyy.MM.dd') : '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {isLocked(u) && (
                      <Button size="sm" variant="outline" onClick={() => handleUnlock(u)}
                        className={cn('gap-1', LIST_ACTION_BTN)}>
                        <Unlock className="h-3.5 w-3.5" /> 잠금해제
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleRoleToggle(u)}
                      className={cn('gap-1.5', LIST_ACTION_BTN)}>
                      {u.role === 'admin' ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      <span>역할 변경</span>
                    </Button>
                    {u.id !== session?.userId && (
                      <Button size="sm" variant="outline"
                        onClick={() => { setResetTarget(u); setResetPw(''); setResetErrors([]); setShowResetPw(false); }}
                        className={cn('gap-1.5', LIST_ACTION_BTN)}>
                        <KeyRound className="h-3.5 w-3.5" />
                        <span>비밀번호 초기화</span>
                      </Button>
                    )}
                    {u.id !== session?.userId && (
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(u)}
                        className={cn('gap-1.5', LIST_ACTION_BTN)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>삭제</span>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Usage notice editor (IA-08) */}
        <div className="mt-6 rounded-2xl border border-[#30363D] bg-[#1C2128] p-6">
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-white">
            <MessageSquareWarning className="h-4 w-4 text-[#EAB308]" /> 시스템 사용 알림 문구
          </h2>
          <p className="mb-4 text-sm text-[#8B949E]">
            로그인 화면에 표시되는 사전 접속 안내 문구입니다. 비워두면 기본 문구가 표시됩니다. (최대 1000자)
          </p>
          <Textarea
            value={noticeText}
            onChange={(e) => setNoticeText(e.target.value)}
            placeholder="비워두면 기본 문구가 표시됩니다."
            rows={5}
            className="rounded-xl border-[#30363D] bg-[#0D1117] text-white"
          />
          {noticeErrors.length > 0 && (
            <div className="mt-3 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#FCA5A5]">
              {noticeErrors.map((e) => <p key={e}>{e}</p>)}
            </div>
          )}
          <div className="mt-4 flex gap-3">
            <Button variant="outline" onClick={handleResetNotice}
              className="border-[#30363D] bg-transparent text-[#C9D1D9] hover:bg-[#30363D] hover:text-white">
              기본값으로 재설정
            </Button>
            <Button onClick={handleSaveNotice} disabled={savingNotice}
              className="gap-2 bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white">
              {savingNotice ? '저장 중…' : '저장'}
            </Button>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-[#8B949E]">
          DIBH - Flow v{__APP_VERSION__} &nbsp;·&nbsp; {PRODUCT_CODE_LABEL} {PRODUCT_CODE}
        </p>
      </div>

      {/* Create account modal */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); setFormErrors([]); }}>
        <DialogContent hideClose className="max-w-md border border-[#30363D] bg-[#1C2128] p-0 text-white sm:rounded-2xl">
          <DialogTitle className="sr-only">계정 추가</DialogTitle>
          <DialogDescription className="sr-only">새 사용자 계정을 생성합니다.</DialogDescription>
          <form onSubmit={handleCreate} className="pb-6">
            <div className="flex items-center justify-between border-b border-[#30363D] px-6 py-4">
              <p className="font-semibold text-[#C9D1D9]">새 계정 추가</p>
              <button type="button" onClick={() => setShowCreate(false)} aria-label="닫기"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#8B949E] transition-colors hover:bg-[#30363D] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-6 pt-5">
              <div>
                <Label className="mb-1.5 block text-sm text-[#8B949E]">아이디</Label>
                <Input value={form.username ?? ''} onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="영문/숫자" autoComplete="off"
                  className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] text-white" />
              </div>
              <div>
                <Label className="mb-1.5 block text-sm text-[#8B949E]">실명 (담당의사 표시명)</Label>
                <Input value={form.displayName ?? ''} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="예: 김철수" autoComplete="off"
                  className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] text-white" />
                <p className="mt-1 text-xs text-[#8B949E]">환자 차트의 '담당 의사'란에 표시됩니다. 비워두면 아이디로 대체됩니다.</p>
              </div>
              <div>
                <Label className="mb-1.5 block text-sm text-[#8B949E]">초기 비밀번호</Label>
                <div className="relative">
                  <Input type={showPw ? 'text' : 'password'} value={form.password ?? ''}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    autoComplete="new-password"
                    className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] pr-11 text-white" />
                  <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B949E] hover:text-white">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-[#8B949E]">8자 이상, 대소문자·숫자·특수문자 포함 — 첫 로그인 시 변경 강제</p>
              </div>
              <div>
                <Label className="mb-1.5 block text-sm text-[#8B949E]">역할</Label>
                <div className="flex gap-2">
                  {[{ v: 'clinician', l: '임상의' }, { v: 'admin', l: '관리자' }].map(({ v, l }) => (
                    <button key={v} type="button" onClick={() => setForm({ ...form, role: v })}
                      className={cn('flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
                        form.role === v ? 'border-[#3B82F6] bg-[#3B82F6]/10 text-white' : 'border-[#30363D] bg-[#0D1117] text-[#8B949E] hover:border-[#8B949E]/50')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {formErrors.length > 0 && (
                <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#FCA5A5]">
                  {formErrors.map((e) => <p key={e}>{e}</p>)}
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-3 px-6">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}
                className="h-12 flex-1 rounded-xl border-[#30363D] bg-[#0D1117] text-white hover:bg-[#252A32]">취소</Button>
              <Button type="submit" disabled={saving}
                className="h-12 flex-1 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] font-semibold text-white">
                {saving ? '생성 중…' : '계정 생성'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset password modal */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setResetErrors([]); } }}>
        <DialogContent hideClose className="max-w-md border border-[#30363D] bg-[#1C2128] p-0 text-white sm:rounded-2xl">
          <DialogTitle className="sr-only">비밀번호 초기화</DialogTitle>
          <DialogDescription className="sr-only">관리자가 해당 계정의 비밀번호를 초기화합니다. 대상 사용자는 다음 로그인 시 비밀번호를 변경해야 합니다.</DialogDescription>
          <form onSubmit={handleReset} className="pb-6">
            <div className="flex items-center justify-between border-b border-[#30363D] px-6 py-4">
              <p className="font-semibold text-[#C9D1D9]">[{resetTarget?.username}] 비밀번호 초기화</p>
              <button type="button" onClick={() => setResetTarget(null)} aria-label="닫기"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#8B949E] transition-colors hover:bg-[#30363D] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-6 pt-5">
              <div className="rounded-xl border border-[#EAB308]/30 bg-[#EAB308]/10 px-4 py-3 text-xs text-[#EAB308]">
                ⚠ 초기화된 비밀번호로 설정됩니다. 해당 사용자는 다음 로그인 시 비밀번호를 반드시 변경해야 합니다.
              </div>
              <div>
                <Label className="mb-1.5 block text-sm text-[#8B949E]">새 임시 비밀번호</Label>
                <div className="relative">
                  <Input type={showResetPw ? 'text' : 'password'} value={resetPw}
                    onChange={(e) => setResetPw(e.target.value)}
                    autoComplete="new-password"
                    className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] pr-11 text-white" />
                  <button type="button" tabIndex={-1} onClick={() => setShowResetPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B949E] hover:text-white">
                    {showResetPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-[#8B949E]">8자 이상, 대소문자·숫자·특수문자 포함</p>
              </div>
              {resetErrors.length > 0 && (
                <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#FCA5A5]">
                  {resetErrors.map((e) => <p key={e}>{e}</p>)}
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-3 px-6">
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}
                className="h-12 flex-1 rounded-xl border-[#30363D] bg-[#0D1117] text-white hover:bg-[#252A32]">취소</Button>
              <Button type="submit" disabled={resetting}
                className="h-12 flex-1 rounded-xl bg-gradient-to-r from-[#EAB308] to-[#F59E0B] font-semibold text-black">
                {resetting ? '처리 중…' : '비밀번호 초기화'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteError(''); } }}>
        <DialogContent hideClose className="max-w-sm border border-[#30363D] bg-[#1C2128] p-0 shadow-2xl sm:rounded-2xl">
          <DialogTitle className="sr-only">계정 삭제</DialogTitle>
          <DialogDescription className="sr-only">선택한 계정을 영구적으로 삭제합니다.</DialogDescription>
          <div className="h-1 w-full bg-[#EF4444]/90" />
          <div className="px-6 pb-6 pt-8 text-center">
            <p className="text-base font-bold text-white">[{deleteTarget?.username}] 계정을 삭제하시겠습니까?</p>
            <p className="mt-3 text-sm text-[#8B949E]">삭제된 계정은 복구할 수 없습니다.</p>
            {deleteError && (
              <p className="mt-4 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-sm text-[#F85149]">
                {deleteError}
              </p>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="outline" disabled={deleting} onClick={() => { setDeleteTarget(null); setDeleteError(''); }}
                className="h-12 rounded-xl border-[#30363D] bg-[#252A32] text-white hover:bg-[#30363D]">취소</Button>
              <Button onClick={handleDelete} disabled={deleting}
                className="h-12 rounded-xl bg-[#EF4444] font-semibold text-white hover:bg-[#DC2626] disabled:opacity-60">
                {deleting ? '삭제 중…' : '삭제'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
