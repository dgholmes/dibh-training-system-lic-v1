# VXP Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add VXP file parsing to the DIBH analysis pipeline so VXP files are analysed identically to CSV files, and add a Python script to convert between formats for cross-validation.

**Architecture:** Add `parseVxp` and `parseBreathingFile` to the existing `analyzeFiles.js` alongside `parseCsv`; replace the four VXP-blocking error throws in `analyzeFiles()` with a single dispatcher call. Python script is standalone — no app dependencies.

**Tech Stack:** Vanilla JS / Vitest (app side); Python 3.7+ stdlib only (converter).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/calibration/analyzeFiles.js` | Add `parseVxp`, `parseBreathingFile`; remove VXP guards; swap `parseCsv` calls |
| Modify | `src/lib/calibration/parseCsv.test.js` | Add `parseVxp` and `parseBreathingFile` test suites |
| Create | `vxp data/convert.py` | CLI: `vxp2csv` and `csv2vxp` conversion modes |

---

## Task 1: Write failing tests for `parseVxp` and `parseBreathingFile`

**Files:**
- Modify: `src/lib/calibration/parseCsv.test.js`

- [ ] **Step 1: Open `src/lib/calibration/parseCsv.test.js` and append the two new describe blocks below the existing `parseCsv` suite.**

The full file after editing:

```js
import { describe, it, expect } from 'vitest';
import { parseCsv, parseVxp, parseBreathingFile } from './analyzeFiles.js';

describe('parseCsv', () => {
  it('parses numeric rows and skips non-numeric header-like lines', () => {
    const text = `ignored header
0,1.5
0.1,1.6,9.9,0.1
`;
    const buf = new TextEncoder().encode(text).buffer;
    const samples = parseCsv(buf);
    expect(samples.length).toBe(2);
    expect(samples[0]).toMatchObject({ t: 0, raw: 1.5 });
    expect(samples[1]).toMatchObject({ t: 0.1, raw: 1.6, filtered: 9.9, dy: 0.1 });
  });
});

describe('parseVxp', () => {
  function toVxpBuf(headerExtra, dataLines) {
    const text =
      '[Header]\nData_layout=amplitude,phase,timestamp,validflag,ttlin,mark,ttlout\n' +
      headerExtra +
      '[Data]\n' +
      dataLines.join('\n') +
      '\n';
    return new TextEncoder().encode(text).buffer;
  }

  it('parses data rows and converts timestamp ms to seconds', () => {
    const buf = toVxpBuf('', [
      '-13.1569,1.0799,0,0,1,,0',
      '-13.1208,1.1781,40,0,1,,0',
      '-13.1050,1.2763,80,0,1,,0',
    ]);
    const samples = parseVxp(buf);
    expect(samples.length).toBe(3);
    expect(samples[0]).toMatchObject({ t: 0, raw: -13.1569 });
    expect(samples[1].t).toBeCloseTo(0.04);
    expect(samples[1].raw).toBe(-13.1208);
    expect(samples[2].t).toBeCloseTo(0.08);
  });

  it('skips blank lines and non-numeric rows in [Data]', () => {
    const buf = toVxpBuf('', [
      '-13.1569,1.0799,0,0,1,,0',
      '',
      'not,a,data,row',
      '-13.1208,1.1781,40,0,1,,0',
    ]);
    const samples = parseVxp(buf);
    expect(samples.length).toBe(2);
  });

  it('throws if [Data] section is missing', () => {
    const text = '[Header]\nVersion=1.6\nSome_key=val\n';
    const buf = new TextEncoder().encode(text).buffer;
    expect(() => parseVxp(buf)).toThrow('VXP 파일에서 [Data] 섹션을 찾을 수 없습니다.');
  });

  it('falls back to column indices 0,2 when Data_layout is absent', () => {
    const text = '[Header]\n[Data]\n-5.0,0.0,200,0,1,,0\n';
    const buf = new TextEncoder().encode(text).buffer;
    const samples = parseVxp(buf);
    expect(samples.length).toBe(1);
    expect(samples[0].raw).toBe(-5.0);
    expect(samples[0].t).toBeCloseTo(0.2);
  });
});

