import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('product_items', (t) => {
    t.integer('warranty_years')
  })
  await knex.schema.alterTable('sale_lines', (t) => {
    t.integer('warranty_years')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sale_lines', (t) => {
    t.dropColumn('warranty_years')
  })
  await knex.schema.alterTable('product_items', (t) => {
    t.dropColumn('warranty_years')
  })
}
