import type { Knex } from 'knex'

const uuid = (knex: Knex) => knex.raw('gen_random_uuid()')

const USER_FK = (t: Knex.CreateTableBuilder, col: string) =>
  t.uuid(col).references('id').inTable('user_profiles').onDelete('SET NULL')

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('parts'))) {
    await knex.schema.createTable('parts', (t) => {
      t.uuid('id').primary().defaultTo(uuid(knex))
      t.uuid('company_id').notNullable()
      t.uuid('category_id').references('id').inTable('categories')
      t.string('name').notNullable()
      t.text('description')
      t.decimal('default_purchase_price', 15, 2).defaultTo(0)
      t.decimal('default_sale_price', 15, 2).defaultTo(0)
      t.timestamps(true, true)
      t.timestamp('deleted_at')
      USER_FK(t, 'created_by')
      USER_FK(t, 'updated_by')
      USER_FK(t, 'deleted_by')
    })
  }

  if (!(await knex.schema.hasTable('part_purchases'))) {
    await knex.schema.createTable('part_purchases', (t) => {
      t.uuid('id').primary().defaultTo(uuid(knex))
      t.uuid('company_id').notNullable()
      t.uuid('branch_id').references('id').inTable('branches')
      t.uuid('supplier_id').references('id').inTable('suppliers').onDelete('SET NULL')
      t.timestamp('purchase_date').notNullable()
      t.text('notes')
      t.string('device_id')
      t.timestamps(true, true)
      t.timestamp('deleted_at')
      USER_FK(t, 'created_by')
      USER_FK(t, 'updated_by')
      USER_FK(t, 'deleted_by')
    })
  }

  if (!(await knex.schema.hasTable('part_purchase_lines'))) {
    await knex.schema.createTable('part_purchase_lines', (t) => {
      t.uuid('id').primary().defaultTo(uuid(knex))
      t.uuid('company_id').notNullable()
      t.uuid('part_purchase_id').references('id').inTable('part_purchases').onDelete('CASCADE')
      t.uuid('part_id').references('id').inTable('parts')
      t.uuid('category_id').references('id').inTable('categories')
      t.integer('quantity').notNullable()
      t.decimal('unit_cost', 15, 2).defaultTo(0)
      t.timestamps(true, true)
      t.timestamp('deleted_at')
      USER_FK(t, 'created_by')
      USER_FK(t, 'updated_by')
      USER_FK(t, 'deleted_by')
    })
  }

  if (!(await knex.schema.hasTable('part_stocks'))) {
    await knex.schema.createTable('part_stocks', (t) => {
      t.uuid('id').primary().defaultTo(uuid(knex))
      t.uuid('company_id').notNullable()
      t.uuid('branch_id').references('id').inTable('branches')
      t.uuid('part_id').references('id').inTable('parts')
      t.integer('quantity_on_hand').notNullable().defaultTo(0)
      t.timestamps(true, true)
      USER_FK(t, 'created_by')
      USER_FK(t, 'updated_by')
      t.unique(['company_id', 'branch_id', 'part_id'])
    })
  }

  if (!(await knex.schema.hasTable('part_stock_movements'))) {
    await knex.schema.createTable('part_stock_movements', (t) => {
      t.uuid('id').primary().defaultTo(uuid(knex))
      t.uuid('company_id').notNullable()
      t.uuid('part_id').references('id').inTable('parts')
      t.uuid('branch_id').references('id').inTable('branches')
      t.integer('delta_qty').notNullable()
      t.integer('quantity_after').notNullable()
      t.string('movement_type').notNullable()
      t.string('reference_type')
      t.uuid('reference_id')
      t.text('notes')
      t.timestamp('created_at').defaultTo(knex.fn.now())
      USER_FK(t, 'created_by')
      USER_FK(t, 'updated_by')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('part_stock_movements')
  await knex.schema.dropTableIfExists('part_stocks')
  await knex.schema.dropTableIfExists('part_purchase_lines')
  await knex.schema.dropTableIfExists('part_purchases')
  await knex.schema.dropTableIfExists('parts')
}
