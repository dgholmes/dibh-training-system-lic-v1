import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('SECURITY_DEBUG env flag', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false when VITE_DEBUG_MODE is unset', async () => {
    vi.stubEnv('VITE_DEBUG_MODE', undefined);
    const { SECURITY_DEBUG } = await import('./securityDebug.js');
    expect(SECURITY_DEBUG).toBe(false);
  });

  it('is true when VITE_DEBUG_MODE is the string "true"', async () => {
    vi.stubEnv('VITE_DEBUG_MODE', 'true');
    const { SECURITY_DEBUG } = await import('./securityDebug.js');
    expect(SECURITY_DEBUG).toBe(true);
  });

  it('is false for any other value (e.g. "1", "yes")', async () => {
    vi.stubEnv('VITE_DEBUG_MODE', '1');
    const { SECURITY_DEBUG } = await import('./securityDebug.js');
    expect(SECURITY_DEBUG).toBe(false);
  });
});
