import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PredictionSignal } from '../../types';

interface FixtureItemProps {
  signal: PredictionSignal;
  index: number;
  onClick: () => void;
  onQuickBet: (e: React.MouseEvent) => void;
}

export const FixtureItem: React.FC<FixtureItemProps> = ({ signal, index, onClick, onQuickBet }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.5) }}
      onClick={onClick}
      className="bg-slate-900 border border-slate-800 rounded-2xl md:rounded-3xl p-4 md:p-6 flex flex-col lg:flex-row items-center gap-4 md:gap-8 hover:border-blue-500/50 transition-all cursor-pointer group relative overflow-hidden"
    >
      {/* Match Info */}
      <div className="flex-1 flex items-center gap-4 md:gap-6 w-full">
        <div className="text-center min-w-[60px] md:min-w-[80px]">
          <p className="text-[10px] font-black text-blue-500 uppercase mb-1">{signal.league}</p>
          <p className="text-[9px] font-mono text-slate-400 leading-tight">
            {new Date(signal.kickoffTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </p>
          <p className="text-[9px] font-mono text-slate-400 leading-tight">
            {new Date(signal.kickoffTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center gap-3 md:gap-4">
          <div className="flex-1 text-right font-bold text-white text-base md:text-lg leading-tight">{signal.homeTeam}</div>
          <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-950 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-600 border border-slate-800 shrink-0">VS</div>
          <div className="flex-1 text-left font-bold text-white text-base md:text-lg leading-tight">{signal.awayTeam}</div>
        </div>
      </div>

      {/* Prediction Grid */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 w-full lg:w-auto">
        {[
          { label: 'Market', value: signal.market, color: 'text-blue-400' },
          { label: 'Prob', value: `${(signal.probability * 100).toFixed(0)}%`, color: 'text-white' },
          { label: 'Odds', value: signal.odds.toFixed(2), color: 'text-white' },
        ].map((item, i) => (
          <div key={i} className="bg-slate-950 px-3 py-2 rounded-xl md:rounded-2xl border border-slate-800/50 text-center min-w-[70px] md:min-w-[80px]">
            <p className="text-[9px] md:text-[10px] font-bold text-slate-600 uppercase mb-0.5 md:mb-1">{item.label}</p>
            <p className={cn("font-bold text-xs md:text-sm", item.color)}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-4 md:gap-8 w-full lg:w-auto justify-between lg:justify-start pt-4 lg:pt-0 border-t border-slate-800 lg:border-none">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 md:w-12 md:h-12">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#1e293b" strokeWidth="10" />
              <circle 
                cx="50" cy="50" r="45" 
                fill="none" 
                stroke={signal.confidence > 0.8 ? "#22c55e" : signal.confidence > 0.6 ? "#3b82f6" : "#ef4444"} 
                strokeWidth="10" 
                strokeDasharray="282.7" 
                strokeDashoffset={282.7 * (1 - signal.confidence)} 
                strokeLinecap="round" 
                className="rotate-[-90deg] origin-center transition-all duration-1000" 
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[9px] md:text-[10px] font-bold text-white">{(signal.confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="lg:hidden">
            <p className="text-[10px] font-bold text-slate-600 uppercase">Confidence</p>
            <p className="text-[10px] font-bold text-slate-400">{(signal.agreement * 100).toFixed(0)}% Consensus</p>
          </div>
        </div>

        <div className="text-right flex-1 lg:flex-none">
          <p className="text-[10px] font-bold text-slate-600 uppercase mb-0.5 md:mb-1">Expected Value</p>
          <div className="flex items-center gap-2 justify-end">
            <p className="text-lg md:text-xl font-black text-green-400">+{ (signal.ev * 100).toFixed(1) }%</p>
            {signal.oddsMovement === 'down' ? <ArrowDownRight size={14} className="text-red-400" /> : signal.oddsMovement === 'up' ? <ArrowUpRight size={14} className="text-green-400" /> : null}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button 
            onClick={onQuickBet}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95 touch-manipulation"
          >
            QUICK BET
          </button>
          <div className="hidden lg:block text-center">
            <span className="text-[10px] font-bold text-slate-500">STAKE: {(signal.kelly * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
