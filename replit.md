# APEA Elite - Live Match Telemetry & Football Prediction Engine

## Overview

A full-stack application for football (soccer) match analysis, real-time probability updates using Bayesian logic, and betting insights using machine learning (Random Forest) and Google Gemini AI.

## Architecture

- **Frontend**: React 19 + TypeScript + Tailwind CSS 4 + Vite 6
- **Backend**: Node.js + Express server (TypeScript via tsx)
- **AI/ML**: Google Gemini SDK + ml-random-forest (TypeScript)
- **Data**: JSON/CSV files in `/data` directory

The Express server serves the Vite frontend via middleware in development, and serves the built `dist/` folder in production. Both frontend and backend run on port 5000.

## Project Structure

```
/src              - React frontend components and logic
  /components     - UI components (MatchDetailView, FixtureList, etc.)
  /context        - React Context (BettingContext)
  /lib            - Core engines (mlEngine, bayesianEngine, monteCarloEngine, geminiService)
/data             - JSON/CSV data files (history, active_bets, league_statistics)
/models           - Trained model files
/public           - Static assets
/scripts          - Python utility scripts
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
- ML model trains lazily on first prediction request (not on startup, to avoid blocking the event loop)

## Environment Variables

- `GEMINI_API_KEY` - Required for Gemini AI features
- `FOOTBALL_DATA_API_KEY` - Required for fetching live match results from Football-Data.org
- `APP_URL` - URL where the app is hosted (optional)

## Deployment

- Target: autoscale
- Build: `npm run build`
- Run: `node --import tsx/esm server.ts` with `NODE_ENV=production`

## Notes

- The RandomForest training (`ml-random-forest`) is CPU-intensive and synchronous. It runs lazily to avoid blocking the Express event loop on startup.
- The server polls for live match results every 60 seconds to settle bets.
- Python scripts in `/scripts` are for offline data processing (not part of the main runtime).
