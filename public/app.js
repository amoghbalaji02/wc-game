// ── State ─────────────────────────────────────────────────────────────────

const state = {
  user: null, room: null,
  matches: [], predictions: {},
  leaderboard: [], odds: {},
  tab: 'matches', matchFilter: 'all',
  loadingMatches: true, loadingLeaderboard: false,
};

function loadSession() {
  try { const s = localStorage.getItem('wc_session'); if (s) { const d = JSON.parse(s); state.user = d.user; state.room = d.room; } } catch {}
}
function saveSession() { localStorage.setItem('wc_session', JSON.stringify({ user: state.user, room: state.room })); }
function clearSession() { localStorage.removeItem('wc_session'); state.user = null; state.room = null; state.predictions = {}; state.matches = []; }

// ── API ────────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Render ─────────────────────────────────────────────────────────────────

function render() {
  const app = document.getElementById('app');
  if (!state.user) { app.innerHTML = renderAuth(); bindAuth(); return; }
  app.innerHTML = renderMain();
}

// ── Auth ──────────────────────────────────────────────────────────────────

function renderAuth() {
  return `
    <div class="auth-wrap">
      <div class="auth-hero">
        <div class="trophy">🏆</div>
        <h1>WC 2026 <span>Predictor</span></h1>
        <p>Predict every match · Compete with friends</p>
      </div>
      <div class="auth-card">
        <div id="auth-create" style="display:none">
          <h2>Create a <span>Room</span></h2>
          <div class="form-group"><label>Room Name</label><input id="room-name" placeholder="e.g. The Lads" /></div>
          <div class="form-group"><label>Your Name</label><input id="create-username" placeholder="Your username" /></div>
          <button class="btn btn-primary" id="btn-create-room">Create Room</button>
          <div id="create-msg"></div>
          <div class="auth-divider" style="margin-top:16px">Already have a room?</div>
          <button class="btn btn-secondary" style="margin-top:8px" id="btn-show-join">Join Existing Room</button>
        </div>
        <div id="auth-join">
          <h2>Join a <span>Room</span></h2>
          <div class="form-group"><label>Room Code</label><input id="join-code" placeholder="e.g. AB12CD" style="text-transform:uppercase;letter-spacing:0.12em" maxlength="6" /></div>
          <div class="form-group"><label>Your Name</label><input id="join-username" placeholder="Your username" /></div>
          <button class="btn btn-primary" id="btn-join-room">Join Room</button>
          <div id="join-msg"></div>
          <div class="auth-divider" style="margin-top:16px">No room yet?</div>
          <button class="btn btn-secondary" style="margin-top:8px" id="btn-show-create">Create a New Room</button>
        </div>
      </div>
    </div>`;
}

