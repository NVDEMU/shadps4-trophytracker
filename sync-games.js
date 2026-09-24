import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataFile = path.resolve(process.env.DATA_FILE || path.join(root, 'data', 'db.json'));
const letters = ['_', ...'abcdefghijklmnopqrstuvwxyz'];
const base = 'https://raw.githubusercontent.com/Ephellon/game-store-catalog/main/ps4';

const rawDb = await fs.readFile(dataFile, 'utf8').catch(() => JSON.stringify({ users: [], sessions: [], games: [], trophies: [], activity: [], meta: {} }));
const db = JSON.parse(rawDb);
db.users ||= [];
db.sessions ||= [];
db.games ||= [];
db.trophies ||= [];
db.activity ||= [];
db.meta ||= {};

const catalog = new Map();
for (const letter of letters) {
  const url = `${base}/${letter}.json`;
  console.log(`Fetching ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const items = await response.json();
  for (const raw of items) {
    if (!raw?.uuid || !raw?.name) continue;
    if (!Array.isArray(raw.platforms) || !raw.platforms.includes('PS4')) continue;
    catalog.set(raw.uuid, {
      id: `game_${raw.uuid}`,
      uuid: raw.uuid,
      name: String(raw.name).trim(),
      image: raw.image || null,
      href: raw.href || null,
      price: raw.price || null,
      rating: raw.rating || null,
      platforms: raw.platforms,
      updatedAt: new Date().toISOString()
    });
  }
}

const oldGames = new Map(db.games.map((g) => [g.id, g]));
db.games = [...catalog.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
const gameIds = new Set(db.games.map((g) => g.id));
// Remove trophy records for catalog entries that no longer exist, but preserve all other user data.
db.trophies = db.trophies.filter((t) => gameIds.has(t.gameId));
db.meta.catalogUpdatedAt = new Date().toISOString();

await fs.mkdir(path.dirname(dataFile), { recursive: true });
const tmp = `${dataFile}.tmp`;
await fs.writeFile(tmp, JSON.stringify(db, null, 2));
await fs.rename(tmp, dataFile);

console.log(`Synced ${db.games.length} PS4 catalog entries.`);
console.log(`Catalog timestamp: ${db.meta.catalogUpdatedAt}`);