describe('parseBreathingFile', () => {
  it('dispatches to parseVxp for .vxp filename', () => {
    const text =
      '[Header]\nData_layout=amplitude,phase,timestamp,validflag,ttlin,mark,ttlout\n[Data]\n-1.0,0,0,0,1,,0\n';
    const buf = new TextEncoder().encode(text).buffer;
    const samples = parseBreathingFile(buf, 'PT001_GEN_20260101.vxp');
    expect(samples.length).toBe(1);
    expect(samples[0]).toMatchObject({ t: 0, raw: -1.0 });
  });

  it('dispatches to parseCsv for .csv filename', () => {
    const text = '0.0,5.0\n0.04,5.1\n';
    const buf = new TextEncoder().encode(text).buffer;
    const samples = parseBreathingFile(buf, 'PT001_GEN_20260101.csv');
    expect(samples.length).toBe(2);
    expect(samples[0]).toMatchObject({ t: 0, raw: 5.0 });
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail (functions not yet exported)**

```
npm test -- parseCsv.test
```

Expected: `parseVxp is not a function` / `parseBreathingFile is not a function` errors on the new suites. The original `parseCsv` suite must still pass.

---

## Task 2: Implement `parseVxp` and `parseBreathingFile` in `analyzeFiles.js`

**Files:**
- Modify: `src/lib/calibration/analyzeFiles.js`

- [ ] **Step 1: Replace the import line at line 15 — remove `isCsvBreathingFileName` (no longer needed after Task 3), keep `isVxpBreathingFileName`**

Find:
```js
import { isCsvBreathingFileName, isVxpBreathingFileName } from '@/lib/breathingFileFormat';
```

Replace with:
```js
import { isVxpBreathingFileName } from '@/lib/breathingFileFormat';
```

- [ ] **Step 2: Add `parseVxp` and `parseBreathingFile` after the closing `}` of `parseCsv` (after line 85)**

Insert:

```js
/**
 * Parse a Varian VXP file. Returns the same shape as parseCsv: [{ t, raw }].
 * Timestamp column is in milliseconds — divided by 1000 to produce seconds.
 * All columns except amplitude and timestamp are ignored.
 */
export function parseVxp(arrayBuffer) {
  const text = new TextDecoder().decode(arrayBuffer);
  const lines = text.split(/\r?\n/);

  let ampIdx = 0;
  let tsIdx = 2;
  let inData = false;
  const samples = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === '[Data]') {
      inData = true;
      continue;
    }
    if (trimmed === '[Header]') continue;

    if (!inData) {
      if (trimmed.startsWith('Data_layout=')) {
        const cols = trimmed.slice('Data_layout='.length).split(',').map((c) => c.trim().toLowerCase());
        const ai = cols.indexOf('amplitude');
        const ti = cols.indexOf('timestamp');
        if (ai >= 0) ampIdx = ai;
        if (ti >= 0) tsIdx = ti;
      }
      continue;
    }

    const cols = trimmed.split(',');
    if (cols.length <= Math.max(ampIdx, tsIdx)) continue;
    const raw = parseFloat(cols[ampIdx]);
    const t = parseFloat(cols[tsIdx]) / 1000.0;
    if (!Number.isFinite(raw) || !Number.isFinite(t)) continue;
    samples.push({ t, raw });
  }

  if (!inData) {
    throw new Error('VXP 파일에서 [Data] 섹션을 찾을 수 없습니다.');
  }

  return samples;
}

/** Dispatch to the correct parser based on file extension. */
export function parseBreathingFile(arrayBuffer, filename) {
  if (isVxpBreathingFileName(filename)) return parseVxp(arrayBuffer);
  return parseCsv(arrayBuffer);
}
```

- [ ] **Step 3: Run tests — the new suites must now pass**

```
npm test -- parseCsv.test
```

Expected: all 7 tests pass (1 existing parseCsv + 4 parseVxp + 2 parseBreathingFile).

- [ ] **Step 4: Commit**

```
git add src/lib/calibration/analyzeFiles.js src/lib/calibration/parseCsv.test.js
git commit -m "feat: add parseVxp and parseBreathingFile to analysis pipeline"
```

---

## Task 3: Remove VXP guards from `analyzeFiles()` and use the dispatcher

**Files:**
- Modify: `src/lib/calibration/analyzeFiles.js` lines 131–150

- [ ] **Step 1: Replace the four format-check blocks and the two `parseCsv` calls**

Find (lines 131–150):
```js
  if (isVxpBreathingFileName(generalFile.original_name)) {
    throw new Error(
      '일반호흡: VXP 파일은 현재 분석에서 지원하지 않습니다. 분석에는 CSV 파일을 선택해 주세요. (VXP는 업로드 보관만 가능합니다.)'
    );
  }
  if (isVxpBreathingFileName(dibhFile.original_name)) {
    throw new Error(
      'DIBH: VXP 파일은 현재 분석에서 지원하지 않습니다. 분석에는 CSV 파일을 선택해 주세요. (VXP는 업로드 보관만 가능합니다.)'
    );
  }
  if (!isCsvBreathingFileName(generalFile.original_name)) {
    throw new Error('일반호흡 분석은 CSV 파일만 지원합니다. 파일 확장자를 확인해 주세요.');
  }
  if (!isCsvBreathingFileName(dibhFile.original_name)) {
    throw new Error('DIBH 분석은 CSV 파일만 지원합니다. 파일 확장자를 확인해 주세요.');
  }

  // ── Parse CSVs ───────────────────────────────────────────────────
  const generalSamples = parseCsv(generalFile.arrayBuffer);
  const dibhSamples = parseCsv(dibhFile.arrayBuffer);
```

Replace with:
```js
  // ── Parse files (CSV or VXP) ─────────────────────────────────────
  const generalSamples = parseBreathingFile(generalFile.arrayBuffer, generalFile.original_name);
  const dibhSamples = parseBreathingFile(dibhFile.arrayBuffer, dibhFile.original_name);
```

- [ ] **Step 2: Run the full test suite to verify nothing regressed**

```
npm test
```

Expected: all tests pass including the integration test `analyzeFiles.integration.test.js`.

- [ ] **Step 3: Commit**

```
git add src/lib/calibration/analyzeFiles.js
git commit -m "feat: enable VXP analysis — remove CSV-only guards, use parseBreathingFile dispatcher"
```

---

## Task 4: Write the Python conversion script

**Files:**
- Create: `vxp data/convert.py`

- [ ] **Step 1: Create `vxp data/convert.py` with the following content**

```python
#!/usr/bin/env python3
"""
VXP <-> app CSV converter for DIBH analysis validation.

Usage:
    python convert.py vxp2csv input.vxp [output.csv]
    python convert.py csv2vxp input.csv [output.vxp]

App CSV format: two-column (t in seconds, raw = amplitude).
VXP format: Varian RPM [Header]/[Data] format, timestamp in milliseconds.
"""

import csv
import os
import statistics
import sys


def _parse_vxp(path):
    """Return (meta_dict, [(t_seconds, amplitude), ...])."""
    meta = {}
    amp_idx = 0
    ts_idx = 2
    in_data = False
    samples = []

    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line == '[Data]':
                in_data = True
                continue
            if line == '[Header]':
                continue
            if not in_data:
                if '=' in line:
                    key, _, val = line.partition('=')
                    meta[key.strip()] = val.strip()
                    if key.strip() == 'Data_layout':
                        cols = [c.strip().lower() for c in val.split(',')]
                        if 'amplitude' in cols:
                            amp_idx = cols.index('amplitude')
                        if 'timestamp' in cols:
                            ts_idx = cols.index('timestamp')
            else:
                parts = line.split(',')
                try:
                    amp = float(parts[amp_idx])
                    ts_ms = float(parts[ts_idx])
                    samples.append((ts_ms / 1000.0, amp))
                except (ValueError, IndexError):
                    continue

    return meta, samples


def _parse_app_csv(path):
    """Return [(t_seconds, raw), ...] from a t,raw CSV (skips # comments and non-numeric rows)."""
    samples = []
    with open(path, encoding='utf-8', newline='') as f:
        for line in f:
            stripped = line.strip()
            if not stripped or stripped.startswith('#'):
                continue
            parts = stripped.split(',')
            try:
                samples.append((float(parts[0]), float(parts[1])))
            except (ValueError, IndexError):
                continue  # skip header rows
    return samples


def vxp2csv(input_path, output_path):
    meta, samples = _parse_vxp(input_path)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        for key in ('Patient_ID', 'Date', 'Samples_per_second', 'Scale_factor'):
            if key in meta:
                f.write(f'# {key}: {meta[key]}\n')
        f.write(f'# Source: {os.path.abspath(input_path)}\n')
        writer = csv.writer(f)
        writer.writerow(['t', 'raw'])
        for t, raw in samples:
            writer.writerow([t, raw])
    print(f'vxp2csv: wrote {len(samples)} samples -> {output_path}')


def csv2vxp(input_path, output_path):
    samples = _parse_app_csv(input_path)
    if not samples:
        print('Error: no valid samples found in CSV', file=sys.stderr)
        sys.exit(1)

    dts = [
        samples[i + 1][0] - samples[i][0]
        for i in range(len(samples) - 1)
        if samples[i + 1][0] > samples[i][0]
    ]
    median_dt = statistics.median(dts) if dts else 0.04
    sps = round(1.0 / median_dt, 1) if median_dt > 0 else 25.0

    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        f.write('[Header]\n')
        f.write('Version=1.6\n')
        f.write('Data_layout=amplitude,phase,timestamp,validflag,ttlin,mark,ttlout\n')
        f.write(f'Samples_per_second={sps}\n')
        f.write('Scale_factor=1.0\n')
        f.write(f'Total_study_time={samples[-1][0]:.3f}\n')
        f.write('[Data]\n')
        for t, raw in samples:
            ts_ms = round(t * 1000)
            f.write(f'{raw},0.0,{ts_ms},0,1,,0\n')
    print(f'csv2vxp: wrote {len(samples)} samples -> {output_path}')


def _swap_ext(path, new_ext):
    base, _ = os.path.splitext(path)
    return base + new_ext


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    mode = sys.argv[1]
    input_path = sys.argv[2]

    if mode == 'vxp2csv':
        output_path = sys.argv[3] if len(sys.argv) > 3 else _swap_ext(input_path, '.csv')
        vxp2csv(input_path, output_path)
    elif mode == 'csv2vxp':
        output_path = sys.argv[3] if len(sys.argv) > 3 else _swap_ext(input_path, '.vxp')
        csv2vxp(input_path, output_path)
    else:
        print(f'Unknown mode: {mode!r}. Use vxp2csv or csv2vxp.', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Smoke-test the script with a real VXP file**

```
cd "vxp data"
python convert.py vxp2csv vxp_sample_data/patient_1.vxp patient_1_converted.csv
```

Expected output: `vxp2csv: wrote 7510 samples -> patient_1_converted.csv`

Verify the first few lines look correct:
```
python -c "
import csv
with open('patient_1_converted.csv') as f:
    for i, line in enumerate(f):
        print(line, end='')
        if i > 8: break
"
```

Expected: comment lines starting with `#`, then `t,raw` header, then rows like `0.0,-13.1569`.

- [ ] **Step 3: Round-trip test — convert back to VXP and check sample count is preserved**

```
python convert.py csv2vxp patient_1_converted.csv patient_1_roundtrip.vxp
python -c "
lines = open('patient_1_roundtrip.vxp').readlines()
data_lines = [l for l in lines if l.strip() and not l.startswith('[') and '=' not in l]
print(f'Round-trip data rows: {len(data_lines)}')
"
```

Expected: `Round-trip data rows: 7510`

- [ ] **Step 4: Clean up test output files and commit**

```
cd "vxp data"
del patient_1_converted.csv patient_1_roundtrip.vxp
cd ..
git add "vxp data/convert.py"
git commit -m "feat: add Python VXP<->CSV conversion script for cross-format validation"
```

---

## Verification checklist

After all tasks are complete:

- [ ] `npm test` — all tests pass
- [ ] Manually upload a `.vxp` file in the app and confirm analysis runs (no "VXP 지원하지 않습니다" error)
- [ ] `python convert.py vxp2csv` round-trip preserves sample count
