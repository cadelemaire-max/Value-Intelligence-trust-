// src/services/analysis/playerImpactAnalyzer.ts
import { MatchEvent, EventType } from '../events/eventProcessor';
import { Server as SocketServer } from 'socket.io';

export interface PlayerStats {
  playerId: number;
  playerName: string;
  position: string;
  team: 'home' | 'away';
  minute: number;
  events: MatchEvent[];
  shotCount: number;
  shotsOnTarget: number;
  passes: number;
  tackles: number;
  interceptions: number;
  fouls: number;
  cards: number;
  goals: number;
  assists: number;
  impactScore: number; // -100 to +100
  efficiency: number; // 0-100
  status: 'active' | 'substituted' | 'injured' | 'suspended';
  expectedImpact: number; // If substituted, predicted impact on match
}

export interface TeamPlayerAnalysis {
  team: 'home' | 'away';
  timestamp: number;
  minute: number;
  players: PlayerStats[];
  topPerformers: PlayerStats[];
  keyAbsentPlayers: string[];
  criticalPositions: string[];
}

export interface PlayerAbsenceSimulation {
  playerId: number;
  playerName: string;
  position: string;
  homeWinProbDelta: number;
  drawProbDelta: number;
  awayWinProbDelta: number;
  impactDescription: string;
}

export class PlayerImpactAnalyzer {
  private playerStats: Map<number, Map<number, PlayerStats>> = new Map(); // fixtureId -> playerId -> stats
  private playerHistory: Map<number, PlayerStats[]> = new Map(); // playerId -> history
  private io: SocketServer;

  constructor(io: SocketServer) {
    this.io = io;
  }

  /**
   * Update player statistics based on events
   */
  updatePlayerStats(
    fixtureId: number,
    allEvents: MatchEvent[],
    minute: number
  ): { home: TeamPlayerAnalysis; away: TeamPlayerAnalysis } {
    // Group events by player
    const playerEventMap = new Map<number, MatchEvent[]>();

    allEvents.forEach((event) => {
      if (!event.player) return;

      const playerId = event.player.id;
      if (!playerEventMap.has(playerId)) {
        playerEventMap.set(playerId, []);
      }
      playerEventMap.get(playerId)!.push(event);
    });

    // Initialize player stats map if needed
    if (!this.playerStats.has(fixtureId)) {
      this.playerStats.set(fixtureId, new Map());
    }

    const fixturePlayerStats = this.playerStats.get(fixtureId)!;

    // Calculate stats for each player
    const homeStats: PlayerStats[] = [];
    const awayStats: PlayerStats[] = [];

    playerEventMap.forEach((events, playerId) => {
      if (events.length === 0) return;

      const firstEvent = events[0];
      const stats = this.calculatePlayerStats(
        playerId,
        firstEvent.player!,
        firstEvent.team,
        events,
        minute
      );

      fixturePlayerStats.set(playerId, stats);

      if (stats.team === 'home') {
        homeStats.push(stats);
      } else {
        awayStats.push(stats);
      }
    });

    // Analyze teams
    const homeAnalysis: TeamPlayerAnalysis = {
      team: 'home',
      timestamp: Date.now(),
      minute,
      players: homeStats,
      topPerformers: this.getTopPerformers(homeStats, 3),
      keyAbsentPlayers: this.identifyKeyAbsentPlayers('home'),
      criticalPositions: this.identifyCriticalPositions(homeStats),
    };

    const awayAnalysis: TeamPlayerAnalysis = {
      team: 'away',
      timestamp: Date.now(),
      minute,
      players: awayStats,
      topPerformers: this.getTopPerformers(awayStats, 3),
      keyAbsentPlayers: this.identifyKeyAbsentPlayers('away'),
      criticalPositions: this.identifyCriticalPositions(awayStats),
    };

    // Emit updates
    this.io.emit('player-analysis-update', {
      fixtureId,
      home: homeAnalysis,
      away: awayAnalysis,
    });

    return { home: homeAnalysis, away: awayAnalysis };
  }

