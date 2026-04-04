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
import { GoogleGenAI, Type } from "@google/genai";

// ─── Live odds cache (refreshes every 5 min) ────────────────────────────────
let oddsCache: any[] = [];
let oddsCacheAt = 0;
const ODDS_TTL = 5 * 60 * 1000;

const ODDS_SPORTS = [
  "soccer_epl",
  "soccer_germany_bundesliga",
  "soccer_spain_la_liga",
  "soccer_italy_serie_a",
  "soccer_france_ligue_one",
  "soccer_england_championship",
  "soccer_uefa_champs_league",
];

const normalizeTeamName = (n: string) =>
  n.toLowerCase().replace(/\s+(fc|sc|cf|afc|united|city|town|rovers|wanderers|athletic|albion|hotspur|wednesday|united)$/i, "").replace(/[^a-z0-9]/g, "");

const fetchLiveOdds = async (): Promise<any[]> => {
  const key = process.env.THE_ODDS_API_KEY;
  if (!key) return [];
  if (oddsCache.length > 0 && Date.now() - oddsCacheAt < ODDS_TTL) return oddsCache;

  const responses = await Promise.allSettled(
    ODDS_SPORTS.map(sport =>
      axios.get(`https://api.the-odds-api.com/v4/sports/${sport}/odds`, {
        params: { apiKey: key, regions: "eu", markets: "h2h", oddsFormat: "decimal" },
        timeout: 8000,
      })
    )
  );

  const all = responses
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .flatMap(r => r.value.data || []);

  const normalized = all.map((match: any) => {
    const h2h = match.bookmakers?.[0]?.markets?.find((m: any) => m.key === "h2h");
    if (!h2h) return null;
    const home = h2h.outcomes.find((o: any) => o.name !== "Draw" && o.name === match.home_team);
    const away = h2h.outcomes.find((o: any) => o.name !== "Draw" && o.name === match.away_team);
    const draw = h2h.outcomes.find((o: any) => o.name === "Draw");
    return {
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      commenceTime: match.commence_time,
      homeOdds: home?.price ?? null,
      drawOdds: draw?.price ?? null,
      awayOdds: away?.price ?? null,
      homeTeamNorm: normalizeTeamName(match.home_team),
      awayTeamNorm: normalizeTeamName(match.away_team),
    };
  }).filter(Boolean);

  oddsCache = normalized;
  oddsCacheAt = Date.now();
  return normalized;
};

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORY_FILE = path.join(__dirname, "data", "history.json");
const ACTIVE_BETS_FILE = path.join(__dirname, "data", "active_bets.json");
const RESULTS_FILE = path.join(__dirname, "data", "match_results.json");
const PERFORMANCE_FILE = path.join(__dirname, "data", "performance_metrics.json");
const RETRAIN_STATE_FILE = path.join(__dirname, "data", "retrain_state.json");
const ERROR_LOG_FILE = path.join(__dirname, "data", "prediction_errors.json");
const MONITOR_INTERVAL_MS = 60000;

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, "data"))) {
  fs.mkdirSync(path.join(__dirname, "data"));
}

const ensureJsonFile = (file: string, fallback: any) => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
  }
};

ensureJsonFile(RESULTS_FILE, []);
ensureJsonFile(PERFORMANCE_FILE, {
  totalBets: 0,
  settledBets: 0,
  wins: 0,
  losses: 0,
  roi: 0,
  brierScore: 0,
  auc: 0.5,
  profitFactor: 0,
  accuracy: 0,
  missRate: 0,
  lastUpdated: new Date().toISOString()
});
ensureJsonFile(RETRAIN_STATE_FILE, {
  retrainPending: false,
  lastTriggeredAt: null,
  lastAccuracy: 0,
  recentWindow: []
});
ensureJsonFile(ERROR_LOG_FILE, []);

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

const safeDivide = (a: number, b: number) => (b === 0 ? 0 : a / b);

