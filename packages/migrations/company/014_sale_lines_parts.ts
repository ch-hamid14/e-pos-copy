import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('sale_lines')
  if (!hasTable) return

  if (!(await knex.schema.hasColumn('sale_lines', 'line_type'))) {
    await knex.schema.alterTable('sale_lines', (t) => {
      t.string('line_type').notNullable().defaultTo('product')
    })
  }

  if (!(await knex.schema.hasColumn('sale_lines', 'part_id'))) {
    await knex.schema.alterTable('sale_lines', (t) => {
      t.uuid('part_id').references('id').inTable('parts').onDelete('SET NULL')
    })
  }

  if (!(await knex.schema.hasColumn('sale_lines', 'quantity'))) {
    await knex.schema.alterTable('sale_lines', (t) => {
      t.integer('quantity').notNullable().defaultTo(1)
    })
  }

  // Allow product-only fields to be empty on part lines
  await knex.raw(`
    ALTER TABLE sale_lines
      ALTER COLUMN product_item_id DROP NOT NULL,
      ALTER COLUMN serial_number DROP NOT NULL
  `)
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('sale_lines'))) return

  // Restore NOT NULL only for remaining product rows (best-effort)
  await knex('sale_lines')
    .whereNull('product_item_id')
    .orWhereNull('serial_number')
    .del()

  await knex.raw(`
    ALTER TABLE sale_lines
      ALTER COLUMN product_item_id SET NOT NULL,
      ALTER COLUMN serial_number SET NOT NULL
  `)

  if (await knex.schema.hasColumn('sale_lines', 'quantity')) {
    await knex.schema.alterTable('sale_lines', (t) => {
      t.dropColumn('quantity')
    })
  }
  if (await knex.schema.hasColumn('sale_lines', 'part_id')) {
    await knex.schema.alterTable('sale_lines', (t) => {
      t.dropColumn('part_id')
    })
  }
  if (await knex.schema.hasColumn('sale_lines', 'line_type')) {
    await knex.schema.alterTable('sale_lines', (t) => {
      t.dropColumn('line_type')
    })
  }
}
