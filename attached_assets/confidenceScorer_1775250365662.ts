// src/services/analysis/confidenceScorer.ts
import { MatchEvent, EventType } from '../events/eventProcessor';
import { ProbabilityState } from './dynamicProbabilityEngine';
import { MomentumScore } from './momentumDetector';
import { Server as SocketServer } from 'socket.io';

export interface ConfidenceScore {
  fixtureId: number;
  timestamp: number;
  minute: number;
  overallConfidence: number; // 0-100
  predictionConfidence: number; // How confident in the current prediction
  dataConfidence: number; // How much data we have
  stabilityScore: number; // How stable the prediction is
  riskScore: number; // 0-100 (higher = more risky)
  breakingPoints: string[]; // Key moments that could shift prediction
  warningLevel: 'low' | 'medium' | 'high'; // Risk warning
  factors: {
    scoreCertainty: number;
    eventClarity: number;
    marketAgreement: number;
    momentumClarity: number;
  };
}

export interface RiskAssessment {
  fixtureId: number;
  timestamp: number;
  minute: number;
  accumulatorRisk: number; // 0-100
  singleBetRisk: number; // 0-100
  drawRisk: number; // 0-100
  keyRisks: string[];
  safeHarbor?: string; // Recommended safe bet if risky
}

export interface BreakingPoint {
  description: string;
  probability: number; // 0-1
  impact: number; // How much it would shift odds
  minuteRange: string;
}

export class ConfidenceScorer {
  private confidenceHistory: Map<number, ConfidenceScore[]> = new Map();
  private io: SocketServer;

  constructor(io: SocketServer) {
    this.io = io;
  }

  /**
   * Calculate comprehensive confidence score
   */
  calculateConfidence(
    fixtureId: number,
    probabilities: ProbabilityState,
    momentum: { home: MomentumScore; away: MomentumScore },
    events: MatchEvent[],
    minute: number,
    marketAgreement: number // 0-1 indicating how much market agrees with model
  ): ConfidenceScore {
    // Component confidence scores
    const scoreCertainty = this.calculateScoreCertainty(
      probabilities.homeScore,
      probabilities.awayScore,
      minute
    );

    const eventClarity = this.calculateEventClarity(events);

    const stabilityScore = this.calculateStabilityScore(
      probabilities.confidence,
      eventClarity
    );

    const momentumClarity = this.calculateMomentumClarity(momentum);

    // Overall confidence is weighted combination
    const overallConfidence = Math.round(
      scoreCertainty * 0.25 +
        eventClarity * 0.25 +
        stabilityScore * 0.25 +
        momentumClarity * 0.15 +
        (marketAgreement * 100) * 0.1
    );

    // Risk score (inverse of prediction confidence)
    const riskScore = Math.round(100 - probabilities.confidence * 100);

    // Identify breaking points
    const breakingPoints = this.identifyBreakingPoints(
      probabilities,
      momentum,
      minute
    );

    // Warning level
    const warningLevel = this.assessWarningLevel(
      overallConfidence,
      riskScore,
      breakingPoints
    );

    const score: ConfidenceScore = {
      fixtureId,
      timestamp: Date.now(),
      minute,
      overallConfidence,
      predictionConfidence: Math.round(probabilities.confidence * 100),
      dataConfidence: Math.round(
        Math.min(100, (events.length / 100) * 100)
      ),
      stabilityScore: Math.round(stabilityScore),
      riskScore,
      breakingPoints,
      warningLevel,
      factors: {
        scoreCertainty: Math.round(scoreCertainty),
        eventClarity: Math.round(eventClarity),
        marketAgreement: Math.round(marketAgreement * 100),
        momentumClarity: Math.round(momentumClarity),
      },
    };

    // Store history
    if (!this.confidenceHistory.has(fixtureId)) {
      this.confidenceHistory.set(fixtureId, []);
    }
    this.confidenceHistory.get(fixtureId)!.push(score);

    // Emit update
    this.io.emit('confidence-update', {
      fixtureId,
      score,
    });

    return score;
  }

