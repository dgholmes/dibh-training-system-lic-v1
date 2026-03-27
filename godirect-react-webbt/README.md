
# Go Direct Respiration Monitor (React + Vite + TS)

A minimal React PWA for **Android Chrome** that connects to the **Vernier Go Direct Respiration Belt**
via **Web Bluetooth** using `@vernier/godirect`. Shows **Connect/Disconnect**, latest **Force (N)**, and a live chart.

> **Note**: Web Bluetooth requires **HTTPS** (or `localhost`). Use **Chrome** on **Android**.

## Quick start

```bash
npm install
npm run dev
```

- For LAN/device testing, host over **HTTPS** (deploy to an HTTPS host, or use a local TLS proxy).
- On connection: Chrome shows a chooser. Select your **Go Direct Respiration Belt**.
- To stream respiration rate instead of force, change `/Force/i` to `/Respiration Rate/i` in `src/hooks/useGodirect.ts`.

## Build
```bash
npm run build
npm run preview
```

## Files
- `src/hooks/useGodirect.ts` — Encapsulates connect/disconnect & streaming.
- `src/components/LineChart.tsx` — Chart.js line plot for Force (N).
- `src/App.tsx` — UI with buttons and live values.
- `public/manifest.webmanifest` — PWA manifest.
