import os
import requests

# API Configuration
API_KEY = os.environ.get('THE_ODDS_API_KEY')
BASE_URL = 'https://api.the-odds-api.com/v4'

def fetch_realtime_odds(sport_key):
    url = f"{BASE_URL}/sports/{sport_key}/odds"
    params = {
        'apiKey': API_KEY,
        'regions': 'eu',
        'markets': 'h2h',
        'oddsFormat': 'decimal',
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error fetching odds: {response.status_code}")
        return None

if __name__ == "__main__":
    if not API_KEY:
        print("Please set THE_ODDS_API_KEY environment variable.")
        exit(1)
        
    odds = fetch_realtime_odds('soccer_epl')
    print(odds)
