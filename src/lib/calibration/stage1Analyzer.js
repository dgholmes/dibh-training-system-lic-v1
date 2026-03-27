/**
 * Stage 1: Ensemble respiration analyzer for CV calculation.
 * Ported from dibh_calibration.py Stage1EnsembleRTAnalyzer.
 */

import {
  quantileSafe,
  iirLowpass,
  simplePeaks,
  median,
  interpAt,
} from './utils.js';

/**
 * Trough-Peak-Trough cycle (Python TPTCycle).
 */
export function createTPTCycle({
  t0,
  tp,
  t1,
  trough0_val,
  peak_val,
  trough1_val,
  ok = false,
  matched_rise = null,
  matched_fall = null,
}) {
  return {
    t0,
    tp,
    t1,
    trough0_val,
    peak_val,
    trough1_val,
    ok,
    matched_rise,
    matched_fall,
    get period_s() {
      return this.t1 - this.t0;
    },
    get amp() {
      return this.peak_val - 0.5 * (this.trough0_val + this.trough1_val);
    },
  };
}

const DEFAULT_CONFIG = {
  calib_sec: 20.0,
  y_fc_hz: 1.1,
  dy_fc_hz: 1.0,
  q_hi: 0.50,
  lo_frac: 0.55,
  tpt_prom_frac: 0.10,
  tpt_prom_min: 0.05,
  tpt_min_peak_distance_sec: 1.0,
  min_cycle_s: 1.0,
  max_cycle_s: 10.0,
  min_half_cycle_s: 0.5,
  max_half_cycle_s: 6.0,
};

/**
 * Stage 1: Ensemble respiration analyzer.
 */
export class Stage1EnsembleRTAnalyzer {
  constructor(config = {}) {
    const c = { ...DEFAULT_CONFIG, ...config };
    this.calib_sec = c.calib_sec;
    this.y_fc_hz = c.y_fc_hz;
    this.dy_fc_hz = c.dy_fc_hz;
    this.q_hi = c.q_hi;
    this.lo_frac = c.lo_frac;
    this.tpt_prom_frac = c.tpt_prom_frac;
    this.tpt_prom_min = c.tpt_prom_min;
    this.tpt_min_peak_distance_sec = c.tpt_min_peak_distance_sec;
    this.min_cycle_s = c.min_cycle_s;
    this.max_cycle_s = c.max_cycle_s;
    this.min_half_cycle_s = c.min_half_cycle_s;
    this.max_half_cycle_s = c.max_half_cycle_s;
    this.reset();
  }

  reset() {
    this.t_buf = [];
    this.raw_buf = [];
    this.y_buf = [];
    this.dy_buf = [];
    this._y_prev = null;
    this._dy_prev = null;
    this._t_prev = null;
    this._y_f = null;
    this._dy_f = null;
    this.hi = null;
    this.lo = null;
    this._pos_regime = false;
    this._neg_regime = false;
    this.rise_starts = [];
    this.fall_starts = [];
    this.cycles = [];
    this._last_cycle_end_t = -1e9;
    this.start_time = null;
    this.running = false;
  }

