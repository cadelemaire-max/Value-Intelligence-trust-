
# Add to your imports
import sys
sys.path.append('..')
from analysis_storage import AnalysisStorage
from tracking_system import VITPerformanceTracker

# Initialize storage and tracking
analysis_storage = AnalysisStorage()
performance_tracker = VITPerformanceTracker()

# Add to your existing predict endpoint
@app.post("/predict_with_storage")
def predict_with_storage(request: MatchRequest):
    """Prediction with automatic storage and tracking"""
    start = time.time()
    
    # Get prediction (using your existing logic)
    prediction = predict(request)  # Your existing predict function
    
    # Save to storage
    match_data = {
        'home_team': request.home_team,
        'away_team': request.away_team,
        'league': request.league,
        'date': datetime.now().strftime('%Y-%m-%d')
    }
    
    analysis_storage.save_analysis(match_data, prediction)
    
    # Add to tracking (for performance monitoring)
    tracking_data = {
        'match': f"{request.home_team} vs {request.away_team}",
        'home_team': request.home_team,
        'away_team': request.away_team,
        'league': request.league,
        'market': 'Over 2.5',
        'odds': prediction.get('odds', 1.85),
        'model_prob': prediction.get('over_2_5_probability', 0),
        'ev_percent': prediction.get('expected_value', 0) * 100
    }
    performance_tracker.add_prediction(tracking_data)
    
    return prediction

@app.get("/past_analyses")
def get_past_analyses(limit: int = 20, league: str = None, search: str = None):
    """Get past analyses with filtering"""
    if search:
        analyses = analysis_storage.search_analyses(search)
    elif league:
        analyses = analysis_storage.get_analyses_by_league(league)
    else:
        analyses = analysis_storage.get_recent_analyses(limit)
    
    # Format for display
    result = []
    for a in analyses:
        pred = a.get('prediction', {})
        result.append({
            'match': a.get('match'),
            'league': a.get('league'),
            'date': a.get('date'),
            'timestamp': a.get('timestamp'),
            'value_status': pred.get('value_status'),
            'over_2_5_prob': pred.get('over_2_5_probability'),
            'expected_value': pred.get('expected_value'),
            'expected_score': f"{pred.get('predicted_home_score', 0)}-{pred.get('predicted_away_score', 0)}"
        })
    
    return result

@app.get("/performance_report")
def get_performance_report():
    """Get model performance report"""
    return {"report": performance_tracker.get_performance_report()}

@app.post("/update_result")
def update_prediction_result(match: str, result: str, profit: float):
    """Update a prediction with actual result"""
    success = performance_tracker.update_result(match, result, profit)
    return {"success": success}

# Add to imports
import sys
sys.path.append('..')
from ai_consensus import AIConsensus, HistoricalTraining

# Initialize AI Consensus
ai_consensus = AIConsensus()
ai_training = HistoricalTraining()

# Add to your predict endpoint response
@app.post("/predict_with_ai")
def predict_with_ai(request: MatchRequest):
    """Prediction with AI Consensus analysis"""
    
    # Get your existing prediction
    prediction = predict(request)
    
    # Generate AI Consensus
    consensus = ai_consensus.generate_consensus(
        home_team=request.home_team,
        away_team=request.away_team,
        league=request.league,
        prediction=prediction
    )
    
    # Add consensus to response
    prediction['ai_consensus'] = {
        'insights': consensus['insights'],
        'verdict': consensus['verdict'],
        'historical_context': {
            'league_trends': consensus['league_stats'],
            'home_form': consensus['home_form'],
            'away_form': consensus['away_form'],
            'head_to_head': consensus['head_to_head']
        }
    }
    
    return prediction

@app.get("/historical_patterns/{league}")
def get_historical_patterns(league: str):
    """Get historical patterns for a specific league"""
    patterns = ai_training.get_league_patterns(league)
    if patterns:
        return {
            'league': league,
            'avg_goals': patterns['avg_goals'],
            'over_2_5_rate': patterns['over_2_5_rate'],
            'most_common_scores': patterns['most_common_scores'][:5],
            'home_advantage': patterns['home_advantage']
        }
    return {'error': f'No historical data for {league}'}
