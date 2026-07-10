import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('sales', 'notes')
  if (!hasColumn) {
    await knex.schema.alterTable('sales', (t) => {
      t.text('notes')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('sales', 'notes')) {
    await knex.schema.alterTable('sales', (t) => {
      t.dropColumn('notes')
    })
  }
}
