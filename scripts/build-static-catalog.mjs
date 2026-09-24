import fs from 'node:fs/promises';
import path from 'node:path';

const letters = ['_', ...'abcdefghijklmnopqrstuvwxyz'];
const base = 'https://raw.githubusercontent.com/Ephellon/game-store-catalog/main/ps4';
const out = path.resolve('data', 'games.json');

const games = new Map();
for (const letter of letters) {
  const url = base + '/' + letter + '.json';
  console.log('Fetching', url);
  const response = await fetch(url, { headers: { 'User-Agent': 'ShadPS4-Trophy-Tracker/1.0' } });
  if (!response.ok) throw new Error('Failed to fetch ' + url + ': HTTP ' + response.status);
  const items = await response.json();
  for (const raw of items) {
    if (!raw?.uuid || !raw?.name || !Array.isArray(raw.platforms) || !raw.platforms.includes('PS4')) continue;
    games.set(raw.uuid, {
      id: 'game_' + raw.uuid,
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

const sorted = [...games.values()].sort((a,b) => a.name.localeCompare(b.name, undefined, { sensitivity:'base' }));
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify(sorted));
console.log('Wrote', sorted.length, 'PS4 games to', out);
