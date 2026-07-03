# Database Architecture

## 1.1 Database Roles

### SQLite (Electron Client)

Operational database (fast, offline-first):

- Used for all reads/writes
- Stores working dataset
- Stores sync queue
- Stores partial mirror of server truth

### PostgreSQL (Server)

Source of truth (system of record):

- Multi-tenant master DB
- Full history
- Reconciliation engine
- Reporting layer

### Key Rule

> SQLite is **not** a replica. It is a **transaction engine with sync capability**.
>
> This is critical for stability.

## 2. Core Data Model Principle

Instead of stock tables, asset tables, and variant-table chaos, unify everything into:

**Product Definition + Product Instance + Movement Ledger**

## 3. Core Entities (Final Structure)

You only need **7 core tables** (plus supporting RBAC and sync tables).

### 3.1 Company (Tenant Root)

**`companies`**

| Column | Type |
|--------|------|
| `id` | uuid |
| `name` | text |
| `email` | text |
| `phone` | text |
| `status` | enum |
| `created_at` | timestamp |

### 3.2 Branches

**`branches`**

| Column | Type |
|--------|------|
| `id` | uuid |
| `company_id` | uuid (FK) |
| `name` | text |
| `location` | text |
| `is_active` | boolean |

### 3.3 Users + RBAC

- `users`
- `roles`
- `permissions`
- `user_roles`
- `role_permissions`

Everything scoped by `company_id`.

### 3.4 Customers

**`customers`**

| Column | Type |
|--------|------|
| `id` | uuid |
| `company_id` | uuid (FK) |
| `name` | text |
| `phone` | text |
| `address` | text |
| `credit_limit` | decimal |
| `created_at` | timestamp |

### 3.5 Product Catalog (Definition Layer)

**`products`** — this is **not** inventory.

| Column | Type |
|--------|------|
| `id` | uuid |
| `company_id` | uuid (FK) |
| `name` | text |
| `brand` | text |
| `category` | text |
| `description` | text |

This is only **what we sell**.

### 3.6 Product Instances (Core of the System)

**`product_items`** — the most important table.

Each row = **one** physical scooter or item.

Replaces: stock table, asset table, variant explosion.

#### Identity

| Column | Type |
|--------|------|
| `id` | uuid |
| `company_id` | uuid (FK) |
| `branch_id` | uuid (FK) |
| `product_id` | uuid (FK) |

#### Serialization (no barcode needed)

| Column | Notes |
|--------|-------|
| `serial_number` | UNIQUE, mandatory — primary real-world key |
| `engine_number` | optional |
| `chassis_number` | optional |

#### State machine

`status`: `in_stock` | `reserved` | `sold` | `returned` | `damaged` | `in_service`

#### Financial snapshot

- `purchase_price`
- `selling_price`

#### Traceability

- `current_branch_id`
- `created_at`
- `updated_at`

#### Key insight

You never “update stock”. You only:

- change `product_item.status`, or
- move it via ledger events

### 3.7 Inventory Movement Ledger

**`inventory_movements`** — immutable audit system.

| Column | Type |
|--------|------|
| `id` | uuid |
| `company_id` | uuid (FK) |
| `product_item_id` | uuid (FK) |

**Movement types:** `PURCHASE` | `SALE` | `TRANSFER` | `RETURN` | `DAMAGE` | `ADJUSTMENT`

**Flow tracking:**

- `from_branch_id`
- `to_branch_id`

**References:**

- `reference_type` (invoice / purchase / etc.)
- `reference_id`
- `timestamp`

### 3.8 Sales System

**`invoices`**

| Column | Type |
|--------|------|
| `id` | uuid |
| `company_id` | uuid (FK) |
| `branch_id` | uuid (FK) |
| `customer_id` | uuid (FK) |
| `total` | decimal |
| `discount` | decimal |
| `grand_total` | decimal |
| `paid_amount` | decimal |
| `due_amount` | decimal |
| `status` | enum |

**`invoice_items`** — connects to `product_items` directly (not generic SKU rows).

| Column | Type |
|--------|------|
| `id` | uuid |
| `invoice_id` | uuid (FK) |
| `product_item_id` | uuid (FK) |
| `price` | decimal |

**`payments`**

| Column | Type |
|--------|------|
| `id` | uuid |
| `invoice_id` | uuid (FK) |
| `amount` | decimal |
| `method` | cash / bank |
| `date` | timestamp |

### 3.9 Ledger System (Customer Balance)

**`ledger_entries`**

| Column | Type |
|--------|------|
| `id` | uuid |
| `company_id` | uuid (FK) |
| `customer_id` | uuid (FK) |
| `type` | debit / credit |
| `amount` | decimal |
| `reference_type` | text |
| `reference_id` | uuid |
| `running_balance` | decimal |

### 3.10 Sync System (Offline Core)

**`sync_queue`**

| Column | Type |
|--------|------|
| `id` | uuid |
| `entity_type` | text |
| `entity_id` | uuid |
| `operation` | INSERT / UPDATE |
| `payload` | JSON |
| `status` | pending / sent / failed |
| `retry_count` | int |
| `created_at` | timestamp |

## 4. How Everything Connects

### Selling flow

1. Scan `serial_number`
2. Find `product_item`
3. Add to invoice
4. Create `invoice_items`
5. Create `inventory_movement` (SALE)
6. Update `product_item.status` = SOLD
7. Add `sync_queue` event

### Stock is never stored

Stock is always computed:

```sql
COUNT(product_items) WHERE status = 'in_stock'
```
