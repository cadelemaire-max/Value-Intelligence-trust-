# Sports Prediction Data Processing Pipeline

## 1. Pipeline Orchestration (Pseudocode)

The pipeline follows a **Modular ETL (Extract, Transform, Load)** pattern, ensuring each step is independent, testable, and logged.

```python
class PredictionPipeline:
    def __init__(self, config):
        self.loader = DataLoader(config.source)
        self.validator = DataValidator()
        self.engineer = FeatureEngineer()
        self.exporter = DataExporter()

    def run(self):
        try:
            # 1. Ingest
            raw_data = self.loader.load_csv("all_fixtures.csv")
            
            # 2. Clean & Validate
            clean_data = self.validator.clean(raw_data)
            self.validator.check_quality(clean_data)
            
            # 3. Feature Engineering
            features = self.engineer.transform(clean_data)
            
            # 4. ML Vectorization
            ml_vectors = self.engineer.vectorize(features)
            
            # 5. Export
            self.exporter.to_json(ml_vectors, "latest_features.json")
            self.exporter.to_csv(ml_vectors, "training_data.csv")
            
            logger.info("Pipeline completed successfully")
            return ml_vectors
            
        except PipelineError as e:
            logger.error(f"Pipeline failed at step {e.step}: {e.message}")
            self.handle_failure(e)
```

---

## 2. Specific Implementations

### A. Input Handling & Cleaning
```python
def clean_data(df):
    # 1. Handle Missing Values (Imputation)
    # Use median for numeric, 'Unknown' for categorical
    df['possession'].fillna(df['possession'].median(), inplace=True)
    
    # 2. Outlier Detection (Z-Score)
    # Flag goals > 10 as potential data entry errors
    df = df[df['home_goals'] <= 10]
    
    # 3. Duplicate Handling
    df.drop_duplicates(subset=['date', 'home_team', 'away_team'], inplace=True)
    
    return df
```

### B. Feature Engineering (Rolling Averages)
```python
def calculate_rolling_metrics(df, window=5):
    # Sort by date to ensure correct temporal windows
    df = df.sort_values('date')
    
    # Calculate rolling goals for each team
    df['home_rolling_goals'] = df.groupby('home_team')['home_goals'].transform(
        lambda x: x.shift(1).rolling(window=window, min_periods=1).mean()
    )
    
    # Momentum: Weighted average (more weight to recent matches)
    weights = np.linspace(0.5, 1.0, window)
    df['home_momentum'] = df.groupby('home_team')['home_goals'].transform(
        lambda x: x.shift(1).rolling(window=window).apply(lambda y: np.dot(y, weights))
    )
    
    return df
```

### C. Normalization & Z-Scoring
```python
def normalize_features(df, features_to_scale):
    scaler = StandardScaler()
    df[features_to_scale] = scaler.fit_transform(df[features_to_scale])
    return df
```

---

## 3. Data Quality Checks

| Check | Implementation |
| :--- | :--- |
| **Completeness** | Ensure `home_team`, `away_team`, `date`, and `score` are non-null. |
| **Consistency** | Verify `total_goals == home_goals + away_goals`. |
| **Anomalies** | Flag matches where `xG > 5.0` or `possession > 85%` for manual review. |
| **Lineage** | Append `processed_at` and `source_version` metadata to every row. |

---

## 4. Output Formats

1. **ML Vector**: A flattened NumPy array or Tensor ready for model input.
2. **JSON Payload**: Used for real-time API responses (e.g., `{"match_id": "123", "prob_home": 0.65}`).
3. **Streaming Format**: Protobuf or Avro schema for low-latency WebSocket updates.
