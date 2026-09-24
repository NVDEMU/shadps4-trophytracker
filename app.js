const state = {
  user: null,
  catalogPage: 1,
  catalogPages: 1,
  catalogQuery: '',
  currentGame: null
};

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text || 'Unknown error' }; }
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function setAuthMode(mode) {
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.auth === mode));
  $('#loginForm').hidden = mode !== 'login';
  $('#registerForm').hidden = mode !== 'register';
  $('#authMessage').textContent = '';
}

document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.auth)));

async function submitAuth(form, mode) {
  const values = Object.fromEntries(new FormData(form).entries());
  $('#authMessage').textContent = 'Working…';
  try {
    const result = await api(`/api/auth/${mode}`, { method:'POST', body:JSON.stringify(values) });
    state.user = result.user;
    showApp();
    navigate();
  } catch (error) {
    $('#authMessage').textContent = error.message;
  }
}

$('#loginForm').addEventListener('submit', (event) => { event.preventDefault(); submitAuth(event.currentTarget, 'login'); });
$('#registerForm').addEventListener('submit', (event) => { event.preventDefault(); submitAuth(event.currentTarget, 'register'); });
$('#logout').addEventListener('click', async () => { await api('/api/auth/logout', { method:'POST' }); location.hash = ''; state.user = null; showAuth(); });

function showAuth() {
  $('#authView').hidden = false;
  $('#appView').hidden = true;
  $('#nav').hidden = true;
  $('#accountArea').innerHTML = '';
}

function showApp() {
  $('#authView').hidden = true;
  $('#appView').hidden = false;
  $('#nav').hidden = false;
  $('#accountArea').innerHTML = `<span class="tag">@${escapeHtml(state.user.username)}</span>`;
}

function navTarget() {
  const hash = location.hash.replace('#', '') || 'dashboard';
  if (hash.startsWith('game/')) return 'game';
  return ['dashboard', 'games', 'trophies'].includes(hash) ? hash : 'dashboard';
}

async function navigate() {
  if (!state.user) return;
  const target = navTarget();
  document.querySelectorAll('#appView .page').forEach((page) => page.hidden = true);
  if (target === 'dashboard') return renderDashboard();
  if (target === 'games') return renderGames();
  if (target === 'trophies') return renderTrophies();
  if (target === 'game') return renderGamePage(location.hash.slice('#game/'.length));
}
window.addEventListener('hashchange', navigate);

async function renderDashboard() {
  const page = $('#dashboardPage'); page.hidden = false;
  page.innerHTML = `<div class="page-head"><div><div class="eyebrow">YOUR TRACKER</div><h1>Dashboard</h1><p class="muted">Your ShadPS4 trophy progress, stored with your account.</p></div><a class="secondary" href="#games">Browse PS4 games</a></div><div id="stats" class="stats"></div><div class="panel"><div class="card-row"><h2>Recent activity</h2><span class="muted">Latest updates</span></div><div id="activity"></div></div>`;
  const data = await api('/api/stats');
  $('#stats').innerHTML = [
    ['Trophies earned', data.trophiesEarned], ['Points', data.points], ['Platinums', data.platinum], ['Games tracked', data.gamesTracked]
  ].map(([label, value]) => `<div class="stat-card"><div class="label">${label}</div><div class="value">${value}</div></div>`).join('');
  $('#activity').innerHTML = data.recent.length ? data.recent.map((item) => `<div class="card-row"><span>${formatActivity(item)}</span><span class="muted">${new Date(item.createdAt).toLocaleString()}</span></div>`).join('') : `<div class="empty">No activity yet. Add a game and your first trophy.</div>`;
}

function formatActivity(item) {
  if (item.type === 'trophy_earned') return '🏆 Trophy earned';
  if (item.type === 'trophy_added') return '＋ Trophy added to your tracker';
  if (item.type === 'account_created') return 'Account created';
  return item.type.replaceAll('_', ' ');
}

