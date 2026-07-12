import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('suppliers', 'discount_type')
  if (!hasColumn) {
    await knex.schema.alterTable('suppliers', (t) => {
      t.string('discount_type').defaultTo('pkr')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('suppliers', 'discount_type')) {
    await knex.schema.alterTable('suppliers', (t) => {
      t.dropColumn('discount_type')
    })
  }
}
