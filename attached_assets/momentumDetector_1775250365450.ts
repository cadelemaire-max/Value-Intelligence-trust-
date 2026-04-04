// src/services/analysis/momentumDetector.ts
import { MatchEvent, EventType } from '../events/eventProcessor';
import { Server as SocketServer } from 'socket.io';

export interface MomentumScore {
  team: 'home' | 'away';
  timestamp: number;
  minute: number;
  score: number; // -100 to +100
  trend: 'positive' | 'negative' | 'stable';
  trendStrength: number; // 0-100
  attackingStrength: number; // 0-100
  defensiveStrength: number; // 0-100
  possession: number; // 0-100
  recentFormRating: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high'; // risk of conceding
  keyFactors: string[];
}

export interface FormPattern {
  pattern: string;
  strength: number; // 0-1
  events: MatchEvent[];
  description: string;
}

export class MomentumDetector {
  private momentumHistory: Map<number, Map<'home' | 'away', MomentumScore[]>> = new Map();
  private io: SocketServer;

  constructor(io: SocketServer) {
    this.io = io;
  }

  /**
   * Calculate momentum for both teams
   */
  calculateMomentum(
    fixtureId: number,
    allEvents: MatchEvent[],
    minute: number,
    homeScore: number,
    awayScore: number
  ): { home: MomentumScore; away: MomentumScore } {
    const homeEvents = allEvents.filter((e) => e.team === 'home');
    const awayEvents = allEvents.filter((e) => e.team === 'away');

    const homeMomentum = this.calculateTeamMomentum(
      'home',
      homeEvents,
      awayEvents,
      minute,
      homeScore,
      awayScore,
      fixtureId
    );

    const awayMomentum = this.calculateTeamMomentum(
      'away',
      awayEvents,
      homeEvents,
      minute,
      awayScore,
      homeScore,
      fixtureId
    );

    // Store history
    if (!this.momentumHistory.has(fixtureId)) {
      this.momentumHistory.set(fixtureId, new Map());
    }
    const fixtureHistory = this.momentumHistory.get(fixtureId)!;
    if (!fixtureHistory.has('home')) {
      fixtureHistory.set('home', []);
      fixtureHistory.set('away', []);
    }

    fixtureHistory.get('home')!.push(homeMomentum);
    fixtureHistory.get('away')!.push(awayMomentum);

    // Emit updates
    this.io.emit('momentum-update', {
      fixtureId,
      home: homeMomentum,
      away: awayMomentum,
    });

    return { home: homeMomentum, away: awayMomentum };
  }

  /**
   * Calculate momentum for a single team
   */
  private calculateTeamMomentum(
    team: 'home' | 'away',
    teamEvents: MatchEvent[],
    opponentEvents: MatchEvent[],
    minute: number,
    teamScore: number,
    opponentScore: number,
    fixtureId: number
  ): MomentumScore {
    // Get recent events (last 15 minutes)
    const cutoffMinute = Math.max(0, minute - 15);
    const recentTeamEvents = teamEvents.filter((e) => e.minute >= cutoffMinute);
    const recentOpponentEvents = opponentEvents.filter((e) => e.minute >= cutoffMinute);

    // Calculate component scores
    const attackingStrength = this.calculateAttackingStrength(recentTeamEvents);
    const defensiveStrength = this.calculateDefensiveStrength(
      recentTeamEvents,
      recentOpponentEvents
    );
    const possession = this.estimatePossession(recentTeamEvents, recentOpponentEvents);
    const recentFormRating = this.calculateFormRating(
      teamScore,
      opponentScore,
      recentTeamEvents
    );

    // Calculate overall momentum score (-100 to +100)
    const momentumScore =
      attackingStrength * 0.3 + defensiveStrength * 0.3 + possession * 0.2 + recentFormRating * 0.2 - 50;

    // Detect trend
    const trend = this.detectTrend(fixtureId, team);
    const trendStrength = this.calculateTrendStrength(fixtureId, team);

    // Risk level (likelihood of conceding)
    const riskLevel = this.assessRiskLevel(defensiveStrength, attackingStrength, minute);

    // Key factors
    const keyFactors = this.identifyKeyFactors(
      recentTeamEvents,
      recentOpponentEvents,
      attackingStrength,
      defensiveStrength
    );

    return {
      team,
      timestamp: Date.now(),
      minute,
      score: Math.round(momentumScore),
      trend,
      trendStrength,
      attackingStrength: Math.round(attackingStrength),
      defensiveStrength: Math.round(defensiveStrength),
      possession: Math.round(possession),
      recentFormRating: Math.round(recentFormRating),
      riskLevel,
      keyFactors,
    };
  }

