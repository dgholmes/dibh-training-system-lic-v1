import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getSession, clearSession, loginUser, ensureDefaultAdmin, touchSession } from '@/api/authStore';
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

  const scheduleTimers = useCallback((onLogout) => {
    clearTimeout(warnTimer.current);
    clearTimeout(logoutTimer.current);
    secDbg('IA-SESSION', 'Session Inactivity Timers Scheduled', {
      timeout_ms: SESSION_TIMEOUT_MS,
      timeout_min: SESSION_TIMEOUT_MS / 60_000,
      warning_before_ms: WARN_BEFORE_MS,
      warning_before_min: WARN_BEFORE_MS / 60_000,
      storage: 'sessionStorage (cleared on tab/browser close)',
    });
    warnTimer.current = setTimeout(() => {
      secDbg('IA-SESSION', 'Session Inactivity Warning Triggered', {
        remaining_ms: WARN_BEFORE_MS,
        remaining_min: WARN_BEFORE_MS / 60_000,
      });
      setTimeoutWarning(true);
    }, SESSION_TIMEOUT_MS - WARN_BEFORE_MS);
    logoutTimer.current = setTimeout(() => {
      secDbg('IA-SESSION', 'Auto-Logout Triggered — Inactivity Timeout', {
        timeout_ms: SESSION_TIMEOUT_MS,
        timeout_min: SESSION_TIMEOUT_MS / 60_000,
        reason: 'no user activity for 30 minutes',
      });
      onLogout();
    }, SESSION_TIMEOUT_MS);
  }, []);

  const doLogout = useCallback(() => {
    clearTimeout(warnTimer.current);
    clearTimeout(logoutTimer.current);
    clearSession();
    setSession(null);
    setTimeoutWarning(false);
  }, []);

  // Reset inactivity timers on user activity
  const resetActivity = useCallback(() => {
    if (!getSession()) return;
    touchSession();
    setTimeoutWarning(false);
    scheduleTimers(doLogout);
  }, [scheduleTimers, doLogout]);

  useEffect(() => {
    ensureDefaultAdmin().then(() => {
      const s = getSession();
      setSession(s);
      setInitialised(true);
      if (s) scheduleTimers(doLogout);
    });
    return () => {
      clearTimeout(warnTimer.current);
      clearTimeout(logoutTimer.current);
    };
  }, [scheduleTimers, doLogout]);

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
        scheduleTimers(doLogout);
      }
      return result;
    },
    [scheduleTimers, doLogout]
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
