import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasCnic = await knex.schema.hasColumn('customers', 'cnic')
  if (!hasCnic) {
    await knex.schema.alterTable('customers', (t) => {
      t.string('cnic')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('customers', 'cnic')) {
    await knex.schema.alterTable('customers', (t) => {
      t.dropColumn('cnic')
    })
  }
}
