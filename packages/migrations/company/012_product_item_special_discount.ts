import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasDiscount = await knex.schema.hasColumn('product_items', 'special_discount')
  if (!hasDiscount) {
    await knex.schema.alterTable('product_items', (t) => {
      t.decimal('special_discount', 15, 2).defaultTo(0)
    })
  }

  const hasType = await knex.schema.hasColumn('product_items', 'special_discount_type')
  if (!hasType) {
    await knex.schema.alterTable('product_items', (t) => {
      t.string('special_discount_type').defaultTo('pkr')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('product_items', 'special_discount_type')) {
    await knex.schema.alterTable('product_items', (t) => {
      t.dropColumn('special_discount_type')
    })
  }
  if (await knex.schema.hasColumn('product_items', 'special_discount')) {
    await knex.schema.alterTable('product_items', (t) => {
      t.dropColumn('special_discount')
    })
  }
}
