/**
 * Bayesian Update Engine for Live Sports Predictions
 * 
 * This module simulates the logic for updating pre-match probabilities (Priors)
 * based on live match events (Likelihoods) to produce updated probabilities (Posteriors).
 */

export interface MatchState {
  minute: number;
  score: [number, number]; // [Home, Away]
  shots: [number, number];
  shotsOnTarget: [number, number];
  possession: [number, number];
  redCards: [number, number];
  xG: [number, number];
  sentiment: number; // -1 to 1 (Away momentum to Home momentum)
}

export interface BayesianOutput {
  prior: number;      // Pre-match probability
  likelihood: number; // Impact of live events
  posterior: number;  // Updated probability
  confidence: number; // 0-1, narrows as time increases
  reasoning: string[]; // Explainability
}

/**
 * Pseudocode for Bayesian Update:
 * 
 * P(Win | Events) = [ P(Events | Win) * P(Win) ] / P(Events)
 * 
 * In practice, we use a simplified log-odds update or a Poisson-based 
 * live model that treats the pre-match xG as a prior.
 */

export function calculateLiveUpdate(
  preMatchProb: number,
  state: MatchState
): BayesianOutput {
  // 1. Time Decay Factor (Confidence narrows as match progresses)
  const timeProgress = state.minute / 90;
  const confidence = 0.5 + (timeProgress * 0.45); // Starts at 0.5, ends near 0.95

  // 2. Calculate Likelihood Shift based on events
  let shift = 0;
  const reasoning: string[] = [];

  // Goal Impact (Massive shift)
  const goalDiff = state.score[0] - state.score[1];
  if (goalDiff > 0) {
    shift += 0.25 * goalDiff;
    reasoning.push(`Home lead (+${goalDiff}) significantly increases win probability.`);
  } else if (goalDiff < 0) {
    shift += 0.25 * goalDiff;
    reasoning.push(`Away lead (${goalDiff}) significantly decreases home win probability.`);
  }

  // xG vs Actual Score (Explainability: "Underperforming xG")
  const xGDiff = state.xG[0] - state.xG[1];
  const scoreDiff = state.score[0] - state.score[1];
  if (xGDiff > scoreDiff + 0.5) {
    reasoning.push("Home team creating high-quality chances but failing to convert.");
    shift += 0.05; // Slight bump for better underlying performance
  }

  // Red Card Impact
  if (state.redCards[1] > 0) {
    shift += 0.15 * state.redCards[1];
    reasoning.push("Away team red card provides numerical advantage.");
  }
  if (state.redCards[0] > 0) {
    shift -= 0.20 * state.redCards[0];
    reasoning.push("Home team red card creates defensive vulnerability.");
  }

  // Momentum (Sentiment + Possession)
  const momentum = (state.possession[0] - 50) / 100 + (state.sentiment * 0.1);
  shift += momentum;
  if (momentum > 0.05) reasoning.push("Home team controlling territory and tempo.");

  // 3. Apply Bayesian Update (Simplified Posterior)
  // Posterior = Prior + (Likelihood Shift * (1 - TimeProgress))
  // As time goes to 90, the score becomes the dominant factor.
  const likelihood = shift;
  let posterior = preMatchProb + (shift * (1 - (timeProgress * 0.7)));
  
  // Clamp posterior
  posterior = Math.max(0.01, Math.min(0.99, posterior));

  return {
    prior: preMatchProb,
    likelihood,
    posterior,
    confidence,
    reasoning
  };
}
