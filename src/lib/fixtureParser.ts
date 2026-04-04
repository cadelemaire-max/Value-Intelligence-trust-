import Papa from 'papaparse';
import { PredictionSignal } from '../types';
import { calculateKelly } from './riskEngine';

export const parseFixturesCSV = async (csvUrl: string): Promise<PredictionSignal[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      complete: (results) => {
        const signals: PredictionSignal[] = results.data
          .filter((row: any) => row.homeTeam && row.awayTeam) // Filter out empty rows
          .map((row: any, index: number) => {
            const homeXG = Number(row.homeXG || row.home_xG || 1.25);
            const awayXG = Number(row.awayXG || row.away_xG || 1.1);
            const baseProbability = Number(row.probability || row.prob || 0.5);
            const probability = Math.max(0.08, Math.min(0.92, baseProbability));
            const odds = Number(row.odds || row.marketOdds || (1 / probability));
            const impliedEdge = (probability * odds) - 1;
            const kelly = calculateKelly(
              probability,
              odds,
              {
                bankroll: 1000,
                fractionalKelly: 0.25,
                maxBetPercentage: 0.05,
                minEdgeThreshold: 0.02,
                minConfidenceFloor: 0.65
              },
              Number(row.agreement || 0.75),
              10
            ).fraction;
            const markets = ["Over 2.5", "Home Win", "BTTS - Yes", "Away Win", "Under 2.5"];
            const movements: ('up' | 'down' | 'stable')[] = ['up', 'down', 'stable'];

            return {
              id: `csv-${index}`,
              homeTeam: row.homeTeam,
              awayTeam: row.awayTeam,
              league: row.league,
              market: row.market || markets[Math.floor(Math.random() * markets.length)],
              probability: parseFloat(probability.toFixed(2)),
              odds: parseFloat(odds.toFixed(2)),
              ev: parseFloat(Math.max(-0.1, Math.min(0.25, impliedEdge)).toFixed(3)),
              kelly: parseFloat(kelly.toFixed(3)),
              confidence: parseFloat(Math.max(0.55, Math.min(0.9, Number(row.confidence || 0.72))).toFixed(2)),
              agreement: parseFloat(Math.max(0.5, Math.min(0.95, Number(row.agreement || 0.75))).toFixed(2)),
              kickoffTime: row.kickoffTime,
              oddsMovement: row.oddsMovement || movements[Math.floor(Math.random() * movements.length)],
              homeXG,
              awayXG,
              status: row.status || 'SCHEDULED'
            };
          });
        resolve(signals);
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};
