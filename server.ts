import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { runMonteCarlo } from "./src/lib/monteCarloEngine.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
