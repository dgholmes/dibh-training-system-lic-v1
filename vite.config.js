/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const pkg = require('./package.json')

// Keep in sync with the <meta http-equiv="Content-Security-Policy"> tag in index.html.
// No external origin may appear here: the app bundles every asset it needs and must
// never reach the network (MFDS SI-01 / UC-02).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "frame-ancestors 'none'", // valid in HTTP headers (not meta tag)
].join('; ')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: 'all',
    headers: { 'Content-Security-Policy': CSP },
    watch: {
      ignored: [
        '**/android/**',
        '**/godirect-react-webbt/**',
        '**/docs/**',
        '**/docs_to_write/**',
        '**/docs to confirm/**',
        '**/vxp data/**',
        '**/resources/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.json']
  },
  build: {
    // Capacitor expects output in 'dist/' (matches capacitor.config.ts webDir)
    outDir: 'dist',
    // Keep asset names stable so Capacitor sync can diff them correctly
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          sqljs: ['sql.js'],
        },
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
})
