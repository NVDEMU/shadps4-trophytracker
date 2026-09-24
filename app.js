const BUILTIN_GAMES = [
  'Astro Bot Rescue Mission','Bloodborne','Days Gone','Death Stranding','Demon\'s Souls',
  'Ghost of Tsushima','God of War','Gran Turismo Sport','Horizon Zero Dawn',
  'inFAMOUS Second Son','LittleBigPlanet 3','Marvel\'s Spider-Man','Ratchet & Clank',
  'Red Dead Redemption 2','Resident Evil 2','Resident Evil 7: Biohazard',
  'Shadow of the Colossus','The Last of Us Remastered','Uncharted 4: A Thief\'s End',
  'Until Dawn','Persona 5','NieR:Automata','Sekiro: Shadows Die Twice',
  'Dark Souls III','Final Fantasy VII Remake','Monster Hunter: World','Tekken 7',
  'DOOM','DOOM Eternal','The Witcher 3: Wild Hunt','Cyberpunk 2077','Grand Theft Auto V'
].map((name,i)=>({id:'builtin_'+(i+1),uuid:null,name,image:null,href:null,price:null,rating:'PS4 game',platforms:['PS4'],updatedAt:null}));

const state = { user: null, catalogPage: 1, catalogPages: 1, catalogQuery: '', sort: 'name', currentGame: null, authMode: 'login' };
const $ = (s) => document.querySelector(s);
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(url, options={}) {
  const res = await fetch(url, { ...options, headers: { 'Content-Type':'application/json', ...(options.headers||{}) } });
  const text = await res.text();
  let data={}; try { data=text?JSON.parse(text):{} } catch { data={error:text||'Request failed'} }
  if(!res.ok) throw new Error(data.error||`Request failed (${res.status})`);
  return data;
}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2600)}
function show(el){el.hidden=false} function hide(el){el.hidden=true}
function showPage(name){['gamesPage','dashboardPage','trophiesPage','gamePage'].forEach(id=>hide($('#'+id))); show($('#'+name));}
function openAuth(mode='login'){state.authMode=mode;$('#authModal').classList.add('open');$('#authModal').setAttribute('aria-hidden','false');setAuthMode(mode)}
function closeAuth(){$('#authModal').classList.remove('open');$('#authModal').setAttribute('aria-hidden','true')}
function setAuthMode(mode){state.authMode=mode;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.auth===mode));$('#authTitle').textContent=mode==='login'?'Log in':'Create account';$('#loginForm').hidden=mode!=='login';$('#registerForm').hidden=mode!=='register';$('#authMessage').textContent=''}

$('#loginOpen').onclick=()=>openAuth('login'); $('#registerOpen').onclick=()=>openAuth('register'); $('#closeAuth').onclick=closeAuth; $('#authModal').addEventListener('click',e=>{if(e.target.id==='authModal')closeAuth()});
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setAuthMode(b.dataset.auth));
async function submitAuth(form, mode){const values=Object.fromEntries(new FormData(form));$('#authMessage').textContent='Working…';try{const r=await api(`/api/auth/${mode}`,{method:'POST',body:JSON.stringify(values)});state.user=r.user;closeAuth();renderAccount();if(!location.hash||location.hash==='#')location.hash='#games';else navigate();toast(mode==='login'?'Welcome back.':'Account created.')}catch(e){$('#authMessage').textContent=e.message}}
$('#loginForm').onsubmit=e=>{e.preventDefault();submitAuth(e.currentTarget,'login')}; $('#registerForm').onsubmit=e=>{e.preventDefault();submitAuth(e.currentTarget,'register')};

