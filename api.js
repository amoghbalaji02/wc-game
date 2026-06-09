const db = require('./db');

const API_KEY = process.env.FOOTBALL_API_KEY || '';
const BASE_URL = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';

const ODDS_API_KEY = process.env.ODDS_API_KEY || '';

async function fetchFromApi(path) {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': API_KEY }
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getMatches() {
  // Return cached data if less than 2 minutes old
  const cached = db.prepare(`SELECT data, updated_at FROM match_cache WHERE match_id = 'all_matches'`).get();
  if (cached) {
    const age = (Date.now() - new Date(cached.updated_at).getTime()) / 1000;
    if (age < 120) return JSON.parse(cached.data);
  }

  if (!API_KEY) {
    return getFallbackMatches();
  }

  try {
    const data = await fetchFromApi(`/competitions/${COMPETITION}/matches?season=2026`);
    const matches = data.matches.map(normalizeMatch);
    db.prepare(`INSERT OR REPLACE INTO match_cache (match_id, data, updated_at) VALUES ('all_matches', ?, CURRENT_TIMESTAMP)`)
      .run(JSON.stringify(matches));
    return matches;
  } catch (e) {
    console.error('API fetch failed, using fallback:', e.message);
    return getFallbackMatches();
  }
}

function normalizeMatch(m) {
  return {
    id: String(m.id),
    homeTeam: m.homeTeam.name,
    homeTeamCode: m.homeTeam.tla || m.homeTeam.shortName,
    awayTeam: m.awayTeam.name,
    awayTeamCode: m.awayTeam.tla || m.awayTeam.shortName,
    utcDate: m.utcDate,
    stage: m.stage,
    group: m.group || null,
    status: m.status, // SCHEDULED, LIVE, IN_PLAY, PAUSED, FINISHED, POSTPONED
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    matchday: m.matchday,
  };
}

// Fallback with sample Group Stage data so the app works without an API key
function getFallbackMatches() {
  return [
    { id: 'demo_1', homeTeam: 'Brazil', homeTeamCode: 'BRA', awayTeam: 'Argentina', awayTeamCode: 'ARG', utcDate: '2026-06-15T18:00:00Z', stage: 'GROUP_STAGE', group: 'Group A', status: 'SCHEDULED', homeScore: null, awayScore: null, matchday: 1 },
    { id: 'demo_2', homeTeam: 'France', homeTeamCode: 'FRA', awayTeam: 'Germany', awayTeamCode: 'GER', utcDate: '2026-06-16T15:00:00Z', stage: 'GROUP_STAGE', group: 'Group B', status: 'SCHEDULED', homeScore: null, awayScore: null, matchday: 1 },
    { id: 'demo_3', homeTeam: 'Spain', homeTeamCode: 'ESP', awayTeam: 'England', awayTeamCode: 'ENG', utcDate: '2026-06-17T21:00:00Z', stage: 'GROUP_STAGE', group: 'Group C', status: 'SCHEDULED', homeScore: null, awayScore: null, matchday: 1 },
    { id: 'demo_4', homeTeam: 'Portugal', homeTeamCode: 'POR', awayTeam: 'Netherlands', awayTeamCode: 'NED', utcDate: '2026-06-18T18:00:00Z', stage: 'GROUP_STAGE', group: 'Group D', status: 'SCHEDULED', homeScore: null, awayScore: null, matchday: 1 },
    { id: 'demo_5', homeTeam: 'USA', homeTeamCode: 'USA', awayTeam: 'Mexico', awayTeamCode: 'MEX', utcDate: '2026-06-19T21:00:00Z', stage: 'GROUP_STAGE', group: 'Group E', status: 'SCHEDULED', homeScore: null, awayScore: null, matchday: 1 },
    { id: 'demo_6', homeTeam: 'Italy', homeTeamCode: 'ITA', awayTeam: 'Japan', awayTeamCode: 'JPN', utcDate: '2026-06-20T15:00:00Z', stage: 'GROUP_STAGE', group: 'Group F', status: 'FINISHED', homeScore: 2, awayScore: 1, matchday: 1 },
    { id: 'demo_7', homeTeam: 'Morocco', homeTeamCode: 'MAR', awayTeam: 'Senegal', awayTeamCode: 'SEN', utcDate: '2026-06-21T18:00:00Z', stage: 'GROUP_STAGE', group: 'Group G', status: 'FINISHED', homeScore: 1, awayScore: 1, matchday: 1 },
    { id: 'demo_8', homeTeam: 'Australia', homeTeamCode: 'AUS', awayTeam: 'South Korea', awayTeamCode: 'KOR', utcDate: '2026-06-22T15:00:00Z', stage: 'GROUP_STAGE', group: 'Group H', status: 'FINISHED', homeScore: 0, awayScore: 2, matchday: 1 },
  ];
}

function calcPoints(prediction, match) {
  if (match.homeScore === null || match.awayScore === null) return null;

  let points = 0;
  const predResult = prediction.home_goals > prediction.away_goals ? 'H'
    : prediction.home_goals < prediction.away_goals ? 'A' : 'D';
  const actualResult = match.homeScore > match.awayScore ? 'H'
    : match.homeScore < match.awayScore ? 'A' : 'D';

  if (predResult === actualResult) points++;
  if (prediction.home_goals === match.homeScore && prediction.away_goals === match.awayScore) points++;

  return points;
}

async function getOdds() {
  const cached = db.prepare(`SELECT data, updated_at FROM match_cache WHERE match_id = 'odds'`).get();
  if (cached) {
    const age = (Date.now() - new Date(cached.updated_at).getTime()) / 1000;
    if (age < 3600) return JSON.parse(cached.data); // cache 1 hour — odds don't change that fast
  }
  if (!ODDS_API_KEY) return {};
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`
    );
    if (!res.ok) { console.error('Odds API error', res.status); return {}; }
    const data = await res.json();
    // Build a map keyed by "HomeTeam|AwayTeam" -> { home, draw, away }
    const oddsMap = {};
    for (const event of data) {
      const bookmaker = event.bookmakers?.[0];
      if (!bookmaker) continue;
      const market = bookmaker.markets?.find(m => m.key === 'h2h');
      if (!market) continue;
      const outcomes = market.outcomes;
      const home = outcomes.find(o => o.name === event.home_team)?.price;
      const away = outcomes.find(o => o.name === event.away_team)?.price;
      const draw = outcomes.find(o => o.name === 'Draw')?.price;
      if (home && away) {
        oddsMap[`${event.home_team}|${event.away_team}`] = { home, draw, away };
      }
    }
    db.prepare(`INSERT OR REPLACE INTO match_cache (match_id, data, updated_at) VALUES ('odds', ?, CURRENT_TIMESTAMP)`)
      .run(JSON.stringify(oddsMap));
    return oddsMap;
  } catch (e) {
    console.error('Odds fetch failed:', e.message);
    return {};
  }
}

module.exports = { getMatches, getOdds, calcPoints };