const calculatePerformanceMetrics = (results: any[]) => {
  const settled = results.filter((r) => r.status === "settled");
  const totalBets = results.length;
  const settledBets = settled.length;
  const wins = settled.filter((r) => r.correct).length;
  const losses = settledBets - wins;
  const roi = settled.reduce((acc, r) => acc + (r.pnl || 0), 0);
  const grossProfit = settled.filter((r) => (r.pnl || 0) > 0).reduce((acc, r) => acc + (r.pnl || 0), 0);
  const grossLoss = Math.abs(settled.filter((r) => (r.pnl || 0) < 0).reduce((acc, r) => acc + (r.pnl || 0), 0));
  const profitFactor = safeDivide(grossProfit, grossLoss);
  const accuracy = safeDivide(wins, settledBets);
  const missRate = settledBets === 0 ? 0 : settled.filter((r) => r.probabilityMiss > 0.2).length / settledBets;
  const brierScore = settledBets === 0 ? 0 : settled.reduce((acc, r) => acc + Math.pow((r.predictedProb || 0) - (r.actualOutcomeProb || 0), 2), 0) / settledBets;
  const auc = settledBets === 0 ? 0.5 : Math.max(0.5, Math.min(0.99, 0.5 + (accuracy - 0.5) * 0.9));

  return {
    totalBets,
    settledBets,
    wins,
    losses,
    roi: Number(roi.toFixed(2)),
    brierScore: Number(brierScore.toFixed(4)),
    auc: Number(auc.toFixed(4)),
    profitFactor: Number(profitFactor.toFixed(4)),
    accuracy: Number(accuracy.toFixed(4)),
    missRate: Number(missRate.toFixed(4)),
    lastUpdated: new Date().toISOString()
  };
};

const appendResult = (result: any) => {
  const results = readJson(RESULTS_FILE);
  results.push(result);
  writeJson(RESULTS_FILE, results);
  const metrics = calculatePerformanceMetrics(results);
  writeJson(PERFORMANCE_FILE, metrics);
  return metrics;
};

const logPredictionError = (entry: any) => {
  const current = readJson(ERROR_LOG_FILE);
  current.push(entry);
  writeJson(ERROR_LOG_FILE, current);
};

const shouldRetrain = (results: any[]) => {
  const recent = results.filter((r) => r.status === "settled").slice(-30);
  if (recent.length < 30) return false;
  const accuracy = recent.filter((r) => r.correct).length / recent.length;
  return accuracy < 0.55;
};

const triggerRetrain = async () => {
  const state = readJson(RETRAIN_STATE_FILE);
  if (state.retrainPending) return;
  state.retrainPending = true;
  state.lastTriggeredAt = new Date().toISOString();
  writeJson(RETRAIN_STATE_FILE, state);
  try {
    const csvPath = path.join(__dirname, "data", "enriched_historical.csv");
    if (fs.existsSync(csvPath)) {
      await mlEngine.train(csvPath);
    }
  } finally {
    const nextState = readJson(RETRAIN_STATE_FILE);
    nextState.retrainPending = false;
    writeJson(RETRAIN_STATE_FILE, nextState);
  }
};

const normalizeWinner = (score: any) => {
  if (!score) return "draw";
  const home = Number(score.home ?? score.homeScore ?? 0);
  const away = Number(score.away ?? score.awayScore ?? 0);
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
};

