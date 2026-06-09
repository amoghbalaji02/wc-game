// ── State ─────────────────────────────────────────────────────────────────

const state = {
  user: null,
  room: null,
  matches: [],
  predictions: {},  // match_id -> prediction
  leaderboard: [],
  tab: 'matches',
  matchFilter: 'all',
  loadingMatches: true,
  loadingLeaderboard: false,
};

function loadSession() {
  try {
    const s = localStorage.getItem('wc_session');
    if (s) { const d = JSON.parse(s); state.user = d.user; state.room = d.room; }
  } catch {}
}
function saveSession() {
  localStorage.setItem('wc_session', JSON.stringify({ user: state.user, room: state.room }));
}
function clearSession() {
  localStorage.removeItem('wc_session');
  state.user = null; state.room = null;
  state.predictions = {}; state.matches = [];
}

// ── API ────────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Render ─────────────────────────────────────────────────────────────────

function render() {
  const app = document.getElementById('app');
  if (!state.user) { app.innerHTML = renderAuth(); bindAuth(); return; }
  app.innerHTML = renderMain();
  bindMain();
}

// ── Auth ──────────────────────────────────────────────────────────────────

function renderAuth() {
  return `
    <div class="auth-wrap">
      <div style="text-align:center;margin-bottom:8px">
        <div style="font-size:2.5rem">⚽</div>
        <h1 style="font-size:1.6rem;font-weight:800;margin-top:8px">WC 2026 <span style="color:var(--accent)">Predictor</span></h1>
        <p style="color:var(--muted);font-size:0.9rem;margin-top:6px">Predict scores, compete with friends</p>
      </div>
      <div class="auth-card">
        <div id="auth-create" style="display:none">
          <h2>Create a <span>Room</span></h2>
          <div class="form-group"><label>Room Name</label><input id="room-name" placeholder="e.g. The Lads" /></div>
          <div class="form-group"><label>Your Name</label><input id="create-username" placeholder="Your username" /></div>
          <button class="btn btn-primary" id="btn-create-room">Create Room</button>
          <div id="create-msg"></div>
          <div class="auth-divider" style="margin-top:16px">Already have a room?</div>
          <button class="btn btn-secondary" id="btn-show-join">Join Existing Room</button>
        </div>
        <div id="auth-join">
          <h2>Join a <span>Room</span></h2>
          <div class="form-group"><label>Room Code</label><input id="join-code" placeholder="e.g. AB12CD" style="text-transform:uppercase;letter-spacing:0.1em" maxlength="6" /></div>
          <div class="form-group"><label>Your Name</label><input id="join-username" placeholder="Your username" /></div>
          <button class="btn btn-primary" id="btn-join-room">Join Room</button>
          <div id="join-msg"></div>
          <div class="auth-divider" style="margin-top:16px">No room yet?</div>
          <button class="btn btn-secondary" id="btn-show-create">Create a New Room</button>
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

  // Allow Enter key
  ['join-code','join-username'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-join-room').click();
    });
  });
  ['room-name','create-username'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-create-room').click();
    });
  });
}

// ── Main App ───────────────────────────────────────────────────────────────

function renderMain() {
  return `
    <div class="header">
      <div class="header-left">
        <span style="font-size:1.6rem">⚽</span>
        <div>
          <h1>WC 2026 <span>Predictor</span></h1>
          <div class="room-info">${state.room.name} &nbsp;·&nbsp; Code: <strong>${state.room.code}</strong></div>
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <div class="user-chip"><div class="dot"></div>${escHtml(state.user.username)}</div>
        <button onclick="logout()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:0.8rem">Leave</button>
      </div>
    </div>
    <div class="tabs">
      <button class="tab ${state.tab === 'matches' ? 'active' : ''}" onclick="setTab('matches')">Matches</button>
      <button class="tab ${state.tab === 'leaderboard' ? 'active' : ''}" onclick="setTab('leaderboard')">Leaderboard</button>
    </div>
    <div id="tab-content">${state.tab === 'matches' ? renderMatches() : renderLeaderboard()}</div>`;
}

function bindMain() {
  // no extra binding needed; all interactive elements use inline onclick
}

window.setTab = async (tab) => {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.textContent.toLowerCase() === tab));
  const el = document.getElementById('tab-content');
  if (tab === 'leaderboard') {
    el.innerHTML = '<div class="loading"><div class="spinner"></div><br>Loading…</div>';
    await loadLeaderboard();
  }
  el.innerHTML = tab === 'matches' ? renderMatches() : renderLeaderboard();
};

window.logout = () => { clearSession(); render(); };
window.copyCode = () => {
  navigator.clipboard.writeText(state.room.code);
  document.getElementById('copy-btn').textContent = 'Copied!';
  setTimeout(() => { const b = document.getElementById('copy-btn'); if (b) b.textContent = 'Copy'; }, 2000);
};

// ── Matches Tab ─────────────────────────────────────────────────────────────

const STAGE_LABELS = {
  GROUP_STAGE: 'Group Stage',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-Finals',
  SEMI_FINALS: 'Semi-Finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
};

function renderMatches() {
  if (state.loadingMatches) return '<div class="loading"><div class="spinner"></div><br>Loading fixtures…</div>';
  const filters = ['all', 'upcoming', 'finished'];
  const filteredMatches = state.matches.filter(m => {
    if (state.matchFilter === 'upcoming') return m.status !== 'FINISHED';
    if (state.matchFilter === 'finished') return m.status === 'FINISHED';
    return true;
  });

  const grouped = {};
  for (const m of filteredMatches) {
    const key = m.stage;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }

  const stageOrder = ['GROUP_STAGE','ROUND_OF_16','QUARTER_FINALS','SEMI_FINALS','THIRD_PLACE','FINAL'];
  let html = `<div class="filter-row">
    ${filters.map(f => `<button class="filter-btn ${state.matchFilter===f?'active':''}" onclick="setFilter('${f}')">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('')}
  </div>`;

  for (const stage of stageOrder) {
    if (!grouped[stage]) continue;
    html += `<div class="stage-header">${STAGE_LABELS[stage] || stage}</div>`;
    for (const m of grouped[stage]) html += renderMatchCard(m);
  }
  if (!filteredMatches.length) html += '<div class="empty">No matches found</div>';
  return html;
}

window.setFilter = (f) => {
  state.matchFilter = f;
  document.getElementById('tab-content').innerHTML = renderMatches();
};

function renderMatchCard(m) {
  const pred = state.predictions[m.id];
  const isFinished = m.status === 'FINISHED';
  const isLive = m.status === 'IN_PLAY' || m.status === 'LIVE' || m.status === 'PAUSED';
  const kickoffPassed = new Date(m.utcDate) <= new Date();
  const locked = isFinished || isLive || kickoffPassed;

  const statusLabel = isLive ? `<span class="match-status live">LIVE</span>`
    : isFinished ? `<span class="match-status finished">FT</span>`
    : kickoffPassed ? `<span class="match-status scheduled">Locked</span>`
    : `<span class="match-status scheduled">${formatDate(m.utcDate)}</span>`;

  const homeFlag = countryFlag(m.homeTeamCode);
  const awayFlag = countryFlag(m.awayTeamCode);

  const scoreOrVs = isFinished || isLive
    ? `<div class="score-display"><div class="score">${m.homeScore ?? '?'} – ${m.awayScore ?? '?'}</div></div>`
    : `<div class="score-display"><div class="vs">vs</div></div>`;

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
      <span class="your-pred">Your pred: ${pred.home_goals}–${pred.away_goals} ${pred.over_under === 'over' ? '⬆' : '⬇'}</span>
      <span class="pt-chip ${predResult===actualResult?'hit':'miss'}">${predResult===actualResult?'✓':'✗'} Result</span>
      <span class="pt-chip ${pred.home_goals===m.homeScore&&pred.away_goals===m.awayScore?'hit':'miss'}">${pred.home_goals===m.homeScore&&pred.away_goals===m.awayScore?'✓':'✗'} Exact</span>
      <span class="pt-chip ${pred.over_under===actualOU?'hit':'miss'}">${pred.over_under===actualOU?'✓':'✗'} O/U</span>
      <strong style="margin-left:auto">${pts} pt${pts!==1?'s':''}</strong>
    </div>`;
  } else if (isFinished && !pred) {
    predResultHtml = `<div class="pred-result"><span class="your-pred" style="color:var(--danger)">No prediction — 0 pts</span></div>`;
  }

  return `<div class="match-card ${pred?'has-pred':''} ${isFinished?'finished':''} ${locked?'locked':''}" id="mc-${m.id}">
    <div class="match-top">
      ${m.group ? `<span class="match-group">${m.group}</span>` : ''}
      ${statusLabel}
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
    ${!locked ? `
    <div class="prediction-row">
      <input class="pred-input" type="number" min="0" max="20" id="ph-${m.id}" value="${predH}" placeholder="0" ${locked?'disabled':''} />
      <span class="pred-dash">–</span>
      <input class="pred-input" type="number" min="0" max="20" id="pa-${m.id}" value="${predA}" placeholder="0" ${locked?'disabled':''} />
      <div class="ou-toggle">
        <button class="ou-btn over ${predOU==='over'?'active over':''}" id="ou-o-${m.id}" onclick="toggleOU('${m.id}','over')" ${locked?'disabled':''}>3+ ⬆</button>
        <button class="ou-btn under ${predOU==='under'?'active under':''}" id="ou-u-${m.id}" onclick="toggleOU('${m.id}','under')" ${locked?'disabled':''}>≤2 ⬇</button>
      </div>
    </div>
    <button class="save-btn" id="sb-${m.id}" onclick="savePrediction('${m.id}')" ${locked?'disabled':''}>
      ${pred ? 'Update Prediction' : 'Save Prediction'}
    </button>
    ` : ''}
    ${predResultHtml}
  </div>`;
}

window.toggleOU = (matchId, val) => {
  document.getElementById(`ou-o-${matchId}`).classList.toggle('active', val === 'over');
  document.getElementById(`ou-o-${matchId}`).classList.toggle('over', val === 'over');
  document.getElementById(`ou-u-${matchId}`).classList.toggle('active', val === 'under');
  document.getElementById(`ou-u-${matchId}`).classList.toggle('under', val === 'under');
};

window.savePrediction = async (matchId) => {
  const hEl = document.getElementById(`ph-${matchId}`);
  const aEl = document.getElementById(`pa-${matchId}`);
  const oBtn = document.getElementById(`ou-o-${matchId}`);
  const uBtn = document.getElementById(`ou-u-${matchId}`);
  const saveBtn = document.getElementById(`sb-${matchId}`);

  const h = parseInt(hEl.value);
  const a = parseInt(aEl.value);
  const ou = oBtn.classList.contains('active') ? 'over' : uBtn.classList.contains('active') ? 'under' : null;

  if (isNaN(h) || isNaN(a) || h < 0 || a < 0) { alert('Enter valid scores'); return; }
  if (!ou) { alert('Select over (3+ goals) or under (≤2 goals)'); return; }

  saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;
  try {
    await api('POST', '/api/predictions', { user_id: state.user.id, match_id: matchId, home_goals: h, away_goals: a, over_under: ou });
    state.predictions[matchId] = { home_goals: h, away_goals: a, over_under: ou };
    saveBtn.textContent = 'Saved ✓';
    const card = document.getElementById(`mc-${matchId}`);
    card.classList.add('has-pred');
    setTimeout(() => { if (saveBtn) saveBtn.textContent = 'Update Prediction'; saveBtn.disabled = false; }, 1500);
  } catch (e) {
    alert(e.message); saveBtn.textContent = 'Update Prediction'; saveBtn.disabled = false;
  }
};

// ── Leaderboard Tab ────────────────────────────────────────────────────────

function renderLeaderboard() {
  if (state.loadingLeaderboard) return '<div class="loading"><div class="spinner"></div><br>Loading…</div>';
  const board = state.leaderboard;
  return `
    <div class="room-code-box">
      <div><div class="label">Invite friends with room code</div><div class="code">${state.room.code}</div></div>
      <button class="copy-btn" id="copy-btn" onclick="copyCode()">Copy</button>
    </div>
    ${board.length === 0 ? '<div class="empty">No scores yet — make some predictions!</div>' : `
    <div class="lb-header">
      <div>#</div><div>Player</div><div style="text-align:center">Total</div><div style="text-align:center">Result</div><div style="text-align:center">Exact</div><div style="text-align:center">O/U</div>
    </div>
    ${board.map((row, i) => `
      <div class="lb-row rank-${i+1}">
        <div class="lb-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i+1}</div>
        <div class="lb-name">${escHtml(row.username)}${row.username === state.user.username ? '<span class="you">you</span>' : ''}</div>
        <div class="lb-total">${row.total}</div>
        <div class="lb-stat">${row.result}</div>
        <div class="lb-stat">${row.exact}</div>
        <div class="lb-stat">${row.ou}</div>
      </div>`).join('')}
    <div style="font-size:0.75rem;color:var(--muted);text-align:center;margin-top:16px">
      Points: 1 correct result · 1 exact score · 1 correct over/under
    </div>`}`;
}

// ── Data loading ────────────────────────────────────────────────────────────

async function loadData() {
  state.loadingMatches = true;
  const [matches, preds] = await Promise.all([
    api('GET', '/api/matches'),
    api('GET', `/api/predictions/${state.user.id}`),
  ]);
  state.matches = matches;
  state.predictions = {};
  for (const p of preds) state.predictions[p.match_id] = p;
  state.loadingMatches = false;
}

async function loadLeaderboard() {
  state.loadingLeaderboard = true;
  try {
    const data = await api('GET', `/api/leaderboard/${state.room.code}`);
    state.leaderboard = data.board;
  } catch (e) { state.leaderboard = []; }
  state.loadingLeaderboard = false;
}

// ── Scoring (client-side mirror) ───────────────────────────────────────────

function calcPoints(pred, match) {
  if (match.homeScore === null || match.awayScore === null) return null;
  let pts = 0;
  const pr = pred.home_goals > pred.away_goals ? 'H' : pred.home_goals < pred.away_goals ? 'A' : 'D';
  const ar = match.homeScore > match.awayScore ? 'H' : match.homeScore < match.awayScore ? 'A' : 'D';
  if (pr === ar) pts++;
  if (pred.home_goals === match.homeScore && pred.away_goals === match.awayScore) pts++;
  const actualOU = (match.homeScore + match.awayScore) >= 3 ? 'over' : 'under';
  if (pred.over_under === actualOU) pts++;
  return pts;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(utcDate) {
  const d = new Date(utcDate);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}

const FLAG_MAP = {
  BRA:'🇧🇷',ARG:'🇦🇷',FRA:'🇫🇷',GER:'🇩🇪',ESP:'🇪🇸',ENG:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',POR:'🇵🇹',NED:'🇳🇱',
  ITA:'🇮🇹',JPN:'🇯🇵',MAR:'🇲🇦',SEN:'🇸🇳',AUS:'🇦🇺',KOR:'🇰🇷',USA:'🇺🇸',MEX:'🇲🇽',
  URU:'🇺🇾',COL:'🇨🇴',ECU:'🇪🇨',CHI:'🇨🇱',CRO:'🇭🇷',SUI:'🇨🇭',DEN:'🇩🇰',BEL:'🇧🇪',
  POL:'🇵🇱',SRB:'🇷🇸',TUR:'🇹🇷',CZE:'🇨🇿',GRE:'🇬🇷',CMR:'🇨🇲',GHA:'🇬🇭',CIV:'🇨🇮',
  EGY:'🇪🇬',NGA:'🇳🇬',TUN:'🇹🇳',ALG:'🇩🇿',SWE:'🇸🇪',NOR:'🇳🇴',IRN:'🇮🇷',SAU:'🇸🇦',
  QAT:'🇶🇦',AUS:'🇦🇺',CAN:'🇨🇦',PAN:'🇵🇦',CRC:'🇨🇷',HON:'🇭🇳',PAR:'🇵🇾',BOL:'🇧🇴',
  VEN:'🇻🇪',PER:'🇵🇪',
};
function countryFlag(code) { return FLAG_MAP[code] || '🏳'; }

// ── Boot ───────────────────────────────────────────────────────────────────

(async () => {
  loadSession();
  if (state.user) {
    try { await loadData(); } catch (e) { clearSession(); }
  }
  render();
})();
