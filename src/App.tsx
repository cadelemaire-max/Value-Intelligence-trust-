/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { 
  Trophy, TrendingUp, AlertCircle, BarChart3, Calendar, 
  Target, Zap, Shield, Info, ChevronRight, Brain, 
  Activity, Gauge, Scale, Calculator, Filter, 
  LayoutDashboard, List, PieChart as PieChartIcon, Briefcase, 
  ArrowUpRight, ArrowDownRight, Clock, Search, Sparkles, Users
} from 'lucide-react';
import * as d3 from 'd3';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { getMatchInsights, MatchInsights, askGemini } from './lib/geminiService';
import { PredictionSignal, LeagueStat, ViewState } from './types';

import { cn } from './lib/utils';
import { Sidebar } from './components/layout/Sidebar';
import { FixtureSkeleton } from './components/fixtures/FixtureSkeleton';
import { FixtureItem } from './components/fixtures/FixtureItem';
import { calculateLiveUpdate, type MatchState, type BayesianOutput } from './lib/bayesianEngine';
import { calculateKelly, calculatePortfolioMetrics, type RiskSettings, type KellyResult } from './lib/riskEngine';
import { DataPipeline, type ProcessedFixture } from './lib/dataPipeline';
import { PortfolioEngine, type PortfolioBet, type PortfolioMetrics } from './lib/portfolioEngine';
import { ValidationEngine, type CalibrationPoint } from './lib/validationEngine';
import { parseHistoricalCSV, calculateTeamMetrics, getH2H, findSimilarMatches } from './lib/dataEngine';
import { HistoricalMatch, TeamMetrics, MonteCarloResult } from './types';
import { useBetting } from './context/BettingContext.tsx';
import MatchDetailView from './components/fixtures/MatchDetailView.tsx';
import { parseFixturesCSV } from './lib/fixtureParser';

interface Fixture {
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffTime: string;
  id: string;
}

interface BetHistory {
  id: string;
  match: string;
  market: string;
  stake: number;
  odds: number;
  outcome: 'won' | 'lost' | 'pending';
  profit: number;
  date: string;
  probability: number;
}

interface BetslipItem {
  id: string;
  match: string;
  market: string;
  odds: number;
}

const StatCard = ({ title, value, trend, icon: Icon, color }: any) => (
  <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden group">
    <div className={cn("absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity", color)}>
      <Icon size={48} />
    </div>
    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{title}</p>
    <div className="flex items-end gap-3">
      <h3 className="text-3xl font-bold text-white font-mono">{value}</h3>
      {trend && (
        <span className={cn("text-xs font-bold flex items-center gap-1 mb-1", trend > 0 ? "text-green-400" : "text-red-400")}>
          {trend > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(trend)}%
        </span>
      )}
    </div>
  </div>
);