const fetchLiveResults = async () => {
  const bets = readJson(ACTIVE_BETS_FILE);
  const now = Date.now();
  const updated: any[] = [];

  for (const bet of bets) {
    if (!bet.kickoffTime) {
      updated.push(bet);
      continue;
    }

    const kickoff = new Date(bet.kickoffTime).getTime();
    if (now < kickoff) {
      updated.push(bet);
      continue;
    }

    let matchData: any = null;
    try {
      if (process.env.FOOTBALL_DATA_API_KEY && bet.matchId) {
        const response = await axios.get(`https://api.football-data.org/v4/matches/${bet.matchId}`, {
          headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY }
        });
        matchData = response.data;
      }
    } catch (error) {
      console.error("Football-Data live fetch error:", error);
    }

    if (!matchData && process.env.THE_ODDS_API_KEY) {
      try {
        const response = await axios.get("https://api.the-odds-api.com/v4/sports/soccer_epl/scores", {
          params: { apiKey: process.env.THE_ODDS_API_KEY, daysFrom: 2 }
        });
        const found = Array.isArray(response.data) ? response.data.find((m: any) => String(m.id) === String(bet.matchId)) : null;
        if (found) matchData = found;
      } catch (error) {
        console.error("Odds live fetch error:", error);
      }
    }

    if (!matchData) {
      updated.push(bet);
      continue;
    }

    const status = String(matchData.status || matchData.match_status || "").toUpperCase();
    const fullTime = matchData.score?.fullTime || matchData.score || {};
    const homeScore = Number(fullTime.home ?? fullTime.homeScore ?? matchData.homeScore ?? 0);
    const awayScore = Number(fullTime.away ?? fullTime.awayScore ?? matchData.awayScore ?? 0);
    const winner = normalizeWinner({ home: homeScore, away: awayScore });
    const predicted = String(bet.prediction || bet.predictedOutcome || "").toLowerCase();
    const predictedProb = Number(bet.probability || bet.predictedProb || 0);
    const actualOutcomeProb = winner === "home" ? 1 : 0;
    const correct = (predicted.includes("home") && winner === "home") || (predicted.includes("away") && winner === "away") || (predicted.includes("draw") && winner === "draw");
    const probabilityMiss = Math.abs(predictedProb - actualOutcomeProb);
    const pnl = correct ? Number(bet.stake || 0) * (Number(bet.odds || 0) - 1) : -Number(bet.stake || 0);
    const settledEntry = {
      ...bet,
      status: "settled",
      finalScore: { home: homeScore, away: awayScore },
      winner,
      correct,
      pnl,
      probabilityMiss,
      predictedProb,
      actualOutcomeProb,
      settledAt: new Date().toISOString()
    };

    appendResult(settledEntry);

    if (probabilityMiss > 0.2) {
      logPredictionError({
        matchId: bet.matchId,
        probabilityMiss,
        predictedProb,
        actualOutcomeProb,
        settledAt: new Date().toISOString()
      });
    }

    if (status === "FINISHED" || status === "FT" || status === "FULL_TIME" || status === "ENDED") {
      continue;
    }

    updated.push(bet);
  }

  writeJson(ACTIVE_BETS_FILE, updated);
  const results = readJson(RESULTS_FILE);
  if (shouldRetrain(results)) {
    await triggerRetrain();
  }
};

setInterval(() => {
  void fetchLiveResults().catch((error) => console.error("Live result tracker error:", error));
}, MONITOR_INTERVAL_MS);

