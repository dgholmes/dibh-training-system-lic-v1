#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DIBH Calibration System - Combined Stage1, Stage2, and Stage3

This script combines all three calibration stages into a single integrated system:
- Stage 1: Ensemble respiration analysis (CV calculation from at least 10 breath cycles)
- Stage 2: Maximum inspiration measurement (threshold for Stage 3)
- Stage 3: DIBH hold measurement (average of 3 reps for avgDIBH)

After completion, determines DIBH Type (A, B, or C) based on:
- TYPE A: avgDIBH >= 15초 AND CV < 15%
- TYPE C: avgDIBH < 10초 OR CV >= 30% (and not TYPE A)
- TYPE B: everything else

GUI Controls:
- Start Calibration: Begin the full calibration sequence
- Emergency Stop: Immediately halt current stage
- Restart Stage: Restart the current stage
- Restart Whole Calibration: Reset and restart from Stage 1
"""

from __future__ import annotations

import csv
import json
import math
import os
import queue
import threading
import time
from datetime import datetime
from collections import deque
from dataclasses import dataclass, asdict
from typing import Deque, Dict, List, Optional, Tuple

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.widgets import Button
from matplotlib.patches import Rectangle

from gdx import gdx

# Import all necessary classes and functions from the three stages
# (We'll include them inline to make this self-contained)

# ============================================================================
# UTILITY FUNCTIONS (from all stages)
# ============================================================================

def _quantile_safe(x: np.ndarray, q: float) -> Optional[float]:
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    if x.size < 10:
        return None
    return float(np.quantile(x, q))


def _iir_lowpass(prev_y: Optional[float], x: float, dt: float, fc_hz: float) -> float:
    """Simple 1st-order IIR low-pass."""
    if prev_y is None:
        return float(x)
    if dt <= 0:
        return float(prev_y)
    alpha = math.exp(-2.0 * math.pi * fc_hz * dt)
    return float(alpha * prev_y + (1.0 - alpha) * x)


def _simple_peaks(y: np.ndarray, distance: int = 1) -> np.ndarray:
    """Fallback peak detection without SciPy."""
    if y.size < 3:
        return np.array([], dtype=int)
    dy1 = y[1:-1] - y[:-2]
    dy2 = y[1:-1] - y[2:]
    idx = np.where((dy1 > 0) & (dy2 > 0))[0] + 1
    if distance <= 1 or idx.size == 0:
        return idx
    kept = [int(idx[0])]
    for i in idx[1:]:
        if int(i) - kept[-1] >= distance:
            kept.append(int(i))
    return np.array(kept, dtype=int)


try:
    from scipy.signal import find_peaks
    HAS_SCIPY = True
except Exception:
    HAS_SCIPY = False
    find_peaks = None


def one_pole_lowpass(prev: Optional[float], x: float, dt: float, fc_hz: float) -> float:
    """One-pole low-pass filter."""
    if prev is None:
        return x
    if dt <= 0:
        return prev
    if fc_hz <= 0:
        return x
    alpha = 1.0 - math.exp(-2.0 * math.pi * fc_hz * dt)
    return prev + alpha * (x - prev)


def robust_mean(xs: List[float]) -> float:
    if len(xs) == 0:
        return float("nan")
    return float(np.median(np.asarray(xs, dtype=float)))


def median(arr: np.ndarray) -> float:
    if arr.size == 0:
        return float("nan")
    return float(np.median(arr))


def mad(arr: np.ndarray) -> float:
    """Median absolute deviation."""
    if arr.size == 0:
        return float("nan")
    m = np.median(arr)
    return float(np.median(np.abs(arr - m)))


def now_str() -> str:
    return time.strftime("%Y%m%d_%H%M%S")


def _interp_at(t_query: float, t: np.ndarray, y: np.ndarray) -> float:
    """Interpolate y value at t_query."""
    if t.size == 0:
        return float("nan")
    if t_query <= t[0]:
        return float(y[0])
    if t_query >= t[-1]:
        return float(y[-1])
    return float(np.interp(t_query, t, y))


# ============================================================================
# STAGE 1 CLASSES AND DATA STRUCTURES
# ============================================================================

@dataclass
class TPTCycle:
    t0: float
    tp: float
    t1: float
    trough0_val: float
    peak_val: float
    trough1_val: float
    ok: bool = False
    matched_rise: Optional[float] = None
    matched_fall: Optional[float] = None

    @property
    def period_s(self) -> float:
        return float(self.t1 - self.t0)

    @property
    def amp(self) -> float:
        return float(self.peak_val - 0.5 * (self.trough0_val + self.trough1_val))


class Stage1EnsembleRTAnalyzer:
    """Stage 1: Ensemble respiration analyzer for CV calculation."""
    
    def __init__(
        self,
        calib_sec: float = 20.0,
        y_fc_hz: float = 1.1,       
        dy_fc_hz: float = 1.0,      # Smoother signal
        q_hi: float = 0.50,         # Median-based threshold
        lo_frac: float = 0.55,      
        tpt_prom_frac: float = 0.10,# Relaxed geometry check
        tpt_prom_min: float = 0.05,
        tpt_min_peak_distance_sec: float = 1.0,
        min_cycle_s: float = 1.0,
        max_cycle_s: float = 10.0,
        min_half_cycle_s: float = 0.5, 
        max_half_cycle_s: float = 6.0,
    ):
        self.calib_sec = float(calib_sec)
        self.y_fc_hz = float(y_fc_hz)
        self.dy_fc_hz = float(dy_fc_hz)
        self.q_hi = float(q_hi)
        self.lo_frac = float(lo_frac)
        self.tpt_prom_frac = float(tpt_prom_frac)
        self.tpt_prom_min = float(tpt_prom_min)
        self.tpt_min_peak_distance_sec = float(tpt_min_peak_distance_sec)
        self.min_cycle_s = float(min_cycle_s)
        self.max_cycle_s = float(max_cycle_s)
        self.min_half_cycle_s = float(min_half_cycle_s)
        self.max_half_cycle_s = float(max_half_cycle_s)
        
        self.reset()

    def reset(self) -> None:
        self.t_buf: Deque[float] = deque()
        self.raw_buf: Deque[float] = deque()
        self.y_buf: Deque[float] = deque()
        self.dy_buf: Deque[float] = deque()
        
        self._y_prev: Optional[float] = None
        self._dy_prev: Optional[float] = None
        self._t_prev: Optional[float] = None
        self._y_f: Optional[float] = None
        self._dy_f: Optional[float] = None
        
        self.hi: Optional[float] = None
        self.lo: Optional[float] = None
        
        self._pos_regime = False
        self._neg_regime = False
        self.rise_starts: List[float] = []
        self.fall_starts: List[float] = []
        
        self.cycles: List[TPTCycle] = []
        self._last_cycle_end_t: float = -1e9
        
        self.start_time: Optional[float] = None
        self.running = False

    def start(self, t: float) -> None:
        self.reset()
        self.start_time = float(t)
        self.running = True

    def stop(self) -> None:
        self.running = False

    def is_done(self) -> bool:
        """Check if we have at least 10 OK cycles."""
        ok_cycles = [c for c in self.cycles if c.ok]
        return len(ok_cycles) >= 10

    def update(self, t: float, raw: float) -> None:
        if not self.running:
            return
            
        dt = 0.0
        if self._t_prev is not None:
            dt = t - self._t_prev
        self._t_prev = t

        self._y_f = _iir_lowpass(self._y_f, raw, dt, self.y_fc_hz)
        
        dy_inst = 0.0
        if self._y_prev is not None and dt > 1e-6:
            dy_inst = (self._y_f - self._y_prev) / dt
        self._y_prev = self._y_f
        
        self._dy_f = _iir_lowpass(self._dy_f, dy_inst, dt, self.dy_fc_hz)
        
        self.t_buf.append(t)
        self.raw_buf.append(raw)
        self.y_buf.append(self._y_f)
        self.dy_buf.append(self._dy_f)
        
        self._update_hi_lo_continuous()
        self._detect_derivative_events(t, self._dy_f)
        self._detect_tpt_new_cycles()

    def _update_hi_lo_continuous(self) -> None:
        if len(self.dy_buf) < 20:
            return
        t = np.array(self.t_buf, dtype=float)
        dy = np.array(self.dy_buf, dtype=float)
        if t.size < 20:
            return
        t_latest = t[-1]
        t0 = max(t[0], t_latest - self.calib_sec)
        m = t >= t0
        if np.sum(m) < 20:
            return
        abs_dy = np.abs(dy[m])
        hi = _quantile_safe(abs_dy, self.q_hi)
        if hi is None:
            return
        hi = max(hi, 1e-6)
        lo = hi * self.lo_frac
        self.hi = float(hi)
        self.lo = float(lo)

    def _detect_derivative_events(self, t: float, dy: float) -> None:
        """
        Detect Rise/Fall events.
        MODIFIED: Uses 0.7 * hi (instead of hi) for entry to accept moderate breaths.
        Uses lo (0.55 * hi) for exit to maintain hysteresis.
        """
        if self.hi is None or self.lo is None:
            return
        hi = self.hi
        lo = self.lo
        
        # Use a "moderate" threshold for entry (between lo and hi)
        # This catches breaths that are distinct but not max-speed.
        entry_thresh = 0.7 * hi 
        
        # --- Positive Regime (Rise) ---
        # Enter if speed > entry_thresh (moderate speed)
        if (not self._pos_regime) and (dy >= entry_thresh):
            self._pos_regime = True
            self.rise_starts.append(t)
        # Exit if speed < lo (hysteresis reset)
        elif self._pos_regime and (dy <= lo):
            self._pos_regime = False
            
        # --- Negative Regime (Fall) ---
        # Enter if speed < -entry_thresh
        if (not self._neg_regime) and (dy <= -entry_thresh):
            self._neg_regime = True
            self.fall_starts.append(t)
        # Exit if speed > -lo
        elif self._neg_regime and (dy >= -lo):
            self._neg_regime = False

    def _detect_tpt_new_cycles(self) -> None:
        if len(self.y_buf) < 40:
            return
        t = np.array(self.t_buf, dtype=float)
        y = np.array(self.y_buf, dtype=float)
        
        if len(t) < 6:
            return
        dt = np.diff(t)
        dt = dt[np.isfinite(dt) & (dt > 1e-6)]
        if dt.size < 4:
            return
        fs = float(1.0 / np.median(dt))
        
        p95 = float(np.quantile(y, 0.95))
        p05 = float(np.quantile(y, 0.05))
        y_range = max(p95 - p05, 1e-6)
        prom = max(self.tpt_prom_min, self.tpt_prom_frac * y_range)
        min_dist = max(1, int(fs * self.tpt_min_peak_distance_sec))
        
        if HAS_SCIPY:
            peaks, _ = find_peaks(y, prominence=prom, distance=min_dist)
            troughs, _ = find_peaks(-y, prominence=prom, distance=min_dist)
        else:
            peaks = _simple_peaks(y, distance=min_dist)
            troughs = _simple_peaks(-y, distance=min_dist)
        
        if peaks.size == 0 or troughs.size < 2:
            return
        
        peaks = np.sort(peaks)
        troughs = np.sort(troughs)
        
        for ip in peaks:
            i0_candidates = troughs[troughs < ip]
            i1_candidates = troughs[troughs > ip]
            if i0_candidates.size == 0 or i1_candidates.size == 0:
                continue
            i0 = int(i0_candidates[-1])
            i1 = int(i1_candidates[0])
            
            t0, tp, t1 = float(t[i0]), float(t[ip]), float(t[i1])
            if t1 <= self._last_cycle_end_t + 1e-6:
                continue
            
            a = tp - t0
            b = t1 - tp
            c = t1 - t0
            if not (self.min_half_cycle_s <= a <= self.max_half_cycle_s):
                continue
            if not (self.min_half_cycle_s <= b <= self.max_half_cycle_s):
                continue
            if not (self.min_cycle_s <= c <= self.max_cycle_s):
                continue
            
            cyc = TPTCycle(
                t0=t0, tp=tp, t1=t1,
                trough0_val=float(y[i0]),
                peak_val=float(y[ip]),
                trough1_val=float(y[i1]),
            )
            self._match_derivative_to_cycle(cyc)
            self.cycles.append(cyc)
            self._last_cycle_end_t = cyc.t1

    def _match_derivative_to_cycle(self, cyc: TPTCycle) -> None:
        if not self.rise_starts or not self.fall_starts:
            cyc.ok = False
            return
        rise = None
        for tr in reversed(self.rise_starts):
            if tr < cyc.t0:
                break
            if cyc.t0 <= tr <= cyc.tp:
                rise = tr
                break
        fall = None
        for tf in self.fall_starts:
            if tf < cyc.tp:
                continue
            if cyc.tp <= tf <= cyc.t1:
                fall = tf
                break
        if rise is not None and fall is not None and rise < fall:
            cyc.ok = True
            cyc.matched_rise = rise
            cyc.matched_fall = fall
        else:
            cyc.ok = False

    def get_cv_period(self) -> Optional[float]:
        """CV of breath period (timing). Kept for reference; not used for DIBH type."""
        ok_cycles = [c for c in self.cycles if c.ok]
        if len(ok_cycles) < 10:
            return None
        periods = np.array([c.period_s for c in ok_cycles], dtype=float)
        if periods.size < 10:
            return None
        m = float(np.mean(periods))
        if m > 1e-6:
            return float(np.std(periods) / m * 100.0)
        return None

    def get_cv(self) -> Optional[float]:
        """Final CV used for DIBH type: coefficient of variation of breath amplitude (force)."""
        ok_cycles = [c for c in self.cycles if c.ok]
        if len(ok_cycles) < 10:
            return None
        amps = np.array([c.amp for c in ok_cycles], dtype=float)
        if amps.size < 10:
            return None
        m = float(np.mean(amps))
        if abs(m) > 1e-6:
            return float(np.std(amps) / abs(m) * 100.0)
        return None


# ============================================================================
# STAGE 2 CLASSES AND DATA STRUCTURES
# ============================================================================

@dataclass
class AttemptResult:
    attempt_idx: int
    baseline_val: float
    start_level: float
    inhale_start_t: Optional[float]
    peak_t: Optional[float]
    peak_val: Optional[float]
    amp: Optional[float]
    time_to_peak: Optional[float]
    valid: bool
    reason: str


class Stage2Detector:
    """Stage 2: Maximum inspiration detector."""
    
    def __init__(
        self,
        reps: int = 3,
        prep_sec: float = 2.0,
        baseline_sec: float = 1.0,
        inspiration_timeout_sec: float = 8.0,
        return_timeout_sec: float = 10.0,
        rest_sec: float = 2.0,
        start_ratio: float = 1.5,
        start_min_abs: float = 0.15,
        peak_confirm_dy_neg: float = 0.05,
        peak_min_amp: float = 0.3,
        return_margin_ratio: float = 0.15,
        filt_fc_hz: float = 0.8,
        dy_fc_hz: float = 1.5,
        plot_window_sec: float = 40.0,
    ):
        self.reps = reps
        self.prep_sec = prep_sec
        self.baseline_sec = baseline_sec
        self.inspiration_timeout_sec = inspiration_timeout_sec
        self.return_timeout_sec = return_timeout_sec
        self.rest_sec = rest_sec
        self.start_ratio = start_ratio
        self.start_min_abs = start_min_abs
        self.peak_confirm_dy_neg = peak_confirm_dy_neg
        self.peak_min_amp = peak_min_amp
        self.return_margin_ratio = return_margin_ratio
        self.filt_fc_hz = filt_fc_hz
        self.dy_fc_hz = dy_fc_hz
        self.plot_window_sec = plot_window_sec
        
        self.reset()

    def reset(self):
        # Buffers for plotting
        self.ts: Deque[float] = deque()
        self.raw: Deque[float] = deque()
        self.filt: Deque[float] = deque()
        self.dy: Deque[float] = deque()
        self.dy_s: Deque[float] = deque()

        # Detected markers (global timeline)
        self.baseline_marks: List[Tuple[float, float]] = []
        self.start_marks: List[Tuple[float, float]] = []
        self.peak_marks: List[Tuple[float, float]] = []

        # Filter states
        self._yf: Optional[float] = None
        self._dyf: Optional[float] = None
        self._prev_t: Optional[float] = None
        self._prev_yf: Optional[float] = None

        # Attempt handling
        self.running = False
        self.attempt_idx = 0
        self.phase = "IDLE"  # IDLE, PREP, WAIT_INHALE, INHALE, WAIT_RETURN, REST, DONE
        self.phase_t0: Optional[float] = None

        self._baseline_window: Deque[float] = deque()
        self.baseline_val: float = float("nan")
        self.start_level: float = float("nan")

        self.inhale_start_t: Optional[float] = None
        self.peak_t: Optional[float] = None
        self.peak_val: Optional[float] = None
        self._peak_val_running: Optional[float] = None
        self._peak_t_running: Optional[float] = None

        self.attempt_results: List[AttemptResult] = []

        # Per-attempt retries and prompts (don't advance on first timeout; prompt user)
        self._typical_amp: Optional[float] = None
        self._min_deep_amp: float = getattr(self, "peak_min_amp", 0.3)
        self._wait_inhale_retries: int = 0
        self._inhale_timeout_retries: int = 0
        self._weak_inhale_retries: int = 0
        self.prompt: Optional[str] = None
        self._rep_invalid_retries: int = 0
        self._max_rep_invalid_retries: int = 2

    def begin(self, t: float):
        """Start Stage 2 (matches original begin() method)."""
        self.running = True
        self.attempt_idx = 0
        self._rep_invalid_retries = 0
        self._goto_phase("PREP", t)
    
    def start(self, t: float):
        """Alias for begin() for consistency with other stages."""
        self.begin(t)

    def stop(self):
        self.running = False
        self.phase = "IDLE"

    def is_done(self) -> bool:
        return self.phase == "DONE"

    def _goto_phase(self, phase: str, t: float):
        self.phase = phase
        self.phase_t0 = t
        if phase == "PREP":
            self._baseline_window.clear()
            self.baseline_val = float("nan")
            self.start_level = float("nan")
            self.inhale_start_t = None
            self.peak_t = None
            self.peak_val = None
            self._peak_val_running = None
            self._peak_t_running = None
            self._typical_amp = None
            self._min_deep_amp = self.peak_min_amp
            self._wait_inhale_retries = 0
            self._inhale_timeout_retries = 0
            self._weak_inhale_retries = 0
            self.prompt = None
        elif phase == "WAIT_INHALE":
            self._wait_inhale_retries = 0
            self.prompt = None
        elif phase == "INHALE":
            self._inhale_timeout_retries = 0
            self._weak_inhale_retries = 0
            self.prompt = None
        elif phase in ("REST", "DONE"):
            self.prompt = None

    def _phase_elapsed(self, t: float) -> float:
        if self.phase_t0 is None:
            return 0.0
        return t - self.phase_t0

    def _finalize_attempt(self, valid: bool, reason: str):
        amp = None
        ttp = None
        if self.peak_val is not None and not math.isnan(self.baseline_val):
            amp = float(self.peak_val - self.baseline_val)
        if self.inhale_start_t is not None and self.peak_t is not None:
            ttp = float(self.peak_t - self.inhale_start_t)
        
        res = AttemptResult(
            attempt_idx=self.attempt_idx,
            baseline_val=float(self.baseline_val) if not math.isnan(self.baseline_val) else float("nan"),
            start_level=float(self.start_level) if not math.isnan(self.start_level) else float("nan"),
            inhale_start_t=self.inhale_start_t,
            peak_t=self.peak_t,
            peak_val=self.peak_val,
            amp=amp,
            time_to_peak=ttp,
            valid=bool(valid),
            reason=str(reason),
        )
        self.attempt_results.append(res)
        # Debug: print peak so you can compare with chart (chart uses same filtered values)
        b = self.baseline_val if not math.isnan(self.baseline_val) else None
        pv = self.peak_val
        b_str = f"{b:.4f}" if b is not None else "None"
        pv_str = f"{pv:.4f}" if pv is not None else "None"
        a_str = f"{amp:.4f}" if amp is not None else "None"
        print(f"[Stage2 PEAK] attempt={self.attempt_idx} baseline={b_str} peak_val(filt)={pv_str} amp={a_str} valid={valid} reason={reason}")

    def update(self, t: float, y_raw: float):
        dt = 0.0
        if self._prev_t is not None:
            dt = t - self._prev_t
        self._prev_t = t

        if self._yf is None:
            self._yf = y_raw
        else:
            self._yf = one_pole_lowpass(self._yf, y_raw, dt, self.filt_fc_hz)

        if self._prev_yf is None or dt <= 0:
            dy = 0.0
        else:
            dy = (self._yf - self._prev_yf) / dt
        self._prev_yf = self._yf

        if self._dyf is None:
            self._dyf = dy
        else:
            self._dyf = one_pole_lowpass(self._dyf, dy, dt, self.dy_fc_hz)

        # Push to plotting buffers
        self.ts.append(t)
        self.raw.append(y_raw)
        self.filt.append(self._yf)
        self.dy.append(dy)
        self.dy_s.append(self._dyf)

        # Keep window
        while len(self.ts) > 0 and (self.ts[-1] - self.ts[0]) > self.plot_window_sec:
            self.ts.popleft()
            self.raw.popleft()
            self.filt.popleft()
            self.dy.popleft()
            self.dy_s.popleft()

        # If not running, do nothing else
        if not self.running or self.phase == "IDLE" or self.phase == "DONE":
            return

        elapsed = self._phase_elapsed(t)

        if self.phase == "PREP":
            self._baseline_window.append(self._yf)
            max_keep = int(max(10, (self.prep_sec + 1.0) / max(dt, 1e-3)))
            while len(self._baseline_window) > max_keep:
                self._baseline_window.popleft()

            if elapsed >= self.prep_sec:
                if dt <= 0:
                    dt_eff = 0.1
                else:
                    dt_eff = dt
                n = int(max(5, self.baseline_sec / dt_eff))
                baseline_samples = list(self._baseline_window)[-n:]
                self.baseline_val = robust_mean(baseline_samples)
                # Typical breath amplitude from prep (max - baseline) to require inhale above usual breathing
                normal_peak = float(np.max(self._baseline_window)) if len(self._baseline_window) > 0 else self.baseline_val
                self._typical_amp = max(0.0, normal_peak - self.baseline_val)
                self._min_deep_amp = max(
                    self.peak_min_amp,
                    self._typical_amp * 0.8
                ) if self._typical_amp > 0.1 else self.peak_min_amp
                ratio_level = self.baseline_val * self.start_ratio
                abs_level = self.baseline_val + self.start_min_abs
                self.start_level = max(ratio_level, abs_level)
                self.baseline_marks.append((t, self.baseline_val))
                self._goto_phase("WAIT_INHALE", t)

        elif self.phase == "WAIT_INHALE":
            if (self._yf >= self.start_level) and (self._dyf > 0.0):
                self.inhale_start_t = t
                self.start_marks.append((t, self._yf))
                self._peak_val_running = self._yf
                self._peak_t_running = t
                self._goto_phase("INHALE", t)
                return

            if elapsed >= self.inspiration_timeout_sec:
                if self._wait_inhale_retries < 2:
                    self.prompt = "Please inhale deeply now."
                    self.phase_t0 = t
                    self._wait_inhale_retries += 1
                    print("[Stage 2] Please inhale deeply now.")
                else:
                    self.prompt = None
                    if self._rep_invalid_retries < self._max_rep_invalid_retries:
                        self._rep_invalid_retries += 1
                        self._goto_phase("REST", t)
                        self.prompt = "Please redo this rep."
                        print("[Stage 2] Please redo this rep.")
                    else:
                        self._finalize_attempt(False, "timeout_wait_inhale")
                        self.attempt_idx += 1
                        if self.attempt_idx >= self.reps:
                            self._goto_phase("DONE", t)
                        else:
                            self._rep_invalid_retries = 0
                            self._goto_phase("REST", t)

        elif self.phase == "INHALE":
            if self._peak_val_running is None or self._yf > self._peak_val_running:
                self._peak_val_running = self._yf
                self._peak_t_running = t

            if self._dyf <= -abs(self.peak_confirm_dy_neg):
                self.peak_val = float(self._peak_val_running)
                self.peak_t = float(self._peak_t_running)
                self.peak_marks.append((self.peak_t, self.peak_val))
                amp = self.peak_val - self.baseline_val
                # Require inhale above usual breathing (at least _min_deep_amp above baseline)
                if amp < self._min_deep_amp:
                    if self._weak_inhale_retries < 1:
                        self.inhale_start_t = None
                        self.peak_t = None
                        self.peak_val = None
                        self._peak_val_running = None
                        self._peak_t_running = None
                        self.phase_t0 = t
                        self._weak_inhale_retries += 1
                        self._goto_phase("WAIT_INHALE", t)
                        self.prompt = "Inhale deeper - above normal breathing."
                        print("[Stage 2] Inhale deeper - above normal breathing.")
                    else:
                        self.prompt = None
                        if self._rep_invalid_retries < self._max_rep_invalid_retries:
                            self._rep_invalid_retries += 1
                            self._goto_phase("REST", t)
                            self.prompt = "Please redo this rep."
                            print("[Stage 2] Please redo this rep.")
                        else:
                            self._finalize_attempt(False, f"weak_inhale_amp<{self._min_deep_amp:.3f}")
                            self.attempt_idx += 1
                            if self.attempt_idx >= self.reps:
                                self._goto_phase("DONE", t)
                            else:
                                self._rep_invalid_retries = 0
                                self._goto_phase("REST", t)
                    return
                self.prompt = None
                self._goto_phase("WAIT_RETURN", t)
                return

            if elapsed >= self.return_timeout_sec:
                if self._inhale_timeout_retries < 2:
                    self.inhale_start_t = None
                    self._peak_val_running = None
                    self._peak_t_running = None
                    self.phase_t0 = t
                    self._inhale_timeout_retries += 1
                    self._goto_phase("WAIT_INHALE", t)
                    self.prompt = "Please inhale deeply then exhale slowly."
                    print("[Stage 2] Please inhale deeply then exhale slowly.")
                else:
                    self.prompt = None
                    if self._rep_invalid_retries < self._max_rep_invalid_retries:
                        self._rep_invalid_retries += 1
                        self._goto_phase("REST", t)
                        self.prompt = "Please redo this rep."
                        print("[Stage 2] Please redo this rep.")
                    else:
                        self._finalize_attempt(False, "timeout_peak_not_found")
                        self.attempt_idx += 1
                        if self.attempt_idx >= self.reps:
                            self._goto_phase("DONE", t)
                        else:
                            self._rep_invalid_retries = 0
                            self._goto_phase("REST", t)

        elif self.phase == "WAIT_RETURN":
            if self.peak_val is None:
                if self._rep_invalid_retries < self._max_rep_invalid_retries:
                    self._rep_invalid_retries += 1
                    self._goto_phase("REST", t)
                    self.prompt = "Please redo this rep."
                    print("[Stage 2] Please redo this rep.")
                else:
                    self._finalize_attempt(False, "internal_no_peak")
                    self.attempt_idx += 1
                    if self.attempt_idx >= self.reps:
                        self._goto_phase("DONE", t)
                    else:
                        self._rep_invalid_retries = 0
                        self._goto_phase("REST", t)
                return

            amp = max(0.0, self.peak_val - self.baseline_val)
            margin = max(self.start_min_abs, self.return_margin_ratio * amp)
            if abs(self._yf - self.baseline_val) <= margin:
                self._rep_invalid_retries = 0
                self._finalize_attempt(True, "ok")
                self.attempt_idx += 1
                if self.attempt_idx >= self.reps:
                    self._goto_phase("DONE", t)
                else:
                    self._goto_phase("REST", t)
                return

            if elapsed >= self.return_timeout_sec:
                if self._rep_invalid_retries < self._max_rep_invalid_retries:
                    self._rep_invalid_retries += 1
                    self._goto_phase("REST", t)
                    self.prompt = "Please redo this rep."
                    print("[Stage 2] Please redo this rep.")
                else:
                    self._finalize_attempt(False, "timeout_return_baseline")
                    self.attempt_idx += 1
                    if self.attempt_idx >= self.reps:
                        self._goto_phase("DONE", t)
                    else:
                        self._rep_invalid_retries = 0
                        self._goto_phase("REST", t)

        elif self.phase == "REST":
            if elapsed >= self.rest_sec:
                self._goto_phase("PREP", t)

    def get_max_amp(self) -> Optional[float]:
        """Get maximum amplitude from valid attempts."""
        valid = [a for a in self.attempt_results if a.valid and a.amp is not None]
        if len(valid) > 0:
            amps = [float(a.amp) for a in valid]
            return float(np.max(amps))
        return None

    def get_avg_amp(self) -> Optional[float]:
        """Get average amplitude from valid attempts (used by Stage 3 for thresholds)."""
        valid = [a for a in self.attempt_results if a.valid and a.amp is not None]
        if len(valid) > 0:
            amps = [float(a.amp) for a in valid]
            return float(np.mean(amps))
        return None

    def get_min_amp(self) -> Optional[float]:
        """Get minimum amplitude from valid attempts."""
        valid = [a for a in self.attempt_results if a.valid and a.amp is not None]
        if len(valid) > 0:
            amps = [float(a.amp) for a in valid]
            return float(np.min(amps))
        return None


# ============================================================================
# STAGE 3 CLASSES AND DATA STRUCTURES
# ============================================================================

@dataclass
class Stage3Attempt:
    idx: int
    baseline: float
    max_amp: float
    hold_ratio: float
    release_ratio: float
    target_ratio: float
    hold_th: float
    release_th: float
    target_th: float
    hold_start_t: Optional[float] = None
    hold_end_t: Optional[float] = None
    hold_duration: Optional[float] = None
    hold_mean: Optional[float] = None
    hold_std: Optional[float] = None
    hold_min: Optional[float] = None
    hold_max: Optional[float] = None
    rep_peak_val: Optional[float] = None  # peak of this rep's inhale (reference for hold quality)
    hold_quality_pct: Optional[float] = None  # % of rep peak maintained (100%=held at peak, 0%=dropped to baseline)
    valid: bool = False
    reason: str = ""


class OnePoleLPF:
    def __init__(self, fc_hz: float, init: Optional[float] = None):
        self.fc_hz = float(fc_hz)
        self.y = init
        self.t_prev = None

    def reset(self) -> None:
        self.y = None
        self.t_prev = None

    def update(self, t: float, x: float) -> float:
        if self.y is None or self.t_prev is None:
            self.y = float(x)
            self.t_prev = float(t)
            return self.y
        dt = max(1e-6, float(t - self.t_prev))
        rc = 1.0 / (2.0 * math.pi * max(1e-6, self.fc_hz))
        alpha = math.exp(-dt / rc)
        self.y = alpha * self.y + (1.0 - alpha) * float(x)
        self.t_prev = float(t)
        return self.y


class DerivativeEstimator:
    def __init__(self, dy_fc_hz: float):
        self.prev_t = None
        self.prev_y = None
        self.dy_lpf = OnePoleLPF(dy_fc_hz, init=0.0)

    def reset(self) -> None:
        self.prev_t = None
        self.prev_y = None
        self.dy_lpf.reset()

    def update(self, t: float, y: float) -> Tuple[float, float]:
        if self.prev_t is None:
            self.prev_t = float(t)
            self.prev_y = float(y)
            return 0.0, 0.0
        dt = max(1e-6, float(t - self.prev_t))
        dy = (float(y) - float(self.prev_y)) / dt
        dy_s = self.dy_lpf.update(t, dy)
        self.prev_t = float(t)
        self.prev_y = float(y)
        return dy, dy_s


class Phase:
    IDLE = "IDLE"
    PREP = "PREP"
    WAIT_HOLD_START = "WAIT_HOLD_START"
    HOLD = "HOLD"
    REST = "REST"
    DONE = "DONE"


class Stage3Detector:
    """
    Stage 3: DIBH (Deep Inspiration Breath Hold) hold detector.

    Stage 2 reports amplitude as (peak_val - baseline_val) per attempt; we pass the
    *average* of those deltas as max_amp (avg_amp from Stage 2). Stage 3 does NOT
    use Stage 2's baseline or peak values directly. Each rep in Stage 3:
      1. Computes its own baseline_val (b) from PREP (median of filtered signal).
      2. Uses the Stage 2 avg_amp as the reference *delta* (A) and sets:
         - hold_th   = b + A * hold_ratio   (e.g. b + 26.58*0.80)
         - release_th = b + A * release_ratio (e.g. b + 26.58*0.70)
         - target_th  = b + A * target_ratio  (e.g. b + 26.58*0.85)
         - inhale_start_th = b + A * inhale_start_ratio (e.g. b + 26.58*0.40)

    So with your example (Avg_amp=26.58): if Stage 3 baseline for a rep is 15,
    hold_th = 15 + 21.26 = 36.26, release_th = 33.61, target_th = 37.59.

    Hold quality: we use the peak of the *current rep's* inhale (not Stage 2 avg) as
    reference. We track the running max of y_f during WAIT_HOLD_START; at HOLD entry
    that becomes rep_peak_val. Hold quality = (hold_mean - baseline)/(rep_peak - baseline)*100,
    so 100%% = held at peak, 0%% = dropped to baseline (how far it decreases over time).

    Flow per rep: PREP -> baseline from last N sec -> WAIT_HOLD_START (inhale until
    above hold_th) -> HOLD (hold until release + exhale) -> REST -> repeat or DONE.
    Valid hold duration must be >= min_hold_sec. avgDIBH = mean of valid hold times.
    """

    def __init__(
        self,
        reps: int,
        prep_sec: float,
        baseline_sec: float,
        rest_sec: float,
        timeout_inhale_sec: float,
        max_hold_sec: float,
        min_hold_sec: float,
        max_amp: float,  # From Stage 2: average peak (peak - baseline) over valid attempts
        hold_ratio: float = 0.80,
        release_ratio: float = 0.70,
        target_ratio: float = 0.85,
        inhale_start_ratio: float = 0.40,
        baseline_dy_mad_k: float = 2.8,
        hold_end_mode: str = "release_and_exhale",
        exhale_dy_thresh: float = 2.5,
        confirm_sec: float = 0.25,
        min_dwell_wait_hold_start_sec: float = 1.0,
    ):
        self.reps = int(reps)
        self.prep_sec = float(prep_sec)
        self.baseline_sec = float(baseline_sec)
        self.rest_sec = float(rest_sec)
        self.timeout_inhale_sec = float(timeout_inhale_sec)
        self.min_dwell_wait_hold_start_sec = float(min_dwell_wait_hold_start_sec)
        self.max_hold_sec = float(max_hold_sec)
        self.min_hold_sec = float(min_hold_sec)
        self.max_amp_global = float(max_amp)
        self.hold_ratio = float(hold_ratio)
        self.release_ratio = float(release_ratio)
        self.target_ratio = float(target_ratio)
        self.inhale_start_ratio = float(inhale_start_ratio)
        self.baseline_dy_mad_k = float(baseline_dy_mad_k)
        self.hold_end_mode = str(hold_end_mode)
        self.exhale_dy_thresh = float(exhale_dy_thresh)
        self.confirm_sec = float(confirm_sec)
        
        self.phase = Phase.IDLE
        self.session_running = False
        self.session_t0 = None
        self.phase_t0 = None
        self.attempt_idx = 0
        self.attempts: List[Stage3Attempt] = []
        self.prep_buf: Deque[Tuple[float, float, float]] = deque()
        self.hold_y: List[float] = []
        self.hold_t: List[float] = []
        self._inhale_started = False
        self._inhale_start_t = None
        self._hold_enter_confirm_t = None
        self._hold_exit_confirm_t = None
        self._peak_val_running: Optional[float] = None  # max y_f during this rep's inhale (for hold quality)
        self.baseline_val = None
        self.hold_th = None
        self.release_th = None
        self.target_th = None
        self.start_time: Optional[float] = None
        # Retries for current rep when we get prep_unstable or timeout_wait_hold_start (so we don't end stage before 3rd rep is actually done)
        self._rep_invalid_retries = 0
        self._max_rep_invalid_retries = 2

    def reset(self) -> None:
        self.phase = Phase.IDLE
        self.session_running = False
        self.session_t0 = None
        self.phase_t0 = None
        self.attempt_idx = 0
        self.attempts.clear()
        self.prep_buf.clear()
        self.hold_y.clear()
        self.hold_t.clear()
        self._inhale_started = False
        self._inhale_start_t = None
        self._hold_enter_confirm_t = None
        self._hold_exit_confirm_t = None
        self._peak_val_running = None
        self.baseline_val = None
        self.hold_th = None
        self.release_th = None
        self.target_th = None
        self._rep_invalid_retries = 0

    def start(self, t: float) -> None:
        self.reset()
        self.start_time = float(t)
        self.session_running = True
        self.session_t0 = float(t)
        self._rep_invalid_retries = 0
        self._enter_phase(Phase.PREP, t)

    def stop(self) -> None:
        self.session_running = False

    def is_done(self) -> bool:
        return self.phase == Phase.DONE

    def _enter_phase(self, phase: str, t: float) -> None:
        self.phase = phase
        self.phase_t0 = float(t)
        if phase == Phase.PREP:
            self.prep_buf.clear()
            self.baseline_val = None
            self.hold_th = None
            self.release_th = None
            self.target_th = None
            self._inhale_started = False
            self._inhale_start_t = None
            self._hold_enter_confirm_t = None
            self._hold_exit_confirm_t = None
            self.hold_y.clear()
            self.hold_t.clear()
            # Do NOT reset _rep_invalid_retries here. After a timeout retry we go REST->PREP with
            # attempt_idx decremented, so len(attempts)==attempt_idx would be true and we'd reset
            # the counter, causing an infinite loop. Retry count is only reset in _finalize_attempt
            # when moving to the next rep.
        if phase == Phase.WAIT_HOLD_START:
            self._inhale_started = False
            self._inhale_start_t = None
            self._hold_enter_confirm_t = None
            self._peak_val_running = None
        if phase == Phase.HOLD:
            self._hold_exit_confirm_t = None
            self.hold_y.clear()
            self.hold_t.clear()
        if phase == Phase.REST:
            self._inhale_started = False
            self._inhale_start_t = None
            self._hold_enter_confirm_t = None
            self._hold_exit_confirm_t = None

    def _phase_elapsed(self, t: float) -> float:
        if self.phase_t0 is None:
            return 0.0
        return float(t - self.phase_t0)

    def _finalize_attempt(self, valid: bool, reason: str, t: float) -> None:
        if self.attempt_idx <= 0 or self.attempt_idx > len(self.attempts):
            return
        a = self.attempts[self.attempt_idx - 1]
        a.valid = bool(valid)
        a.reason = str(reason)
        if a.hold_start_t is not None and a.hold_end_t is not None:
            a.hold_duration = float(a.hold_end_t - a.hold_start_t)
        if self.hold_y:
            y = np.array(self.hold_y, dtype=float)
            a.hold_mean = float(np.mean(y))
            a.hold_std = float(np.std(y))
            a.hold_min = float(np.min(y))
            a.hold_max = float(np.max(y))
            # Hold quality: % of this rep's peak maintained (100%=held at peak, 0%=dropped to baseline)
            baseline = float(a.baseline)
            peak = getattr(a, "rep_peak_val", None)
            if (a.hold_mean is not None and peak is not None and (peak - baseline) > 1e-9):
                span = float(peak - baseline)
                above_baseline = float(a.hold_mean - baseline)
                pct = (above_baseline / span) * 100.0
                a.hold_quality_pct = max(0.0, min(100.0, pct))
            elif a.hold_mean is not None and peak is not None:
                a.hold_quality_pct = 100.0 if a.hold_mean >= peak else 0.0
        if self.attempt_idx >= self.reps:
            self._enter_phase(Phase.DONE, t)
            self.session_running = False
        else:
            self._rep_invalid_retries = 0  # next rep starts fresh
            self._enter_phase(Phase.REST, t)

    def _compute_baseline_from_prep(self) -> Tuple[Optional[float], Optional[float]]:
        if not self.prep_buf:
            return None, None
        t_last = self.prep_buf[-1][0]
        t0 = t_last - self.baseline_sec
        tail = [(t, y, dy_s) for (t, y, dy_s) in self.prep_buf if t >= t0]
        if len(tail) < 5:
            return None, None
        ys = np.array([x[1] for x in tail], dtype=float)
        dys = np.array([x[2] for x in tail], dtype=float)
        base = median(ys)
        dy_m = mad(dys)
        sigma = 1.4826 * dy_m if dy_m == dy_m else 0.0
        dy_quiet = max(1e-6, self.baseline_dy_mad_k * sigma)
        return float(base), float(dy_quiet)

    def _init_attempt_thresholds(self) -> None:
        assert self.baseline_val is not None
        b = float(self.baseline_val)
        A = float(self.max_amp_global)
        self.hold_th = b + A * self.hold_ratio
        self.release_th = b + A * self.release_ratio
        self.target_th = b + A * self.target_ratio

    def update(self, t: float, y_f: float, dy_s: float) -> None:
        if not self.session_running:
            return
        if self.phase == Phase.DONE:
            self.session_running = False
            return
        pe = self._phase_elapsed(t)

        if self.phase == Phase.PREP:
            self.prep_buf.append((float(t), float(y_f), float(dy_s)))
            if pe >= self.prep_sec:
                base, dy_quiet = self._compute_baseline_from_prep()
                if base is None:
                    return
                t_last = self.prep_buf[-1][0]
                t0 = t_last - self.baseline_sec
                tail = [(tt, yy, ddy) for (tt, yy, ddy) in self.prep_buf if tt >= t0]
                quiet = [yy for (tt, yy, ddy) in tail if abs(ddy) < dy_quiet]
                if len(quiet) < max(5, int(0.5 * len(tail))):
                    # Retry same rep so stage doesn't end before 3rd rep is actually done
                    if self._rep_invalid_retries < self._max_rep_invalid_retries:
                        self._rep_invalid_retries += 1
                        self._enter_phase(Phase.REST, t)
                        return
                    self.attempt_idx += 1
                    a = Stage3Attempt(
                        idx=self.attempt_idx,
                        baseline=float(base),
                        max_amp=float(self.max_amp_global),
                        hold_ratio=self.hold_ratio,
                        release_ratio=self.release_ratio,
                        target_ratio=self.target_ratio,
                        hold_th=float("nan"),
                        release_th=float("nan"),
                        target_th=float("nan"),
                    )
                    self.attempts.append(a)
                    self._finalize_attempt(valid=False, reason=f"prep_unstable", t=t)
                    return
                self.attempt_idx += 1
                self.baseline_val = float(base)
                self._init_attempt_thresholds()
                a = Stage3Attempt(
                    idx=self.attempt_idx,
                    baseline=float(self.baseline_val),
                    max_amp=float(self.max_amp_global),
                    hold_ratio=self.hold_ratio,
                    release_ratio=self.release_ratio,
                    target_ratio=self.target_ratio,
                    hold_th=float(self.hold_th),
                    release_th=float(self.release_th),
                    target_th=float(self.target_th),
                )
                self.attempts.append(a)
                self._enter_phase(Phase.WAIT_HOLD_START, t)
                return

        if self.phase == Phase.WAIT_HOLD_START:
            assert self.baseline_val is not None
            assert self.hold_th is not None
            inhale_start_th = self.baseline_val + self.max_amp_global * self.inhale_start_ratio
            if (not self._inhale_started) and (y_f >= inhale_start_th):
                self._inhale_started = True
                self._inhale_start_t = float(t)
                self._peak_val_running = float(y_f)
            if self._inhale_started and self._peak_val_running is not None:
                if y_f > self._peak_val_running:
                    self._peak_val_running = float(y_f)
            if pe >= self.timeout_inhale_sec:
                # Retry same rep so we don't end stage before 3rd rep is actually done
                if self._rep_invalid_retries < self._max_rep_invalid_retries:
                    self._rep_invalid_retries += 1
                    if self.attempts and len(self.attempts) >= self.attempt_idx:
                        self.attempts.pop()
                        self.attempt_idx -= 1
                    self._enter_phase(Phase.REST, t)
                    return
                self._finalize_attempt(valid=False, reason="timeout_wait_hold_start", t=t)
                return
            if y_f >= self.hold_th:
                if self._hold_enter_confirm_t is None:
                    self._hold_enter_confirm_t = float(t)
                elif (t - self._hold_enter_confirm_t) >= self.confirm_sec and pe >= self.min_dwell_wait_hold_start_sec:
                    # Require min dwell so we don't enter HOLD on leftover signal from previous rep (3rd rep ending abruptly)
                    a = self.attempts[self.attempt_idx - 1]
                    a.hold_start_t = float(t)
                    # Use peak of this rep's inhale as reference for hold quality (how far it decreases)
                    a.rep_peak_val = float(self._peak_val_running) if self._peak_val_running is not None else float(y_f)
                    self._enter_phase(Phase.HOLD, t)
            else:
                self._hold_enter_confirm_t = None
            return

        if self.phase == Phase.HOLD:
            assert self.release_th is not None
            a = self.attempts[self.attempt_idx - 1]
            if a.hold_start_t is None:
                a.hold_start_t = float(t)
            self.hold_y.append(float(y_f))
            self.hold_t.append(float(t))
            if pe >= self.max_hold_sec:
                a.hold_end_t = float(t)
                self._finalize_attempt(valid=(pe >= self.min_hold_sec), reason="max_hold_reached", t=t)
                return
            below_release = (y_f < self.release_th)
            exhale_like = (dy_s < -abs(self.exhale_dy_thresh))
            end_now = False
            if self.hold_end_mode == "release_only":
                end_now = below_release
            elif self.hold_end_mode == "exhale_only":
                end_now = exhale_like
            else:
                end_now = (below_release and exhale_like)
            if end_now:
                if self._hold_exit_confirm_t is None:
                    self._hold_exit_confirm_t = float(t)
                elif (t - self._hold_exit_confirm_t) >= self.confirm_sec:
                    a.hold_end_t = float(t)
                    dur = float(a.hold_end_t - a.hold_start_t)
                    valid = dur >= self.min_hold_sec
                    self._finalize_attempt(valid=valid, reason="hold_end", t=t)
                    return
            else:
                self._hold_exit_confirm_t = None
            return

        if self.phase == Phase.REST:
            if pe >= self.rest_sec:
                self._enter_phase(Phase.PREP, t)
            return

    def get_avg_dibh(self) -> Optional[float]:
        """Get average DIBH from valid attempts."""
        valid_attempts = [
            a for a in self.attempts
            if getattr(a, "valid", False) and (getattr(a, "hold_duration", None) is not None)
        ]
        if len(valid_attempts) == 0:
            return None
        hold_durs = [float(a.hold_duration) for a in valid_attempts]
        return float(np.mean(hold_durs))

    def get_avg_hold_quality_pct(self) -> Optional[float]:
        """Get average hold quality (0–100%) from valid attempts that have hold_quality_pct."""
        valid_with_quality = [
            a for a in self.attempts
            if getattr(a, "valid", False)
            and getattr(a, "hold_quality_pct", None) is not None
        ]
        if len(valid_with_quality) == 0:
            return None
        return float(np.mean([a.hold_quality_pct for a in valid_with_quality]))


# ============================================================================
# PLOTTING CLASSES FOR EACH STAGE
# ============================================================================

class Stage1Plot:
    """Live plotting for Stage 1 with cycle detections."""
    
    def __init__(self):
        plt.ion()
        self.fig, (self.ax1, self.ax2) = plt.subplots(2, 1, figsize=(14, 7), sharex=True)
        self.fig.suptitle("Stage 1: Real-time | raw vs filtered + detected cycles")
        
        # Lines
        (self.l_raw,) = self.ax1.plot([], [], label="raw", color='lightblue', linewidth=1)
        (self.l_filt,) = self.ax1.plot([], [], label="filtered", color='blue', linewidth=2)
        (self.l_dy,) = self.ax2.plot([], [], label="dy_smooth", color='green', linewidth=2)
        
        # Thresholds
        (self.l_hi,) = self.ax2.plot([], [], "--", label="hi", color='red', linewidth=1.5)
        (self.l_lo,) = self.ax2.plot([], [], ":", label="lo", color='orange', linewidth=1.5)
        (self.l_mhi,) = self.ax2.plot([], [], "--", label="-hi", color='red', linewidth=1.5)
        (self.l_mlo,) = self.ax2.plot([], [], ":", label="-lo", color='orange', linewidth=1.5)
        
        # Markers
        self.sc_peaks = self.ax1.scatter([], [], s=60, marker="o", label="peaks", color='red', zorder=5)
        self.sc_troughs = self.ax1.scatter([], [], s=60, marker="o", label="troughs", color='blue', zorder=5)
        self.sc_rise = self.ax1.scatter([], [], s=70, marker="^", label="rise_start", color='green', zorder=5)
        self.sc_fall = self.ax1.scatter([], [], s=70, marker="v", label="fall_start", color='purple', zorder=5)
        
        self._spans = []
        
        self.ax1.set_ylabel("Sensor value")
        self.ax2.set_ylabel("dy (per sec)")
        self.ax2.set_xlabel("Time (s)")
        
        self.ax1.grid(True, alpha=0.3)
        self.ax2.grid(True, alpha=0.3)
        
        self.ax1.legend(loc="upper right")
        self.ax2.legend(loc="upper right")
        
        plt.tight_layout()
    
    def _clear_spans(self):
        for sp in self._spans:
            try:
                sp.remove()
            except Exception:
                pass
        self._spans = []
    
    def update(self, analyzer: Stage1EnsembleRTAnalyzer):
        """Update plot with current analyzer state."""
        if len(analyzer.t_buf) == 0:
            return
        
        t = np.array(analyzer.t_buf, dtype=float)
        raw = np.array(analyzer.raw_buf, dtype=float)
        y = np.array(analyzer.y_buf, dtype=float)
        dy = np.array(analyzer.dy_buf, dtype=float)
        
        self.l_raw.set_data(t, raw)
        self.l_filt.set_data(t, y)
        self.l_dy.set_data(t, dy)
        
        # Thresholds
        if analyzer.hi is not None and analyzer.lo is not None:
            if len(t) > 0:
                self.l_hi.set_data([t[0], t[-1]], [analyzer.hi, analyzer.hi])
                self.l_lo.set_data([t[0], t[-1]], [analyzer.lo, analyzer.lo])
                self.l_mhi.set_data([t[0], t[-1]], [-analyzer.hi, -analyzer.hi])
                self.l_mlo.set_data([t[0], t[-1]], [-analyzer.lo, -analyzer.lo])
        else:
            self.l_hi.set_data([], [])
            self.l_lo.set_data([], [])
            self.l_mhi.set_data([], [])
            self.l_mlo.set_data([], [])
        
        # Markers
        t0, t1 = float(t[0]) if len(t) > 0 else 0, float(t[-1]) if len(t) > 0 else 0
        
        peak_t = []
        peak_y = []
        trough_t = []
        trough_y = []
        
        for c in analyzer.cycles:
            if c.tp >= t0 and c.tp <= t1:
                peak_t.append(c.tp)
                peak_y.append(_interp_at(c.tp, t, y))
            if c.t0 >= t0 and c.t0 <= t1:
                trough_t.append(c.t0)
                trough_y.append(_interp_at(c.t0, t, y))
            if c.t1 >= t0 and c.t1 <= t1:
                trough_t.append(c.t1)
                trough_y.append(_interp_at(c.t1, t, y))
        
        self.sc_peaks.set_offsets(
            np.column_stack([peak_t, peak_y]) if len(peak_t) else np.empty((0, 2))
        )
        self.sc_troughs.set_offsets(
            np.column_stack([trough_t, trough_y]) if len(trough_t) else np.empty((0, 2))
        )
        
        # Rise/fall markers
        r_t = [tr for tr in analyzer.rise_starts if t0 <= tr <= t1]
        f_t = [tf for tf in analyzer.fall_starts if t0 <= tf <= t1]
        r_y = [_interp_at(tr, t, y) for tr in r_t]
        f_y = [_interp_at(tf, t, y) for tf in f_t]
        
        self.sc_rise.set_offsets(
            np.column_stack([r_t, r_y]) if len(r_t) else np.empty((0, 2))
        )
        self.sc_fall.set_offsets(
            np.column_stack([f_t, f_y]) if len(f_t) else np.empty((0, 2))
        )
        
        # Shading for OK cycles
        self._clear_spans()
        for c in analyzer.cycles:
            if not c.ok:
                continue
            if c.t1 < t0 or c.t0 > t1:
                continue
            sp = self.ax1.axvspan(c.t0, c.t1, alpha=0.12, color='green')
            self._spans.append(sp)
        
        # Autoscale
        self.ax1.relim()
        self.ax1.autoscale_view()
        self.ax2.relim()
        self.ax2.autoscale_view()
        
        self.fig.canvas.draw_idle()
        self.fig.canvas.flush_events()
    
    def close(self):
        """Close the plot window."""
        plt.close(self.fig)


class Stage2Plot:
    """Live plotting for Stage 2 with inspiration markers."""
    
    def __init__(self):
        plt.ion()
        self.fig, (self.ax1, self.ax2) = plt.subplots(2, 1, figsize=(14, 7), sharex=True)
        self.fig.suptitle("Stage 2: Real-time | max inspiration detection")
        
        # Lines
        (self.l_raw,) = self.ax1.plot([], [], label="raw", color='lightblue', linewidth=1)
        (self.l_filt,) = self.ax1.plot([], [], label="filtered", color='blue', linewidth=2)
        (self.l_dy,) = self.ax2.plot([], [], label="dy", color='gray', linewidth=1, alpha=0.5)
        (self.l_dys,) = self.ax2.plot([], [], label="dy_smooth", color='green', linewidth=2)
        
        # Markers
        self.sc_base = self.ax1.scatter([], [], s=80, marker="x", label="baseline", color='red', zorder=5, linewidths=2)
        self.sc_start = self.ax1.scatter([], [], s=80, marker="^", label="inhale_start", color='green', zorder=5)
        self.sc_peak = self.ax1.scatter([], [], s=100, marker="o", label="peak", color='orange', zorder=5)
        
        self.ax1.set_ylabel("Sensor Value")
        self.ax2.set_ylabel("dy (per sec)")
        self.ax2.set_xlabel("Time (s)")
        
        self.ax1.grid(True, alpha=0.3)
        self.ax2.grid(True, alpha=0.3)
        
        self.ax1.legend(loc="upper right")
        self.ax2.legend(loc="upper right")
        
        plt.tight_layout()
    
    def update(self, detector: Stage2Detector):
        """Update plot with current detector state."""
        if len(detector.ts) == 0:
            return
        
        ts = np.asarray(detector.ts, dtype=float)
        raw = np.asarray(detector.raw, dtype=float)
        filt = np.asarray(detector.filt, dtype=float)
        dy = np.asarray(detector.dy, dtype=float)
        dy_s = np.asarray(detector.dy_s, dtype=float)
        
        self.l_raw.set_data(ts, raw)
        self.l_filt.set_data(ts, filt)
        self.l_dy.set_data(ts, dy)
        self.l_dys.set_data(ts, dy_s)
        
        # Markers
        def _set_sc(sc, pts):
            if len(pts) == 0:
                sc.set_offsets(np.empty((0, 2)))
            else:
                sc.set_offsets(np.asarray(pts, dtype=float))
        
        _set_sc(self.sc_base, detector.baseline_marks)
        _set_sc(self.sc_start, detector.start_marks)
        _set_sc(self.sc_peak, detector.peak_marks)
        
        # Autoscale
        self.ax1.relim()
        self.ax1.autoscale_view()
        self.ax2.relim()
        self.ax2.autoscale_view()

        # draw_idle() avoids blocking and reduces lag
        self.fig.canvas.draw_idle()
        self.fig.canvas.flush_events()
    
    def close(self):
        """Close the plot window."""
        plt.close(self.fig)


class Stage3Plot:
    """Live plotting for Stage 3 with DIBH hold detection."""
    
    def __init__(self, exhale_dy_thresh: float = 2.5):
        plt.ion()
        self.fig, (self.ax1, self.ax2) = plt.subplots(2, 1, figsize=(14, 7), sharex=True)
        self.fig.suptitle("Stage 3: Real-time | DIBH thresholds + hold detection")
        
        # Lines
        self.raw_line, = self.ax1.plot([], [], label="raw", color='lightblue', linewidth=1)
        self.filt_line, = self.ax1.plot([], [], label="filtered", color='blue', linewidth=2)
        self.dy_line, = self.ax2.plot([], [], label="dy_smooth", color='green', linewidth=2)
        
        # Threshold lines
        self.target_line = self.ax1.axhline(np.nan, linestyle="--", label="target", color='cyan', linewidth=2)
        self.hold_line = self.ax1.axhline(np.nan, linestyle="--", label="hold_th", color='orange', linewidth=2)
        self.rel_line = self.ax1.axhline(np.nan, linestyle="--", label="release_th", color='red', linewidth=2)
        
        # Vertical markers
        self.hold_start_vline = self.ax1.axvline(np.nan, linestyle=":", label="hold_start", color='green', linewidth=2)
        self.hold_end_vline = self.ax1.axvline(np.nan, linestyle=":", label="hold_end", color='red', linewidth=2)
        
        # Exhale threshold
        self.exhale_line = self.ax2.axhline(-abs(exhale_dy_thresh), linestyle="--", label="-exhale_dy_thresh", color='red', linewidth=1.5)
        
        self.ax1.set_ylabel("Sensor value")
        self.ax1.grid(True, alpha=0.3)
        self.ax1.legend(loc="upper right")
        
        self.ax2.set_ylabel("dy (per sec)")
        self.ax2.set_xlabel("Time (s)")
        self.ax2.grid(True, alpha=0.3)
        self.ax2.legend(loc="upper right")
        
        plt.tight_layout()
    
    def update(self, detector: Stage3Detector, t_buf: Deque[float], raw_buf: Deque[float], 
               filt_buf: Deque[float], dy_s_buf: Deque[float]):
        """Update plot with current detector state."""
        if len(t_buf) == 0:
            return
        
        tt = np.array(t_buf, dtype=float)
        rr = np.array(raw_buf, dtype=float)
        ff = np.array(filt_buf, dtype=float)
        dd = np.array(dy_s_buf, dtype=float)
        
        # Downsample for display to reduce lag (max 400 points)
        max_pts = 400
        n = len(tt)
        if n > max_pts:
            step = n // max_pts
            idx = np.arange(0, n, step)
            if idx[-1] != n - 1:
                idx = np.append(idx, n - 1)
            tt, rr, ff, dd = tt[idx], rr[idx], ff[idx], dd[idx]
        
        self.raw_line.set_data(tt, rr)
        self.filt_line.set_data(tt, ff)
        self.dy_line.set_data(tt, dd)
        
        # Thresholds
        if detector.hold_th is not None and detector.release_th is not None and detector.target_th is not None:
            if len(tt) > 0:
                self.hold_line.set_ydata([detector.hold_th, detector.hold_th])
                self.rel_line.set_ydata([detector.release_th, detector.release_th])
                self.target_line.set_ydata([detector.target_th, detector.target_th])
        else:
            self.hold_line.set_ydata([np.nan, np.nan])
            self.rel_line.set_ydata([np.nan, np.nan])
            self.target_line.set_ydata([np.nan, np.nan])
        
        # Hold start/end markers
        if detector.attempts and detector.attempt_idx > 0:
            a = detector.attempts[detector.attempt_idx - 1]
            if a.hold_start_t is not None:
                self.hold_start_vline.set_xdata([a.hold_start_t, a.hold_start_t])
            else:
                self.hold_start_vline.set_xdata([np.nan, np.nan])
            if a.hold_end_t is not None:
                self.hold_end_vline.set_xdata([a.hold_end_t, a.hold_end_t])
            else:
                self.hold_end_vline.set_xdata([np.nan, np.nan])
        else:
            self.hold_start_vline.set_xdata([np.nan, np.nan])
            self.hold_end_vline.set_xdata([np.nan, np.nan])
        
        # Autoscale (relim/autoscale can be heavy; we already cap points above)
        self.ax1.relim()
        self.ax1.autoscale_view()
        self.ax2.relim()
        self.ax2.autoscale_view()
        
        # draw_idle() schedules redraw without blocking; draw() would block and cause lag
        self.fig.canvas.draw_idle()
        self.fig.canvas.flush_events()
    
    def close(self):
        """Close the plot window."""
        plt.close(self.fig)


# ============================================================================
# DIBH TYPE DETERMINATION
# ============================================================================

def determine_dibh_type(avg_dibh: Optional[float], cv: Optional[float]) -> Optional[str]:
    """
    Determine DIBH Type based on flowchart:
    - TYPE A: avgDIBH >= 15초 AND CV < 15%
    - TYPE C: avgDIBH < 10초 OR CV >= 30% (and not TYPE A)
    - TYPE B: everything else
    """
    if avg_dibh is None or cv is None:
        return None
    
    # TYPE A: avgDIBH >= 15초 AND CV < 15%
    if avg_dibh >= 15.0 and cv < 15.0:
        return "A"
    
    # TYPE C: avgDIBH < 10초 OR CV >= 30% (and not TYPE A)
    if avg_dibh < 10.0 or cv >= 30.0:
        return "C"
    
    # TYPE B: everything else
    return "B"


# ============================================================================
# MAIN CALIBRATION SYSTEM WITH GUI
# ============================================================================

class DIBHCalibrationSystem:
    """Main calibration system combining all three stages."""
    
    def __init__(
        self,
        period_ms: int = 100,
        # Stage 1 params
        calib_sec: float = 20.0,
        q_hi: float = 0.90,
        # Stage 2 params
        stage2_reps: int = 3,
        stage2_prep_sec: float = 3.0,
        stage2_timeout_inhale_sec: float = 8.0,
        stage2_timeout_return_sec: float = 8.0,
        stage2_rest_sec: float = 2.0,
        # Stage 3 params
        stage3_reps: int = 3,
        stage3_max_amp: float = 59.8,
    ):
        self.period_ms = period_ms
        self.calib_sec = calib_sec
        self.q_hi = q_hi
        self.stage2_reps = stage2_reps
        self.stage2_prep_sec = stage2_prep_sec
        self.stage2_timeout_inhale_sec = stage2_timeout_inhale_sec
        self.stage2_timeout_return_sec = stage2_timeout_return_sec
        self.stage2_rest_sec = stage2_rest_sec
        self.stage3_reps = stage3_reps
        self.stage3_max_amp = stage3_max_amp
        
        # Stage instances
        self.stage1 = Stage1EnsembleRTAnalyzer(calib_sec=calib_sec, q_hi=q_hi)
        self.stage2 = Stage2Detector(
            reps=stage2_reps,
            prep_sec=stage2_prep_sec,
            inspiration_timeout_sec=stage2_timeout_inhale_sec,
            return_timeout_sec=stage2_timeout_return_sec,
            rest_sec=stage2_rest_sec,
        )
        self.stage3 = None  # Will be initialized after Stage 2
        
        # System state
        self.current_stage = 0  # 0=idle, 1=stage1, 2=stage2, 3=stage3, 4=done
        self.prep_time_sec = 5.0
        self.prep_start_time: Optional[float] = None
        self.in_prep = False
        self.emergency_stop = False
        self.running = False
        
        # Results
        self.cv: Optional[float] = None          # CV (amplitude) - used for DIBH type
        self.cv_period: Optional[float] = None  # CV (period) - kept for reference
        self.max_amp: Optional[float] = None
        self.avg_amp: Optional[float] = None
        self.min_amp: Optional[float] = None
        self.avg_dibh: Optional[float] = None
        self.dibh_type: Optional[str] = None
        
        # Device
        self.gdx_device = None
        self.sensor_index = 0
        self.sensor_label = ""
        
        # Timing
        self.t0_wall = None
        self.sample_q: queue.Queue[Tuple[float, float]] = queue.Queue(maxsize=2000)
        self.last_plot_update = 0.0
        self.plot_update_interval = 0.1  # Update plots at ~10 Hz
        
        # Plotting
        self.fig = None
        self.ax = None
        self.status_text = None
        self.buttons = {}
        self.current_plot = None  # Current active plot (Stage1Plot, Stage2Plot, or Stage3Plot)
        
        # Buffers for Stage 3 plotting
        self.stage3_t_buf: Deque[float] = deque()
        self.stage3_raw_buf: Deque[float] = deque()
        self.stage3_filt_buf: Deque[float] = deque()
        self.stage3_dy_s_buf: Deque[float] = deque()
        self.stage3_plot_window_sec = 30.0
        
        # Filters for Stage 3
        self.y_lpf = None
        self.dy_est = None

        # Run output directory (set when calibration starts)
        self.run_outdir: Optional[str] = None
        self._stage3_last_saved_rep_count: int = 0

    def _ensure_run_outdir(self) -> None:
        """Create timestamped run output directory if not set."""
        if self.run_outdir is not None:
            return
        base = "calibration_out"
        os.makedirs(base, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.run_outdir = os.path.join(base, f"dibh_run_{stamp}")
        os.makedirs(self.run_outdir, exist_ok=True)
        print(f"[SAVE] Run output: {self.run_outdir}")

    def _save_stage_plot_and_data(self, stage_number: int) -> None:
        """Save the current stage plot (PNG) and raw data (CSV) before closing."""
        if self.run_outdir is None:
            self._ensure_run_outdir()
        if self.current_plot is None:
            return
        try:
            # Save plot
            plot_path = os.path.join(self.run_outdir, f"stage{stage_number}_plot.png")
            self.current_plot.fig.savefig(plot_path, dpi=150, bbox_inches="tight")
            print(f"[SAVE] Plot: {plot_path}")
        except Exception as e:
            print(f"[WARN] Failed to save stage {stage_number} plot: {e}")
        try:
            # Save raw data (and filtered where available)
            csv_path = os.path.join(self.run_outdir, f"stage{stage_number}_raw.csv")
            with open(csv_path, "w", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                if stage_number == 1:
                    w.writerow(["t", "raw", "filtered", "dy"])
                    for i in range(len(self.stage1.t_buf)):
                        t = self.stage1.t_buf[i]
                        raw = self.stage1.raw_buf[i]
                        y = self.stage1.y_buf[i] if i < len(self.stage1.y_buf) else ""
                        dy = self.stage1.dy_buf[i] if i < len(self.stage1.dy_buf) else ""
                        w.writerow([t, raw, y, dy])
                elif stage_number == 2:
                    w.writerow(["t", "raw", "filtered", "dy", "dy_smooth"])
                    for i in range(len(self.stage2.ts)):
                        t = self.stage2.ts[i]
                        raw = self.stage2.raw[i]
                        filt = self.stage2.filt[i]
                        dy = self.stage2.dy[i] if i < len(self.stage2.dy) else ""
                        dy_s = self.stage2.dy_s[i] if i < len(self.stage2.dy_s) else ""
                        w.writerow([t, raw, filt, dy, dy_s])
                else:  # stage 3
                    w.writerow(["t", "raw", "filtered", "dy_smooth"])
                    for i in range(len(self.stage3_t_buf)):
                        t = self.stage3_t_buf[i]
                        raw = self.stage3_raw_buf[i]
                        filt = self.stage3_filt_buf[i] if i < len(self.stage3_filt_buf) else ""
                        dy_s = self.stage3_dy_s_buf[i] if i < len(self.stage3_dy_s_buf) else ""
                        w.writerow([t, raw, filt, dy_s])
            print(f"[SAVE] Data: {csv_path}")
            if stage_number == 3 and self.stage3 is not None:
                summary_path = os.path.join(self.run_outdir, "stage3_summary.json")
                try:
                    attempts_list = []
                    for a in self.stage3.attempts:
                        attempts_list.append({
                            "idx": a.idx,
                            "hold_duration_sec": a.hold_duration,
                            "rep_peak_val": a.rep_peak_val,
                            "hold_quality_pct": a.hold_quality_pct,
                            "hold_mean": a.hold_mean,
                            "hold_std": a.hold_std,
                            "hold_min": a.hold_min,
                            "hold_max": a.hold_max,
                            "valid": a.valid,
                            "reason": a.reason,
                        })
                    summary = {
                        "attempts": attempts_list,
                        "avg_dibh_sec": self.avg_dibh,
                        "avg_hold_quality_pct": self.stage3.get_avg_hold_quality_pct(),
                        "dibh_type": self.dibh_type,
                    }
                    with open(summary_path, "w", encoding="utf-8") as f:
                        json.dump(summary, f, indent=2, ensure_ascii=False)
                    print(f"[SAVE] Summary: {summary_path}")
                except Exception as ex:
                    print(f"[WARN] Failed to save stage 3 summary: {ex}")
        except Exception as e:
            print(f"[WARN] Failed to save stage {stage_number} data: {e}")

    def connect_device(self, my_gdx: gdx.gdx) -> None:
        """Connect to GDX device via Bluetooth and select sensor 1 (Force)."""
        self.gdx_device = my_gdx
        
        # Always use Bluetooth connection
        print("Connecting via Bluetooth (scanning)...")
        print("Waiting for Bluetooth connection...")
        
        # Wait for Bluetooth initialization
        time.sleep(1.0)
        
        try:
            my_gdx.open_ble()
        except Exception as e:
            raise RuntimeError(f"Failed to open GDX over Bluetooth: {e}")
        
        # Wait for connection to be established
        # Try to verify connection by checking if device is accessible
        max_wait_attempts = 30  # Wait up to 30 seconds
        wait_interval = 1.0
        connected = False
        
        for attempt in range(max_wait_attempts):
            try:
                # Try to get device info to verify connection
                device_info = my_gdx.device_info()
                if device_info:
                    connected = True
                    print(f"Bluetooth connected: {device_info}")
                    break
            except Exception:
                pass
            
            if attempt < max_wait_attempts - 1:
                print(f"Waiting for Bluetooth connection... ({attempt + 1}/{max_wait_attempts})")
                time.sleep(wait_interval)
        
        if not connected:
            raise RuntimeError("Bluetooth connection timeout. Please ensure device is powered on and in range.")
        
        # Automatically select sensor 1 (Force)
        print("\nSelecting sensor 1 (Force)...")
        sensor_id = 1
        
        try:
            # First, try to get available sensors to verify sensor 1 exists
            sensors = my_gdx.sensor_info()
            if sensors:
                print(f"Available sensors: {[s[0] for s in sensors]}")
                # Verify sensor 1 is available
                valid_channels = [int(s[0]) for s in sensors]
                if sensor_id not in valid_channels:
                    raise RuntimeError(f"Sensor {sensor_id} not found. Available sensors: {valid_channels}")
            
            # Select sensor 1
            my_gdx.select_sensors([sensor_id])
            print(f"Sensor {sensor_id} (Force) selected successfully.")
        except TypeError:
            # Some versions might need different approach
            try:
                my_gdx.select_sensors([sensor_id])
            except Exception as e:
                raise RuntimeError(f"Failed to select sensor {sensor_id}: {e}")
        except Exception as e:
            raise RuntimeError(f"select_sensors() failed: {e}")
        
        # Start acquisition
        print(f"Starting data acquisition (period: {self.period_ms}ms)...")
        try:
            my_gdx.start(period=self.period_ms)
        except TypeError:
            my_gdx.start(self.period_ms)
        
        # Verify we can read from the sensor
        print("Verifying sensor reading...")
        for verify_attempt in range(5):
            try:
                vals = my_gdx.read()
                if vals is not None and len(vals) > 0:
                    print(f"Sensor reading verified: {vals[0]}")
                    break
            except Exception:
                if verify_attempt < 4:
                    time.sleep(0.5)
                else:
                    print("[WARN] Could not verify sensor reading, but continuing...")
        
        self.sensor_index = 0
        self.sensor_label = f"Force (N) [Sensor {sensor_id}]"
        
        print(f"\n✓ Device connected and ready")
        print(f"  Connection: Bluetooth")
        print(f"  Sensor: {self.sensor_label}")
        print(f"  Sampling period: {self.period_ms}ms")

    def start_calibration(self, event=None):
        """Start the full calibration sequence."""
        if self.running:
            print("[INFO] Calibration already running")
            return
        
        self.emergency_stop = False
        self.running = True
        self.current_stage = 0
        self.t0_wall = time.perf_counter()
        self.in_prep = True
        self.prep_start_time = self._current_t()
        
        # Reset all stages
        self.stage1.reset()
        self.stage2.reset()
        if self.stage3 is not None:
            self.stage3.reset()
        
        # Reset results
        self.cv = None
        self.cv_period = None
        self.max_amp = None
        self.avg_amp = None
        self.min_amp = None
        self.avg_dibh = None
        self.dibh_type = None
        
        print("[START] Calibration sequence started. 5 second prep time...")
        self._update_status()

    def emergency_stop_action(self, event=None):
        """Emergency stop - halt current stage immediately."""
        if not self.running:
            return
        
        self.emergency_stop = True
        self.running = False
        self.in_prep = False
        
        # Stop all stages
        self.stage1.stop()
        self.stage2.stop()
        if self.stage3 is not None:
            self.stage3.stop()
        
        print("[EMERGENCY STOP] Calibration halted")
        self._update_status()

    def restart_stage(self, event=None):
        """Restart the current stage."""
        if not self.running:
            print("[INFO] No calibration running")
            return
        
        self.emergency_stop = False
        self.in_prep = True
        self.prep_start_time = self._current_t()
        
        if self.current_stage == 1:
            self.stage1.reset()
            self.stage1.start(self._current_t())
            self._init_plot_for_stage(1)
            print("[RESTART] Stage 1 restarted. 5 second prep time...")
        elif self.current_stage == 2:
            self.stage2.reset()
            self.stage2.start(self._current_t())
            self._init_plot_for_stage(2)
            print("[RESTART] Stage 2 restarted. 5 second prep time...")
        elif self.current_stage == 3:
            if self.stage3 is not None:
                self.stage3.reset()
                self.stage3.start(self._current_t())
                self._init_plot_for_stage(3)
                self._stage3_last_saved_rep_count = 0
                # Clear Stage 3 buffers
                self.stage3_t_buf.clear()
                self.stage3_raw_buf.clear()
                self.stage3_filt_buf.clear()
                self.stage3_dy_s_buf.clear()
                print("[RESTART] Stage 3 restarted. 5 second prep time...")
        
        self._update_status()

    def restart_whole_calibration(self, event=None):
        """Restart the entire calibration from Stage 1."""
        self.emergency_stop = False
        self.running = True
        self.current_stage = 0
        self.t0_wall = time.perf_counter()
        self.in_prep = True
        self.prep_start_time = self._current_t()
        
        # Reset all stages
        self.stage1.reset()
        self.stage2.reset()
        if self.stage3 is not None:
            self.stage3.reset()
        
        # Reset results
        self.cv = None
        self.cv_period = None
        self.max_amp = None
        self.avg_amp = None
        self.min_amp = None
        self.avg_dibh = None
        self.dibh_type = None
        
        print("[RESTART WHOLE] Calibration restarted from Stage 1. 5 second prep time...")
        self._update_status()

    def _current_t(self) -> float:
        """Get current time relative to start."""
        if self.t0_wall is None:
            return 0.0
        return time.perf_counter() - self.t0_wall
    
    def _init_plot_for_stage(self, stage: int):
        """Initialize plot for the given stage."""
        # Save and close existing plot (plot + raw data for the stage we're leaving)
        if self.current_plot is not None:
            prev_stage = stage - 1  # stage we're leaving (1 when going to 2, 2 when going to 3)
            if prev_stage >= 1:
                self._save_stage_plot_and_data(prev_stage)
            try:
                self.current_plot.close()
            except Exception:
                pass
            self.current_plot = None

        # Create new plot for the stage
        if stage == 1:
            self.current_plot = Stage1Plot()
            print("[PLOT] Stage 1 plot initialized")
        elif stage == 2:
            self.current_plot = Stage2Plot()
            print("[PLOT] Stage 2 plot initialized")
        elif stage == 3:
            self.current_plot = Stage3Plot(exhale_dy_thresh=2.5)
            print("[PLOT] Stage 3 plot initialized")
    
    def _update_plot(self):
        """Update the current plot based on active stage."""
        if self.current_plot is None:
            return
        
        try:
            if self.current_stage == 1 and self.stage1.running:
                self.current_plot.update(self.stage1)
            elif self.current_stage == 2 and self.stage2.running:
                self.current_plot.update(self.stage2)
            elif self.current_stage == 3 and self.stage3 is not None and self.stage3.session_running:
                self.current_plot.update(
                    self.stage3,
                    self.stage3_t_buf,
                    self.stage3_raw_buf,
                    self.stage3_filt_buf,
                    self.stage3_dy_s_buf
                )
        except Exception as e:
            # Don't crash on plot errors
            pass

    def _update_status(self):
        """Update status display."""
        if self.status_text is None:
            return
        
        status_lines = []
        status_lines.append("=" * 50)
        status_lines.append("  DIBH CALIBRATION SYSTEM")
        status_lines.append("=" * 50)
        status_lines.append("")
        
        if not self.running:
            status_lines.append("Status: IDLE")
            status_lines.append("  Ready to start calibration")
        elif self.emergency_stop:
            status_lines.append("Status: ⚠ EMERGENCY STOP ⚠")
            status_lines.append("  Calibration halted")
        elif self.in_prep:
            elapsed = self._current_t() - (self.prep_start_time or 0)
            remaining = max(0, self.prep_time_sec - elapsed)
            if self.current_stage == 0:
                status_lines.append(f"Status: PREP (Before Stage 1)")
            elif self.current_stage == 1:
                status_lines.append(f"Status: PREP (Before Stage 2)")
            elif self.current_stage == 2:
                status_lines.append(f"Status: PREP (Before Stage 3)")
            status_lines.append(f"  Time remaining: {remaining:.1f}s")
        elif self.current_stage == 1:
            ok_cycles = len([c for c in self.stage1.cycles if c.ok])
            status_lines.append("Status: Stage 1 Running")
            status_lines.append(f"  OK Cycles: {ok_cycles}/10 (need at least 10)")
        elif self.current_stage == 2:
            status_lines.append("Status: Stage 2 Running")
            status_lines.append(f"  Attempt: {self.stage2.attempt_idx + 1}/{self.stage2.reps}")
            status_lines.append(f"  Phase: {self.stage2.phase}")
            if getattr(self.stage2, "prompt", None):
                status_lines.append("")
                status_lines.append(f"  >>> {self.stage2.prompt} <<<")
        elif self.current_stage == 3:
            if self.stage3 is not None:
                status_lines.append("Status: Stage 3 Running")
                status_lines.append(f"  Rep: {self.stage3.attempt_idx}/{self.stage3.reps}")
                status_lines.append(f"  Phase: {self.stage3.phase}")
        elif self.current_stage == 4:
            status_lines.append("Status: ✓ COMPLETE ✓")
            status_lines.append("  All stages finished")
        
        status_lines.append("")
        status_lines.append("-" * 50)
        status_lines.append("RESULTS:")
        status_lines.append("-" * 50)
        if self.cv is not None:
            status_lines.append(f"  CV (amplitude): {self.cv:.2f}%")
        else:
            status_lines.append("  CV (amplitude): Not available")
        if self.cv_period is not None:
            status_lines.append(f"  CV (period): {self.cv_period:.2f}%")
        else:
            status_lines.append("  CV (period): Not available")
        if self.max_amp is not None:
            status_lines.append(f"  Max Amp: {self.max_amp:.2f}")
        else:
            status_lines.append("  Max Amp: Not available")
        if self.avg_amp is not None:
            status_lines.append(f"  Avg Amp: {self.avg_amp:.2f}")
        else:
            status_lines.append("  Avg Amp: Not available")
        if self.min_amp is not None:
            status_lines.append(f"  Min Amp: {self.min_amp:.2f}")
        else:
            status_lines.append("  Min Amp: Not available")
        if self.avg_dibh is not None:
            status_lines.append(f"  Avg DIBH: {self.avg_dibh:.2f}s")
        else:
            status_lines.append("  Avg DIBH: Not available")
        if self.stage3 is not None:
            avg_q = self.stage3.get_avg_hold_quality_pct()
            if avg_q is not None:
                status_lines.append(f"  Hold quality (avg): {avg_q:.1f}%")
                for a in self.stage3.attempts:
                    q = getattr(a, "hold_quality_pct", None)
                    if q is not None:
                        status_lines.append(f"    Rep {a.idx}: {q:.1f}%")
        if self.dibh_type is not None:
            status_lines.append("")
            status_lines.append(f"  >>> DIBH TYPE: {self.dibh_type} <<<")
        else:
            status_lines.append("  DIBH Type: Not determined")
        
        self.status_text.set_text("\n".join(status_lines))

    def _process_samples(self):
        """Process samples from device."""
        if self.gdx_device is None:
            return
        
        try:
            vals = self.gdx_device.read()
        except Exception:
            return
        
        if vals is None or len(vals) == 0:
            return
        
        try:
            y_raw = float(vals[self.sensor_index])
        except Exception:
            return
        
        t = self._current_t()
        
        # Handle prep time
        if self.in_prep and self.prep_start_time is not None:
            elapsed = t - self.prep_start_time
            if elapsed >= self.prep_time_sec:
                self.in_prep = False
                self.prep_start_time = None
                # Start the appropriate stage
                if self.current_stage == 0:
                    self._ensure_run_outdir()
                    self.current_stage = 1
                    self.stage1.start(t)
                    self._init_plot_for_stage(1)
                    print("[STAGE 1] Started - collecting breath cycles for CV...")
                elif self.current_stage == 1:
                    # Transition to Stage 2 prep
                    self.cv = self.stage1.get_cv()
                    self.cv_period = self.stage1.get_cv_period()
                    if self.cv is None:
                        print("[WARN] Stage 1 incomplete - CV (amplitude) not available")
                    else:
                        print(f"[STAGE 1] Complete - CV (amplitude): {self.cv:.2f}% | CV (period): {self.cv_period if self.cv_period is None else f'{self.cv_period:.2f}%'}")
                    self.current_stage = 2
                    self._init_plot_for_stage(2)
                    self.in_prep = True
                    self.prep_start_time = t
                    print("[PREP] 5 second prep before Stage 2...")
                elif self.current_stage == 2:
                    # Start Stage 2 after prep
                    self.stage2.begin(t)
                    print("[STAGE 2] Started - measuring maximum inspiration...")
                elif self.current_stage == 3:
                    # Start Stage 3 after prep (stage3 was created when Stage 2 completed)
                    if self.stage3 is not None:
                        self.stage3.start(t)
                        self._stage3_last_saved_rep_count = 0
                        # Reset filters so Stage 3 gets fresh y_f, dy_s (no carryover from Stage 2)
                        if self.y_lpf is not None:
                            self.y_lpf.reset()
                        if self.dy_est is not None:
                            self.dy_est.reset()
                        self.stage3_t_buf.clear()
                        self.stage3_raw_buf.clear()
                        self.stage3_filt_buf.clear()
                        self.stage3_dy_s_buf.clear()
                    print("[STAGE 3] Started - DIBH hold measurement...")
        
        if not self.running or self.emergency_stop:
            return
        
        # Process samples for current stage
        if self.current_stage == 1 and not self.in_prep:
            self.stage1.update(t, y_raw)
            # Update plot (throttled)
            if t - self.last_plot_update >= self.plot_update_interval:
                self._update_plot()
                self.last_plot_update = t
            if self.stage1.is_done():
                self.cv = self.stage1.get_cv()
                if self.cv is not None:
                    print(f"[STAGE 1] Complete - CV: {self.cv:.2f}%")
                    self.stage1.stop()
                    # Transition to Stage 2 prep
                    self.current_stage = 2
                    self._init_plot_for_stage(2)
                    self.in_prep = True
                    self.prep_start_time = t
                    print("[PREP] 5 second prep before Stage 2...")
        
        elif self.current_stage == 2 and not self.in_prep:
            self.stage2.update(t, y_raw)
            # Update plot (throttled)
            if t - self.last_plot_update >= self.plot_update_interval:
                self._update_plot()
                self.last_plot_update = t
            if self.stage2.is_done():
                self.max_amp = self.stage2.get_max_amp()
                self.avg_amp = self.stage2.get_avg_amp()
                self.min_amp = self.stage2.get_min_amp()
                # Debug: list all peaks (filtered) so you can compare with chart
                print("[Stage2 PEAKS summary] (all from filtered signal; amp = peak_val - baseline_val)")
                for r in self.stage2.attempt_results:
                    b = r.baseline_val
                    pv = r.peak_val
                    a = r.amp
                    b_s = f"{b:.4f}" if not (isinstance(b, float) and math.isnan(b)) else "nan"
                    pv_s = f"{pv:.4f}" if pv is not None else "None"
                    a_s = f"{a:.4f}" if a is not None else "None"
                    print(f"  attempt {r.attempt_idx}: baseline={b_s} peak_val={pv_s} amp={a_s} valid={r.valid} {r.reason}")
                print(f"  -> Max_amp={self.max_amp} Avg_amp={self.avg_amp} Min_amp={self.min_amp} (valid attempts only)")
                # Stage 3 uses average peak from Stage 2 for thresholds (not max, not hardcoded)
                amp_for_stage3 = self.avg_amp if self.avg_amp is not None else self.max_amp
                if amp_for_stage3 is None:
                    print("[WARN] Stage 2 incomplete - using default amp for Stage 3")
                    amp_for_stage3 = self.stage3_max_amp
                else:
                    max_str = f"{self.max_amp:.2f}" if self.max_amp is not None else "N/A"
                    avg_str = f"{self.avg_amp:.2f}" if self.avg_amp is not None else "N/A"
                    min_str = f"{self.min_amp:.2f}" if self.min_amp is not None else "N/A"
                    print(f"[STAGE 2] Complete - Max: {max_str} | Avg: {avg_str} | Min: {min_str} (Stage 3 uses avg: {amp_for_stage3:.2f})")
                self.stage2.stop()
                # Initialize Stage 3 with average peak from Stage 2
                self.stage3 = Stage3Detector(
                    reps=self.stage3_reps,
                    prep_sec=4.0,
                    baseline_sec=2.0,
                    rest_sec=4.0,
                    timeout_inhale_sec=12.0,
                    max_hold_sec=40.0,
                    min_hold_sec=3.0,
                    max_amp=float(amp_for_stage3),
                    hold_ratio=0.80,
                    release_ratio=0.50,
                    target_ratio=0.85,
                    inhale_start_ratio=0.40,
                    baseline_dy_mad_k=2.8,
                    hold_end_mode="release_and_exhale",
                    exhale_dy_thresh=2.5,
                    confirm_sec=0.25,
                    min_dwell_wait_hold_start_sec=1.0,
                )
                self.y_lpf = OnePoleLPF(1.2)
                self.dy_est = DerivativeEstimator(1.8)
                # Clear Stage 3 buffers
                self.stage3_t_buf.clear()
                self.stage3_raw_buf.clear()
                self.stage3_filt_buf.clear()
                self.stage3_dy_s_buf.clear()
                # Transition to Stage 3 prep
                self.current_stage = 3
                self._init_plot_for_stage(3)
                self.in_prep = True
                self.prep_start_time = t
                print("[PREP] 5 second prep before Stage 3...")
        
        elif self.current_stage == 3 and not self.in_prep:
            if self.stage3 is not None and self.y_lpf is not None and self.dy_est is not None:
                y_f = self.y_lpf.update(t, y_raw)
                _, dy_s = self.dy_est.update(t, y_f)
                self.stage3.update(t, y_f, dy_s)
                
                # Update Stage 3 buffers for plotting
                self.stage3_t_buf.append(t)
                self.stage3_raw_buf.append(y_raw)
                self.stage3_filt_buf.append(y_f)
                self.stage3_dy_s_buf.append(dy_s)
                
                # Keep window
                while len(self.stage3_t_buf) > 0 and (t - self.stage3_t_buf[0]) > self.stage3_plot_window_sec:
                    self.stage3_t_buf.popleft()
                    self.stage3_raw_buf.popleft()
                    self.stage3_filt_buf.popleft()
                    self.stage3_dy_s_buf.popleft()
                
                # Update plot (throttled)
                if t - self.last_plot_update >= self.plot_update_interval:
                    self._update_plot()
                    self.last_plot_update = t
                
                # Save screenshot as soon as each rep is done
                n_attempts = len(self.stage3.attempts)
                if n_attempts > self._stage3_last_saved_rep_count and self.current_plot is not None:
                    self._ensure_run_outdir()
                    for i in range(self._stage3_last_saved_rep_count, n_attempts):
                        rep_num = i + 1
                        path = os.path.join(self.run_outdir, f"stage3_rep{rep_num}_plot.png")
                        try:
                            self.current_plot.fig.savefig(path, dpi=150, bbox_inches="tight")
                            print(f"[SAVE] Stage 3 rep {rep_num} screenshot: {path}")
                        except Exception as e:
                            print(f"[WARN] Failed to save Stage 3 rep {rep_num} screenshot: {e}")
                    self._stage3_last_saved_rep_count = n_attempts
                
                if self.stage3.is_done():
                    self.avg_dibh = self.stage3.get_avg_dibh()
                    avg_quality = self.stage3.get_avg_hold_quality_pct()
                    if self.avg_dibh is None:
                        print("[WARN] Stage 3 incomplete - avgDIBH not available")
                    else:
                        print(f"[STAGE 3] Complete - Avg DIBH: {self.avg_dibh:.2f}s")
                    if avg_quality is not None:
                        print(f"[STAGE 3] Hold quality (avg): {avg_quality:.1f}%")
                        for a in self.stage3.attempts:
                            q = getattr(a, "hold_quality_pct", None)
                            if q is not None:
                                print(f"  Rep {a.idx}: {q:.1f}%")
                    self.stage3.stop()
                    # Save Stage 3 plot and raw data before closing
                    self._save_stage_plot_and_data(3)
                    if self.current_plot is not None:
                        try:
                            self.current_plot.close()
                        except Exception:
                            pass
                        self.current_plot = None
                    # Determine DIBH Type
                    self.dibh_type = determine_dibh_type(self.avg_dibh, self.cv)
                    if self.dibh_type:
                        print(f"[RESULT] DIBH Type: {self.dibh_type}")
                        print(f"  - avgDIBH: {self.avg_dibh:.2f}s")
                        print(f"  - CV: {self.cv:.2f}%")
                    else:
                        print("[WARN] Could not determine DIBH Type - missing data")
                    self.current_stage = 4
                    self.running = False
                    self._update_status()

    def setup_gui(self):
        """Setup matplotlib GUI with buttons."""
        plt.ion()
        self.fig = plt.figure(figsize=(14, 10))
        self.fig.suptitle("DIBH Calibration System", fontsize=18, fontweight='bold', y=0.95)
        
        # Main axes for status display
        self.ax = self.fig.add_axes([0.1, 0.25, 0.8, 0.65])
        self.ax.axis('off')
        self.status_text = self.ax.text(
            0.5, 0.5, "Initializing...",
            transform=self.ax.transAxes,
            fontsize=14,
            verticalalignment='center',
            horizontalalignment='center',
            family='monospace',
            bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.7, pad=15)
        )
        
        # Buttons at the bottom
        button_height = 0.08
        button_width = 0.18
        button_spacing = 0.02
        start_y = 0.08
        start_x = 0.1
        
        # Start Calibration button
        ax_start = plt.axes([start_x, start_y, button_width, button_height])
        self.buttons['start'] = Button(ax_start, 'Start\nCalibration', color='lightgreen', hovercolor='green')
        self.buttons['start'].on_clicked(self.start_calibration)
        
        # Emergency Stop button
        ax_stop = plt.axes([start_x + button_width + button_spacing, start_y, button_width, button_height])
        self.buttons['stop'] = Button(ax_stop, 'Emergency\nStop', color='lightcoral', hovercolor='red')
        self.buttons['stop'].on_clicked(self.emergency_stop_action)
        
        # Restart Stage button
        ax_restart_stage = plt.axes([start_x + 2*(button_width + button_spacing), start_y, button_width, button_height])
        self.buttons['restart_stage'] = Button(ax_restart_stage, 'Restart\nStage', color='lightblue', hovercolor='blue')
        self.buttons['restart_stage'].on_clicked(self.restart_stage)
        
        # Restart Whole Calibration button
        ax_restart_whole = plt.axes([start_x + 3*(button_width + button_spacing), start_y, button_width, button_height])
        self.buttons['restart_whole'] = Button(ax_restart_whole, 'Restart Whole\nCalibration', color='lightyellow', hovercolor='yellow')
        self.buttons['restart_whole'].on_clicked(self.restart_whole_calibration)
        
        self._update_status()
        plt.tight_layout()

    def run(self):
        """Main run loop."""
        # Connect device
        my_gdx = gdx.gdx()
        try:
            self.connect_device(my_gdx)
        except Exception as e:
            print(f"[ERROR] Failed to connect device: {e}")
            return
        
        # Setup GUI
        self.setup_gui()
        
        print("\n=== DIBH Calibration System Ready ===")
        print("Use the GUI buttons to control calibration.")
        print("Press Ctrl+C to exit.\n")
        
        last_update = time.perf_counter()
        
        try:
            while True:
                # Process samples
                self._process_samples()
                
                # Update GUI periodically
                now = time.perf_counter()
                if now - last_update >= 0.1:  # 10 Hz update rate
                    self._update_status()
                    self.fig.canvas.draw_idle()
                    self.fig.canvas.flush_events()
                    last_update = now
                
                time.sleep(0.01)
        
        except KeyboardInterrupt:
            print("\n[QUIT] Shutting down...")
        finally:
            try:
                my_gdx.stop()
            except Exception:
                pass
            try:
                my_gdx.close()
            except Exception:
                pass
            plt.close('all')


def main():
    """Main entry point."""
    # Default parameters from command line examples
    system = DIBHCalibrationSystem(
        period_ms=100,
        calib_sec=20.0,
        q_hi=0.90,
        stage2_reps=3,
        stage2_prep_sec=3.0,
        stage2_timeout_inhale_sec=8.0,
        stage2_timeout_return_sec=8.0,
        stage2_rest_sec=2.0,
        stage3_reps=3,
        stage3_max_amp=59.8,
    )
    
    system.run()


if __name__ == "__main__":
    main()
