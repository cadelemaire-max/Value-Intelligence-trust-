// src/services/analysis/oddsIntelligence.ts
import { MatchEvent } from '../events/eventProcessor';
import { ProbabilityState } from './dynamicProbabilityEngine';
import { Server as SocketServer } from 'socket.io';

export interface OddsSnapshot {
  fixtureId: number;
  timestamp: number;
  minute: number;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  modelHomeWin: number;
  modelDraw: number;
  modelAwayWin: number;
  impliedHomeOdds: number;
  impliedDrawOdds: number;
  impliedAwayOdds: number;
}

export interface ValueOpportunity {
  market: 'home_win' | 'draw' | 'away_win';
  modelProbability: number;
  marketProbability: number;
  value: number; // EV: (probability - market_prob) / market_prob
  confidence: number;
  recommendation: 'strong_value' | 'slight_value' | 'fair' | 'overpriced';
  eventTrigger?: string;
}

export interface MarketAnomaly {
  type: 'sudden_shift' | 'sharp_movement' | 'reverse' | 'consensus';
  severity: number; // 0-100
  description: string;
  affectedMarkets: string[];
  timestamp: number;
  minute: number;
}

export interface OddsMovementAnalysis {
  fixtureId: number;
  timestamp: number;
  minute: number;
  valueOpportunities: ValueOpportunity[];
  anomalies: MarketAnomaly[];
  marketSentiment: 'bullish_home' | 'bullish_away' | 'balanced';
  volatility: number; // 0-100
  correlationWithEvents: string[];
}

export class OddsIntelligence {
  private oddsHistory: Map<number, OddsSnapshot[]> = new Map();
  private anomalyHistory: Map<number, MarketAnomaly[]> = new Map();
  private io: SocketServer;

  constructor(io: SocketServer) {
    this.io = io;
  }

  /**
   * Record odds snapshot and analyze changes
   */
  analyzeOdds(
    fixtureId: number,
    homeOdds: number,
    drawOdds: number,
    awayOdds: number,
    modelProbs: ProbabilityState,
    events: MatchEvent[],
    minute: number
  ): OddsMovementAnalysis {
    // Convert odds to implied probabilities
    const impliedProbs = this.oddsToImpliedProbability(homeOdds, drawOdds, awayOdds);

    const snapshot: OddsSnapshot = {
      fixtureId,
      timestamp: Date.now(),
      minute,
      homeOdds,
      drawOdds,
      awayOdds,
      modelHomeWin: modelProbs.homeWinProb,
      modelDraw: modelProbs.drawProb,
      modelAwayWin: modelProbs.awayWinProb,
      impliedHomeOdds: impliedProbs.home,
      impliedDrawOdds: impliedProbs.draw,
      impliedAwayOdds: impliedProbs.away,
    };

    // Store snapshot
    if (!this.oddsHistory.has(fixtureId)) {
      this.oddsHistory.set(fixtureId, []);
    }
    this.oddsHistory.get(fixtureId)!.push(snapshot);

    // Analyze value opportunities
    const valueOpportunities = this.identifyValueOpportunities(snapshot);

    // Detect market anomalies
    const anomalies = this.detectAnomalies(fixtureId, snapshot, events);

    // Determine market sentiment
    const marketSentiment = this.analyzeMarketSentiment(impliedProbs);

    // Calculate volatility
    const volatility = this.calculateOddsVolatility(fixtureId);

    // Find event correlations
    const correlationWithEvents = this.findEventCorrelations(snapshot, events);

    const analysis: OddsMovementAnalysis = {
      fixtureId,
      timestamp: Date.now(),
      minute,
      valueOpportunities,
      anomalies,
      marketSentiment,
      volatility,
      correlationWithEvents,
    };

    // Emit analysis
    this.io.emit('odds-analysis', {
      fixtureId,
      analysis,
      snapshot,
    });

    return analysis;
  }

  /**
   * Convert decimal odds to implied probability
   */
  private oddsToImpliedProbability(
    homeOdds: number,
    drawOdds: number,
    awayOdds: number
  ): { home: number; draw: number; away: number } {
    const homeProb = 1 / homeOdds;
    const drawProb = 1 / drawOdds;
    const awayProb = 1 / awayOdds;

    const total = homeProb + drawProb + awayProb;

    return {
      home: homeProb / total,
      draw: drawProb / total,
      away: awayProb / total,
    };
  }

  /**
   * Convert probability to implied odds
   */
  private probabilityToOdds(probability: number): number {
    return 1 / probability;
  }