async function renderGames() {
  const page = $('#gamesPage'); page.hidden = false;
  page.innerHTML = `<div class="page-head"><div><div class="eyebrow">PS4 CATALOG</div><h1>Games</h1><p id="catalogMeta" class="muted">Loading catalog…</p></div></div><div class="panel"><div class="controls"><input id="gameSearch" placeholder="Search titles or product IDs" value="${escapeHtml(state.catalogQuery)}"><select id="gameSort"><option value="name">Name</option><option value="newest">Recently synced</option></select><button id="searchButton" class="primary">Search</button></div></div><div id="gameGrid" class="game-grid"></div><div id="pagination" class="pagination"></div>`;
  $('#searchButton').addEventListener('click', () => { state.catalogQuery = $('#gameSearch').value.trim(); state.catalogPage = 1; loadCatalog(); });
  $('#gameSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('#searchButton').click(); });
  await loadCatalog();
}

async function loadCatalog() {
  const sort = $('#gameSort')?.value || 'name';
  const data = await api(`/api/catalog?q=${encodeURIComponent(state.catalogQuery)}&page=${state.catalogPage}&sort=${sort}`);
  state.catalogPages = data.pages;
  $('#catalogMeta').textContent = `${data.total.toLocaleString()} PS4 catalog entries • synced ${data.catalogUpdatedAt ? new Date(data.catalogUpdatedAt).toLocaleDateString() : 'not yet'}`;
  $('#gameGrid').innerHTML = data.items.map((game) => `<article class="game-card"><a href="#game/${encodeURIComponent(game.id)}">${game.image ? `<img class="game-cover" src="${escapeHtml(game.image)}" alt="" loading="lazy">` : `<div class="game-cover"></div>`}</a><div class="game-body"><a class="game-name" href="#game/${encodeURIComponent(game.id)}">${escapeHtml(game.name)}</a><div class="game-meta"><span>${escapeHtml(game.rating || 'Game')}</span><span>${game.platforms.join(' / ')}</span></div>${game.trophyCount ? `<div class="progress"><span style="width:${game.trophyPercent}%"></span></div><div class="card-row"><span class="muted">${game.earnedTrophies}/${game.trophyCount} trophies</span><span class="muted">${game.trophyPercent}%</span></div>` : `<div class="card-row"><span class="muted">No trophies entered yet</span></div>`}</div></article>`).join('') || `<div class="empty" style="grid-column:1/-1">No games matched your search.</div>`;
  $('#pagination').innerHTML = `<button class="secondary" ${data.page <= 1 ? 'disabled' : ''} id="prevPage">Previous</button><span class="muted">Page ${data.page} of ${Math.max(1, data.pages)}</span><button class="secondary" ${data.page >= data.pages ? 'disabled' : ''} id="nextPage">Next</button>`;
  $('#prevPage').addEventListener('click', () => { state.catalogPage--; loadCatalog(); });
  $('#nextPage').addEventListener('click', () => { state.catalogPage++; loadCatalog(); });
}

async function renderGamePage(gameId) {
  const page = $('#gamePage'); page.hidden = false;
  page.innerHTML = `<div class="muted"><a class="back" href="#games">← Back to games</a></div><div class="game-detail">Loading game…</div>`;
  const data = await api(`/api/games/${encodeURIComponent(gameId)}`);
  state.currentGame = data.game;
  const earned = data.trophies.filter((t) => t.earned).length;
  page.innerHTML = `<div class="muted"><a class="back" href="#games">← Back to games</a></div><div class="game-detail"><div class="game-top"><div>${data.game.image ? `<img src="${escapeHtml(data.game.image)}" alt="">` : '<div class="game-cover"></div>'}</div><div><div class="eyebrow">PS4 GAME</div><h2 style="font-size:36px;margin:8px 0">${escapeHtml(data.game.name)}</h2><div class="game-meta"><span>${escapeHtml(data.game.rating || 'Game')}</span><span>${data.game.platforms.join(' / ')}</span></div><p class="muted">${earned}/${data.trophies.length} tracked trophies earned. Add your trophy list below and check trophies off as you earn them in ShadPS4.</p><div class="progress"><span style="width:${data.game.trophyPercent}%"></span></div><div class="card-row"><span class="muted">${data.game.trophyPercent}% complete</span><button id="addTrophy" class="primary">Add trophy</button></div></div></div><hr style="border:0;border-top:1px solid var(--line);margin:24px 0"><div class="card-row"><h3>Trophy list</h3><span class="muted">Your personal checklist</span></div><div id="trophyList" class="trophy-list">${renderTrophyList(data.trophies)}</div></div></div>`;
  $('#addTrophy').addEventListener('click', openTrophyForm);
  wireTrophyActions(data.trophies);
}

function trophySymbol(type) { return ({ platinum:'P', gold:'G', silver:'S', bronze:'B' })[type] || 'T'; }
function renderTrophyList(trophies) {
  if (!trophies.length) return `<div class="empty">No trophies entered for this game yet.<br><br>Use <strong>Add trophy</strong> to build the checklist.</div>`;
  return trophies.map((t) => `<div class="trophy ${t.earned ? 'trophy-earned' : ''}" data-id="${t.id}"><div class="trophy-icon">${trophySymbol(t.type)}</div><div><div class="trophy-title">${escapeHtml(t.name)}</div><div class="game-meta"><span>${escapeHtml(t.type)}</span><span>${t.points} pts</span>${t.rarity ? `<span>${escapeHtml(t.rarity)}</span>`:''}</div>${t.notes ? `<div class="muted" style="margin-top:6px">${escapeHtml(t.notes)}</div>`:''}</div><div class="trophy-actions"><label title="Mark earned"><input class="check" type="checkbox" data-action="earned" ${t.earned ? 'checked' : ''}></label><button class="danger-button" data-action="delete">Delete</button></div></div>`).join('');
}

function wireTrophyActions(trophies) {
  document.querySelectorAll('.trophy').forEach((row) => {
    const trophy = trophies.find((t) => t.id === row.dataset.id);
    if (!trophy) return;
    row.querySelector('[data-action="earned"]').addEventListener('change', async (event) => {
      try { await api(`/api/trophies/${trophy.id}`, { method:'PATCH', body:JSON.stringify({ earned:event.target.checked }) }); toast(event.target.checked ? 'Trophy marked earned.' : 'Trophy marked unearned.'); await renderGamePage(state.currentGame.id); } catch(error) { toast(error.message); }
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm(`Delete “${trophy.name}” from your checklist?`)) return;
      try { await api(`/api/trophies/${trophy.id}`, { method:'DELETE' }); await renderGamePage(state.currentGame.id); } catch(error) { toast(error.message); }
    });
  });
}

