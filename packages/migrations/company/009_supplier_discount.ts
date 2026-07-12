import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('suppliers', 'discount')
  if (!hasColumn) {
    await knex.schema.alterTable('suppliers', (t) => {
      t.decimal('discount', 8, 4).defaultTo(0)
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('suppliers', 'discount')) {
    await knex.schema.alterTable('suppliers', (t) => {
      t.dropColumn('discount')
    })
  }
}
