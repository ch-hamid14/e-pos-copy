import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('sale_lines'))) return

  if (!(await knex.schema.hasColumn('sale_lines', 'unit_cost'))) {
    await knex.schema.alterTable('sale_lines', (t) => {
      t.decimal('unit_cost', 15, 2)
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('sale_lines'))) return

  if (await knex.schema.hasColumn('sale_lines', 'unit_cost')) {
    await knex.schema.alterTable('sale_lines', (t) => {
      t.dropColumn('unit_cost')
    })
  }
}
