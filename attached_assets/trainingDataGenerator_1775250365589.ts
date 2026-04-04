// src/services/training/trainingDataGenerator.ts
import { EventProcessor } from '../events/eventProcessor';
import { DynamicProbabilityEngine } from '../analysis/dynamicProbabilityEngine';
import { MomentumDetector } from '../analysis/momentumDetector';
import { PlayerImpactAnalyzer } from '../analysis/playerImpactAnalyzer';
import { OddsIntelligence } from '../analysis/oddsIntelligence';
import { ConfidenceScorer } from '../analysis/confidenceScorer';
import { ExplainabilityEngine } from '../analysis/explainabilityEngine';

export interface TrainingDataPoint {
  fixtureId: number;
  timestamp: number;
  minute: number;
  target: {
    finalResult: 'home_win' | 'draw' | 'away_win'; // Only filled after match ends
    homeScore: number;
    awayScore: number;
  };
  features: {
    // Event-based features
    eventFeatures: Record<string, number>;
    
    // Probability features
    probabilityFeatures: {
      homeWinProb: number;
      drawProb: number;
      awayWinProb: number;
      probabilityConfidence: number;
    };
    
    // Momentum features
    momentumFeatures: {
      homeMomentum: number;
      awayMomentum: number;
      homeAttacking: number;
      awayAttacking: number;
      homeDefensive: number;
      awayDefensive: number;
      homePossession: number;
      awayPossession: number;
    };
    
    // Player features
    playerFeatures: {
      homeTopPlayerImpact: number;
      awayTopPlayerImpact: number;
      homeSuspendedCount: number;
      awaySuspendedCount: number;
      homeInjuredCount: number;
      awayInjuredCount: number;
    };
    
    // Odds features
    oddsFeatures: {
      homeOdds: number;
      drawOdds: number;
      awayOdds: number;
      impliedHomeWin: number;
      impliedDraw: number;
      impliedAwayWin: number;
      oddsVolatility: number;
      marketSentiment: string;
    };
    
    // Risk features
    riskFeatures: {
      accumulatorRisk: number;
      singleBetRisk: number;
      drawRisk: number;
      warningLevel: string;
    };
    
    // Contextual features
    contextFeatures: {
      minute: number;
      minutesRemaining: number;
      homeScore: number;
      awayScore: number;
      scoreDifferential: number;
      isSecondHalf: boolean;
      isLateGame: boolean;
    };
  };
  metadata: {
    confidence: number;
    eventCount: number;
    dataQuality: number; // 0-1
    sources: string[];
  };
}

export interface TrainingDataset {
  fixtureId: number;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  dataPoints: TrainingDataPoint[];
  aggregatedStats: {
    totalEvents: number;
    totalMinutesTracked: number;
    averageConfidence: number;
    dataQuality: number;
    features: {
      engineered: number;
      domains: string[];
    };
  };
}

export class TrainingDataGenerator {
  constructor(
    private eventProcessor: EventProcessor,
    private probabilityEngine: DynamicProbabilityEngine,
    private momentumDetector: MomentumDetector,
    private playerAnalyzer: PlayerImpactAnalyzer,
    private oddsIntelligence: OddsIntelligence,
    private confidenceScorer: ConfidenceScorer,
    private explainabilityEngine: ExplainabilityEngine
  ) {}