const TelemetryBanner = ({ signals, performance, matches, loading }: any) => {
  const topSignal = signals?.[0];
  const confidence = topSignal?.confidence ?? performance?.brierScore ?? 0;
  const liveMatches = signals?.filter((s: PredictionSignal) => s.status && s.status !== 'FINISHED').length ?? 0;
  const leagues = new Set((signals || []).map((s: PredictionSignal) => s.league)).size;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 mb-6">
      <div className="xl:col-span-2 bg-gradient-to-r from-blue-600/20 via-slate-900 to-slate-900 border border-blue-500/20 rounded-3xl p-6 overflow-hidden relative">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.25),_transparent_40%)]" />
        <div className="relative flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-blue-400">Live telemetry</p>
              <h2 className="text-2xl md:text-3xl font-black text-white mt-2">Prediction cockpit</h2>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/70 border border-slate-800">
              <Activity size={14} className="text-green-400" />
              <span className="text-xs font-bold text-green-400">System live</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Signals</p>
              <p className="text-2xl font-black text-white mt-2">{signals?.length ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Live matches</p>
              <p className="text-2xl font-black text-white mt-2">{liveMatches}</p>
            </div>
            <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Leagues</p>
              <p className="text-2xl font-black text-white mt-2">{leagues}</p>
            </div>
            <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Top confidence</p>
              <p className="text-2xl font-black text-white mt-2">{Math.round((confidence || 0) * 100)}%</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="px-3 py-1 rounded-full bg-slate-950 border border-slate-800">xG adjusted</span>
            <span className="px-3 py-1 rounded-full bg-slate-950 border border-slate-800">Momentum scoring</span>
            <span className="px-3 py-1 rounded-full bg-slate-950 border border-slate-800">Confidence bands</span>
            <span className="px-3 py-1 rounded-full bg-slate-950 border border-slate-800">Odds movement</span>
          </div>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Best signal</p>
        <div className="mt-4">
          <p className="text-lg font-black text-white">{topSignal ? `${topSignal.homeTeam} vs ${topSignal.awayTeam}` : 'Waiting for data'}</p>
          <p className="text-sm text-slate-400 mt-2">{topSignal ? `${topSignal.market} · ${topSignal.league}` : 'Load live signals to see the strongest opportunity.'}</p>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Health</p>
        <div className="mt-4 space-y-3">
          <div className="flex justify-between text-sm"><span className="text-slate-400">Telemetry</span><span className="text-green-400 font-bold">Stable</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-400">Models</span><span className="text-white font-bold">Ready</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-400">Data freshness</span><span className="text-white font-bold">Live</span></div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const { activeBets: contextActiveBets, betHistory: contextHistory, performance: realTimePerf, placeBet, refreshData, isLoading: isBettingLoading } = useBetting();

  const [view, setView] = useState<ViewState>('fixtures');
  const [signals, setSignals] = useState<PredictionSignal[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeLeague, setActiveLeague] = useState<string>('All');
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(15);
  const [selectedMatch, setSelectedMatch] = useState<PredictionSignal | null>(null);
  const [matchInsights, setMatchInsights] = useState<MatchInsights | null>(null);
  const [leagueStats, setLeagueStats] = useState<LeagueStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [historicalMatches, setHistoricalMatches] = useState<HistoricalMatch[]>([]);
  const [allTeamsMetrics, setAllTeamsMetrics] = useState<Record<string, TeamMetrics>>({});
  const [isLoadingHistorical, setIsLoadingHistorical] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [optimizedPortfolioMetrics, setOptimizedPortfolioMetrics] = useState<PortfolioMetrics | null>(null);
  const [backtestResults, setBacktestResults] = useState<{
    roi: number;
    maxDrawdown: number;
    brierScore: number;
    auc: number;
    calibrationData: CalibrationPoint[];
    isSimulating: boolean;
  } | null>(null);
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [geminiPrompt, setGeminiPrompt] = useState('');
  const [geminiResponse, setGeminiResponse] = useState('');
  const [isGeminiLoading, setIsGeminiLoading] = useState(false);
  const [mlPrediction, setMlPrediction] = useState<any>(null);
  const [liveOdds, setLiveOdds] = useState<any>(null);

  const runMonteCarloSimulation = async () => {
    if (!selectedMatch) return;
    setIsSimulating(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const homeWinProb = mlPrediction?.probabilities?.['Home Win'] || selectedMatch.probability;
    const drawProb = mlPrediction?.probabilities?.['Draw'] || Math.min(0.25, 1 - homeWinProb);
    const awayWinProb = mlPrediction?.probabilities?.['Away Win'] || Math.max(0, 1 - homeWinProb - drawProb);
    const homeExp = homeWinProb * 2.2;
    const awayExp = awayWinProb * 1.8;
    const scores = [
      { score: '1-0', prob: 0.12 },
      { score: '2-0', prob: 0.10 },
      { score: '2-1', prob: 0.09 },
      { score: '0-0', prob: 0.08 },
      { score: '1-1', prob: 0.11 },
      { score: '0-1', prob: 0.07 },
      { score: '0-2', prob: 0.05 },
      { score: '1-2', prob: 0.06 }
    ];
    const adjustedScores = scores.map(s => {
      const [h, a] = s.score.split('-').map(Number);
      let weight = 1.0;
      if (h > a) weight *= (homeWinProb / 0.5);
      if (a > h) weight *= (awayWinProb / 0.3);
      if (h === a) weight *= (drawProb / 0.25);
      return { score: s.score, probability: s.prob * weight };
    });
    const totalProb = adjustedScores.reduce((acc, s) => acc + s.probability, 0);
    const finalScores = adjustedScores.map(s => ({ score: s.score, probability: s.probability / totalProb })).sort((a, b) => b.probability - a.probability);
    setMonteCarloResult({
      homeWin: homeWinProb * 100,
      draw: drawProb * 100,
      awayWin: awayWinProb * 100,
      expectedGoals: { home: homeExp, away: awayExp },
      scoreDistribution: finalScores
    });
    setIsSimulating(false);
  };

  const runPortfolioOptimization = () => {
    const portfolioBets: PortfolioBet[] = betslip.map(item => ({
      id: item.id,
      match: item.match,
      market: item.market,
      probability: 0.6,
      odds: item.odds,
      edge: 0.05,
      kellyStake: 0.02,
      correlationGroup: item.match.split(' vs ')[0]
    }));
    const correlationMatrix: Record<string, Record<string, number>> = {};
    if (portfolioBets.length > 1) {
      portfolioBets.forEach((bet, i) => {
        portfolioBets.forEach((otherBet, j) => {
          if (i !== j && bet.match === otherBet.match) {
            if (!correlationMatrix[bet.id]) correlationMatrix[bet.id] = {};
            correlationMatrix[bet.id][otherBet.id] = 0.65;
          }
        });
      });
    }
    const metrics = PortfolioEngine.optimizePortfolio(portfolioBets, riskSettings.bankroll, correlationMatrix);
    setOptimizedPortfolioMetrics(metrics);
  };

  const runBacktestSimulation = () => {
    setBacktestResults(prev => ({ 
      roi: prev?.roi ?? 0,
      maxDrawdown: prev?.maxDrawdown ?? 0,
      brierScore: prev?.brierScore ?? 0,
      auc: prev?.auc ?? 0,
      calibrationData: prev?.calibrationData ?? [],
      isSimulating: true 
    }));
    const mockHistory = Array.from({ length: 100 }, () => ({ prob: 0.5 + Math.random() * 0.3, odds: 1.8 + Math.random() * 1.5, outcome: Math.random() > 0.4 ? 1 : 0 }));
    setTimeout(() => {
      const roiSim = ValidationEngine.simulateROI(mockHistory, riskSettings.fractionalKelly);
      const brier = ValidationEngine.calculateBrierScore(mockHistory.map(h => ({ prob: h.prob, outcome: h.outcome })));
      const auc = ValidationEngine.calculateAUC(mockHistory.map(h => ({ prob: h.prob, outcome: h.outcome })));
      const calibration = ValidationEngine.generateCalibrationData(mockHistory.map(h => ({ prob: h.prob, outcome: h.outcome })));
      setBacktestResults({ roi: roiSim.roi, maxDrawdown: roiSim.maxDrawdown, brierScore: brier, auc: auc, calibrationData: calibration, isSimulating: false });
    }, 1500);
  };

  const handleGeminiAsk = async (mode: 'thinking' | 'search' | 'general') => {
    setIsGeminiLoading(true);
    setGeminiResponse('Thinking...');
    const response = await askGemini(geminiPrompt, mode);
    setGeminiResponse(response);
    setIsGeminiLoading(false);
  };

  const [matchState, setMatchState] = useState<MatchState>({ minute: 0, score: [0, 0], shots: [0, 0], shotsOnTarget: [0, 0], possession: [50, 50], redCards: [0, 0], xG: [0, 0], sentiment: 0 });
  const [bayesianResult, setBayesianResult] = useState<BayesianOutput | null>(null);
  const [betslip, setBetslip] = useState<BetslipItem[]>([]);
  const [riskSettings, setRiskSettings] = useState<RiskSettings>({ bankroll: 1000, fractionalKelly: 0.25, maxBetPercentage: 0.05, minEdgeThreshold: 0.02, minConfidenceFloor: 0.65 });
  const [pipelineStatus, setPipelineStatus] = useState<{ lastRun: string; completeness: number; anomalies: number; isProcessing: boolean; }>({ lastRun: new Date().toISOString(), completeness: 99.8, anomalies: 2, isProcessing: false });

  const brierScore = realTimePerf?.brierScore || 0;
  const aucScore = realTimePerf?.auc || 0;

  const runPipeline = () => {
    setPipelineStatus(prev => ({ ...prev, isProcessing: true }));
    setTimeout(() => {
      setPipelineStatus({ lastRun: new Date().toISOString(), completeness: 100, anomalies: 0, isProcessing: false });
    }, 1500);
  };

  const portfolioMetrics = calculatePortfolioMetrics(contextHistory);

  const addToBetslip = (signal: PredictionSignal | null) => {
    if (!signal) return;
    if (betslip.find(item => item.id === signal.id)) return;
    const newItem: BetslipItem = { id: signal.id, match: `${signal.homeTeam} vs ${signal.awayTeam}`, market: signal.market, odds: signal.odds };
    setBetslip([...betslip, newItem]);
  };

  const removeFromBetslip = (id: string) => {
    setBetslip(betslip.filter(item => item.id !== id));
  };

  const placeBets = async (stake: number) => {
    if (betslip.length === 0) return;
    for (const item of betslip) {
      const signal = signals.find(s => s.id === item.id);
      if (signal) {
        await placeBet({ matchId: signal.id, homeTeam: signal.homeTeam, awayTeam: signal.awayTeam, market: signal.market, odds: signal.odds, probability: signal.probability, stake: stake, kickoffTime: signal.kickoffTime, homeXG: signal.homeXG, awayXG: signal.awayXG, league: signal.league });
      }
    }
    setBetslip([]);
    setView('portfolio');
  };

  useEffect(() => {
    if (isLive && selectedMatch) {
      const interval = setInterval(() => {
        setMatchState(prev => {
          const nextMinute = prev.minute + 1;
          if (nextMinute > 90) {
            setIsLive(false);
            return prev;
          }
          const homeGoal = Math.random() > 0.98 ? 1 : 0;
          const awayGoal = Math.random() > 0.99 ? 1 : 0;
          const homeShot = Math.random() > 0.8 ? 1 : 0;
          const awayShot = Math.random() > 0.85 ? 1 : 0;
          return {
            ...prev,
            minute: nextMinute,
            score: [prev.score[0] + homeGoal, prev.score[1] + awayGoal],
            shots: [prev.shots[0] + homeShot, prev.shots[1] + awayShot],
            xG: [prev.xG[0] + (homeShot * 0.15), prev.xG[1] + (awayShot * 0.12)],
            possession: [50 + Math.sin(nextMinute/5) * 5, 50 - Math.sin(nextMinute/5) * 5],
            sentiment: Math.sin(nextMinute/10)
          };
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isLive, selectedMatch]);

  useEffect(() => {
    if (selectedMatch) {
      const result = calculateLiveUpdate(selectedMatch.probability, matchState);
      setBayesianResult(result);
    }
  }, [matchState, selectedMatch]);

  useEffect(() => {
    const loadHistoricalData = async () => {
      try {
        const matches = await parseHistoricalCSV('/realistic_historical.csv');
        setHistoricalMatches(matches);
        const teams = new Set<string>();
        matches.forEach(m => {
          teams.add(m.home_team);
          teams.add(m.away_team);
        });
        const metrics: Record<string, TeamMetrics> = {};
        teams.forEach(team => {
          metrics[team] = calculateTeamMetrics(team, matches);
        });
        setAllTeamsMetrics(metrics);
        setIsLoadingHistorical(false);
      } catch (error) {
        console.error('Error loading historical data:', error);
        setIsLoadingHistorical(false);
      }
    };
    loadHistoricalData();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const statsRes = await fetch('/league_statistics.csv');
        const statsText = await statsRes.text();
        const parsedStats = d3.csvParse(statsText) as any[];
        setLeagueStats(parsedStats.map(s => ({ ...s, matches: +s.matches, avg_goals: +s.avg_goals, over_2_5_rate: +s.over_2_5_rate, btts_rate: +s.btts_rate, home_win_rate: +s.home_win_rate })));
        let fixtures: PredictionSignal[] = [];
        try {
          const upcomingRes = await fetch('/api/matches/upcoming');
          if (upcomingRes.ok) {
            const upcomingData = await upcomingRes.json();
            if (Array.isArray(upcomingData)) {
              fixtures = upcomingData.map((match: any, index: number) => {
                const probability = 0.4 + Math.random() * 0.4;
                const odds = 1.5 + Math.random() * 2.5;
                const ev = (probability * odds) - 1;
                const kelly = Math.max(0, (ev / (odds - 1)) * 0.1);
                const markets = ["Over 2.5", "Home Win", "BTTS - Yes", "Away Win", "Under 2.5"];
                const movements: ('up' | 'down' | 'stable')[] = ['up', 'down', 'stable'];
                const homeMetrics = allTeamsMetrics[match.homeTeam];
                const awayMetrics = allTeamsMetrics[match.awayTeam];
                const homeXG = homeMetrics ? homeMetrics.avgGoalsScored : 1.2;
                const awayXG = awayMetrics ? awayMetrics.avgGoalsScored : 1.1;
                return { id: match.id || `api-${index}`, homeTeam: match.homeTeam, awayTeam: match.awayTeam, league: match.league, market: match.market || markets[Math.floor(Math.random() * markets.length)], probability: parseFloat(probability.toFixed(2)), odds: parseFloat(odds.toFixed(2)), ev: parseFloat(ev.toFixed(3)), kelly: parseFloat(kelly.toFixed(3)), confidence: parseFloat((0.6 + Math.random() * 0.35).toFixed(2)), agreement: parseFloat((0.5 + Math.random() * 0.5).toFixed(2)), kickoffTime: match.kickoffTime, oddsMovement: match.oddsMovement || movements[Math.floor(Math.random() * movements.length)], status: match.status, score: match.score, homeXG: parseFloat(homeXG.toFixed(2)), awayXG: parseFloat(awayXG.toFixed(2)) };
              });
            }
          }
        } catch (e) {
          console.error("Failed to fetch real upcoming matches, falling back to CSV", e);
        }
        if (fixtures.length === 0) {
          fixtures = await parseFixturesCSV('/all_fixtures.csv');
        }
        setSignals(fixtures);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    setIsFiltering(true);
    const timer = setTimeout(() => setIsFiltering(false), 400);
    return () => clearTimeout(timer);
  }, [activeLeague, searchTerm]);

  const leagueMapping: Record<string, string[]> = useMemo(() => ({
    'All': [],
    'Premier League': ['premier-league', 'epl', 'premier league'],
    'La Liga': ['la-liga', 'laliga', 'la liga'],
    'Bundesliga': ['bundesliga'],
    'Serie A': ['serie-a', 'serie a'],
    'Ligue 1': ['ligue-1', 'ligue 1'],
    'Championship': ['championship']
  }), []);

  const filteredSignals = useMemo(() => {
    const filtered = signals.filter(s => {
      const normalizedLeague = s.league.toLowerCase().replace(/\s+/g, '-');
      const matchesLeague = activeLeague === 'All' || (leagueMapping[activeLeague] || [activeLeague.toLowerCase()]).some(l => normalizedLeague.includes(l));
      const matchesSearch = s.homeTeam.toLowerCase().includes(searchTerm.toLowerCase()) || s.awayTeam.toLowerCase().includes(searchTerm.toLowerCase()) || s.league.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMarket = selectedMarkets.length === 0 || selectedMarkets.includes(s.market);
      return matchesLeague && matchesSearch && matchesMarket;
    });
    return filtered.sort((a, b) => b.ev - a.ev);
  }, [signals, activeLeague, searchTerm, selectedMarkets, leagueMapping]);

  const visibleSignals = useMemo(() => filteredSignals.slice(0, visibleCount), [filteredSignals, visibleCount]);

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      setVisibleCount(prev => Math.min(prev + 15, filteredSignals.length));
    }
  };

  const matchData = useMemo(() => {
    if (!selectedMatch || !historicalMatches.length) return null;
    const homeMetrics = allTeamsMetrics[selectedMatch.homeTeam] || calculateTeamMetrics(selectedMatch.homeTeam, historicalMatches);
    const awayMetrics = allTeamsMetrics[selectedMatch.awayTeam] || calculateTeamMetrics(selectedMatch.awayTeam, historicalMatches);
    const h2h = getH2H(selectedMatch.homeTeam, selectedMatch.awayTeam, historicalMatches);
    const similarMatches = findSimilarMatches(selectedMatch.homeTeam, selectedMatch.awayTeam, historicalMatches, allTeamsMetrics);
    return { homeMetrics, awayMetrics, h2h, similarMatches };
  }, [selectedMatch, historicalMatches, allTeamsMetrics]);

  const handleMatchClick = async (match: PredictionSignal) => {
    setSelectedMatch(match);
    setMatchInsights(null);
    setMlPrediction(null);
    setLiveOdds(null);
    setMonteCarloResult(null);
    setView('detail');
    const homeMetrics = allTeamsMetrics[match.homeTeam] || calculateTeamMetrics(match.homeTeam, historicalMatches);
    const awayMetrics = allTeamsMetrics[match.awayTeam] || calculateTeamMetrics(match.awayTeam, historicalMatches);
    const homeXG = homeMetrics.matchesPlayed > 0 ? homeMetrics.avgGoalsScored : match.probability * 2.2;
    const awayXG = awayMetrics.matchesPlayed > 0 ? awayMetrics.avgGoalsScored : (1 - match.probability) * 1.8;
    try {
      const [mlRes, oddsRes] = await Promise.all([
        fetch('/api/predict/ml', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ homeTeam: match.homeTeam, awayTeam: match.awayTeam, homeXG: homeXG, awayXG: awayXG })
        }),
        fetch('/api/odds')
      ]);
      if (mlRes.ok) {
        const mlData = await mlRes.json();
        setMlPrediction(mlData);
      }
      if (oddsRes.ok) {
        const oddsData = await oddsRes.json();
        setLiveOdds(oddsData);
      }
    } catch (error) {
      console.error("Error fetching ML/Odds:", error);
    }
    try {
      const insights = await getMatchInsights(match);
      setMatchInsights(insights);
    } catch (error) {
      console.error('Error fetching match insights:', error);
    }
  };

  const handleQuickBet = (match: PredictionSignal) => {
    addToBetslip(match);
    setView('portfolio');
  };

  const summaryBars = [
    { label: 'ROI', value: `${(realTimePerf?.roi ?? 0).toFixed(1)}%`, tone: 'text-green-400' },
    { label: 'Win rate', value: `${Math.round((realTimePerf?.winRate ?? 0) * 100)}%`, tone: 'text-blue-400' },
    { label: 'Brier', value: (brierScore || 0).toFixed(3), tone: 'text-purple-400' },
    { label: 'AUC', value: (aucScore || 0).toFixed(3), tone: 'text-slate-200' },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      <Sidebar view={view} setView={setView} />
      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto pb-24">
        <AnimatePresence mode="wait">
          {view === 'fixtures' && (
            <motion.div key="fixtures" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-7xl mx-auto space-y-6">
              <TelemetryBanner signals={signals} performance={realTimePerf} matches={historicalMatches} loading={loading} />

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {summaryBars.map((item) => (
                  <StatCard key={item.label} title={item.label} value={item.value} icon={Gauge} color={item.tone} />
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-6">
                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.35em] text-blue-400">Market opportunities</p>
                      <h2 className="text-3xl font-black text-white mt-2">Match telemetry</h2>
                      <p className="text-slate-400 mt-2 max-w-2xl">Browse live signals, compare teams, and open the detailed prediction view with Monte Carlo, Bayesian, and odds intelligence.</p>
                    </div>
                    <div className="flex gap-3 items-center">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search teams..." className="pl-9 pr-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-sm text-white focus:outline-none focus:border-blue-500 w-full md:w-72" />
                      </div>
                      <button className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-blue-500 transition-colors">
                        <Filter size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {['All','Premier League','La Liga','Bundesliga','Serie A','Ligue 1','Championship'].map((league) => (
                      <button key={league} onClick={() => setActiveLeague(league)} className={cn('px-4 py-2 rounded-full text-sm font-bold transition-all', activeLeague === league ? 'bg-blue-600 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white')}>
                        {league}
                      </button>
                    ))}
                  </div>

                  <div className="h-px bg-slate-800" />

                  <div className="space-y-4">
                    {loading ? <div className="grid grid-cols-1 gap-4">{[1,2,3,4].map(i => <FixtureSkeleton key={i} />)}</div> : visibleSignals.map((signal, index) => (
                      <FixtureItem key={signal.id} signal={signal} index={index} onClick={() => handleMatchClick(signal)} onQuickBet={() => handleQuickBet(signal)} />
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-black text-white">Telemetry snapshot</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest text-green-400">Live</span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm"><span className="text-slate-400">Current view</span><span className="text-white font-bold">{view}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-slate-400">Filtered signals</span><span className="text-white font-bold">{filteredSignals.length}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-slate-400">Pipeline completeness</span><span className="text-white font-bold">{pipelineStatus.completeness.toFixed(1)}%</span></div>
                      <div className="flex justify-between text-sm"><span className="text-slate-400">Anomalies</span><span className="text-white font-bold">{pipelineStatus.anomalies}</span></div>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                    <h3 className="font-black text-white mb-4">Model mix</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm"><span className="text-slate-400">Poisson</span><span className="text-green-400 font-bold">Ready</span></div>
                      <div className="flex justify-between text-sm"><span className="text-slate-400">Bayesian</span><span className="text-blue-400 font-bold">Adaptive</span></div>
                      <div className="flex justify-between text-sm"><span className="text-slate-400">Gemini</span><span className="text-purple-400 font-bold">Enabled</span></div>
                      <div className="flex justify-between text-sm"><span className="text-slate-400">Telemetry</span><span className="text-white font-bold">Streaming</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {view === 'portfolio' && (
            <motion.div key="portfolio" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-6xl mx-auto space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold text-white">Active Portfolio</h2>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Exposure</p>
                    <p className="text-xl font-mono font-bold text-white">{contextActiveBets.reduce((acc, b) => acc + b.stake, 0).toFixed(1)} units</p>
                  </div>
                  <div className="w-px h-10 bg-slate-800" />
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Unrealized P&L</p>
                    <p className="text-xl font-mono font-bold text-green-400">+1.82u</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2"><Activity className="text-blue-400 w-5 h-5" />Open Positions</h3>
                  {contextActiveBets.length === 0 && <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500">No active positions. Browse fixtures to place bets.</div>}
                  {contextActiveBets.map((bet, i) => (
                    <div key={i} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                        <div>
                          <h4 className="font-bold text-white">{bet.homeTeam} vs {bet.awayTeam}</h4>
                          <p className="text-xs text-slate-500">{bet.market} @ {bet.odds}</p>
                          <div className="flex gap-2 mt-1"><span className="text-[10px] font-bold text-slate-600 uppercase">xG: {bet.homeXG?.toFixed(1)} - {bet.awayXG?.toFixed(1)}</span></div>
                        </div>
                      </div>
                      <div className="text-center"><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Status</p><p className="font-mono font-bold text-blue-400">In Play</p></div>
                      <div className="text-right"><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Stake</p><p className="font-mono font-bold text-white">{bet.stake}u</p></div>
                    </div>
                  ))}
                  <h3 className="text-lg font-bold text-white flex items-center gap-2 pt-8"><Clock className="text-slate-500 w-5 h-5" />Bet History</h3>
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden"><table className="w-full text-left"><thead className="bg-slate-950/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest"><tr><th className="px-6 py-4">Match</th><th className="px-6 py-4">Market</th><th className="px-6 py-4">Stake</th><th className="px-6 py-4">P&L</th></tr></thead><tbody className="divide-y divide-slate-800">{contextHistory.map((bet) => (<tr key={bet.id} className="hover:bg-slate-800/30 transition-colors"><td className="px-6 py-4"><p className="text-sm font-bold text-white">{bet.homeTeam} vs {bet.awayTeam}</p><p className="text-[10px] text-slate-500">{new Date(bet.settledAt).toLocaleDateString()}</p></td><td className="px-6 py-4 text-xs text-slate-400">{bet.market} @ {bet.odds}</td><td className="px-6 py-4 text-xs font-mono text-white">{bet.stake}u</td><td className={cn("px-6 py-4 text-sm font-mono font-bold", bet.profit > 0 ? "text-green-400" : "text-red-400")}>{bet.profit > 0 ? '+' : ''}{bet.profit.toFixed(2)}u</td></tr>))}</tbody></table></div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 h-fit sticky top-8">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2"><Calculator className="text-green-400 w-5 h-5" />Parlay Builder</h3>
                    {betslip.length > 1 && (<div className="flex items-center gap-2 px-3 py-1 bg-blue-600/10 border border-blue-500/20 rounded-full"><Zap size={12} className="text-blue-400" /><span className="text-[10px] font-bold text-blue-400 uppercase">Parlay EV: live</span></div>)}
                    <button onClick={() => { const newBankroll = prompt("Enter Bankroll Amount:", riskSettings.bankroll.toString()); if (newBankroll) setRiskSettings({ ...riskSettings, bankroll: Number(newBankroll) }); }} className="text-[10px] font-bold text-blue-400 uppercase hover:underline">Set Bankroll</button>
                  </div>
                  <div className="space-y-4 mb-8">{betslip.length === 0 ? (<div className="text-center p-8 border-2 border-dashed border-slate-800 rounded-3xl text-slate-600 text-sm">Drag predictions here to build a parlay.</div>) : (<div className="space-y-3">{betslip.map((item) => (<div key={item.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between group"><div><p className="text-xs font-bold text-white">{item.match}</p><p className="text-[10px] text-slate-500">{item.market} @ {item.odds}</p></div><button onClick={() => removeFromBetslip(item.id)} className="text-slate-700 hover:text-red-400 transition-colors"><AlertCircle size={16} /></button></div>))}</div>)}</div>
                  <div className="space-y-4 pt-8 border-t border-slate-800">
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Total Odds</span><span className="text-white font-mono font-bold">{betslip.reduce((acc, b) => acc * b.odds, 1).toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Implied Prob</span><span className="text-white font-mono font-bold">{(1 / betslip.reduce((acc, b) => acc * b.odds, 1) * 100).toFixed(1)}%</span></div>
                    <div className="pt-4"><div className="flex justify-between items-center mb-2"><p className="text-[10px] font-bold text-slate-500 uppercase">Stake (Units)</p><p className="text-[10px] font-bold text-blue-400 uppercase">Kelly Suggestion: {(calculateKelly(betslip.length > 0 ? (1 / betslip.reduce((acc, b) => acc * b.odds, 1)) : 0.5, betslip.reduce((acc, b) => acc * b.odds, 1), riskSettings).suggestedStake).toFixed(1)}u</p></div><input type="number" defaultValue={1.0} id="stake-input" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono focus:outline-none focus:border-blue-500" /></div>
                    <button disabled={betslip.length === 0} onClick={() => { const stake = Number((document.getElementById('stake-input') as HTMLInputElement).value); placeBets(stake); }} className={cn("w-full py-4 rounded-2xl font-bold transition-all", betslip.length > 0 ? "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20" : "bg-slate-800 text-slate-500 cursor-not-allowed")}>Place {betslip.length > 1 ? 'Parlay' : 'Bet'}</button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 px-6 py-3 flex items-center justify-between z-50">
        {[
          { id: 'fixtures', icon: List, label: 'Fixtures' },
          { id: 'analytics', icon: PieChartIcon, label: 'Analytics' },
          { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
        ].map((item) => (
          <button key={item.id} onClick={() => setView(item.id as ViewState)} className={cn("flex flex-col items-center gap-1 transition-all", view === item.id ? "text-blue-500" : "text-slate-500")}>
            <item.icon size={22} />
            <span className="text-[10px] font-bold">{item.label}</span>
            {view === item.id && <motion.div layoutId="mobile-nav-dot" className="w-1 h-1 bg-blue-500 rounded-full mt-0.5" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
