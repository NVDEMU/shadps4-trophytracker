import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json'));
const SESSION_DAYS = Math.max(1, Number(process.env.SESSION_DAYS || 30));
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true';
const CATALOG_LETTERS = ['_', ...'abcdefghijklmnopqrstuvwxyz'];
const CATALOG_BASE = 'https://raw.githubusercontent.com/Ephellon/game-store-catalog/main/ps4';
const FALLBACK_GAMES = ['Astro Bot Rescue Mission','Bloodborne','Days Gone','Death Stranding','Demon\'s Souls','Ghost of Tsushima','God of War','Gran Turismo Sport','Horizon Zero Dawn','LittleBigPlanet 3','Marvel\'s Spider-Man','Ratchet & Clank','Red Dead Redemption 2','Resident Evil 2','Resident Evil 7: Biohazard','Shadow of the Colossus','The Last of Us Remastered','Uncharted 4: A Thief\'s End','Until Dawn','Persona 5','NieR:Automata','Sekiro: Shadows Die Twice','Dark Souls III','Final Fantasy VII Remake','Monster Hunter: World','Tekken 7','DOOM','DOOM Eternal','The Witcher 3: Wild Hunt','Cyberpunk 2077','Grand Theft Auto V'];

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));
app.use(express.static(path.join(__dirname, 'public')));

let db = {
  users: [],
  sessions: [],
  games: [],
  trophies: [],
  activity: [],
  meta: { catalogUpdatedAt: null, catalogSyncError: null }
};
let writeChain = Promise.resolve();

async function ensureDb() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    db = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      games: Array.isArray(parsed.games) ? parsed.games : [],
      trophies: Array.isArray(parsed.trophies) ? parsed.trophies : [],
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
      meta: { catalogUpdatedAt: parsed.meta?.catalogUpdatedAt || null, catalogSyncError: parsed.meta?.catalogSyncError || null }
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await persist();
  }
}

