/**
 * Stage 3: DIBH hold detector.
 * Ported from dibh_calibration.py Stage3Detector, OnePoleLPF, DerivativeEstimator.
 */

import { median, mad } from './utils.js';

/** One-pole LPF (Python OnePoleLPF). */
export class OnePoleLPF {
  constructor(fc_hz, init = null) {
    this.fc_hz = fc_hz;
    this.y = init;
    this.t_prev = null;
  }

  reset() {
    this.y = null;
    this.t_prev = null;
  }

  update(t, x) {
    if (this.y == null || this.t_prev == null) {
      this.y = x;
      this.t_prev = t;
      return this.y;
    }
    const dt = Math.max(1e-6, t - this.t_prev);
    const rc = 1.0 / (2.0 * Math.PI * Math.max(1e-6, this.fc_hz));
    const alpha = Math.exp(-dt / rc);
    this.y = alpha * this.y + (1.0 - alpha) * x;
    this.t_prev = t;
    return this.y;
  }
}

/** Derivative estimator with smoothed dy (Python DerivativeEstimator). */
export class DerivativeEstimator {
  constructor(dy_fc_hz) {
    this.prev_t = null;
    this.prev_y = null;
    this.dy_lpf = new OnePoleLPF(dy_fc_hz, 0);
  }

  reset() {
    this.prev_t = null;
    this.prev_y = null;
    this.dy_lpf.reset();
    this.dy_lpf.y = 0;
  }

  update(t, y) {
    if (this.prev_t == null) {
      this.prev_t = t;
      this.prev_y = y;
      return [0, 0];
    }
    const dt = Math.max(1e-6, t - this.prev_t);
    const dy = (y - this.prev_y) / dt;
    const dy_s = this.dy_lpf.update(t, dy);
    this.prev_t = t;
    this.prev_y = y;
    return [dy, dy_s];
  }
}

const Phase = {
  IDLE: 'IDLE',
  PREP: 'PREP',
  WAIT_HOLD_START: 'WAIT_HOLD_START',
  HOLD: 'HOLD',
  REST: 'REST',
  DONE: 'DONE',
};

/**
 * Stage 3 attempt (Python Stage3Attempt).
 */
export function createStage3Attempt({
  idx,
  baseline,
  max_amp,
  hold_ratio,
  release_ratio,
  target_ratio,
  hold_th,
  release_th,
  target_th,
  hold_start_t = null,
  hold_end_t = null,
  hold_duration = null,
  hold_mean = null,
  hold_std = null,
  hold_min = null,
  hold_max = null,
  rep_peak_val = null,
  hold_quality_pct = null,
  valid = false,
  reason = '',
}) {
  return {
    idx,
    baseline,
    max_amp,
    hold_ratio,
    release_ratio,
    target_ratio,
    hold_th,
    release_th,
    target_th,
    hold_start_t,
    hold_end_t,
    hold_duration,
    hold_mean,
    hold_std,
    hold_min,
    hold_max,
    rep_peak_val,
    hold_quality_pct,
    valid,
    reason,
  };
}

// Match dibh_calibration.py Stage3Detector when created after Stage 2 (lines 2308-2326)
const DEFAULT_CONFIG = {
  reps: 3,
  prep_sec: 4.0,
  baseline_sec: 2.0,
  rest_sec: 4.0,
  timeout_inhale_sec: 12.0,
  max_hold_sec: 40.0,
  min_hold_sec: 3.0,
  hold_ratio: 0.80,
  release_ratio: 0.50, // breathing end when amp falls below 0.5 of threshold (b + 0.5*A)
  target_ratio: 0.85,
  inhale_start_ratio: 0.40,
  baseline_dy_mad_k: 2.8,
  hold_end_mode: 'release_and_exhale',
  exhale_dy_thresh: 2.5,
  confirm_sec: 0.25,
  min_dwell_wait_hold_start_sec: 1.0,
};

