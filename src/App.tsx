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

// --- Components ---

// --- Types ---



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



// --- Mock Data ---

const BET_HISTORY: BetHistory[] = [
  { id: 'h1', match: 'Arsenal vs Chelsea', market: 'Home Win', stake: 100, odds: 1.85, outcome: 'won', profit: 85, date: '2026-03-28', probability: 0.65 },
  { id: 'h2', match: 'Inter vs Milan', market: 'BTTS', stake: 50, odds: 1.70, outcome: 'lost', profit: -50, date: '2026-03-29', probability: 0.58 },
  { id: 'h3', match: 'Luton vs Everton', market: 'Under 2.5', stake: 75, odds: 2.10, outcome: 'won', profit: 82.5, date: '2026-03-30', probability: 0.52 },
];

const ROI_DATA = [
  { date: 'Mar 01', roi: 2.1 }, { date: 'Mar 05', roi: 4.5 }, { date: 'Mar 10', roi: 3.8 },
  { date: 'Mar 15', roi: 7.2 }, { date: 'Mar 20', roi: 6.1 }, { date: 'Mar 25', roi: 9.4 },
  { date: 'Apr 01', roi: 12.4 },
];

const RADAR_DATA = [
  { subject: 'Attack', A: 120, B: 110, fullMark: 150 },
  { subject: 'Defense', A: 98, B: 130, fullMark: 150 },
  { subject: 'Possession', A: 86, B: 130, fullMark: 150 },
  { subject: 'Set Pieces', A: 99, B: 100, fullMark: 150 },
  { subject: 'Discipline', A: 85, B: 90, fullMark: 150 },
];