function persist() {
  writeChain = writeChain.then(async () => {
    const tmp = `${DATA_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2));
    await fs.rename(tmp, DATA_FILE);
  });
  return writeChain;
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function sessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function now() {
  return new Date().toISOString();
}

function cleanUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validUsername(value) {
  return /^[a-z0-9_]{3,24}$/.test(value);
}

function getSession(req) {
  const token = req.headers.cookie?.match(/(?:^|;\s*)session=([^;]+)/)?.[1];
  if (!token) return null;
  const hash = hashToken(decodeURIComponent(token));
  return db.sessions.find((s) => s.tokenHash === hash && new Date(s.expiresAt).getTime() > Date.now()) || null;
}

function currentUser(req) {
  const session = getSession(req);
  return session ? db.users.find((u) => u.id === session.userId) || null : null;
}

function safeUser(user) {
  return { id: user.id, username: user.username, createdAt: user.createdAt };
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Login required' });
  req.user = user;
  next();
}

function setSessionCookie(res, rawToken) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const flags = [
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (COOKIE_SECURE) flags.push('Secure');
  res.setHeader('Set-Cookie', `session=${encodeURIComponent(rawToken)}; ${flags.join('; ')}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
}

function recordActivity(userId, type, data = {}) {
  db.activity.unshift({ id: id('act'), userId, type, data, createdAt: now() });
  db.activity = db.activity.slice(0, 5000);
}

function normalizeGame(raw) {
  const platforms = Array.isArray(raw.platforms) ? raw.platforms : [];
  return {
    id: raw.uuid ? `game_${raw.uuid}` : id('game'),
    uuid: raw.uuid || null,
    name: String(raw.name || 'Unknown').trim(),
    image: raw.image || null,
    href: raw.href || null,
    price: raw.price || null,
    rating: raw.rating || null,
    platforms,
    updatedAt: now()
  };
}

function publicGame(game, userId = null) {
  const userTrophies = userId ? db.trophies.filter((t) => t.userId === userId && t.gameId === game.id) : [];
  const earned = userTrophies.filter((t) => t.earned).length;
  const total = userTrophies.length;
  const pointsEarned = userTrophies.filter((t) => t.earned).reduce((n, t) => n + Number(t.points || 0), 0);
  return {
    ...game,
    trophyCount: total,
    earnedTrophies: earned,
    earnedPoints: pointsEarned,
    trophyPercent: total ? Math.round((earned / total) * 100) : 0,
    hasUserTrophies: total > 0
  };
}

async function syncCatalog() {
  const catalog = new Map();
  for (const letter of CATALOG_LETTERS) {
    const response = await fetch(CATALOG_BASE + '/' + letter + '.json', { headers: { 'User-Agent': 'ShadPS4-Trophy-Tracker/1.0' } });
    if (!response.ok) throw new Error('Catalog fetch failed for ' + letter + '.json (' + response.status + ')');
    const items = await response.json();
    for (const raw of items) {
      if (!raw?.uuid || !raw?.name || !Array.isArray(raw.platforms) || !raw.platforms.includes('PS4')) continue;
      catalog.set(raw.uuid, normalizeGame(raw));
    }
  }
  db.games = [...catalog.values()].sort((a,b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  db.meta.catalogUpdatedAt = now();
  db.meta.catalogSyncError = null;
  await persist();
  return db.games.length;
}
function seedFallbackGames() {
  if (db.games.length) return false;
  db.games = FALLBACK_GAMES.map((name, i) => ({ id:'fallback_' + String(i + 1).padStart(3,'0'), uuid:null, name, image:null, href:null, price:null, rating:'PS4 game', platforms:['PS4'], updatedAt:now() }));
  return true;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, games: db.games.length, users: db.users.length, catalogUpdatedAt: db.meta.catalogUpdatedAt, catalogSyncError: db.meta.catalogSyncError });
});

app.get('/api/me', (req, res) => {
  const user = currentUser(req);
  res.json({ user: user ? safeUser(user) : null });
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const username = cleanUsername(req.body.username);
    const password = String(req.body.password || '');
    if (!validUsername(username)) return res.status(400).json({ error: 'Username must be 3-24 characters using letters, numbers, or underscores.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (db.users.some((u) => u.username === username)) return res.status(409).json({ error: 'Username already exists.' });

    const user = { id: id('user'), username, passwordHash: await bcrypt.hash(password, 12), createdAt: now() };
    db.users.push(user);
    const raw = sessionToken();
    db.sessions.push({ id: id('sess'), userId: user.id, tokenHash: hashToken(raw), createdAt: now(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000).toISOString() });
    recordActivity(user.id, 'account_created');
    await persist();
    setSessionCookie(res, raw);
    res.status(201).json({ user: safeUser(user) });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const username = cleanUsername(req.body.username);
    const password = String(req.body.password || '');
    const user = db.users.find((u) => u.username === username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Invalid username or password.' });
    const raw = sessionToken();
    db.sessions = db.sessions.filter((s) => s.userId !== user.id || new Date(s.expiresAt).getTime() > Date.now());
    db.sessions.push({ id: id('sess'), userId: user.id, tokenHash: hashToken(raw), createdAt: now(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000).toISOString() });
    await persist();
    setSessionCookie(res, raw);
    res.json({ user: safeUser(user) });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    const session = getSession(req);
    if (session) db.sessions = db.sessions.filter((s) => s.id !== session.id);
    await persist();
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) { next(error); }
});

app.post('/api/catalog/sync', async (req, res) => {
  try {
    const count = await syncCatalog();
    res.json({ ok:true, count, catalogUpdatedAt: db.meta.catalogUpdatedAt });
  } catch (error) {
    db.meta.catalogSyncError = error.message;
    seedFallbackGames();
    await persist();
    res.status(503).json({ error:'Full catalog sync unavailable right now. ' + error.message, count:db.games.length });
  }
});

app.get('/api/catalog', (req, res) => {
  const user = currentUser(req);
  const q = String(req.query.q || '').trim().toLowerCase();
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(60, Math.max(12, Number(req.query.pageSize || 36)));
  const sort = req.query.sort === 'newest' ? 'newest' : 'name';
  const prefix = String(req.query.prefix || '').trim().toLowerCase();

  let games = db.games;
  if (q) games = games.filter((g) => g.name.toLowerCase().includes(q) || String(g.uuid || '').toLowerCase().includes(q));
  if (prefix) games = games.filter((g) => g.name.toLowerCase().startsWith(prefix === '#' ? '' : prefix));

  games = [...games].sort((a, b) => sort === 'newest'
    ? String(b.updatedAt).localeCompare(String(a.updatedAt))
    : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const total = games.length;
  const start = (page - 1) * pageSize;
  const items = games.slice(start, start + pageSize).map((g) => publicGame(g, user?.id));
  res.json({ items, page, pageSize, total, pages: Math.ceil(total / pageSize), catalogUpdatedAt: db.meta.catalogUpdatedAt, catalogSyncError: db.meta.catalogSyncError });
});

app.get('/api/games/:id', (req, res) => {
  const user = currentUser(req);
  const game = db.games.find((g) => g.id === req.params.id || g.uuid === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const trophies = user ? db.trophies.filter((t) => t.userId === user.id && t.gameId === game.id).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)) : [];
  res.json({ game: publicGame(game, user?.id), trophies });
});

app.get('/api/trophies', requireAuth, (req, res) => {
  const trophies = db.trophies.filter((t) => t.userId === req.user.id).sort((a, b) => String(b.earnedAt || '').localeCompare(String(a.earnedAt || '')));
  res.json({ trophies: trophies.map((t) => ({ ...t, gameName: db.games.find((g) => g.id === t.gameId)?.name || t.gameId })) });
});

app.post('/api/games/:id/trophies', requireAuth, async (req, res, next) => {
  try {
    const game = db.games.find((g) => g.id === req.params.id || g.uuid === req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const name = String(req.body.name || '').trim();
    if (!name || name.length > 160) return res.status(400).json({ error: 'Trophy name is required and must be 160 characters or less.' });
    const trophy = {
      id: id('trophy'), userId: req.user.id, gameId: game.id, name,
      type: ['platinum', 'gold', 'silver', 'bronze'].includes(req.body.type) ? req.body.type : 'bronze',
      points: Math.max(0, Math.min(9999, Number(req.body.points || 0))),
      rarity: String(req.body.rarity || '').trim().slice(0, 40),
      notes: String(req.body.notes || '').trim().slice(0, 1000),
      earned: Boolean(req.body.earned),
      earnedAt: req.body.earned ? (req.body.earnedAt || now()) : null,
      sortOrder: db.trophies.filter((t) => t.userId === req.user.id && t.gameId === game.id).length
    };
    db.trophies.push(trophy);
    recordActivity(req.user.id, 'trophy_added', { gameId: game.id, trophyId: trophy.id });
    await persist();
    res.status(201).json({ trophy });
  } catch (error) { next(error); }
});

app.patch('/api/trophies/:id', requireAuth, async (req, res, next) => {
  try {
    const trophy = db.trophies.find((t) => t.id === req.params.id && t.userId === req.user.id);
    if (!trophy) return res.status(404).json({ error: 'Trophy not found' });
    const previous = trophy.earned;
    for (const field of ['name', 'type', 'rarity', 'notes']) {
      if (field in req.body) trophy[field] = String(req.body[field] ?? '').trim().slice(0, field === 'name' ? 160 : 1000);
    }
    if ('points' in req.body) trophy.points = Math.max(0, Math.min(9999, Number(req.body.points || 0)));
    if ('earned' in req.body) {
      trophy.earned = Boolean(req.body.earned);
      trophy.earnedAt = trophy.earned ? (trophy.earnedAt || now()) : null;
    }
    if (!previous && trophy.earned) recordActivity(req.user.id, 'trophy_earned', { gameId: trophy.gameId, trophyId: trophy.id });
    await persist();
    res.json({ trophy });
  } catch (error) { next(error); }
});

app.delete('/api/trophies/:id', requireAuth, async (req, res, next) => {
  try {
    const index = db.trophies.findIndex((t) => t.id === req.params.id && t.userId === req.user.id);
    if (index === -1) return res.status(404).json({ error: 'Trophy not found' });
    db.trophies.splice(index, 1);
    await persist();
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/stats', requireAuth, (req, res) => {
  const trophies = db.trophies.filter((t) => t.userId === req.user.id);
  const earned = trophies.filter((t) => t.earned);
  const games = new Set(trophies.map((t) => t.gameId));
  const gameStats = [...games].map((gameId) => {
    const list = trophies.filter((t) => t.gameId === gameId);
    const game = db.games.find((g) => g.id === gameId);
    return { game, total: list.length, earned: list.filter((t) => t.earned).length, points: list.filter((t) => t.earned).reduce((n, t) => n + Number(t.points || 0), 0), platinum: list.some((t) => t.type === 'platinum' && t.earned) };
  });
  res.json({
    totalTrophiesTracked: trophies.length,
    trophiesEarned: earned.length,
    points: earned.reduce((n, t) => n + Number(t.points || 0), 0),
    platinum: earned.filter((t) => t.type === 'platinum').length,
    gamesTracked: games.size,
    gamesPlatinum: gameStats.filter((g) => g.platinum).length,
    recent: db.activity.filter((a) => a.userId === req.user.id).slice(0, 12),
    gameStats: gameStats.slice(0, 50)
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

await ensureDb();
if (!db.games.length) { seedFallbackGames(); await persist(); }
if (!db.meta.catalogUpdatedAt) {
  syncCatalog().then((count) => console.log('Initial PS4 catalog sync complete: ' + count + ' entries.'))
    .catch((error) => console.warn('Initial catalog sync skipped: ' + error.message));
}
app.listen(PORT, HOST, () => {
  console.log(`ShadPS4 Trophy Tracker running at http://${HOST}:${PORT}`);
  console.log(`Games in catalog: ${db.games.length}`);
});
