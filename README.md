# ShadPS4 Trophy Tracker

A self-hosted website for tracking PS4 games and trophies earned while playing through ShadPS4.

## Features

- Account creation and login
- Passwords stored as bcrypt hashes, never plaintext
- Server-side sessions using HTTP-only cookies
- Persistent per-user trophy progress
- PS4 catalog search, filtering, pagination, and game pages
- Progress states: Not started / Playing / Completed / Platinum
- Trophy checklist with trophy type, points, rarity, notes, and earned date
- Dashboard statistics and recent activity
- Catalog sync from a public PlayStation Store catalog source
- No ROM/PKG files, keys, firmware, or copyrighted game data are included
- Docker support with a mounted persistent `data/` directory

## Important catalog note

The included sync job uses `Ephellon/game-store-catalog`'s PS4 catalog as a practical source for a large current PS4 catalog. That source currently documents roughly 12,117 PS4 entries. It is a store catalog, not an official exhaustive historical master list, so the sync is intentionally repeatable and replaceable.

Catalog source: https://github.com/Ephellon/game-store-catalog

## Run locally

```bash
npm install
npm run sync:games
npm start
```

Open `http://localhost:3000`.

The first account you create is just a normal user account; there is no hard-coded admin password.

## Persistent data

User accounts, sessions, games, trophy definitions, and trophy progress are stored in `data/db.json`. For production, mount `data/` to persistent storage or set `DATA_FILE` to a persistent path.

For Docker, the included compose file mounts `./data` into the container so data survives container recreation.

## Production deployment

This application needs a server runtime and persistent storage; GitHub Pages alone cannot run the account API. A single Node process on a persistent VM/container works well. Put HTTPS in front of it and set `COOKIE_SECURE=true`.

## Updating the catalog

Run:

```bash
npm run sync:games
```

The sync job downloads the 27 PS4 catalog JSON files (`_`, `a` ... `z`), deduplicates by PlayStation product UUID, and updates the local catalog while preserving your trophy records.
