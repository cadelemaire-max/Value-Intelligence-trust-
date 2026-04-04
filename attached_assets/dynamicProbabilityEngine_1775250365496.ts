// src/services/analysis/dynamicProbabilityEngine.ts
import { MatchEvent, EventType } from '../events/eventProcessor';
import { Server as SocketServer } from 'socket.io';

export interface ProbabilityState {
  fixtureId: number;
  timestamp: number;
  minute: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  confidence: number;
  homeScore: number;
  awayScore: number;
  eventTrigger?: string;
  simulationRuns: number;
}

export interface ProbabilityDelta {
  homeWinDelta: number;
  drawDelta: number;
  awayWinDelta: number;
  magnitude: number;
  reason: string;
}

export class DynamicProbabilityEngine {
  private currentProbabilities: Map<number, ProbabilityState> = new Map();
  private probabilityHistory: Map<number, ProbabilityState[]> = new Map();
  private io: SocketServer;

  constructor(io: SocketServer) {
    this.io = io;
  }

  /**
   * Update probabilities based on a new event
   */
  updateProbabilities(
    fixtureId: number,
    homeScore: number,
    awayScore: number,
    events: MatchEvent[],
    minute: number
  ): ProbabilityState {
    const previousState = this.currentProbabilities.get(fixtureId) || this.initializeState(fixtureId);

    // Calculate base probabilities from match state
    let homeWinProb = this.calculateWinProbability(homeScore, awayScore, 'home', minute, events);
    let awayWinProb = this.calculateWinProbability(awayScore, homeScore, 'away', minute, events);
    let drawProb = Math.max(0, 1 - homeWinProb - awayWinProb);

    // Normalize
    const total = homeWinProb + awayWinProb + drawProb;
    homeWinProb = homeWinProb / total;
    awayWinProb = awayWinProb / total;
    drawProb = drawProb / total;

    // Calculate confidence based on event recency and clarity
    const confidence = this.calculateConfidence(homeScore, awayScore, events);

    const newState: ProbabilityState = {
      fixtureId,
      timestamp: Date.now(),
      minute,
      homeWinProb,
      drawProb,
      awayWinProb,
      confidence,
      homeScore,
      awayScore,
      simulationRuns: 10000,
    };

    // Detect significant shift
    const delta = this.calculateDelta(previousState, newState);
    if (delta.magnitude > 0.05) {
      newState.eventTrigger = delta.reason;
    }

    // Store state
    this.currentProbabilities.set(fixtureId, newState);
    if (!this.probabilityHistory.has(fixtureId)) {
      this.probabilityHistory.set(fixtureId, []);
    }
    this.probabilityHistory.get(fixtureId)!.push(newState);

    // Emit update
    this.io.emit('probability-update', {
      fixtureId,
      state: newState,
      delta: delta.magnitude > 0 ? delta : null,
    });

    return newState;
  }

  /**
   * Calculate win probability using Bayesian approach
   */
  private calculateWinProbability(
    teamScore: number,
    opponentScore: number,
    team: 'home' | 'away',
    minute: number,
    events: MatchEvent[]
  ): number {
    // Base case: if match is over
    if (minute >= 90) {
      return teamScore > opponentScore ? 1.0 : teamScore === opponentScore ? 0.3 : 0.01;
    }

    // Score differential factor
    const scoreDiff = teamScore - opponentScore;
    let baseProb = 0.5; // Start neutral

    if (scoreDiff > 0) {
      baseProb = 0.65 + Math.min(0.3, scoreDiff * 0.15);
    } else if (scoreDiff < 0) {
      baseProb = 0.35 + Math.max(-0.3, scoreDiff * 0.15);
    }

    // Time remaining factor (more time = more uncertainty)
    const minutesRemaining = 90 - minute;
    const timeDecay = Math.min(1, minutesRemaining / 45);

    // Recent form factor (shots, attacking events)
    const formFactor = this.calculateFormFactor(events, team);

    // Combine factors
    let probability = baseProb * 0.5 + formFactor * 0.3 + (0.5 * timeDecay) * 0.2;

    return Math.min(0.95, Math.max(0.05, probability));
  }

