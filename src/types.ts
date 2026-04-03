export interface HistoricalMatch {
  league: string;
  league_name: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  total_goals: number;
  over_2_5: number;
  btts: number;
  date?: string; // We'll add dummy dates
}

export interface TeamMetrics {
  team: string;
  matchesPlayed: number;
  winRate: number;
  avgGoalsScored: number;
  avgGoalsConceded: number;
  form: ('W' | 'D' | 'L')[];
  bttsRate: number;
  over25Rate: number;
  strengthRating: number; // (avg_goals_for / avg_goals_against ratio)
}

export interface H2HSummary {
  team1: string;
  team2: string;
  team1Wins: number;
  team2Wins: number;
  draws: number;
  matches: HistoricalMatch[];
}

export interface ComparisonMetrics {
  label: string;
  team1Value: number | string;
  team2Value: number | string;
  better: 'team1' | 'team2' | 'none';
}

export interface MonteCarloResult {
  homeWin: number;
  draw: number;
  awayWin: number;
  expectedGoals: { home: number; away: number };
  scoreDistribution: { score: string; probability: number }[];
}

export interface MatchInsights {
  headline: string;
  explanation: string;
  riskWarning: string;
  recommendedMarket: string;
  bayesianReasoning: string;
}

export interface LeagueStat {
  team: string;
  matchesPlayed: number;
  winRate: number;
  avgGoalsScored: number;
  avgGoalsConceded: number;
  form: ('W' | 'D' | 'L')[];
  bttsRate: number;
  over25Rate: number;
  strengthRating: number;
}

export interface PredictionSignal {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  market: string;
  probability: number;
  odds: number;
  ev: number;
  kelly: number;
  confidence: number;
  agreement: number;
  kickoffTime: string;
  oddsMovement: 'up' | 'down' | 'stable';
  status?: string;
  score?: {
    home: number | null;
    away: number | null;
  };
  homeXG?: number;
  awayXG?: number;
}

export interface PortfolioMetrics {
  totalExpectedReturn: number;
  portfolioVariance: number;
  diversificationScore: number;
}

export interface CalibrationPoint {
  bin: number;
  actualRate: number;
  predictedProb: number;
}

export type ViewState = 'fixtures' | 'detail' | 'analytics' | 'portfolio';
