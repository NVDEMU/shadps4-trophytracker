# Quick start

## 1. Create the GitHub repository

On a machine where GitHub CLI is authenticated:

```bash
git clone <this-folder-or-unzip-it>
cd shadps4-trophy-tracker
./scripts/create-github-repo.sh
```

Or create an empty GitHub repo named `shadps4-trophy-tracker` under `NVDEMU`, then:

```bash
git remote add origin git@github.com:NVDEMU/shadps4-trophy-tracker.git
git push -u origin main
```

## 2. Run the tracker

```bash
npm install
npm run sync:games
npm start
```

Open http://localhost:3000.

## 3. Keep account data persistent

Back up `data/db.json`. In Docker, keep the `./data:/app/data` volume mounted. For a hosted server, use persistent disk storage or replace the storage layer with a managed database.
