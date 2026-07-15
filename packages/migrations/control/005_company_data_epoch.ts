import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('companies', (t) => {
    t.integer('data_epoch').notNullable().defaultTo(1)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('companies', (t) => {
    t.dropColumn('data_epoch')
  })
}