  /**
   * Identify value opportunities (model vs market discrepancies)
   */
  private identifyValueOpportunities(snapshot: OddsSnapshot): ValueOpportunity[] {
    const opportunities: ValueOpportunity[] = [];

    // Home Win
    const homeValue = this.calculateValue(
      snapshot.modelHomeWin,
      snapshot.impliedHomeOdds
    );
    if (homeValue > 0.1) {
      opportunities.push({
        market: 'home_win',
        modelProbability: snapshot.modelHomeWin,
        marketProbability: snapshot.impliedHomeOdds,
        value: homeValue,
        confidence: Math.min(1, snapshot.modelHomeWin),
        recommendation: homeValue > 0.2 ? 'strong_value' : 'slight_value',
      });
    } else if (homeValue < -0.1) {
      opportunities.push({
        market: 'home_win',
        modelProbability: snapshot.modelHomeWin,
        marketProbability: snapshot.impliedHomeOdds,
        value: homeValue,
        confidence: Math.min(1, snapshot.modelHomeWin),
        recommendation: 'overpriced',
      });
    }

    // Draw
    const drawValue = this.calculateValue(
      snapshot.modelDraw,
      snapshot.impliedDrawOdds
    );
    if (drawValue > 0.15) {
      opportunities.push({
        market: 'draw',
        modelProbability: snapshot.modelDraw,
        marketProbability: snapshot.impliedDrawOdds,
        value: drawValue,
        confidence: Math.min(1, snapshot.modelDraw),
        recommendation: drawValue > 0.25 ? 'strong_value' : 'slight_value',
      });
    } else if (drawValue < -0.15) {
      opportunities.push({
        market: 'draw',
        modelProbability: snapshot.modelDraw,
        marketProbability: snapshot.impliedDrawOdds,
        value: drawValue,
        confidence: Math.min(1, snapshot.modelDraw),
        recommendation: 'overpriced',
      });
    }

    // Away Win
    const awayValue = this.calculateValue(
      snapshot.modelAwayWin,
      snapshot.impliedAwayOdds
    );
    if (awayValue > 0.1) {
      opportunities.push({
        market: 'away_win',
        modelProbability: snapshot.modelAwayWin,
        marketProbability: snapshot.impliedAwayOdds,
        value: awayValue,
        confidence: Math.min(1, snapshot.modelAwayWin),
        recommendation: awayValue > 0.2 ? 'strong_value' : 'slight_value',
      });
    } else if (awayValue < -0.1) {
      opportunities.push({
        market: 'away_win',
        modelProbability: snapshot.modelAwayWin,
        marketProbability: snapshot.impliedAwayOdds,
        value: awayValue,
        confidence: Math.min(1, snapshot.modelAwayWin),
        recommendation: 'overpriced',
      });
    }

    return opportunities;
  }

  /**
   * Calculate Expected Value (EV)
   */
  private calculateValue(modelProb: number, marketProb: number): number {
    return (modelProb - marketProb) / marketProb;
  }

  /**
   * Detect market anomalies
   */
  private detectAnomalies(
    fixtureId: number,
    current: OddsSnapshot,
    events: MatchEvent[]
  ): MarketAnomaly[] {
    const anomalies: MarketAnomaly[] = [];
    const history = this.oddsHistory.get(fixtureId) || [];

    if (history.length < 2) return anomalies;

    const previous = history[history.length - 2];

    // Detect sudden shifts
    const homeShift = Math.abs(current.homeOdds - previous.homeOdds) / previous.homeOdds;
    const drawShift = Math.abs(current.drawOdds - previous.drawOdds) / previous.drawOdds;
    const awayShift = Math.abs(current.awayOdds - previous.awayOdds) / previous.awayOdds;

    const maxShift = Math.max(homeShift, drawShift, awayShift);

    if (maxShift > 0.1) {
      const affectedMarket = homeShift === maxShift ? 'home' : drawShift === maxShift ? 'draw' : 'away';
      
      anomalies.push({
        type: 'sudden_shift',
        severity: Math.min(100, maxShift * 200),
        description: `Sudden ${(maxShift * 100).toFixed(1)}% shift in ${affectedMarket} odds`,
        affectedMarkets: [affectedMarket],
        timestamp: Date.now(),
        minute: current.minute,
      });
    }

    // Detect reversal (odds moving opposite to model)
    const homeReversal =
      (current.modelHomeWin > previous.modelHomeWin && current.homeOdds > previous.homeOdds) ||
      (current.modelHomeWin < previous.modelHomeWin && current.homeOdds < previous.homeOdds);

    if (homeReversal) {
      anomalies.push({
        type: 'reverse',
        severity: 60,
        description: 'Home odds moving opposite to model prediction',
        affectedMarkets: ['home'],
        timestamp: Date.now(),
        minute: current.minute,
      });
    }

    // Detect sharp movements (market consensus breaking)
    const avgShift = (homeShift + drawShift + awayShift) / 3;
    if (maxShift > avgShift * 2) {
      anomalies.push({
        type: 'sharp_movement',
        severity: Math.min(100, (maxShift - avgShift) * 150),
        description: 'Sharp movement in one market; consensus breaking',
        affectedMarkets: [homeShift === maxShift ? 'home' : drawShift === maxShift ? 'draw' : 'away'],
        timestamp: Date.now(),
        minute: current.minute,
      });
    }

    // Store anomalies
    if (!this.anomalyHistory.has(fixtureId)) {
      this.anomalyHistory.set(fixtureId, []);
    }
    this.anomalyHistory.get(fixtureId)!.push(...anomalies);

    return anomalies;
  }

