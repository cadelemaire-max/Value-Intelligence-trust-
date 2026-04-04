import { PredictionSignal } from "../types";

export interface MatchInsights {
  headline: string;
  explanation: string;
  riskWarning: string;
  recommendedMarket: string;
  bayesianReasoning: string;
}

export async function askGemini(prompt: string): Promise<string> {
  try {
    const res = await fetch("/api/gemini/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return "Error communicating with Gemini.";
    const data = await res.json();
    return data.explanation || data.headline || "No response.";
  } catch (error) {
    console.error("Gemini API error:", error);
    return "Error communicating with Gemini.";
  }
}

export const getMatchInsights = async (signal: PredictionSignal): Promise<MatchInsights> => {
  try {
    const res = await fetch("/api/gemini/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        homeTeam: signal.homeTeam,
        awayTeam: signal.awayTeam,
        league: signal.league,
        market: signal.market,
        probability: signal.probability,
        odds: signal.odds,
        ev: signal.ev,
        homeXG: signal.homeXG,
        awayXG: signal.awayXG,
      }),
    });
    if (!res.ok) throw new Error("Server error");
    return await res.json();
  } catch (error) {
    console.error("Failed to generate Gemini insights:", error);
    return {
      headline: "Insight Unavailable",
      explanation: "Could not generate insights at this time.",
      riskWarning: "Always bet responsibly.",
      recommendedMarket: signal.market,
      bayesianReasoning: "Bayesian analysis unavailable.",
    };
  }
};