export class Stage3Detector {
  constructor(max_amp, config = {}) {
    const c = { ...DEFAULT_CONFIG, ...config };
    this.reps = c.reps;
    this.prep_sec = c.prep_sec;
    this.baseline_sec = c.baseline_sec;
    this.rest_sec = c.rest_sec;
    this.timeout_inhale_sec = c.timeout_inhale_sec;
    this.max_hold_sec = c.max_hold_sec;
    this.min_hold_sec = c.min_hold_sec;
    this.hold_ratio = c.hold_ratio;
    this.release_ratio = c.release_ratio;
    this.target_ratio = c.target_ratio;
    this.inhale_start_ratio = c.inhale_start_ratio;
    this.baseline_dy_mad_k = c.baseline_dy_mad_k;
    this.hold_end_mode = c.hold_end_mode;
    this.exhale_dy_thresh = c.exhale_dy_thresh;
    this.confirm_sec = c.confirm_sec;
    this.min_dwell_wait_hold_start_sec = c.min_dwell_wait_hold_start_sec;
    this.max_amp_global = max_amp;
    this._max_rep_invalid_retries = 2;
    this.reset();
  }

  reset() {
    this.phase = Phase.IDLE;
    this.session_running = false;
    this.session_t0 = null;
    this.phase_t0 = null;
    this.attempt_idx = 0;
    this.attempts = [];
    this.prep_buf = [];
    this.hold_y = [];
    this.hold_t = [];
    this._inhale_started = false;
    this._inhale_start_t = null;
    this._hold_enter_confirm_t = null;
    this._hold_exit_confirm_t = null;
    this._peak_val_running = null;
    this.baseline_val = null;
    this.hold_th = null;
    this.release_th = null;
    this.target_th = null;
    this._rep_invalid_retries = 0;
  }

  start(t) {
    this.reset();
    this.start_time = t;
    this.session_running = true;
    this.session_t0 = t;
    this._rep_invalid_retries = 0;
    this._enter_phase(Phase.PREP, t);
  }

  stop() {
    this.session_running = false;
  }

  is_done() {
    return this.phase === Phase.DONE;
  }

  _enter_phase(phase, t) {
    this.phase = phase;
    this.phase_t0 = t;
    if (phase === Phase.PREP) {
      this.prep_buf = [];
      this.baseline_val = null;
      this.hold_th = null;
      this.release_th = null;
      this.target_th = null;
      this._inhale_started = false;
      this._inhale_start_t = null;
      this._hold_enter_confirm_t = null;
      this._hold_exit_confirm_t = null;
      this.hold_y = [];
      this.hold_t = [];
    } else if (phase === Phase.WAIT_HOLD_START) {
      this._inhale_started = false;
      this._inhale_start_t = null;
      this._hold_enter_confirm_t = null;
      this._peak_val_running = null;
    } else if (phase === Phase.HOLD) {
      this._hold_exit_confirm_t = null;
      this.hold_y = [];
      this.hold_t = [];
    } else if (phase === Phase.REST) {
      this._inhale_started = false;
      this._inhale_start_t = null;
      this._hold_enter_confirm_t = null;
      this._hold_exit_confirm_t = null;
    }
  }

  _phase_elapsed(t) {
    if (this.phase_t0 == null) return 0;
    return t - this.phase_t0;
  }

