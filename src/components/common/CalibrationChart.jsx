/**
 * Calibration chart with stage-specific annotations.
 * Stage 1: raw/filtered line, hi/lo, peaks, troughs, rise/fall markers, OK cycle spans.
 * Stage 2/3: line + stage-specific markers (extended in later todos).
 */

import React, { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Scatter,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const MAX_POINTS = 400;

function downsample(data, maxPoints = MAX_POINTS) {
  if (!data?.length || data.length <= maxPoints) return data || [];
  const step = data.length / maxPoints;
  const result = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(Math.floor(i * step), data.length - 1);
    result.push(data[idx]);
  }
  return result;
}

export default function CalibrationChart({
  data = [],
  stage = 1,
  title = '실시간 호흡 그래프',
  showStageCaption = true,
  /** No outer card chrome (for embedding in another panel). */
  embedded = false,
  // Stage 1 annotations
  cycles = [],
  rise_starts = [],
  fall_starts = [],
  hi,
  lo,
  // Stage 2 annotations
  baseline_marks = [],
  start_marks = [],
  peak_marks = [],
  // Stage 3 annotations
  hold_th,
  release_th,
  target_th,
  holds = [],
  hold_start_t,
  hold_end_t,
  // Optional vertical playhead (seconds)
  playheadTime = null,
}) {
  const chartData = useMemo(() => {
    const d = downsample(data);
    return d.length ? d : data;
  }, [data]);

  const domainX = useMemo(() => {
    if (!chartData.length) return [0, 60];
    const t = chartData.map((p) => p.time);
    return [Math.min(...t), Math.max(...t) || 60];
  }, [chartData]);

  const domainY = useMemo(() => {
    if (!chartData.length) return [0, 100];
    const v = chartData.map((p) => p.value);
    let min = Math.min(...v);
    let max = Math.max(...v);
    if (stage === 3 && [hold_th, release_th, target_th].some((x) => x != null)) {
      const ths = [hold_th, release_th, target_th].filter((x) => x != null);
      min = Math.min(min, ...ths);
      max = Math.max(max, ...ths);
    }
    const pad = (max - min) * 0.1 || 10;
    return [min - pad, max + pad];
  }, [chartData, stage, hold_th, release_th, target_th]);

  // Stage 1: scatter points for peaks (red), troughs (blue), rise (green up), fall (purple down)
  const peakPoints = useMemo(() => {
    if (stage !== 1 || !cycles.length) return [];
    return cycles.map((c) => ({ time: c.tp, value: c.peak_val, fill: '#EF4444' }));
  }, [stage, cycles]);

  const troughPoints = useMemo(() => {
    if (stage !== 1 || !cycles.length) return [];
    const pts = [];
    cycles.forEach((c) => {
      pts.push({ time: c.t0, value: c.trough0_val, fill: '#3B82F6' });
      pts.push({ time: c.t1, value: c.trough1_val, fill: '#3B82F6' });
    });
    return pts;
  }, [stage, cycles]);

  const risePoints = useMemo(() => {
    if (stage !== 1 || !rise_starts.length) return [];
    return rise_starts.map((t) => {
      const pt = chartData.find((p) => Math.abs(p.time - t) < 0.05) || { value: domainY[1] * 0.9 };
      return { time: t, value: pt.value, fill: '#22C55E' };
    });
  }, [stage, rise_starts, chartData, domainY]);

  const fallPoints = useMemo(() => {
    if (stage !== 1 || !fall_starts.length) return [];
    return fall_starts.map((t) => {
      const pt = chartData.find((p) => Math.abs(p.time - t) < 0.05) || { value: domainY[0] * 0.9 };
      return { time: t, value: pt.value, fill: '#A855F7' };
    });
  }, [stage, fall_starts, chartData, domainY]);

  const okAreas = useMemo(() => {
    if (stage !== 1 || !cycles.length) return [];
    return cycles.filter((c) => c.ok).map((c) => ({ x1: c.t0, x2: c.t1 }));
  }, [stage, cycles]);

  // Stage 2: baseline (x), inhale start (^), peak (o) as scatter points
  const stage2BaselinePoints = useMemo(() => {
    if (stage !== 2 || !baseline_marks.length) return [];
    return baseline_marks.map(([t, y]) => ({ time: t, value: y, fill: '#8B949E' }));
  }, [stage, baseline_marks]);
  const stage2StartPoints = useMemo(() => {
    if (stage !== 2 || !start_marks.length) return [];
    return start_marks.map(([t, y]) => ({ time: t, value: y, fill: '#22C55E' }));
  }, [stage, start_marks]);
  const stage2PeakPoints = useMemo(() => {
    if (stage !== 2 || !peak_marks.length) return [];
    return peak_marks.map(([t, y]) => ({ time: t, value: y, fill: '#EF4444' }));
  }, [stage, peak_marks]);

  const shell = embedded
    ? 'p-3 sm:p-4'
    : 'rounded-xl border border-[#30363D] bg-[#1C2128] p-5';

  if (!chartData.length) {
    return (
      <div className={shell}>
        {title ? <h3 className="mb-4 font-bold text-white">{title}</h3> : null}
        <div className="flex h-48 items-center justify-center text-sm text-[#8B949E]">
          데이터 수집 중...
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      {title ? <h3 className="mb-4 font-bold text-white">{title}</h3> : null}
      {showStageCaption && stage === 1 && (
        <p className="text-[#8B949E] text-xs mb-2">
          ● 피크(빨강) ● 골(파랑) ● 상승 시작(초록) ● 하강 시작(보라) | OK 구간: 세로 밴드
        </p>
      )}
      {showStageCaption && stage === 2 && (
        <p className="text-[#8B949E] text-xs mb-2">
          ● 기준선(회색) ● 흡기 시작(초록) ● 피크(빨강)
        </p>
      )}
      {showStageCaption && stage === 3 && (
        <p className="text-[#8B949E] text-xs mb-2">
          목표선(보라) | 유지 시작/종료(세로선)
        </p>
      )}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 10, left: 5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
            <XAxis
              dataKey="time"
              type="number"
              domain={domainX}
              stroke="#30363D"
              tick={{ fill: '#8B949E', fontSize: 10 }}
              axisLine={{ stroke: '#30363D' }}
              tickFormatter={(value) => `${Number(value).toFixed(0)}s`}
            />
            <YAxis
              type="number"
              domain={domainY}
              stroke="#30363D"
              tick={{ fill: '#8B949E', fontSize: 10 }}
              axisLine={{ stroke: '#30363D' }}
              width={45}
              tickFormatter={(value) => Number(value).toFixed(1)}
            />
            <Tooltip
              contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px' }}
              labelStyle={{ color: '#8B949E' }}
              formatter={(val) => {
                const v = Array.isArray(val) ? val[0] : val;
                return [`${Number(v).toFixed(3)} N`, 'Force'];
              }}
              labelFormatter={(value) => `Time: ${Number(value).toFixed(1)}s`}
            />
            {/* Stage 1: hi/lo reference lines */}
            {stage === 1 && hi != null && (
              <ReferenceLine y={hi} stroke="#EAB308" strokeDasharray="2 2" strokeOpacity={0.8} />
            )}
            {stage === 1 && lo != null && (
              <ReferenceLine y={lo} stroke="#06B6D4" strokeDasharray="2 2" strokeOpacity={0.8} />
            )}
            {/* Stage 3: hold/release/target thresholds and hold interval */}
            {stage === 3 && hold_th != null && (
              <ReferenceLine y={hold_th} stroke="#8B5CF6" strokeDasharray="3 3" strokeOpacity={0.9} />
            )}
            {stage === 3 && release_th != null && (
              <ReferenceLine y={release_th} stroke="#EF4444" strokeDasharray="2 2" strokeOpacity={0.8} />
            )}
            {stage === 3 && target_th != null && (
              <ReferenceLine y={target_th} stroke="#22C55E" strokeDasharray="2 2" strokeOpacity={0.8} />
            )}
            {stage === 3 && holds.length > 0 &&
              holds.map((h, i) => (
                <ReferenceArea
                  key={i}
                  x1={h.hold_start_t}
                  x2={h.hold_end_t}
                  y1={domainY[0]}
                  y2={domainY[1]}
                  fill="#8B5CF6"
                  fillOpacity={0.15}
                />
              ))}
            {stage === 3 && holds.length === 0 && hold_start_t != null && hold_end_t != null && (
              <ReferenceArea
                x1={hold_start_t}
                x2={hold_end_t}
                y1={domainY[0]}
                y2={domainY[1]}
                fill="#8B5CF6"
                fillOpacity={0.15}
              />
            )}
            {playheadTime != null && Number.isFinite(playheadTime) && (
              <ReferenceLine
                x={playheadTime}
                stroke="#FFFFFF"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            )}
            {/* OK cycle spans */}
            {stage === 1 && okAreas.length > 0 &&
              okAreas.map((area, i) => (
                <ReferenceArea
                  key={i}
                  x1={area.x1}
                  x2={area.x2}
                  y1={domainY[0]}
                  y2={domainY[1]}
                  fill="#22C55E"
                  fillOpacity={0.15}
                />
              ))}
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#3B82F6' }}
              connectNulls
            />
            {chartData[0]?.filtered != null && (
              <Line
                type="monotone"
                dataKey="filtered"
                stroke="#8B5CF6"
                strokeWidth={1}
                dot={false}
                strokeDasharray="2 2"
                connectNulls
              />
            )}
            {/* Peaks */}
            {stage === 1 && peakPoints.length > 0 && (
              <Scatter
                data={peakPoints}
                xAxisId={0}
                yAxisId={0}
                fill="#EF4444"
                shape="circle"
                r={4}
              />
            )}
            {/* Troughs */}
            {stage === 1 && troughPoints.length > 0 && (
              <Scatter
                data={troughPoints}
                xAxisId={0}
                yAxisId={0}
                fill="#3B82F6"
                shape="circle"
                r={3}
              />
            )}
            {/* Rise starts - triangle up would need custom shape; use dot for now */}
            {stage === 1 && risePoints.length > 0 && (
              <Scatter
                data={risePoints}
                xAxisId={0}
                yAxisId={0}
                fill="#22C55E"
                shape="circle"
                r={3}
              />
            )}
            {/* Fall starts */}
            {stage === 1 && fallPoints.length > 0 && (
              <Scatter
                data={fallPoints}
                xAxisId={0}
                yAxisId={0}
                fill="#A855F7"
                shape="circle"
                r={3}
              />
            )}
            {/* Stage 2: baseline, start, peak */}
            {stage === 2 && stage2BaselinePoints.length > 0 && (
              <Scatter data={stage2BaselinePoints} fill="#8B949E" shape="circle" r={3} />
            )}
            {stage === 2 && stage2StartPoints.length > 0 && (
              <Scatter data={stage2StartPoints} fill="#22C55E" shape="circle" r={4} />
            )}
            {stage === 2 && stage2PeakPoints.length > 0 && (
              <Scatter data={stage2PeakPoints} fill="#EF4444" shape="circle" r={4} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
