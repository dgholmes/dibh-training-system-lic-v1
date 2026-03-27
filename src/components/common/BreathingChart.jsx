import React from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts';

export default function BreathingChart({ data = [], showTargetRange = true }) {
  // Generate sample data if none provided
  const chartData = data.length > 0 ? data : Array.from({ length: 60 }, (_, i) => ({
    time: i,
    value: Math.sin(i * 0.3) * 30 + 50 + Math.random() * 10,
    target: Math.sin(i * 0.3) * 30 + 50,
  }));

  return (
    <div className="bg-[#1C2128] rounded-xl p-5 border border-[#30363D]">
      <h3 className="text-white font-bold mb-4">실시간 호흡 그래프</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: -20, right: 10, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="targetGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="time" 
              stroke="#30363D" 
              tick={{ fill: '#8B949E', fontSize: 10 }}
              axisLine={{ stroke: '#30363D' }}
            />
            <YAxis 
              stroke="#30363D" 
              tick={{ fill: '#8B949E', fontSize: 10 }}
              axisLine={{ stroke: '#30363D' }}
              domain={[0, 100]}
              width={35}
            />
            {showTargetRange && (
              <>
                <ReferenceLine y={70} stroke="#3B82F6" strokeDasharray="3 3" strokeOpacity={0.5} />
                <ReferenceLine y={30} stroke="#3B82F6" strokeDasharray="3 3" strokeOpacity={0.5} />
                <Area 
                  type="monotone" 
                  dataKey="target" 
                  fill="url(#targetGradient)" 
                  stroke="none"
                />
              </>
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#3B82F6' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}