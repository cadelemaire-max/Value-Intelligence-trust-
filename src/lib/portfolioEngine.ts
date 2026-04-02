/**
 * Portfolio Optimization & Betting Strategy Engine
 * 
 * Mathematical frameworks for portfolio variance minimization, 
 * correlation analysis, and ROI maximization.
 */

export interface PortfolioBet {
  id: string;
  match: string;
  market: string;
  probability: number;
  odds: number;
  edge: number;
  kellyStake: number;
  correlationGroup?: string; // e.g., "Premier League", "Over/Under"
}

export interface PortfolioMetrics {
  totalExpectedReturn: number;
  portfolioVariance: number;
  diversificationScore: number;
  maxPotentialDrawdown: number;
  optimizedStakes: Record<string, number>;
}

export class PortfolioEngine {
  /**
   * 1. Correlation Analysis
   * Adjusts stakes based on group exposure to minimize variance.
   */
  public static calculateCorrelations(bets: PortfolioBet[]): Record<string, number> {
    const groups: Record<string, number> = {};
    bets.forEach(bet => {
      if (bet.correlationGroup) {
        groups[bet.correlationGroup] = (groups[bet.correlationGroup] || 0) + 1;
      }
    });
    return groups;
  }

  /**
   * 2. Portfolio Optimization (Correlation-Adjusted Kelly)
   * Adjusts Kelly stakes based on a correlation matrix to prevent over-leverage.
   * 
   * Formula: Adjusted Stake = Kelly Stake / (1 + Sum(Correlation_ij * Stake_j))
   */
  public static optimizePortfolio(
    bets: PortfolioBet[], 
    bankroll: number,
    correlationMatrix: Record<string, Record<string, number>> = {},
    maxExposurePerGroup: number = 0.25
  ): PortfolioMetrics {
    const optimizedStakes: Record<string, number> = {};
    let totalExpectedReturn = 0;
    let portfolioVariance = 0;
    
    // Group exposure tracking
    const groupExposure: Record<string, number> = {};

    // First pass: Calculate initial Kelly stakes and apply group constraints
    const initialStakes = bets.map(bet => {
      let stake = bet.kellyStake;
      
      if (bet.correlationGroup) {
        const currentGroupExposure = groupExposure[bet.correlationGroup] || 0;
        if (currentGroupExposure + stake > maxExposurePerGroup) {
          stake = Math.max(0, maxExposurePerGroup - currentGroupExposure);
        }
        groupExposure[bet.correlationGroup] = (groupExposure[bet.correlationGroup] || 0) + stake;
      }
      return { ...bet, initialStake: stake };
    });

    // Second pass: Adjust for correlations
    initialStakes.forEach((bet, i) => {
      let correlationPenalty = 0;
      
      initialStakes.forEach((otherBet, j) => {
        if (i === j) return;
        
        // Check correlation matrix for specific pair (bidirectional)
        const corr = correlationMatrix[bet.id]?.[otherBet.id] || 
                     correlationMatrix[otherBet.id]?.[bet.id] || 
                     0;
        
        correlationPenalty += corr * otherBet.initialStake;
      });

      // Adjust stake: f_adj = f / (1 + penalty)
      const adjustedStake = bet.initialStake / (1 + correlationPenalty);
      optimizedStakes[bet.id] = adjustedStake;
      
      totalExpectedReturn += (adjustedStake * bankroll * bet.edge);
      portfolioVariance += Math.pow(adjustedStake, 2) * bet.probability * (1 - bet.probability) * Math.pow(bet.odds, 2);
    });

    return {
      totalExpectedReturn,
      portfolioVariance,
      diversificationScore: Object.keys(groupExposure).length / (bets.length || 1),
      maxPotentialDrawdown: Object.values(optimizedStakes).reduce((a, b) => a + b, 0),
      optimizedStakes
    };
  }

  /**
   * 3. Parlay Optimization
   * Calculates implied odds and EV preservation for multi-leg bets.
   */
  public static optimizeParlay(legs: { prob: number, odds: number }[]): { 
    combinedOdds: number, 
    combinedProb: number, 
    combinedEV: number,
    isViable: boolean 
  } {
    const combinedOdds = legs.reduce((acc, leg) => acc * leg.odds, 1);
    const combinedProb = legs.reduce((acc, leg) => acc * leg.prob, 1);
    const combinedEV = (combinedProb * combinedOdds) - 1;
    
    // Parlay rejection threshold: EV must be positive and > 1%
    const isViable = combinedEV > 0.01;

    return {
      combinedOdds,
      combinedProb,
      combinedEV,
      isViable
    };
  }

  /**
   * 4. Market Efficiency Detection
   * Identifies "blind spots" where model deviates significantly from market.
   */
  public static detectBlindSpots(actualResults: { 
    predictedProb: number, 
    actualOutcome: boolean 
  }[]): number {
    if (actualResults.length === 0) return 0;
    
    // Brier Score calculation: Mean Squared Error
    const brierScore = actualResults.reduce((acc, res) => {
      const outcome = res.actualOutcome ? 1 : 0;
      return acc + Math.pow(res.predictedProb - outcome, 2);
    }, 0) / actualResults.length;

    return brierScore;
  }
}
