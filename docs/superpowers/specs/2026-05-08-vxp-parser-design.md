# VXP Parser & Conversion Script — Design Spec

**Date:** 2026-05-08  
**Scope:** Add VXP file support to the DIBH analysis pipeline; add Python conversion utility for cross-format validation.

---

## Background

The app currently accepts VXP uploads but blocks analysis with an explicit error. The analysis pipeline (`analyzeFiles.js`) works on `[{ t, raw }]` sample arrays — identical shape regardless of source file format. The only work needed is a parser that produces that shape from VXP bytes.

---

## VXP Format Summary

```
[Header]
Version=1.6
Data_layout=amplitude,phase,timestamp,validflag,ttlin,mark,ttlout
Patient_ID=30531497
Samples_per_second=25
Scale_factor=10.0
[Data]
-13.1569,1.0799,0,0,1,,0
-13.1208,1.1781,40,0,1,,0
...
```

Key facts:
- **`amplitude`** — breathing displacement in mm (already scaled; `Scale_factor` is metadata only and does not need to be applied)
- **`timestamp`** — milliseconds since start (integer or float)
- All other columns (`phase`, `validflag`, `ttlin`, `mark`, `ttlout`) are irrelevant to the algorithm and are ignored
- Sampling rate: 25 Hz (40 ms per sample)

**Critical unit difference vs app CSV:**  
App CSV `t` is in **seconds**; VXP `timestamp` is in **milliseconds**. The algorithm uses `t` in seconds for IIR filter alpha, cycle period detection, and all time-based thresholds. The parser must divide `timestamp / 1000` to produce seconds.

Scale factor does **not** affect results — all algorithm calculations are relative differences (CV = std/mean of cycle amplitudes; max_amp = p95 − p10; thresholds = fractions of max_amp). A constant multiplier cancels out entirely.

---

## Changes to `src/lib/calibration/analyzeFiles.js`

### `parseVxp(arrayBuffer): Sample[]`

New exported function alongside `parseCsv`.

Algorithm:
1. Decode buffer as UTF-8
2. Scan lines; skip everything until `[Data]` is found
3. From header lines, read `Data_layout` to find column indices for `amplitude` and `timestamp` (fall back to indices 0 and 2 if header is absent)
4. For each data line after `[Data]`: split on `,`, parse `amplitude` → `raw`, `timestamp / 1000` → `t`
5. Skip blank lines and lines where either value is non-finite
6. Return `[{ t, raw }]`

Error: if `[Data]` section is never found, throw `'VXP 파일에서 [Data] 섹션을 찾을 수 없습니다.'`

### `parseBreathingFile(arrayBuffer, filename): Sample[]`

Thin dispatcher:
```js
export function parseBreathingFile(arrayBuffer, filename) {
  if (isVxpBreathingFileName(filename)) return parseVxp(arrayBuffer);
  return parseCsv(arrayBuffer);
}
```

### `analyzeFiles` — remove VXP error blocks

The two `if (isVxpBreathingFileName(...)) { throw ... }` blocks and the two `if (!isCsvBreathingFileName(...)) { throw ... }` blocks are replaced by calling `parseBreathingFile` for both files. No other logic changes.

---

## Python Conversion Script — `vxp data/convert.py`

### CLI Interface

```
python convert.py vxp2csv input.vxp [output.csv]
python convert.py csv2vxp input.csv [output.vxp]
```

Output filename defaults to input filename with extension swapped if not provided.

### `vxp2csv`

Reads VXP, writes app-internal `t,raw` CSV:
- Comment lines (`#`) echo: Patient_ID, Date, Samples_per_second, Scale_factor, source path
- Header row: `t,raw`
- Data rows: `timestamp/1000`, `amplitude` — one row per VXP data line

### `csv2vxp`

Reads app-internal `t,raw` CSV (skips `#` comment lines and any non-numeric header rows), writes VXP:
- `[Header]` section: Version=1.6, Data_layout=amplitude,phase,timestamp,validflag,ttlin,mark,ttlout, Samples_per_second inferred from median `1/(dt)`, Scale_factor=1.0
- `[Data]` section: one row per sample — `raw` as amplitude, `0.0` as phase, `round(t*1000)` as timestamp, `0,1,,0` for remaining columns

### No external dependencies

Standard library only (`csv`, `sys`, `os`, `statistics`). Runnable with any Python 3.7+.

---

## Tests

File: `src/lib/calibration/parseCsv.test.js` — add a new `describe('parseVxp')` block (no rename needed, file already tests parsing utilities from `analyzeFiles.js`).

Test cases:
1. **Happy path** — minimal VXP string with 3 data rows → `t` is in seconds (timestamp/1000), `raw` matches amplitude, non-data header lines are skipped
2. **Blank lines & partial rows** — VXP with empty lines and a row with fewer than 3 columns → those rows are skipped, valid rows parsed
3. **Missing `[Data]` section** — `parseVxp` throws with Korean error message
4. **Dispatcher** — `parseBreathingFile` calls `parseVxp` for `.vxp` filenames and `parseCsv` for `.csv` filenames

---

## Out of Scope

- Applying `Scale_factor` to amplitude (no effect on results)
- Using `mark` column markers for peak detection assistance
- VXP-exported 7-column CSV format (not used by the JS pipeline)
- Waveform chart display of VXP phase/mark metadata
