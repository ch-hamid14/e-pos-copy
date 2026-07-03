Backend vs docs — differences
1. Architecture is minimal (not the documented module layout)
Docs expect:

modules: auth, companies, branches, products, inventory, invoices, sync, ledger
+ services, controllers, repositories, middlewares
Actual backend (backend/src/):

Only auth and sync routes
No companies, branches, products, inventory, invoices, or ledger APIs
No services/, controllers/, repositories/, or middlewares/ folders
2. RBAC is not implemented on the server
Docs: dynamic roles, permissions, user_roles, role_permissions, RBAC middleware, tenant scoping.

Backend:

Users have a simple role string column only
No RBAC tables in Postgres migration
No auth middleware on sync endpoints
No company_id / branch_id enforcement from JWT
3. Sync processing is incomplete
Push exists, but server event handlers only partially apply business data:

Event	Server behavior
PRODUCT_CREATED
Inserts product
PRODUCT_ITEM_RECEIVED / TRANSFERRED
Upserts product item + basic state checks
SALE_CREATED / INVOICE_CREATED
Inserts invoice header + marks items sold only
CUSTOMER_CREATED, EXPENSE_CREATED
Inserts row
PAYMENT_RECEIVED, USER_CREATED
Not handled
Product updates
No sync path
Missing on server for sales: invoice_items, payments, ledger_entries, inventory_movements.

4. Database schema gaps (Postgres vs docs / desktop SQLite)
Table	Desktop SQLite	Backend Postgres
roles, permissions, user_roles, role_permissions
Yes
No
product_categories, brands
Yes
No (products use string fields)
expense_categories
Yes
No
recovery_dates, follow_up_notes
Yes
No
sync_queue
Yes (client)
Correctly absent on server
sync_events, audit_logs
Yes
Yes
5. Pull sync exists but is unused
GET /api/sync/pull is implemented, but the Electron sync worker never calls it. No last_sequence tracking on the client.

6. No seed / bootstrap on backend
Desktop seeds demo company/user via seed-initial-data.ts. Backend has no seed — Postgres starts empty unless you populate it manually.

7. Auth is disconnected from the desktop app
Backend has POST /api/auth/login with JWT. Desktop login uses local SQLite only (authService.login in main process). The two auth systems are not wired together.

8. Security gaps
Sync endpoints are unauthenticated
Default JWT secret in code
No multi-tenant request validation
Desktop app vs docs — differences
1. Folder structure differs from docs
Docs:

main/ipc, database, sync-engine, printer, background-services
renderer/modules, components, state, routes
shared/types, validators, constants
Actual:

main/db, services, controllers, router, sync-engine
renderer/pages, layouts, hooks, redux, services
common/ (types, constants)
Missing: dedicated printer/, ipc/ folder (IPC is in router/index.ts), validators/, background-services/ as separate modules.

2. Missing or stub UI screens (menu links to routes with no page)
Doc screen	Route in menu	Page exists?
Payments
/sales/payments
No → 404
Adjustments
/inventory/adjustments
No → 404
Ledger (standalone)
/customers/ledger
No (ledger only inside Customer Detail)
Users
/admin/users
No
Roles
/admin/roles
No
Customer Reports
/reports/customers
No
3. RBAC is only half-built
SQLite has full RBAC tables and seed permissions
Login loads permissions into user object
Menu and routes filter by role only, not permissions (despite permissions on menu items)
No Roles / Permissions management UI
4. Sync engine gaps vs sync-system-architecture.md
Doc requirement	Status
Push batching (50)
Done
Pull after push
Not implemented
Initial full data download on first login
Not implemented
Branch-scoped inventory download
Not implemented
Exponential backoff on failure
Not implemented (only retry count++)
Conflict UI
Not implemented (server can return conflict; client marks as failed)
JWT / auth on sync requests
Not implemented
synced vs sent status flow
Uses pending → synced / failed only
5. Printing (Milestone 5 marked complete — it is not)
Docs: thermal + A4 printer layer in Electron main process.

Actual: InvoiceDetail.tsx calls window.print() with a console log — no thermal/A4 templates, no printer module.

