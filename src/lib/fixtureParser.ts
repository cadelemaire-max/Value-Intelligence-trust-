import Papa from 'papaparse';

export interface PredictionSignal {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  market: string;
  probability: number;
  odds: number;
  ev: number;
  kelly: number;
  confidence: number;
  agreement: number;
  kickoffTime: string;
  oddsMovement: 'up' | 'down' | 'stable';
}

export const parseFixturesCSV = async (csvUrl: string): Promise<PredictionSignal[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      complete: (results) => {
        const signals: PredictionSignal[] = results.data
          .filter((row: any) => row.homeTeam && row.awayTeam) // Filter out empty rows
          .map((row: any, index: number) => {
            // Generate realistic mock data for fields not in CSV
            const probability = 0.4 + Math.random() * 0.4; // 40% to 80%
            const odds = 1.5 + Math.random() * 2.5; // 1.5 to 4.0
            const ev = (probability * odds) - 1;
            const kelly = Math.max(0, (ev / (odds - 1)) * 0.1); // Fractional Kelly (10%)
            
            const markets = ["Over 2.5", "Home Win", "BTTS - Yes", "Away Win", "Under 2.5"];
            const movements: ('up' | 'down' | 'stable')[] = ['up', 'down', 'stable'];

            return {
              id: `csv-${index}`,
              homeTeam: row.homeTeam,
              awayTeam: row.awayTeam,
              league: row.league,
              market: markets[Math.floor(Math.random() * markets.length)],
              probability: parseFloat(probability.toFixed(2)),
              odds: parseFloat(odds.toFixed(2)),
              ev: parseFloat(ev.toFixed(3)),
              kelly: parseFloat(kelly.toFixed(3)),
              confidence: parseFloat((0.6 + Math.random() * 0.35).toFixed(2)),
              agreement: parseFloat((0.5 + Math.random() * 0.5).toFixed(2)),
              kickoffTime: row.kickoffTime,
              oddsMovement: movements[Math.floor(Math.random() * movements.length)],
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
