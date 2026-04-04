// src/services/telemetry/advancedTelemetryOrchestrator.ts
import { Server as SocketServer } from 'socket.io';
import { EventProcessor, MatchEvent, EventType } from '../events/eventProcessor';
import { DynamicProbabilityEngine } from '../analysis/dynamicProbabilityEngine';
import { MomentumDetector } from '../analysis/momentumDetector';
import { PlayerImpactAnalyzer } from '../analysis/playerImpactAnalyzer';
import { OddsIntelligence } from '../analysis/oddsIntelligence';
import { ConfidenceScorer } from '../analysis/confidenceScorer';
import { ExplainabilityEngine } from '../analysis/explainabilityEngine';
import { TrainingDataGenerator } from '../training/trainingDataGenerator';

export interface LiveMatchTelemetry {
  fixtureId: number;
  timestamp: number;
  minute: number;
  homeScore: number;
  awayScore: number;
  
  // Core predictions
  prediction: {
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
    confidence: number;
  };
  
  // Analysis summaries
  momentum: {
    home: any;
    away: any;
  };
  
  playerAnalysis: any;
  
  oddsAnalysis: any;
  
  riskAssessment: any;
  
  explanation: any;
  
  // Real-time metrics
  metrics: {
    totalEvents: number;
    shotsOnTarget: { home: number; away: number };
    possession: { home: number; away: number };
    corners: { home: number; away: number };
    cards: { home: number; away: number };
    xG: { home: number; away: number };
  };
  
  // Recommendation
  recommendation: {
    marketValue: string[];
    safeBets: string[];
    avoidBets: string[];
    riskLevel: string;
  };
}

export interface TelemetrySettings {
  updateFrequency: number; // ms between telemetry updates
  eventBatchSize: number; // events to batch before processing
  enableTrainingDataCollection: boolean;
  enableRealTimeExplanations: boolean;
  enableRiskAssessment: boolean;
}

export class AdvancedTelemetryOrchestrator {
  private eventProcessor: EventProcessor;
  private probabilityEngine: DynamicProbabilityEngine;
  private momentumDetector: MomentumDetector;
  private playerAnalyzer: PlayerImpactAnalyzer;
  private oddsIntelligence: OddsIntelligence;
  private confidenceScorer: ConfidenceScorer;
  private explainabilityEngine: ExplainabilityEngine;
  private trainingDataGenerator: TrainingDataGenerator;
  
  private io: SocketServer;
  private settings: TelemetrySettings;
  private activeMatches: Map<number, LiveMatchTelemetry> = new Map();
  private trainingDataCollected: Map<number, any[]> = new Map();
  private updateIntervals: Map<number, NodeJS.Timeout> = new Map();

  constructor(io: SocketServer, settings?: Partial<TelemetrySettings>) {
    this.io = io;
    
    // Initialize all engines
    this.eventProcessor = new EventProcessor(io);
    this.probabilityEngine = new DynamicProbabilityEngine(io);
    this.momentumDetector = new MomentumDetector(io);
    this.playerAnalyzer = new PlayerImpactAnalyzer(io);
    this.oddsIntelligence = new OddsIntelligence(io);
    this.confidenceScorer = new ConfidenceScorer(io);
    this.explainabilityEngine = new ExplainabilityEngine(io);
    this.trainingDataGenerator = new TrainingDataGenerator(
      this.eventProcessor,
      this.probabilityEngine,
      this.momentumDetector,
      this.playerAnalyzer,
      this.oddsIntelligence,
      this.confidenceScorer,
      this.explainabilityEngine
    );

    // Apply settings
    this.settings = {
      updateFrequency: settings?.updateFrequency || 10000, // 10 seconds
      eventBatchSize: settings?.eventBatchSize || 5,
      enableTrainingDataCollection: settings?.enableTrainingDataCollection ?? true,
      enableRealTimeExplanations: settings?.enableRealTimeExplanations ?? true,
      enableRiskAssessment: settings?.enableRiskAssessment ?? true,
    };

    console.log('[AdvancedTelemetryOrchestrator] Initialized with engines:');
    console.log('  - EventProcessor');
    console.log('  - DynamicProbabilityEngine');
    console.log('  - MomentumDetector');
    console.log('  - PlayerImpactAnalyzer');
    console.log('  - OddsIntelligence');
    console.log('  - ConfidenceScorer');
    console.log('  - ExplainabilityEngine');
    console.log('  - TrainingDataGenerator');
  }

