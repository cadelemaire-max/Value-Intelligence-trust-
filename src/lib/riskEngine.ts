/**
 * Risk Management & Kelly Criterion Engine
 * 
 * Implements advanced bet sizing and portfolio risk metrics.
 */

export interface RiskSettings {
  bankroll: number;
  fractionalKelly: number; // e.g., 0.25 for Quarter Kelly
  maxBetPercentage: number; // e.g., 0.05 for 5% max
  minEdgeThreshold: number; // e.g., 0.02 for 2%
  minConfidenceFloor: number; // e.g., 0.65 for 65%
}

export interface KellyResult {
  fraction: number;
  suggestedStake: number;
  edge: number;
  isRecommended: boolean;
  reason?: string;
}

/**
 * Advanced Kelly Criterion Calculation
 * f* = (bp - q) / b
 * where b = odds - 1, p = win_prob, q = 1 - p
 */
export function calculateKelly(
  winProb: number,
  odds: number,
  settings: RiskSettings,
  modelAgreement: number = 1.0
): KellyResult {
  const b = odds - 1;
  const p = winProb;
  const q = 1 - p;
  
  // 1. Raw Kelly
  const rawKelly = (b * p - q) / b;
  
  // 2. Edge Calculation
  const edge = (p * odds) - 1;
  
  // 3. Validation Logic
  let isRecommended = true;
  let reason = "Optimal Value";

  if (edge < settings.minEdgeThreshold) {
    isRecommended = false;
    reason = "Insufficient Edge";
  }
  
  if (modelAgreement < settings.minConfidenceFloor) {
    isRecommended = false;
    reason = "Low Model Consensus";
  }

  if (rawKelly <= 0) {
    return { fraction: 0, suggestedStake: 0, edge, isRecommended: false, reason: "Negative EV" };
  }

  // 4. Optimization Layers
  // Fractional Kelly for variance reduction
  let optimizedKelly = rawKelly * settings.fractionalKelly;
  
  // Confidence Scaling (reduce stake if models disagree)
  optimizedKelly *= modelAgreement;

  // Max Bet Constraint
  const finalFraction = Math.min(optimizedKelly, settings.maxBetPercentage);
  const suggestedStake = finalFraction * settings.bankroll;

  return {
    fraction: finalFraction,
    suggestedStake,
    edge,
    isRecommended,
    reason
  };
}

/**
 * Multi-leg Parlay Kelly
 * Treats the parlay as a single bet with combined odds and probability.
 */
export function calculateParlayKelly(
  legs: { prob: number; odds: number }[],
  settings: RiskSettings
): KellyResult {
  const combinedProb = legs.reduce((acc, leg) => acc * leg.prob, 1);
  const combinedOdds = legs.reduce((acc, leg) => acc * leg.odds, 1);
  
  return calculateKelly(combinedProb, combinedOdds, settings);
}

/**
 * Risk Metrics Calculations
 */
export function calculatePortfolioMetrics(history: any[]) {
  if (history.length === 0) return { sharpe: 0, variance: 0, maxDrawdown: 0 };

  const returns = history.map(h => h.profit / h.stake);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  
  // Variance
  const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  // Sharpe Ratio (assuming 0 risk-free rate for simplicity)
  const sharpe = stdDev === 0 ? 0 : avgReturn / stdDev;

  // Max Drawdown
  let peak = 0;
  let currentBalance = 0;
  let maxDD = 0;
  
  history.forEach(h => {
    currentBalance += h.profit;
    if (currentBalance > peak) peak = currentBalance;
    const dd = peak === 0 ? 0 : (peak - currentBalance) / peak;
    if (dd > maxDD) maxDD = dd;
  });

  return {
    sharpe,
    variance,
    maxDrawdown: maxDD
  };
}
