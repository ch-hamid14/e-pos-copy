import type { Knex } from 'knex'

type AuditOpts = {
  softDelete?: boolean
  migrateUserId?: boolean
}

const USER_FK = (t: Knex.CreateTableBuilder, col: string) =>
  t.uuid(col).references('id').inTable('user_profiles').onDelete('SET NULL')

async function addAuditColumns(knex: Knex, table: string, opts: AuditOpts = {}): Promise<void> {
  const hasTable = await knex.schema.hasTable(table)
  if (!hasTable) return

  await knex.schema.alterTable(table, (t) => {
    USER_FK(t, 'created_by')
    USER_FK(t, 'updated_by')
    if (opts.softDelete) USER_FK(t, 'deleted_by')
  })

  if (opts.migrateUserId) {
    const hasUserId = await knex.schema.hasColumn(table, 'user_id')
    if (hasUserId) {
      await knex(table).whereNotNull('user_id').update({
        created_by: knex.ref('user_id'),
        updated_by: knex.ref('user_id')
      })
      await knex.schema.alterTable(table, (t) => {
        t.dropColumn('user_id')
      })
    }
  }
}

async function dropAuditColumns(knex: Knex, table: string, opts: AuditOpts = {}): Promise<void> {
  const hasTable = await knex.schema.hasTable(table)
  if (!hasTable) return

  if (opts.migrateUserId) {
    const hasCreatedBy = await knex.schema.hasColumn(table, 'created_by')
    if (hasCreatedBy) {
      await knex.schema.alterTable(table, (t) => {
        t.uuid('user_id')
      })
      await knex(table).whereNotNull('created_by').update({
        user_id: knex.ref('created_by')
      })
    }
  }

  await knex.schema.alterTable(table, (t) => {
    if (opts.softDelete) t.dropColumn('deleted_by')
    t.dropColumn('updated_by')
    t.dropColumn('created_by')
  })
}

export async function up(knex: Knex): Promise<void> {
  const softDeleteTables = [
    'company_profile',
    'branches',
    'roles',
    'user_profiles',
    'colors',
    'suppliers',
    'categories',
    'products',
    'purchases',
    'product_items',
    'customers',
    'sales',
    'expense_categories',
    'expenses'
  ]

  const standardTables = ['permissions', 'role_permissions', 'user_roles']

  const appendOnlyTables = ['inventory_movements', 'ledger_entries', 'sale_lines', 'payments']

  for (const table of softDeleteTables) {
    await addAuditColumns(knex, table, {
      softDelete: true,
      migrateUserId: ['purchases', 'sales', 'expenses'].includes(table)
    })
  }

  for (const table of standardTables) {
    await addAuditColumns(knex, table)
  }

  for (const table of appendOnlyTables) {
    await addAuditColumns(knex, table)
  }
}

export async function down(knex: Knex): Promise<void> {
  const softDeleteTables = [
    'company_profile',
    'branches',
    'roles',
    'user_profiles',
    'colors',
    'suppliers',
    'categories',
    'products',
    'purchases',
    'product_items',
    'customers',
    'sales',
    'expense_categories',
    'expenses'
  ]

  const standardTables = ['permissions', 'role_permissions', 'user_roles']
  const appendOnlyTables = ['inventory_movements', 'ledger_entries', 'sale_lines', 'payments']

  for (const table of [...appendOnlyTables].reverse()) {
    await dropAuditColumns(knex, table)
  }
  for (const table of [...standardTables].reverse()) {
    await dropAuditColumns(knex, table)
  }
  for (const table of [...softDeleteTables].reverse()) {
    await dropAuditColumns(knex, table, {
      softDelete: true,
      migrateUserId: ['purchases', 'sales', 'expenses'].includes(table)
    })
  }
}