function bindAuth() {
  document.getElementById('btn-show-create').onclick = () => {
    document.getElementById('auth-create').style.display = 'block';
    document.getElementById('auth-join').style.display = 'none';
  };
  document.getElementById('btn-show-join').onclick = () => {
    document.getElementById('auth-create').style.display = 'none';
    document.getElementById('auth-join').style.display = 'block';
  };
  document.getElementById('btn-create-room').onclick = async () => {
    const name = document.getElementById('room-name').value.trim();
    const username = document.getElementById('create-username').value.trim();
    const msg = document.getElementById('create-msg');
    if (!name || !username) { msg.innerHTML = '<div class="error-msg">Fill in all fields</div>'; return; }
    try {
      const room = await api('POST', '/api/rooms', { name });
      const user = await api('POST', '/api/users', { username, room_code: room.code });
      state.user = user; state.room = room; saveSession();
      await loadData(); render();
    } catch (e) { msg.innerHTML = `<div class="error-msg">${e.message}</div>`; }
  };
  document.getElementById('btn-join-room').onclick = async () => {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    const username = document.getElementById('join-username').value.trim();
    const msg = document.getElementById('join-msg');
    if (!code || !username) { msg.innerHTML = '<div class="error-msg">Fill in all fields</div>'; return; }
    try {
      const room = await api('GET', `/api/rooms/${code}`);
      const user = await api('POST', '/api/users', { username, room_code: code });
      state.user = user; state.room = room; saveSession();
      await loadData(); render();
    } catch (e) { msg.innerHTML = `<div class="error-msg">${e.message}</div>`; }
  };
  ['join-code','join-username'].forEach(id => document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-join-room').click(); }));
  ['room-name','create-username'].forEach(id => document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-create-room').click(); }));
}

// ── Main App ───────────────────────────────────────────────────────────────

function renderMain() {
  return `
    <div class="header">
      <div class="header-brand">
        <div class="brand-icon">⚽</div>
        <div>
          <h1>WC 2026 <span>Predictor</span></h1>
          <div class="room-info">${escHtml(state.room.name)} &nbsp;·&nbsp; Code: <strong>${state.room.code}</strong></div>
        </div>
      </div>
      <div class="header-right">
        <div class="user-chip"><div class="dot"></div>${escHtml(state.user.username)}</div>
        <button class="leave-btn" onclick="logout()">Leave</button>
      </div>
    </div>
    <div class="tabs">
      <button class="tab ${state.tab==='matches'?'active':''}" onclick="setTab('matches')">⚽ Matches</button>
      <button class="tab ${state.tab==='leaderboard'?'active':''}" onclick="setTab('leaderboard')">🏆 Leaderboard</button>
    </div>
    <div id="tab-content">${state.tab==='matches' ? renderMatches() : renderLeaderboard()}</div>`;
}

window.setTab = async (tab) => {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', (tab==='matches' && t.textContent.includes('Matches')) || (tab==='leaderboard' && t.textContent.includes('Leaderboard')));
  });
  const el = document.getElementById('tab-content');
  if (tab === 'leaderboard') {
    el.innerHTML = '<div class="loading"><div class="spinner"></div><br>Loading…</div>';
    await loadLeaderboard();
  }
  el.innerHTML = tab === 'matches' ? renderMatches() : renderLeaderboard();
  if (tab === 'matches') startCountdowns();
};

window.logout = () => { clearSession(); render(); };
window.copyCode = () => {
  navigator.clipboard.writeText(state.room.code);
  const b = document.getElementById('copy-btn');
  if (b) { b.textContent = '✓ Copied!'; setTimeout(() => { if (b) b.textContent = 'Copy Code'; }, 2000); }
};

// ── Matches Tab ─────────────────────────────────────────────────────────────

const STAGE_LABELS = {
  GROUP_STAGE: 'Group Stage', ROUND_OF_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-Finals', SEMI_FINALS: 'Semi-Finals',
  THIRD_PLACE: 'Third Place', FINAL: '🏆 Final',
};

function getMyStats() {
  const finished = state.matches.filter(m => m.status === 'FINISHED');
  let total = 0, predicted = 0;
  for (const m of finished) {
    const p = state.predictions[m.id];
    if (!p) continue;
    predicted++;
    total += calcPoints(p, m);
  }
  const upcoming = state.matches.filter(m => {
    const kicked = new Date(m.utcDate) <= new Date();
    return !kicked && m.status !== 'FINISHED';
  });
  const pendingPreds = upcoming.filter(m => !state.predictions[m.id]).length;
  return { total, predicted, pendingPreds, upcomingCount: upcoming.length };
}