  _finalize_attempt(valid, reason, t) {
    if (this.attempt_idx <= 0 || this.attempt_idx > this.attempts.length) return;
    const a = this.attempts[this.attempt_idx - 1];
    a.valid = valid;
    a.reason = reason;
    if (a.hold_start_t != null && a.hold_end_t != null) {
      a.hold_duration = a.hold_end_t - a.hold_start_t;
    }
    if (this.hold_y.length > 0) {
      const sum = this.hold_y.reduce((acc, v) => acc + v, 0);
      a.hold_mean = sum / this.hold_y.length;
      const variance =
        this.hold_y.reduce((acc, v) => acc + (v - a.hold_mean) ** 2, 0) / this.hold_y.length;
      a.hold_std = Math.sqrt(variance);
      a.hold_min = Math.min(...this.hold_y);
      a.hold_max = Math.max(...this.hold_y);
      const baseline = a.baseline;
      const peak = a.rep_peak_val;
      if (
        a.hold_mean != null &&
        peak != null &&
        Math.abs(peak - baseline) > 1e-9
      ) {
        const span = peak - baseline;
        const above_baseline = a.hold_mean - baseline;
        let pct = (above_baseline / span) * 100;
        a.hold_quality_pct = Math.max(0, Math.min(100, pct));
      } else if (a.hold_mean != null && peak != null) {
        a.hold_quality_pct = a.hold_mean >= peak ? 100 : 0;
      }
    }
    if (this.attempt_idx >= this.reps) {
      this._enter_phase(Phase.DONE, t);
      this.session_running = false;
    } else {
      this._rep_invalid_retries = 0;
      this._enter_phase(Phase.REST, t);
    }
  }

  _compute_baseline_from_prep() {
    if (this.prep_buf.length === 0) return [null, null];
    const t_last = this.prep_buf[this.prep_buf.length - 1][0];
    const t0 = t_last - this.baseline_sec;
    const tail = this.prep_buf.filter(([t]) => t >= t0);
    if (tail.length < 5) return [null, null];
    const ys = tail.map(([, y]) => y);
    const dys = tail.map(([, , dy_s]) => dy_s);
    const base = median(ys);
    const dy_m = mad(dys);
    const sigma = Number.isFinite(dy_m) ? 1.4826 * dy_m : 0;
    const dy_quiet = Math.max(1e-6, this.baseline_dy_mad_k * sigma);
    return [base, dy_quiet];
  }

  _init_attempt_thresholds() {
    const b = this.baseline_val;
    const A = this.max_amp_global;
    this.hold_th = b + A * this.hold_ratio;
    this.release_th = b + A * this.release_ratio;
    this.target_th = b + A * this.target_ratio;
  }

