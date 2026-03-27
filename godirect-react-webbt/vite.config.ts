
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { 
    host: '0.0.0.0', // Allow access from network
    port: 5174,
    // Web Bluetooth works on HTTP for localhost
    // For network access (10.0.10.117), HTTPS is required but needs proper certs
    // Use HTTP for localhost, or set up mkcert for trusted local HTTPS
  },
})