  /**
   * Calculate score certainty (how clear who's winning)
   */
  private calculateScoreCertainty(
    homeScore: number,
    awayScore: number,
    minute: number
  ): number {
    const scoreDiff = Math.abs(homeScore - awayScore);

    if (minute < 30) {
      // Early game: score matters less
      return 20 + scoreDiff * 5;
    } else if (minute < 70) {
      // Mid game: score matters more
      return 30 + scoreDiff * 10;
    } else {
      // Late game: score is very significant
      return 40 + scoreDiff * 15;
    }
  }

  /**
   * Calculate event clarity (recent activity level)
   */
  private calculateEventClarity(events: MatchEvent[]): number {
    const recentEvents = events.slice(-20);

    // More recent events = clearer picture
    if (recentEvents.length < 5) return 20;
    if (recentEvents.length < 10) return 40;
    if (recentEvents.length < 15) return 60;
    return 80;
  }

  /**
   * Calculate stability of predictions
   */
  private calculateStabilityScore(confidence: number, eventClarity: number): number {
    // High confidence + high event clarity = stable
    return (confidence * 100 + eventClarity) / 2;
  }

  /**
   * Calculate momentum clarity
   */
  private calculateMomentumClarity(momentum: {
    home: MomentumScore;
    away: MomentumScore;
  }): number {
    const homeMomentum = Math.abs(momentum.home.score);
    const awayMomentum = Math.abs(momentum.away.score);

    // Clear momentum direction = higher clarity
    if (Math.abs(homeMomentum - awayMomentum) > 40) {
      return 80;
    } else if (Math.abs(homeMomentum - awayMomentum) > 20) {
      return 60;
    }
    return 40;
  }

  /**
   * Identify breaking points (events that could shift prediction)
   */
  private identifyBreakingPoints(
    probabilities: ProbabilityState,
    momentum: { home: MomentumScore; away: MomentumScore },
    minute: number
  ): string[] {
    const points: string[] = [];

    // Check if prediction is close to even
    if (Math.abs(probabilities.homeWinProb - probabilities.awayWinProb) < 0.1) {
      points.push('Outcome still highly uncertain');
    }

    // Check if score difference is small
    const scoreDiff = Math.abs(probabilities.homeScore - probabilities.awayScore);
    if (scoreDiff <= 1 && minute > 60) {
      points.push('Close score late in match - vulnerable to change');
    }

    // Check momentum shifts
    if (momentum.home.trend === 'positive' && momentum.away.trend === 'positive') {
      points.push('Both teams gaining momentum - unpredictable');
    }

    // Check for high-risk positions
    if (momentum.home.riskLevel === 'high' || momentum.away.riskLevel === 'high') {
      points.push('One team defensively vulnerable');
    }

    // Late game scenarios
    if (minute > 75 && Math.abs(probabilities.homeWinProb - 0.5) < 0.2) {
      points.push('Late game with uncertain outcome');
    }

    return points.slice(0, 3);
  }

  /**
   * Assess warning level
   */
  private assessWarningLevel(
    confidence: number,
    riskScore: number,
    breakingPoints: string[]
  ): 'low' | 'medium' | 'high' {
    if (confidence > 70 && riskScore < 30 && breakingPoints.length === 0) {
      return 'low';
    } else if (confidence > 50 && riskScore < 50) {
      return 'medium';
    }
    return 'high';
  }

  /**
   * Calculate risk assessment for betting
   */
  calculateBettingRisk(
    fixtureId: number,
    probabilities: ProbabilityState,
    momentum: { home: MomentumScore; away: MomentumScore },
    events: MatchEvent[],
    minute: number
  ): RiskAssessment {
    // Accumulator risk: higher if prediction is uncertain
    const accumulatorRisk = Math.round(
      (1 - probabilities.confidence) * 100 +
        Math.max(momentum.home.riskLevel === 'high' ? 20 : 0,
          momentum.away.riskLevel === 'high' ? 20 : 0)
    );

    // Single bet risk: depends on the specific outcome
    const worstProb = Math.min(
      probabilities.homeWinProb,
      probabilities.drawProb,
      probabilities.awayWinProb
    );
    const singleBetRisk = Math.round((1 - worstProb) * 100 + ((100 - minute) / 90) * 20);

    // Draw risk: how likely is draw to land
    const drawRisk = Math.round((1 - probabilities.drawProb) * 100);

    // Identify key risks
    const keyRisks = this.identifyKeyRisks(
      probabilities,
      momentum,
      events,
      minute
    );

    // Find safe harbor
    const safeHarbor = this.findSafeHarbor(probabilities, momentum);

    return {
      fixtureId,
      timestamp: Date.now(),
      minute,
      accumulatorRisk: Math.min(100, accumulatorRisk),
      singleBetRisk: Math.min(100, singleBetRisk),
      drawRisk: Math.min(100, drawRisk),
      keyRisks,
      safeHarbor,
    };
  }

