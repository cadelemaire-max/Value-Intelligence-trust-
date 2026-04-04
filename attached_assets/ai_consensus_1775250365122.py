"""
AI Consensus Engine - Intelligent match analysis based on historical data
Provides meaningful insights, not just generic statements
"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta
import json

class AIConsensus:
    """Generate intelligent match analysis based on historical data"""
    
    def __init__(self, historical_data_path='historical_data/real_matches.csv'):
        self.historical_data = self._load_historical_data(historical_data_path)
        self.trained = self.historical_data is not None
        
    def _load_historical_data(self, path):
        """Load historical match data for training context"""
        if Path(path).exists():
            df = pd.read_csv(path)
            print(f"✅ Loaded {len(df)} historical matches for AI training")
            return df
        print(f"⚠️ No historical data found at {path}")
        return None
    
    def _get_league_trends(self, league):
        """Get historical trends for a specific league"""
        if self.historical_data is None:
            return None
            
        league_data = self.historical_data[self.historical_data['league'] == league]
        if len(league_data) == 0:
            return None
            
        return {
            'avg_total_goals': league_data['total_goals'].mean(),
            'over_2_5_rate': league_data['over_2_5'].mean(),
            'home_win_rate': (league_data['home_score'] > league_data['away_score']).mean(),
            'draw_rate': (league_data['home_score'] == league_data['away_score']).mean(),
            'avg_home_goals': league_data['home_score'].mean(),
            'avg_away_goals': league_data['away_score'].mean(),
            'btts_rate': ((league_data['home_score'] > 0) & (league_data['away_score'] > 0)).mean(),
            'sample_size': len(league_data)
        }
    
    def _get_team_form(self, team, league):
        """Get recent form for a specific team from historical data"""
        if self.historical_data is None:
            return None
            
        # Find team matches (by name pattern since names may vary)
        team_matches = self.historical_data[
            (self.historical_data['home_team'].str.contains(team, case=False, na=False)) |
            (self.historical_data['away_team'].str.contains(team, case=False, na=False))
        ]
        
        if len(team_matches) == 0:
            return None
            
        # Calculate form from last 10 matches
        recent = team_matches.tail(10)
        
        # Determine if team was home or away and calculate goals
        goals_scored = []
        goals_conceded = []
        results = []
        
        for _, match in recent.iterrows():
            if team.lower() in match['home_team'].lower():
                goals_scored.append(match['home_score'])
                goals_conceded.append(match['away_score'])
                results.append('W' if match['home_score'] > match['away_score'] else 
                              'D' if match['home_score'] == match['away_score'] else 'L')
            else:
                goals_scored.append(match['away_score'])
                goals_conceded.append(match['home_score'])
                results.append('W' if match['away_score'] > match['home_score'] else 
                              'D' if match['away_score'] == match['home_score'] else 'L')
        
        return {
            'last_10_form': ''.join(results),
            'avg_goals_scored': np.mean(goals_scored),
            'avg_goals_conceded': np.mean(goals_conceded),
            'recent_over_2_5': ((np.array(goals_scored) + np.array(goals_conceded)) > 2.5).mean(),
            'recent_btts': ((np.array(goals_scored) > 0) & (np.array(goals_conceded) > 0)).mean(),
            'matches_analyzed': len(recent)
        }
    
    def _get_head_to_head(self, home_team, away_team):
        """Get head-to-head historical data"""
        if self.historical_data is None:
            return None
            
        h2h = self.historical_data[
            ((self.historical_data['home_team'].str.contains(home_team, case=False, na=False)) & 
             (self.historical_data['away_team'].str.contains(away_team, case=False, na=False))) |
            ((self.historical_data['home_team'].str.contains(away_team, case=False, na=False)) & 
             (self.historical_data['away_team'].str.contains(home_team, case=False, na=False)))
        ]
        
        if len(h2h) == 0:
            return None
            
        # Standardize to home_team perspective
        results = []
        goals_for = []
        goals_against = []
        
        for _, match in h2h.iterrows():
            if home_team.lower() in match['home_team'].lower():
                results.append('W' if match['home_score'] > match['away_score'] else 
                              'D' if match['home_score'] == match['away_score'] else 'L')
                goals_for.append(match['home_score'])
                goals_against.append(match['away_score'])
            else:
                results.append('W' if match['away_score'] > match['home_score'] else 
                              'D' if match['away_score'] == match['home_score'] else 'L')
                goals_for.append(match['away_score'])
                goals_against.append(match['home_score'])
        
        return {
            'matches': len(h2h),
            'home_wins': results.count('W'),
            'draws': results.count('D'),
            'away_wins': results.count('L'),
            'avg_goals_for': np.mean(goals_for),
            'avg_goals_against': np.mean(goals_against),
            'avg_total_goals': np.mean(np.array(goals_for) + np.array(goals_against)),
            'over_2_5_rate': (np.array(goals_for) + np.array(goals_against) > 2.5).mean()
        }
    
    def generate_consensus(self, home_team, away_team, league, prediction):
        """
        Generate intelligent match analysis based on historical context
        
        Args:
            home_team, away_team, league: Match details
            prediction: Model prediction output
        """
        insights = []
        
        # 1. League context
        league_trends = self._get_league_trends(league)
        if league_trends:
            insights.append(f"📊 League Context: {league} averages {league_trends['avg_total_goals']:.1f} goals per game with a {league_trends['over_2_5_rate']:.1%} Over 2.5 rate. "
                          f"Home teams win {league_trends['home_win_rate']:.1%} of matches.")
        else:
            insights.append(f"📊 League Context: {league} is known for {'high-scoring' if league in ['Bundesliga', 'Eredivisie'] else 'competitive'} football.")
        
        # 2. Team form
        home_form = self._get_team_form(home_team, league)
        away_form = self._get_team_form(away_team, league)
        
        if home_form:
            insights.append(f"🏠 {home_team} Form: {home_form['last_10_form']} | "
                          f"Avg {home_form['avg_goals_scored']:.1f} scored, {home_form['avg_goals_conceded']:.1f} conceded. "
                          f"Over 2.5 in {home_form['recent_over_2_5']:.0%} of recent matches.")
        else:
            insights.append(f"🏠 {home_team}: Limited historical data, relying on league averages.")
        
        if away_form:
            insights.append(f"🚗 {away_team} Form: {away_form['last_10_form']} | "
                          f"Avg {away_form['avg_goals_scored']:.1f} scored, {away_form['avg_goals_conceded']:.1f} conceded.")
        
        # 3. Head-to-head
        h2h = self._get_head_to_head(home_team, away_team)
        if h2h and h2h['matches'] >= 3:
            insights.append(f"⚔️ Head-to-Head ({h2h['matches']} matches): {home_team} won {h2h['home_wins']}, "
                          f"{away_team} won {h2h['away_wins']}, {h2h['draws']} draws. "
                          f"Average {h2h['avg_total_goals']:.1f} goals per meeting.")
        
        # 4. Prediction interpretation
        over_prob = prediction.get('over_2_5_probability', 0.5)
        ev = prediction.get('expected_value', 0)
        expected_total = prediction.get('total_goals', 2.5)
        
        if over_prob > 0.55:
            insights.append(f"🎯 Model expects a high-scoring match ({expected_total:.1f} total goals, {over_prob:.0%} chance Over 2.5).")
        elif over_prob < 0.45:
            insights.append(f"🔒 Model expects a defensive match ({expected_total:.1f} total goals, {over_prob:.0%} chance Over 2.5).")
        else:
            insights.append(f"⚖️ Model sees a balanced match ({expected_total:.1f} total goals, {over_prob:.0%} chance Over 2.5).")
        
        # 5. Value assessment
        if ev > 0.10:
            insights.append(f"💰 VALUE OPPORTUNITY: {ev:.1%} expected value. Market underestimates this outcome.")
        elif ev > 0.05:
            insights.append(f"📈 Moderate Value: {ev:.1%} edge. Consider if confident in league trends.")
        elif ev > 0:
            insights.append(f"⚖️ Fair Value: Small {ev:.1%} edge. Market is close to efficient.")
        else:
            insights.append(f"⚠️ No Value: {ev:.1%} expected value. Market has this priced correctly.")
        
        # 6. Verdict
        verdict = self._generate_verdict(over_prob, ev, league_trends, home_form, away_form)
        insights.append(f"🎯 VERDICT: {verdict}")
        
        return {
            'insights': insights,
            'league_stats': league_trends,
            'home_form': home_form,
            'away_form': away_form,
            'head_to_head': h2h,
            'verdict': verdict
        }
    
    def _generate_verdict(self, over_prob, ev, league_trends, home_form, away_form):
        """Generate final verdict based on all factors"""
        verdict_parts = []
        
        # Over/Under verdict
        if over_prob > 0.58:
            verdict_parts.append("Expect goals")
        elif over_prob < 0.45:
            verdict_parts.append("Expect a tight, defensive match")
        else:
            verdict_parts.append("Match could go either way")
        
        # Value verdict
        if ev > 0.08:
            verdict_parts.append("strong value opportunity")
        elif ev > 0.03:
            verdict_parts.append("small value exists")
        else:
            verdict_parts.append("market is efficient - no clear edge")
        
        # Form context
        if home_form and away_form:
            if home_form['avg_goals_scored'] > away_form['avg_goals_conceded'] + 0.5:
                verdict_parts.append(f"with {home_form['avg_goals_scored']:.1f} avg goals suggesting home advantage")
        
        return " ".join(verdict_parts)


class HistoricalTraining:
    """Train AI on historical patterns"""
    
    def __init__(self, historical_data_path='historical_data/real_matches.csv'):
        self.data = None
        self.patterns = {}
        self._load_and_train(historical_data_path)
    
    def _load_and_train(self, path):
        """Load historical data and extract patterns"""
        if not Path(path).exists():
            print(f"⚠️ No historical data for training at {path}")
            return
            
        df = pd.read_csv(path)
        self.data = df
        print(f"✅ Trained on {len(df)} historical matches")
        
        # Extract patterns by league
        for league in df['league'].unique():
            league_df = df[df['league'] == league]
            
            # Score distribution
            score_dist = league_df.groupby(['home_score', 'away_score']).size().sort_values(ascending=False).head(10)
            
            # Goal timing patterns (if available)
            self.patterns[league] = {
                'avg_goals': league_df['total_goals'].mean(),
                'over_2_5_rate': league_df['over_2_5'].mean(),
                'most_common_scores': [(f"{h}-{a}", count) for (h, a), count in score_dist.items()],
                'home_advantage': league_df['home_score'].mean() - league_df['away_score'].mean()
            }
    
    def get_league_patterns(self, league):
        """Get trained patterns for a specific league"""
        return self.patterns.get(league, None)
    
    def get_historical_comparison(self, home_team, away_team, league):
        """Compare current match to historical similar matches"""
        if self.data is None:
            return None
            
        league_df = self.data[self.data['league'] == league]
        
        # Find matches with similar team strengths (if we have team data)
        # For now, return league benchmarks
        return {
            'league_avg_goals': league_df['total_goals'].mean(),
            'league_over_2_5': league_df['over_2_5'].mean(),
            'league_home_win': (league_df['home_score'] > league_df['away_score']).mean(),
            'comparable_matches': len(league_df)
        }

# Quick test
if __name__ == "__main__":
    consensus = AIConsensus()
    print("AI Consensus Engine Ready")
    
    # Test with a sample prediction
    test_prediction = {
        'over_2_5_probability': 0.62,
        'expected_value': 0.087,
        'total_goals': 3.1,
        'home_win': 0.52,
        'draw': 0.25,
        'away_win': 0.23
    }
    
    result = consensus.generate_consensus('Bayern Munich', 'Borussia Dortmund', 'Germany Bundesliga', test_prediction)
    print("\n📋 SAMPLE AI CONSENSUS:")
    for insight in result['insights']:
        print(f"   {insight}")
