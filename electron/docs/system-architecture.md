# System Architecture

## 1.1 High-Level System Design

You are building a 3-layer distributed system:

```
┌──────────────────────────────┐
│        ELECTRON APP          │
│  (Offline First Client)      │
│  - POS UI                    │
│  - SQLite DB                 │
│  - Sync Engine               │
└────────────┬─────────────────┘
             │
     Sync API (HTTPS)
             │
┌────────────▼─────────────────┐
│        BACKEND API           │
│   (Multi-tenant SaaS)        │
│  - Auth / RBAC               │
│  - Sync Processor            │
│  - Business Logic            │
└────────────┬─────────────────┘
             │
┌────────────▼─────────────────┐
│     POSTGRESQL DATABASE      │
│   (Single Source of Truth)   │
└──────────────────────────────┘
```

## 1.2 Electron App Architecture

This is **not** a simple frontend — it is a local-first transactional engine.

### Structure

```
electron-app/
├── main/
│   ├── ipc/
│   ├── database/          # SQLite layer
│   ├── sync-engine/
│   ├── printer/
│   └── background-services/
├── renderer/
│   ├── modules/
│   │   ├── POS              # fast billing screen
│   │   ├── Inventory
│   │   ├── Customers
│   │   ├── Reports
│   │   └── Settings
│   ├── components/
│   ├── state/
│   └── routes/
└── shared/
    ├── types
    ├── validators
    └── constants
```

### Electron Responsibilities

1. **Local DB (SQLite)** — all writes happen here first; never depends on internet
2. **Sync Engine** — reads local changes, pushes to server, resolves sync states
3. **POS Engine** — ultra-fast UI, barcode scanning, cart + checkout logic
4. **Printer Layer** — thermal + A4

## 1.3 Backend Architecture (SaaS Core)

```
backend/
└── src/
    ├── modules/
    │   ├── auth
    │   ├── companies
    │   ├── branches
    │   ├── products
    │   ├── inventory
    │   ├── invoices
    │   ├── sync
    │   └── ledger
    ├── services/
    ├── controllers/
    ├── repositories/
    ├── middlewares/
    └── utils/
```

### Backend Responsibilities

1. **Multi-tenant isolation** — every request scoped by `company_id` and `branch_id`
2. **Sync ingestion engine** — receives `product_items` changes, inventory movements, invoices
3. **RBAC system** — dynamic permissions per role
4. **Ledger + reporting engine** — server computes profit, sales, customer balances

## 1.4 Database Strategy

| Layer | Role |
|-------|------|
| **PostgreSQL (server)** | Single source of truth |
| **SQLite (client)** | Partial mirror + working dataset |

### Critical Rule

- **SQLite** = operational engine
- **Postgres** = authoritative engine

## 1.5 Data Flow Model

### Offline flow

```
User action
   ↓
SQLite write
   ↓
sync_queue entry created
   ↓
UI updates instantly
```

### Online sync flow

```
sync_queue → API → Postgres
                  ↓
          response + ack
                  ↓
         mark synced locally
```

## 1.6 Core Design Principles

These rules define your system integrity:

1. **Event-driven inventory** — no “stock table”; everything is `product_item` state + `inventory_movements`
2. **Local-first always wins** — even if the server is down, POS must work fully
3. **No direct DB sync** — only event sync (never full table sync)
4. **UUID everywhere** — no auto-increment IDs; global uniqueness for offline devices
5. **Stateless backend** — backend never assumes client state correctness

## 1.7 Key Module Interaction

### POS flow

```
Scan barcode
 → product_item lookup (SQLite)
 → cart update
 → invoice creation
 → movement event created
 → sync queue updated
```

### Inventory flow

```
Purchase / Transfer / Sale
 → inventory_movements created
 → product_item state updated
```

### Customer flow

```
Invoice
 → ledger entry generated
 → balance updated (computed)
```
