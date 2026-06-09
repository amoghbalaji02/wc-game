require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');
const { getMatches, getOdds, calcPoints } = require('./api');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Rooms ──────────────────────────────────────────────────────────────────

app.post('/api/rooms', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Room name required' });
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  db.prepare('INSERT INTO rooms (code, name) VALUES (?, ?)').run(code, name.trim());
  res.json({ code, name: name.trim() });
});

app.get('/api/rooms/:code', (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room);
});

// ── Users ──────────────────────────────────────────────────────────────────

app.post('/api/users', (req, res) => {
  const { username, room_code } = req.body;
  if (!username?.trim() || !room_code?.trim()) return res.status(400).json({ error: 'Username and room code required' });
  const code = room_code.trim().toUpperCase();
  const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  try {
    const result = db.prepare('INSERT INTO users (username, room_code) VALUES (?, ?)').run(username.trim(), code);
    res.json({ id: result.lastInsertRowid, username: username.trim(), room_code: code });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already taken in this room' });
    throw e;
  }
});

// ── Matches ────────────────────────────────────────────────────────────────

app.get('/api/matches', async (req, res) => {
  try {
    const matches = await getMatches();
    res.json(matches);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Odds ───────────────────────────────────────────────────────────────────

app.get('/api/odds', async (req, res) => {
  try { res.json(await getOdds()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Predictions ────────────────────────────────────────────────────────────

app.post('/api/predictions', (req, res) => {
  const { user_id, match_id, home_goals, away_goals } = req.body;
  if (user_id == null || !match_id || home_goals == null || away_goals == null) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (home_goals < 0 || away_goals < 0 || home_goals > 20 || away_goals > 20) {
    return res.status(400).json({ error: 'Invalid goal values' });
  }
  db.prepare(`
    INSERT INTO predictions (user_id, match_id, home_goals, away_goals)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, match_id) DO UPDATE SET
      home_goals = excluded.home_goals,
      away_goals = excluded.away_goals,
      updated_at = CURRENT_TIMESTAMP
  `).run(user_id, match_id, home_goals, away_goals);
  res.json({ ok: true });
});

app.get('/api/predictions/:user_id', (req, res) => {
  const preds = db.prepare('SELECT * FROM predictions WHERE user_id = ?').all(req.params.user_id);
  res.json(preds);
});

// ── Leaderboard ────────────────────────────────────────────────────────────

app.get('/api/leaderboard/:room_code', async (req, res) => {
  const code = req.params.room_code.toUpperCase();
  const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const users = db.prepare('SELECT * FROM users WHERE room_code = ?').all(code);
  const matches = await getMatches();
  const matchMap = Object.fromEntries(matches.map(m => [m.id, m]));

  const board = users.map(user => {
    const preds = db.prepare('SELECT * FROM predictions WHERE user_id = ?').all(user.id);
    let total = 0, result = 0, exact = 0, scored = 0;
    for (const p of preds) {
      const match = matchMap[p.match_id];
      if (!match || match.homeScore === null) continue;
      const pts = calcPoints(p, match);
      if (pts === null) continue;
      total += pts;
      scored++;
      const predResult = p.home_goals > p.away_goals ? 'H' : p.home_goals < p.away_goals ? 'A' : 'D';
      const actualResult = match.homeScore > match.awayScore ? 'H' : match.homeScore < match.awayScore ? 'A' : 'D';
      if (predResult === actualResult) result++;
      if (p.home_goals === match.homeScore && p.away_goals === match.awayScore) exact++;
    }
    return { username: user.username, total, result, exact, scored, predictions: preds.length };
  });

  board.sort((a, b) => b.total - a.total || b.exact - a.exact);
  res.json({ room, board });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`WC Predictor running at http://localhost:${PORT}`));