6. Transfer workflow is simplified
Docs: In transit → Received with confirmation.

Actual: Immediate transfer; no in-transit state, no receive-transfer screen, no transfer history view.

7. Inventory adjustments
Docs: Adjustments under Inventory menu.

Actual: ADJUSTMENT movement type exists in enums; no service, IPC, or UI.

8. Due recovery is read-only
Docs: Mark contacted, add note, record payment.

Actual: List only; followUpNotes table exists but no UI or API.

9. New Sale UX gaps
Docs: Search by serial, model name, engine, chassis; quick customer create; credit sale type.

Actual:

Search only matches serial/engine/chassis (searchAvailable) — not product/model name
Customer must be pre-selected from list — no quick create
Credit is implied via paidAmount + recoveryDate, not an explicit “Credit sale” payment mode
10. Dashboard gaps
Docs: Sales trend (7/30 days), reserved/returned alerts, footer sync bar.

Actual: Basic metrics + overdue table; no charts/trends; inventory alert is only in-stock count; no footer status bar (sync info is loaded in AppLayout but not shown; branch name not displayed in layout).

11. Reports are basic
Sales report: invoice list + total
Inventory report: counts by status
No customer reports page
No branch-wise / product-wise breakdowns described in docs
12. SaaS admin layer (Milestone 14)
Docs: Companies, subscriptions, tenant inspection, sync diagnostics for system admin.

Actual: Branches list (read-only) + Settings placeholder. No Companies admin, Users, Subscriptions, or tenant tools.

13. Product catalog extras
Milestone 1 mentions separate Categories and Brands screens.

Actual: productCategories and brands tables exist in SQLite but products still use plain brand / category strings; no category/brand management UI.

Sync integrity risks (important)
These are functional gaps, not just doc mismatches:

Desktop and backend are separate worlds — login is local; backend Postgres may never receive consistent data.
Sale sync is shallow — server gets invoice header + sold status, not full financial/audit trail.
No pull sync — HQ-created products/customers never reach branch devices.
Product updates don’t sync — local edits won’t reach server.
Conflicts aren’t surfaced — failed sync events with no user-facing resolution.
No server RBAC — any client can push to sync API if they know the URL.
Milestones doc vs reality
milestones.md shows nearly all milestones as [x] complete. Honest status:

Milestone	Realistic status
0 – Foundation
Partial (local yes, backend RBAC/middleware no)
1 – Product catalog
Partial (CRUD yes, categories/brands UI no)
2 – Serialized inventory
Mostly done locally
3 – Customer & ledger
Mostly done locally
4 – Sales engine
Mostly done locally
5 – Printing
Stub only
6 – Expenses
Done locally
7 – Branch transfers
Partial (no in-transit/receive)
8 – Sync V1
Partial (push only, incomplete server apply)
9 – Conflict resolution
Not done (server logic partial, no UI)
10 – Due recovery
Partial (list only)
11 – Reporting
Partial
12 – Dynamic RBAC
Not done (schema seed only)
13 – Audit
Partial (local logs, limited coverage)
14 – SaaS admin
Not done
15 – Production hardening
Not started
Summary diagram
Docs Target
Current Implementation
gap
gap
gap
gap
Full SaaS Backend
Bidirectional Sync
RBAC + Multi-tenant
Complete UI + Printing
Rich Local SQLite POS
Push-only Sync Worker
Thin Backend auth+sync
Many UI stubs / missing pages
Suggested priority areas (for when you share next steps)
Wire auth — decide: local-only, server-only, or hybrid (local cache + server JWT).
Complete sync pipeline — full sale payload on server; pull sync + last_sequence on client.
Align Postgres schema with SQLite (RBAC, recovery, expense categories).
Fill missing screens — Payments, Adjustments, Users, Roles, Customer Reports.
RBAC enforcement — permission-based menu/routes, not just role strings.
Printing layer — real Electron printer integration.
Conflict + recovery UX — sync conflicts and due-recovery actions.
Share how you want things done (e.g. keep local-first with server as sync hub, or move more logic server-side), and we can turn this into a concrete modification plan.