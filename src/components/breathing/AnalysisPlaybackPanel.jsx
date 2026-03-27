import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Repeat2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CalibrationChart from '@/components/common/CalibrationChart';
import { cn } from '@/lib/utils';

function formatMmSs(seconds) {
  const s = Math.max(0, Math.floor(seconds % 60));
  const m = Math.max(0, Math.floor(seconds / 60));
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function makeDemoSeries(durationSec = 180, points = 240) {
  const out = [];
  for (let i = 0; i < points; i++) {
    const t = (i / (points - 1)) * durationSec;
    const v = Math.sin(t * 0.65) * 18 + 48 + Math.sin(t * 1.9) * 4;
    out.push({ time: t, value: v });
  }
  return out;
}

export default function AnalysisPlaybackPanel({ playback }) {
  const [graphMode, setGraphMode] = useState('general');
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const durationRef = useRef(0);

  const hasFilePlayback = playback?.source === 'file_analysis' && playback.general && playback.dibh;

  const activeBlock = useMemo(() => {
    if (hasFilePlayback) {
      return graphMode === 'general' ? playback.general : playback.dibh;
    }
    return null;
  }, [graphMode, hasFilePlayback, playback]);

  const duration = useMemo(() => {
    if (hasFilePlayback) {
      return graphMode === 'general' ? playback.durationGeneral : playback.durationDibh;
    }
    return 180;
  }, [graphMode, hasFilePlayback, playback]);

  const fullChartData = useMemo(() => {
    if (activeBlock?.chartData?.length) return activeBlock.chartData;
    return makeDemoSeries(duration, 200);
  }, [activeBlock, duration]);

  const visibleData = useMemo(() => {
    if (!fullChartData.length) return [];
    const tEnd = Math.min(currentTime, duration);
    return fullChartData.filter((p) => p.time <= tEnd + 1e-4);
  }, [fullChartData, currentTime, duration]);

  const stage = activeBlock?.stage ?? (graphMode === 'general' ? 1 : 3);
  const chartProps =
    graphMode === 'general' && hasFilePlayback
      ? {
          cycles: playback.general.cycles || [],
          rise_starts: playback.general.rise_starts || [],
          fall_starts: playback.general.fall_starts || [],
          hi: playback.general.hi,
          lo: playback.general.lo,
        }
      : hasFilePlayback
        ? {
            hold_th: playback.dibh.hold_th,
            release_th: playback.dibh.release_th,
            target_th: playback.dibh.target_th,
            hold_start_t: playback.dibh.hold_start_t,
            hold_end_t: playback.dibh.hold_end_t,
          }
        : {};

  durationRef.current = duration;
  playingRef.current = playing;

  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      if (!playingRef.current) return;
      const dt = (now - last) / 1000;
      last = now;
      setCurrentTime((prev) => {
        const cap = durationRef.current;
        const next = Math.min(cap, prev + dt);
        if (cap > 0 && prev < cap && next >= cap - 1e-6) {
          playingRef.current = false;
          queueMicrotask(() => setPlaying(false));
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const toggleGraph = useCallback(() => {
    setGraphMode((m) => (m === 'general' ? 'dibh' : 'general'));
  }, []);

  useEffect(() => {
    setCurrentTime(0);
    setPlaying(false);
  }, [graphMode, duration]);

  const title =
    graphMode === 'general' ? '일반 호흡 그래프' : 'DIBH 호흡 그래프';
  const toggleLabel = graphMode === 'general' ? 'DIBH' : '일반 호흡';

  return (
    <div className="rounded-2xl border border-[#30363D] bg-[#1C2128] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold text-white sm:text-lg">{title}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleGraph}
          className="gap-2 border-[#30363D] bg-[#252A32] text-white hover:bg-[#30363D]"
        >
          <Repeat2 className="h-4 w-4 text-[#79B8FF]" />
          {toggleLabel}
        </Button>
      </div>

      {!hasFilePlayback && (
        <p className="mb-3 text-xs text-[#8B949E]">
          파일 분석 데이터가 없어 참고용 파형을 표시합니다. 파일 기반 분석 후에는 실제 기록과 검출이
          표시됩니다.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-[#30363D] bg-[#0D1117]">
        <CalibrationChart
          embedded
          title=""
          showStageCaption={false}
          data={visibleData}
          stage={stage}
          playheadTime={currentTime < duration ? currentTime : null}
          {...chartProps}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full border border-[#30363D] text-white hover:bg-[#30363D]"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? '일시정지' : '재생'}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 pl-0.5" />}
        </Button>
        <span className="min-w-[7rem] font-mono text-sm text-[#8B949E]">
          {formatMmSs(currentTime)} / {formatMmSs(duration)}
        </span>
        <div className="relative min-h-[44px] min-w-[min(100%,280px)] flex-1">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.05}
            value={Math.min(currentTime, duration)}
            onChange={(e) => {
              setCurrentTime(parseFloat(e.target.value));
              setPlaying(false);
            }}
            className={cn(
              'absolute inset-x-0 top-1/2 h-2 w-full -translate-y-1/2 cursor-pointer appearance-none rounded-full bg-[#30363D]',
              '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#3B82F6]'
            )}
            aria-label="재생 위치"
          />
        </div>
      </div>
    </div>
  );
}