  /**
   * Calculate form factor from recent events
   */
  private calculateFormFactor(events: MatchEvent[], team: 'home' | 'away'): number {
    const recentEvents = events.slice(-15);
    const teamEvents = recentEvents.filter((e) => e.team === team);

    let score = 0;
    teamEvents.forEach((event) => {
      switch (event.eventType) {
        case EventType.SHOT_ON_TARGET:
          score += 0.05;
          break;
        case EventType.SHOT:
          score += 0.02;
          break;
        case EventType.CORNER:
          score += 0.03;
          break;
        case EventType.TACKLE:
          score += 0.01;
          break;
        case EventType.INTERCEPTION:
          score += 0.02;
          break;
        default:
          break;
      }
    });

    return 0.5 + Math.min(0.3, score);
  }

  /**
   * Calculate confidence score (0-1)
   */
  private calculateConfidence(
    homeScore: number,
    awayScore: number,
    events: MatchEvent[]
  ): number {
    // Higher confidence when:
    // 1. Score is decisive (clear winner likely)
    const scoreDiff = Math.abs(homeScore - awayScore);
    const scoreConfidence = Math.min(1, 0.3 + scoreDiff * 0.35);

    // 2. More events = clearer picture
    const eventConfidence = Math.min(1, events.length / 100);

    // 3. Recent clear chances
    const recentShotsOnTarget = events
      .slice(-20)
      .filter((e) => e.eventType === EventType.SHOT_ON_TARGET).length;
    const chancesConfidence = Math.min(1, recentShotsOnTarget / 10);

    return Math.min(
      0.95,
      Math.max(0.3, scoreConfidence * 0.4 + eventConfidence * 0.3 + chancesConfidence * 0.3)
    );
  }

  /**
   * Calculate delta between probability states
   */
  private calculateDelta(prev: ProbabilityState, curr: ProbabilityState): ProbabilityDelta {
    const homeWinDelta = curr.homeWinProb - prev.homeWinProb;
    const drawDelta = curr.drawProb - prev.drawProb;
    const awayWinDelta = curr.awayWinProb - prev.awayWinProb;

    const magnitude = Math.abs(homeWinDelta) + Math.abs(drawDelta) + Math.abs(awayWinDelta);

    let reason = 'Minor shift';
    if (magnitude > 0.15) {
      if (homeWinDelta > 0) {
        reason = 'Home team probability increased significantly';
      } else if (awayWinDelta > 0) {
        reason = 'Away team probability increased significantly';
      } else if (drawDelta > 0) {
        reason = 'Draw probability increased significantly';
      }
    }

    return {
      homeWinDelta,
      drawDelta,
      awayWinDelta,
      magnitude,
      reason,
    };
  }

  /**
   * Get current probability state
   */
  getCurrentProbabilities(fixtureId: number): ProbabilityState | null {
    return this.currentProbabilities.get(fixtureId) || null;
  }

  /**
   * Get probability history
   */
  getProbabilityHistory(fixtureId: number): ProbabilityState[] {
    return this.probabilityHistory.get(fixtureId) || [];
  }

  /**
   * Get probability trajectory (trend)
   */
  getProbabilityTrend(fixtureId: number, windowSize: number = 10): {
    homeWinTrend: number;
    drawTrend: number;
    awayWinTrend: number;
    direction: string;
  } {
    const history = this.probabilityHistory.get(fixtureId) || [];
    if (history.length < 2) {
      return {
        homeWinTrend: 0,
        drawTrend: 0,
        awayWinTrend: 0,
        direction: 'stable',
      };
    }

    const recentHistory = history.slice(-windowSize);
    const first = recentHistory[0];
    const last = recentHistory[recentHistory.length - 1];

    const homeWinTrend = last.homeWinProb - first.homeWinProb;
    const drawTrend = last.drawProb - first.drawProb;
    const awayWinTrend = last.awayWinProb - first.awayWinProb;

    let direction = 'stable';
    const maxTrend = Math.max(
      Math.abs(homeWinTrend),
      Math.abs(drawTrend),
      Math.abs(awayWinTrend)
    );

    if (maxTrend > 0.1) {
      if (homeWinTrend === maxTrend) {
        direction = 'home_rising';
      } else if (awayWinTrend === maxTrend) {
        direction = 'away_rising';
      } else {
        direction = 'draw_rising';
      }
    }

    return {
      homeWinTrend,
      drawTrend,
      awayWinTrend,
      direction,
    };
  }

