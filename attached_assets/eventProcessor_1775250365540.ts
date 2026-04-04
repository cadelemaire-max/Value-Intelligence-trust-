// src/services/events/eventProcessor.ts
import { Server as SocketServer } from 'socket.io';

export interface MatchEvent {
  fixtureId: number;
  eventId: string;
  timestamp: number;
  minute: number;
  second: number;
  eventType: EventType;
  team: 'home' | 'away';
  player?: {
    id: number;
    name: string;
    position?: string;
  };
  assist?: {
    id: number;
    name: string;
  };
  details: Record<string, any>;
  metadata?: {
    xG?: number; // Expected goals impact
    pressureLevel?: number; // 0-100
    spatialZone?: string; // defensive, midfield, attacking
    velocity?: number; // pass velocity, shot power
  };
}

export enum EventType {
  SHOT = 'shot',
  SHOT_ON_TARGET = 'shot_on_target',
  GOAL = 'goal',
  MISS = 'miss',
  POST = 'post',
  PASS = 'pass',
  TACKLE = 'tackle',
  INTERCEPTION = 'interception',
  CLEARANCE = 'clearance',
  FOUL = 'foul',
  YELLOW_CARD = 'yellow_card',
  RED_CARD = 'red_card',
  SUBSTITUTION = 'substitution',
  CORNER = 'corner',
  THROW_IN = 'throw_in',
  PENALTY = 'penalty',
  FREE_KICK = 'free_kick',
  OFFSIDE = 'offside',
  INJURY = 'injury',
  POSSESSION_CHANGE = 'possession_change',
  HALF_START = 'half_start',
  HALF_END = 'half_end',
  MATCH_END = 'match_end',
}

export interface EventSequence {
  fixtureId: number;
  events: MatchEvent[];
  lastUpdateTime: number;
  sequenceId: string;
}

export class EventProcessor {
  private eventQueue: Map<number, MatchEvent[]> = new Map();
  private eventSequences: Map<number, EventSequence> = new Map();
  private io: SocketServer;

  constructor(io: SocketServer) {
    this.io = io;
  }

  /**
   * Process a raw match event and emit it to subscribers
   */
  processEvent(event: MatchEvent): void {
    const fixtureId = event.fixtureId;

    // Add to queue
    if (!this.eventQueue.has(fixtureId)) {
      this.eventQueue.set(fixtureId, []);
    }
    this.eventQueue.get(fixtureId)!.push(event);

    // Update sequence
    this.updateEventSequence(event);

    // Emit event via WebSocket
    this.io.emit('match-event', {
      fixtureId,
      event,
      timestamp: Date.now(),
    });

    // Emit specific event type for targeted listeners
    this.io.emit(`event:${event.eventType}`, {
      fixtureId,
      event,
      timestamp: Date.now(),
    });

    console.log(
      `[EventProcessor] Event captured: ${event.eventType} at ${event.minute}:${event.second} (${event.team}) - ${event.player?.name || 'System'}`
    );
  }

  /**
   * Batch process multiple events
   */
  processBatch(fixtureId: number, events: MatchEvent[]): void {
    events.forEach((event) => {
      event.fixtureId = fixtureId;
      this.processEvent(event);
    });
  }

  /**
   * Get event sequence for a fixture
   */
  getEventSequence(fixtureId: number): EventSequence | null {
    return this.eventSequences.get(fixtureId) || null;
  }

  /**
   * Get all events for a fixture
   */
  getFixtureEvents(fixtureId: number): MatchEvent[] {
    return this.eventQueue.get(fixtureId) || [];
  }

  /**
   * Get events within a time window
   */
  getEventsInWindow(
    fixtureId: number,
    startMinute: number,
    endMinute: number
  ): MatchEvent[] {
    const events = this.eventQueue.get(fixtureId) || [];
    return events.filter((e) => e.minute >= startMinute && e.minute <= endMinute);
  }

  /**
   * Get events by type
   */
  getEventsByType(fixtureId: number, eventType: EventType): MatchEvent[] {
    const events = this.eventQueue.get(fixtureId) || [];
    return events.filter((e) => e.eventType === eventType);
  }

  /**
   * Get events by team
   */
  getEventsByTeam(
    fixtureId: number,
    team: 'home' | 'away'
  ): MatchEvent[] {
    const events = this.eventQueue.get(fixtureId) || [];
    return events.filter((e) => e.team === team);
  }

  /**
   * Get event frequency by type
   */
  getEventFrequency(fixtureId: number): Record<EventType, number> {
    const events = this.eventQueue.get(fixtureId) || [];
    const frequency: Record<string, number> = {};

    events.forEach((event) => {
      frequency[event.eventType] = (frequency[event.eventType] || 0) + 1;
    });

    return frequency as Record<EventType, number>;
  }

