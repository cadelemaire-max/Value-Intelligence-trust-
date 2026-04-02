import pandas as pd

class DataPipeline:
    def __init__(self, csv_file):
        self.csv_file = csv_file
        self.data = None

    def load_data(self):
        """Load match data from a CSV file."""
        try:
            self.data = pd.read_csv(self.csv_file)
            print("Data loaded successfully.")
        except Exception as e:
            print(f"An error occurred: {e}")

    def calculate_team_statistics(self, team):
        """Calculate statistics for a specific team."""
        team_data = self.data[self.data['team'] == team]
        stats = {
            'total_matches': len(team_data),
            'wins': len(team_data[team_data['result'] == 'W']),
            'losses': len(team_data[team_data['result'] == 'L']),
            'draws': len(team_data[team_data['result'] == 'D']),
        }
        return stats

    def analyze_head_to_head(self, team1, team2):
        """Analyze head-to-head records between two teams."""
        head_to_head = self.data[(self.data['team1'] == team1) & (self.data['team2'] == team2)]
        return head_to_head

    def analyze_recent_form(self, team, num_matches=5):
        """Analyze recent form of a team."""
        recent_matches = self.data[self.data['team'] == team].tail(num_matches)
        return recent_matches

    def validate_data_quality(self):
        """Validate the quality of the data loaded."""
        if self.data is None:
            print("No data loaded.")
            return False
        missing_values = self.data.isnull().sum().sum()
        if missing_values > 0:
            print(f"Data contains {missing_values} missing values.")
            return False
        print("Data quality is good.")
        return True