  update(t, y_f, dy_s) {
    if (!this.session_running) return;
    if (this.phase === Phase.DONE) {
      this.session_running = false;
      return;
    }
    const pe = this._phase_elapsed(t);

    if (this.phase === Phase.PREP) {
      this.prep_buf.push([t, y_f, dy_s]);
      if (pe >= this.prep_sec) {
        const [base, dy_quiet] = this._compute_baseline_from_prep();
        if (base == null) return;
        const t_last = this.prep_buf[this.prep_buf.length - 1][0];
        const t0 = t_last - this.baseline_sec;
        const tail = this.prep_buf.filter(([tt]) => tt >= t0);
        const quiet = tail.filter(([, , ddy]) => Math.abs(ddy) < dy_quiet).map(([, yy]) => yy);
        if (quiet.length < Math.max(5, Math.floor(0.5 * tail.length))) {
          if (this._rep_invalid_retries < this._max_rep_invalid_retries) {
            this._rep_invalid_retries += 1;
            this._enter_phase(Phase.REST, t);
            return;
          }
          this.attempt_idx += 1;
          this.attempts.push(
            createStage3Attempt({
              idx: this.attempt_idx,
              baseline: base,
              max_amp: this.max_amp_global,
              hold_ratio: this.hold_ratio,
              release_ratio: this.release_ratio,
              target_ratio: this.target_ratio,
              hold_th: NaN,
              release_th: NaN,
              target_th: NaN,
            })
          );
          this._finalize_attempt(false, 'prep_unstable', t);
          return;
        }
        this.attempt_idx += 1;
        this.baseline_val = base;
        this._init_attempt_thresholds();
        this.attempts.push(
          createStage3Attempt({
            idx: this.attempt_idx,
            baseline: this.baseline_val,
            max_amp: this.max_amp_global,
            hold_ratio: this.hold_ratio,
            release_ratio: this.release_ratio,
            target_ratio: this.target_ratio,
            hold_th: this.hold_th,
            release_th: this.release_th,
            target_th: this.target_th,
          })
        );
        this._enter_phase(Phase.WAIT_HOLD_START, t);
      }
      return;
    }

    if (this.phase === Phase.WAIT_HOLD_START) {
      const inhale_start_th =
        this.baseline_val + this.max_amp_global * this.inhale_start_ratio;
      if (!this._inhale_started && y_f >= inhale_start_th) {
        this._inhale_started = true;
        this._inhale_start_t = t;
        this._peak_val_running = y_f;
      }
      if (this._inhale_started && this._peak_val_running != null) {
        if (y_f > this._peak_val_running) this._peak_val_running = y_f;
      }
      if (pe >= this.timeout_inhale_sec) {
        if (this._rep_invalid_retries < this._max_rep_invalid_retries) {
          this._rep_invalid_retries += 1;
          if (this.attempts.length >= this.attempt_idx) {
            this.attempts.pop();
            this.attempt_idx -= 1;
          }
          this._enter_phase(Phase.REST, t);
          return;
        }
        this._finalize_attempt(false, 'timeout_wait_hold_start', t);
        return;
      }
      if (y_f >= this.hold_th) {
        if (this._hold_enter_confirm_t == null) {
          this._hold_enter_confirm_t = t;
        } else if (
          t - this._hold_enter_confirm_t >= this.confirm_sec &&
          pe >= this.min_dwell_wait_hold_start_sec
        ) {
          const a = this.attempts[this.attempt_idx - 1];
          a.hold_start_t = t;
          a.rep_peak_val =
            this._peak_val_running != null ? this._peak_val_running : y_f;
          this._enter_phase(Phase.HOLD, t);
        }
      } else {
        this._hold_enter_confirm_t = null;
      }
      return;
    }

    if (this.phase === Phase.HOLD) {
      const a = this.attempts[this.attempt_idx - 1];
      if (a.hold_start_t == null) a.hold_start_t = t;
      this.hold_y.push(y_f);
      this.hold_t.push(t);
      if (pe >= this.max_hold_sec) {
        a.hold_end_t = t;
        this._finalize_attempt(pe >= this.min_hold_sec, 'max_hold_reached', t);
        return;
      }
      const below_release = y_f < this.release_th;
      const exhale_like = dy_s < -Math.abs(this.exhale_dy_thresh);
      let end_now = false;
      if (this.hold_end_mode === 'release_only') {
        end_now = below_release;
      } else if (this.hold_end_mode === 'exhale_only') {
        end_now = exhale_like;
      } else {
        end_now = below_release && exhale_like;
      }
      if (end_now) {
        if (this._hold_exit_confirm_t == null) {
          this._hold_exit_confirm_t = t;
        } else if (t - this._hold_exit_confirm_t >= this.confirm_sec) {
          a.hold_end_t = t;
          const dur = a.hold_end_t - a.hold_start_t;
          this._finalize_attempt(dur >= this.min_hold_sec, 'hold_end', t);
        }
      } else {
        this._hold_exit_confirm_t = null;
      }
      return;
    }

    if (this.phase === Phase.REST) {
      if (pe >= this.rest_sec) {
        this._enter_phase(Phase.PREP, t);
      }
    }
  }

  get_avg_dibh() {
    const valid_attempts = this.attempts.filter(
      (a) => a.valid && a.hold_duration != null
    );
    if (valid_attempts.length === 0) return null;
    const sum = valid_attempts.reduce((acc, a) => acc + a.hold_duration, 0);
    return sum / valid_attempts.length;
  }

  get_avg_hold_quality_pct() {
    const valid_with_quality = this.attempts.filter(
      (a) => a.valid && a.hold_quality_pct != null
    );
    if (valid_with_quality.length === 0) return null;
    const sum = valid_with_quality.reduce((acc, a) => acc + a.hold_quality_pct, 0);
    return sum / valid_with_quality.length;
  }
}