  /**
   * Analyze market sentiment
   */
  private analyzeMarketSentiment(
    impliedProbs: { home: number; draw: number; away: number }
  ): 'bullish_home' | 'bullish_away' | 'balanced' {
    if (impliedProbs.home > impliedProbs.away + 0.1) {
      return 'bullish_home';
    } else if (impliedProbs.away > impliedProbs.home + 0.1) {
      return 'bullish_away';
    }
    return 'balanced';
  }

  /**
   * Calculate odds volatility
   */
  private calculateOddsVolatility(fixtureId: number): number {
    const history = this.oddsHistory.get(fixtureId) || [];
    if (history.length < 2) return 0;

    const recentHistory = history.slice(-10);
    const changes: number[] = [];

    for (let i = 1; i < recentHistory.length; i++) {
      const prev = recentHistory[i - 1];
      const curr = recentHistory[i];

      const homeChange = Math.abs((curr.homeOdds - prev.homeOdds) / prev.homeOdds);
      const drawChange = Math.abs((curr.drawOdds - prev.drawOdds) / prev.drawOdds);
      const awayChange = Math.abs((curr.awayOdds - prev.awayOdds) / prev.awayOdds);

      changes.push((homeChange + drawChange + awayChange) / 3);
    }

    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    return Math.min(100, avgChange * 200);
  }

  /**
   * Find correlations between odds movements and events
   */
  private findEventCorrelations(snapshot: OddsSnapshot, events: MatchEvent[]): string[] {
    const correlations: string[] = [];
    const recentEvents = events.slice(-5);

    recentEvents.forEach((event) => {
      switch (event.eventType) {
        case 'goal':
          correlations.push(`Odds shifted after goal by ${event.team}`);
          break;
        case 'shot_on_target':
          correlations.push(`Odds reacted to shot on target`);
          break;
        case 'red_card':
          correlations.push(`Odds adjusted for red card`);
          break;
        case 'substitution':
          correlations.push(`Odds reacted to substitution`);
          break;
        default:
          break;
      }
    });

    return correlations.slice(0, 3);
  }

  /**
   * Get odds history
   */
  getOddsHistory(fixtureId: number): OddsSnapshot[] {
    return this.oddsHistory.get(fixtureId) || [];
  }

  /**
   * Get market forecast (next 5 minutes)
   */
  getMarketForecast(fixtureId: number): {
    predictedHomeOdds: number;
    predictedDrawOdds: number;
    predictedAwayOdds: number;
    confidence: number;
  } {
    const history = this.getOddsHistory(fixtureId);
    if (history.length < 3) {
      return {
        predictedHomeOdds: 0,
        predictedDrawOdds: 0,
        predictedAwayOdds: 0,
        confidence: 0,
      };
    }

    // Simple linear regression on recent odds
    const recentHistory = history.slice(-5);
    const homeChanges = this.calculateTrend(recentHistory.map((h) => h.homeOdds));
    const drawChanges = this.calculateTrend(recentHistory.map((h) => h.drawOdds));
    const awayChanges = this.calculateTrend(recentHistory.map((h) => h.awayOdds));

    const lastSnapshot = history[history.length - 1];

    return {
      predictedHomeOdds: Math.max(1.01, lastSnapshot.homeOdds + homeChanges),
      predictedDrawOdds: Math.max(1.01, lastSnapshot.drawOdds + drawChanges),
      predictedAwayOdds: Math.max(1.01, lastSnapshot.awayOdds + awayChanges),
      confidence: Math.min(1, recentHistory.length / 10),
    };
  }

  /**
   * Calculate trend from values
   */
  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const diffs = [];
    for (let i = 1; i < values.length; i++) {
      diffs.push(values[i] - values[i - 1]);
    }

    return diffs.reduce((a, b) => a + b, 0) / diffs.length;
  }

  /**
   * Export for training
   */
  exportForTraining(fixtureId: number): {
    oddsHistory: OddsSnapshot[];
    anomalies: MarketAnomaly[];
  } {
    return {
      oddsHistory: this.getOddsHistory(fixtureId),
      anomalies: this.anomalyHistory.get(fixtureId) || [],
    };
  }

  /**
   * Clear fixture data
   */
  clearFixture(fixtureId: number): void {
    this.oddsHistory.delete(fixtureId);
    this.anomalyHistory.delete(fixtureId);
  }
}
