import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

describe('usageNoticeStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMockLocalStorage());
  });

  it('getCustomUsageNotice returns null when unset', async () => {
    const { getCustomUsageNotice } = await import('./usageNoticeStore.js');
    expect(getCustomUsageNotice()).toBeNull();
  });

  it('setUsageNotice stores trimmed text, retrievable via getCustomUsageNotice', async () => {
    const { setUsageNotice, getCustomUsageNotice } = await import('./usageNoticeStore.js');
    setUsageNotice('  custom notice text  ');
    expect(getCustomUsageNotice()).toBe('custom notice text');
  });

  it('setUsageNotice with empty/whitespace-only text clears the key (reverts to default)', async () => {
    const { setUsageNotice, getCustomUsageNotice } = await import('./usageNoticeStore.js');
    setUsageNotice('something');
    setUsageNotice('   ');
    expect(getCustomUsageNotice()).toBeNull();
  });

  it('resetUsageNotice clears any custom text', async () => {
    const { setUsageNotice, resetUsageNotice, getCustomUsageNotice } = await import('./usageNoticeStore.js');
    setUsageNotice('something');
    resetUsageNotice();
    expect(getCustomUsageNotice()).toBeNull();
  });

  it('validateUsageNotice rejects text over 1000 characters', async () => {
    const { validateUsageNotice } = await import('./usageNoticeStore.js');
    const errors = validateUsageNotice('a'.repeat(1001));
    expect(errors).toEqual(['공지 문구는 최대 1000자까지 입력할 수 있습니다.']);
  });

  it('validateUsageNotice accepts text at or under 1000 characters', async () => {
    const { validateUsageNotice } = await import('./usageNoticeStore.js');
    expect(validateUsageNotice('a'.repeat(1000))).toEqual([]);
    expect(validateUsageNotice('')).toEqual([]);
  });
});