  /**
   * Calculate individual player statistics
   */
  private calculatePlayerStats(
    playerId: number,
    player: { name: string; position?: string },
    team: 'home' | 'away',
    events: MatchEvent[],
    minute: number
  ): PlayerStats {
    const shotCount = events.filter((e) => e.eventType === EventType.SHOT).length;
    const shotsOnTarget = events.filter((e) => e.eventType === EventType.SHOT_ON_TARGET).length;
    const passes = events.filter((e) => e.eventType === EventType.PASS).length;
    const tackles = events.filter((e) => e.eventType === EventType.TACKLE).length;
    const interceptions = events.filter((e) => e.eventType === EventType.INTERCEPTION).length;
    const fouls = events.filter((e) => e.eventType === EventType.FOUL).length;
    const cards = events.filter((e) =>
      [EventType.YELLOW_CARD, EventType.RED_CARD].includes(e.eventType)
    ).length;
    const goals = events.filter((e) => e.eventType === EventType.GOAL).length;
    const assists = events.filter((e) => e.assist !== undefined).length;

    // Calculate efficiency (positive events vs negative)
    const positiveEvents = shotCount + passes + tackles + interceptions + goals + assists;
    const negativeEvents = fouls + cards;
    const efficiency = Math.min(100, (positiveEvents - negativeEvents * 5) / Math.max(1, positiveEvents + negativeEvents) * 100 + 50);

    // Calculate impact score (-100 to +100)
    let impactScore = 0;
    impactScore += goals * 20;
    impactScore += assists * 15;
    impactScore += shotsOnTarget * 5;
    impactScore += tackles * 2;
    impactScore += interceptions * 3;
    impactScore -= fouls * 3;
    impactScore -= cards * 10;

    return {
      playerId,
      playerName: player.name,
      position: player.position || 'Unknown',
      team,
      minute,
      events,
      shotCount,
      shotsOnTarget,
      passes,
      tackles,
      interceptions,
      fouls,
      cards,
      goals,
      assists,
      impactScore: Math.max(-100, Math.min(100, impactScore)),
      efficiency: Math.max(0, Math.min(100, efficiency)),
      status: 'active',
      expectedImpact: 0,
    };
  }

  /**
   * Get top performers
   */
  private getTopPerformers(players: PlayerStats[], limit: number = 3): PlayerStats[] {
    return players.sort((a, b) => b.impactScore - a.impactScore).slice(0, limit);
  }

  /**
   * Identify key absent players
   */
  private identifyKeyAbsentPlayers(team: 'home' | 'away'): string[] {
    // This would typically be populated from injury/suspension data
    // For now, returning empty array as placeholder
    return [];
  }

  /**
   * Identify critical positions with weak performers
   */
  private identifyCriticalPositions(players: PlayerStats[]): string[] {
    const positionStats = new Map<string, number>();

    players.forEach((p) => {
      if (!positionStats.has(p.position)) {
        positionStats.set(p.position, 0);
      }
      positionStats.set(p.position, positionStats.get(p.position)! + p.impactScore);
    });

    const critical: string[] = [];
    positionStats.forEach((score, position) => {
      if (score < 0) {
        critical.push(position);
      }
    });

    return critical;
  }

  /**
   * Simulate impact of player absence
   */
  simulatePlayerAbsence(
    fixtureId: number,
    playerId: number,
    currentHomeWinProb: number,
    currentDrawProb: number,
    currentAwayWinProb: number
  ): PlayerAbsenceSimulation | null {
    const fixtureStats = this.playerStats.get(fixtureId);
    if (!fixtureStats) return null;

    const playerStats = fixtureStats.get(playerId);
    if (!playerStats) return null;

    // Calculate impact based on player impact score and position
    const impactMultiplier = this.getPositionImpactMultiplier(playerStats.position);
    const playerInfluence = (Math.abs(playerStats.impactScore) / 100) * impactMultiplier;

    // Determine how impact shifts probabilities
    let deltaMultiplier = 1;
    if (playerStats.team === 'home' && playerStats.impactScore > 0) {
      deltaMultiplier = -1; // Removing positive contributor hurts home
    } else if (playerStats.team === 'away' && playerStats.impactScore > 0) {
      deltaMultiplier = 1; // Removing positive contributor helps home
    }

    const probDelta = playerInfluence * deltaMultiplier * 0.15;

    return {
      playerId,
      playerName: playerStats.playerName,
      position: playerStats.position,
      homeWinProbDelta: playerStats.team === 'home' ? probDelta : -probDelta / 2,
      drawProbDelta: probDelta * 0.3,
      awayWinProbDelta: playerStats.team === 'away' ? probDelta : -probDelta / 2,
      impactDescription: this.generateImpactDescription(playerStats, probDelta),
    };
  }

