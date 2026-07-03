import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('sales', 'due_reminder_date')
  if (!hasColumn) {
    await knex.schema.alterTable('sales', (t) => {
      t.timestamp('due_reminder_date')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('sales', 'due_reminder_date')) {
    await knex.schema.alterTable('sales', (t) => {
      t.dropColumn('due_reminder_date')
    })
  }
}
