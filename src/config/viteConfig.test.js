import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import viteConfig from '../../vite.config.js'

describe('Vite development-server safeguards', () => {
  it('ignores generated and unrelated project trees', () => {
    expect(viteConfig.server.watch.ignored).toEqual([
      '**/android/**',
      '**/godirect-react-webbt/**',
      '**/docs/**',
      '**/docs_to_write/**',
      '**/docs to confirm/**',
      '**/vxp data/**',
      '**/resources/**',
    ])
  })

  it('pins Vite to the installed version', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    )

    expect(packageJson.devDependencies.vite).toBe('6.4.1')
  })
})
