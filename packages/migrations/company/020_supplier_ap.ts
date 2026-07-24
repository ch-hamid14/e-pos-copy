import type { Knex } from 'knex'

const uuid = (knex: Knex) => knex.raw('gen_random_uuid()')

const USER_FK = (t: Knex.CreateTableBuilder, col: string) =>
  t.uuid(col).references('id').inTable('user_profiles').onDelete('SET NULL')

export async function up(knex: Knex): Promise<void> {
  // Purchases: bill totals + AP
  await knex.schema.alterTable('purchases', (t) => {
    t.decimal('net_total', 15, 2).notNullable().defaultTo(0)
    t.decimal('paid_amount', 15, 2).notNullable().defaultTo(0)
    t.decimal('due_amount', 15, 2).notNullable().defaultTo(0)
  })

  if (await knex.schema.hasTable('part_purchases')) {
    await knex.schema.alterTable('part_purchases', (t) => {
      t.decimal('net_total', 15, 2).notNullable().defaultTo(0)
      t.decimal('paid_amount', 15, 2).notNullable().defaultTo(0)
      t.decimal('due_amount', 15, 2).notNullable().defaultTo(0)
    })
  }

  // Backfill existing purchases as fully paid (no historical AP)
  const productTotals = await knex('purchases as p')
    .leftJoin('product_items as pi', function () {
      this.on('pi.purchase_id', 'p.id').andOnNull('pi.deleted_at')
    })
    .whereNull('p.deleted_at')
    .groupBy('p.id')
    .select('p.id')
    .sum({ total: 'pi.purchase_price' })

  for (const row of productTotals as Array<{ id: string; total?: number | string }>) {
    const total = Math.round(Number(row.total || 0))
    await knex('purchases').where({ id: row.id }).update({
      net_total: total,
      paid_amount: total,
      due_amount: 0
    })
  }

  if (await knex.schema.hasTable('part_purchases')) {
    const partTotals = await knex('part_purchases as pp')
      .leftJoin('part_purchase_lines as pl', function () {
        this.on('pl.part_purchase_id', 'pp.id').andOnNull('pl.deleted_at')
      })
      .whereNull('pp.deleted_at')
      .groupBy('pp.id')
      .select('pp.id')
      .select(
        knex.raw(
          'COALESCE(SUM(pl.quantity * pl.unit_cost), 0) as total'
        )
      )

    for (const row of partTotals as Array<{ id: string; total?: number | string }>) {
      const total = Math.round(Number(row.total || 0))
      await knex('part_purchases').where({ id: row.id }).update({
        net_total: total,
        paid_amount: total,
        due_amount: 0
      })
    }
  }

  // Purchase payments (product and/or part purchase)
  if (!(await knex.schema.hasTable('purchase_payments'))) {
    await knex.schema.createTable('purchase_payments', (t) => {
      t.uuid('id').primary().defaultTo(uuid(knex))
      t.uuid('company_id').notNullable()
      t.uuid('purchase_id').references('id').inTable('purchases').onDelete('CASCADE')
      t.uuid('part_purchase_id').references('id').inTable('part_purchases').onDelete('CASCADE')
      t.decimal('amount', 15, 2).notNullable().defaultTo(0)
      t.string('method').notNullable().defaultTo('cash')
      t.timestamp('payment_date').notNullable().defaultTo(knex.fn.now())
      t.timestamps(true, true)
      USER_FK(t, 'created_by')
      USER_FK(t, 'updated_by')
      t.index(['company_id'])
      t.index(['purchase_id'])
      t.index(['part_purchase_id'])
    })
  }

  // Ledger: allow supplier parties (customer_id becomes nullable)
  const hasSupplierId = await knex.schema.hasColumn('ledger_entries', 'supplier_id')
  if (!hasSupplierId) {
    await knex.schema.alterTable('ledger_entries', (t) => {
      t.uuid('supplier_id').references('id').inTable('suppliers').onDelete('CASCADE')
    })
  }

  // Drop NOT NULL on customer_id if present (Postgres)
  await knex.raw(`
    ALTER TABLE ledger_entries
    ALTER COLUMN customer_id DROP NOT NULL
  `).catch(() => {
    // Column may already be nullable
  })
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('purchase_payments')) {
    await knex.schema.dropTable('purchase_payments')
  }

  if (await knex.schema.hasColumn('ledger_entries', 'supplier_id')) {
    await knex.schema.alterTable('ledger_entries', (t) => {
      t.dropColumn('supplier_id')
    })
  }

  await knex.schema.alterTable('purchases', (t) => {
    t.dropColumn('net_total')
    t.dropColumn('paid_amount')
    t.dropColumn('due_amount')
  })

  if (await knex.schema.hasTable('part_purchases')) {
    await knex.schema.alterTable('part_purchases', (t) => {
      t.dropColumn('net_total')
      t.dropColumn('paid_amount')
      t.dropColumn('due_amount')
    })
  }
}