  /**
   * Calculate event momentum score
   */
  getEventMomentum(fixtureId: number, team: 'home' | 'away'): number {
    const events = this.eventQueue.get(fixtureId) || [];
    const recentEvents = events.slice(-20); // Last 20 events

    let score = 0;
    recentEvents.forEach((event) => {
      if (event.team !== team) return;

      switch (event.eventType) {
        case EventType.GOAL:
          score += 50;
          break;
        case EventType.SHOT_ON_TARGET:
          score += 15;
          break;
        case EventType.SHOT:
          score += 8;
          break;
        case EventType.PASS:
          score += 1;
          break;
        case EventType.TACKLE:
          score += 3;
          break;
        case EventType.INTERCEPTION:
          score += 5;
          break;
        case EventType.CORNER:
          score += 4;
          break;
        case EventType.RED_CARD:
          score -= 30;
          break;
        case EventType.YELLOW_CARD:
          score -= 5;
          break;
        default:
          break;
      }
    });

    return score;
  }

  /**
   * Detect attacking sequences
   */
  getAttackingSequences(fixtureId: number, team: 'home' | 'away'): MatchEvent[][] {
    const events = this.eventQueue.get(fixtureId) || [];
    const teamEvents = events.filter((e) => e.team === team);
    const sequences: MatchEvent[][] = [];
    let currentSequence: MatchEvent[] = [];

    teamEvents.forEach((event) => {
      if ([EventType.PASS, EventType.SHOT, EventType.SHOT_ON_TARGET, EventType.GOAL].includes(event.eventType)) {
        currentSequence.push(event);
      } else if (event.eventType === EventType.POSSESSION_CHANGE) {
        if (currentSequence.length > 0) {
          sequences.push([...currentSequence]);
          currentSequence = [];
        }
      }
    });

    if (currentSequence.length > 0) {
      sequences.push(currentSequence);
    }

    return sequences;
  }

  /**
   * Update event sequence
   */
  private updateEventSequence(event: MatchEvent): void {
    const fixtureId = event.fixtureId;

    if (!this.eventSequences.has(fixtureId)) {
      this.eventSequences.set(fixtureId, {
        fixtureId,
        events: [],
        lastUpdateTime: Date.now(),
        sequenceId: this.generateSequenceId(),
      });
    }

    const sequence = this.eventSequences.get(fixtureId)!;
    sequence.events.push(event);
    sequence.lastUpdateTime = Date.now();
  }

  /**
   * Clear events for a fixture
   */
  clearFixture(fixtureId: number): void {
    this.eventQueue.delete(fixtureId);
    this.eventSequences.delete(fixtureId);
  }

  /**
   * Export events for training/analysis
   */
  exportEventsForTraining(
    fixtureId: number
  ): {
    fixtureId: number;
    totalEvents: number;
    events: MatchEvent[];
    statistics: Record<string, any>;
  } {
    const events = this.eventQueue.get(fixtureId) || [];
    const stats = this.calculateEventStatistics(fixtureId);

    return {
      fixtureId,
      totalEvents: events.length,
      events,
      statistics: stats,
    };
  }

  /**
   * Calculate comprehensive event statistics
   */
  private calculateEventStatistics(fixtureId: number): Record<string, any> {
    const events = this.eventQueue.get(fixtureId) || [];
    const homeEvents = events.filter((e) => e.team === 'home');
    const awayEvents = events.filter((e) => e.team === 'away');

    return {
      totalEvents: events.length,
      homeEvents: homeEvents.length,
      awayEvents: awayEvents.length,
      homeGoals: homeEvents.filter((e) => e.eventType === EventType.GOAL).length,
      awayGoals: awayEvents.filter((e) => e.eventType === EventType.GOAL).length,
      homeShotsOnTarget: homeEvents.filter(
        (e) => e.eventType === EventType.SHOT_ON_TARGET
      ).length,
      awayShotsOnTarget: awayEvents.filter(
        (e) => e.eventType === EventType.SHOT_ON_TARGET
      ).length,
      homeCorners: homeEvents.filter((e) => e.eventType === EventType.CORNER).length,
      awayCorners: awayEvents.filter((e) => e.eventType === EventType.CORNER).length,
      homeCards: homeEvents.filter(
        (e) => [EventType.YELLOW_CARD, EventType.RED_CARD].includes(e.eventType)
      ).length,
      awayCards: awayEvents.filter(
        (e) => [EventType.YELLOW_CARD, EventType.RED_CARD].includes(e.eventType)
      ).length,
      homeSubstitutions: homeEvents.filter((e) => e.eventType === EventType.SUBSTITUTION).length,
      awaySubstitutions: awayEvents.filter((e) => e.eventType === EventType.SUBSTITUTION).length,
    };
  }

  private generateSequenceId(): string {
    return `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