  /**
   * Generate a single training data point
   */
  generateDataPoint(
    fixtureId: number,
    minute: number,
    homeScore: number,
    awayScore: number,
    homeOdds: number,
    drawOdds: number,
    awayOdds: number
  ): TrainingDataPoint {
    // Get data from all engines
    const events = this.eventProcessor.getFixtureEvents(fixtureId);
    const probabilities = this.probabilityEngine.getCurrentProbabilities(fixtureId);
    const momentum = {
      home: this.momentumDetector.getMomentumHistory(fixtureId, 'home').slice(-1)[0],
      away: this.momentumDetector.getMomentumHistory(fixtureId, 'away').slice(-1)[0],
    };
    const playerStats = this.playerAnalyzer.exportForTraining(fixtureId);
    const oddsData = this.oddsIntelligence.getOddsHistory(fixtureId).slice(-1)[0];
    const confidenceData = {
      overallConfidence: 0,
      warningLevel: 'low' as const,
    };
    const riskData = this.confidenceScorer.calculateBettingRisk(
      fixtureId,
      probabilities || this.initializeProbabilities(fixtureId),
      momentum || this.initializeMomentum(),
      events,
      minute
    );

    // Build features
    const features = {
      eventFeatures: this.extractEventFeatures(events),
      probabilityFeatures: {
        homeWinProb: probabilities?.homeWinProb || 0.4,
        drawProb: probabilities?.drawProb || 0.3,
        awayWinProb: probabilities?.awayWinProb || 0.3,
        probabilityConfidence: probabilities?.confidence || 0.3,
      },
      momentumFeatures: {
        homeMomentum: momentum?.home?.score || 0,
        awayMomentum: momentum?.away?.score || 0,
        homeAttacking: momentum?.home?.attackingStrength || 50,
        awayAttacking: momentum?.away?.attackingStrength || 50,
        homeDefensive: momentum?.home?.defensiveStrength || 50,
        awayDefensive: momentum?.away?.defensiveStrength || 50,
        homePossession: momentum?.home?.possession || 50,
        awayPossession: momentum?.away?.possession || 50,
      },
      playerFeatures: {
        homeTopPlayerImpact: playerStats.topPerformers?.[0]?.impactScore || 0,
        awayTopPlayerImpact:
          playerStats.topPerformers?.[1]?.impactScore || 0,
        homeSuspendedCount: 0, // Would come from injury API
        awaySuspendedCount: 0,
        homeInjuredCount: 0,
        awayInjuredCount: 0,
      },
      oddsFeatures: {
        homeOdds,
        drawOdds,
        awayOdds,
        impliedHomeWin: oddsData ? 1 / homeOdds : 0,
        impliedDraw: oddsData ? 1 / drawOdds : 0,
        impliedAwayWin: oddsData ? 1 / awayOdds : 0,
        oddsVolatility: 0, // Would calculate from odds history
        marketSentiment: 'neutral',
      },
      riskFeatures: {
        accumulatorRisk: riskData.accumulatorRisk,
        singleBetRisk: riskData.singleBetRisk,
        drawRisk: riskData.drawRisk,
        warningLevel: riskData.keyRisks.length > 0 ? 'high' : 'low',
      },
      contextFeatures: {
        minute,
        minutesRemaining: 90 - minute,
        homeScore,
        awayScore,
        scoreDifferential: homeScore - awayScore,
        isSecondHalf: minute >= 45,
        isLateGame: minute >= 75,
      },
    };

    return {
      fixtureId,
      timestamp: Date.now(),
      minute,
      target: {
        finalResult: 'home_win', // Will be updated when match ends
        homeScore,
        awayScore,
      },
      features,
      metadata: {
        confidence: probabilities?.confidence || 0.3,
        eventCount: events.length,
        dataQuality: this.calculateDataQuality(events, minute),
        sources: [
          'eventProcessor',
          'probabilityEngine',
          'momentumDetector',
          'playerAnalyzer',
          'oddsIntelligence',
          'confidenceScorer',
        ],
      },
    };
  }

  /**
   * Generate full training dataset for a match
   */
  generateTrainingDataset(
    fixtureId: number,
    competition: string,
    homeTeam: string,
    awayTeam: string,
    dataPoints: TrainingDataPoint[]
  ): TrainingDataset {
    // Calculate aggregated statistics
    const totalEvents = this.eventProcessor.getFixtureEvents(fixtureId).length;
    const totalMinutesTracked = dataPoints.length;
    const averageConfidence =
      dataPoints.reduce((sum, dp) => sum + dp.metadata.confidence, 0) /
      dataPoints.length;
    const averageDataQuality =
      dataPoints.reduce((sum, dp) => sum + dp.metadata.dataQuality, 0) /
      dataPoints.length;

    // Collect engineered features
    const engineeredFeatures = new Set<string>();
    dataPoints.forEach((dp) => {
      Object.keys(dp.features).forEach((key) => {
        engineeredFeatures.add(key);
      });
    });

    return {
      fixtureId,
      competition,
      homeTeam,
      awayTeam,
      date: new Date().toISOString(),
      dataPoints,
      aggregatedStats: {
        totalEvents,
        totalMinutesTracked,
        averageConfidence,
        dataQuality: averageDataQuality,
        features: {
          engineered: Array.from(engineeredFeatures).reduce(
            (count, key) => count + Object.keys(this.getFeatureSubObject(key)).length,
            0
          ),
          domains: [
            'events',
            'probability',
            'momentum',
            'players',
            'odds',
            'risk',
            'context',
          ],
        },
      },
    };
  }