  /**
   * Start live telemetry for a match
   */
  startLiveMatch(fixtureId: number, homeTeam: string, awayTeam: string): void {
    console.log(`[TelemetryOrchestrator] Starting live match: ${homeTeam} vs ${awayTeam} (Fixture ${fixtureId})`);

    // Initialize data collection
    this.activeMatches.set(fixtureId, {
      fixtureId,
      timestamp: Date.now(),
      minute: 0,
      homeScore: 0,
      awayScore: 0,
      prediction: { homeWinProb: 0.4, drawProb: 0.3, awayWinProb: 0.3, confidence: 0.3 },
      momentum: { home: {}, away: {} },
      playerAnalysis: {},
      oddsAnalysis: {},
      riskAssessment: {},
      explanation: {},
      metrics: {
        totalEvents: 0,
        shotsOnTarget: { home: 0, away: 0 },
        possession: { home: 50, away: 50 },
        corners: { home: 0, away: 0 },
        cards: { home: 0, away: 0 },
        xG: { home: 0, away: 0 },
      },
      recommendation: {
        marketValue: [],
        safeBets: [],
        avoidBets: [],
        riskLevel: 'low',
      },
    });

    if (this.settings.enableTrainingDataCollection) {
      this.trainingDataCollected.set(fixtureId, []);
    }

    // Emit match started
    this.io.emit('match-started', {
      fixtureId,
      homeTeam,
      awayTeam,
      timestamp: Date.now(),
    });

    // Set up periodic telemetry updates
    const updateInterval = setInterval(() => {
      this.updateLiveTelemetry(fixtureId);
    }, this.settings.updateFrequency);

    this.updateIntervals.set(fixtureId, updateInterval);
  }

  /**
   * Process incoming match event
   */
  processMatchEvent(
    fixtureId: number,
    event: MatchEvent,
    homeScore: number,
    awayScore: number,
    minute: number,
    homeOdds?: number,
    drawOdds?: number,
    awayOdds?: number
  ): void {
    // Process event through event processor
    this.eventProcessor.processEvent(event);

    // Get all events so far
    const allEvents = this.eventProcessor.getFixtureEvents(fixtureId);

    // Update predictions
    const probs = this.probabilityEngine.updateProbabilities(
      fixtureId,
      homeScore,
      awayScore,
      allEvents,
      minute
    );

    // Update momentum
    const momentum = this.momentumDetector.calculateMomentum(
      fixtureId,
      allEvents,
      minute,
      homeScore,
      awayScore
    );

    // Update player analysis
    const playerAnalysis = this.playerAnalyzer.updatePlayerStats(fixtureId, allEvents, minute);

    // Analyze odds if provided
    let oddsAnalysis: any = null;
    if (homeOdds && drawOdds && awayOdds) {
      oddsAnalysis = this.oddsIntelligence.analyzeOdds(
        fixtureId,
        homeOdds,
        drawOdds,
        awayOdds,
        probs,
        allEvents,
        minute
      );
    }

    // Calculate confidence
    const confidence = this.confidenceScorer.calculateConfidence(
      fixtureId,
      probs,
      momentum,
      allEvents,
      minute,
      oddsAnalysis?.valueOpportunities?.length ? 0.8 : 0.5 // market agreement proxy
    );

    // Generate explanation if enabled
    let explanation: any = null;
    if (this.settings.enableRealTimeExplanations) {
      const topPlayers = {
        home: playerAnalysis.home.topPerformers || [],
        away: playerAnalysis.away.topPerformers || [],
      };

      explanation = this.explainabilityEngine.generateExplanation(
        fixtureId,
        probs,
        momentum,
        allEvents,
        topPlayers,
        minute
      );
    }

    // Collect training data if enabled
    if (this.settings.enableTrainingDataCollection) {
      const trainingPoint = this.trainingDataGenerator.generateDataPoint(
        fixtureId,
        minute,
        homeScore,
        awayScore,
        homeOdds || 2.0,
        drawOdds || 3.0,
        awayOdds || 2.0
      );

      const collected = this.trainingDataCollected.get(fixtureId) || [];
      collected.push(trainingPoint);
      this.trainingDataCollected.set(fixtureId, collected);
    }

    // Generate recommendations
    const recommendation = this.generateRecommendation(
      probs,
      oddsAnalysis,
      confidence,
      this.settings.enableRiskAssessment
        ? this.confidenceScorer.calculateBettingRisk(
            fixtureId,
            probs,
            momentum,
            allEvents,
            minute
          )
        : null
    );

    // Extract metrics
    const metrics = this.extractMetrics(allEvents, homeScore, awayScore);

    // Update active match
    const activeTelemetry: LiveMatchTelemetry = {
      fixtureId,
      timestamp: Date.now(),
      minute,
      homeScore,
      awayScore,
      prediction: {
        homeWinProb: probs.homeWinProb,
        drawProb: probs.drawProb,
        awayWinProb: probs.awayWinProb,
        confidence: probs.confidence,
      },
      momentum,
      playerAnalysis,
      oddsAnalysis,
      riskAssessment: this.settings.enableRiskAssessment
        ? this.confidenceScorer.calculateBettingRisk(
            fixtureId,
            probs,
            momentum,
            allEvents,
            minute
          )
        : {},
      explanation,
      metrics,
      recommendation,
    };

    this.activeMatches.set(fixtureId, activeTelemetry);

    // Emit event processed
    this.io.emit('event-processed', {
      fixtureId,
      telemetry: activeTelemetry,
      eventType: event.eventType,
    });

    console.log(
      `[TelemetryOrchestrator] Event processed: ${event.eventType} at ${minute}' - ` +
        `${fixtureId} (Home: ${probs.homeWinProb.toFixed(2)}, Draw: ${probs.drawProb.toFixed(2)}, Away: ${probs.awayWinProb.toFixed(2)})`
    );
  }

