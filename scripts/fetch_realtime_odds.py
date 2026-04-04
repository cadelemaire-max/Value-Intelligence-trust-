import os
import json
import urllib.request
import urllib.parse

# API Configuration
API_KEY = os.environ.get('THE_ODDS_API_KEY')
BASE_URL = 'https://api.the-odds-api.com/v4'

def fetch_realtime_odds(sport_key):
    params = {
        'apiKey': API_KEY,
        'regions': 'eu',
        'markets': 'h2h',
        'oddsFormat': 'decimal',
    }
    query_string = urllib.parse.urlencode(params)
    url = f"{BASE_URL}/sports/{sport_key}/odds?{query_string}"
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            if response.getcode() == 200:
                return json.loads(response.read().decode('utf-8'))
            else:
                return []
    except Exception:
        return []

if __name__ == "__main__":
    if not API_KEY:
        print(json.dumps({"error": "Please set THE_ODDS_API_KEY environment variable."}))
        exit(1)
        
    leagues = ['soccer_epl', 'soccer_germany_bundesliga', 'soccer_spain_la_liga', 'soccer_italy_serie_a']
    all_odds = []
    
    for league in leagues:
        odds = fetch_realtime_odds(league)
        if odds:
            all_odds.extend(odds)
            
    print(json.dumps(all_odds))