function renderAccount(){const area=$('#accountArea');if(!state.user){area.innerHTML='<button class="ghost-button" id="loginOpen2">Log in</button><button class="primary compact" id="registerOpen2">Create account</button>';$('#loginOpen2').onclick=()=>openAuth('login');$('#registerOpen2').onclick=()=>openAuth('register');document.querySelectorAll('[data-auth-only]').forEach(x=>x.hidden=true)}else{area.innerHTML=`<span class="tag">@${escapeHtml(state.user.username)}</span><button class="ghost-button" id="logout">Log out</button>`;$('#logout').onclick=logout;document.querySelectorAll('[data-auth-only]').forEach(x=>x.hidden=false)}}
async function logout(){await api('/api/auth/logout',{method:'POST'});state.user=null;renderAccount();location.hash='#games';toast('Logged out.');}

function navTarget(){const h=decodeURIComponent(location.hash.slice(1)||'games');if(h.startsWith('game/'))return ['game',h.slice(5)];return [h, null]}
async function navigate(){const [target,id]=navTarget();if(target==='dashboard'){if(!state.user){openAuth('login');location.hash='#games';return}showPage('dashboard');return renderDashboard()}if(target==='trophies'){if(!state.user){openAuth('login');location.hash='#games';return}showPage('trophies');return renderTrophies()}if(target==='game'){showPage('game');return renderGamePage(id)}showPage('games');return renderGames()}
window.addEventListener('hashchange',navigate);

async function renderGames(){showPage('games');const page=$('#gamesPage');page.innerHTML=`<section class="hero"><div class="hero-copy"><div class="eyebrow">PS4 • SHADPS4</div><h1>Your PS4 trophy library.</h1><p>Browse the PS4 catalog, open a game, and keep a personal trophy checklist for everything you play through ShadPS4.</p><div class="chips"><span class="chip" id="catalogCount">Loading catalog…</span><span class="chip">Persistent accounts</span><span class="chip">Trophy progress</span></div></div><div class="hero-side"><div class="hero-stat"><b id="heroCatalogCount">—</b><span>PS4 catalog entries</span></div><div class="hero-stat"><b id="heroAccountState">${state.user?'Signed in':'Browsing as guest'}</b><span>account status</span></div><button class="secondary" id="syncCatalog">Sync the full PS4 catalog</button></div></section><div class="section-head"><div><h2>PS4 Games</h2><div class="muted">Search thousands of entries. You can browse without an account.</div></div></div><div class="panel"><div class="controls"><input id="gameSearch" placeholder="Search a game or product ID" value="${escapeHtml(state.catalogQuery)}"><select id="gameSort"><option value="name">Alphabetical</option><option value="newest">Recently synced</option></select><button class="primary" id="searchButton">Search</button><button class="secondary" id="clearButton">Clear</button></div></div><div id="syncStatus" class="status" hidden></div><div id="gameGrid" class="game-grid"></div><div id="pagination" class="pagination"></div>`;
  $('#gameSort').value=state.sort;$('#searchButton').onclick=()=>{state.catalogQuery=$('#gameSearch').value.trim();state.catalogPage=1;loadCatalog()};$('#clearButton').onclick=()=>{state.catalogQuery='';state.catalogPage=1;$('#gameSearch').value='';loadCatalog()};$('#gameSearch').onkeydown=e=>{if(e.key==='Enter')$('#searchButton').click()};$('#gameSort').onchange=e=>{state.sort=e.target.value;state.catalogPage=1;loadCatalog()};$('#syncCatalog').onclick=syncCatalog;await loadCatalog();}
