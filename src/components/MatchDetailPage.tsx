import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  ChevronLeft, ChevronDown, Activity, Zap, BrainCircuit, Info
} from 'lucide-react';
import { HistoricalMatch, TeamMetrics, H2HSummary, ComparisonMetrics, MonteCarloResult, MatchInsights } from '../types';
import { cn } from '../lib/utils';

interface MatchDetailPageProps {
  homeTeam: string;
  awayTeam: string;
  status?: string;
  score?: {
    home: number | null;
    away: number | null;
  };
  historicalMatches: HistoricalMatch[];
  homeMetrics: TeamMetrics;
  awayMetrics: TeamMetrics;
  h2h: H2HSummary;
  similarMatches: HistoricalMatch[];
  monteCarloResult: MonteCarloResult | null;
  matchInsights: MatchInsights | null;
  isSimulating: boolean;
  mlPrediction?: any;
  liveOdds?: any;
  onRunSimulation: () => void;
  onBack: () => void;
}

const MatchDetailPage: React.FC<MatchDetailPageProps> = ({
  homeTeam,
  awayTeam,
  status,
  score,
  historicalMatches,
  homeMetrics,
  awayMetrics,
  h2h,
  similarMatches,
  monteCarloResult,
  matchInsights,
  isSimulating,
  mlPrediction,
  liveOdds,
  onRunSimulation,
  onBack
}) => {
  const [showGemini, setShowGemini] = useState(false);

  // Extract best odds if available
  const bestOdds = useMemo(() => {
    if (!liveOdds || !Array.isArray(liveOdds) || liveOdds.length === 0) return '--';
    const matchOdds = liveOdds.find((m: any) => m.home_team === homeTeam || m.away_team === awayTeam);
    if (!matchOdds || !matchOdds.bookmakers || matchOdds.bookmakers.length === 0) return '--';
    
    // Just grab the first bookmaker's h2h odds for now
    const bookmaker = matchOdds.bookmakers[0];
    const h2hMarket = bookmaker.markets?.find((m: any) => m.key === 'h2h');
    if (!h2hMarket || !h2hMarket.outcomes) return '--';
    
    // Assuming prediction is home win, away win, or draw
    const predictionStr = mlPrediction?.prediction || '';
    let outcomeName = '';
    if (predictionStr.includes('Home Win')) outcomeName = matchOdds.home_team;
    else if (predictionStr.includes('Away Win')) outcomeName = matchOdds.away_team;
    else outcomeName = 'Draw';

    const outcome = h2hMarket.outcomes.find((o: any) => o.name === outcomeName);
    return outcome ? outcome.price.toFixed(2) : '--';
  }, [liveOdds, homeTeam, awayTeam, mlPrediction]);

  const probability = mlPrediction?.probability ? (mlPrediction.probability * 100).toFixed(1) + '%' : '--';
  
  // Calculate a fake EV for demo purposes if we have odds and probability
  const ev = useMemo(() => {
    if (bestOdds === '--' || probability === '--') return '--';
    const prob = parseFloat(probability) / 100;
    const odds = parseFloat(bestOdds);
    const expectedValue = (prob * odds) - 1;
    return (expectedValue * 100).toFixed(1) + '%';
  }, [bestOdds, probability]);

  return (
    <div className="max-w-md mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors font-bold text-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <div className="bg-slate-900/50 px-4 py-1 rounded-full border border-slate-800">
          <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Match Analysis</span>
        </div>
      </div>

      {/* Main Scoreboard Area */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-transparent opacity-50" />
        <div className="relative">
          <h1 className="text-2xl font-black text-white tracking-tight">{homeTeam}</h1>
          {status === 'FINISHED' ? (
            <div className="my-4">
              <div className="text-4xl font-black text-white flex items-center justify-center gap-4">
                <span>{score?.home}</span>
                <span className="text-slate-700 text-xl">-</span>
                <span>{score?.away}</span>
              </div>
              <p className="text-[10px] font-black text-green-500 uppercase tracking-widest mt-2">Full Time</p>
            </div>
          ) : (
            <>
              <div className="my-2 text-slate-600 font-black text-sm">VS</div>
              <h1 className="text-2xl font-black text-white tracking-tight">{awayTeam}</h1>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-4">Kickoff Today</p>
            </>
          )}
          {status !== 'FINISHED' && <h1 className="text-2xl font-black text-white tracking-tight">{awayTeam}</h1>}
        </div>
      </div>

      {/* RECOMMENDATION */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Recommendation</p>
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-black text-white">
            {mlPrediction ? mlPrediction.prediction : 'Analyzing...'}
          </h2>
          <div className="flex items-center gap-3">
            <span className={cn(
              "font-bold text-sm",
              ev !== '--' && parseFloat(ev) > 0 ? "text-green-500" : "text-slate-400"
            )}>
              EV: {ev !== '--' && parseFloat(ev) > 0 ? '+' : ''}{ev}
            </span>
            <button 
              onClick={() => setShowGemini(!showGemini)} 
              className="text-slate-400 hover:text-blue-400 transition-colors flex items-center gap-1 text-sm bg-slate-800/50 px-2 py-1 rounded-lg border border-slate-700"
            >
              <Info size={14} /> Why?
            </button>
          </div>
        </div>
        
        {showGemini && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 p-4 bg-slate-950 rounded-xl border border-slate-800 text-sm text-slate-300 space-y-3"
          >
            <div className="flex items-center gap-2 text-blue-400 mb-2">
              <BrainCircuit size={16} />
              <span className="font-bold text-xs uppercase tracking-widest">Gemini Analysis</span>
            </div>
            {matchInsights ? (
              <>
                <p className="font-bold text-white">{matchInsights.headline}</p>
                <p className="leading-relaxed">{matchInsights.explanation}</p>
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg mt-2">
                  <p className="text-xs text-red-400 font-bold uppercase mb-1">Risk Warning</p>
                  <p className="text-xs text-red-300/80">{matchInsights.riskWarning}</p>
                </div>
              </>
            ) : (
              <p className="text-slate-500 italic">Generating insights...</p>
            )}
          </motion.div>
        )}
      </div>

      {/* QUICK STATS */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Quick Stats</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Probability</p>
            <p className="text-2xl font-black text-white">{probability}</p>
          </div>
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Best Odds</p>
            <p className="text-2xl font-black text-white">{bestOdds}</p>
          </div>
        </div>
      </div>

      {/* ADD TO BETSLIP */}
      {status !== 'FINISHED' && (
        <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-900/20">
          ADD TO BETSLIP
        </button>
      )}

      {/* Advanced ▼ */}
      <details className="group">
        <summary className="text-slate-500 font-bold cursor-pointer list-none flex justify-between items-center bg-slate-900 p-4 rounded-2xl border border-slate-800 hover:bg-slate-800/50 transition-colors">
          <span className="text-sm uppercase tracking-widest">Advanced Analysis</span>
          <ChevronDown className="group-open:rotate-180 transition-transform" size={18} />
        </summary>
        <div className="mt-4 space-y-6">
          
          {/* Factor Analysis */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <h2 className="text-sm font-black text-white uppercase tracking-widest mb-4">Factor Analysis</h2>
            {mlPrediction?.contributions ? (
              <div className="space-y-4">
                {Object.entries(mlPrediction.contributions).map(([key, value]: [string, any]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-400 uppercase">{key}</span>
                      <span className={cn("font-mono font-bold", value.impact >= 0 ? "text-green-400" : "text-red-400")}>
                        {value.impact > 0 ? '+' : ''}{(value.impact * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-950 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full", value.impact >= 0 ? "bg-green-500" : "bg-red-500")} 
                        style={{ width: `${Math.min(Math.abs(value.impact) * 500, 100)}%` }} 
                      />
                    </div>
                    <p className="text-[10px] text-slate-600">{value.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-4">No factor analysis available</p>
            )}
          </div>

          {/* Monte Carlo Simulation */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-black text-white uppercase tracking-widest">Monte Carlo</h2>
              <button 
                onClick={onRunSimulation}
                disabled={isSimulating}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all flex items-center gap-1",
                  isSimulating 
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                    : "bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600 hover:text-white"
                )}
              >
                {isSimulating ? <Activity size={12} className="animate-spin" /> : <Zap size={12} />}
                {isSimulating ? 'Simulating...' : 'Run 10k'}
              </button>
            </div>

            {monteCarloResult ? (
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="text-center flex-1">
                    <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Home</p>
                    <p className="text-lg font-black text-blue-500">{monteCarloResult.homeWin.toFixed(1)}%</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Draw</p>
                    <p className="text-lg font-black text-slate-400">{monteCarloResult.draw.toFixed(1)}%</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Away</p>
                    <p className="text-lg font-black text-red-500">{monteCarloResult.awayWin.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="h-2 bg-slate-950 rounded-full overflow-hidden flex">
                  <div className="h-full bg-blue-500" style={{ width: `${monteCarloResult.homeWin}%` }} />
                  <div className="h-full bg-slate-700" style={{ width: `${monteCarloResult.draw}%` }} />
                  <div className="h-full bg-red-500" style={{ width: `${monteCarloResult.awayWin}%` }} />
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-4">Run simulation to view probability distribution</p>
            )}
          </div>

          {/* Bayesian Update (Fixed) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <h2 className="text-sm font-black text-white uppercase tracking-widest mb-4">Bayesian Update</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 uppercase">Prior (ML Model)</span>
                <span className="text-sm font-mono font-bold text-white">{probability}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 uppercase">Likelihood (H2H)</span>
                <span className="text-sm font-mono font-bold text-white">
                  {(() => {
                    if (h2h.matches.length === 0) return '50.0%';
                    let wins = 0;
                    if (mlPrediction?.prediction === 'Home Win') wins = h2h.team1Wins;
                    else if (mlPrediction?.prediction === 'Away Win') wins = h2h.team2Wins;
                    else wins = h2h.draws;
                    return ((wins / h2h.matches.length) * 100).toFixed(1) + '%';
                  })()}
                </span>
              </div>
              <div className="pt-3 border-t border-slate-800">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-blue-500 uppercase">Posterior Estimate</span>
                  <span className="text-lg font-black text-white">
                    {(() => {
                      if (h2h.matches.length === 0 || !mlPrediction?.probability) return probability;
                      let wins = 0;
                      if (mlPrediction?.prediction === 'Home Win') wins = h2h.team1Wins;
                      else if (mlPrediction?.prediction === 'Away Win') wins = h2h.team2Wins;
                      else wins = h2h.draws;
                      
                      const prior = Math.max(0.01, Math.min(0.99, mlPrediction.probability));
                      const likelihood = wins / h2h.matches.length;
                      
                      // Handle edge case where likelihood is 0 or 1
                      const safeLikelihood = Math.max(0.01, Math.min(0.99, likelihood));
                      
                      const posterior = (prior * safeLikelihood) / ((prior * safeLikelihood) + ((1 - prior) * (1 - safeLikelihood)));
                      return (posterior * 100).toFixed(1) + '%';
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* H2H Record */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <h2 className="text-sm font-black text-white uppercase tracking-widest mb-4">H2H Record</h2>
            <div className="flex justify-between text-center">
              <div>
                <p className="text-2xl font-black text-white">{h2h.team1Wins}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase">{homeTeam}</p>
              </div>
              <div>
                <p className="text-2xl font-black text-slate-500">{h2h.draws}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Draws</p>
              </div>
              <div>
                <p className="text-2xl font-black text-white">{h2h.team2Wins}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase">{awayTeam}</p>
              </div>
            </div>
          </div>

        </div>
      </details>
    </div>
  );
};

export default MatchDetailPage;
