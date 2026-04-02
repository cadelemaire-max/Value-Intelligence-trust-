import { GoogleGenAI, ThinkingLevel, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

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
