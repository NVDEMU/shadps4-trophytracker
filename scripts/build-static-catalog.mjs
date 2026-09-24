import fs from 'node:fs/promises';
import path from 'node:path';

const letters = ['_', ...'abcdefghijklmnopqrstuvwxyz'];
const base = 'https://raw.githubusercontent.com/Ephellon/game-store-catalog/main/ps4';
const outDir = path.resolve('data');
const jsonOut = path.join(outDir, 'games.json');
const jsOut = path.join(outDir, 'games.js');

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
const payload = JSON.stringify(sorted);
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(jsonOut, payload);
await fs.writeFile(jsOut, 'window.__PS4_GAMES__ = ' + payload + ';');
console.log('Wrote', sorted.length, 'PS4 games to', jsonOut, 'and', jsOut);
