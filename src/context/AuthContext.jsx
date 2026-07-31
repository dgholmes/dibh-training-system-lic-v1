import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getSession, clearSession, clearSessionForTimeout, loginUser, ensureDefaultAdmin, touchSession, migrateLegacyUserMetadata } from '@/api/authStore';
import { migrateLegacyRecordHashes } from '@/api/localStore';
import { tryWriteAuditLog, AUDIT_ACTIONS } from '@/api/auditStore';
import { secDbg } from '@/lib/securityDebug';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes inactivity
const WARN_BEFORE_MS = 2 * 60 * 1000;      // warn 2 minutes before expiry

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [initialised, setInitialised] = useState(false);
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const warnTimer = useRef(null);
  const logoutTimer = useRef(null);

  const scheduleTimers = useCallback((onTimeoutLogout) => {
    clearTimeout(warnTimer.current);
    clearTimeout(logoutTimer.current);
    secDbg('IA-SESSION', '세션 비활성 타이머 설정 — Session Inactivity Timers Scheduled', {
      설명: '사용자 비활성 상태 감지 타이머를 설정합니다. 마우스/키보드/터치 입력 시 타이머가 초기화됩니다.',
      description: 'Sets inactivity timers. Resets on mousedown/keydown/touchstart/scroll.',
      session_timeout_min: SESSION_TIMEOUT_MS / 60_000,
      warn_before_min: WARN_BEFORE_MS / 60_000,
      session_storage: 'sessionStorage (cleared on tab close)',
    });
    warnTimer.current = setTimeout(() => {
      secDbg('IA-SESSION', '세션 비활성 경고 발동 — Session Warning Triggered', {
        설명: '세션 만료 2분 전 경고를 표시합니다. 사용자가 "계속 사용" 버튼을 누르면 타이머가 초기화됩니다.',
        description: 'Shows warning 2 minutes before session expiry. "Continue" button resets the timer.',
        remaining_min: WARN_BEFORE_MS / 60_000,
      });
      setTimeoutWarning(true);
    }, SESSION_TIMEOUT_MS - WARN_BEFORE_MS);
    logoutTimer.current = setTimeout(() => {
      secDbg('IA-SESSION', '자동 로그아웃 실행 — Auto-Logout: Session Expired', {
        설명: '30분 동안 사용자 입력이 없어 세션이 자동 만료되었습니다. 수동 로그아웃과 구분되는 자동 만료 이벤트입니다.',
        description: '30 minutes of inactivity — session auto-expired. Distinguished from manual logout (UC-04: SESSION_TIMEOUT vs LOGOUT).',
        session_duration_min: SESSION_TIMEOUT_MS / 60_000,
        reason: '30분간 사용자 입력 없음 (비활성) | 30 min of user inactivity',
        audit_action: 'SESSION_TIMEOUT',
      });
      onTimeoutLogout();
    }, SESSION_TIMEOUT_MS);
  }, []);

  const doLogout = useCallback(() => {
    clearTimeout(warnTimer.current);
    clearTimeout(logoutTimer.current);
    clearSession(); // logs AUDIT_ACTIONS.LOGOUT — manual logout
    setSession(null);
    setTimeoutWarning(false);
  }, []);

  const doTimeoutLogout = useCallback(() => {
    clearTimeout(warnTimer.current);
    clearTimeout(logoutTimer.current);
    clearSessionForTimeout(); // logs AUDIT_ACTIONS.SESSION_TIMEOUT — auto-logout
    setSession(null);
    setTimeoutWarning(false);
  }, []);

  // Reset inactivity timers on user activity
  const resetActivity = useCallback(() => {
    if (!getSession()) return;
    touchSession();
    setTimeoutWarning(false);
    scheduleTimers(doTimeoutLogout);
  }, [scheduleTimers, doTimeoutLogout]);

  useEffect(() => {
    const bootstrap = async () => {
      await ensureDefaultAdmin();
      // One-time upgrade of records written by a pre-encryption / pre-hash build.
      // Both migrations are idempotent no-ops once they have run, and a failure here
      // must never block login — the data stays readable either way.
      try {
        const userResult = await migrateLegacyUserMetadata();
        const hashResult = await migrateLegacyRecordHashes();
        if (userResult.migrated > 0 || hashResult.trainingSessions > 0 || hashResult.calibrations > 0) {
          tryWriteAuditLog({
            action: AUDIT_ACTIONS.LEGACY_DATA_MIGRATED,
            targetType: 'system',
            detail: `계정 ${userResult.migrated}건, 훈련세션 ${hashResult.trainingSessions}건, 캘리브레이션 ${hashResult.calibrations}건 마이그레이션`,
          });
        }
      } catch (err) {
        console.error('[AuthContext] 레거시 데이터 마이그레이션 실패:', err);
      }
      const s = getSession();
      setSession(s);
      setInitialised(true);
      if (s) scheduleTimers(doTimeoutLogout);
    };
    void bootstrap();
    return () => {
      clearTimeout(warnTimer.current);
      clearTimeout(logoutTimer.current);
    };
  }, [scheduleTimers, doTimeoutLogout]);

  // Attach activity listeners for session timeout reset
  useEffect(() => {
    if (!session) return;
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, resetActivity));
  }, [session, resetActivity]);

  const login = useCallback(
    async (username, password) => {
      const result = await loginUser(username, password);
      if (result.success) {
        setSession(result.session);
        scheduleTimers(doTimeoutLogout);
      }
      return result;
    },
    [scheduleTimers, doTimeoutLogout]
  );

  const logout = useCallback(() => doLogout(), [doLogout]);

  const dismissTimeoutWarning = useCallback(() => {
    resetActivity();
  }, [resetActivity]);

  return (
    <AuthContext.Provider
      value={{ session, initialised, login, logout, isAuthenticated: !!session, timeoutWarning, dismissTimeoutWarning }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
