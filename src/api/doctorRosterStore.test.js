import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('doctor roster', () => {
  let store;
  let roster;

  beforeEach(async () => {
    vi.resetModules();
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    });
    const crypto_ = await import('@/lib/crypto');
    await crypto_.initCrypto();
    roster = await import('./doctorRosterStore');
  });

  it('starts empty', async () => {
    expect(await roster.listDoctorRoster()).toEqual([]);
  });

  it('remembers a name and reads it back', async () => {
    await roster.rememberDoctorName('박지우');
    expect(await roster.listDoctorRoster()).toEqual(['박지우']);
  });

  it('stores the roster encrypted, not as readable text', async () => {
    await roster.rememberDoctorName('박지우');
    const raw = store.get('dibh_doctor_roster');
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('박지우');
    // JSON envelope so AdminBackup can JSON.parse it, encrypted payload inside.
    expect(JSON.parse(raw).data.startsWith('enc:')).toBe(true);
  });

  it('puts the most recently used name first', async () => {
    await roster.rememberDoctorName('박지우');
    await roster.rememberDoctorName('정현서');
    await roster.rememberDoctorName('박지우');
    expect(await roster.listDoctorRoster()).toEqual(['박지우', '정현서']);
  });

  it('does not duplicate the same name', async () => {
    await roster.rememberDoctorName('박지우');
    await roster.rememberDoctorName('박지우');
    expect(await roster.listDoctorRoster()).toEqual(['박지우']);
  });

  it('treats surrounding and repeated whitespace as the same name', async () => {
    await roster.rememberDoctorName('박지우');
    await roster.rememberDoctorName('  박지우  ');
    await roster.rememberDoctorName('박지우');
    expect(await roster.listDoctorRoster()).toEqual(['박지우']);
  });

  it('matches case-insensitively but keeps the newest spelling', async () => {
    await roster.rememberDoctorName('dr kim');
    await roster.rememberDoctorName('Dr Kim');
    expect(await roster.listDoctorRoster()).toEqual(['Dr Kim']);
  });

  it('ignores empty or non-string input', async () => {
    await roster.rememberDoctorName('');
    await roster.rememberDoctorName('   ');
    await roster.rememberDoctorName(null);
    await roster.rememberDoctorName(undefined);
    await roster.rememberDoctorName(42);
    expect(await roster.listDoctorRoster()).toEqual([]);
  });

  it('caps the roster so a one-off typo eventually falls off', async () => {
    for (let i = 1; i <= roster.MAX_ROSTER_ENTRIES + 5; i += 1) {
      await roster.rememberDoctorName(`의사${i}`);
    }
    const list = await roster.listDoctorRoster();
    expect(list).toHaveLength(roster.MAX_ROSTER_ENTRIES);
    expect(list[0]).toBe(`의사${roster.MAX_ROSTER_ENTRIES + 5}`);
    expect(list).not.toContain('의사1');
  });

  it('returns an empty roster rather than throwing when the blob cannot be read', async () => {
    store.set('dibh_doctor_roster', 'enc:0000:dead');
    expect(await roster.listDoctorRoster()).toEqual([]);
  });

  it('does not drop writes when several land at once', async () => {
    await Promise.all([
      roster.rememberDoctorName('가의사'),
      roster.rememberDoctorName('나의사'),
      roster.rememberDoctorName('다의사'),
    ]);
    const list = await roster.listDoctorRoster();
    expect(list).toHaveLength(3);
    expect(list).toEqual(expect.arrayContaining(['가의사', '나의사', '다의사']));
  });
});
