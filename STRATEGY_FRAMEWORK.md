# Betting Strategy & Portfolio Optimization Framework

## 1. Mathematical Framework

### Portfolio Optimization (Markowitz-style)
The goal is to maximize the expected return $E[R_p]$ for a given level of portfolio variance $\sigma_p^2$:
$$E[R_p] = \sum w_i \cdot E[R_i]$$
$$\sigma_p^2 = \sum w_i^2 \cdot \sigma_i^2 + \sum_{i \neq j} w_i w_j \cdot \text{Cov}(R_i, R_j)$$

Where:
- $w_i$ = weight of bet $i$ in the portfolio.
- $E[R_i]$ = expected return of bet $i$ (Edge).
- $\text{Cov}(R_i, R_j)$ = covariance between bets (Correlation).

### Kelly Criterion for Portfolios
When betting on multiple independent events simultaneously:
$$f_i^* = \frac{p_i \cdot b_i - q_i}{b_i}$$
For dependent events, we apply a **Correlation Adjustment Factor (CAF)**:
$$f_{adj} = f_i^* \cdot (1 - \rho_{ij})$$
Where $\rho_{ij}$ is the correlation coefficient between bet $i$ and $j$.

---

## 2. Optimization Algorithms

### A. Variance Minimization
- **Group Exposure Constraints**: Limit total stake in a single league or market type (e.g., max 25% in "Premier League").
- **Diversification Score**: Ratio of unique correlation groups to total bets. Higher is better.

### B. Parlay EV Preservation
A parlay is only viable if:
$$\prod (p_i \cdot \text{Odds}_i) > 1.01$$
If the combined EV drops below 1%, the parlay is rejected as "Negative EV Accumulator."

---

## 3. Market Selection Strategy

| Market | Strategy |
| :--- | :--- |
| **1X2** | Primary market for high-liquidity edge detection. |
| **O/U 2.5** | Secondary market for goal-scoring trend exploitation. |
| **BTTS** | Used for high-variance, high-reward "momentum" plays. |
| **Handicap** | Used to reduce variance on heavy favorites. |

---

## 4. Performance Tracking (Brier Score)
The **Brier Score** measures the accuracy of probabilistic predictions:
$$BS = \frac{1}{N} \sum_{t=1}^N (f_t - o_t)^2$$
Where:
- $f_t$ = predicted probability.
- $o_t$ = actual outcome (1 or 0).
- **Interpretation**: $0.0$ is perfect prediction; $0.25$ is random guessing.

---

## 5. Compliance & Responsible Betting
- **Drawdown Limit**: If portfolio variance exceeds a threshold, all Kelly stakes are automatically halved.
- **Session Tracking**: Monitoring total volume and time spent to ensure disciplined execution.
- **Odds Value Alerts**: Real-time notification when market odds deviate $> 10\%$ from model fair value.
