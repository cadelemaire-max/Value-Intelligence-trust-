# APEA Elite - Live Match Telemetry & Football Prediction Engine

## Overview

A full-stack application for football (soccer) match analysis, real-time probability updates using Bayesian logic, and betting insights using machine learning (Random Forest) and Google Gemini AI.

## Architecture

- **Frontend**: React 19 + TypeScript + Tailwind CSS 4 + Vite 6
- **Backend**: Node.js + Express server (TypeScript via tsx)
- **AI/ML**: Google Gemini (server-side proxy) + ml-random-forest (TypeScript)
- **Data**: JSON/CSV files in `/data` + live APIs

The Express server serves the Vite frontend via middleware in development, and serves the built `dist/` folder in production. Both frontend and backend run on port 5000.

## Project Structure

```
/src              - React frontend components and logic
  /components     - UI components (MatchDetailPage, FixtureList, etc.)
  /context        - React Context (BettingContext)
  /lib            - Core engines (mlEngine, bayesianEngine, monteCarloEngine, geminiService, fixtureParser, riskEngine)
/data             - JSON/CSV data files (history, active_bets, league_statistics, enriched_historical.csv)
/models           - Trained model files
/public           - Static assets (all_fixtures.csv – 158 fixtures across 9 leagues)
/scripts          - Utility scripts (backtest, data processing)
server.ts         - Express + Vite middleware server
vite.config.ts    - Vite configuration
```

## Running the App

**Development:**
```bash
npm run dev
```
Starts the Express+Vite server on port 5000.

**Build:**
```bash
npm run build
```
Compiles the React frontend to `dist/`.

## Key Configuration

- Server port: **5000** (Express + Vite middleware)
- Host: **0.0.0.0** (required for Replit proxy)
- Vite `allowedHosts: true` (required for Replit proxy)
- ML model does NOT train on startup (avoids blocking the event loop). Activate via Analytics → "Activate ML Model" button.

## Environment Variables / Secrets

| Secret | Status | Purpose |
|--------|--------|---------|
| `FOOTBALL_DATA_API_KEY` | ✅ Set | Football-Data.org — fetches fixtures across PL, BL1, PD, SA, FL1, ELC, CL (14-day window) |
| `THE_ODDS_API_KEY` | ✅ Set | The Odds API — fetches real h2h bookmaker odds (98 fixtures across 7 competitions, 5-min cache) |
| `GEMINI_API_KEY` | ❌ Not set | Google Gemini AI — add to Replit Secrets to enable AI insights |

## Live Data Flow

1. **Fixtures**: `/api/matches/upcoming` — Football-Data.org API → maps to PredictionSignal format
2. **Bookmaker Odds**: `/api/odds/live` — The Odds API → warmed at startup, refreshed every 5 min
3. **Odds Enrichment**: App.tsx loads fixtures then overlays live bookmaker odds from 98 entries
4. **EV Calculation**: Poisson xG model → 55% shrinkage factor → cap at 22% (API path) / 25% (CSV path)

## ML Model

- **Training data**: `data/enriched_historical.csv` (5,043 rows of Premier League data)
- **Status endpoint**: `GET /api/ml/status` — returns `{ trained: boolean }`
- **Train endpoint**: `POST /api/ml/train` — triggers synchronous training (~20s, blocks event loop once)
- **Predict endpoint**: `POST /api/predict/ml` — falls back to Poisson model if not trained
- **Activate**: Navigate to Analytics tab → scroll to Model Stack → click "Activate ML Model"

## Gemini AI

- Server-side proxy at `POST /api/gemini/insights` — keeps API key secret
- Frontend calls proxy via `src/lib/geminiService.ts`
- Returns friendly fallback message when `GEMINI_API_KEY` is not set
- To enable: add `GEMINI_API_KEY` to Replit Secrets (Secrets panel in sidebar)

## Deployment

- Target: autoscale
- Build: `npm run build`
- Run: `node --import tsx/esm server.ts` with `NODE_ENV=production`

## Notes

- The RandomForest training (`ml-random-forest`) is CPU-intensive and synchronous. It is NOT run on startup to prevent blocking the Express event loop for ~20s.
- The server pre-warms the odds cache at startup using `setImmediate` (non-blocking).
- The server polls for live match results every 60 seconds to settle bets.
- Python scripts in `/scripts` are for offline data processing (not part of the main runtime).
- CSV `public/all_fixtures.csv` covers: championship, ligue-1, la-liga, serie-a, bundesliga, eredivisie, premier-league, champions-league, mls.