  /**
   * Extract event-based features
   */
  private extractEventFeatures(events: any[]): Record<string, number> {
    const features: Record<string, number> = {};

    // Shot statistics
    features['total_shots'] = events.filter((e) => e.eventType === 'shot').length;
    features['shots_on_target'] = events.filter(
      (e) => e.eventType === 'shot_on_target'
    ).length;
    features['goals'] = events.filter((e) => e.eventType === 'goal').length;

    // Passing
    features['total_passes'] = events.filter((e) => e.eventType === 'pass').length;
    features['pass_accuracy'] = features['total_passes'] > 0 ? 0.85 : 0; // Placeholder

    // Defensive
    features['tackles'] = events.filter((e) => e.eventType === 'tackle').length;
    features['interceptions'] = events.filter(
      (e) => e.eventType === 'interception'
    ).length;
    features['clearances'] = events.filter(
      (e) => e.eventType === 'clearance'
    ).length;

    // Set pieces
    features['corners'] = events.filter((e) => e.eventType === 'corner').length;
    features['free_kicks'] = events.filter(
      (e) => e.eventType === 'free_kick'
    ).length;

    // Discipline
    features['yellow_cards'] = events.filter(
      (e) => e.eventType === 'yellow_card'
    ).length;
    features['red_cards'] = events.filter((e) => e.eventType === 'red_card')
      .length;

    // Home vs Away split
    const homeEvents = events.filter((e) => e.team === 'home');
    const awayEvents = events.filter((e) => e.team === 'away');

    features['home_shots'] = homeEvents.filter(
      (e) => e.eventType === 'shot'
    ).length;
    features['away_shots'] = awayEvents.filter(
      (e) => e.eventType === 'shot'
    ).length;
    features['home_tackles'] = homeEvents.filter(
      (e) => e.eventType === 'tackle'
    ).length;
    features['away_tackles'] = awayEvents.filter(
      (e) => e.eventType === 'tackle'
    ).length;

    return features;
  }

  /**
   * Calculate data quality score
   */
  private calculateDataQuality(events: any[], minute: number): number {
    // Quality increases with:
    // 1. More events captured
    // 2. Match progression
    // 3. Data variety

    const eventQuality = Math.min(1, events.length / 100);
    const progressQuality = minute / 90;
    const varietyQuality = Math.min(1, new Set(events.map((e) => e.eventType)).size / 15);

    return (eventQuality + progressQuality + varietyQuality) / 3;
  }

  /**
   * Get feature sub-object keys
   */
  private getFeatureSubObject(key: string): Record<string, number> {
    // This would return the appropriate sub-object based on key
    return {};
  }

  /**
   * Export dataset for training
   */
  exportForTraining(dataset: TrainingDataset): string {
    // Convert to JSON for export
    return JSON.stringify(dataset, null, 2);
  }

  /**
   * Export dataset for CSV (for ML frameworks)
   */
  exportAsCSV(dataset: TrainingDataset): string {
    const headers = this.generateCSVHeaders(dataset.dataPoints[0]);
    const rows = dataset.dataPoints.map((dp) => this.dataPointToCSVRow(dp));

    return [headers, ...rows].join('\n');
  }

  /**
   * Generate CSV headers
   */
  private generateCSVHeaders(dataPoint: TrainingDataPoint): string {
    const headers: string[] = [
      'fixtureId',
      'minute',
      'homeScore',
      'awayScore',
      'finalResult',
    ];

    // Add feature headers
    Object.keys(dataPoint.features).forEach((featureDomain) => {
      const subFeatures = dataPoint.features[featureDomain as keyof typeof dataPoint.features];
      if (typeof subFeatures === 'object') {
        Object.keys(subFeatures).forEach((featureName) => {
          headers.push(`${featureDomain}_${featureName}`);
        });
      }
    });

    headers.push('confidence', 'dataQuality');

    return headers.join(',');
  }

  /**
   * Convert data point to CSV row
   */
  private dataPointToCSVRow(dataPoint: TrainingDataPoint): string {
    const values: (string | number)[] = [
      dataPoint.fixtureId,
      dataPoint.minute,
      dataPoint.target.homeScore,
      dataPoint.target.awayScore,
      dataPoint.target.finalResult,
    ];

    // Add feature values
    Object.values(dataPoint.features).forEach((subFeatures) => {
      if (typeof subFeatures === 'object') {
        Object.values(subFeatures).forEach((value) => {
          values.push(value);
        });
      }
    });

    values.push(dataPoint.metadata.confidence, dataPoint.metadata.dataQuality);

    return values.map((v) => (typeof v === 'string' ? `"${v}"` : v)).join(',');
  }

  /**
   * Initialize placeholder probability state
   */
  private initializeProbabilities(fixtureId: number) {
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
   * Initialize placeholder momentum
   */
  private initializeMomentum() {
    return {
      home: {
        team: 'home' as const,
        timestamp: Date.now(),
        minute: 0,
        score: 0,
        trend: 'stable' as const,
        trendStrength: 0,
        attackingStrength: 50,
        defensiveStrength: 50,
        possession: 50,
        recentFormRating: 50,
        riskLevel: 'medium' as const,
        keyFactors: [],
      },
      away: {
        team: 'away' as const,
        timestamp: Date.now(),
        minute: 0,
        score: 0,
        trend: 'stable' as const,
        trendStrength: 0,
        attackingStrength: 50,
        defensiveStrength: 50,
        possession: 50,
        recentFormRating: 50,
        riskLevel: 'medium' as const,
        keyFactors: [],
      },
    };
  }
}
