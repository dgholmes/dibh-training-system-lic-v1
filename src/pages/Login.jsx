import { useState, useCallback } from 'react';
import { User, Lock, ArrowRight, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { UserStore } from '@/api/authStore';
import { tryWriteAuditLog, AUDIT_ACTIONS } from '@/api/auditStore';
import { validatePassword } from '@/lib/passwordUtils';
import { cn } from '@/lib/utils';
import logoSrc from '@/assets/logo.png';
import { getCustomUsageNotice } from '@/api/usageNoticeStore';

function useCapsLock() {
  const [on, setOn] = useState(false);
  const detect = useCallback((e) => setOn(e.getModifierState('CapsLock')), []);
  return { capsOn: on, onKeyDown: detect, onKeyUp: detect };
}

// ── System usage notice banner (IA-08) ────────────────────────────────────────
/** Returns an array of non-empty trimmed lines from the admin's custom notice, or null to use the default styled JSX. */
export function resolveUsageNoticeParagraphs() {
  const custom = getCustomUsageNotice();
  if (!custom) return null;
  return custom.split('\n').map((line) => line.trim()).filter(Boolean);
}

function UsageNoticeBanner({ onAcknowledge }) {
  const customLines = resolveUsageNoticeParagraphs();
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D1117] p-6">
      <div className="w-full max-w-lg rounded-2xl border border-[#EAB308]/40 bg-[#1C2128] p-8 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EAB308]/15">
            <ShieldAlert className="h-5 w-5 text-[#EAB308]" />
          </div>
          <h2 className="text-lg font-bold text-white">시스템 사용 알림</h2>
        </div>
        <div className="space-y-3 rounded-xl border border-[#30363D] bg-[#0D1117] p-5 text-sm leading-relaxed text-[#C9D1D9]">
          {customLines ? (
            customLines.map((line, i) => <p key={i}>{line}</p>)
          ) : (
            <>
              <p>본 시스템은 <span className="font-semibold text-white">인가된 의료진 및 관리자</span>만 사용할 수 있습니다.</p>
              <p>시스템에 접속하고 수행되는 모든 활동은 <span className="font-semibold text-white">모니터링, 기록 및 감사의 대상</span>이 됩니다.</p>
              <p><span className="font-semibold text-[#EF4444]">인가되지 않은 시스템 접근 및 사용은 금지</span>되며, 관련 법령에 따라 민·형사상 처벌을 받을 수 있습니다.</p>
              <p>시스템 접속은 위 내용에 동의함을 의미합니다.</p>
            </>
          )}
        </div>
        <Button
          onClick={onAcknowledge}
          className="mt-6 h-12 w-full rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] font-semibold text-white"
        >
          확인하고 계속하기
        </Button>
      </div>
    </div>
  );
}

