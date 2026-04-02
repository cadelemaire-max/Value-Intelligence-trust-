import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { PredictionSignal } from "./fixtureParser";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface MatchInsights {
  headline: string;
  explanation: string;
  riskWarning: string;
  recommendedMarket: string;
  bayesianReasoning: string;
}

export async function askGemini(prompt: string, mode: 'thinking' | 'search' | 'general' = 'general'): Promise<string> {
  try {
    if (mode === 'thinking') {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        },
      });
      return response.text || "No response.";
    } else if (mode === 'search') {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      return response.text || "No response.";
    } else {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: prompt,
      });
      return response.text || "No response.";
    }
  } catch (error) {
    console.error("Gemini API error:", error);
    return "Error communicating with Gemini.";
  }
}

export const getMatchInsights = async (signal: PredictionSignal): Promise<MatchInsights> => {
  const prompt = `
    Analyze the following football match prediction and provide insights:
    Home Team: ${signal.homeTeam}
    Away Team: ${signal.awayTeam}
    League: ${signal.league}
    Market: ${signal.market}
    Probability: ${(signal.probability * 100).toFixed(1)}%
    Odds: ${signal.odds}
    Expected Value (EV): ${(signal.ev * 100).toFixed(1)}%
    
    Provide:
    1. A catchy headline for this bet.
    2. A brief explanation of why this is a good bet.
    3. A risk warning.
    4. A recommended market (can be the same or different).
    5. A Bayesian update reasoning: Explain how the current probability (prior) might be updated given the match context (H2H, form, etc.).
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          explanation: { type: Type.STRING },
          riskWarning: { type: Type.STRING },
          recommendedMarket: { type: Type.STRING },
          bayesianReasoning: { type: Type.STRING },
        },
        required: ["headline", "explanation", "riskWarning", "recommendedMarket", "bayesianReasoning"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
};
