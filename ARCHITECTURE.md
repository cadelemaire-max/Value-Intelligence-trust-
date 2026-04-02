# Live Match Telemetry Engine Architecture

## 1. Data Pipeline Architecture

The engine uses a **Lambda Architecture** to handle both high-velocity live events and historical context.

### Data Ingestion Layer
- **Event Stream (Kafka/PubSub)**: Ingests sub-second events (goals, cards, shots) from providers like Opta or Sportradar.
- **Odds Stream (WebSockets)**: Continuous monitoring of Betfair/Pinnacle odds to detect market sentiment shifts.
- **Social Sentiment (NLP)**: Real-time processing of Twitter/X and Reddit match threads to gauge "momentum" and "crowd noise."

### Processing Layer (Flink/Spark Streaming)
- **Event Validation**: Deduplication and timestamp alignment (handling out-of-order events).
- **Feature Engineering**: Real-time calculation of rolling xG, territory control (touches in final third), and pass completion rates.
- **Bayesian Update Engine**: The core logic that updates pre-match priors with live likelihoods.

### Storage Layer
- **Redis (Hot Path)**: Stores current match state and latest posterior probabilities for sub-second API access.
- **ClickHouse (Cold Path)**: Stores historical match situations for "Similar Match" comparisons.

---

## 2. Bayesian Update Pseudocode

The core engine uses a **Dynamic Bayesian Network (DBN)** or a **Log-Odds Update** approach.

```python
# Pseudocode for Bayesian Probability Update
def update_match_probability(prior_prob, live_events, match_state):
    """
    prior_prob: P(Win) from pre-match model
    live_events: List of events (goals, red cards, big chances)
    match_state: Current stats (minute, xG, possession)
    """
    
    # 1. Convert Prior to Log-Odds
    prior_log_odds = log(prior_prob / (1 - prior_prob))
    
    # 2. Calculate Likelihood Ratios (LR) for events
    # LR = P(Event | Win) / P(Event | ~Win)
    total_log_likelihood = 0
    for event in live_events:
        lr = get_historical_likelihood_ratio(event, match_state.minute)
        total_log_likelihood += log(lr)
        
    # 3. Incorporate Continuous Stats (xG, Possession)
    # Using a Gaussian Likelihood for xG delta
    xg_delta = match_state.home_xg - match_state.away_xg
    xg_impact = calculate_xg_impact(xg_delta, match_state.minute)
    total_log_likelihood += xg_impact
    
    # 4. Calculate Posterior Log-Odds
    posterior_log_odds = prior_log_odds + total_log_likelihood
    
    # 5. Convert back to Probability
    posterior_prob = 1 / (1 + exp(-posterior_log_odds))
    
    # 6. Apply Time-Decay (Confidence Interval)
    # As t -> 90, the variance of the posterior narrows
    confidence_interval = calculate_ci(posterior_prob, match_state.minute)
    
    return posterior_prob, confidence_interval

def calculate_xg_impact(xg_delta, minute):
    # Historical correlation between xG delta and final outcome
    # diminishes as time runs out if the score doesn't reflect it.
    time_remaining = 90 - minute
    return xg_delta * (time_remaining / 90) * WEIGHT_CONSTANT
```

---

## 3. Model Explainability (XAI)

To explain *why* a probability shifted, we use **SHAP (SHapley Additive exPlanations)** values in real-time:

- **Goal Impact**: "Home goal at 24' contributed +0.32 to win probability."
- **Red Card**: "Away red card at 60' shifted odds by +0.18 due to numerical advantage."
- **Underperforming xG**: "Home win probability remains high (+0.08) despite 0-0 score due to 2.4 xG vs 0.2 xG."

---

## 4. Technical Requirements Implementation

- **Latency**: Redis-based caching and pre-computed likelihood ratios ensure <100ms update cycles.
- **Validation**: Checksum-based event deduplication across multiple data providers.
- **Historical Comparison**: K-Nearest Neighbors (KNN) search in ClickHouse to find the top 50 matches with similar score/xG/minute profiles.