  /**
   * Monte Carlo simulation for remaining match time
   */
  simulateMatchOutcomes(
    fixtureId: number,
    homeScore: number,
    awayScore: number,
    minute: number,
    runs: number = 10000
  ): {
    homeWins: number;
    draws: number;
    awayWins: number;
    expectedScore: { home: number; away: number };
  } {
    const minutesRemaining = 90 - minute;
    let homeWinCount = 0;
    let drawCount = 0;
    let awayWinCount = 0;
    let totalHomeGoals = 0;
    let totalAwayGoals = 0;

    for (let i = 0; i < runs; i++) {
      const { homeGoals, awayGoals } = this.simulateSingleMatch(
        homeScore,
        awayScore,
        minutesRemaining,
        0.015 // goals per minute
      );

      totalHomeGoals += homeGoals;
      totalAwayGoals += awayGoals;

      if (homeGoals > awayGoals) {
        homeWinCount++;
      } else if (homeGoals === awayGoals) {
        drawCount++;
      } else {
        awayWinCount++;
      }
    }

    return {
      homeWins: homeWinCount / runs,
      draws: drawCount / runs,
      awayWins: awayWinCount / runs,
      expectedScore: {
        home: homeScore + totalHomeGoals / runs,
        away: awayScore + totalAwayGoals / runs,
      },
    };
  }

  /**
   * Simulate a single match outcome
   */
  private simulateSingleMatch(
    homeScore: number,
    awayScore: number,
    minutesRemaining: number,
    goalsPerMinute: number
  ): { homeGoals: number; awayGoals: number } {
    let homeGoals = 0;
    let awayGoals = 0;

    // Expected goals remaining
    const expectedHomeGoals = minutesRemaining * goalsPerMinute;
    const expectedAwayGoals = minutesRemaining * goalsPerMinute;

    // Poisson distribution approximation
    homeGoals = this.poissonRandom(expectedHomeGoals);
    awayGoals = this.poissonRandom(expectedAwayGoals);

    return { homeGoals, awayGoals };
  }

  /**
   * Poisson random number generator
   */
  private poissonRandom(lambda: number): number {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;

    do {
      k++;
      p *= Math.random();
    } while (p > L);

    return k - 1;
  }

  /**
   * Initialize probability state for a fixture
   */
  private initializeState(fixtureId: number): ProbabilityState {
    return {
      fixtureId,
      timestamp: Date.now(),
      minute: 0,
      homeWinProb: 0.4,
      drawProb: 0.3,
      awayWinProb: 0.3,
      confidence: 0.3,
      homeScore: 0,
      awayScore: 0,
      simulationRuns: 10000,
    };
  }

  /**
   * Export probability data for training
   */
  exportForTraining(fixtureId: number): {
    fixtureId: number;
    probabilityHistory: ProbabilityState[];
    trends: any;
  } {
    const history = this.probabilityHistory.get(fixtureId) || [];
    const trends = this.getProbabilityTrend(fixtureId, history.length);

    return {
      fixtureId,
      probabilityHistory: history,
      trends,
    };
  }

  /**
   * Clear fixture data
   */
  clearFixture(fixtureId: number): void {
    this.currentProbabilities.delete(fixtureId);
    this.probabilityHistory.delete(fixtureId);
  }
}