  /**
   * Update live telemetry (periodic)
   */
  private updateLiveTelemetry(fixtureId: number): void {
    const telemetry = this.activeMatches.get(fixtureId);
    if (!telemetry) return;

    // Emit current state to all connected clients
    this.io.emit('telemetry-update', {
      fixtureId,
      telemetry,
      timestamp: Date.now(),
    });
  }

  /**
   * Generate betting recommendations
   */
  private generateRecommendation(
    probs: any,
    oddsAnalysis: any,
    confidence: any,
    riskData: any | null
  ): {
    marketValue: string[];
    safeBets: string[];
    avoidBets: string[];
    riskLevel: string;
  } {
    const marketValue: string[] = [];
    const safeBets: string[] = [];
    const avoidBets: string[] = [];

    // Market value from odds analysis
    if (oddsAnalysis?.valueOpportunities) {
      oddsAnalysis.valueOpportunities.forEach((opp: any) => {
        if (opp.recommendation === 'strong_value') {
          marketValue.push(`${opp.market} (${(opp.value * 100).toFixed(1)}% value)`);
        }
      });
    }

    // Safe bets
    if (probs.homeWinProb > 0.65 && confidence.overallConfidence > 70) {
      safeBets.push('Home Win');
    }
    if (probs.awayWinProb > 0.65 && confidence.overallConfidence > 70) {
      safeBets.push('Away Win');
    }
    if (probs.drawProb > 0.4 && confidence.overallConfidence > 70) {
      safeBets.push('Draw');
    }

    // Avoid bets (low probability + uncertain)
    if (probs.drawProb < 0.2 && confidence.overallConfidence < 50) {
      avoidBets.push('Draw');
    }

    // Risk level
    let riskLevel = 'low';
    if (riskData?.accumulatorRisk > 60) {
      riskLevel = 'high';
    } else if (riskData?.accumulatorRisk > 40) {
      riskLevel = 'medium';
    }

    return {
      marketValue: marketValue.slice(0, 2),
      safeBets,
      avoidBets,
      riskLevel,
    };
  }

