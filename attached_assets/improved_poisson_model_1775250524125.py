import numpy as np
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass

@dataclass
class TeamStats:
    """Team performance metrics."""
    attack_strength: float  # Attack rating (1.0 = average)
    defense_strength: float  # Defense rating (1.0 = average)
    recent_form: float      # Form multiplier (0.8-1.2 range)
    
@dataclass
class MatchContext:
    """Match-specific conditions."""
    home_advantage: float   # Home advantage multiplier (default 1.15-1.25)
    neutral_venue: bool     # Overrides home advantage if True
    weather_factor: float   # Weather impact on goals (0.9-1.1, optional)

class PoissonMCPredictor:
    """
    Advanced Poisson-based Monte Carlo simulator incorporating:
    - Team strength differentials
    - Home advantage
    - Recent form
    - Confidence intervals
    """
    
    def __init__(self, base_xg_multiplier: float = 1.0, seed: Optional[int] = None):
        """
        Args:
            base_xg_multiplier: Global scaling factor for all xG (e.g., 0.95 if over-estimated)
            seed: Random seed for reproducibility
        """
        self.base_xg_multiplier = base_xg_multiplier
        if seed is not None:
            np.random.seed(seed)
    
    def _adjust_xg(
        self, 
        base_xg: float, 
        team: TeamStats, 
        opponent: TeamStats,
        is_home: bool,
        context: Optional[MatchContext] = None
    ) -> float:
        """
        Adjust xG based on team strength, form, and home advantage.
        
        Logic:
        - Apply attack strength × opponent defense strength
        - Factor in recent form
        - Add home advantage if applicable
        - Adjust for weather/pitch conditions
        """
        context = context or MatchContext(home_advantage=1.20, neutral_venue=False)
        
        # Team strength adjustment: strong attack vs weak defense = higher xG
        strength_factor = team.attack_strength / opponent.defense_strength
        
        # Apply form factor
        form_adjusted = base_xg * strength_factor * team.recent_form
        
        # Home advantage (typically 15-25% increase in goal probability)
        if is_home and not context.neutral_venue:
            form_adjusted *= context.home_advantage
        
        # Weather/condition adjustment
        form_adjusted *= context.weather_factor
        
        # Global multiplier for systematic bias correction
        return form_adjusted * self.base_xg_multiplier
    
    def predict(
        self,
        home_base_xg: float,
        away_base_xg: float,
        home_team: TeamStats,
        away_team: TeamStats,
        context: Optional[MatchContext] = None,
        simulations: int = 50000
    ) -> Dict:
        """
        Run Monte Carlo simulation with strength-adjusted xG.
        
        Args:
            home_base_xg: Base expected goals for home team (without adjustments)
            away_base_xg: Base expected goals for away team
            home_team: Home team stats (attack, defense, form)
            away_team: Away team stats
            context: Match context (home advantage, venue, weather)
            simulations: Number of Monte Carlo iterations
            
        Returns:
            Comprehensive prediction dictionary with probabilities and distributions
        """
        context = context or MatchContext(home_advantage=1.20, neutral_venue=False)
        
        # Adjust xG for both teams
        home_xg_adj = self._adjust_xg(
            home_base_xg, home_team, away_team, is_home=True, context=context
        )
        away_xg_adj = self._adjust_xg(
            away_base_xg, away_team, home_team, is_home=False, context=context
        )
        
        # Monte Carlo simulation
        home_goals = np.random.poisson(home_xg_adj, simulations)
        away_goals = np.random.poisson(away_xg_adj, simulations)
        
        # Calculate match outcomes
        home_wins = (home_goals > away_goals).sum()
        draws = (home_goals == away_goals).sum()
        away_wins = (away_goals > home_goals).sum()
        
        home_win_prob = float(home_wins / simulations)
        draw_prob = float(draws / simulations)
        away_win_prob = float(away_wins / simulations)
        
        # Score distribution analysis
        score_counts: Dict[Tuple[int, int], int] = {}
        for h, a in zip(home_goals.tolist(), away_goals.tolist()):
            key = (int(h), int(a))
            score_counts[key] = score_counts.get(key, 0) + 1
        
        top_scores = sorted(score_counts.items(), key=lambda x: -x[1])[:10]
        score_simulations = [
            {
                "home": h,
                "away": a,
                "probability": round(count / simulations, 4),
                "outcome": "H" if h > a else ("D" if h == a else "A")
            }
            for (h, a), count in top_scores
        ]
        
        # Confidence intervals (95%)
        home_std = np.std(home_goals)
        away_std = np.std(away_goals)
        
        # Over/Under 2.5 goals probability
        total_goals = home_goals + away_goals
        over_2_5 = float((total_goals > 2.5).mean())
        over_3_5 = float((total_goals > 3.5).mean())
        
        # Both teams to score (BTTS)
        btts = float(((home_goals > 0) & (away_goals > 0)).mean())
        
        return {
            # Outcome probabilities
            "home_win": round(home_win_prob, 4),
            "draw": round(draw_prob, 4),
            "away_win": round(away_win_prob, 4),
            
            # Adjusted expected goals
            "home_xg_adjusted": round(home_xg_adj, 3),
            "away_xg_adjusted": round(away_xg_adj, 3),
            "xg_difference": round(home_xg_adj - away_xg_adj, 3),
            
            # Goal distribution
            "home_avg_goals": round(float(home_goals.mean()), 2),
            "away_avg_goals": round(float(away_goals.mean()), 2),
            "home_goals_std": round(home_std, 2),
            "away_goals_std": round(away_std, 2),
            
            # Confidence intervals (95%)
            "home_goals_ci_95": [
                round(float(home_goals.mean()) - 1.96 * home_std, 2),
                round(float(home_goals.mean()) + 1.96 * home_std, 2)
            ],
            "away_goals_ci_95": [
                round(float(away_goals.mean()) - 1.96 * away_std, 2),
                round(float(away_goals.mean()) + 1.96 * away_std, 2)
            ],
            
            # Top scorelines
            "top_scorelines": score_simulations,
            
            # Market-style probabilities
            "over_2_5_goals": round(over_2_5, 4),
            "over_3_5_goals": round(over_3_5, 4),
            "btts": round(btts, 4),
            
            # Team strength summary
            "strength_analysis": {
                "home_attack_rating": home_team.attack_strength,
                "home_defense_rating": home_team.defense_strength,
                "away_attack_rating": away_team.attack_strength,
                "away_defense_rating": away_team.defense_strength,
                "home_form": home_team.recent_form,
                "away_form": away_team.recent_form,
                "home_advantage_applied": context.home_advantage if not context.neutral_venue else 1.0
            },
            
            # Simulation metadata
            "simulations": simulations
        }


