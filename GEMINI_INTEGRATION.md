# Gemini AI & VIT-Predict2 Integration Specification

## 1. Architecture Overview

The integration between **Google Gemini AI** and the **VIT-Predict2** system follows a "Hybrid Ensemble" pattern. Gemini acts as a high-level reasoning layer that processes structured features and unstructured context to refine the outputs of traditional ML models (XGBoost, Neural Networks).

### Data Flow
1.  **Feature Extraction**: VIT-Predict2 extracts structured features (rolling goals, xG, H2H) from the database.
2.  **Contextual Enrichment**: Structured features + unstructured context (league news, weather, injuries) are sent to Gemini.
3.  **Gemini Processing**: Gemini generates a "Reasoning Vector" and a probability score.
4.  **Ensemble Merging**: Gemini's score is weighted (e.g., 15-20%) into the final ensemble probability.
5.  **Insight Generation**: Final prediction is sent back to Gemini to generate natural language bet recommendations and risk warnings.

---

## 2. API Integration Specifications

### A. Model Ensemble Enhancement
**Endpoint**: `POST /api/gemini/enrich` (Simulated in Frontend)

**Request Schema**:
```json
{
  "match_id": "string",
  "home_team": "string",
  "away_team": "string",
  "league": "string",
  "structured_features": {
    "home_rolling_goals": "number",
    "away_rolling_goals": "number",
    "h2h_win_rate": "number",
    "market_odds": "number"
  },
  "unstructured_context": "string (optional)"
}
```

**Response Schema**:
```json
{
  "geminiProbability": "number (0.0 - 1.0)",
  "reasoning": "string",
  "contextualFactors": ["string"],
  "sentimentSignal": "number (-1.0 to 1.0)"
}
```

### B. Bet Recommendation Engine
**Endpoint**: `POST /api/gemini/insights`

**Request Schema**:
```json
{
  "match": "string",
  "final_probability": "number",
  "edge": "number",
  "kelly_stake": "number",
  "market": "string"
}
```

**Response Schema**:
```json
{
  "headline": "string",
  "explanation": "string",
  "riskWarning": "string",
  "recommendedMarket": "string"
}
```

---

## 3. Implementation Strategies

### Prompt Caching
- **Contextual Caching**: For league-wide analysis, the system caches Gemini's "League Profile" for 24 hours to reduce token usage.
- **Match-Level Caching**: Pre-match analysis is cached until 1 hour before kickoff.

### Rate Limiting & Quotas
- **Tiered Access**: High-confidence matches (EV > 5%) get full Gemini reasoning; low-confidence matches get a simplified model.
- **Batch Processing**: Pre-match insights for an entire league are generated in a single multi-turn conversation.

### Fallback Behavior
- If Gemini API is unavailable (5xx or quota exceeded), the system defaults to the **VIT-Predict2 Base Ensemble** (XGBoost + NN) with a 0% weight for the Gemini expert model.
- A "Model Degraded" flag is shown in the UI.

### Response Validation
- **JSON Schema Enforcement**: All Gemini responses are validated against a strict JSON schema before being merged into the ensemble.
- **Sanity Checks**: If Gemini returns a probability $> 20\%$ different from the base ensemble, it is flagged for manual review or capped at a maximum adjustment of $\pm 10\%$.
