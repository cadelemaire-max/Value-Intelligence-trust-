#!/usr/bin/env python3
"""
VIT System Validation Script
Checks all components: tracking, storage, AI consensus, historical data, and API
"""

import sys
import os
import json
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
import requests
import traceback

class VITSystemValidator:
    """Comprehensive system validation"""
    
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.warnings = 0
        self.results = []
    
    def log(self, test_name, status, message=""):
        """Log test result"""
        status_icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
        self.results.append({
            'test': test_name,
            'status': status,
            'message': message
        })
        
        if status == "PASS":
            self.passed += 1
        elif status == "FAIL":
            self.failed += 1
        else:
            self.warnings += 1
            
        print(f"{status_icon} {test_name}: {message}")
    
    def run_all_checks(self):
        """Run all validation checks"""
        print("\n" + "="*70)
        print("🔍 VIT SYSTEM VALIDATION")
        print("="*70)
        
        # 1. Directory Structure
        self.check_directories()
        
        # 2. Core Files
        self.check_core_files()
        
        # 3. Historical Data
        self.check_historical_data()
        
        # 4. Tracking System
        self.check_tracking_system()
        
        # 5. Analysis Storage
        self.check_analysis_storage()
        
        # 6. AI Consensus
        self.check_ai_consensus()
        
        # 7. API Endpoints
        self.check_api_endpoints()
        
        # 8. Training Data
        self.check_training_data()
        
        # 9. Model Loading
        self.check_model_loading()
        
        # 10. Prediction Generation
        self.check_prediction_generation()
        
        # Summary
        self.print_summary()
    
    def check_directories(self):
        """Check required directories exist"""
        print("\n📁 CHECKING DIRECTORIES...")
        print("-"*50)
        
        required_dirs = [
            'historical_data',
            'python-service',
            'data/football/raw',
            'data/football/processed',
        ]
        
        for dir_path in required_dirs:
            if Path(dir_path).exists():
                self.log(f"Directory: {dir_path}", "PASS", "Exists")
            else:
                self.log(f"Directory: {dir_path}", "WARN", f"Missing - creating")
                Path(dir_path).mkdir(parents=True, exist_ok=True)
    
    def check_core_files(self):
        """Check core Python files exist"""
        print("\n📄 CHECKING CORE FILES...")
        print("-"*50)
        
        required_files = [
            'python-service/main.py',
            'python-service/model.py',
            'python-service/data.py',
            'tracking_system.py',
            'analysis_storage.py',
            'ai_consensus.py'
        ]
        
        for file_path in required_files:
            if Path(file_path).exists():
                self.log(f"File: {file_path}", "PASS", "Found")
            else:
                self.log(f"File: {file_path}", "FAIL", "Missing")
    
    def check_historical_data(self):
        """Check historical data files"""
        print("\n📊 CHECKING HISTORICAL DATA...")
        print("-"*50)
        
        data_files = [
            'historical_data/real_matches.csv',
            'historical_data/realistic_historical.csv',
            'historical_data/league_statistics.csv'
        ]
        
        for file_path in data_files:
            if Path(file_path).exists():
                df = pd.read_csv(file_path)
                self.log(f"Historical: {file_path}", "PASS", f"{len(df)} records")
            else:
                self.log(f"Historical: {file_path}", "WARN", "Not found - sample data needed")
    
    def check_tracking_system(self):
        """Check tracking system functionality"""
        print("\n📈 CHECKING TRACKING SYSTEM...")
        print("-"*50)
        
        try:
            sys.path.insert(0, '.')
            from tracking_system import VITPerformanceTracker
            
            tracker = VITPerformanceTracker()
            self.log("Tracking Import", "PASS", "Module loaded")
            
            # Check tracking file
            if Path('performance_tracking.csv').exists():
                df = pd.read_csv('performance_tracking.csv')
                self.log("Tracking File", "PASS", f"{len(df)} tracked predictions")
            else:
                self.log("Tracking File", "WARN", "No tracking data yet - will create on first prediction")
                
        except Exception as e:
            self.log("Tracking System", "FAIL", str(e))
    
    def check_analysis_storage(self):
        """Check analysis storage functionality"""
        print("\n💾 CHECKING ANALYSIS STORAGE...")
        print("-"*50)
        
        try:
            from analysis_storage import AnalysisStorage
            
            storage = AnalysisStorage()
            self.log("Storage Import", "PASS", "Module loaded")
            
            # Check storage file
            if Path('past_analyses.json').exists():
                with open('past_analyses.json', 'r') as f:
                    analyses = json.load(f)
                self.log("Storage File", "PASS", f"{len(analyses)} stored analyses")
            else:
                self.log("Storage File", "WARN", "No analyses stored yet")
                
            # Test save/retrieve
            test_match = {
                'home_team': 'Test Team',
                'away_team': 'Test Opponent',
                'league': 'Test League',
                'date': '2025-01-01'
            }
            test_pred = {'test': 'prediction'}
            key = storage.save_analysis(test_match, test_pred)
            retrieved = storage.get_analysis('Test Team', 'Test Opponent')
            
            if retrieved:
                self.log("Storage Save/Retrieve", "PASS", "Working correctly")
                storage.delete_analysis('Test Team', 'Test Opponent')
            else:
                self.log("Storage Save/Retrieve", "FAIL", "Save/retrieve failed")
                
        except Exception as e:
            self.log("Analysis Storage", "FAIL", str(e))
    
    def check_ai_consensus(self):
        """Check AI consensus functionality"""
        print("\n🧠 CHECKING AI CONSENSUS...")
        print("-"*50)
        
        try:
            from ai_consensus import AIConsensus, HistoricalTraining
            
            consensus = AIConsensus()
            self.log("AI Consensus Import", "PASS", "Module loaded")
            
            # Check historical data loading
            if consensus.historical_data is not None:
                self.log("Historical Data Load", "PASS", f"{len(consensus.historical_data)} matches loaded")
            else:
                self.log("Historical Data Load", "WARN", "No historical data for training")
            
            # Test consensus generation
            test_pred = {
                'over_2_5_probability': 0.58,
                'expected_value': 0.062,
                'total_goals': 2.8,
                'home_win': 0.52,
                'draw': 0.25,
                'away_win': 0.23
            }
            
            result = consensus.generate_consensus(
                'Bayern Munich', 
                'Borussia Dortmund', 
                'Germany Bundesliga', 
                test_pred
            )
            
            if result and 'insights' in result:
                self.log("Consensus Generation", "PASS", f"{len(result['insights'])} insights generated")
            else:
                self.log("Consensus Generation", "FAIL", "Failed to generate insights")
                
        except Exception as e:
            self.log("AI Consensus", "FAIL", str(e))
            traceback.print_exc()
    
    def check_api_endpoints(self):
        """Check API connectivity"""
        print("\n🌐 CHECKING API ENDPOINTS...")
        print("-"*50)
        
        # Check if API is running
        try:
            response = requests.get('http://localhost:8000/health', timeout=5)
            if response.status_code == 200:
                self.log("API Health", "PASS", "Running on port 8000")
            else:
                self.log("API Health", "FAIL", f"Status {response.status_code}")
        except requests.exceptions.ConnectionError:
            self.log("API Health", "WARN", "Not running - start with: cd python-service && python main.py")
            return
        
        # Test prediction endpoint
        try:
            test_payload = {
                'sport': 'football',
                'home_team': 'Arsenal',
                'away_team': 'Chelsea',
                'league': 'England Premier League'
            }
            
            response = requests.post('http://localhost:8000/predict', json=test_payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ['home_win', 'draw', 'away_win', 'over_2_5_probability', 'expected_value']
                missing = [f for f in required_fields if f not in data]
                
                if not missing:
                    self.log("Prediction Endpoint", "PASS", "Working with all fields")
                else:
                    self.log("Prediction Endpoint", "FAIL", f"Missing fields: {missing}")
            else:
                self.log("Prediction Endpoint", "FAIL", f"Status {response.status_code}")
                
        except Exception as e:
            self.log("Prediction Endpoint", "FAIL", str(e))
    
    def check_training_data(self):
        """Check training data quality"""
        print("\n📚 CHECKING TRAINING DATA...")
        print("-"*50)
        
        data_files = Path('historical_data').glob('*.csv')
        total_records = 0
        
        for file in data_files:
            try:
                df = pd.read_csv(file)
                total_records += len(df)
                self.log(f"Data: {file.name}", "PASS", f"{len(df)} rows")
            except Exception as e:
                self.log(f"Data: {file.name}", "FAIL", str(e))
        
        if total_records > 0:
            self.log("Total Training Data", "PASS", f"{total_records} records available")
        else:
            self.log("Total Training Data", "WARN", "No training data found")
    
    def check_model_loading(self):
        """Check model can load and predict"""
        print("\n🤖 CHECKING MODEL...")
        print("-"*50)
        
        try:
            sys.path.insert(0, 'python-service')
            from model import FootballPredictionModel
            
            model = FootballPredictionModel()
            self.log("Model Import", "PASS", "FootballPredictionModel loaded")
            
            # Check if model has required methods
            required_methods = ['predict_match', 'simulate_match']
            missing = [m for m in required_methods if not hasattr(model, m)]
            
            if not missing:
                self.log("Model Methods", "PASS", "All required methods present")
            else:
                self.log("Model Methods", "FAIL", f"Missing: {missing}")
                
        except Exception as e:
            self.log("Model Loading", "FAIL", str(e))
    
    def check_prediction_generation(self):
        """Test prediction generation"""
        print("\n🎯 CHECKING PREDICTION GENERATION...")
        print("-"*50)
        
        try:
            sys.path.insert(0, 'python-service')
            from model import FootballPredictionModel
            from data import get_data
            
            model = FootballPredictionModel()
            data = get_data('Arsenal', 'Chelsea')
            
            result = model.simulate_match(data['home_xg'], data['away_xg'])
            
            required_outputs = ['home_win', 'draw', 'away_win', 'expected_goals', 'additional_markets']
            missing = [o for o in required_outputs if o not in result]
            
            if not missing:
                over_prob = result['additional_markets']['over_2_5']
                self.log("Prediction Generation", "PASS", f"Over 2.5 probability: {over_prob:.1%}")
            else:
                self.log("Prediction Generation", "FAIL", f"Missing outputs: {missing}")
                
        except Exception as e:
            self.log("Prediction Generation", "FAIL", str(e))
            traceback.print_exc()
    
    def print_summary(self):
        """Print validation summary"""
        print("\n" + "="*70)
        print("📊 VALIDATION SUMMARY")
        print("="*70)
        print(f"✅ PASSED: {self.passed}")
        print(f"❌ FAILED: {self.failed}")
        print(f"⚠️ WARNINGS: {self.warnings}")
        print("="*70)
        
        # Print failed tests
        if self.failed > 0:
            print("\n❌ FAILED TESTS:")
            for r in self.results:
                if r['status'] == 'FAIL':
                    print(f"   - {r['test']}: {r['message']}")
        
        # Print warnings
        if self.warnings > 0:
            print("\n⚠️ WARNINGS:")
            for r in self.results:
                if r['status'] == 'WARN':
                    print(f"   - {r['test']}: {r['message']}")
        
        # Final verdict
        print("\n" + "="*70)
        if self.failed == 0 and self.warnings == 0:
            print("🎉 SYSTEM IS FULLY OPERATIONAL! All checks passed.")
        elif self.failed == 0:
            print("✅ SYSTEM IS OPERATIONAL with minor warnings. Address warnings for optimal performance.")
        else:
            print("⚠️ SYSTEM NEEDS ATTENTION. Fix the failed tests above.")
        print("="*70)
        
        # Next steps
        print("\n📋 NEXT STEPS:")
        if self.failed > 0:
            print("   1. Fix the failed tests listed above")
            print("   2. Run this validation again")
        elif self.warnings > 0:
            print("   1. Address warnings for better performance")
            print("   2. Start tracking predictions with the system")
        else:
            print("   1. Start using the system for real predictions")
            print("   2. Track 50-100 bets to measure performance")
            print("   3. Run performance report: python check_performance.py")
        print()

if __name__ == "__main__":
    validator = VITSystemValidator()
    validator.run_all_checks()
