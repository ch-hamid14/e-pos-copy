import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('part_purchase_lines')) {
    if (!(await knex.schema.hasColumn('part_purchase_lines', 'unit_sale_price'))) {
      await knex.schema.alterTable('part_purchase_lines', (t) => {
        t.decimal('unit_sale_price', 15, 2).defaultTo(0)
      })
    }
    if (!(await knex.schema.hasColumn('part_purchase_lines', 'special_discount'))) {
      await knex.schema.alterTable('part_purchase_lines', (t) => {
        t.decimal('special_discount', 15, 2).defaultTo(0)
      })
    }
    if (!(await knex.schema.hasColumn('part_purchase_lines', 'special_discount_type'))) {
      await knex.schema.alterTable('part_purchase_lines', (t) => {
        t.string('special_discount_type').defaultTo('pkr')
      })
    }
    // Backfill retail from cost for existing rows where retail was left at 0
    await knex('part_purchase_lines').where('unit_sale_price', 0).update({
      unit_sale_price: knex.ref('unit_cost')
    })
  }

  if (await knex.schema.hasTable('part_stocks')) {
    if (!(await knex.schema.hasColumn('part_stocks', 'selling_price'))) {
      await knex.schema.alterTable('part_stocks', (t) => {
        t.decimal('selling_price', 15, 2).defaultTo(0)
      })
    }
    if (!(await knex.schema.hasColumn('part_stocks', 'average_cost'))) {
      await knex.schema.alterTable('part_stocks', (t) => {
        t.decimal('average_cost', 15, 2).defaultTo(0)
      })
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('part_stocks')) {
    if (await knex.schema.hasColumn('part_stocks', 'average_cost')) {
      await knex.schema.alterTable('part_stocks', (t) => {
        t.dropColumn('average_cost')
      })
    }
    if (await knex.schema.hasColumn('part_stocks', 'selling_price')) {
      await knex.schema.alterTable('part_stocks', (t) => {
        t.dropColumn('selling_price')
      })
    }
  }

  if (await knex.schema.hasTable('part_purchase_lines')) {
    for (const col of ['special_discount_type', 'special_discount', 'unit_sale_price'] as const) {
      if (await knex.schema.hasColumn('part_purchase_lines', col)) {
        await knex.schema.alterTable('part_purchase_lines', (t) => {
          t.dropColumn(col)
        })
      }
    }
  }
}
