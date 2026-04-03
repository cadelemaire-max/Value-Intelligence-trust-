/**
 * Data Processing Pipeline for Sports Prediction
 * 
 * This module handles the transformation of raw fixture data into 
 * ML-ready feature vectors and validated JSON payloads.
 */

export interface RawFixture {
  date: string;
  home_team: string;
  away_team: string;
  home_goals: number;
  away_goals: number;
  possession?: number;
  shots?: number;
  xG?: number;
}

export interface ProcessedFixture extends RawFixture {
  home_rolling_goals: number;
  away_rolling_goals: number;
  home_momentum: number;
  away_momentum: number;
  home_advantage: number;
  is_anomaly: boolean;
  processed_at: string;
}

export class DataPipeline {
  private windowSize: number = 5;

  /**
   * 1. Data Cleaning & Validation
   */
  public clean(data: RawFixture[]): RawFixture[] {
    return data.filter(f => {
      // Required fields check
      if (!f.home_team || !f.away_team || !f.date) return false;
      
      // Outlier detection (e.g., goals > 15 is likely an error)
      if (f.home_goals > 15 || f.away_goals > 15) return false;
      
      return true;
    });
  }

  /**
   * 2. Feature Engineering
   */
  public transform(data: RawFixture[]): ProcessedFixture[] {
    // Sort by date for temporal calculations
    const sorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Calculate global league average baseline
    const globalAvgGoals = data.length > 0 
      ? data.reduce((acc, f) => acc + f.home_goals + f.away_goals, 0) / (data.length * 2)
      : 1.2;
    
    return sorted.map((f, i) => {
      // Calculate rolling averages (simplified for demo)
      const homeHistory = sorted.slice(0, i).filter(h => h.home_team === f.home_team).slice(-this.windowSize);
      const awayHistory = sorted.slice(0, i).filter(h => h.away_team === f.away_team).slice(-this.windowSize);
      
      const homeRolling = homeHistory.length > 0 
        ? homeHistory.reduce((acc, h) => acc + h.home_goals, 0) / homeHistory.length 
        : globalAvgGoals;

      const awayRolling = awayHistory.length > 0 
        ? awayHistory.reduce((acc, h) => acc + h.away_goals, 0) / awayHistory.length 
        : globalAvgGoals;

      // Momentum (Weighted recent matches)
      const homeMomentum = homeHistory.length > 0 ? (homeHistory[homeHistory.length - 1].home_goals * 1.5) : 1.0;
      const awayMomentum = awayHistory.length > 0 ? (awayHistory[awayHistory.length - 1].away_goals * 1.5) : 1.0;

      return {
        ...f,
        home_rolling_goals: homeRolling,
        away_rolling_goals: awayRolling,
        home_momentum: homeMomentum,
        away_momentum: awayMomentum,
        home_advantage: 0.35, // Static home advantage factor
        is_anomaly: f.xG ? (f.xG > 5.0) : false,
        processed_at: new Date().toISOString()
      };
    });
  }

  /**
   * 3. Data Quality Audit
   */
  public audit(data: ProcessedFixture[]): { completeness: number; anomalies: number } {
    const total = data.length;
    const anomalies = data.filter(d => d.is_anomaly).length;
    const complete = data.filter(d => d.home_rolling_goals !== undefined).length;
    
    return {
      completeness: (complete / total) * 100,
      anomalies
    };
  }

  /**
   * 4. ML Vectorization (Flattening)
   */
  public vectorize(f: ProcessedFixture): number[] {
    return [
      f.home_rolling_goals,
      f.away_rolling_goals,
      f.home_momentum,
      f.away_momentum,
      f.home_advantage,
      f.possession || 50,
      f.shots || 10
    ];
  }
}