  /**
   * Get position impact multiplier (defenders more important than strikers)
   */
  private getPositionImpactMultiplier(position: string): number {
    const pos = position.toLowerCase();
    if (pos.includes('goalkeeper') || pos.includes('gk')) return 1.5;
    if (pos.includes('defender') || pos.includes('defense')) return 1.3;
    if (pos.includes('midfielder') || pos.includes('midfield')) return 1.1;
    if (pos.includes('forward') || pos.includes('attacker')) return 0.9;
    return 1.0;
  }

  /**
   * Generate impact description
   */
  private generateImpactDescription(stats: PlayerStats, probDelta: number): string {
    const impact = Math.abs(probDelta) * 100;

    if (stats.position.toLowerCase().includes('goalkeeper')) {
      return `Loss of key goalkeeper (${stats.playerName}) could significantly impact defensive stability`;
    }

    if (stats.impactScore > 50) {
      return `${stats.playerName} has been a strong performer; his absence would be felt`;
    }

    if (stats.impactScore > 0) {
      return `${stats.playerName} has made positive contributions; absence is moderately impactful`;
    }

    return `${stats.playerName}'s absence has limited impact on overall team performance`;
  }

  /**
   * Get player comparison (head-to-head)
   */
  getPlayerComparison(
    fixtureId: number,
    playerId1: number,
    playerId2: number
  ): { player1: PlayerStats; player2: PlayerStats; advantage: string } | null {
    const fixtureStats = this.playerStats.get(fixtureId);
    if (!fixtureStats) return null;

    const p1 = fixtureStats.get(playerId1);
    const p2 = fixtureStats.get(playerId2);

    if (!p1 || !p2) return null;

    const advantage =
      p1.impactScore > p2.impactScore
        ? `${p1.playerName} has the edge`
        : `${p2.playerName} has the edge`;

    return { player1: p1, player2: p2, advantage };
  }

  /**
   * Get positional analysis
   */
  getPositionalAnalysis(
    fixtureId: number,
    team: 'home' | 'away'
  ): Record<string, { count: number; avgImpact: number; players: PlayerStats[] }> {
    const fixtureStats = this.playerStats.get(fixtureId);
    if (!fixtureStats) return {};

    const analysis: Record<string, { count: number; avgImpact: number; players: PlayerStats[] }> = {};

    Array.from(fixtureStats.values())
      .filter((s) => s.team === team)
      .forEach((stats) => {
        if (!analysis[stats.position]) {
          analysis[stats.position] = { count: 0, avgImpact: 0, players: [] };
        }
        analysis[stats.position].count++;
        analysis[stats.position].avgImpact += stats.impactScore;
        analysis[stats.position].players.push(stats);
      });

    // Calculate averages
    Object.values(analysis).forEach((pos) => {
      pos.avgImpact = pos.avgImpact / pos.count;
    });

    return analysis;
  }

  /**
   * Export player data for training
   */
  exportForTraining(fixtureId: number): {
    playerStats: PlayerStats[];
    positionalAnalysis: Record<string, any>;
    topPerformers: PlayerStats[];
  } {
    const fixtureStats = this.playerStats.get(fixtureId);
    const allStats = fixtureStats ? Array.from(fixtureStats.values()) : [];

    return {
      playerStats: allStats,
      positionalAnalysis: {
        home: this.getPositionalAnalysis(fixtureId, 'home'),
        away: this.getPositionalAnalysis(fixtureId, 'away'),
      },
      topPerformers: allStats.sort((a, b) => b.impactScore - a.impactScore).slice(0, 5),
    };
  }

  /**
   * Clear fixture data
   */
  clearFixture(fixtureId: number): void {
    this.playerStats.delete(fixtureId);
  }
}
