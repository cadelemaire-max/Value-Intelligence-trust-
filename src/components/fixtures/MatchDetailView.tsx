import React from 'react';
import { motion } from 'framer-motion';
import MatchDetailPage from '../MatchDetailPage';
import { PredictionSignal, HistoricalMatch, TeamMetrics, H2HSummary, MonteCarloResult, MatchInsights } from '../../types';

interface MatchDetailViewProps {
  selectedMatch: PredictionSignal;
  matchData: {
    homeMetrics: TeamMetrics;
    awayMetrics: TeamMetrics;
    h2h: H2HSummary;
    similarMatches: HistoricalMatch[];
  } | null;
  historicalMatches: HistoricalMatch[];
  monteCarloResult: MonteCarloResult | null;
  matchInsights: MatchInsights | null;
  isSimulating: boolean;
  mlPrediction: any;
  liveOdds: any;
  onRunSimulation: () => void;
  onBack: () => void;
}

const MatchDetailView: React.FC<MatchDetailViewProps> = ({
  selectedMatch,
  matchData,
  historicalMatches,
  monteCarloResult,
  matchInsights,
  isSimulating,
  mlPrediction,
  liveOdds,
  onRunSimulation,
  onBack
}) => {
  return (
    <motion.div 
      key="detail"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      {matchData ? (
        <MatchDetailPage 
          homeTeam={selectedMatch.homeTeam}
          awayTeam={selectedMatch.awayTeam}
          status={selectedMatch.status}
          score={selectedMatch.score}
          historicalMatches={historicalMatches}
          homeMetrics={matchData.homeMetrics}
          awayMetrics={matchData.awayMetrics}
          h2h={matchData.h2h}
          similarMatches={matchData.similarMatches}
          monteCarloResult={monteCarloResult}
          matchInsights={matchInsights}
          isSimulating={isSimulating}
          mlPrediction={mlPrediction}
          liveOdds={liveOdds}
          onRunSimulation={onRunSimulation}
          onBack={onBack}
        />
      ) : (
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </motion.div>
  );
};

export default MatchDetailView;
