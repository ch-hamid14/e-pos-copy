# Project Milestones

## Milestone 0 — Foundation & Architecture

**Goal:** Establish project structure that will not require refactoring later.

### Database

Create:

- `companies`, `branches`
- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`
- `devices`
- `sync_queue`, `sync_events`

### Backend setup

- Node.js
- Knex.js
- PostgreSQL
- JWT authentication
- RBAC middleware

### Electron setup

- Electron
- Vite
- React
- SQLite
- IPC layer

### Deliverables

- [x] Login
- [x] Company context
- [x] Branch context
- [x] Role system
- [x] SQLite connected
- [x] PostgreSQL connected

---

## Milestone 1 — Product Catalog Engine

**Goal:** Build product definitions before inventory.

### Database

Create: `products`, `product_categories`, `brands`

### UI screens

- Products list
- Create product
- Edit product
- Categories
- Brands

### Product fields

- Name
- Brand
- Category
- Description
- Default cost
- Default sale price

### Deliverables

- [x] Product catalog complete

---

## Milestone 2 — Serialized Inventory Engine

**Goal:** Build the actual inventory model. This is where the business starts.

### Database

Create: `product_items`, `inventory_movements`

### Features

**Receive inventory** — example:

- Product: Evee S1 Pro
- Serials: `EV001`, `EV002`, `EV003`
- System creates 3 product items

**Inventory states:**

- `IN_STOCK`
- `RESERVED`
- `SOLD`
- `RETURNED`
- `DAMAGED`
- `IN_SERVICE`

### UI screens

- Receive inventory
- Inventory listing
- Inventory detail
- Movement history

### Deliverables

- [x] Complete inventory lifecycle
- [x] Serial number lookup
- [x] Movement tracking

---

## Milestone 3 — Customer & Ledger Engine

**Goal:** Financial backbone.

### Database

Create: `customers`, `ledger_entries`

### Features

**Customer:** create, edit, search

**Ledger:** debit, credit, running balance

### UI screens

- Customer list
- Customer profile
- Ledger view

### Deliverables

- [x] Customer management
- [x] Ledger system
- [x] Balance tracking

---

## Milestone 4 — Sales Engine (Core POS)

**Goal:** First sellable version.

### Database

Create: `invoices`, `invoice_items`, `payments`

### Flow

1. Search serial number
2. Select customer
3. Choose payment type
4. Create invoice

### Rules

Invoice creation must happen in **one transaction:**

- Inventory movement
- Ledger entry
- Payment record

### UI screens

- New sale
- Invoice history
- Invoice detail

### Deliverables

- [x] Sell scooter
- [x] Credit sale
- [x] Cash sale
- [x] Partial payment

---

## Milestone 5 — Printing Engine

**Goal:** Operational readiness.

### Features

- A4
- 80mm thermal
- Templates: invoice, payment receipt

### Deliverables

- [x] Thermal printing
- [x] A4 printing
- [x] Reprint support

---

## Milestone 6 — Expenses & Finance

**Goal:** Profitability tracking.

### Database

Create: `expenses`, `expense_categories`

### UI

- Expense list
- Create expense

### Deliverables

- [x] Expense tracking
- [x] Branch expenses

---

## Milestone 7 — Branch Transfers

**Goal:** Multi-branch inventory movement.

### Features

Transfer Branch A → Branch B using serial numbers.

### Database

Uses `inventory_movements` — no new stock tables.

### UI

- Create transfer
- Transfer history
- Receive transfer

### Deliverables

- [x] Inter-branch movement
- [x] Audit trail

---

## Milestone 8 — Sync Engine V1

**Goal:** True offline-first operation.

### Database

Finalize: `sync_queue`, `sync_events`

### Backend

- Push API
- Pull API
- Idempotency

### Electron

- Background sync worker
- Retry system
- Queue processor

### Deliverables

- [x] Offline sales
- [x] Offline inventory updates
- [x] Auto sync
- [x] Manual sync

---

## Milestone 9 — Sync Conflict Resolution

**Goal:** Production safety.

### Features

**State validation:** sold unit cannot transfer

**Conflict UI:** view conflict, resolve

### Deliverables

- [x] Conflict detection
- [x] Conflict handling

---

## Milestone 10 — Due Recovery System

**Goal:** Customer balance management.

### Database

Add: `recovery_dates`, `follow_up_notes`

### UI

- Due recovery
- Customer follow-ups

### Features — reminders

- Today
- Overdue
- Upcoming

### Deliverables

- [x] Recovery workflow
- [x] Staff follow-up tracking

---

## Milestone 11 — Reporting Engine

**Goal:** Management visibility.

### Reports

| Area | Reports |
|------|---------|
| **Sales** | Daily, monthly, branch-wise |
| **Inventory** | Available, sold, returned |
| **Customer** | Outstanding, payments, recovery |
| **Finance** | Profit & loss |

### Deliverables

- [x] Business reporting

---

## Milestone 12 — Dynamic RBAC

**Goal:** Permission management.

### UI

- Roles
- Permissions
- Assignments

### Example

Admin can: sell, transfer, view inventory

Admin cannot: view finance

### Deliverables

- [x] Dynamic permission system

---

## Milestone 13 — Audit & Monitoring

**Goal:** Enterprise readiness.

### Database

Create: `audit_logs`

**Track:**

- Invoice created
- Inventory transferred
- Payment received
- User login

### UI

- Audit viewer

### Deliverables

- [x] Full traceability

---

## Milestone 14 — SaaS Management Layer

**Goal:** Manage customers (tenants).

### System admin screens

- Companies
- Branches
- Users
- Subscriptions

### Features

- Tenant inspection
- Sync diagnostics

### Deliverables

- [x] SaaS administration

---

## Milestone 15 — Production Hardening

**Goal:** Ready for scale.
