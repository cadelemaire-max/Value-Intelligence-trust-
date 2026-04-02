import numpy as np
import scipy.stats as stats

class PoissonMatchPredictor:
    def __init__(self, team_a_strength, team_b_strength):
        self.team_a_strength = team_a_strength
        self.team_b_strength = team_b_strength

    def expected_goals(self):
        # Calculate expected goals
        return self.team_a_strength, self.team_b_strength

    def match_outcome_probability(self):
        # Calculate expected goals
        goals_a, goals_b = self.expected_goals()

        # Calculate probabilities of each outcome using Poisson distribution
        probabilities = {}
        for i in range(6):  # Assume max goals = 5 for both teams
            for j in range(6):
                prob_a = stats.poisson.pmf(i, goals_a)
                prob_b = stats.poisson.pmf(j, goals_b)
                outcome = (i, j)
                probabilities[outcome] = prob_a * prob_b

        return probabilities

    def simulate_score_distribution(self, sims=10000):
        # Simulate match scores based on Poisson distribution
        scores_a = np.random.poisson(self.team_a_strength, sims)
        scores_b = np.random.poisson(self.team_b_strength, sims)
        distribution = np.array(list(zip(scores_a, scores_b)))

        return distribution

# Example usage
if __name__ == "__main__":
    predictor = PoissonMatchPredictor(team_a_strength=1.5, team_b_strength=1.2)
    print("Expected Goals:", predictor.expected_goals())
    print("Match Outcome Probability:", predictor.match_outcome_probability())
    print("Score Distribution Simulation (first 5):", predictor.simulate_score_distribution(sims=5))