async function getStaticCatalog() {
  if (window.__staticCatalog) return window.__staticCatalog;
  const siteBase = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
  try {
    const response = await fetch(siteBase + 'data/games.json', { cache:'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    window.__staticCatalog = await response.json();
  } catch (error) {
    console.warn('Static PS4 catalog load failed; using built-in catalog.', error);
    window.__staticCatalog = BUILTIN_GAMES;
  }
  return window.__staticCatalog;
}
async function catalogData() {
  try {
    return await api('/api/catalog?q=' + encodeURIComponent(state.catalogQuery) + '&page=' + state.catalogPage + '&sort=' + state.sort);
  } catch (error) {
    const all = await getStaticCatalog();
    const q = state.catalogQuery.toLowerCase();
    let games = q ? all.filter(g => g.name.toLowerCase().includes(q) || String(g.uuid || '').toLowerCase().includes(q)) : all.slice();
    if (state.sort === 'newest') games.sort((a,b) => String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    else games.sort((a,b) => a.name.localeCompare(b.name, undefined, {sensitivity:'base'}));
    const pageSize = 36, pages = Math.max(1, Math.ceil(games.length/pageSize));
    const page = Math.min(state.catalogPage, pages);
    const start = (page-1)*pageSize;
    return { items: games.slice(start,start+pageSize), page, pageSize, total: games.length, pages, catalogUpdatedAt: all[0]?.catalogUpdatedAt || null };
  }
}
async function loadCatalog(){
  try {
    const data = await catalogData();
    state.catalogPages=Math.max(1,data.pages||1);$('#catalogCount').textContent=`${data.total.toLocaleString()} catalog entries`;$('#heroCatalogCount').textContent=data.total.toLocaleString();$('#syncStatus').hidden=true;const grid=$('#gameGrid');grid.innerHTML=data.items.length?data.items.map(g=>`<article class="game-card"><a href="#game/${encodeURIComponent(g.id)}">${g.image?`<img class="cover" src="${escapeHtml(g.image)}" alt="" loading="lazy">`:'<div class="cover"></div>'}</a><div class="game-body"><a class="game-name" href="#game/${encodeURIComponent(g.id)}">${escapeHtml(g.name)}</a><div class="game-meta"><span>${escapeHtml(g.rating||'Game')}</span><span>${g.platforms.join(' / ')}</span></div>${g.trophyCount?`<div class="progress"><span style="width:${g.trophyPercent}%"></span></div><div class="meta-line"><span>${g.earnedTrophies}/${g.trophyCount} tracked</span><span>${g.trophyPercent}%</span></div>`:`<div class="meta-line"><span>${g.price||'PS4'}</span><span>Open →</span></div>`}</div></article>`).join(''):'<div class="empty">No PS4 games matched that search.</div>';
  $('#pagination').innerHTML=`<button class="secondary" id="prev" ${data.page<=1?'disabled':''}>Previous</button><span class="muted">Page ${data.page} of ${Math.max(1,data.pages)}</span><button class="secondary" id="next" ${data.page>=data.pages?'disabled':''}>Next</button>`;$('#prev').onclick=()=>{state.catalogPage--;loadCatalog()};$('#next').onclick=()=>{state.catalogPage++;loadCatalog()};
  } catch (error) {
    $('#catalogCount').textContent='Catalog unavailable';
    $('#heroCatalogCount').textContent='0';
    $('#gameGrid').innerHTML='<div class="empty"><strong>PS4 catalog failed to load.</strong><br><br>'+escapeHtml(error.message)+'</div>';
    $('#pagination').innerHTML='';
  }
}
async function syncCatalog(){const box=$('#syncStatus');if(!box)return;box.hidden=false;box.textContent='Syncing the full PS4 catalog. This can take a little while on first run…';try{const r=await api('/api/catalog/sync',{method:'POST'});box.textContent=`Catalog synced: ${r.count.toLocaleString()} PS4 entries.`;state.catalogPage=1;await loadCatalog();toast('PS4 catalog synced.')}catch(e){box.textContent=`Catalog sync failed: ${e.message}`;toast(e.message)}}

async function renderGamePage(gameId){const page=$('#gamePage');page.innerHTML='<div class="status">Loading game…</div>';let data;
  try { data = await api('/api/games/' + encodeURIComponent(gameId)); }
  catch {
    const games = await getStaticCatalog();
    const game = games.find(g => g.id === gameId || g.uuid === gameId);
    if (!game) throw new Error('Game not found');
    data = { game, trophies: [] };
  }
  state.currentGame=data.game;const logged=!!state.user;const trophyCount=data.trophies.length;const earned=data.trophies.filter(t=>t.earned).length;page.innerHTML=`<div class="muted"><a href="#games">← Back to games</a></div><div class="game-detail"><div class="game-top"><div>${data.game.image?`<img src="${escapeHtml(data.game.image)}" alt="">`:'<div class="cover"></div>'}</div><div><div class="eyebrow">PS4 GAME</div><h2>${escapeHtml(data.game.name)}</h2><div class="game-meta"><span>${escapeHtml(data.game.rating||'Game')}</span><span>${data.game.platforms.join(' / ')}</span>${data.game.price?`<span>${escapeHtml(data.game.price)}</span>`:''}</div><p class="muted">${logged?`${earned}/${trophyCount} tracked trophies earned. Add the trophy list you use in ShadPS4 and check each trophy as you earn it.`:'Create an account to save trophy checklists and earned progress.'}</p>${trophyCount?`<div class="progress"><span style="width:${data.game.trophyPercent}%"></span></div><div class="card-row"><span class="muted">${data.game.trophyPercent}% complete</span>${logged?'<button id="addTrophy" class="primary">Add trophy</button>':''}</div>`:logged?'<button id="addTrophy" class="primary">Add your first trophy</button>':'<button id="gameLogin" class="primary">Log in to track trophies</button>'}</div></div><hr style="border:0;border-top:1px solid var(--line);margin:26px 0"><div class="card-row"><h3>Trophy checklist</h3><span class="muted">${trophyCount} tracked</span></div>${logged?`<div id="trophyList" class="trophy-list">${renderTrophyList(data.trophies)}</div>`:'<div class="wide-note">Trophy lists are stored per account. Sign in to create and maintain your checklist for this game.</div>'}</div></div>`;
  if($('#addTrophy'))$('#addTrophy').onclick=openTrophyForm;if($('#gameLogin'))$('#gameLogin').onclick=()=>openAuth('register');if(logged)wireTrophyActions(data.trophies);
}
function trophySymbol(type){return ({platinum:'P',gold:'G',silver:'S',bronze:'B'})[type]||'T'}
function renderTrophyList(trophies){if(!trophies.length)return'<div class="empty">No trophies added yet.</div>';return trophies.map(t=>`<div class="trophy ${t.earned?'earned':''}" data-id="${t.id}"><div class="trophy-icon">${trophySymbol(t.type)}</div><div><div class="trophy-title">${escapeHtml(t.name)}</div><div class="game-meta"><span>${escapeHtml(t.type)}</span><span>${t.points} pts</span>${t.rarity?`<span>${escapeHtml(t.rarity)}</span>`:''}</div>${t.notes?`<div class="muted">${escapeHtml(t.notes)}</div>`:''}</div><div class="trophy-actions"><input class="check" data-action="earned" type="checkbox" ${t.earned?'checked':''}><button class="danger-button" data-action="delete">Delete</button></div></div>`).join('')}
function wireTrophyActions(trophies){document.querySelectorAll('.trophy').forEach(row=>{const t=trophies.find(x=>x.id===row.dataset.id);if(!t)return;row.querySelector('[data-action="earned"]').onchange=async e=>{try{await api(`/api/trophies/${t.id}`,{method:'PATCH',body:JSON.stringify({earned:e.target.checked})});await renderGamePage(state.currentGame.id);toast(e.target.checked?'Trophy earned!':'Trophy marked unearned.')}catch(err){toast(err.message)}};row.querySelector('[data-action="delete"]').onclick=async()=>{if(!confirm(`Delete “${t.name}”?`))return;try{await api(`/api/trophies/${t.id}`,{method:'DELETE'});await renderGamePage(state.currentGame.id)}catch(err){toast(err.message)}}})}
function openTrophyForm(){const wrap=document.createElement('div');wrap.className='modal open';wrap.innerHTML=`<div class="modal-card"><div class="card-row"><h3>Add trophy</h3><button class="ghost-button" id="close">Close</button></div><form id="tf" class="auth-form"><label>Name<input name="name" required maxlength="160"></label><div class="inline"><label>Type<select name="type"><option value="bronze">Bronze</option><option value="silver">Silver</option><option value="gold">Gold</option><option value="platinum">Platinum</option></select></label><label>Points<input name="points" type="number" min="0" max="9999" value="15"></label></div><div class="inline"><label>Rarity<input name="rarity" placeholder="e.g. 42.5%"></label><label>Earned<select name="earned"><option value="false">Not earned</option><option value="true">Earned</option></select></label></div><label>Notes<textarea name="notes" rows="3" maxlength="1000"></textarea></label><button class="primary">Save trophy</button></form></div>`;document.body.appendChild(wrap);wrap.querySelector('#close').onclick=()=>wrap.remove();wrap.querySelector('#tf').onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));v.points=Number(v.points||0);v.earned=v.earned==='true';try{await api(`/api/games/${state.currentGame.id}/trophies`,{method:'POST',body:JSON.stringify(v)});wrap.remove();await renderGamePage(state.currentGame.id);toast('Trophy added.')}catch(err){toast(err.message)}}}

