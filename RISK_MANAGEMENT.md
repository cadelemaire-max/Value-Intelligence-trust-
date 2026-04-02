# Advanced Risk Management & Kelly Criterion

## 1. Mathematical Formulas

### Kelly Criterion (Single Bet)
The optimal fraction of the bankroll to bet is calculated as:
$$f^* = \frac{bp - q}{b}$$
Where:
- $f^*$ = fraction of bankroll to bet
- $b$ = decimal odds minus 1 (net odds)
- $p$ = probability of winning (from model)
- $q$ = probability of losing ($1 - p$)

### Fractional Kelly
To reduce variance and protect against model uncertainty, we apply a multiplier $k$:
$$f_{adj} = k \cdot f^*$$
Typical values for $k$:
- **Full Kelly**: $k = 1.0$ (High variance, maximum growth)
- **Half Kelly**: $k = 0.5$ (Balanced)
- **Quarter Kelly**: $k = 0.25$ (Conservative, recommended)

### Portfolio Metrics
- **Sharpe Ratio**: $\frac{R_p - R_f}{\sigma_p}$
- **Max Drawdown**: $\max \left( \frac{\text{Peak} - \text{Trough}}{\text{Peak}} \right)$

---

## 2. Edge Detection Logic

A bet is only recommended if it passes the **EV Filter**:
1. **Edge Threshold**: $\text{Edge} = (p \cdot \text{Odds}) - 1$. Must be $> 2\%$.
2. **Confidence Floor**: Model consensus (agreement) must be $> 65\%$.
3. **Kelly Constraint**: $f^*$ must be positive (Negative EV bets are rejected).

---

## 3. Bankroll Management Example

**Scenario**:
- Bankroll: $1,000
- Match: Real Madrid vs Barcelona
- Market: Over 2.5 Goals
- Odds: 2.00 ($b = 1$)
- Model Probability: 60% ($p = 0.6, q = 0.4$)
- Fractional Kelly: 0.25 (Quarter Kelly)

**Calculation**:
1. **Raw Kelly**: $f^* = (1 \cdot 0.6 - 0.4) / 1 = 0.2$ (20%)
2. **Fractional Kelly**: $0.2 \cdot 0.25 = 0.05$ (5%)
3. **Max Bet Check**: If max bet is 5%, stake remains 5%.
4. **Final Stake**: $1,000 \cdot 0.05 = \$50$.

---

## 4. Multi-leg Parlay Kelly

For parlays, we treat the entire combination as a single event:
- $P_{\text{parlay}} = \prod p_i$
- $\text{Odds}_{\text{parlay}} = \prod \text{Odds}_i$
- $f^*_{\text{parlay}} = \frac{(\text{Odds}_{\text{parlay}} - 1) \cdot P_{\text{parlay}} - (1 - P_{\text{parlay}})}{\text{Odds}_{\text{parlay}} - 1}$

*Note: Parlays naturally have lower win probabilities, which typically results in much smaller Kelly stakes compared to single bets.*
