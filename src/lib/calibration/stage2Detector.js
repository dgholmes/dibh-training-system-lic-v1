/**
 * Stage 2: Maximum inspiration detector.
 * Ported from dibh_calibration.py Stage2Detector.
 */

import { onePoleLowpass, robustMean } from './utils.js';

/**
 * Attempt result (Python AttemptResult).
 */
export function createAttemptResult({
  attempt_idx,
  baseline_val,
  start_level,
  inhale_start_t,
  peak_t,
  peak_val,
  amp,
  time_to_peak,
  valid,
  reason,
}) {
  return {
    attempt_idx,
    baseline_val,
    start_level,
    inhale_start_t,
    peak_t,
    peak_val,
    amp,
    time_to_peak,
    valid,
    reason,
  };
}

const DEFAULT_CONFIG = {
  reps: 3,
  prep_sec: 2.0,
  baseline_sec: 1.0,
  inspiration_timeout_sec: 8.0,
  return_timeout_sec: 10.0,
  rest_sec: 2.0,
  start_ratio: 1.5,
  start_min_abs: 0.15,
  peak_confirm_dy_neg: 0.05,
  peak_min_amp: 0.3,
  return_margin_ratio: 0.15,
  filt_fc_hz: 0.8,
  dy_fc_hz: 1.5,
  plot_window_sec: 40.0,
};

export class Stage2Detector {
  constructor(config = {}) {
    const c = { ...DEFAULT_CONFIG, ...config };
    this.reps = c.reps;
    this.prep_sec = c.prep_sec;
    this.baseline_sec = c.baseline_sec;
    this.inspiration_timeout_sec = c.inspiration_timeout_sec;
    this.return_timeout_sec = c.return_timeout_sec;
    this.rest_sec = c.rest_sec;
    this.start_ratio = c.start_ratio;
    this.start_min_abs = c.start_min_abs;
    this.peak_confirm_dy_neg = c.peak_confirm_dy_neg;
    this.peak_min_amp = c.peak_min_amp;
    this.return_margin_ratio = c.return_margin_ratio;
    this.filt_fc_hz = c.filt_fc_hz;
    this.dy_fc_hz = c.dy_fc_hz;
    this.plot_window_sec = c.plot_window_sec;
    this._max_rep_invalid_retries = 2;
    this.reset();
  }

  reset() {
    this.ts = [];
    this.raw = [];
    this.filt = [];
    this.dy = [];
    this.dy_s = [];

    this.baseline_marks = [];
    this.start_marks = [];
    this.peak_marks = [];

    this._yf = null;
    this._dyf = null;
    this._prev_t = null;
    this._prev_yf = null;

    this.running = false;
    this.attempt_idx = 0;
    this.phase = 'IDLE';
    this.phase_t0 = null;

    this._baseline_window = [];
    this.baseline_val = NaN;
    this.start_level = NaN;

    this.inhale_start_t = null;
    this.peak_t = null;
    this.peak_val = null;
    this._peak_val_running = null;
    this._peak_t_running = null;

    this.attempt_results = [];

    this._typical_amp = null;
    this._min_deep_amp = this.peak_min_amp;
    this._wait_inhale_retries = 0;
    this._inhale_timeout_retries = 0;
    this._weak_inhale_retries = 0;
    this.prompt = null;
    this._rep_invalid_retries = 0;
  }

  begin(t) {
    this.running = true;
    this.attempt_idx = 0;
    this._rep_invalid_retries = 0;
    this._goto_phase('PREP', t);
  }

  start(t) {
    this.begin(t);
  }

  stop() {
    this.running = false;
    this.phase = 'IDLE';
  }

  is_done() {
    return this.phase === 'DONE';
  }

  _goto_phase(phase, t) {
    this.phase = phase;
    this.phase_t0 = t;
    if (phase === 'PREP') {
      this._baseline_window = [];
      this.baseline_val = NaN;
      this.start_level = NaN;
      this.inhale_start_t = null;
      this.peak_t = null;
      this.peak_val = null;
      this._peak_val_running = null;
      this._peak_t_running = null;
      this._typical_amp = null;
      this._min_deep_amp = this.peak_min_amp;
      this._wait_inhale_retries = 0;
      this._inhale_timeout_retries = 0;
      this._weak_inhale_retries = 0;
      this.prompt = null;
    } else if (phase === 'WAIT_INHALE') {
      this._wait_inhale_retries = 0;
      this.prompt = null;
    } else if (phase === 'INHALE') {
      this._inhale_timeout_retries = 0;
      this._weak_inhale_retries = 0;
      this.prompt = null;
    } else if (phase === 'REST' || phase === 'DONE') {
      this.prompt = null;
    }
  }

  _phase_elapsed(t) {
    if (this.phase_t0 == null) return 0;
    return t - this.phase_t0;
  }