async function renderDashboard(){showPage('dashboardPage');const p=$('#dashboardPage');p.innerHTML='<div class="status">Loading dashboard…</div>';const d=await api('/api/stats');p.innerHTML=`<div class="page-head"><div><div class="eyebrow">YOUR PROFILE</div><h1>Dashboard</h1><p class="muted">${escapeHtml(state.user.username)}’s ShadPS4 trophy progress.</p></div><a class="secondary" href="#games">Browse PS4 games</a></div><div class="stats">${[['Trophies earned',d.trophiesEarned],['Points',d.points],['Platinums',d.platinum],['Games tracked',d.gamesTracked]].map(x=>`<div class="stat-card"><div class="label">${x[0]}</div><div class="value">${x[1]}</div></div>`).join('')}</div><div class="panel"><div class="section-head"><h2>Recent activity</h2><span class="muted">Saved to your account</span></div><div class="activity">${d.recent.length?d.recent.map(a=>`<div class="activity-row"><span>${formatActivity(a)}</span><span class="muted">${new Date(a.createdAt).toLocaleString()}</span></div>`).join(''):'<div class="empty">No trophy activity yet.</div>'}</div></div>`}
function formatActivity(a){if(a.type==='trophy_earned')return'🏆 Trophy earned';if(a.type==='trophy_added')return'＋ Trophy added';if(a.type==='account_created')return'Account created';return a.type.replaceAll('_',' ')}
async function renderTrophies(){showPage('trophiesPage');const p=$('#trophiesPage');p.innerHTML='<div class="status">Loading trophies…</div>';const d=await api('/api/trophies');p.innerHTML=`<div class="page-head"><div><div class="eyebrow">YOUR TROPHIES</div><h1>My Trophies</h1><p class="muted">Everything you have added to your account.</p></div></div><div class="panel"><div class="trophy-list">${d.trophies.length?d.trophies.map(t=>`<div class="trophy ${t.earned?'earned':''}"><div class="trophy-icon">${trophySymbol(t.type)}</div><div><div class="trophy-title">${escapeHtml(t.name)}</div><div class="game-meta"><span>${escapeHtml(t.gameName)}</span><span>${t.points} pts</span><span>${t.earned?'Earned '+new Date(t.earnedAt).toLocaleDateString():'Not earned'}</span></div></div><a class="secondary" href="#game/${encodeURIComponent(t.gameId)}">Open game</a></div>`).join(''):'<div class="empty">No trophies yet. Open a PS4 game and start a checklist.</div>'}</div></div>`}

async function boot(){
  try { const me=await api('/api/me'); state.user=me.user; }
  catch { state.user=null; }
  renderAccount();
  await navigate();
}
boot();