  /**
   * Extract match metrics
   */
  private extractMetrics(events: MatchEvent[], homeScore: number, awayScore: number): any {
    const homeEvents = events.filter((e) => e.team === 'home');
    const awayEvents = events.filter((e) => e.team === 'away');

    return {
      totalEvents: events.length,
      shotsOnTarget: {
        home: homeEvents.filter((e) => e.eventType === EventType.SHOT_ON_TARGET).length,
        away: awayEvents.filter((e) => e.eventType === EventType.SHOT_ON_TARGET).length,
      },
      possession: {
        home: homeEvents.filter((e) => e.eventType === EventType.PASS).length,
        away: awayEvents.filter((e) => e.eventType === EventType.PASS).length,
      },
      corners: {
        home: homeEvents.filter((e) => e.eventType === EventType.CORNER).length,
        away: awayEvents.filter((e) => e.eventType === EventType.CORNER).length,
      },
      cards: {
        home: homeEvents.filter((e) =>
          [EventType.YELLOW_CARD, EventType.RED_CARD].includes(e.eventType)
        ).length,
        away: awayEvents.filter((e) =>
          [EventType.YELLOW_CARD, EventType.RED_CARD].includes(e.eventType)
        ).length,
      },
      xG: {
        home: homeEvents.reduce((sum, e) => sum + (e.metadata?.xG || 0), 0),
        away: awayEvents.reduce((sum, e) => sum + (e.metadata?.xG || 0), 0),
      },
    };
  }

  /**
   * End match and export training data
   */
  endMatch(fixtureId: number, finalHomeScore: number, finalAwayScore: number, homeTeam: string, awayTeam: string): {
    trainingDataset: any;
    matchSummary: any;
  } {
    console.log(`[TelemetryOrchestrator] Ending match ${fixtureId}`);

    // Clear update interval
    const interval = this.updateIntervals.get(fixtureId);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(fixtureId);
    }

    // Generate final training dataset
    let trainingDataset = null;
    if (this.settings.enableTrainingDataCollection) {
      const dataPoints = this.trainingDataCollected.get(fixtureId) || [];
      
      // Update all data points with final result
      const finalResult = finalHomeScore > finalAwayScore
        ? 'home_win'
        : finalHomeScore < finalAwayScore
        ? 'away_win'
        : 'draw';

      dataPoints.forEach((dp) => {
        dp.target.finalResult = finalResult;
      });

      trainingDataset = this.trainingDataGenerator.generateTrainingDataset(
        fixtureId,
        'Unknown',
        homeTeam,
        awayTeam,
        dataPoints
      );

      this.trainingDataCollected.delete(fixtureId);
    }

    // Generate match summary
    const matchSummary = {
      fixtureId,
      result: `${finalHomeScore} - ${finalAwayScore}`,
      totalEvents: this.eventProcessor.getFixtureEvents(fixtureId).length,
      timestamp: Date.now(),
    };

    // Clean up fixture data
    this.eventProcessor.clearFixture(fixtureId);
    this.probabilityEngine.clearFixture(fixtureId);
    this.momentumDetector.clearFixture(fixtureId);
    this.playerAnalyzer.clearFixture(fixtureId);
    this.oddsIntelligence.clearFixture(fixtureId);
    this.confidenceScorer.clearFixture(fixtureId);
    this.explainabilityEngine.clearFixture(fixtureId);

    this.activeMatches.delete(fixtureId);

    // Emit match ended
    this.io.emit('match-ended', {
      fixtureId,
      matchSummary,
      trainingDataset: trainingDataset ? { hasData: true } : { hasData: false },
    });

    return {
      trainingDataset,
      matchSummary,
    };
  }

  /**
   * Get live telemetry for a match
   */
  getLiveTelemetry(fixtureId: number): LiveMatchTelemetry | null {
    return this.activeMatches.get(fixtureId) || null;
  }

  /**
   * Get training dataset
   */
  getTrainingDataset(fixtureId: number): any {
    return this.trainingDataCollected.get(fixtureId);
  }

  /**
   * Update settings
   */
  updateSettings(newSettings: Partial<TelemetrySettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    console.log('[TelemetryOrchestrator] Settings updated:', this.settings);
  }

  /**
   * Get settings
   */
  getSettings(): TelemetrySettings {
    return { ...this.settings };
  }
}
