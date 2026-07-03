# UI / UX

## 1. Design Principles

The UI must satisfy **4 user types**:

| Role | Primary needs |
|------|----------------|
| **Super Admin / Company owner** | Dashboard, reports, branches, finance |
| **Branch Admin** | Inventory, sales, staff management, branch reports |
| **Staff** | Sales, customers, invoice lookup |
| **System Admin** | Tenant inspection, diagnostics, sync monitoring, support tools |

## 2. Application Layout

Modern SaaS layout:

```
┌──────────────────────────────────────────────┐
│ Top Bar                                      │
├───────┬──────────────────────────────────────┤
│       │                                      │
│ Side  │          Main Content                │
│ Bar   │                                      │
│       │                                      │
├───────┴──────────────────────────────────────┤
│ Sync Status | Branch | User                  │
└──────────────────────────────────────────────┘
```

## 3. Sidebar Structure

Menus shown according to permissions.

```
Dashboard

Sales
 ├─ New Sale
 ├─ Invoices
 ├─ Payments

Inventory
 ├─ Products
 ├─ Inventory
 ├─ Transfers
 ├─ Adjustments

Customers
 ├─ Customers
 ├─ Ledger
 ├─ Due Recovery

Finance
 ├─ Expenses
 ├─ Profit & Loss

Reports
 ├─ Sales Reports
 ├─ Inventory Reports
 ├─ Customer Reports

Administration
 ├─ Branches
 ├─ Users
 ├─ Roles
 ├─ Settings

System
 ├─ Sync Center
 ├─ Audit Logs
```

## 4. Dashboard

Not a pretty dashboard — a **useful** dashboard.

### Top metrics

- Today's sales
- Outstanding balance
- Inventory value
- Expenses

### Sales trend

- Last 7 days
- Last 30 days

### Due recovery

- Customers with overdue balances

### Inventory alerts

- Low stock
- Reserved units
- Returned units

### Sync status widget

```
Pending Sync: 4
Last Sync: 2 mins ago
```

Very important for offline-first systems.

## 5. Sales Module (Most Important Screen)

This screen makes or breaks adoption.

### New Sale Screen — layout

```
┌────────────────────────────────────┐
│ Customer                           │
└────────────────────────────────────┘
┌────────────────────────────────────┐
│ Serial Search                      │
└────────────────────────────────────┘
┌────────────────────────────────────┐
│ Selected Units                     │
└────────────────────────────────────┘
┌────────────────────────────────────┐
│ Payment                            │
└────────────────────────────────────┘
                    [ PAY NOW ]
```

### Serial search UX

Because scooters are serialized, users should **search**, not browse inventory.

**Search by:**

- Serial number
- Model name
- Engine number
- Chassis number

**Example result:**

| Field | Value |
|-------|-------|
| Product | Evee S1 Pro |
| Serial | EV2026000123 |
| Color | Black |
| Status | Available |

→ Add to invoice

### Cart area

- Product name (e.g. Evee S1 Pro)
- Serial: EV2026000123
- Price: 340,000

Quantity is almost always **1** — no quantity spinner.

### Customer section

Search existing by phone or name, or create quickly.

### Payment section

- Cash
- Bank transfer
- Card
- Mixed
- Credit sale

For credit sale: paid amount, remaining amount, recovery date.

### Invoice success

After save:

- Print A4
- Print thermal
- Reprint later

## 6. Inventory Module

This is **not** a stock screen — it is an **asset** screen.

### Inventory listing — columns

- Serial number
- Model
- Branch
- Status
- Purchase price
- Selling price

**Filters:** Available | Sold | Reserved | Returned | Damaged

### Inventory detail page

Extremely important — full unit context plus lifecycle timeline.

**Example header:**

| Field | Value |
|-------|-------|
| Serial | EV2026000123 |
| Model | Evee S1 Pro |
| Status | Sold |
| Current owner | Muhammad Ali |
| Branch | Lahore |

**Lifecycle (chronological):** Purchased → Transferred → Reserved → Sold

## 7. Product Management

Products are **templates**, not stock.

### Product form

- Name
- Brand
- Category
- Description
- Default selling price
- Default cost price

### Receiving inventory (separate screen)

```
Product: Evee S1 Pro

Serial numbers:
  EV20260001
  EV20260002
  EV20260003
```

Bulk import supported.

## 8. Branch Transfer UX

Very common workflow.

**Transfer screen:**

- From branch
- To branch
- Select units (search by serial)

**Confirmation:** Transfer 5 units?

**Status:** In transit → Received

## 9. Customer Module

### Customer list

- Name
- Phone
- Outstanding balance
- Last purchase

### Customer profile — tabs

- Overview
- Invoices
- Ledger
- Payments

### Ledger tab — columns

| Date | Reference | Debit | Credit | Balance |
|------|-------------|-------|--------|---------|

Running balance displayed.

## 10. Due Recovery Module

Dedicated screen.

| Column | Notes |
|--------|-------|
| Customer | |
| Balance | |
| Due date | |
| Days overdue | |

**Actions:** Mark contacted | Add note | Record payment

## 11. Expense Module

Simple form:

- Category
- Amount
- Date
- Description
- Branch

## 12. Reports Module

Do **not** make this cluttered.

| Area | Reports |
|------|---------|
| **Sales** | By date, by branch, by product |
| **Inventory** | Available units, sold units, returned units, transfer history |
| **Customer** | Outstanding balances, recovery performance |
| **Finance** | Profit & loss, expense analysis |

## 13. Sync Center (Very Important)

Most POS systems hide sync — you should not.

**Display:**

- Last sync
- Pending events
- Failed events
- Sync health

**Actions:**

- Sync now
- Retry failed
- View queue

## 14. Role Management

Dynamic RBAC — role builder with checkbox permissions:

- Sales
- Inventory
- Reports
- Customers
- Finance
- Administration

## 15. Printing UX

User chooses:

- A4
- 80mm thermal

Templates configurable later.
