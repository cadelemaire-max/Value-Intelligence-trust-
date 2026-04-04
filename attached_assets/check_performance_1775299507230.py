"""
Quick performance check - Run this after 50+ predictions
"""

from tracking_system import VITPerformanceTracker
from analysis_storage import AnalysisStorage

def main():
    tracker = VITPerformanceTracker()
    storage = AnalysisStorage()
    
    print("\n" + "="*70)
    print("🏆 VIT MODEL HEALTH CHECK")
    print("="*70)
    
    # Show tracking stats
    print(tracker.get_performance_report())
    
    # Show storage stats
    print(f"\n📁 Analysis Storage:")
    print(f"   Total stored analyses: {len(storage.analyses)}")
    
    recent = storage.get_recent_analyses(5)
    if recent:
        print(f"\n📋 Last 5 analyses:")
        for r in recent:
            print(f"   {r.get('match')} - {r.get('timestamp', '')[:16]}")
    
    print("\n" + "="*70)
    print("\n💡 Next Steps:")
    print("   1. Keep tracking until 50-100 bets")
    print("   2. If ROI > 5%, model is working")
    print("   3. If ROI < 0%, adjust parameters")
    print("   4. Check which leagues perform best")

if __name__ == "__main__":
    main()