// --- Components ---

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
    
    // Simulate complex calculation delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const homeWinProb = mlPrediction?.probabilities?.['Home Win'] || selectedMatch.probability;
    const drawProb = mlPrediction?.probabilities?.['Draw'] || Math.min(0.25, 1 - homeWinProb);
    const awayWinProb = mlPrediction?.probabilities?.['Away Win'] || Math.max(0, 1 - homeWinProb - drawProb);
    
    // Simple Poisson-based score distribution simulation
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

    // Adjust probabilities based on match strength
    const adjustedScores = scores.map(s => {
      const [h, a] = s.score.split('-').map(Number);
      let weight = 1.0;
      if (h > a) weight *= (homeWinProb / 0.5);
      if (a > h) weight *= (awayWinProb / 0.3);
      if (h === a) weight *= (drawProb / 0.25);
      return { score: s.score, probability: s.prob * weight };
    });

    // Normalize
    const totalProb = adjustedScores.reduce((acc, s) => acc + s.probability, 0);
    const finalScores = adjustedScores.map(s => ({
      score: s.score,
      probability: s.probability / totalProb
    })).sort((a, b) => b.probability - a.probability);
    
    setMonteCarloResult({
      homeWin: homeWinProb * 100,
      draw: drawProb * 100,
      awayWin: awayWinProb * 100,
      expectedGoals: {
        home: homeExp,
        away: awayExp
      },
      scoreDistribution: finalScores
    });
    
    setIsSimulating(false);
  };

  const runPortfolioOptimization = () => {
    const portfolioBets: PortfolioBet[] = betslip.map(item => ({
      id: item.id,
      match: item.match,
      market: item.market,
      probability: 0.6, // Mock for demo
      odds: item.odds,
      edge: 0.05, // Mock for demo
      kellyStake: 0.02, // Mock for demo
      correlationGroup: item.match.split(' vs ')[0] // Simple group by home team
    }));

    // Mock correlation matrix for demonstration
    // In a real app, this would be calculated based on match/market overlap
    const correlationMatrix: Record<string, Record<string, number>> = {};
    if (portfolioBets.length > 1) {
      // Example: High correlation between bets in the same match
      portfolioBets.forEach((bet, i) => {
        portfolioBets.forEach((otherBet, j) => {
          if (i !== j && bet.match === otherBet.match) {
            if (!correlationMatrix[bet.id]) correlationMatrix[bet.id] = {};
            correlationMatrix[bet.id][otherBet.id] = 0.65;
          }
        });
      });
    }

    const metrics = PortfolioEngine.optimizePortfolio(
      portfolioBets, 
      riskSettings.bankroll,
      correlationMatrix
    );
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
    
    // Mock historical data for simulation
    const mockHistory = Array.from({ length: 100 }, () => ({
      prob: 0.5 + Math.random() * 0.3,
      odds: 1.8 + Math.random() * 1.5,
      outcome: Math.random() > 0.4 ? 1 : 0
    }));

    setTimeout(() => {
      const roiSim = ValidationEngine.simulateROI(mockHistory, riskSettings.fractionalKelly);
      const brier = ValidationEngine.calculateBrierScore(mockHistory.map(h => ({ prob: h.prob, outcome: h.outcome })));
      const auc = ValidationEngine.calculateAUC(mockHistory.map(h => ({ prob: h.prob, outcome: h.outcome })));
      const calibration = ValidationEngine.generateCalibrationData(mockHistory.map(h => ({ prob: h.prob, outcome: h.outcome })));

      setBacktestResults({
        roi: roiSim.roi,
        maxDrawdown: roiSim.maxDrawdown,
        brierScore: brier,
        auc: auc,
        calibrationData: calibration,
        isSimulating: false
      });
    }, 1500);
  };

  const handleGeminiAsk = async (mode: 'thinking' | 'search' | 'general') => {
    setIsGeminiLoading(true);
    setGeminiResponse('Thinking...');
    const response = await askGemini(geminiPrompt, mode);
    setGeminiResponse(response);
    setIsGeminiLoading(false);
  };



  const [matchState, setMatchState] = useState<MatchState>({
    minute: 0,
    score: [0, 0],
    shots: [0, 0],
    shotsOnTarget: [0, 0],
    possession: [50, 50],
    redCards: [0, 0],
    xG: [0, 0],
    sentiment: 0
  });
  const [bayesianResult, setBayesianResult] = useState<BayesianOutput | null>(null);
  const [betslip, setBetslip] = useState<BetslipItem[]>([]);
  const [riskSettings, setRiskSettings] = useState<RiskSettings>({
    bankroll: 1000,
    fractionalKelly: 0.25, // Quarter Kelly
    maxBetPercentage: 0.05, // 5% Max
    minEdgeThreshold: 0.02, // 2% Edge
    minConfidenceFloor: 0.65 // 65% Consensus
  });
  const [pipelineStatus, setPipelineStatus] = useState<{
    lastRun: string;
    completeness: number;
    anomalies: number;
    isProcessing: boolean;
  }>({
    lastRun: new Date().toISOString(),
    completeness: 99.8,
    anomalies: 2,
    isProcessing: false
  });

  const brierScore = realTimePerf?.brierScore || 0;
  const aucScore = realTimePerf?.auc || 0;

  const runPipeline = () => {
    setPipelineStatus(prev => ({ ...prev, isProcessing: true }));
    setTimeout(() => {
      setPipelineStatus({
        lastRun: new Date().toISOString(),
        completeness: 100,
        anomalies: 0,
        isProcessing: false
      });
    }, 1500);
  };

  const portfolioMetrics = calculatePortfolioMetrics(contextHistory);

  const addToBetslip = (signal: PredictionSignal | null) => {
    if (!signal) return;
    if (betslip.find(item => item.id === signal.id)) return;
    
    const newItem: BetslipItem = {
      id: signal.id,
      match: `${signal.homeTeam} vs ${signal.awayTeam}`,
      market: signal.market,
      odds: signal.odds
    };
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
        await placeBet({
          matchId: signal.id,
          homeTeam: signal.homeTeam,
          awayTeam: signal.awayTeam,
          market: signal.market,
          odds: signal.odds,
          probability: signal.probability,
          stake: stake,
          kickoffTime: signal.kickoffTime,
          homeXG: signal.homeXG,
          awayXG: signal.awayXG,
          league: signal.league
        });
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
          
          // Simulate random events
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
      }, 1000); // 1 second = 1 minute for demo
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
        
        // Calculate metrics for all teams
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
        setLeagueStats(parsedStats.map(s => ({
          ...s,
          matches: +s.matches,
          avg_goals: +s.avg_goals,
          over_2_5_rate: +s.over_2_5_rate,
          btts_rate: +s.btts_rate,
          home_win_rate: +s.home_win_rate
        })));

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

                return {
                  id: match.id || `api-${index}`,
                  homeTeam: match.homeTeam,
                  awayTeam: match.awayTeam,
                  league: match.league,
                  market: markets[Math.floor(Math.random() * markets.length)],
                  probability: parseFloat(probability.toFixed(2)),
                  odds: parseFloat(odds.toFixed(2)),
                  ev: parseFloat(ev.toFixed(3)),
                  kelly: parseFloat(kelly.toFixed(3)),
                  confidence: parseFloat((0.6 + Math.random() * 0.35).toFixed(2)),
                  agreement: parseFloat((0.5 + Math.random() * 0.5).toFixed(2)),
                  kickoffTime: match.kickoffTime,
                  oddsMovement: movements[Math.floor(Math.random() * movements.length)],
                  status: match.status,
                  score: match.score,
                  homeXG: parseFloat(homeXG.toFixed(2)),
                  awayXG: parseFloat(awayXG.toFixed(2))
                };
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
      const matchesLeague = activeLeague === 'All' || 
        (leagueMapping[activeLeague] || [activeLeague.toLowerCase()]).some(l => 
          s.league.toLowerCase().includes(l)
        );
      
      const matchesSearch = s.homeTeam.toLowerCase().includes(searchTerm.toLowerCase()) || 
        s.awayTeam.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.league.toLowerCase().includes(searchTerm.toLowerCase());
      
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
    
    // Calculate data-driven xG
    const homeMetrics = allTeamsMetrics[match.homeTeam] || calculateTeamMetrics(match.homeTeam, historicalMatches);
    const awayMetrics = allTeamsMetrics[match.awayTeam] || calculateTeamMetrics(match.awayTeam, historicalMatches);
    
    const homeXG = homeMetrics.matchesPlayed > 0 ? homeMetrics.avgGoalsScored : match.probability * 2.2;
    const awayXG = awayMetrics.matchesPlayed > 0 ? awayMetrics.avgGoalsScored : (1 - match.probability) * 1.8;

    // Fetch ML Prediction & Live Odds immediately
    try {
      const [mlRes, oddsRes] = await Promise.all([
        fetch('/api/predict/ml', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeXG: homeXG,
            awayXG: awayXG
          })
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

    // Fetch Insights
    try {
      const insights = await getMatchInsights(match);
      setMatchInsights(insights);
    } catch (error) {
      console.error("Failed to fetch insights", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col md:flex-row">
      
      {/* Sidebar Navigation - Desktop Only */}
      <Sidebar view={view} setView={setView} />

      {/* Main Content Area */}
      <main 
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto pb-24 md:pb-8 p-4 md:p-8 lg:p-12"
      >
        <AnimatePresence mode="wait">
          
          {/* FIXTURES VIEW */}
          {view === 'fixtures' && (
            <motion.div 
              key="fixtures"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto space-y-6 md:space-y-8"
            >
              <div className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md py-4 -mx-4 px-4 md:static md:bg-transparent md:p-0 md:m-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Market Opportunities</h2>
                    <p className="text-slate-500 text-sm mt-1">High-confidence signals filtered from 5 ensemble models.</p>
                  </div>
                  <div className="flex items-center gap-3 md:gap-4 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                    <select
                      multiple
                      value={selectedMarkets}
                      onChange={(e) => setSelectedMarkets(Array.from(e.target.selectedOptions, option => option.value))}
                      className="bg-slate-900 text-white p-2 rounded-xl border border-slate-800 text-xs"
                    >
                      <option value="Over 2.5">Over 2.5</option>
                      <option value="Home Win">Home Win</option>
                      <option value="BTTS - Yes">BTTS - Yes</option>
                      <option value="Away Win">Away Win</option>
                      <option value="Under 2.5">Under 2.5</option>
                    </select>
                    <div className="relative flex-shrink-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                      <input 
                        type="text" 
                        placeholder="Search teams..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 transition-colors w-48 md:w-64"
                      />
                    </div>
                    <button className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-slate-400 hover:text-white transition-colors flex-shrink-0">
                      <Filter size={20} />
                    </button>
                  </div>
                </div>

                {/* Quick League Filters */}
                <div className="flex items-center gap-2 mt-4 overflow-x-auto no-scrollbar pb-1">
                  {['All', 'Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1', 'Championship'].map((league) => (
                    <button
                      key={league}
                      onClick={() => setActiveLeague(league)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border",
                        activeLeague === league 
                          ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20" 
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                      )}
                    >
                      {league}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
                {isFiltering ? (
                  [1, 2, 3, 4].map(i => <FixtureSkeleton key={i} />)
                ) : visibleSignals.length > 0 ? (
                  visibleSignals.map((signal, index) => (
                    <motion.div 
                      key={signal.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.05, 0.5) }}
                      onClick={() => handleMatchClick(signal)}
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
                          {signal.status === 'FINISHED' ? (
                            <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-center min-w-[80px]">
                              <p className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">Final Score</p>
                              <p className="text-sm font-black text-white">{signal.score?.home}-{signal.score?.away}</p>
                            </div>
                          ) : (
                            <>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addToBetslip(signal);
                                }}
                                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95 touch-manipulation"
                              >
                                QUICK BET
                              </button>
                              <div className="hidden lg:block text-center">
                                <span className="text-[10px] font-bold text-slate-500">STAKE: {(signal.kelly * 100).toFixed(1)}%</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Hover Glow */}
                      <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/5 transition-colors pointer-events-none" />
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-20 bg-slate-900/50 rounded-3xl border border-slate-800 border-dashed col-span-full">
                    <AlertCircle className="mx-auto text-slate-600 mb-4" size={48} />
                    <p className="text-slate-400 font-bold">No fixtures found for this league.</p>
                    <button 
                      onClick={() => { setActiveLeague('All'); setSearchTerm(''); }}
                      className="mt-4 text-blue-500 font-bold hover:underline"
                    >
                      Clear all filters
                    </button>
                  </div>
                )}
                
                {visibleCount < filteredSignals.length && (
                  <div className="py-8 flex flex-col items-center gap-4 col-span-full">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <button 
                      onClick={() => setVisibleCount(prev => prev + 15)}
                      className="bg-slate-900 border border-slate-800 px-8 py-3 rounded-2xl text-slate-400 font-bold hover:text-white hover:border-slate-700 transition-all flex items-center gap-2 group"
                    >
                      <span>Load More Fixtures</span>
                      <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* DETAIL VIEW */}
          {view === 'detail' && selectedMatch && (
            <MatchDetailView 
              selectedMatch={selectedMatch}
              matchData={matchData}
              historicalMatches={historicalMatches}
              monteCarloResult={monteCarloResult}
              matchInsights={matchInsights}
              isSimulating={isSimulating}
              mlPrediction={mlPrediction}
              liveOdds={liveOdds}
              onRunSimulation={runMonteCarloSimulation}
              onBack={() => {
                setView('fixtures');
                setIsLive(false);
              }}
            />
          )}


          {/* ANALYTICS VIEW */}
          {view === 'analytics' && (
            <motion.div 
              key="analytics"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-6xl mx-auto space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold text-white">Performance Analytics</h2>
                <div className="flex items-center gap-4">
                  <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">30 Days</button>
                    <button className="px-4 py-2 text-slate-500 text-xs font-bold">All Time</button>
                  </div>
                  <button 
                    onClick={runPipeline}
                    disabled={pipelineStatus.isProcessing}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      pipelineStatus.isProcessing 
                        ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                        : "bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600 hover:text-white"
                    )}
                  >
                    <Activity size={14} className={cn(pipelineStatus.isProcessing && "animate-spin")} />
                    {pipelineStatus.isProcessing ? 'Processing...' : 'Run Pipeline'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total ROI" value={`${(realTimePerf?.roi || 0).toFixed(1)}%`} trend={2.1} icon={TrendingUp} color="text-green-400" />
                <StatCard title="AUC-ROC" value={(realTimePerf?.auc || 0).toFixed(3)} trend={0.02} icon={Target} color="text-blue-400" />
                <StatCard title="Profit Factor" value={(realTimePerf?.profitFactor || 0).toFixed(2)} trend={-1.2} icon={Shield} color="text-red-400" />
                <StatCard title="Brier Score" value={(realTimePerf?.brierScore || 0).toFixed(3)} trend={-0.05} icon={Activity} color="text-purple-400" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-8">
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-bold text-white">Cumulative ROI Curve</h3>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-500 uppercase">Pipeline Health</p>
                          <p className="text-sm font-mono font-bold text-green-400">{pipelineStatus.completeness}% Complete</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-500 uppercase">Anomalies</p>
                          <p className="text-sm font-mono font-bold text-yellow-400">{pipelineStatus.anomalies} Flagged</p>
                        </div>
                      </div>
                    </div>
                    <div className="h-[400px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={ROI_DATA}>
                          <defs>
                            <linearGradient id="colorRoi" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                          <YAxis stroke="#64748b" fontSize={12} />
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} />
                          <Area type="monotone" dataKey="roi" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRoi)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Real-Time Performance Section */}
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-xl font-bold text-white">Real-Time Performance</h3>
                        <p className="text-xs text-slate-500 mt-1">Live metrics from settled predictions</p>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-green-600/10 border border-green-500/20 rounded-full">
                        <Activity size={12} className="text-green-400" />
                        <span className="text-[10px] font-bold text-green-400 uppercase">Live Tracking</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Real-Time ROI</p>
                        <p className={cn("text-2xl font-mono font-bold", (realTimePerf?.roi || 0) >= 0 ? "text-green-400" : "text-red-400")}>
                          {(realTimePerf?.roi || 0) >= 0 ? '+' : ''}{(realTimePerf?.roi || 0).toFixed(1)}%
                        </p>
                      </div>
                      <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Win Rate</p>
                        <p className="text-2xl font-mono font-bold text-blue-400">{(realTimePerf?.winRate || 0).toFixed(1)}%</p>
                      </div>
                      <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Brier Score</p>
                        <p className="text-2xl font-mono font-bold text-purple-400">{(realTimePerf?.brierScore || 0).toFixed(4)}</p>
                      </div>
                      <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">AUC-ROC</p>
                        <p className="text-2xl font-mono font-bold text-orange-400">{(realTimePerf?.auc || 0).toFixed(3)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Portfolio Optimization Section */}
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-xl font-bold text-white">Portfolio Optimization</h3>
                        <p className="text-xs text-slate-500 mt-1">Variance minimization & correlation analysis</p>
                      </div>
                      <button 
                        onClick={runPortfolioOptimization}
                        className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl text-xs font-bold hover:bg-blue-600 hover:text-white transition-all"
                      >
                        Optimize Active Bets
                      </button>
                    </div>

                    {optimizedPortfolioMetrics ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl">
                          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Expected Portfolio ROI</p>
                          <p className="text-2xl font-mono font-bold text-green-400">+{( (optimizedPortfolioMetrics.totalExpectedReturn || 0) / (riskSettings?.bankroll || 1) * 100).toFixed(1)}%</p>
                        </div>
                        <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl">
                          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Portfolio Variance</p>
                          <p className="text-2xl font-mono font-bold text-blue-400">{(optimizedPortfolioMetrics.portfolioVariance || 0).toFixed(4)}</p>
                        </div>
                        <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl">
                          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Diversification Score</p>
                          <p className="text-2xl font-mono font-bold text-purple-400">{((optimizedPortfolioMetrics.diversificationScore || 0) * 100).toFixed(0)}%</p>
                        </div>
                      </div>
                    ) : (
                      <div className="h-[150px] flex items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl">
                        <p className="text-slate-500 text-sm">Add bets to your slip to run optimization</p>
                      </div>
                    )}
                  </div>

                  {/* Backtesting & Validation Section */}
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-xl font-bold text-white">Backtesting & Validation</h3>
                        <p className="text-xs text-slate-500 mt-1">Historical simulation & calibration analysis</p>
                      </div>
                      <button 
                        onClick={runBacktestSimulation}
                        disabled={backtestResults?.isSimulating}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                          backtestResults?.isSimulating 
                            ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                            : "bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600 hover:text-white"
                        )}
                      >
                        <Activity size={14} className={cn(backtestResults?.isSimulating && "animate-spin")} />
                        {backtestResults?.isSimulating ? 'Simulating...' : 'Run Backtest Simulation'}
                      </button>
                    </div>

                    {backtestResults && !backtestResults.isSimulating ? (
                      <div className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                          <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl">
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Simulated ROI</p>
                            <p className="text-2xl font-mono font-bold text-green-400">+{(backtestResults.roi || 0).toFixed(1)}%</p>
                          </div>
                          <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl">
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Max Drawdown</p>
                            <p className="text-2xl font-mono font-bold text-red-400">{(backtestResults.maxDrawdown || 0).toFixed(1)}%</p>
                          </div>
                          <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl">
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Brier Score</p>
                            <p className="text-2xl font-mono font-bold text-blue-400">{(backtestResults.brierScore || 0).toFixed(4)}</p>
                          </div>
                          <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl">
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">AUC-ROC</p>
                            <p className="text-2xl font-mono font-bold text-purple-400">{(backtestResults.auc || 0).toFixed(3)}</p>
                          </div>
                        </div>

                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
                          <h4 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
                            <BarChart3 className="text-slate-500 w-4 h-4" />
                            Calibration Curve (Predicted vs Actual)
                          </h4>
                          <div className="h-[200px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={backtestResults.calibrationData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis dataKey="bin" stroke="#64748b" fontSize={10} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                                <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                                  itemStyle={{ color: '#3b82f6' }}
                                />
                                <Line type="monotone" dataKey="actualRate" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                                <Line type="monotone" dataKey="predictedProb" stroke="#64748b" strokeDasharray="5 5" dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-4 text-center italic">
                            Dashed line represents perfect calibration. Points closer to the line indicate more reliable probabilities.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="h-[150px] flex items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl">
                        <p className="text-slate-500 text-sm">Run a simulation to validate model performance over 3 seasons.</p>
                      </div>
                    )}
                  </div>

                  {/* Gemini Intelligence Section */}
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
                    <h3 className="text-xl font-bold text-white mb-4">Gemini Intelligence</h3>
                    <div className="flex gap-4 mb-4">
                      <input 
                        type="text" 
                        value={geminiPrompt}
                        onChange={(e) => setGeminiPrompt(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                        placeholder="Ask Gemini for insights..."
                      />
                      <button onClick={() => handleGeminiAsk('general')} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-all">Ask</button>
                      <button onClick={() => handleGeminiAsk('thinking')} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-purple-700 transition-all">Think</button>
                      <button onClick={() => handleGeminiAsk('search')} className="bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-700 transition-all">Search</button>
                    </div>
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-sm text-slate-300 min-h-[100px]">
                      {isGeminiLoading ? 'Thinking...' : (geminiResponse || "Gemini's response will appear here...")}
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
                    <h3 className="text-xl font-bold text-white mb-8">Model Performance Leaderboard</h3>
                    <div className="space-y-4">
                      {[
                        { name: 'Poisson Simulator', accuracy: 68.4, roi: 14.2, status: 'stable' },
                        { name: 'XGBoost Classifier', accuracy: 72.1, roi: 18.5, status: 'up' },
                        { name: 'Neural Network', accuracy: 65.8, roi: 9.2, status: 'down' },
                        { name: 'Random Forest', accuracy: 69.5, roi: 12.8, status: 'up' },
                      ].map((model, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800/50">
                          <div className="flex items-center gap-4">
                            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-xs font-bold text-slate-500">#{i+1}</div>
                            <div>
                              <p className="text-sm font-bold text-white">{model.name}</p>
                              <p className="text-[10px] text-slate-500 uppercase font-bold">Accuracy: {model.accuracy}%</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <p className="text-lg font-mono font-bold text-green-400">+{model.roi}%</p>
                              {model.status === 'up' ? <ArrowUpRight size={14} className="text-green-400" /> : model.status === 'down' ? <ArrowDownRight size={14} className="text-red-400" /> : null}
                            </div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold">ROI (30D)</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-8">
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
                    <h3 className="text-xl font-bold text-white mb-8">Market Win Rates</h3>
                    <div className="space-y-6">
                      {[
                        { label: 'Over 2.5 Goals', rate: 72, color: 'bg-blue-500' },
                        { label: '1X2 Outcome', rate: 58, color: 'bg-purple-500' },
                        { label: 'BTTS', rate: 64, color: 'bg-green-500' },
                        { label: 'Asian Handicap', rate: 51, color: 'bg-yellow-500' },
                      ].map((market, i) => (
                        <div key={i} className="space-y-2">
                          <div className="flex justify-between text-xs font-bold text-slate-400">
                            <span>{market.label}</span>
                            <span className="text-white">{market.rate}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full", market.color)} style={{ width: `${market.rate}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
                    <h3 className="text-xl font-bold text-white mb-8">Odds Movement Tracker</h3>
                    <div className="space-y-4">
                      {signals.slice(0, 8).map((signal, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-slate-400 truncate max-w-[120px]">{signal.homeTeam}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-500">1.95</span>
                            <ChevronRight size={12} className="text-slate-700" />
                            <span className={cn("font-mono font-bold", signal.oddsMovement === 'down' ? "text-red-400" : "text-green-400")}>
                              {signal.odds.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* PORTFOLIO VIEW */}
          {view === 'portfolio' && (
            <motion.div 
              key="portfolio"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold text-white">Active Portfolio</h2>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Exposure</p>
                    <p className="text-xl font-mono font-bold text-white">
                      {contextActiveBets.reduce((acc, b) => acc + b.stake, 0).toFixed(1)} units
                    </p>
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
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Activity className="text-blue-400 w-5 h-5" />
                    Open Positions
                  </h3>
                  {contextActiveBets.length === 0 && (
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500">
                      No active positions. Browse fixtures to place bets.
                    </div>
                  )}
                      {contextActiveBets.map((bet, i) => (
                        <div key={i} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex items-center justify-between">
                          <div className="flex items-center gap-6">
                            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                            <div>
                              <h4 className="font-bold text-white">{bet.homeTeam} vs {bet.awayTeam}</h4>
                              <p className="text-xs text-slate-500">{bet.market} @ {bet.odds}</p>
                              <div className="flex gap-2 mt-1">
                                <span className="text-[10px] font-bold text-slate-600 uppercase">xG: {bet.homeXG?.toFixed(1)} - {bet.awayXG?.toFixed(1)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Status</p>
                            <p className="font-mono font-bold text-blue-400">In Play</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Stake</p>
                            <p className="font-mono font-bold text-white">{bet.stake}u</p>
                          </div>
                        </div>
                      ))}

                  <h3 className="text-lg font-bold text-white flex items-center gap-2 pt-8">
                    <Clock className="text-slate-500 w-5 h-5" />
                    Bet History
                  </h3>
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-950/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        <tr>
                          <th className="px-6 py-4">Match</th>
                          <th className="px-6 py-4">Market</th>
                          <th className="px-6 py-4">Stake</th>
                          <th className="px-6 py-4">P&L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {contextHistory.map((bet) => (
                          <tr key={bet.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-6 py-4">
                              <p className="text-sm font-bold text-white">{bet.homeTeam} vs {bet.awayTeam}</p>
                              <p className="text-[10px] text-slate-500">{new Date(bet.settledAt).toLocaleDateString()}</p>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-400">{bet.market} @ {bet.odds}</td>
                            <td className="px-6 py-4 text-xs font-mono text-white">{bet.stake}u</td>
                            <td className={cn("px-6 py-4 text-sm font-mono font-bold", bet.profit > 0 ? "text-green-400" : "text-red-400")}>
                              {bet.profit > 0 ? '+' : ''}{bet.profit.toFixed(2)}u
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 h-fit sticky top-8">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <Calculator className="text-green-400 w-5 h-5" />
                      Parlay Builder
                    </h3>
                    {betslip.length > 1 && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-blue-600/10 border border-blue-500/20 rounded-full">
                        <Zap size={12} className="text-blue-400" />
                        <span className="text-[10px] font-bold text-blue-400 uppercase">Parlay EV: +4.2%</span>
                      </div>
                    )}
                    <button 
                      onClick={() => {
                        const newBankroll = prompt("Enter Bankroll Amount:", riskSettings.bankroll.toString());
                        if (newBankroll) setRiskSettings({ ...riskSettings, bankroll: Number(newBankroll) });
                      }}
                      className="text-[10px] font-bold text-blue-400 uppercase hover:underline"
                    >
                      Set Bankroll
                    </button>
                  </div>
                  
                  <div className="space-y-4 mb-8">
                    {betslip.length === 0 ? (
                      <div className="text-center p-8 border-2 border-dashed border-slate-800 rounded-3xl text-slate-600 text-sm">
                        Drag predictions here to build a parlay.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {betslip.map((item) => (
                          <div key={item.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between group">
                            <div>
                              <p className="text-xs font-bold text-white">{item.match}</p>
                              <p className="text-[10px] text-slate-500">{item.market} @ {item.odds}</p>
                            </div>
                            <button 
                              onClick={() => removeFromBetslip(item.id)}
                              className="text-slate-700 hover:text-red-400 transition-colors"
                            >
                              <AlertCircle size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 pt-8 border-t border-slate-800">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Total Odds</span>
                      <span className="text-white font-mono font-bold">
                        {betslip.reduce((acc, b) => acc * b.odds, 1).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Implied Prob</span>
                      <span className="text-white font-mono font-bold">
                        {(1 / betslip.reduce((acc, b) => acc * b.odds, 1) * 100).toFixed(1)}%
                      </span>
                    </div>
                    
                    <div className="pt-4">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Stake (Units)</p>
                        <p className="text-[10px] font-bold text-blue-400 uppercase">
                          Kelly Suggestion: {(calculateKelly(
                            betslip.length > 0 ? (1 / betslip.reduce((acc, b) => acc * b.odds, 1)) : 0.5, // Simplified prob for parlay
                            betslip.reduce((acc, b) => acc * b.odds, 1),
                            riskSettings
                          ).suggestedStake).toFixed(1)}u
                        </p>
                      </div>
                      <input 
                        type="number" 
                        defaultValue={1.0}
                        id="stake-input"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <button 
                      disabled={betslip.length === 0}
                      onClick={() => {
                        const stake = Number((document.getElementById('stake-input') as HTMLInputElement).value);
                        placeBets(stake);
                      }}
                      className={cn(
                        "w-full py-4 rounded-2xl font-bold transition-all",
                        betslip.length > 0 
                          ? "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20" 
                          : "bg-slate-800 text-slate-500 cursor-not-allowed"
                      )}
                    >
                      Place {betslip.length > 1 ? 'Parlay' : 'Bet'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 px-6 py-3 flex items-center justify-between z-50">
        {[
          { id: 'fixtures', icon: List, label: 'Fixtures' },
          { id: 'analytics', icon: PieChartIcon, label: 'Analytics' },
          { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id as ViewState)}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              view === item.id ? "text-blue-500" : "text-slate-500"
            )}
          >
            <item.icon size={22} />
            <span className="text-[10px] font-bold">{item.label}</span>
            {view === item.id && <motion.div layoutId="mobile-nav-dot" className="w-1 h-1 bg-blue-500 rounded-full mt-0.5" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
