import { describe, it, expect, vi } from 'vitest';

describe('resolveUsageNoticeParagraphs', () => {
  it('returns null (use default JSX) when no custom notice is set', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const { resolveUsageNoticeParagraphs } = await import('./Login.jsx');
    expect(resolveUsageNoticeParagraphs()).toBeNull();
  });

  it('splits a custom notice into non-empty trimmed lines', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'Line one\n\nLine two  \n' });
    const { resolveUsageNoticeParagraphs } = await import('./Login.jsx');
    expect(resolveUsageNoticeParagraphs()).toEqual(['Line one', 'Line two']);
  });
});