  _finalize_attempt(valid, reason) {
    let amp = null;
    let ttp = null;
    if (this.peak_val != null && Number.isFinite(this.baseline_val)) {
      amp = this.peak_val - this.baseline_val;
    }
    if (this.inhale_start_t != null && this.peak_t != null) {
      ttp = this.peak_t - this.inhale_start_t;
    }

    const res = createAttemptResult({
      attempt_idx: this.attempt_idx,
      baseline_val: Number.isFinite(this.baseline_val) ? this.baseline_val : NaN,
      start_level: Number.isFinite(this.start_level) ? this.start_level : NaN,
      inhale_start_t: this.inhale_start_t,
      peak_t: this.peak_t,
      peak_val: this.peak_val,
      amp,
      time_to_peak: ttp,
      valid,
      reason,
    });
    this.attempt_results.push(res);
  }

  update(t, y_raw) {
    let dt = 0;
    if (this._prev_t != null) dt = t - this._prev_t;
    this._prev_t = t;

    if (this._yf == null) {
      this._yf = y_raw;
    } else {
      this._yf = onePoleLowpass(this._yf, y_raw, dt, this.filt_fc_hz);
    }

    let dy = 0;
    if (this._prev_yf != null && dt > 0) {
      dy = (this._yf - this._prev_yf) / dt;
    }
    this._prev_yf = this._yf;

    if (this._dyf == null) {
      this._dyf = dy;
    } else {
      this._dyf = onePoleLowpass(this._dyf, dy, dt, this.dy_fc_hz);
    }

    this.ts.push(t);
    this.raw.push(y_raw);
    this.filt.push(this._yf);
    this.dy.push(dy);
    this.dy_s.push(this._dyf);

    while (this.ts.length > 0 && this.ts[this.ts.length - 1] - this.ts[0] > this.plot_window_sec) {
      this.ts.shift();
      this.raw.shift();
      this.filt.shift();
      this.dy.shift();
      this.dy_s.shift();
    }

    if (!this.running || this.phase === 'IDLE' || this.phase === 'DONE') return;

    const elapsed = this._phase_elapsed(t);

    if (this.phase === 'PREP') {
      this._baseline_window.push(this._yf);
      const max_keep = Math.max(10, Math.floor((this.prep_sec + 1.0) / Math.max(dt, 1e-3)));
      while (this._baseline_window.length > max_keep) {
        this._baseline_window.shift();
      }

      if (elapsed >= this.prep_sec) {
        const dt_eff = dt <= 0 ? 0.1 : dt;
        const n = Math.max(5, Math.floor(this.baseline_sec / dt_eff));
        const baseline_samples = this._baseline_window.slice(-n);
        this.baseline_val = robustMean(baseline_samples);
        const normal_peak =
          this._baseline_window.length > 0
            ? Math.max(...this._baseline_window)
            : this.baseline_val;
        this._typical_amp = Math.max(0, normal_peak - this.baseline_val);
        this._min_deep_amp =
          this._typical_amp > 0.1
            ? Math.max(this.peak_min_amp, this._typical_amp * 0.8)
            : this.peak_min_amp;
        const ratio_level = this.baseline_val * this.start_ratio;
        const abs_level = this.baseline_val + this.start_min_abs;
        this.start_level = Math.max(ratio_level, abs_level);
        this.baseline_marks.push([t, this.baseline_val]);
        this._goto_phase('WAIT_INHALE', t);
      }
    } else if (this.phase === 'WAIT_INHALE') {
      if (this._yf >= this.start_level && this._dyf > 0) {
        this.inhale_start_t = t;
        this.start_marks.push([t, this._yf]);
        this._peak_val_running = this._yf;
        this._peak_t_running = t;
        this._goto_phase('INHALE', t);
        return;
      }

      if (elapsed >= this.inspiration_timeout_sec) {
        if (this._wait_inhale_retries < 2) {
          this.prompt = 'Please inhale deeply now.';
          this.phase_t0 = t;
          this._wait_inhale_retries += 1;
        } else {
          this.prompt = null;
          if (this._rep_invalid_retries < this._max_rep_invalid_retries) {
            this._rep_invalid_retries += 1;
            this._goto_phase('REST', t);
            this.prompt = 'Please redo this rep.';
          } else {
            this._finalize_attempt(false, 'timeout_wait_inhale');
            this.attempt_idx += 1;
            if (this.attempt_idx >= this.reps) {
              this._goto_phase('DONE', t);
            } else {
              this._rep_invalid_retries = 0;
              this._goto_phase('REST', t);
            }
          }
        }
      }
    } else if (this.phase === 'INHALE') {
      if (this._peak_val_running == null || this._yf > this._peak_val_running) {
        this._peak_val_running = this._yf;
        this._peak_t_running = t;
      }

      if (this._dyf <= -Math.abs(this.peak_confirm_dy_neg)) {
        this.peak_val = this._peak_val_running;
        this.peak_t = this._peak_t_running;
        this.peak_marks.push([this.peak_t, this.peak_val]);
        const amp = this.peak_val - this.baseline_val;
        if (amp < this._min_deep_amp) {
          if (this._weak_inhale_retries < 1) {
            this.inhale_start_t = null;
            this.peak_t = null;
            this.peak_val = null;
            this._peak_val_running = null;
            this._peak_t_running = null;
            this.phase_t0 = t;
            this._weak_inhale_retries += 1;
            this._goto_phase('WAIT_INHALE', t);
            this.prompt = 'Inhale deeper - above normal breathing.';
          } else {
            this.prompt = null;
            if (this._rep_invalid_retries < this._max_rep_invalid_retries) {
              this._rep_invalid_retries += 1;
              this._goto_phase('REST', t);
              this.prompt = 'Please redo this rep.';
            } else {
              this._finalize_attempt(false, `weak_inhale_amp<${this._min_deep_amp.toFixed(3)}`);
              this.attempt_idx += 1;
              if (this.attempt_idx >= this.reps) {
                this._goto_phase('DONE', t);
              } else {
                this._rep_invalid_retries = 0;
                this._goto_phase('REST', t);
              }
            }
          }
          return;
        }
        this.prompt = null;
        this._goto_phase('WAIT_RETURN', t);
        return;
      }

      if (elapsed >= this.return_timeout_sec) {
        if (this._inhale_timeout_retries < 2) {
          this.inhale_start_t = null;
          this._peak_val_running = null;
          this._peak_t_running = null;
          this.phase_t0 = t;
          this._inhale_timeout_retries += 1;
          this._goto_phase('WAIT_INHALE', t);
          this.prompt = 'Please inhale deeply then exhale slowly.';
        } else {
          this.prompt = null;
          if (this._rep_invalid_retries < this._max_rep_invalid_retries) {
            this._rep_invalid_retries += 1;
            this._goto_phase('REST', t);
            this.prompt = 'Please redo this rep.';
          } else {
            this._finalize_attempt(false, 'timeout_peak_not_found');
            this.attempt_idx += 1;
            if (this.attempt_idx >= this.reps) {
              this._goto_phase('DONE', t);
            } else {
              this._rep_invalid_retries = 0;
              this._goto_phase('REST', t);
            }
          }
        }
      }
    } else if (this.phase === 'WAIT_RETURN') {
      if (this.peak_val == null) {
        if (this._rep_invalid_retries < this._max_rep_invalid_retries) {
          this._rep_invalid_retries += 1;
          this._goto_phase('REST', t);
          this.prompt = 'Please redo this rep.';
        } else {
          this._finalize_attempt(false, 'internal_no_peak');
          this.attempt_idx += 1;
          if (this.attempt_idx >= this.reps) {
            this._goto_phase('DONE', t);
          } else {
            this._rep_invalid_retries = 0;
            this._goto_phase('REST', t);
          }
        }
        return;
      }

      const amp = Math.max(0, this.peak_val - this.baseline_val);
      const margin = Math.max(this.start_min_abs, this.return_margin_ratio * amp);
      if (Math.abs(this._yf - this.baseline_val) <= margin) {
        this._rep_invalid_retries = 0;
        this._finalize_attempt(true, 'ok');
        this.attempt_idx += 1;
        if (this.attempt_idx >= this.reps) {
          this._goto_phase('DONE', t);
        } else {
          this._goto_phase('REST', t);
        }
        return;
      }

      if (elapsed >= this.return_timeout_sec) {
        if (this._rep_invalid_retries < this._max_rep_invalid_retries) {
          this._rep_invalid_retries += 1;
          this._goto_phase('REST', t);
          this.prompt = 'Please redo this rep.';
        } else {
          this._finalize_attempt(false, 'timeout_return_baseline');
          this.attempt_idx += 1;
          if (this.attempt_idx >= this.reps) {
            this._goto_phase('DONE', t);
          } else {
            this._rep_invalid_retries = 0;
            this._goto_phase('REST', t);
          }
        }
      }
    } else if (this.phase === 'REST') {
      if (elapsed >= this.rest_sec) {
        this._goto_phase('PREP', t);
      }
    }
  }

  get_max_amp() {
    const valid = this.attempt_results.filter((a) => a.valid && a.amp != null);
    if (valid.length === 0) return null;
    return Math.max(...valid.map((a) => a.amp));
  }

  get_avg_amp() {
    const valid = this.attempt_results.filter((a) => a.valid && a.amp != null);
    if (valid.length === 0) return null;
    const sum = valid.reduce((acc, a) => acc + a.amp, 0);
    return sum / valid.length;
  }

  get_min_amp() {
    const valid = this.attempt_results.filter((a) => a.valid && a.amp != null);
    if (valid.length === 0) return null;
    return Math.min(...valid.map((a) => a.amp));
  }
}
