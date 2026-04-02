import Papa from 'papaparse';
import { HistoricalMatch, TeamMetrics, H2HSummary } from '../types';

// Helper to generate a dummy date in YYYY-MM-DD format
const generateDummyDate = (index: number, total: number) => {
  const date = new Date();
  date.setDate(date.getDate() - (total - index));
  return date.toISOString().split('T')[0];
};

export const parseHistoricalCSV = async (url: string): Promise<HistoricalMatch[]> => {
  const response = await fetch(url);
  const csvText = await response.text();
  
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const matches = results.data.map((row: any, index: number) => ({
          ...row,
          date: generateDummyDate(index, results.data.length)
        })) as HistoricalMatch[];
        resolve(matches);
      },
      error: (error: any) => reject(error)
    });
  });
};

export const calculateTeamMetrics = (teamName: string, allMatches: HistoricalMatch[]): TeamMetrics => {
  const teamMatches = allMatches.filter(m => m.home_team === teamName || m.away_team === teamName);
  
  if (teamMatches.length === 0) {
    return {
      team: teamName,
      matchesPlayed: 0,
      winRate: 0,
      avgGoalsScored: 0,
      avgGoalsConceded: 0,
      form: [],
      bttsRate: 0,
      over25Rate: 0,
      strengthRating: 1
    };
  }

  let totalGoalsScored = 0;
  let totalGoalsConceded = 0;
  let wins = 0;
  let bttsCount = 0;
  let over25Count = 0;
  const form: ('W' | 'D' | 'L')[] = [];

  // Sort by date (already sorted by generateDummyDate)
  const last5 = teamMatches.slice(-5);

  teamMatches.forEach(m => {
    const isHome = m.home_team === teamName;
    const scored = isHome ? m.home_score : m.away_score;
    const conceded = isHome ? m.away_score : m.home_score;
    
    totalGoalsScored += scored;
    totalGoalsConceded += conceded;
    
    if (scored > conceded) wins++;
    if (m.btts === 1) bttsCount++;
    if (m.over_2_5 === 1) over25Count++;
  });

  last5.forEach(m => {
    const isHome = m.home_team === teamName;
    const scored = isHome ? m.home_score : m.away_score;
    const conceded = isHome ? m.away_score : m.home_score;
    if (scored > conceded) form.push('W');
    else if (scored === conceded) form.push('D');
    else form.push('L');
  });

  const avgGoalsScored = totalGoalsScored / teamMatches.length;
  const avgGoalsConceded = totalGoalsConceded / teamMatches.length;
  const strengthRating = avgGoalsConceded === 0 ? avgGoalsScored : avgGoalsScored / avgGoalsConceded;

  return {
    team: teamName,
    matchesPlayed: teamMatches.length,
    winRate: wins / teamMatches.length,
    avgGoalsScored,
    avgGoalsConceded,
    form,
    bttsRate: bttsCount / teamMatches.length,
    over25Rate: over25Count / teamMatches.length,
    strengthRating
  };
};

export const getH2H = (team1: string, team2: string, allMatches: HistoricalMatch[]): H2HSummary => {
  const h2hMatches = allMatches.filter(m => 
    (m.home_team === team1 && m.away_team === team2) || 
    (m.home_team === team2 && m.away_team === team1)
  );

  let t1Wins = 0;
  let t2Wins = 0;
  let draws = 0;

  h2hMatches.forEach(m => {
    if (m.home_score === m.away_score) {
      draws++;
    } else if (m.home_team === team1) {
      if (m.home_score > m.away_score) t1Wins++;
      else t2Wins++;
    } else {
      if (m.home_score > m.away_score) t2Wins++;
      else t1Wins++;
    }
  });

  return {
    team1,
    team2,
    team1Wins: t1Wins,
    team2Wins: t2Wins,
    draws,
    matches: h2hMatches.slice(-10).reverse() // Last 10, newest first
  };
};

export const findSimilarMatches = (
  homeTeam: string, 
  awayTeam: string, 
  allMatches: HistoricalMatch[],
  allTeamsMetrics: Record<string, TeamMetrics>
): HistoricalMatch[] => {
  const homeMetric = allTeamsMetrics[homeTeam];
  const awayMetric = allTeamsMetrics[awayTeam];

  if (!homeMetric || !awayMetric) return [];

  return allMatches
    .filter(m => {
      // Don't include the current teams in similar matches to avoid circularity
      if (m.home_team === homeTeam || m.away_team === homeTeam || m.home_team === awayTeam || m.away_team === awayTeam) {
        return false;
      }
      return true;
    })
    .map(m => {
      const mHomeMetric = allTeamsMetrics[m.home_team];
      const mAwayMetric = allTeamsMetrics[m.away_team];
      
      if (!mHomeMetric || !mAwayMetric) return { match: m, diff: 999 };

      const homeDiff = Math.abs(mHomeMetric.strengthRating - homeMetric.strengthRating);
      const awayDiff = Math.abs(mAwayMetric.strengthRating - awayMetric.strengthRating);
      
      return { match: m, diff: homeDiff + awayDiff };
    })
    .filter(item => item.diff < 999)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 5)
    .map(item => item.match);
};
