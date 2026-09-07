/**
 * MFDS IA-04 — credential change cycle.
 *
 * The device must require a password change on a fixed cycle and warn before the deadline.
 * These cover the boundary the reviewer will check (does an old password actually block
 * login?) and the two ways a record can lack a change timestamp.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  PASSWORD_MAX_AGE_DAYS,
  PASSWORD_WARN_BEFORE_DAYS,
  passwordAgeDays,
  passwordAgeStatus,
} from '@/config/passwordPolicy';

function createMockStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

/** Rewrites the stored admin record's password timestamp, keeping the encrypted blob intact. */
async function setAdminPasswordChangedAt(isoDate) {
  const users = JSON.parse(localStorage.getItem('dibh_users'));
  users[0].passwordChangedAt = isoDate;
  localStorage.setItem('dibh_users', JSON.stringify(users));
}

describe('IA-04 — password age policy', () => {
  it('measures age in whole days', () => {
    expect(passwordAgeDays(daysAgo(0))).toBe(0);
    expect(passwordAgeDays(daysAgo(45))).toBe(45);
  });

  it('treats a missing or malformed timestamp as unknown, never as expired', () => {
    // A record we cannot date must not lock the operator out of the device.
    for (const value of [null, undefined, '', 'not-a-date']) {
      const status = passwordAgeStatus(value);
      expect(status.ageDays).toBeNull();
      expect(status.expired).toBe(false);
      expect(status.warn).toBe(false);
    }
  });

  it('classifies fresh, warning and expired passwords', () => {
    expect(passwordAgeStatus(daysAgo(1))).toMatchObject({ expired: false, warn: false });

    const warnDay = PASSWORD_MAX_AGE_DAYS - PASSWORD_WARN_BEFORE_DAYS + 1;
    expect(passwordAgeStatus(daysAgo(warnDay))).toMatchObject({ expired: false, warn: true });

    expect(passwordAgeStatus(daysAgo(PASSWORD_MAX_AGE_DAYS))).toMatchObject({ expired: true });
    expect(passwordAgeStatus(daysAgo(PASSWORD_MAX_AGE_DAYS + 30))).toMatchObject({ expired: true });
  });

  it('does not warn one day before the warning window opens', () => {
    const justOutside = PASSWORD_MAX_AGE_DAYS - PASSWORD_WARN_BEFORE_DAYS - 1;
    expect(passwordAgeStatus(daysAgo(justOutside)).warn).toBe(false);
  });
});

describe('IA-04 — enforcement at login', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createMockStorage());
    vi.stubGlobal('sessionStorage', createMockStorage());
  });

  it('stamps passwordChangedAt when the default admin is created', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin } = await import('./authStore.js');
    await ensureDefaultAdmin();

    const raw = JSON.parse(localStorage.getItem('dibh_users'))[0];
    expect(raw.passwordChangedAt).toBeTruthy();
    expect(passwordAgeStatus(raw.passwordChangedAt).expired).toBe(false);
  });

  it('forces a change once the password is older than the maximum age', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, loginUser, UserStore } = await import('./authStore.js');
    await ensureDefaultAdmin();

    // Clear mustChangePassword first, so the forced change can only come from age.
    const users = JSON.parse(localStorage.getItem('dibh_users'));
    await UserStore.changePassword(users[0].id, 'Fresh@2026pw');
    await setAdminPasswordChangedAt(daysAgo(PASSWORD_MAX_AGE_DAYS + 5));

    const result = await loginUser('admin', 'Fresh@2026pw');
    expect(result.success).toBe(true);
    expect(result.session.passwordExpired).toBe(true);
    expect(result.session.mustChangePassword).toBe(true);
    expect(result.session.passwordAgeDays).toBeGreaterThanOrEqual(PASSWORD_MAX_AGE_DAYS);
  });

  it('warns, but still lets the operator in, inside the warning window', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, loginUser, UserStore } = await import('./authStore.js');
    await ensureDefaultAdmin();

    const users = JSON.parse(localStorage.getItem('dibh_users'));
    await UserStore.changePassword(users[0].id, 'Fresh@2026pw');
    await setAdminPasswordChangedAt(daysAgo(PASSWORD_MAX_AGE_DAYS - 3));

    const result = await loginUser('admin', 'Fresh@2026pw');
    expect(result.success).toBe(true);
    expect(result.session.passwordExpired).toBe(false);
    expect(result.session.mustChangePassword).toBe(false);
    expect(result.session.passwordExpiryWarning).toBe(true);
    expect(result.session.passwordExpiresInDays).toBe(3);
  });

  it('restarts the cycle when the password is changed', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, loginUser, UserStore } = await import('./authStore.js');
    await ensureDefaultAdmin();

    const users = JSON.parse(localStorage.getItem('dibh_users'));
    await setAdminPasswordChangedAt(daysAgo(PASSWORD_MAX_AGE_DAYS + 5));
    await UserStore.changePassword(users[0].id, 'Fresh@2026pw');

    const result = await loginUser('admin', 'Fresh@2026pw');
    expect(result.session.passwordExpired).toBe(false);
    expect(result.session.passwordAgeDays).toBe(0);
  });

  it('falls back to createdAt for records written before this feature existed', async () => {
    const { initCrypto } = await import('@/lib/crypto');
    await initCrypto();
    const { ensureDefaultAdmin, loginUser } = await import('./authStore.js');
    await ensureDefaultAdmin();

    // Simulate a pre-upgrade record: no passwordChangedAt at all, account created long ago.
    const users = JSON.parse(localStorage.getItem('dibh_users'));
    delete users[0].passwordChangedAt;
    users[0].createdAt = daysAgo(PASSWORD_MAX_AGE_DAYS + 10);
    localStorage.setItem('dibh_users', JSON.stringify(users));

    const result = await loginUser('admin', 'Admin@1234!');
    expect(result.success).toBe(true);
    expect(result.session.passwordExpired).toBe(true);
  });
});