function renderMatches() {
  if (state.loadingMatches) return '<div class="loading"><div class="spinner"></div><br>Loading fixtures…</div>';

  const stats = getMyStats();
  const statsHtml = `
    <div class="stats-bar">
      <div class="stat-card"><div class="num gold">${stats.total}</div><div class="label">My Points</div></div>
      <div class="stat-card"><div class="num green">${stats.predicted}</div><div class="label">Scored</div></div>
      <div class="stat-card"><div class="num blue">${stats.pendingPreds}</div><div class="label">To Predict</div></div>
    </div>`;

  const filters = ['all', 'upcoming', 'finished'];
  const filteredMatches = state.matches.filter(m => {
    if (state.matchFilter === 'upcoming') return m.status !== 'FINISHED';
    if (state.matchFilter === 'finished') return m.status === 'FINISHED';
    return true;
  });

  const grouped = {};
  for (const m of filteredMatches) { if (!grouped[m.stage]) grouped[m.stage] = []; grouped[m.stage].push(m); }

  const stageOrder = ['GROUP_STAGE','ROUND_OF_16','QUARTER_FINALS','SEMI_FINALS','THIRD_PLACE','FINAL'];
  let html = statsHtml + `<div class="filter-row">
    ${filters.map(f => `<button class="filter-btn ${state.matchFilter===f?'active':''}" onclick="setFilter('${f}')">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('')}
  </div>`;

  for (const stage of stageOrder) {
    if (!grouped[stage]) continue;
    html += `<div class="stage-header">${STAGE_LABELS[stage] || stage}</div>`;
    for (const m of grouped[stage]) html += renderMatchCard(m);
  }
  if (!filteredMatches.length) html += '<div class="empty"><div class="icon">📭</div>No matches found</div>';
  return html;
}

window.setFilter = (f) => {
  state.matchFilter = f;
  document.getElementById('tab-content').innerHTML = renderMatches();
  startCountdowns();
};

function renderMatchCard(m) {
  const pred = state.predictions[m.id];
  const isFinished = m.status === 'FINISHED';
  const isLive = m.status === 'IN_PLAY' || m.status === 'LIVE' || m.status === 'PAUSED';
  const kickoffPassed = new Date(m.utcDate) <= new Date();
  const locked = isFinished || isLive || kickoffPassed;

  const statusLabel = isLive
    ? `<span class="match-status live">● LIVE</span>`
    : isFinished ? `<span class="match-status finished">FT</span>`
    : kickoffPassed ? `<span class="match-status locked">🔒 Locked</span>`
    : `<span class="match-status scheduled">${formatDate(m.utcDate)}</span>`;

  const countdown = (!locked && !isFinished)
    ? `<span class="countdown" data-kickoff="${m.utcDate}" id="cd-${m.id}"></span>` : '';

  const homeFlag = countryFlag(m.homeTeamCode);
  const awayFlag = countryFlag(m.awayTeamCode);

  const scoreOrVs = (isFinished || isLive)
    ? `<div class="score-display"><div class="score">${m.homeScore ?? '?'} – ${m.awayScore ?? '?'}</div></div>`
    : `<div class="score-display"><div class="vs">VS</div></div>`;

  const predH = pred?.home_goals ?? '';
  const predA = pred?.away_goals ?? '';
  const predOU = pred?.over_under ?? '';

  let predResultHtml = '';
  if (isFinished && pred) {
    const pts = calcPoints(pred, m);
    const totalGoals = m.homeScore + m.awayScore;
    const actualOU = totalGoals >= 3 ? 'over' : 'under';
    const predResult = pred.home_goals > pred.away_goals ? 'H' : pred.home_goals < pred.away_goals ? 'A' : 'D';
    const actualResult = m.homeScore > m.awayScore ? 'H' : m.homeScore < m.awayScore ? 'A' : 'D';
    predResultHtml = `<div class="pred-result">
      <span class="your-pred">You predicted: ${pred.home_goals}–${pred.away_goals}</span>
      <span class="pt-chip ${predResult===actualResult?'hit':'miss'}">${predResult===actualResult?'✓':'✗'} Result</span>
      <span class="pt-chip ${pred.home_goals===m.homeScore&&pred.away_goals===m.awayScore?'hit':'miss'}">${pred.home_goals===m.homeScore&&pred.away_goals===m.awayScore?'✓':'✗'} Exact score</span>
      <span class="pts-total" style="color:${pts===2?'var(--accent2)':pts>0?'var(--accent)':'var(--muted)'}">${pts} pt${pts!==1?'s':''}</span>
    </div>`;
  } else if (isFinished && !pred) {
    predResultHtml = `<div class="pred-result"><span class="no-pred">No prediction — 0 pts</span></div>`;
  }

  // Find odds by trying team name combinations
  const oddsKey = Object.keys(state.odds).find(k => {
    const [h, a] = k.split('|');
    return (h.includes(m.homeTeam) || m.homeTeam.includes(h)) &&
           (a.includes(m.awayTeam) || m.awayTeam.includes(a));
  });
  const matchOdds = oddsKey ? state.odds[oddsKey] : null;
  const oddsHtml = (matchOdds && !locked) ? `
    <div class="odds-row">
      <div class="odd-chip home ${matchOdds.home < matchOdds.away && matchOdds.home < (matchOdds.draw||99) ? 'fav' : ''}">
        <span class="odd-label">1</span><span class="odd-val">${matchOdds.home.toFixed(2)}</span>
      </div>
      ${matchOdds.draw ? `<div class="odd-chip draw ${matchOdds.draw < matchOdds.home && matchOdds.draw < matchOdds.away ? 'fav' : ''}">
        <span class="odd-label">X</span><span class="odd-val">${matchOdds.draw.toFixed(2)}</span>
      </div>` : ''}
      <div class="odd-chip away ${matchOdds.away < matchOdds.home && matchOdds.away < (matchOdds.draw||99) ? 'fav' : ''}">
        <span class="odd-label">2</span><span class="odd-val">${matchOdds.away.toFixed(2)}</span>
      </div>
    </div>` : '';

  const predSection = !locked ? `
    <div class="pred-section">
      <div class="pred-label">Your Prediction</div>
      <div class="prediction-row">
        <input class="pred-input" type="number" min="0" max="20" id="ph-${m.id}" value="${predH}" placeholder="0" />
        <span class="pred-dash">–</span>
        <input class="pred-input" type="number" min="0" max="20" id="pa-${m.id}" value="${predA}" placeholder="0" />
      </div>
      <button class="save-btn ${pred?'':''}${pred?'':''}​" id="sb-${m.id}" onclick="savePrediction('${m.id}')">
        ${pred ? '✏️ Update Prediction' : '💾 Save Prediction'}
      </button>
    </div>` : '';

  return `<div class="match-card ${pred&&!isFinished?'has-pred':''} ${isFinished?'finished':''}" id="mc-${m.id}">
    <div class="match-top">
      ${m.group ? `<span class="match-group">${m.group}</span>` : ''}
      ${statusLabel}
      ${countdown}
    </div>
    <div class="teams-row">
      <div class="team home">
        <div class="team-flag">${homeFlag}</div>
        <div><div class="team-name">${escHtml(m.homeTeam)}</div><div class="team-code">${m.homeTeamCode||''}</div></div>
      </div>
      ${scoreOrVs}
      <div class="team away">
        <div class="team-flag">${awayFlag}</div>
        <div><div class="team-name">${escHtml(m.awayTeam)}</div><div class="team-code">${m.awayTeamCode||''}</div></div>
      </div>
    </div>
    ${oddsHtml}
    ${predSection}
    ${predResultHtml}
  </div>`;
}

window.toggleOU = (matchId, val) => {
  document.getElementById(`ou-o-${matchId}`).classList.toggle('active', val==='over');
  document.getElementById(`ou-o-${matchId}`).classList.toggle('over', val==='over');
  document.getElementById(`ou-u-${matchId}`).classList.toggle('active', val==='under');
  document.getElementById(`ou-u-${matchId}`).classList.toggle('under', val==='under');
};

window.savePrediction = async (matchId) => {
  const hEl = document.getElementById(`ph-${matchId}`);
  const aEl = document.getElementById(`pa-${matchId}`);
  const saveBtn = document.getElementById(`sb-${matchId}`);
  const h = parseInt(hEl.value), a = parseInt(aEl.value);
  if (isNaN(h) || isNaN(a) || h < 0 || a < 0) { alert('Enter valid scores'); return; }
  saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;
  try {
    await api('POST', '/api/predictions', { user_id: state.user.id, match_id: matchId, home_goals: h, away_goals: a });
    state.predictions[matchId] = { home_goals: h, away_goals: a };
    saveBtn.textContent = '✓ Saved!'; saveBtn.classList.add('saved');
    document.getElementById(`mc-${matchId}`)?.classList.add('has-pred');
    setTimeout(() => { if (saveBtn) { saveBtn.textContent = '✏️ Update Prediction'; saveBtn.classList.remove('saved'); saveBtn.disabled = false; } }, 1800);
  } catch (e) { alert(e.message); saveBtn.textContent = '💾 Save Prediction'; saveBtn.disabled = false; }
};

// ── Countdown timers ────────────────────────────────────────────────────────

let countdownInterval = null;
function startCountdowns() {
  if (countdownInterval) clearInterval(countdownInterval);
  function tick() {
    document.querySelectorAll('[data-kickoff]').forEach(el => {
      const diff = new Date(el.dataset.kickoff) - new Date();
      if (diff <= 0) { el.textContent = ''; return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.textContent = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
    });
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}

// ── Leaderboard Tab ────────────────────────────────────────────────────────

function renderLeaderboard() {
  if (state.loadingLeaderboard) return '<div class="loading"><div class="spinner"></div><br>Loading…</div>';
  const board = state.leaderboard;

  const podiumHtml = board.length >= 1 ? `
    <div class="podium">
      ${board[1] ? `<div class="podium-card p2">
        <div class="podium-medal">🥈</div>
        <div class="podium-name">${escHtml(board[1].username)}${board[1].username===state.user.username?'<span class="you-tag">you</span>':''}</div>
        <div class="podium-pts">${board[1].total}</div>
        <div class="podium-sub">${board[1].scored ?? 0} matches scored</div>
      </div>` : '<div></div>'}
      <div class="podium-card p1">
        <div class="podium-medal">🥇</div>
        <div class="podium-name">${escHtml(board[0].username)}${board[0].username===state.user.username?'<span class="you-tag">you</span>':''}</div>
        <div class="podium-pts">${board[0].total}</div>
        <div class="podium-sub">${board[0].scored ?? 0} matches scored</div>
      </div>
      ${board[2] ? `<div class="podium-card p3">
        <div class="podium-medal">🥉</div>
        <div class="podium-name">${escHtml(board[2].username)}${board[2].username===state.user.username?'<span class="you-tag">you</span>':''}</div>
        <div class="podium-pts">${board[2].total}</div>
        <div class="podium-sub">${board[2].scored ?? 0} matches scored</div>
      </div>` : '<div></div>'}
    </div>` : '';

  const restRows = board.slice(3).map((row, i) => `
    <div class="lb-row ${row.username===state.user.username?'is-you':''}">
      <div class="lb-rank">${i+4}</div>
      <div class="lb-name">${escHtml(row.username)}${row.username===state.user.username?'<span class="you-tag">you</span>':''}</div>
      <div class="lb-total">${row.total}</div>
      <div class="lb-stat">${row.result}</div>
      <div class="lb-stat">${row.exact}</div>
    </div>`).join('');

  return `
    <div class="room-invite">
      <div class="invite-text">
        <div class="label">Invite friends — share your room code</div>
        <div class="code">${state.room.code}</div>
      </div>
      <button class="copy-btn" id="copy-btn" onclick="copyCode()">Copy Code</button>
    </div>
    ${board.length === 0 ? '<div class="empty"><div class="icon">🏆</div>No scores yet — make some predictions!</div>' : `
    ${podiumHtml}
    ${board.length > 3 ? `
    <div class="lb-table">
      <div class="lb-header"><div>#</div><div>Player</div><div>Pts</div><div>Result</div><div>Exact</div></div>
      ${restRows}
    </div>` : ''}
    <div class="lb-scoring">
      <span>🎯 Correct result = 1pt</span>
      <span>✅ Exact score = 1pt</span>
    </div>`}`;
}

// ── Data loading ─────────────────────────────────────────────────────────

async function loadData() {
  state.loadingMatches = true;
  const [matches, preds, odds] = await Promise.all([
    api('GET', '/api/matches'),
    api('GET', `/api/predictions/${state.user.id}`),
    api('GET', '/api/odds').catch(() => ({})),
  ]);
  state.matches = matches;
  state.predictions = {};
  for (const p of preds) state.predictions[p.match_id] = p;
  state.odds = odds;
  state.loadingMatches = false;
}

async function loadLeaderboard() {
  state.loadingLeaderboard = true;
  try { const data = await api('GET', `/api/leaderboard/${state.room.code}`); state.leaderboard = data.board; }
  catch (e) { state.leaderboard = []; }
  state.loadingLeaderboard = false;
}

// ── Scoring ───────────────────────────────────────────────────────────────

function calcPoints(pred, match) {
  if (match.homeScore === null || match.awayScore === null) return null;
  let pts = 0;
  const pr = pred.home_goals > pred.away_goals ? 'H' : pred.home_goals < pred.away_goals ? 'A' : 'D';
  const ar = match.homeScore > match.awayScore ? 'H' : match.homeScore < match.awayScore ? 'A' : 'D';
  if (pr === ar) pts++;
  if (pred.home_goals === match.homeScore && pred.away_goals === match.awayScore) pts++;
  return pts;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function formatDate(utcDate) {
  return new Date(utcDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'UTC' }) + ' UTC';
}

const FLAG_MAP = {
  BRA:'🇧🇷',ARG:'🇦🇷',FRA:'🇫🇷',GER:'🇩🇪',ESP:'🇪🇸',ENG:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',POR:'🇵🇹',NED:'🇳🇱',
  ITA:'🇮🇹',JPN:'🇯🇵',MAR:'🇲🇦',SEN:'🇸🇳',AUS:'🇦🇺',KOR:'🇰🇷',USA:'🇺🇸',MEX:'🇲🇽',
  URU:'🇺🇾',COL:'🇨🇴',ECU:'🇪🇨',CHI:'🇨🇱',CRO:'🇭🇷',SUI:'🇨🇭',DEN:'🇩🇰',BEL:'🇧🇪',
  POL:'🇵🇱',SRB:'🇷🇸',TUR:'🇹🇷',CZE:'🇨🇿',GRE:'🇬🇷',CMR:'🇨🇲',GHA:'🇬🇭',CIV:'🇨🇮',
  EGY:'🇪🇬',NGA:'🇳🇬',TUN:'🇹🇳',ALG:'🇩🇿',SWE:'🇸🇪',NOR:'🇳🇴',IRN:'🇮🇷',SAU:'🇸🇦',
  QAT:'🇶🇦',CAN:'🇨🇦',PAN:'🇵🇦',CRC:'🇨🇷',HON:'🇭🇳',PAR:'🇵🇾',BOL:'🇧🇴',VEN:'🇻🇪',PER:'🇵🇪',
  RSA:'🇿🇦',CMR:'🇨🇲',TAN:'🇹🇿',ZIM:'🇿🇼',
  SLO:'🇸🇮',SVK:'🇸🇰',UKR:'🇺🇦',ROU:'🇷🇴',HUN:'🇭🇺',AUT:'🇦🇹',SCO:'🏴󠁧󠁢󠁳󠁣󠁴󠁿',WAL:'🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  IRQ:'🇮🇶',JOR:'🇯🇴',UZB:'🇺🇿',THA:'🇹🇭',IDN:'🇮🇩',
};
function countryFlag(code) { return FLAG_MAP[code] || '🏳'; }

// ── Boot ──────────────────────────────────────────────────────────────────

(async () => {
  loadSession();
  if (state.user) { try { await loadData(); } catch (e) { clearSession(); } }
  render();
  if (state.user && state.tab === 'matches') startCountdowns();
})();
