import React, { useState, useEffect, useRef } from 'react';
import { Bluetooth, Loader2, AlertCircle, X, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useGoDirect } from '@/context/GoDirectContext';
import { cn } from '@/lib/utils';

/**
 * BluetoothSettingsSheet - A slide-out panel for managing Bluetooth connection
 * Shows connection status, sensor values, and real-time data chart
 */
export default function BluetoothSettingsSheet({ open, onOpenChange }) {
  const { 
    connected, 
    connecting, 
    reading,
    latest, 
    error, 
    connect, 
    disconnect,
    startReading,
    stopReading,
    clearError,
    connectionAttempt,
    maxRetries
  } = useGoDirect();

  // Chart data for real-time display
  const [chartData, setChartData] = useState([]);
  const startTimeRef = useRef(null);
  const maxDataPoints = 300; // 30 seconds at 10Hz

  // Capture sensor data for the chart
  useEffect(() => {
    if (!connected || typeof latest !== 'number') return;

    const now = Date.now();
    if (startTimeRef.current === null) {
      startTimeRef.current = now;
    }

    const timeFromStart = (now - startTimeRef.current) / 1000;
    
    setChartData(prev => {
      const newPoint = { time: parseFloat(timeFromStart.toFixed(1)), value: latest };
      const newData = [...prev, newPoint];
      // Keep last maxDataPoints
      if (newData.length > maxDataPoints) {
        return newData.slice(-maxDataPoints);
      }
      return newData;
    });
  }, [latest, connected]);

  // Reset chart when connection changes
  useEffect(() => {
    if (!connected) {
      setChartData([]);
      startTimeRef.current = null;
    }
  }, [connected]);

  // Calculate stats from chart data
  const stats = React.useMemo(() => {
    if (chartData.length === 0) {
      return { min: null, max: null, avg: null };
    }
    const values = chartData.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { min, max, avg };
  }, [chartData]);

  // Get visible data for chart (last 30 seconds)
  const visibleData = React.useMemo(() => {
    if (chartData.length === 0) return [];
    const lastTime = chartData[chartData.length - 1]?.time || 0;
    const minTime = Math.max(0, lastTime - 30);
    return chartData.filter(d => d.time >= minTime);
  }, [chartData]);

  // Calculate Y-axis domain
  const yDomain = React.useMemo(() => {
    if (visibleData.length === 0) return [0, 10];
    const values = visibleData.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1 || 1;
    return [min - padding, max + padding];
  }, [visibleData]);

  const handleResetChart = () => {
    setChartData([]);
    startTimeRef.current = null;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-lg bg-[#0D1117] border-[#30363D] overflow-y-auto"
      >
        <SheetHeader className="mb-6">
          <SheetTitle className="text-white flex items-center gap-2">
            <Bluetooth className="w-5 h-5 text-[#3B82F6]" />
            호흡 벨트 설정
          </SheetTitle>
          <SheetDescription className="text-[#8B949E]">
            Vernier GoDirect 호흡 벨트 연결 관리
          </SheetDescription>
        </SheetHeader>

        {/* Error Alert */}
        {error && (
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-[#EF4444] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[#EF4444] text-sm whitespace-pre-line">{error}</p>
            </div>
            <button onClick={clearError} className="text-[#EF4444] hover:text-[#EF4444]/80">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Connection Status Card */}
        <div className="bg-[#1C2128] rounded-xl p-4 border border-[#30363D] mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center",
                connected ? "bg-[#22C55E]/20" : connecting ? "bg-[#3B82F6]/20" : "bg-[#30363D]"
              )}>
                {connecting ? (
                  <Loader2 className="w-6 h-6 text-[#3B82F6] animate-spin" />
                ) : (
                  <Bluetooth className={cn(
                    "w-6 h-6",
                    connected ? "text-[#22C55E]" : "text-[#8B949E]"
                  )} />
                )}
              </div>
              <div>
                <p className="text-white font-medium">연결 상태</p>
                <p className={cn(
                  "text-sm",
                  connected ? "text-[#22C55E]" : connecting ? "text-[#3B82F6]" : "text-[#8B949E]"
                )}>
                  {connected ? '연결됨' : connecting ? (
                    connectionAttempt > 0 
                      ? `연결 시도 중... (${connectionAttempt}/${maxRetries})`
                      : '연결 중...'
                  ) : '연결 안됨'}
                </p>
              </div>
            </div>
          </div>

          {/* Connection Progress (when retrying) */}
          {connecting && connectionAttempt > 0 && (
            <div className="mb-4">
              <div className="h-1.5 bg-[#30363D] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#3B82F6] rounded-full transition-all duration-300"
                  style={{ width: `${(connectionAttempt / maxRetries) * 100}%` }}
                />
              </div>
              <p className="text-[#8B949E] text-xs mt-1 text-center">
                {connectionAttempt < maxRetries ? '자동 재시도 중...' : '마지막 시도...'}
              </p>
            </div>
          )}

          {/* Connection Buttons */}
          <div className="flex gap-2">
            {connected ? (
              <Button
                onClick={disconnect}
                variant="outline"
                className="flex-1 border-[#EF4444]/50 text-[#EF4444] hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
              >
                연결 해제
              </Button>
            ) : (
              <Button
                onClick={() => connect()}
                disabled={connecting}
                className="flex-1 bg-[#3B82F6] hover:bg-[#2563EB] text-white"
              >
                {connecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {connectionAttempt > 0 ? `재시도 ${connectionAttempt}/${maxRetries}` : '연결 중...'}
                  </>
                ) : (
                  <>
                    <Bluetooth className="w-4 h-4 mr-2" />
                    연결하기
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Sensor Values Card - Only show when connected */}
        {connected && (
          <div className="bg-[#1C2128] rounded-xl p-4 border border-[#30363D] mb-4">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-[#06B6D4]" />
              <h3 className="text-white font-medium">센서 값</h3>
              <div className="ml-auto flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
                <span className="text-[#8B949E] text-xs">실시간</span>
              </div>
            </div>

            {/* Current Value - Large Display */}
            <div className="bg-[#0D1117] rounded-lg p-4 mb-4 text-center">
              <p className="text-[#8B949E] text-xs mb-1">현재 힘 (Force)</p>
              <p className="text-4xl font-mono font-bold text-white">
                {typeof latest === 'number' ? latest.toFixed(3) : '---'}
                <span className="text-lg text-[#8B949E] ml-1">N</span>
              </p>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#0D1117] rounded-lg p-3 text-center">
                <p className="text-[#8B949E] text-xs mb-1">최소</p>
                <p className="text-sm font-mono text-white">
                  {stats.min !== null ? stats.min.toFixed(2) : '---'}
                </p>
              </div>
              <div className="bg-[#0D1117] rounded-lg p-3 text-center">
                <p className="text-[#8B949E] text-xs mb-1">평균</p>
                <p className="text-sm font-mono text-white">
                  {stats.avg !== null ? stats.avg.toFixed(2) : '---'}
                </p>
              </div>
              <div className="bg-[#0D1117] rounded-lg p-3 text-center">
                <p className="text-[#8B949E] text-xs mb-1">최대</p>
                <p className="text-sm font-mono text-white">
                  {stats.max !== null ? stats.max.toFixed(2) : '---'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Real-time Chart - Only show when connected */}
        {connected && (
          <div className="bg-[#1C2128] rounded-xl p-4 border border-[#30363D]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium">실시간 그래프</h3>
              <Button
                onClick={handleResetChart}
                variant="ghost"
                size="sm"
                className="text-[#8B949E] hover:text-white hover:bg-[#30363D] text-xs"
              >
                차트 리셋
              </Button>
            </div>

            <div className="h-64 bg-[#0D1117] rounded-lg p-2">
              {visibleData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={visibleData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <XAxis 
                      dataKey="time" 
                      stroke="#30363D" 
                      tick={{ fill: '#8B949E', fontSize: 10 }}
                      tickFormatter={(value) => `${value.toFixed(0)}s`}
                      domain={['dataMin', 'dataMax']}
                    />
                    <YAxis 
                      stroke="#30363D" 
                      tick={{ fill: '#8B949E', fontSize: 10 }}
                      domain={yDomain}
                      width={45}
                      tickFormatter={(value) => value.toFixed(1)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1C2128',
                        border: '1px solid #30363D',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                      labelFormatter={(value) => `Time: ${value}s`}
                      formatter={(value) => [`${value.toFixed(3)} N`, 'Force']}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[#8B949E]">
                  데이터를 기다리는 중...
                </div>
              )}
            </div>

            <p className="text-[#8B949E] text-xs mt-2 text-center">
              최근 30초 데이터 표시 • 100ms 샘플링
            </p>
          </div>
        )}

        {/* Help Text when not connected */}
        {!connected && !connecting && (
          <div className="bg-[#1C2128] rounded-xl p-4 border border-[#30363D]">
            <h3 className="text-white font-medium mb-2">연결 방법</h3>
            <ol className="text-[#8B949E] text-sm space-y-2">
              <li>1. 호흡 벨트의 전원을 켜세요</li>
              <li>2. 벨트의 LED가 깜빡이는지 확인하세요</li>
              <li>3. 위의 "연결하기" 버튼을 클릭하세요</li>
              <li>4. 팝업에서 "GDX-RB" 디바이스를 선택하세요</li>
            </ol>
            <p className="text-[#8B949E] text-xs mt-4">
              💡 Web Bluetooth는 HTTPS 또는 localhost에서만 작동합니다
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
