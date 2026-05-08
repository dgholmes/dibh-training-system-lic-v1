#!/usr/bin/env python3
"""
VXP <-> app CSV converter for DIBH analysis validation.

Usage:
    python convert.py vxp2csv input.vxp [output.csv]
    python convert.py csv2vxp input.csv [output.vxp]

App CSV format: two-column (t in seconds, raw = amplitude).
VXP format: Varian RPM [Header]/[Data] format, timestamp in milliseconds.

The converter exists to validate that VXP and CSV analysis paths produce
identical results. Convert a VXP file to app CSV, run both through the
JS analysis pipeline, and compare outputs.
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
