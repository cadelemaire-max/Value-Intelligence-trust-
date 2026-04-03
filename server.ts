import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { runMonteCarlo } from "./src/lib/monteCarloEngine.ts";
import { exec } from "child_process";
import util from "util";
import fs from "fs";
import axios from "axios";
import Papa from "papaparse";
import { mlEngine } from "./src/lib/mlEngine.ts";

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORY_FILE = path.join(__dirname, "data", "history.json");
const ACTIVE_BETS_FILE = path.join(__dirname, "data", "active_bets.json");

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, "data"))) {
  fs.mkdirSync(path.join(__dirname, "data"));
}

// Helper to read/write JSON files
const readJson = (file: string) => {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return [];
  }
};

const writeJson = (file: string, data: any) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  /**
   * ML Prediction Endpoint
   * Calls the Python predict.py script.
   */
  app.post("/api/predict/ml", async (req, res) => {
    const { homeTeam, awayTeam, homeXG, awayXG } = req.body;
    
    if (!homeTeam || !awayTeam || homeXG === undefined || awayXG === undefined) {
      return res.status(400).json({ error: "homeTeam, awayTeam, homeXG, and awayXG are required" });
    }

    try {
      // Try TypeScript ML model first
      try {
        const result = mlEngine.predict(homeTeam, awayTeam, homeXG, awayXG);
        return res.json(result);
      } catch (mlError) {
        console.warn("TS ML prediction failed, falling back to Poisson model:", mlError);
      }

      // Fallback: Simple Poisson distribution model
      const factorial = (n: number): number => {
        if (n === 0 || n === 1) return 1;
        let result = 1;
        for (let i = 2; i <= n; i++) result *= i;
        return result;
      };

      const poisson = (k: number, lambda: number): number => {
        return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
      };

      const calculateProbs = (hXG: number, aXG: number) => {
        let homeWinProb = 0;
        let drawProb = 0;
        let awayWinProb = 0;
        for (let i = 0; i <= 7; i++) {
          for (let j = 0; j <= 7; j++) {
            const prob = poisson(i, hXG) * poisson(j, aXG);
            if (i > j) homeWinProb += prob;
            else if (i === j) drawProb += prob;
            else awayWinProb += prob;
          }
        }
        const totalProb = homeWinProb + drawProb + awayWinProb;
        return {
          homeWin: homeWinProb / totalProb,
          draw: drawProb / totalProb,
          awayWin: awayWinProb / totalProb
        };
      };

      const userProbs = calculateProbs(homeXG, awayXG);
      
      let prediction = "Draw";
      let prediction_code = 0;
      let maxProb = userProbs.draw;

      if (userProbs.homeWin > maxProb) {
        prediction = "Home Win";
        prediction_code = 1;
        maxProb = userProbs.homeWin;
      }
      if (userProbs.awayWin > maxProb) {
        prediction = "Away Win";
        prediction_code = -1;
        maxProb = userProbs.awayWin;
      }

      const result = {
        prediction,
        prediction_code,
        probabilities: {
          "Home Win": parseFloat(userProbs.homeWin.toFixed(4)),
          "Draw": parseFloat(userProbs.draw.toFixed(4)),
          "Away Win": parseFloat(userProbs.awayWin.toFixed(4))
        },
        probability: parseFloat(maxProb.toFixed(4)),
        isFallback: true
      };
      
      res.json(result);
    } catch (error: any) {
      console.error("ML Prediction Error:", error);
      res.status(500).json({ 
        error: "Failed to run ML prediction.", 
        details: error.message
      });
    }
  });

  /**
   * Realtime Odds Endpoint
   * Calls the Python fetch_realtime_odds.py script.
   */
  app.get("/api/odds", async (req, res) => {
    try {
      const { stdout, stderr } = await execPromise(`python3 scripts/fetch_realtime_odds.py`);
      
      if (stderr) {
        console.error("Python Script Error:", stderr);
      }
      
      try {
        const result = JSON.parse(stdout.trim().replace(/'/g, '"'));
        res.json(result);
      } catch (e) {
        res.json({ raw: stdout.trim() });
      }
    } catch (error: any) {
      console.error("Odds Fetch Error:", error);
      res.status(500).json({ 
        error: "Failed to fetch odds.",
        details: error.message,
        stderr: error.stderr
      });
    }
  });

  /**
   * Monte Carlo Simulation Endpoint
   * Moves heavy compute from browser to server.
   */
  app.post("/api/predict/monte-carlo", (req, res) => {
    const { homeXG, awayXG, iterations } = req.body;
    
    if (homeXG === undefined || awayXG === undefined) {
      return res.status(400).json({ error: "homeXG and awayXG are required" });
    }

    try {
      const result = runMonteCarlo({ 
        homeXG: Number(homeXG), 
        awayXG: Number(awayXG), 
        iterations: iterations ? Number(iterations) : 10000 
      });
      res.json(result);
    } catch (error) {
      console.error("Monte Carlo Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  /**
   * Fetch Upcoming Matches Endpoint
   */
  app.get("/api/matches/upcoming", async (req, res) => {
    const apiKey = process.env.FOOTBALL_DATA_API_KEY;
    
    try {
      if (apiKey) {
        // Fetch real matches for the next 7 days
        const dateFrom = new Date().toISOString().split('T')[0];
        const dateTo = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const response = await axios.get(`https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`, {
          headers: { 'X-Auth-Token': apiKey }
        });

        const matches = response.data.matches.map((match: any) => ({
          id: String(match.id),
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          league: match.competition.name,
          kickoffTime: match.utcDate,
          status: match.status,
          score: match.score.fullTime
        }));
        
        return res.json(matches);
      }

      // Fallback to CSV
      const csvData = fs.readFileSync('all_fixtures.csv', 'utf8');
      const parsed = Papa.parse(csvData, { header: true }).data as any[];
      res.json(parsed.filter(m => m.homeTeam && m.awayTeam));
    } catch (error) {
      console.error("Upcoming Matches Error:", error);
      // Fallback to CSV on error
      try {
        const csvData = fs.readFileSync('all_fixtures.csv', 'utf8');
        const parsed = Papa.parse(csvData, { header: true }).data as any[];
        res.json(parsed.filter(m => m.homeTeam && m.awayTeam));
      } catch (csvError) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  });

  /**
   * Run Backtest Endpoint
   */
  app.get("/api/backtest", async (req, res) => {
    try {
      const { exec } = await import('child_process');
      const util = await import('util');
      const fs = await import('fs');
      const Papa = await import('papaparse');

      const execPromise = util.promisify(exec);

      const csvData = fs.readFileSync('realistic_historical.csv', 'utf8');
      const parsed = Papa.parse(csvData, { header: true }).data as any[];
      const matches = parsed.filter(m => m.home_team && m.away_team).map(m => ({
        home_team: m.home_team,
        away_team: m.away_team,
        home_score: parseInt(m.home_score),
        away_score: parseInt(m.away_score)
      }));

      let replitCorrect = 0;
      let replitROI = 0;
      let replitBrier = 0;

      const FLAT_BET = 100;
      const ASSUMED_ODDS = 2.0; 

      const testMatches = matches.slice(0, 5); // Test 5 matches

      const results = [];

      for (let i = 0; i < testMatches.length; i++) {
        const match = testMatches[i];
        const actualOutcome = match.home_score > match.away_score ? 'Home Win' : 
                              match.home_score < match.away_score ? 'Away Win' : 'Draw';

        let replitPrediction = '';
        let replitProb = 0.5;
        let isReplitCorrect = false;

        try {
          const homeXG = match.home_score * 0.8 + 0.5;
          const awayXG = match.away_score * 0.8 + 0.5;
          
          // Simple Poisson distribution model for football predictions based on xG
          const factorial = (n: number): number => {
            if (n === 0 || n === 1) return 1;
            let result = 1;
            for (let i = 2; i <= n; i++) result *= i;
            return result;
          };

          const poisson = (k: number, lambda: number): number => {
            return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
          };

          let homeWinProb = 0;
          let drawProb = 0;
          let awayWinProb = 0;

          // Calculate probabilities for scores up to 7-7
          for (let i = 0; i <= 7; i++) {
            for (let j = 0; j <= 7; j++) {
              const prob = poisson(i, homeXG) * poisson(j, awayXG);
              if (i > j) homeWinProb += prob;
              else if (i === j) drawProb += prob;
              else awayWinProb += prob;
            }
          }

          // Normalize probabilities to ensure they sum to 1
          const totalProb = homeWinProb + drawProb + awayWinProb;
          homeWinProb /= totalProb;
          drawProb /= totalProb;
          awayWinProb /= totalProb;

          let prediction = "Draw";
          let maxProb = drawProb;

          if (homeWinProb > maxProb) {
            prediction = "Home Win";
            maxProb = homeWinProb;
          }
          if (awayWinProb > maxProb) {
            prediction = "Away Win";
            maxProb = awayWinProb;
          }

          replitPrediction = prediction;
          replitProb = maxProb;

          isReplitCorrect = (replitPrediction === 'Home Win' && actualOutcome === 'Home Win') ||
                            (replitPrediction === 'Away Win' && actualOutcome === 'Away Win') ||
                            (replitPrediction === 'Draw' && actualOutcome === 'Draw');
          
          if (isReplitCorrect) {
            replitCorrect++;
            replitROI += FLAT_BET * (ASSUMED_ODDS - 1);
          } else {
            replitROI -= FLAT_BET;
          }

          const actualProb = isReplitCorrect ? 1 : 0;
          replitBrier += Math.pow(replitProb - actualProb, 2);
        } catch (e) {
          console.error("Replit Error:", e);
        }

        let geminiPrediction = 'N/A';
        let isGeminiCorrect = false;

        results.push({
          match: `${match.home_team} vs ${match.away_team}`,
          actual: actualOutcome,
          replit: { prediction: replitPrediction, correct: isReplitCorrect },
          gemini: { prediction: geminiPrediction, correct: isGeminiCorrect }
        });
      }

      res.json({
        matchesTested: matches.length,
        results,
        summary: {
          replit: {
            winRate: (replitCorrect / matches.length * 100).toFixed(1) + '%',
            roi: replitROI,
            brierScore: (replitBrier / matches.length).toFixed(4)
          },
          gemini: {
            winRate: '0%',
            roi: 0,
            brierScore: '0'
          }
        }
      });
    } catch (error) {
      console.error("Backtest Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  /**
   * Active Bets Endpoints
   */
  app.get("/api/bets/active", (req, res) => {
    res.json(readJson(ACTIVE_BETS_FILE));
  });

  app.post("/api/bets/active", (req, res) => {
    const bet = req.body;
    const activeBets = readJson(ACTIVE_BETS_FILE);
    activeBets.push({
      ...bet,
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      status: 'pending'
    });
    writeJson(ACTIVE_BETS_FILE, activeBets);
    res.json({ status: "ok", bet });
  });

  /**
   * Bet History Endpoint
   */
  app.get("/api/bets/history", (req, res) => {
    res.json(readJson(HISTORY_FILE));
  });

  /**
   * Retrain Model with New Data
   */
  const retrainModel = async (settledBets: any[]) => {
    try {
      const csvPath = path.join(__dirname, "data", "enriched_historical.csv");
      let csvContent = "";
      
      if (fs.existsSync(csvPath)) {
        csvContent = fs.readFileSync(csvPath, "utf8");
      } else {
        csvContent = "date,league,home_team,away_team,home_goals,away_goals,home_xG,away_xG\n";
      }

      const newRows = settledBets.map(bet => {
        const [homeGoals, awayGoals] = bet.actualScore.split('-').map(Number);
        return `${bet.settledAt},${bet.league || 'Unknown'},${bet.homeTeam},${bet.awayTeam},${homeGoals},${awayGoals},${bet.homeXG || 1.2},${bet.awayXG || 1.1}`;
      }).join('\n');

      fs.appendFileSync(csvPath, '\n' + newRows);
      console.log(`Appended ${settledBets.length} matches to training data. Running retraining...`);

      // Retrain TypeScript ML model
      await mlEngine.train(csvPath);
      console.log("✅ TS ML Model retrained.");
    } catch (error) {
      console.error("Error during retraining:", error);
    }
  };

  /**
   * Real-time Performance Metrics Endpoint
   */
  app.get("/api/performance/real-time", (req, res) => {
    const history = readJson(HISTORY_FILE);
    if (history.length === 0) {
      return res.json({
        roi: 0,
        winRate: 0,
        profitFactor: 0,
        brierScore: 0,
        totalBets: 0,
        auc: 0.5
      });
    }

    const totalStake = history.reduce((acc: number, h: any) => acc + h.stake, 0);
    const totalProfit = history.reduce((acc: number, h: any) => acc + h.profit, 0);
    const roi = (totalProfit / totalStake) * 100;

    const wins = history.filter((h: any) => h.outcome === 'won').length;
    const winRate = (wins / history.length) * 100;

    const grossProfit = history.filter((h: any) => h.profit > 0).reduce((acc: number, h: any) => acc + h.profit, 0);
    const grossLoss = Math.abs(history.filter((h: any) => h.profit < 0).reduce((acc: number, h: any) => acc + h.profit, 0));
    const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;

    // Brier Score
    const brierScore = history.reduce((acc: number, h: any) => {
      const prob = h.probability || 0.5;
      const outcome = h.outcome === 'won' ? 1 : 0;
      return acc + Math.pow(prob - outcome, 2);
    }, 0) / history.length;

    // Real AUC Calculation (Simplified trapezoidal rule)
    // Sort by probability descending
    const sorted = [...history].sort((a, b) => (b.probability || 0) - (a.probability || 0));
    let tp = 0;
    let fp = 0;
    const totalPos = history.filter((h: any) => h.outcome === 'won').length;
    const totalNeg = history.length - totalPos;
    
    let auc = 0.5;
    if (totalPos > 0 && totalNeg > 0) {
      let area = 0;
      let prevFp = 0;
      for (const h of sorted) {
        if (h.outcome === 'won') {
          tp++;
        } else {
          fp++;
          area += (fp - prevFp) * (tp / totalPos);
          prevFp = fp;
        }
      }
      auc = area / totalNeg;
    }

    res.json({
      roi: parseFloat(roi.toFixed(2)),
      winRate: parseFloat(winRate.toFixed(2)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      brierScore: parseFloat(brierScore.toFixed(4)),
      totalBets: history.length,
      auc: parseFloat(auc.toFixed(3))
    });
  });

  /**
   * Fetch Real Match Result from Football-Data.org
   */
  const fetchMatchResult = async (matchId: string) => {
    const apiKey = process.env.FOOTBALL_DATA_API_KEY;
    if (!apiKey) {
      console.warn("FOOTBALL_DATA_API_KEY not found. Skipping real result fetch.");
      return null;
    }

    try {
      const response = await axios.get(`https://api.football-data.org/v4/matches/${matchId}`, {
        headers: { 'X-Auth-Token': apiKey }
      });

      const match = response.data;
      if (match.status === 'FINISHED') {
        const homeScore = match.score.fullTime.home;
        const awayScore = match.score.fullTime.away;
        
        let actualOutcome = 'Draw';
        if (homeScore > awayScore) actualOutcome = 'Home Win';
        else if (awayScore > homeScore) actualOutcome = 'Away Win';

        return {
          status: 'FINISHED',
          homeScore,
          awayScore,
          actualOutcome
        };
      }
      return { status: match.status };
    } catch (error) {
      console.error(`Error fetching result for match ${matchId}:`, error);
      return null;
    }
  };

  /**
   * Background Polling for Live Results
   */
  const pollLiveResults = async () => {
    const activeBets = readJson(ACTIVE_BETS_FILE);
    if (activeBets.length === 0) return;

    console.log(`Polling live results for ${activeBets.length} active bets...`);

    try {
      const now = new Date();
      const settled: any[] = [];
      const remaining: any[] = [];

      for (const bet of activeBets) {
        const kickoff = new Date(bet.kickoffTime);
        
        // Only fetch if kickoff has passed
        if (now > kickoff) {
          const result = await fetchMatchResult(bet.matchId);
          
          if (result && result.status === 'FINISHED') {
            const won = bet.market === result.actualOutcome;
            
            const settledBet = {
              ...bet,
              status: 'settled',
              outcome: won ? 'won' : 'lost',
              profit: won ? bet.stake * (bet.odds - 1) : -bet.stake,
              settledAt: now.toISOString(),
              actualScore: `${result.homeScore}-${result.awayScore}`
            };
            settled.push(settledBet);
            
            // Check for retraining trigger
            const history = readJson(HISTORY_FILE);
            const newHistory = [...history, settledBet];
            const recent = newHistory.slice(-30);
            const accuracy = recent.filter(h => h.outcome === 'won').length / recent.length;
            
            if (recent.length >= 30 && accuracy < 0.55) {
              console.warn(`RETRAINING TRIGGERED: Accuracy ${accuracy.toFixed(2)} below threshold 0.55`);
              retrainModel(settled);
            }
          } else {
            remaining.push(bet);
          }
        } else {
          remaining.push(bet);
        }
      }

      if (settled.length > 0) {
        const history = readJson(HISTORY_FILE);
        writeJson(HISTORY_FILE, [...history, ...settled]);
        writeJson(ACTIVE_BETS_FILE, remaining);
        console.log(`Settled ${settled.length} bets.`);
      }
    } catch (error) {
      console.error("Error polling live results:", error);
    }
  };

  // Start polling every 60 seconds
  setInterval(pollLiveResults, 60000);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Initial model training
    const csvPath = path.join(__dirname, "data", "enriched_historical.csv");
    if (fs.existsSync(csvPath)) {
      console.log("Running initial ML training...");
      try {
        await mlEngine.train(csvPath);
      } catch (error) {
        console.error("Initial training failed:", error);
      }
    }
  });
}

startServer();
