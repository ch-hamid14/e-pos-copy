# Madix E-POS

Offline-first serialized inventory Point of Sale system for scooter/dealership businesses.

## Architecture

- **Electron App** — React UI, SQLite (local-first), sync engine
- **Backend API** — Node.js, Express, Knex, PostgreSQL (source of truth)
- **Sync** — Event-driven queue (not table diff sync)

See [docs/](docs/) for full requirements.

## Project Structure (matches `pos-app` pattern)

```
e-pos/
├── src/
│   ├── main/           # Electron main process
│   │   ├── db/         # SQLite + Sequelize
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── sync-engine/
│   │   └── router/     # IPC handlers
│   ├── preload/
│   ├── renderer/src/   # React UI
│   └── common/         # Shared types & constants
├── backend/            # PostgreSQL API
├── admin-web/          # Super admin web console (Vite + React)
└── docs/
```

## Quick Start

### Electron App

```bash
npm install
npm run dev
```

**Default login (requires backend running):** `admin@madixsoft.com` / `admin123`

**Super admin (backend only):** `superadmin@madix.com` / `Madix#4321`

### Backend (optional for sync)

```bash
cd backend
npm install
cp .env.example .env
# Configure PostgreSQL DATABASE_URL
npm run migrate
npm run dev
```

### Super Admin Web (Vite + React)

Separate browser app for platform management (companies, users, roles).

```bash
cd admin-web
npm install
cp .env.example .env
npm run dev
```

Opens at `http://localhost:5174` (proxies API to backend on port 4000).

From repo root: `npm run admin:dev`

**Login:** `superadmin@madix.com` / `Madix#4321` (requires backend running)

## Key Features

- Serialized inventory (product_items with serial numbers)
- POS sales with credit/cash/partial payment
- Customer ledger & due recovery
- Branch transfers
- Expenses & P&L reports
- Offline sync queue with conflict detection
- Audit logs & sync center

## Databases

| Layer | Database | Role |
|-------|----------|------|
| Client | SQLite | Operational engine (offline-first) |
| Server | PostgreSQL | Source of truth |
