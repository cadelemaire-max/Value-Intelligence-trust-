import sys
import json
import joblib
import pandas as pd
import os

def predict(home_team, away_team, home_xG, away_xG):
    model_path = 'models/football_model.joblib'
    
    if not os.path.exists(model_path):
        print(json.dumps({"error": f"Model not found at {model_path}. Please train and upload the model first."}))
        sys.exit(1)
        
    try:
        # Load the trained pipeline
        model = joblib.load(model_path)
        
        # Create a DataFrame for the input
        input_data = pd.DataFrame({
            'home_team': [home_team],
            'away_team': [away_team],
            'home_xG': [float(home_xG)],
            'away_xG': [float(away_xG)]
        })
        
        # Make prediction
        prediction = model.predict(input_data)[0]
        probabilities = model.predict_proba(input_data)[0]
        
        # Map prediction back to readable format
        # 1 (Home Win), 0 (Draw), -1 (Away Win)
        result_map = {1: "Home Win", 0: "Draw", -1: "Away Win"}
        
        # Assuming the classes are sorted as [-1, 0, 1] by sklearn
        classes = model.classes_
        prob_dict = {
            "Away Win": float(probabilities[list(classes).index(-1)]) if -1 in classes else 0.0,
            "Draw": float(probabilities[list(classes).index(0)]) if 0 in classes else 0.0,
            "Home Win": float(probabilities[list(classes).index(1)]) if 1 in classes else 0.0
        }
        
        output = {
            "prediction": result_map.get(prediction, "Unknown"),
            "prediction_code": int(prediction),
            "probabilities": prob_dict
        }
        
        print(json.dumps(output))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 5:
        print(json.dumps({"error": "Usage: python predict.py <home_team> <away_team> <home_xG> <away_xG>"}))
        sys.exit(1)
        
    home_team = sys.argv[1]
    away_team = sys.argv[2]
    home_xG = sys.argv[3]
    away_xG = sys.argv[4]
    
    predict(home_team, away_team, home_xG, away_xG)