  start(t) {
    this.reset();
    this.start_time = t;
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  is_done() {
    const ok_cycles = this.cycles.filter((c) => c.ok);
    return ok_cycles.length >= 10;
  }

  update(t, raw) {
    if (!this.running) return;

    let dt = 0;
    if (this._t_prev != null) dt = t - this._t_prev;
    this._t_prev = t;

    this._y_f = iirLowpass(this._y_f, raw, dt, this.y_fc_hz);

    let dy_inst = 0;
    if (this._y_prev != null && dt > 1e-6) {
      dy_inst = (this._y_f - this._y_prev) / dt;
    }
    this._y_prev = this._y_f;

    this._dy_f = iirLowpass(this._dy_f, dy_inst, dt, this.dy_fc_hz);

    this.t_buf.push(t);
    this.raw_buf.push(raw);
    this.y_buf.push(this._y_f);
    this.dy_buf.push(this._dy_f);

    this._update_hi_lo_continuous();
    this._detect_derivative_events(t, this._dy_f);
    this._detect_tpt_new_cycles();
  }

  _update_hi_lo_continuous() {
    if (this.dy_buf.length < 20) return;
    const t = this.t_buf;
    const dy = this.dy_buf;
    if (t.length < 20) return;
    const t_latest = t[t.length - 1];
    const t0 = Math.max(t[0], t_latest - this.calib_sec);
    const mask = t.map((tt) => tt >= t0);
    const dy_slice = dy.filter((_, i) => mask[i]);
    if (dy_slice.length < 20) return;
    const abs_dy = dy_slice.map((v) => Math.abs(v));
    const hi = quantileSafe(abs_dy, this.q_hi);
    if (hi == null) return;
    this.hi = Math.max(hi, 1e-6);
    this.lo = this.hi * this.lo_frac;
  }

  _detect_derivative_events(t, dy) {
    if (this.hi == null || this.lo == null) return;
    const entry_thresh = 0.7 * this.hi;

    if (!this._pos_regime && dy >= entry_thresh) {
      this._pos_regime = true;
      this.rise_starts.push(t);
    } else if (this._pos_regime && dy <= this.lo) {
      this._pos_regime = false;
    }

    if (!this._neg_regime && dy <= -entry_thresh) {
      this._neg_regime = true;
      this.fall_starts.push(t);
    } else if (this._neg_regime && dy >= -this.lo) {
      this._neg_regime = false;
    }
  }

  _detect_tpt_new_cycles() {
    if (this.y_buf.length < 40) return;
    const t = this.t_buf;
    const y = this.y_buf;
    if (t.length < 6) return;

    const dt_arr = [];
    for (let i = 1; i < t.length; i++) {
      const d = t[i] - t[i - 1];
      if (Number.isFinite(d) && d > 1e-6) dt_arr.push(d);
    }
    if (dt_arr.length < 4) return;
    const fs = 1.0 / median(dt_arr);

    const p95 = quantileSafe(y, 0.95);
    const p05 = quantileSafe(y, 0.05);
    if (p95 == null || p05 == null) return;
    const y_range = Math.max(p95 - p05, 1e-6);
    const prom = Math.max(this.tpt_prom_min, this.tpt_prom_frac * y_range);
    const min_dist = Math.max(1, Math.floor(fs * this.tpt_min_peak_distance_sec));

    const peaks = simplePeaks(y, min_dist);
    const negY = y.map((v) => -v);
    const troughs = simplePeaks(negY, min_dist);

    if (peaks.length === 0 || troughs.length < 2) return;

    peaks.sort((a, b) => a - b);
    troughs.sort((a, b) => a - b);

    for (const ip of peaks) {
      const i0_candidates = troughs.filter((idx) => idx < ip);
      const i1_candidates = troughs.filter((idx) => idx > ip);
      if (i0_candidates.length === 0 || i1_candidates.length === 0) continue;

      const i0 = i0_candidates[i0_candidates.length - 1];
      const i1 = i1_candidates[0];

      const t0 = t[i0];
      const tp = t[ip];
      const t1 = t[i1];
      if (t1 <= this._last_cycle_end_t + 1e-6) continue;

      const a = tp - t0;
      const b = t1 - tp;
      const c = t1 - t0;
      if (a < this.min_half_cycle_s || a > this.max_half_cycle_s) continue;
      if (b < this.min_half_cycle_s || b > this.max_half_cycle_s) continue;
      if (c < this.min_cycle_s || c > this.max_cycle_s) continue;

      const cyc = createTPTCycle({
        t0,
        tp,
        t1,
        trough0_val: y[i0],
        peak_val: y[ip],
        trough1_val: y[i1],
      });
      this._match_derivative_to_cycle(cyc);
      this.cycles.push(cyc);
      this._last_cycle_end_t = cyc.t1;
    }
  }

  _match_derivative_to_cycle(cyc) {
    if (this.rise_starts.length === 0 || this.fall_starts.length === 0) {
      cyc.ok = false;
      return;
    }
    let rise = null;
    for (let k = this.rise_starts.length - 1; k >= 0; k--) {
      const tr = this.rise_starts[k];
      if (tr < cyc.t0) break;
      if (cyc.t0 <= tr && tr <= cyc.tp) {
        rise = tr;
        break;
      }
    }
    let fall = null;
    for (const tf of this.fall_starts) {
      if (tf < cyc.tp) continue;
      if (cyc.tp <= tf && tf <= cyc.t1) {
        fall = tf;
        break;
      }
    }
    if (rise != null && fall != null && rise < fall) {
      cyc.ok = true;
      cyc.matched_rise = rise;
      cyc.matched_fall = fall;
    } else {
      cyc.ok = false;
    }
  }

  get_cv_period() {
    const ok_cycles = this.cycles.filter((c) => c.ok);
    if (ok_cycles.length < 3) return null;
    const periods = ok_cycles.map((c) => c.period_s);
    const m = periods.reduce((a, b) => a + b, 0) / periods.length;
    if (m <= 1e-6) return null;
    const variance =
      periods.reduce((acc, p) => acc + (p - m) ** 2, 0) / periods.length;
    const std = Math.sqrt(variance);
    return (std / m) * 100;
  }

  get_cv() {
    const ok_cycles = this.cycles.filter((c) => c.ok);
    if (ok_cycles.length < 3) return null;
    const amps = ok_cycles.map((c) => c.amp);
    const m = amps.reduce((a, b) => a + b, 0) / amps.length;
    if (Math.abs(m) <= 1e-6) return null;
    const variance =
      amps.reduce((acc, a) => acc + (a - m) ** 2, 0) / amps.length;
    const std = Math.sqrt(variance);
    return (std / Math.abs(m)) * 100;
  }
}
