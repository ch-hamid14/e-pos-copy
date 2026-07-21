import type { Knex } from 'knex'

const uuid = (knex: Knex) => knex.raw('gen_random_uuid()')

const USER_FK = (t: Knex.CreateTableBuilder, col: string) =>
  t.uuid(col).references('id').inTable('user_profiles').onDelete('SET NULL')

/** FIFO: track unsold qty per purchase line; link sales to consumed lots. */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('part_purchase_lines')) {
    if (!(await knex.schema.hasColumn('part_purchase_lines', 'quantity_remaining'))) {
      await knex.schema.alterTable('part_purchase_lines', (t) => {
        t.integer('quantity_remaining').notNullable().defaultTo(0)
      })
    }
  }

  if (!(await knex.schema.hasTable('part_sale_allocations'))) {
    await knex.schema.createTable('part_sale_allocations', (t) => {
      t.uuid('id').primary().defaultTo(uuid(knex))
      t.uuid('company_id').notNullable()
      t.uuid('sale_line_id').references('id').inTable('sale_lines').onDelete('CASCADE')
      t
        .uuid('part_purchase_line_id')
        .references('id')
        .inTable('part_purchase_lines')
        .onDelete('CASCADE')
      t.integer('quantity').notNullable()
      t.decimal('unit_cost', 15, 2).notNullable().defaultTo(0)
      t.timestamps(true, true)
      USER_FK(t, 'created_by')
      USER_FK(t, 'updated_by')
      t.index(['sale_line_id'])
      t.index(['part_purchase_line_id'])
    })
  }

  if (!(await knex.schema.hasTable('part_purchase_lines'))) return

  // Start from full purchase qty on every line, then replay part sales (FIFO) for allocations.
  await knex('part_purchase_lines').whereNull('deleted_at').update({
    quantity_remaining: knex.ref('quantity')
  })

  const saleLines = await knex('sale_lines as sl')
    .join('sales as s', 's.id', 'sl.sale_id')
    .whereNotNull('sl.part_id')
    .whereNull('s.deleted_at')
    .select(
      'sl.id as sale_line_id',
      'sl.part_id',
      'sl.quantity',
      'sl.unit_cost as existing_unit_cost',
      's.company_id',
      's.branch_id',
      'sl.created_by'
    )
    .orderBy('s.sale_date', 'asc')
    .orderBy('sl.created_at', 'asc')

  for (const saleLine of saleLines) {
    const partId = saleLine.part_id as string
    const companyId = saleLine.company_id as string
    const branchId = saleLine.branch_id as string
    const needQty = Number(saleLine.quantity)
    let remaining = needQty
    let totalCost = 0
    const allocations: {
      partPurchaseLineId: string
      quantity: number
      unitCost: number
    }[] = []

    const lots = await knex('part_purchase_lines as pl')
      .join('part_purchases as pp', 'pp.id', 'pl.part_purchase_id')
      .where({
        'pl.part_id': partId,
        'pl.company_id': companyId,
        'pp.branch_id': branchId
      })
      .where('pl.quantity_remaining', '>', 0)
      .whereNull('pl.deleted_at')
      .whereNull('pp.deleted_at')
      .select('pl.id', 'pl.quantity_remaining', 'pl.unit_cost')
      .orderBy('pp.purchase_date', 'asc')
      .orderBy('pp.created_at', 'asc')
      .orderBy('pl.created_at', 'asc')

    for (const lot of lots) {
      if (remaining <= 0) break
      const avail = Number(lot.quantity_remaining)
      const take = Math.min(avail, remaining)
      if (take <= 0) continue
      const unitCost = Number(lot.unit_cost || 0)
      allocations.push({
        partPurchaseLineId: lot.id as string,
        quantity: take,
        unitCost
      })
      totalCost += take * unitCost
      remaining -= take
      await knex('part_purchase_lines')
        .where({ id: lot.id })
        .update({ quantity_remaining: avail - take })
    }

    if (remaining > 0) continue

    const unitCost = Math.round((totalCost / needQty) * 100) / 100
    const now = new Date()

    for (const alloc of allocations) {
      await knex('part_sale_allocations').insert({
        id: knex.raw('gen_random_uuid()'),
        company_id: companyId,
        sale_line_id: saleLine.sale_line_id,
        part_purchase_line_id: alloc.partPurchaseLineId,
        quantity: alloc.quantity,
        unit_cost: alloc.unitCost,
        created_by: saleLine.created_by || null,
        updated_by: saleLine.created_by || null,
        created_at: now,
        updated_at: now
      })
    }

    if (saleLine.existing_unit_cost == null) {
      await knex('sale_lines')
        .where({ id: saleLine.sale_line_id })
        .update({ unit_cost: unitCost })
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('part_sale_allocations')
  if (await knex.schema.hasTable('part_purchase_lines')) {
    if (await knex.schema.hasColumn('part_purchase_lines', 'quantity_remaining')) {
      await knex.schema.alterTable('part_purchase_lines', (t) => {
        t.dropColumn('quantity_remaining')
      })
    }
  }
}