  /**
   * Calculate attacking strength (0-100)
   */
  private calculateAttackingStrength(events: MatchEvent[]): number {
    let score = 50; // Base

    const shotsOnTarget = events.filter((e) => e.eventType === EventType.SHOT_ON_TARGET).length;
    const shots = events.filter((e) => e.eventType === EventType.SHOT).length;
    const corners = events.filter((e) => e.eventType === EventType.CORNER).length;
    const passes = events.filter((e) => e.eventType === EventType.PASS).length;

    score += shotsOnTarget * 8;
    score += shots * 3;
    score += corners * 2;
    score += Math.min(10, passes / 5); // Diminishing returns

    return Math.min(100, score);
  }

  /**
   * Calculate defensive strength (0-100)
   */
  private calculateDefensiveStrength(teamEvents: MatchEvent[], opponentEvents: MatchEvent[]): number {
    let score = 50; // Base

    const tackles = teamEvents.filter((e) => e.eventType === EventType.TACKLE).length;
    const interceptions = teamEvents.filter((e) => e.eventType === EventType.INTERCEPTION).length;
    const clearances = teamEvents.filter((e) => e.eventType === EventType.CLEARANCE).length;

    // Reduce score based on opponent shots
    const opponentShotsOnTarget = opponentEvents.filter(
      (e) => e.eventType === EventType.SHOT_ON_TARGET
    ).length;
    const opponentShots = opponentEvents.filter((e) => e.eventType === EventType.SHOT).length;

    score += tackles * 5;
    score += interceptions * 8;
    score += clearances * 3;
    score -= opponentShotsOnTarget * 10;
    score -= opponentShots * 2;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Estimate possession percentage
   */
  private estimatePossession(teamEvents: MatchEvent[], opponentEvents: MatchEvent[]): number {
    const teamPasses = teamEvents.filter((e) => e.eventType === EventType.PASS).length;
    const opponentPasses = opponentEvents.filter((e) => e.eventType === EventType.PASS).length;

    const totalPasses = teamPasses + opponentPasses;
    if (totalPasses === 0) return 50;

    return (teamPasses / totalPasses) * 100;
  }

  /**
   * Calculate form rating based on score and recent performance
   */
  private calculateFormRating(
    teamScore: number,
    opponentScore: number,
    events: MatchEvent[]
  ): number {
    let rating = 50;

    // Score-based
    const scoreDiff = teamScore - opponentScore;
    if (scoreDiff > 0) {
      rating += Math.min(30, scoreDiff * 15);
    } else if (scoreDiff < 0) {
      rating -= Math.min(30, Math.abs(scoreDiff) * 15);
    }

    // Performance-based
    const goodEvents = events.filter((e) =>
      [
        EventType.GOAL,
        EventType.SHOT_ON_TARGET,
        EventType.SHOT,
        EventType.CORNER,
      ].includes(e.eventType)
    ).length;

    const badEvents = events.filter((e) =>
      [EventType.YELLOW_CARD, EventType.RED_CARD, EventType.FOUL].includes(e.eventType)
    ).length;

    rating += Math.min(10, goodEvents / 2);
    rating -= Math.min(10, badEvents * 2);

    return Math.max(0, Math.min(100, rating));
  }

  /**
   * Detect momentum trend
   */
  private detectTrend(fixtureId: number, team: 'home' | 'away'): 'positive' | 'negative' | 'stable' {
    const history = this.momentumHistory.get(fixtureId)?.get(team) || [];
    if (history.length < 2) return 'stable';

    const recent = history.slice(-5);
    const avgScore =
      recent.reduce((sum, m) => sum + m.score, 0) / recent.length;
    const previous = history.slice(-10, -5);
    const avgPrevious =
      previous.length > 0
        ? previous.reduce((sum, m) => sum + m.score, 0) / previous.length
        : avgScore;

    if (avgScore > avgPrevious + 5) return 'positive';
    if (avgScore < avgPrevious - 5) return 'negative';
    return 'stable';
  }

  /**
   * Calculate trend strength
   */
  private calculateTrendStrength(fixtureId: number, team: 'home' | 'away'): number {
    const history = this.momentumHistory.get(fixtureId)?.get(team) || [];
    if (history.length < 2) return 0;

    const recent = history.slice(-5);
    const trend = recent[recent.length - 1].score - recent[0].score;

    return Math.min(100, Math.abs(trend) * 5);
  }

  /**
   * Assess risk level of conceding
   */
  private assessRiskLevel(
    defensiveStrength: number,
    attackingStrength: number,
    minute: number
  ): 'low' | 'medium' | 'high' {
    // More tired towards end of game = higher risk
    const fatigueMultiplier = 1 + (minute / 90) * 0.3;
    const adjustedDefense = defensiveStrength / fatigueMultiplier;

    if (adjustedDefense > 70) return 'low';
    if (adjustedDefense > 45) return 'medium';
    return 'high';
  }

  /**
   * Identify key performance factors
   */
  private identifyKeyFactors(
    teamEvents: MatchEvent[],
    opponentEvents: MatchEvent[],
    attacking: number,
    defending: number
  ): string[] {
    const factors: string[] = [];

    // Attacking factors
    if (attacking > 70) {
      factors.push('Strong attacking play');
    } else if (attacking < 30) {
      factors.push('Weak attacking play');
    }

    // Defensive factors
    if (defending > 70) {
      factors.push('Solid defense');
    } else if (defending < 30) {
      factors.push('Vulnerable defense');
    }

    // Card activity
    const cards = teamEvents.filter((e) =>
      [EventType.YELLOW_CARD, EventType.RED_CARD].includes(e.eventType)
    ).length;
    if (cards > 2) {
      factors.push('Excessive disciplinary issues');
    }

    // Recent shots
    const recentShots = teamEvents.slice(-10).filter(
      (e) => e.eventType === EventType.SHOT_ON_TARGET
    ).length;
    if (recentShots > 2) {
      factors.push('Creating clear chances');
    }

    // Opponent pressure
    const opponentShotsOnTarget = opponentEvents
      .slice(-10)
      .filter((e) => e.eventType === EventType.SHOT_ON_TARGET).length;
    if (opponentShotsOnTarget > 2) {
      factors.push('Under pressure from opponent');
    }

    return factors.slice(0, 3); // Top 3 factors
  }

  /**
   * Detect form patterns
   */
  detectFormPatterns(fixtureId: number, team: 'home' | 'away'): FormPattern[] {
    const events = (this.momentumHistory.get(fixtureId)?.get(team) || []).map((m) => ({
      ...m,
    }));

    const patterns: FormPattern[] = [];

    // Momentum rising pattern
    if (events.length >= 3) {
      const last3 = events.slice(-3);
      const isRising =
        last3[0].score < last3[1].score && last3[1].score < last3[2].score;
      if (isRising) {
        patterns.push({
          pattern: 'Rising Momentum',
          strength: Math.min(1, (last3[2].score - last3[0].score) / 50),
          events: events as any,
          description: 'Team is gaining momentum and confidence',
        });
      }
    }

    // Defensive solidity pattern
    const avgDefense = events.reduce((sum, m) => sum + m.defensiveStrength, 0) / Math.max(1, events.length);
    if (avgDefense > 65) {
      patterns.push({
        pattern: 'Defensive Solidity',
        strength: avgDefense / 100,
        events: events as any,
        description: 'Team is defensively strong and organized',
      });
    }

    return patterns;
  }

  /**
   * Get momentum history
   */
  getMomentumHistory(fixtureId: number, team: 'home' | 'away'): MomentumScore[] {
    return this.momentumHistory.get(fixtureId)?.get(team) || [];
  }

  /**
   * Export for training
   */
  exportForTraining(fixtureId: number): {
    home: MomentumScore[];
    away: MomentumScore[];
    patterns: { home: FormPattern[]; away: FormPattern[] };
  } {
    return {
      home: this.getMomentumHistory(fixtureId, 'home'),
      away: this.getMomentumHistory(fixtureId, 'away'),
      patterns: {
        home: this.detectFormPatterns(fixtureId, 'home'),
        away: this.detectFormPatterns(fixtureId, 'away'),
      },
    };
  }

  /**
   * Clear fixture data
   */
  clearFixture(fixtureId: number): void {
    this.momentumHistory.delete(fixtureId);
  }
}
