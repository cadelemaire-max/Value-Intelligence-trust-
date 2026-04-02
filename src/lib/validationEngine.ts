/**
 * Testing & Validation Engine
 * 
 * Implements advanced metrics for prediction accuracy, 
 * calibration, and backtesting simulation.
 */

export interface ValidationMetric {
  name: string;
  value: number;
  description: string;
  trend: 'up' | 'down' | 'stable';
}

export interface CalibrationPoint {
  bin: number; // e.g., 0.1, 0.2...
  predictedProb: number;
  actualRate: number;
  count: number;
}

export class ValidationEngine {
  /**
   * 1. Brier Score (Mean Squared Error)
   * Measures the accuracy of probabilistic predictions.
   */
  public static calculateBrierScore(predictions: { prob: number, outcome: number }[]): number {
    if (predictions.length === 0) return 0;
    const sum = predictions.reduce((acc, p) => acc + Math.pow(p.prob - p.outcome, 2), 0);
    return sum / predictions.length;
  }

  /**
   * 2. Log Loss (Cross-Entropy)
   * Penalizes confident wrong predictions more heavily.
   */
  public static calculateLogLoss(predictions: { prob: number, outcome: number }[]): number {
    if (predictions.length === 0) return 0;
    const epsilon = 1e-15; // To avoid log(0)
    const sum = predictions.reduce((acc, p) => {
      const prob = Math.max(epsilon, Math.min(1 - epsilon, p.prob));
      return acc - (p.outcome * Math.log(prob) + (1 - p.outcome) * Math.log(1 - prob));
    }, 0);
    return sum / predictions.length;
  }

  /**
   * 3. Calibration Curve Data
   * Groups predictions into bins to see if "70% likely" events happen 70% of the time.
   */
  public static generateCalibrationData(predictions: { prob: number, outcome: number }[], bins: number = 10): CalibrationPoint[] {
    const results: CalibrationPoint[] = Array.from({ length: bins }, (_, i) => ({
      bin: (i + 1) / bins,
      predictedProb: 0,
      actualRate: 0,
      count: 0
    }));

    predictions.forEach(p => {
      const binIdx = Math.min(Math.floor(p.prob * bins), bins - 1);
      results[binIdx].predictedProb += p.prob;
      results[binIdx].actualRate += p.outcome;
      results[binIdx].count += 1;
    });

    return results.map(r => ({
      ...r,
      predictedProb: r.count > 0 ? r.predictedProb / r.count : r.bin - (0.5 / bins),
      actualRate: r.count > 0 ? r.actualRate / r.count : 0
    }));
  }

  /**
   * 4. ROI Simulation (Backtesting)
   * Simulates betting strategy over historical data.
   */
  public static simulateROI(
    history: { prob: number, odds: number, outcome: number }[],
    kellyFraction: number = 0.25,
    initialBankroll: number = 1000
  ): { finalBankroll: number, roi: number, maxDrawdown: number } {
    let bankroll = initialBankroll;
    let peak = initialBankroll;
    let maxDrawdown = 0;

    history.forEach(bet => {
      const edge = (bet.prob * bet.odds) - 1;
      if (edge > 0.02) { // 2% Edge Filter
        const b = bet.odds - 1;
        const p = bet.prob;
        const q = 1 - p;
        const fullKelly = (b * p - q) / b;
        const stake = Math.max(0, Math.min(0.05, fullKelly * kellyFraction)) * bankroll;
        
        if (bet.outcome === 1) {
          bankroll += stake * b;
        } else {
          bankroll -= stake;
        }

        peak = Math.max(peak, bankroll);
        const dd = (peak - bankroll) / peak;
        maxDrawdown = Math.max(maxDrawdown, dd);
      }
    });

    return {
      finalBankroll: bankroll,
      roi: ((bankroll - initialBankroll) / initialBankroll) * 100,
      maxDrawdown: maxDrawdown * 100
    };
  }

  /**
   * 5. AUC-ROC Approximation
   * Measures discrimination ability (how well model separates winners from losers).
   */
  public static calculateAUC(predictions: { prob: number, outcome: number }[]): number {
    if (predictions.length < 2) return 0.5;
    
    const sorted = [...predictions].sort((a, b) => b.prob - a.prob);
    const positives = sorted.filter(p => p.outcome === 1);
    const negatives = sorted.filter(p => p.outcome === 0);
    
    if (positives.length === 0 || negatives.length === 0) return 0.5;

    let count = 0;
    positives.forEach(pos => {
      negatives.forEach(neg => {
        if (pos.prob > neg.prob) count += 1;
        else if (pos.prob === neg.prob) count += 0.5;
      });
    });

    return count / (positives.length * negatives.length);
  }
}
