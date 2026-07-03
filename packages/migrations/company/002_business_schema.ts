import type { Knex } from 'knex'

const uuid = (knex: Knex) => knex.raw('gen_random_uuid()')

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('colors', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.string('name').notNullable()
    t.timestamps(true, true)
    t.timestamp('deleted_at')
  })

  await knex.schema.createTable('suppliers', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.string('name').notNullable()
    t.string('phone')
    t.text('address')
    t.timestamps(true, true)
    t.timestamp('deleted_at')
  })

  await knex.schema.createTable('categories', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.string('name').notNullable()
    t.timestamps(true, true)
    t.timestamp('deleted_at')
  })

  await knex.schema.createTable('products', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.uuid('category_id').references('id').inTable('categories')
    t.string('name').notNullable()
    t.text('description')
    t.decimal('default_purchase_price', 15, 2).defaultTo(0)
    t.decimal('default_sale_price', 15, 2).defaultTo(0)
    t.timestamps(true, true)
    t.timestamp('deleted_at')
  })

  await knex.schema.createTable('purchases', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.uuid('branch_id').references('id').inTable('branches')
    t.uuid('supplier_id').references('id').inTable('suppliers').onDelete('SET NULL')
    t.timestamp('purchase_date').notNullable()
    t.text('notes')
    t.uuid('user_id')
    t.string('device_id')
    t.timestamps(true, true)
    t.timestamp('deleted_at')
  })

  await knex.schema.createTable('product_items', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.uuid('branch_id').references('id').inTable('branches')
    t.uuid('current_branch_id').references('id').inTable('branches')
    t.uuid('purchase_id').references('id').inTable('purchases').onDelete('SET NULL')
    t.uuid('product_id').references('id').inTable('products')
    t.uuid('category_id').references('id').inTable('categories')
    t.uuid('color_id').references('id').inTable('colors').onDelete('SET NULL')
    t.string('serial_number').notNullable()
    t.decimal('purchase_price', 15, 2).defaultTo(0)
    t.decimal('selling_price', 15, 2).defaultTo(0)
    t.string('status').defaultTo('in_stock')
    t.boolean('warranty_active').defaultTo(false)
    t.timestamp('warranty_expiry_date')
    t.timestamp('purchased_at')
    t.timestamp('sold_at')
    t.integer('version').defaultTo(1)
    t.timestamps(true, true)
    t.timestamp('deleted_at')
    t.unique(['company_id', 'serial_number'])
  })

  await knex.schema.createTable('inventory_movements', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.uuid('product_item_id').references('id').inTable('product_items').onDelete('CASCADE')
    t.string('movement_type').notNullable()
    t.uuid('from_branch_id')
    t.uuid('to_branch_id')
    t.string('reference_type')
    t.uuid('reference_id')
    t.text('notes')
    t.timestamp('created_at').defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('customers', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.string('name').notNullable()
    t.string('phone')
    t.text('address')
    t.timestamps(true, true)
    t.timestamp('deleted_at')
  })

  await knex.schema.createTable('ledger_entries', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.uuid('customer_id').references('id').inTable('customers').onDelete('CASCADE')
    t.string('type').notNullable()
    t.decimal('amount', 15, 2).defaultTo(0)
    t.string('reference_type')
    t.uuid('reference_id')
    t.decimal('running_balance', 15, 2).defaultTo(0)
    t.timestamp('created_at').defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('sales', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.uuid('branch_id').references('id').inTable('branches')
    t.uuid('customer_id').references('id').inTable('customers')
    t.timestamp('sale_date').notNullable()
    t.decimal('subtotal', 15, 2).defaultTo(0)
    t.decimal('discount', 15, 2).defaultTo(0)
    t.decimal('total_tax', 15, 2).defaultTo(0)
    t.decimal('total_wht', 15, 2).defaultTo(0)
    t.decimal('net_total', 15, 2).defaultTo(0)
    t.decimal('paid_amount', 15, 2).defaultTo(0)
    t.decimal('due_amount', 15, 2).defaultTo(0)
    t.string('status').defaultTo('completed')
    t.uuid('user_id')
    t.string('device_id')
    t.timestamps(true, true)
    t.timestamp('deleted_at')
  })

  await knex.schema.createTable('sale_lines', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('sale_id').references('id').inTable('sales').onDelete('CASCADE')
    t.uuid('product_item_id').references('id').inTable('product_items')
    t.string('serial_number').notNullable()
    t.string('product_name')
    t.string('category_name')
    t.string('color_name')
    t.decimal('sale_price', 15, 2).defaultTo(0)
    t.decimal('tax_percent', 8, 4).defaultTo(0)
    t.decimal('tax_amount', 15, 2).defaultTo(0)
    t.decimal('wht_percent', 8, 4).defaultTo(0)
    t.decimal('wht_amount', 15, 2).defaultTo(0)
    t.decimal('line_total', 15, 2).defaultTo(0)
    t.boolean('warranty_active').defaultTo(false)
    t.timestamp('warranty_expiry_date')
    t.timestamp('created_at').defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('payments', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('sale_id').references('id').inTable('sales').onDelete('CASCADE')
    t.decimal('amount', 15, 2).defaultTo(0)
    t.string('method').defaultTo('cash')
    t.timestamp('payment_date').defaultTo(knex.fn.now())
    t.timestamp('created_at').defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('expense_categories', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.string('name').notNullable()
    t.timestamps(true, true)
    t.timestamp('deleted_at')
  })

  await knex.schema.createTable('expenses', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.uuid('branch_id').references('id').inTable('branches')
    t.uuid('category_id').references('id').inTable('expense_categories').onDelete('SET NULL')
    t.decimal('amount', 15, 2).defaultTo(0)
    t.timestamp('date').defaultTo(knex.fn.now())
    t.text('description')
    t.uuid('user_id')
    t.string('device_id')
    t.timestamps(true, true)
    t.timestamp('deleted_at')
  })
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'expenses',
    'expense_categories',
    'payments',
    'sale_lines',
    'sales',
    'ledger_entries',
    'customers',
    'inventory_movements',
    'product_items',
    'purchases',
    'products',
    'categories',
    'suppliers',
    'colors'
  ]
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table)
  }
}
