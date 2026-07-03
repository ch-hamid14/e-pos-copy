import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasMotorNumber = await knex.schema.hasColumn('product_items', 'motor_number')
  if (!hasMotorNumber) {
    await knex.schema.alterTable('product_items', (t) => {
      t.string('motor_number')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('product_items', 'motor_number')) {
    await knex.schema.alterTable('product_items', (t) => {
      t.dropColumn('motor_number')
    })
  }
}