function openTrophyForm() {
  const page = $('#gamePage');
  const panel = document.createElement('div');
  panel.className = 'modal open';
  panel.innerHTML = `<div class="modal-card"><div class="card-row"><h3>Add trophy</h3><button class="ghost-button" id="closeModal">Close</button></div><form id="trophyForm" class="auth-form"><label>Name<input name="name" maxlength="160" required></label><div class="inline"><label>Type<select name="type"><option value="bronze">Bronze</option><option value="silver">Silver</option><option value="gold">Gold</option><option value="platinum">Platinum</option></select></label><label>Points<input name="points" type="number" min="0" max="9999" value="15"></label></div><div class="inline"><label>Rarity<input name="rarity" placeholder="e.g. 42.5%"></label><label>Earned now<select name="earned"><option value="false">No</option><option value="true">Yes</option></select></label></div><label>Notes<textarea name="notes" rows="3" maxlength="1000"></textarea></label><button class="primary">Save trophy</button></form></div>`;
  page.appendChild(panel);
  panel.querySelector('#closeModal').addEventListener('click', () => panel.remove());
  panel.querySelector('#trophyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    values.points = Number(values.points || 0); values.earned = values.earned === 'true';
    try { await api(`/api/games/${state.currentGame.id}/trophies`, { method:'POST', body:JSON.stringify(values) }); panel.remove(); await renderGamePage(state.currentGame.id); toast('Trophy added.'); } catch(error) { toast(error.message); }
  });
}

async function renderTrophies() {
  const page = $('#trophiesPage'); page.hidden = false;
  const data = await api('/api/trophies');
  page.innerHTML = `<div class="page-head"><div><div class="eyebrow">YOUR TROPHIES</div><h1>My Trophies</h1><p class="muted">Every trophy you entered or earned across your tracked PS4 games.</p></div></div><div class="panel"><div class="trophy-list">${data.trophies.length ? data.trophies.map((t) => { const game = t.gameName || stateCacheGameName(t.gameId); return `<div class="trophy ${t.earned ? 'trophy-earned':''}"><div class="trophy-icon">${trophySymbol(t.type)}</div><div><div class="trophy-title">${escapeHtml(t.name)}</div><div class="game-meta"><span>${escapeHtml(game)}</span><span>${t.points} pts</span><span>${t.earned ? `Earned ${new Date(t.earnedAt).toLocaleDateString()}` : 'Not earned'}</span></div></div><a class="secondary" href="#game/${encodeURIComponent(t.gameId)}">Open game</a></div>`; }).join('') : '<div class="empty">No trophies yet.</div>'}</div></div>`;
}

function stateCacheGameName(gameId) {
  return state.currentGame?.id === gameId ? state.currentGame.name : gameId.replace(/^game_/, '').slice(0, 40);
}

async function boot() {
  const me = await api('/api/me');
  state.user = me.user;
  if (!state.user) return showAuth();
  showApp();
  navigate();
}
boot().catch((error) => { console.error(error); toast(error.message); showAuth(); });