// ── Forced password change modal (IA-04) ──────────────────────────────────────
function ChangePasswordModal({ userId, onDone }) {
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const caps = useCapsLock();
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const pwErrors = validatePassword(newPw);
    if (pwErrors.length) { setErrors(pwErrors); return; }
    if (newPw !== confirmPw) { setErrors(['비밀번호가 일치하지 않습니다.']); return; }
    setSaving(true);
    try {
      await UserStore.changePassword(userId, newPw);
      tryWriteAuditLog({ action: AUDIT_ACTIONS.PASSWORD_CHANGED, targetType: 'user', targetId: userId, detail: '본인 비밀번호 변경' });
      onDone();
    } catch (err) {
      setErrors([err.message]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#30363D] bg-[#1C2128] p-8 shadow-2xl">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#8B5CF6]" />
          <h2 className="text-lg font-bold text-white">초기 비밀번호 변경 필요</h2>
        </div>
        <p className="mb-6 text-sm text-[#8B949E]">
          초기 비밀번호를 사용 중입니다. 보안을 위해 새 비밀번호로 변경해주세요.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-sm text-[#8B949E]">새 비밀번호</Label>
            <div className="relative">
              <Input
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] pr-11 text-white"
                autoComplete="new-password"
                onKeyDown={caps.onKeyDown}
                onKeyUp={caps.onKeyUp}
              />
              <button type="button" tabIndex={-1} onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B949E] hover:text-white">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-sm text-[#8B949E]">새 비밀번호 확인</Label>
            <div className="relative">
              <Input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="h-12 rounded-xl border-[#30363D] bg-[#0D1117] pr-11 text-white"
                autoComplete="new-password"
                onKeyDown={caps.onKeyDown}
                onKeyUp={caps.onKeyUp}
              />
              <button type="button" tabIndex={-1} onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B949E] hover:text-white">
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {caps.capsOn && (
            <p className="flex items-center gap-1.5 text-xs text-[#EAB308]">
              <span className="text-sm">⇪</span> Caps Lock 켜짐
            </p>
          )}
          <div className="rounded-xl border border-[#30363D] bg-[#0D1117] px-4 py-3 text-xs text-[#8B949E] space-y-0.5">
            {['8자 이상', '대문자 포함', '소문자 포함', '숫자 포함', '특수문자 포함'].map((rule) => (
              <p key={rule}>• {rule}</p>
            ))}
          </div>
          {errors.length > 0 && (
            <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#FCA5A5]">
              {errors.map((e) => <p key={e}>{e}</p>)}
            </div>
          )}
          <Button
            type="submit"
            disabled={saving}
            className="h-12 w-full rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] font-semibold text-white"
          >
            {saving ? '변경 중…' : '비밀번호 변경'}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ── Session timeout warning ───────────────────────────────────────────────────
function TimeoutWarningBanner({ onStayLoggedIn }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-4 rounded-2xl border border-[#EAB308]/40 bg-[#1C2128] px-6 py-4 shadow-2xl">
        <ShieldAlert className="h-5 w-5 shrink-0 text-[#EAB308]" />
        <p className="text-sm text-[#C9D1D9]">
          2분 후 자동 로그아웃됩니다.
        </p>
        <Button
          size="sm"
          onClick={onStayLoggedIn}
          className="h-8 rounded-lg bg-[#3B82F6] px-4 text-xs text-white hover:bg-[#2563EB]"
        >
          계속 사용
        </Button>
      </div>
    </div>
  );
}

// ── Main Login page ───────────────────────────────────────────────────────────
export default function Login() {
  const [noticed, setNoticed] = useState(false);
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const caps = useCapsLock();
  const [errorMsg, setErrorMsg] = useState('');
  const [forcePwChange, setForcePwChange] = useState(null); // userId
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!userId.trim() || !password) return;
    setIsLoading(true);
    try {
      const result = await login(userId.trim(), password);
      if (!result.success) {
        setErrorMsg(result.error);
        setPassword('');
        return;
      }
      if (result.session.mustChangePassword) {
        setForcePwChange(result.session.userId);
        return;
      }
      navigate('/home', { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  if (!noticed) return <UsageNoticeBanner onAcknowledge={() => setNoticed(true)} />;

  return (
    <>
      {forcePwChange && (
        <ChangePasswordModal
          userId={forcePwChange}
          onDone={() => { setForcePwChange(null); navigate('/home', { replace: true }); }}
        />
      )}

      <div className="flex min-h-screen items-center justify-center bg-[#0D1117] p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-[#3B82F6]/10 via-transparent to-[#8B5CF6]/10" />

        <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-8">
          <img
            src={logoSrc}
            alt=""
            className="block h-auto w-[78.7%] max-w-[400px] object-contain"
            width={400}
            height={400}
            decoding="async"
          />

          <div className="inline-block rounded-full border border-[#30363D] bg-[#1C2128] px-5 py-2 text-sm text-[#8B949E]">
            원주세브란스기독병원
          </div>

          <form onSubmit={handleLogin} className="flex w-full flex-col gap-6 text-left">
            <div className="w-full space-y-4 rounded-xl border border-[#30363D] bg-[#1C2128] p-6">
              {/* Username */}
              <div className="relative">
                <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B949E]" />
                <Input
                  type="text"
                  placeholder="아이디를 입력하세요"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  autoComplete="username"
                  className="h-14 rounded-xl border-[#30363D] bg-[#0D1117] pl-12 text-white placeholder:text-[#8B949E] focus:border-[#3B82F6]"
                />
              </div>

              {/* Password — always type="password" or revealed via toggle (IA-06) */}
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B949E]" />
                <Input
                  type={showPw ? 'text' : 'password'}
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-14 rounded-xl border-[#30363D] bg-[#0D1117] pl-12 pr-12 text-white placeholder:text-[#8B949E] focus:border-[#3B82F6]"
                  onKeyDown={caps.onKeyDown}
                  onKeyUp={caps.onKeyUp}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8B949E] hover:text-white"
                  aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 표시'}
                >
                  {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {caps.capsOn && (
                <p className="flex items-center gap-1.5 text-xs text-[#EAB308]">
                  <span className="text-sm">⇪</span> Caps Lock 켜짐
                </p>
              )}

              {/* Error — generic message only, no cause detail (IA-06) */}
              {errorMsg && (
                <p className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-sm text-[#FCA5A5]">
                  {errorMsg}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading || !userId.trim() || !password}
              className="h-14 w-full rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-lg font-semibold text-white shadow-lg shadow-[#3B82F6]/25 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  시작하기
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-[#8B949E]">
          © 2026 THEPICT Inc. &nbsp;·&nbsp; v{__APP_VERSION__}
        </p>
        </div>
      </div>
    </>
  );
}

export { TimeoutWarningBanner };
