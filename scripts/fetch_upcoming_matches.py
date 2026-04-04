import os
import json
import urllib.request
from datetime import datetime, timedelta

API_TOKEN = os.environ.get('FOOTBALL_DATA_API_KEY')
BASE_URL = 'https://api.football-data.org/v4'

def fetch_upcoming_matches():
    if not API_TOKEN:
        print(json.dumps({"error": "FOOTBALL_DATA_API_KEY not set"}))
        return

    # Fetch matches for the next 7 days
    date_from = datetime.now().strftime('%Y-%m-%d')
    date_to = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
    
    url = f"{BASE_URL}/matches?dateFrom={date_from}&dateTo={date_to}"
    
    req = urllib.request.Request(url)
    req.add_header('X-Auth-Token', API_TOKEN)
    
    try:
        with urllib.request.urlopen(req) as response:
            if response.getcode() == 200:
                data = json.loads(response.read().decode('utf-8'))
                matches = []
                for match in data.get('matches', []):
                    matches.append({
                        'id': str(match['id']),
                        'homeTeam': match['homeTeam']['name'],
                        'awayTeam': match['awayTeam']['name'],
                        'league': match['competition']['name'],
                        'kickoffTime': match['utcDate'],
                        'status': match['status']
                    })
                print(json.dumps(matches))
            else:
                print(json.dumps({"error": f"Error fetching matches: {response.getcode()}"}))
    except Exception as e:
        print(json.dumps({"error": f"Exception fetching matches: {str(e)}"}))

if __name__ == "__main__":
    fetch_upcoming_matches()
