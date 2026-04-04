import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PredictionSignal, PortfolioMetrics, CalibrationPoint } from '../types';

interface PerformanceMetrics {
  roi: number;
  winRate: number;
  profitFactor: number;
  brierScore: number;
  totalBets: number;
  auc: number;
}

interface BettingContextType {
  activeBets: any[];
  betHistory: any[];
  performance: PerformanceMetrics | null;
  results: any[];
  placeBet: (bet: any) => Promise<void>;
  refreshData: () => Promise<void>;
  isLoading: boolean;
}

const BettingContext = createContext<BettingContextType | undefined>(undefined);

export const BettingProvider = ({ children }: { children: ReactNode }) => {
  const [activeBets, setActiveBets] = useState<any[]>([]);
  const [betHistory, setBetHistory] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshData = async () => {
    try {
      const [activeRes, historyRes, perfRes] = await Promise.all([
        fetch('/api/bets/active'),
        fetch('/api/bets/history'),
        fetch('/api/performance/real-time'),
      ]);
      const resultsRes = await fetch('/api/results');

      const active = await activeRes.json();
      const history = await historyRes.json();
      const perf = await perfRes.json();
      const resultData = await resultsRes.json();

      setActiveBets(active);
      setBetHistory(history);
      setPerformance(perf);
      setResults(resultData);
    } catch (error) {
      console.error("Error refreshing betting data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const placeBet = async (bet: any) => {
    try {
      const res = await fetch('/api/bets/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bet)
      });
      if (res.ok) {
        await refreshData();
      }
    } catch (error) {
      console.error("Error placing bet:", error);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <BettingContext.Provider value={{ activeBets, betHistory, performance, results, placeBet, refreshData, isLoading }}>
      {children}
    </BettingContext.Provider>
  );
};

export const useBetting = () => {
  const context = useContext(BettingContext);
  if (context === undefined) {
    throw new Error('useBetting must be used within a BettingProvider');
  }
  return context;
};
