import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  ChevronLeft, Trophy, Users, BarChart3, History, Info, 
  TrendingUp, TrendingDown, Target, Activity, Zap, AlertCircle, 
  Clock, Scale, Sparkles, BrainCircuit
} from 'lucide-react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell
} from 'recharts';
import { HistoricalMatch, TeamMetrics, H2HSummary, ComparisonMetrics, MonteCarloResult, MatchInsights } from '../types';
import { cn } from '../lib/utils';

interface MatchDetailPageProps {
  homeTeam: string;
  awayTeam: string;
  historicalMatches: HistoricalMatch[];
  homeMetrics: TeamMetrics;
  awayMetrics: TeamMetrics;
  h2h: H2HSummary;
  similarMatches: HistoricalMatch[];
  monteCarloResult: MonteCarloResult | null;
  matchInsights: MatchInsights | null;
  isSimulating: boolean;
  onRunSimulation: () => void;
  onBack: () => void;
}

const MatchDetailPage: React.FC<MatchDetailPageProps> = ({
  homeTeam,
  awayTeam,
  historicalMatches,
  homeMetrics,
  awayMetrics,
  h2h,
  similarMatches,
  monteCarloResult,
  matchInsights,
  isSimulating,
  onRunSimulation,
  onBack
}) => {
  const comparisonMetrics: ComparisonMetrics[] = useMemo(() => [
    {
      label: 'Win Rate',
      team1Value: (homeMetrics.winRate * 100).toFixed(1) + '%',
      team2Value: (awayMetrics.winRate * 100).toFixed(1) + '%',
      better: homeMetrics.winRate > awayMetrics.winRate ? 'team1' : 'team2'
    },
    {
      label: 'Avg Goals Scored',
      team1Value: homeMetrics.avgGoalsScored.toFixed(2),
      team2Value: awayMetrics.avgGoalsScored.toFixed(2),
      better: homeMetrics.avgGoalsScored > awayMetrics.avgGoalsScored ? 'team1' : 'team2'
    },
    {
      label: 'Avg Goals Conceded',
      team1Value: homeMetrics.avgGoalsConceded.toFixed(2),
      team2Value: awayMetrics.avgGoalsConceded.toFixed(2),
      better: homeMetrics.avgGoalsConceded < awayMetrics.avgGoalsConceded ? 'team1' : 'team2'
    },
    {
      label: 'BTTS Rate',
      team1Value: (homeMetrics.bttsRate * 100).toFixed(0) + '%',
      team2Value: (awayMetrics.bttsRate * 100).toFixed(0) + '%',
      better: 'none'
    },
    {
      label: 'Over 2.5 Rate',
      team1Value: (homeMetrics.over25Rate * 100).toFixed(0) + '%',
      team2Value: (awayMetrics.over25Rate * 100).toFixed(0) + '%',
      better: 'none'
    }
  ], [homeMetrics, awayMetrics]);

  const radarData = useMemo(() => [
    { subject: 'Attack', A: homeMetrics.avgGoalsScored * 20, B: awayMetrics.avgGoalsScored * 20, fullMark: 100 },
    { subject: 'Defense', A: (3 - homeMetrics.avgGoalsConceded) * 33, B: (3 - awayMetrics.avgGoalsConceded) * 33, fullMark: 100 },
    { subject: 'Form', A: homeMetrics.winRate * 100, B: awayMetrics.winRate * 100, fullMark: 100 },
    { subject: 'Consistency', A: (1 - Math.abs(homeMetrics.winRate - 0.5)) * 100, B: (1 - Math.abs(awayMetrics.winRate - 0.5)) * 100, fullMark: 100 },
    { subject: 'Over 2.5', A: homeMetrics.over25Rate * 100, B: awayMetrics.over25Rate * 100, fullMark: 100 },
  ], [homeMetrics, awayMetrics]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors font-bold text-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Fixtures
        </button>
        <div className="bg-slate-900/50 px-4 py-1 rounded-full border border-slate-800">
          <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Match Analysis</span>
        </div>
      </div>

      {/* Main Scoreboard Area */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 md:p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-transparent opacity-50" />
        
        <div className="relative flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="flex-1 text-center md:text-right space-y-4">
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">{homeTeam}</h1>
            <div className="flex items-center justify-center md:justify-end gap-2">
              {homeMetrics.form.map((res, i) => (
                <span key={i} className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black",
                  res === 'W' ? "bg-green-500 text-white" : res === 'D' ? "bg-slate-700 text-slate-400" : "bg-red-500 text-white"
                )}>{res}</span>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 bg-slate-950 rounded-full flex items-center justify-center border-2 border-slate-800 shadow-2xl">
              <span className="text-xl font-black text-slate-600">VS</span>
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Kickoff Today</span>
          </div>

          <div className="flex-1 text-center md:text-left space-y-4">
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">{awayTeam}</h1>
            <div className="flex items-center justify-center md:justify-start gap-2">
              {awayMetrics.form.map((res, i) => (
                <span key={i} className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black",
                  res === 'W' ? "bg-green-500 text-white" : res === 'D' ? "bg-slate-700 text-slate-400" : "bg-red-500 text-white"
                )}>{res}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Team Comparison */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8">
            <div className="flex items-center gap-3 mb-8">
              <BarChart3 className="text-blue-500" size={24} />
              <h2 className="text-xl font-black text-white uppercase">Performance Radar</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid stroke="#1e293b" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name={homeTeam} dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                    <Radar name={awayTeam} dataKey="B" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-6">
                {comparisonMetrics.map((metric, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      <span>{metric.team1Value}</span>
                      <span>{metric.label}</span>
                      <span>{metric.team2Value}</span>
                    </div>
                    <div className="h-3 bg-slate-950 rounded-full overflow-hidden flex gap-1 p-0.5">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all duration-1000",
                          metric.better === 'team1' ? "bg-blue-500" : "bg-slate-800"
                        )} 
                        style={{ width: `${(parseFloat(metric.team1Value.toString()) / (parseFloat(metric.team1Value.toString()) + parseFloat(metric.team2Value.toString()))) * 100}%` }} 
                      />
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all duration-1000",
                          metric.better === 'team2' ? "bg-red-500" : "bg-slate-800"
                        )} 
                        style={{ width: `${(parseFloat(metric.team2Value.toString()) / (parseFloat(metric.team1Value.toString()) + parseFloat(metric.team2Value.toString()))) * 100}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Monte Carlo Simulation */}
          <section className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <BrainCircuit className="text-purple-500" size={24} />
                <h2 className="text-xl font-black text-white uppercase">Monte Carlo Simulation</h2>
              </div>
              <button 
                onClick={onRunSimulation}
                disabled={isSimulating}
                className={cn(
                  "px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2",
                  isSimulating 
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                    : "bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600 hover:text-white"
                )}
              >
                {isSimulating ? <Activity size={14} className="animate-spin" /> : <Zap size={14} />}
                {isSimulating ? 'Simulating...' : 'Run 10,000 Iterations'}
              </button>
            </div>

            {isSimulating && (
              <div className="mb-8 space-y-2">
                <div className="flex justify-between text-[10px] font-black text-purple-500 uppercase tracking-widest">
                  <span>Processing Iterations...</span>
                  <span>{Math.floor(Math.random() * 100)}%</span>
                </div>
                <div className="h-1 bg-slate-950 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 2 }}
                    className="h-full bg-purple-500"
                  />
                </div>
              </div>
            )}

            {monteCarloResult ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div className="text-center flex-1">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Home Win</p>
                      <p className="text-3xl font-black text-blue-500">{monteCarloResult.homeWin.toFixed(1)}%</p>
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Draw</p>
                      <p className="text-3xl font-black text-slate-400">{monteCarloResult.draw.toFixed(1)}%</p>
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Away Win</p>
                      <p className="text-3xl font-black text-red-500">{monteCarloResult.awayWin.toFixed(1)}%</p>
                    </div>
                  </div>
                  
                  <div className="h-4 bg-slate-950 rounded-full overflow-hidden flex">
                    <div className="h-full bg-blue-500" style={{ width: `${monteCarloResult.homeWin}%` }} />
                    <div className="h-full bg-slate-700" style={{ width: `${monteCarloResult.draw}%` }} />
                    <div className="h-full bg-red-500" style={{ width: `${monteCarloResult.awayWin}%` }} />
                  </div>

                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase">Expected Goals</p>
                      <p className="text-lg font-black text-white">{monteCarloResult.expectedGoals.home.toFixed(2)} - {monteCarloResult.expectedGoals.away.toFixed(2)}</p>
                    </div>
                    <Target className="text-slate-700" size={24} />
                  </div>
                </div>

                <div className="h-[200px] w-full">
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-4">Score Distribution Probability</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monteCarloResult.scoreDistribution}>
                      <XAxis dataKey="score" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                        itemStyle={{ color: '#3b82f6' }}
                        formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, 'Probability']}
                      />
                      <Bar dataKey="probability" radius={[4, 4, 0, 0]}>
                        {monteCarloResult.scoreDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#3b82f6' : '#1e293b'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-3xl">
                <BrainCircuit className="text-slate-800 mb-4" size={48} />
                <p className="text-slate-600 font-bold">Run simulation to view probability distribution</p>
              </div>
            )}
          </section>

          {/* Head-to-Head Section */}
          <section className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <History className="text-blue-500" size={24} />
                <h2 className="text-xl font-black text-white uppercase">Head-to-Head</h2>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Record Summary</p>
                <p className="text-sm font-bold text-white">
                  {h2h.team1Wins}W - {h2h.draws}D - {h2h.team2Wins}W
                </p>
              </div>
            </div>

            {h2h.matches.length > 0 ? (
              <div className="space-y-4">
                {h2h.matches.map((match, i) => (
                  <div key={i} className="bg-slate-950 border border-slate-800/50 rounded-2xl p-4 flex items-center justify-between hover:border-blue-500/30 transition-all">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono text-slate-500">{match.date}</span>
                      <span className="text-xs font-bold text-slate-400">{match.league_name}</span>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <span className={cn(
                        "text-sm font-bold",
                        match.home_team === homeTeam ? "text-white" : "text-slate-500"
                      )}>{match.home_team}</span>
                      <div className="bg-slate-900 px-3 py-1 rounded-lg border border-slate-800 min-w-[60px] text-center">
                        <span className="text-sm font-black text-white">{match.home_score} - {match.away_score}</span>
                      </div>
                      <span className={cn(
                        "text-sm font-bold",
                        match.away_team === homeTeam ? "text-white" : "text-slate-500"
                      )}>{match.away_team}</span>
                    </div>

                    <div className="flex gap-2">
                      {match.over_2_5 === 1 && <span className="bg-blue-500/10 text-blue-400 text-[8px] font-black px-2 py-1 rounded uppercase">O2.5</span>}
                      {match.over_2_5 === 0 && <span className="bg-slate-800 text-slate-500 text-[8px] font-black px-2 py-1 rounded uppercase">U2.5</span>}
                      {match.btts === 1 && <span className="bg-green-500/10 text-green-400 text-[8px] font-black px-2 py-1 rounded uppercase">BTTS</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-slate-950 rounded-3xl border border-dashed border-slate-800">
                <Users className="mx-auto text-slate-700 mb-4" size={48} />
                <p className="text-slate-500 font-bold">No previous meetings recorded</p>
              </div>
            )}
          </section>

          {/* Live Match Telemetry Placeholder */}
          <section className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Activity size={120} />
            </div>
            <div className="flex items-center gap-3 mb-8">
              <Activity className="text-emerald-500" size={24} />
              <h2 className="text-xl font-black text-white uppercase">Live Match Telemetry</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Attack Pressure', value: 'High', color: 'text-emerald-400' },
                { label: 'Defensive Gap', value: 'Minimal', color: 'text-blue-400' },
                { label: 'Counter Threat', value: 'Elevated', color: 'text-orange-400' },
                { label: 'Set Piece Risk', value: 'Moderate', color: 'text-slate-400' }
              ].map((stat, i) => (
                <div key={i} className="bg-slate-950 p-4 rounded-2xl border border-slate-800/50">
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-1">{stat.label}</p>
                  <p className={cn("text-lg font-black", stat.color)}>{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex items-center gap-3">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <p className="text-xs font-bold text-emerald-400">Real-time telemetry will activate at kickoff.</p>
            </div>
          </section>
        </div>

        {/* Right Column: Similar Matches & Insights */}
        <div className="space-y-8">
          <section className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8">
            <div className="flex items-center gap-3 mb-8">
              <Users className="text-blue-500" size={24} />
              <h2 className="text-xl font-black text-white uppercase">Similar Situations</h2>
            </div>

            <div className="space-y-4">
              {similarMatches.map((match, i) => (
                <div key={i} className="bg-slate-950 border border-slate-800/50 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-blue-500 uppercase">{match.league_name}</span>
                    <span className="text-[10px] font-mono text-slate-500">{match.date}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white">{match.home_team}</span>
                      <span className="text-xs font-bold text-white">{match.away_team}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-white">{match.home_score} - {match.away_score}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                    <div className="flex gap-2">
                      <span className="text-[8px] font-bold text-slate-500 uppercase">Goals: {match.total_goals}</span>
                    </div>
                    <div className={cn(
                      "px-2 py-0.5 rounded text-[8px] font-black uppercase",
                      match.home_score > match.away_score ? "bg-green-500/10 text-green-400" : 
                      match.home_score < match.away_score ? "bg-red-500/10 text-red-400" : "bg-slate-800 text-slate-400"
                    )}>
                      {match.home_score > match.away_score ? "Home Win" : 
                       match.home_score < match.away_score ? "Away Win" : "Draw"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-blue-600 rounded-[2rem] p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-20">
              <Info size={64} />
            </div>
            <div className="relative space-y-4">
              <h3 className="text-xl font-black uppercase">Model Insight</h3>
              <p className="text-sm font-medium leading-relaxed opacity-90">
                Based on {h2h.matches.length} H2H encounters and {similarMatches.length} similar match profiles, 
                the model identifies a {homeMetrics.strengthRating > awayMetrics.strengthRating ? 'strong home advantage' : 'competitive away threat'}. 
                {homeMetrics.over25Rate > 0.6 && awayMetrics.over25Rate > 0.6 ? ' High goal probability detected.' : ''}
              </p>
              <div className="pt-4 flex items-center gap-4">
                <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(homeMetrics.strengthRating / (homeMetrics.strengthRating + awayMetrics.strengthRating) * 100).toFixed(0)}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="h-full bg-white" 
                  />
                </div>
                <span className="text-xs font-black">{(homeMetrics.strengthRating / (homeMetrics.strengthRating + awayMetrics.strengthRating) * 100).toFixed(0)}% CONFIDENCE</span>
              </div>
            </div>
          </section>

          {/* Bayesian Update Section */}
          <section className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8">
            <div className="flex items-center gap-3 mb-8">
              <BrainCircuit className="text-blue-500" size={24} />
              <h2 className="text-xl font-black text-white uppercase">Bayesian Update</h2>
            </div>
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 uppercase">Prior Probability</span>
                <span className="text-sm font-mono font-bold text-white">{(homeMetrics.winRate * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 uppercase">Likelihood (H2H)</span>
                <span className="text-sm font-mono font-bold text-white">
                  {h2h.matches.length > 0 ? ((h2h.team1Wins / h2h.matches.length) * 100).toFixed(1) : '50.0'}%
                </span>
              </div>
              <div className="pt-4 border-t border-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-black text-blue-500 uppercase">Posterior Estimate</span>
                  <span className="text-xl font-black text-white">
                    {h2h.matches.length > 0 
                      ? (((Math.max(0.01, homeMetrics.winRate) * (h2h.team1Wins / h2h.matches.length)) / 
                        (Math.max(0.01, homeMetrics.winRate) * (h2h.team1Wins / h2h.matches.length) + (1 - Math.max(0.01, homeMetrics.winRate)) * (1 - (h2h.team1Wins / h2h.matches.length)))) * 100).toFixed(1)
                      : (homeMetrics.winRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ 
                      width: `${h2h.matches.length > 0 
                        ? (((Math.max(0.01, homeMetrics.winRate) * (h2h.team1Wins / h2h.matches.length)) / 
                          (Math.max(0.01, homeMetrics.winRate) * (h2h.team1Wins / h2h.matches.length) + (1 - Math.max(0.01, homeMetrics.winRate)) * (1 - (h2h.team1Wins / h2h.matches.length)))) * 100)
                        : (homeMetrics.winRate * 100)}%` 
                    }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="h-full bg-blue-500" 
                  />
                </div>
              </div>
              {matchInsights && (
                <div className="mt-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                  <p className="text-xs font-bold text-blue-400 uppercase mb-1">Model Reasoning</p>
                  <p className="text-xs text-blue-200">{matchInsights.bayesianReasoning}</p>
                </div>
              )}
            </div>
          </section>

          {/* Bet Insights Section */}
          {matchInsights && (
            <section className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8">
              <div className="flex items-center gap-3 mb-8">
                <Sparkles className="text-yellow-500" size={24} />
                <h2 className="text-xl font-black text-white uppercase">Bet Insight</h2>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{matchInsights.headline}</h3>
              <p className="text-sm text-slate-400 mb-4">{matchInsights.explanation}</p>
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-4">
                <p className="text-xs font-bold text-red-400 uppercase mb-1">Risk Warning</p>
                <p className="text-xs text-red-300">{matchInsights.riskWarning}</p>
              </div>
              <p className="text-sm font-bold text-blue-400">Recommended Market: {matchInsights.recommendedMarket}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default MatchDetailPage;
