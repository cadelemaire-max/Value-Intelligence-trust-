/**
 * Monte Carlo Simulation Engine for Match Outcomes
 * 
 * Uses Poisson distribution to simulate match scores and 
 * calculate win/draw/loss probabilities over 10,000 iterations.
 */

export interface MonteCarloInput {
  homeXG: number;
  awayXG: number;
  iterations?: number;
}

export interface MonteCarloResult {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  over25Prob: number;
  bttsProb: number;
  avgGoals: number;
  confidenceInterval: [number, number];
  computationTime: string;
}

/**
 * Poisson random number generator
 */
function poissonRandom(lambda: number): number {
  let L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

export function runMonteCarlo(input: MonteCarloInput): MonteCarloResult {
  const startTime = performance.now();
  const iterations = input.iterations || 10000;
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let over25 = 0;
  let btts = 0;
  let totalGoals = 0;

  for (let i = 0; i < iterations; i++) {
    const homeGoals = poissonRandom(input.homeXG);
    const awayGoals = poissonRandom(input.awayXG);

    if (homeGoals > awayGoals) homeWins++;
    else if (homeGoals === awayGoals) draws++;
    else awayWins++;

    if (homeGoals + awayGoals > 2.5) over25++;
    if (homeGoals > 0 && awayGoals > 0) btts++;
    totalGoals += (homeGoals + awayGoals);
  }

  const endTime = performance.now();

  return {
    homeWinProb: homeWins / iterations,
    drawProb: draws / iterations,
    awayWinProb: awayWins / iterations,
    over25Prob: over25 / iterations,
    bttsProb: btts / iterations,
    avgGoals: totalGoals / iterations,
    confidenceInterval: [0.92, 0.98], // Mocked for now
    computationTime: `${(endTime - startTime).toFixed(2)}ms`
  };
}
