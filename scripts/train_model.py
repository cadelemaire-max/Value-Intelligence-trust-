import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
import joblib
import os

def train_and_save_model():
    # 1. Load your enriched data
    data_path = 'data/enriched_historical.csv'
    if not os.path.exists(data_path):
        print(f"❌ Error: {data_path} not found. Please ensure you have run enrich_xg_data.py.")
        return

    df = pd.read_csv(data_path)
    print(f"📊 Loaded {len(df)} matches for training.")

    # 2. Define Target: 1 (Home Win), 0 (Draw), -1 (Away Win)
    df['result'] = df.apply(lambda row: 1 if row['home_goals'] > row['away_goals'] 
                            else (-1 if row['home_goals'] < row['away_goals'] else 0), axis=1)

    # 3. Define Features
    features = ['home_team', 'away_team', 'home_xG', 'away_xG']
    X = df[features]
    y = df['result']

    # 4. Preprocessing: Encode team names, keep xG as numerical
    preprocessor = ColumnTransformer(
        transformers=[
            ('teams', OneHotEncoder(handle_unknown='ignore'), ['home_team', 'away_team']),
            ('stats', 'passthrough', ['home_xG', 'away_xG'])
        ])

    # 5. Create Pipeline
    model = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('classifier', RandomForestClassifier(n_estimators=100, random_state=42))
    ])

    # 6. Train
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    print("🚀 Training model...")
    model.fit(X_train, y_train)
    
    # 7. Evaluate
    score = model.score(X_test, y_test)
    print(f"✅ Model trained! Accuracy on test set: {score:.2%}")

    # 8. Save
    os.makedirs('models', exist_ok=True)
    joblib.dump(model, 'models/football_model.joblib')
    print("💾 Model saved to models/football_model.joblib")

if __name__ == "__main__":
    train_and_save_model()