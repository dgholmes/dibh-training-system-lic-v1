import React from 'react';
import { cn } from '@/lib/utils';

export default function StatsCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  color = 'blue',
  children 
}) {
  const colorClasses = {
    blue: 'from-[#3B82F6]/10 to-transparent text-[#3B82F6]',
    purple: 'from-[#8B5CF6]/10 to-transparent text-[#8B5CF6]',
    cyan: 'from-[#06B6D4]/10 to-transparent text-[#06B6D4]',
    green: 'from-[#22C55E]/10 to-transparent text-[#22C55E]',
    yellow: 'from-[#EAB308]/10 to-transparent text-[#EAB308]',
    red: 'from-[#EF4444]/10 to-transparent text-[#EF4444]',
  };

  return (
    <div className="bg-[#1C2128] rounded-xl p-5 border border-[#30363D] relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 -translate-y-8 translate-x-8">
      <div className={cn(
          "w-full h-full rounded-full bg-gradient-to-bl",
        colorClasses[color]
        )} 
        style={{
          maskImage: 'radial-gradient(circle, black 40%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(circle, black 40%, transparent 70%)',
        }} />
      </div>
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-[#8B949E] text-sm font-medium">{title}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-[#8B949E] mt-1">{subtitle}</p>
            )}
          </div>
          {Icon && (
            <div className={cn(
              "p-2.5 rounded-xl bg-gradient-to-br flex-shrink-0",
              colorClasses[color]
            )}>
              <Icon className="w-5 h-5" />
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}