  /**
   * Identify key risks for betting
   */
  private identifyKeyRisks(
    probabilities: ProbabilityState,
    momentum: { home: MomentumScore; away: MomentumScore },
    events: MatchEvent[],
    minute: number
  ): string[] {
    const risks: string[] = [];

    // Player card risk
    const recentCards = events
      .slice(-20)
      .filter((e) =>
        [EventType.YELLOW_CARD, EventType.RED_CARD].includes(e.eventType)
      ).length;
    if (recentCards > 3) {
      risks.push('Excessive cards - suspension/ejection risk');
    }

    // Injury risk
    const recentInjuries = events
      .slice(-20)
      .filter((e) => e.eventType === EventType.INJURY).length;
    if (recentInjuries > 0) {
      risks.push('Injury concerns - could affect match flow');
    }

    // Defensive vulnerability
    if (momentum.home.riskLevel === 'high' || momentum.away.riskLevel === 'high') {
      risks.push('Defensive vulnerability - likely more goals');
    }

    // Late momentum shift
    if (minute > 70 && (momentum.home.trend === 'positive' || momentum.away.trend === 'positive')) {
      risks.push('Late momentum shift - unpredictable finish');
    }

    // Penalty kick probability
    if (minute > 70) {
      const fouls = events.slice(-15).filter((e) => e.eventType === EventType.FOUL).length;
      if (fouls > 5) {
        risks.push('Penalty kick risk high (many fouls)');
      }
    }

    return risks.slice(0, 3);
  }

  /**
   * Find safe harbor bet
   */
  private findSafeHarbor(
    probabilities: ProbabilityState,
    momentum: { home: MomentumScore; away: MomentumScore }
  ): string | undefined {
    // Find highest probability outcome
    const probs = [
      { outcome: 'Home Win', prob: probabilities.homeWinProb },
      { outcome: 'Draw', prob: probabilities.drawProb },
      { outcome: 'Away Win', prob: probabilities.awayWinProb },
    ];

    const highest = probs.reduce((prev, current) =>
      prev.prob > current.prob ? prev : current
    );

    // Only recommend if confidence is high
    if (highest.prob > 0.6 && probabilities.confidence > 0.7) {
      return `${highest.outcome} (${(highest.prob * 100).toFixed(1)}%)`;
    }

    return undefined;
  }

  /**
   * Get confidence trend
   */
  getConfidenceTrend(fixtureId: number, windowSize: number = 10): {
    trend: 'increasing' | 'decreasing' | 'stable';
    strength: number;
  } {
    const history = this.confidenceHistory.get(fixtureId) || [];
    if (history.length < 2) {
      return { trend: 'stable', strength: 0 };
    }

    const recentHistory = history.slice(-windowSize);
    const first = recentHistory[0];
    const last = recentHistory[recentHistory.length - 1];

    const change = last.overallConfidence - first.overallConfidence;
    const strength = Math.abs(change);

    if (change > 5) {
      return { trend: 'increasing', strength };
    } else if (change < -5) {
      return { trend: 'decreasing', strength };
    }

    return { trend: 'stable', strength: 0 };
  }

  /**
   * Export for training
   */
  exportForTraining(fixtureId: number): {
    confidenceHistory: ConfidenceScore[];
    trend: { trend: string; strength: number };
  } {
    const history = this.confidenceHistory.get(fixtureId) || [];
    const trend = this.getConfidenceTrend(fixtureId, history.length);

    return {
      confidenceHistory: history,
      trend: trend as any,
    };
  }

  /**
   * Clear fixture data
   */
  clearFixture(fixtureId: number): void {
    this.confidenceHistory.delete(fixtureId);
  }
}
