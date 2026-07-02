/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const pkg = require('./package.json')

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' blob: https://cdn.jsdelivr.net https://fonts.googleapis.com https://fonts.gstatic.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
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