# Example usage
if __name__ == "__main__":
    # Initialize predictor
    predictor = PoissonMCPredictor(base_xg_multiplier=0.98, seed=42)
    
    # Define teams (example: strong home team vs. weak away team)
    home_team = TeamStats(
        attack_strength=1.15,      # 15% better attack than average
        defense_strength=0.95,     # 5% better defense than average
        recent_form=1.08           # 8% form boost (recent wins)
    )
    
    away_team = TeamStats(
        attack_strength=0.88,      # 12% weaker attack
        defense_strength=1.12,     # 12% worse defense
        recent_form=0.92           # 8% form dip (recent losses)
    )
    
    # Match context
    context = MatchContext(
        home_advantage=1.22,       # 22% home advantage multiplier
        neutral_venue=False,
        weather_factor=1.00        # Normal conditions
    )
    
    # Run prediction
    result = predictor.predict(
        home_base_xg=1.8,
        away_base_xg=1.2,
        home_team=home_team,
        away_team=away_team,
        context=context,
        simulations=50000
    )
    
    # Display results
    print("=" * 60)
    print("MATCH PREDICTION ANALYSIS")
    print("=" * 60)
    print(f"\nOUTCOME PROBABILITIES:")
    print(f"  Home Win:  {result['home_win']:.2%}")
    print(f"  Draw:      {result['draw']:.2%}")
    print(f"  Away Win:  {result['away_win']:.2%}")
    
    print(f"\nEXPECTED GOALS (ADJUSTED):")
    print(f"  Home: {result['home_xg_adjusted']:.2f} (σ={result['home_goals_std']:.2f})")
    print(f"  Away: {result['away_xg_adjusted']:.2f} (σ={result['away_goals_std']:.2f})")
    print(f"  XG Difference: {result['xg_difference']:+.2f}")
    
    print(f"\nAVERAGE GOALS (95% CI):")
    print(f"  Home: {result['home_avg_goals']:.2f} {result['home_goals_ci_95']}")
    print(f"  Away: {result['away_avg_goals']:.2f} {result['away_goals_ci_95']}")
    
    print(f"\nMARKET PROBABILITIES:")
    print(f"  Over 2.5 Goals: {result['over_2_5_goals']:.2%}")
    print(f"  Over 3.5 Goals: {result['over_3_5_goals']:.2%}")
    print(f"  Both Teams to Score: {result['btts']:.2%}")
    
    print(f"\nTOP 5 SCORELINES:")
    for i, score in enumerate(result['top_scorelines'][:5], 1):
        print(f"  {i}. {score['home']}-{score['away']} ({score['outcome']}) - {score['probability']:.2%}")
    
    print("\n" + "=" * 60)