async function startServer() {
  const app = express();
  const PORT = 5000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  /**
   * Live bookmaker odds from The Odds API (h2h, EU region, cached 5 min)
   */
  app.get("/api/odds/live", async (req, res) => {
    try {
      const data = await fetchLiveOdds();
      res.json(data);
    } catch (error) {
      console.error("Odds API error:", error);
      res.json([]);
    }
  });

  /**
   * Gemini AI match insights — server-side proxy so key stays secret
   */
  app.post("/api/gemini/insights", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json({
        headline: "AI Key Not Configured",
        explanation: "Add a GEMINI_API_KEY secret to enable AI match analysis.",
        riskWarning: "Always bet responsibly.",
        recommendedMarket: req.body?.market ?? "Home Win",
        bayesianReasoning: "Set GEMINI_API_KEY in Secrets to unlock Bayesian narrative."
      });
    }

    try {
      const { homeTeam, awayTeam, league, market, probability, odds, ev, homeXG, awayXG } = req.body;
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `You are a professional football betting analyst. Analyze this upcoming match prediction data and give sharp, concise insights.

Match: ${homeTeam} vs ${awayTeam}
League: ${league}
Recommended Market: ${market}
Model Probability: ${(Number(probability) * 100).toFixed(1)}%
Market Odds: ${Number(odds).toFixed(2)}
Expected Value: ${(Number(ev) * 100).toFixed(1)}%
Home xG: ${Number(homeXG ?? 1.2).toFixed(2)}  Away xG: ${Number(awayXG ?? 1.1).toFixed(2)}

Respond in JSON only. Be specific to the teams and match, not generic.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline:           { type: Type.STRING },
              explanation:        { type: Type.STRING },
              riskWarning:        { type: Type.STRING },
              recommendedMarket:  { type: Type.STRING },
              bayesianReasoning:  { type: Type.STRING },
            },
            required: ["headline","explanation","riskWarning","recommendedMarket","bayesianReasoning"],
          },
        },
      });

      res.json(JSON.parse(response.text || "{}"));
    } catch (error: any) {
      console.error("Gemini insights error:", error?.message);
      res.json({
        headline: "Analysis Error",
        explanation: "Could not generate insights. Check server logs.",
        riskWarning: "Always bet responsibly.",
        recommendedMarket: req.body?.market ?? "Home Win",
        bayesianReasoning: "Retry later."
      });
    }
  });

  /**
   * ML Model Status + On-Demand Training
   */
  app.get("/api/ml/status", (req, res) => {
    res.json({ trained: mlEngine.isTrained });
  });

  app.post("/api/ml/train", async (req, res) => {
    const csvPath = path.join(__dirname, "data", "enriched_historical.csv");
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ ok: false, error: "No training data found at data/enriched_historical.csv" });
    }
    try {
      await mlEngine.train(csvPath);
      res.json({ ok: true, message: "ML model trained successfully." });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
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
      const csvFallback = () => {
        const csvPath = path.join(__dirname, 'public', 'all_fixtures.csv');
        const csvData = fs.readFileSync(csvPath, 'utf8');
        const parsed = Papa.parse(csvData, { header: true }).data as any[];
        return parsed.filter((m: any) => m.homeTeam && m.awayTeam);
      };

      if (apiKey) {
        // Fetch next 14 days across all supported competitions
        const dateFrom = new Date().toISOString().split('T')[0];
        const dateTo = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const competitions = ['PL', 'BL1', 'PD', 'SA', 'FL1', 'ELC', 'CL'];
        
        const responses = await Promise.allSettled(
          competitions.map(comp =>
            axios.get(`https://api.football-data.org/v4/competitions/${comp}/matches`, {
              headers: { 'X-Auth-Token': apiKey },
              params: { status: 'SCHEDULED,LIVE,IN_PLAY,FINISHED', dateFrom, dateTo }
            })
          )
        );

        const allMatches = responses
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
          .flatMap(r => (r.value.data.matches || []))
          .map((match: any) => ({
            id: String(match.id),
            homeTeam: match.homeTeam?.name || '',
            awayTeam: match.awayTeam?.name || '',
            league: match.competition?.name || '',
            kickoffTime: match.utcDate,
            status: match.status,
            score: match.score?.fullTime || null,
            odds: null
          }))
          .filter(m => m.homeTeam && m.awayTeam);

        if (allMatches.length > 0) {
          return res.json(allMatches);
        }
        // No matches from API — fall through to CSV
      }

      // Fallback to CSV
      try {
        res.json(csvFallback());
      } catch (csvError) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    } catch (error) {
      console.error("Upcoming Matches Error:", error);
      try {
        const csvPath = path.join(__dirname, 'public', 'all_fixtures.csv');
        const csvData = fs.readFileSync(csvPath, 'utf8');
        const parsed = Papa.parse(csvData, { header: true }).data as any[];
        res.json(parsed.filter((m: any) => m.homeTeam && m.awayTeam));
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

  app.get("/api/performance/real-time", (req, res) => {
    const metrics = readJson(PERFORMANCE_FILE);
    res.json(metrics);
  });

  app.get("/api/results", (req, res) => {
    res.json(readJson(RESULTS_FILE));
  });

  app.post("/api/errors", (req, res) => {
    const payload = {
      ...req.body,
      createdAt: new Date().toISOString()
    };
    logPredictionError(payload);
    res.json({ ok: true });
  });

  app.post("/api/retrain", async (req, res) => {
    try {
      await triggerRetrain();
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
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
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // ── Background: pre-warm odds cache ──────────────────────────────────
    if (process.env.THE_ODDS_API_KEY) {
      setImmediate(() => {
        fetchLiveOdds()
          .then(d => console.log(`✅ Odds cache warmed: ${d.length} fixtures`))
          .catch(e => console.warn("⚠️  Odds cache warm failed:", e?.message));
      });
    }
  });
}

startServer();
