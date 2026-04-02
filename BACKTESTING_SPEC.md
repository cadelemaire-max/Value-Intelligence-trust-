# Backtesting & Validation Specification

## 1. Backtesting Methodology

### Historical Fixture Simulation
The system uses a **Walk-Forward Validation** approach to simulate real-world betting performance over 3 seasons (2023-2026).

- **Training Window**: 24 months of rolling historical data.
- **Holdout Window**: 6 months of out-of-sample testing.
- **Temporal Order**: All tests respect time-series constraints to prevent data leakage (no future data used in past predictions).

---

## 2. Prediction Evaluation Metrics

| Metric | Calculation | Purpose |
| :--- | :--- | :--- |
| **Brier Score** | $\frac{1}{N} \sum (f_t - o_t)^2$ | Overall prediction accuracy (lower is better). |
| **Log Loss** | $-\frac{1}{N} \sum [o_t \log(f_t) + (1-o_t) \log(1-f_t)]$ | Confidence penalty for wrong predictions. |
| **AUC-ROC** | Area under the Receiver Operating Characteristic curve | Discrimination ability (separating winners from losers). |
| **Calibration** | Binning predicted vs actual frequencies | Reliability (does "70%" happen 70% of the time?). |

---

## 3. Model Comparison & Ensemble Analysis

### Ensemble vs Single Model
The **VIT-Predict2 Ensemble** is validated against individual models (Poisson, XGBoost, NN) to measure:
- **Ensemble Gain**: % improvement in Brier Score over the best single model.
- **Diversity Score**: Correlation of errors between models. Lower correlation indicates a more robust ensemble.

---

## 4. Edge Detection & Market Efficiency

### Overround Analysis
The system calculates the **Market Overround (Vig)** to ensure the model's edge is real:
$$\text{Overround} = \left( \sum \frac{1}{\text{Odds}_i} \right) - 1$$
A prediction is only flagged as "Value" if the model's probability exceeds the market's implied probability by at least 2%.

---

## 5. Stress Testing & Robustness

### Seasonal Variation
The model is tested for performance drops during:
- **Early Season (August-September)**: High variance due to squad changes.
- **Mid-Season (December-January)**: Impact of fixture congestion (fatigue).
- **Late Season (April-May)**: Motivation factors (relegation/title battles).

### Hot/Cold Periods
The **Rolling ROI** is monitored to detect "cold streaks" that deviate from statistical expectations (Monte Carlo simulation).
