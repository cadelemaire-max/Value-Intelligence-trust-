import os
import requests
import pandas as pd
import time
from pathlib import Path

# API Configuration
API_TOKEN = os.environ.get('FOOTBALL_DATA_API_KEY')
BASE_URL = 'https://api.football-data.org/v4'
HEADERS = {'X-Auth-Token': API_TOKEN}

def download_historical_data(league_code, seasons):
    all_matches = []
    for season in seasons:
        print(f"Fetching {league_code} for season {season}...")
        url = f"{BASE_URL}/competitions/{league_code}/matches?season={season}"
        response = requests.get(url, headers=HEADERS)
        
        if response.status_code == 200:
            data = response.json()
            for match in data['matches']:
                all_matches.append({
                    'date': match['utcDate'],
                    'league': data['competition']['name'],
                    'home_team': match['homeTeam']['name'],
                    'away_team': match['awayTeam']['name'],
                    'home_goals': match['score']['fullTime']['home'],
                    'away_goals': match['score']['fullTime']['away'],
                })
        else:
            print(f"Error fetching {league_code} season {season}: {response.status_code}")
        time.sleep(6) # Respect rate limits
    return all_matches

# Example usage
if __name__ == "__main__":
    if not API_TOKEN:
        print("Please set FOOTBALL_DATA_API_KEY environment variable.")
        exit(1)
        
    leagues = ['PL', 'PD', 'BL1', 'SA', 'FL1']
    seasons = ['2022', '2023', '2024']
    
    all_data = []
    for league in leagues:
        all_data.extend(download_historical_data(league, seasons))
    
    df = pd.DataFrame(all_data)
    df.to_csv('historical_data/real_matches.csv', index=False)
    print("✅ Downloaded historical matches to historical_data/real_matches.csv")
