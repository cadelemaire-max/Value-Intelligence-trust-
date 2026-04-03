import { RandomForestClassifier } from 'ml-random-forest';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

export interface TrainingData {
  home_team: string;
  away_team: string;
  home_goals: number;
  away_goals: number;
  home_xG: number;
  away_xG: number;
}

export class MLEngine {
  private model: RandomForestClassifier | null = null;
  private teamEncoder: Map<string, number> = new Map();
  private nextTeamId: number = 0;

  private getTeamId(teamName: string): number {
    if (!this.teamEncoder.has(teamName)) {
      this.teamEncoder.set(teamName, this.nextTeamId++);
    }
    return this.teamEncoder.get(teamName)!;
  }

  public async train(csvPath: string) {
    try {
      const csvContent = fs.readFileSync(csvPath, 'utf8');
      const parsed = Papa.parse(csvContent, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true
      });

      const data = parsed.data as TrainingData[];
      const X: number[][] = [];
      const y: number[] = [];

      data.forEach(row => {
        if (row.home_team && row.away_team && row.home_goals !== undefined && row.away_goals !== undefined) {
          const homeId = this.getTeamId(row.home_team);
          const awayId = this.getTeamId(row.away_team);
          
          // Features: [homeTeamId, awayTeamId, homeXG, awayXG]
          X.push([
            Number(homeId), 
            Number(awayId), 
            Number(row.home_xG || 1.2), 
            Number(row.away_xG || 1.1)
          ]);
          
          // Target: 2 (Home Win), 1 (Draw), 0 (Away Win)
          if (row.home_goals > row.away_goals) y.push(2);
          else if (row.home_goals === row.away_goals) y.push(1);
          else y.push(0);
        }
      });

      if (X.length === 0) throw new Error("No valid training data found");

      this.model = new RandomForestClassifier({
        nEstimators: 50,
        seed: 42
      });

      this.model.train(X, y);
      console.log(`✅ ML Model trained successfully with ${X.length} samples.`);
    } catch (error) {
      console.error("❌ ML Training Error:", error);
      throw error;
    }
  }

  public predict(homeTeam: string, awayTeam: string, homeXG: number, awayXG: number) {
    if (!this.model) {
      throw new Error("Model not trained");
    }

    try {
      const homeId = this.getTeamId(homeTeam);
      const awayId = this.getTeamId(awayTeam);
      
      // Ensure all inputs are strictly numbers
      const f_homeId = Number(homeId);
      const f_awayId = Number(awayId);
      const f_homeXG = Number(homeXG);
      const f_awayXG = Number(awayXG);

      if (isNaN(f_homeXG) || isNaN(f_awayXG)) {
        throw new Error(`Invalid xG values: ${homeXG}, ${awayXG}`);
      }

      const features = [f_homeId, f_awayId, f_homeXG, f_awayXG];
      const input = [features];

      // Predict class
      const prediction = this.model.predict(input)[0];
      
      // Predict probabilities for each class (0, 1, 2)
      // We wrap each in a try-catch because if a class wasn't in the training set,
      // predictProbability might throw or return undefined.
      const getProb = (label: number) => {
        try {
          const p = this.model!.predictProbability(input, label);
          return Array.isArray(p) ? (p[0] || 0) : 0;
        } catch (e) {
          return 0;
        }
      };

      const probAway = getProb(0);
      const probDraw = getProb(1);
      const probHome = getProb(2);

      const probMap: Record<string, number> = {
        "Away Win": parseFloat(probAway.toFixed(4)),
        "Draw": parseFloat(probDraw.toFixed(4)),
        "Home Win": parseFloat(probHome.toFixed(4))
      };

      const result_map: Record<number, string> = {
        2: "Home Win",
        1: "Draw",
        0: "Away Win"
      };

      const prediction_code_map: Record<number, number> = {
        2: 1,
        1: 0,
        0: -1
      };

      const prediction_label = result_map[prediction] || "Draw";

      return {
        prediction: prediction_label,
        prediction_code: prediction_code_map[prediction] ?? 0,
        probabilities: probMap,
        probability: probMap[prediction_label] || 0,
        isML: true
      };
    } catch (err) {
      console.error("Internal ML Prediction Error:", err);
      throw err;
    }
  }
}

export const mlEngine = new MLEngine();
