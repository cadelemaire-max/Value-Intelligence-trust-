import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUpRight, ArrowDownRight, Brain, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PredictionSignal } from '../../types';
import { getMatchInsights, MatchInsights } from '../../lib/geminiService';

interface FixtureItemProps {
  signal: PredictionSignal;
  index: number;
  onClick: () => void;
  onPredict: () => void;
}

export const FixtureItem: React.FC<FixtureItemProps> = ({ signal, index, onClick, onPredict }) => {
  const [insights, setInsights] = useState<MatchInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [showInsights, setShowInsights] = useState(false);

  const handleAIInsights = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showInsights) { setShowInsights(false); return; }
    setShowInsights(true);
    if (!insights) {
      setInsightsLoading(true);
      const result = await getMatchInsights(signal);
      setInsights(result);
      setInsightsLoading(false);
    }
  };

  const ev = signal.ev ?? 0;
  const odds = signal.odds ?? 0;
  const evPositive = ev >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.5) }}
      onClick={onClick}
      className="bg-slate-900 border border-slate-800 rounded-2xl md:rounded-3xl p-4 md:p-6 flex flex-col gap-4 hover:border-blue-500/50 transition-all cursor-pointer group relative overflow-hidden"
    >
      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 md:gap-6">
        <div className="flex-1 flex items-center gap-4 w-full">
          <div className="text-center min-w-[72px]">
            <p className="text-[9px] font-black text-blue-500 uppercase mb-1 leading-tight">{signal.league}</p>
            <p className="text-[9px] font-mono text-slate-400 leading-tight">
              {new Date(signal.kickoffTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </p>
            <p className="text-[9px] font-mono text-slate-400 leading-tight">
              {new Date(signal.kickoffTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            {signal.status && signal.status !== 'SCHEDULED' && (
              <span className={cn(
                "inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-bold",
                signal.status === 'FINISHED' ? 'bg-slate-700 text-slate-400'
                  : (signal.status === 'IN_PLAY' || signal.status === 'LIVE') ? 'bg-green-500/20 text-green-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              )}>
                {(signal.status === 'IN_PLAY' || signal.status === 'LIVE') ? 'LIVE' : signal.status}
              </span>
            )}
          </div>
          <div className="flex-1 flex items-center justify-center gap-3">
            <div className="flex-1 text-right font-bold text-white text-sm md:text-base leading-tight">{signal.homeTeam}</div>
            <div className="w-9 h-9 bg-slate-950 rounded-full flex items-center justify-center text-[9px] font-bold text-slate-500 border border-slate-800 shrink-0">
              {signal.score ? `${signal.score.home ?? 0}-${signal.score.away ?? 0}` : 'VS'}
            </div>
            <div className="flex-1 text-left font-bold text-white text-sm md:text-base leading-tight">{signal.awayTeam}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 w-full lg:w-auto">
          {[
            { label: 'Market', value: signal.market, color: 'text-blue-400' },
            { label: 'Prob', value: `${(signal.probability * 100).toFixed(0)}%`, color: 'text-white' },
            { label: 'Odds', value: odds > 0 ? odds.toFixed(2) : 'N/A', color: 'text-white' },
          ].map((item, i) => (
            <div key={i} className="bg-slate-950 px-3 py-2 rounded-xl border border-slate-800/50 text-center min-w-[72px]">
              <p className="text-[9px] font-bold text-slate-600 uppercase mb-0.5">{item.label}</p>
              <p className={cn("font-bold text-xs md:text-sm truncate", item.color)}>{item.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-start pt-3 lg:pt-0 border-t border-slate-800 lg:border-none">
          <div className="flex items-center gap-3">
            <div className="relative w-11 h-11">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#1e293b" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="45"
                  fill="none"
                  stroke={signal.confidence > 0.8 ? "#22c55e" : signal.confidence > 0.6 ? "#3b82f6" : "#ef4444"}
                  strokeWidth="10"
                  strokeDasharray="282.7"
                  strokeDashoffset={282.7 * (1 - (signal.confidence ?? 0))}
                  strokeLinecap="round"
                  className="rotate-[-90deg] origin-center transition-all duration-1000"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">
                {((signal.confidence ?? 0) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="lg:hidden">
              <p className="text-[10px] font-bold text-slate-600 uppercase">Confidence</p>
              <p className="text-[10px] font-bold text-slate-400">{((signal.agreement ?? 0) * 100).toFixed(0)}% Consensus</p>
            </div>
          </div>

          <div className="text-right flex-1 lg:flex-none">
            <p className="text-[10px] font-bold text-slate-600 uppercase mb-0.5">Expected Value</p>
            <div className="flex items-center gap-1 justify-end">
              <p className={cn("text-base md:text-xl font-black", evPositive ? "text-green-400" : "text-red-400")}>
                {evPositive ? '+' : ''}{(ev * 100).toFixed(1)}%
              </p>
              {signal.oddsMovement === 'down' ? <ArrowDownRight size={13} className="text-red-400" />
                : signal.oddsMovement === 'up' ? <ArrowUpRight size={13} className="text-green-400" />
                : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onPredict(); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95 touch-manipulation"
            >
              PREDICT
            </button>
            <button
              onClick={handleAIInsights}
              className={cn(
                "flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all active:scale-95 touch-manipulation border",
                showInsights
                  ? "bg-purple-600/20 border-purple-500/40 text-purple-400"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:text-purple-400"
              )}
            >
              <Brain size={10} />
              AI
              <ChevronDown size={10} className={cn("transition-transform", showInsights && "rotate-180")} />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showInsights && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="border-t border-slate-800 pt-4 overflow-hidden"
          >
            {insightsLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Brain size={14} className="animate-pulse text-purple-400" />
                <span>Generating AI insights…</span>
              </div>
            ) : insights ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Brain size={14} className="text-purple-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-black text-white">{insights.headline}</p>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{insights.explanation}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="bg-slate-950 rounded-xl p-3 border border-slate-800">
                    <p className="text-[10px] font-bold text-purple-400 uppercase mb-1">Bayesian Reasoning</p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">{insights.bayesianReasoning}</p>
                  </div>
                  <div className="bg-slate-950 rounded-xl p-3 border border-slate-800">
                    <p className="text-[10px] font-bold text-blue-400 uppercase mb-1">Recommended Market</p>
                    <p className="text-sm font-black text-white">{insights.recommendedMarket}</p>
                    <p className="text-[10px] text-yellow-400 mt-1">{insights.riskWarning}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
