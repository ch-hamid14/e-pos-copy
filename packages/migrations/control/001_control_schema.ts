import type { Knex } from 'knex'

const uuid = (knex: Knex) => knex.raw('gen_random_uuid()')

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('companies', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.string('name').notNullable()
    t.string('email')
    t.string('phone')
    t.string('status').defaultTo('provisioning')
    t.string('db_name').notNullable().unique()
    t.string('db_host')
    t.integer('db_port').defaultTo(5432)
    t.integer('branch_count').defaultTo(0)
    t.timestamps(true, true)
  })

  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').references('id').inTable('companies').onDelete('CASCADE').nullable()
    t.uuid('branch_id').nullable()
    t.string('email').notNullable().unique()
    t.string('password').notNullable()
    t.string('first_name').notNullable()
    t.string('last_name').notNullable()
    t.string('role').defaultTo('staff')
    t.boolean('is_active').defaultTo(true)
    t.boolean('email_verified').defaultTo(false)
    t.string('bound_device_id')
    t.timestamps(true, true)
  })

  await knex.schema.createTable('devices', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').references('id').inTable('companies').onDelete('CASCADE').nullable()
    t.uuid('branch_id').nullable()
    t.uuid('user_id').references('id').inTable('users').onDelete('SET NULL')
    t.string('device_code').notNullable().unique()
    t.string('client_device_id').unique()
    t.string('name')
    t.timestamp('last_sync_at')
    t.timestamps(true, true)
  })

  await knex.schema.createTable('permissions', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.string('key').notNullable().unique()
    t.string('label').notNullable()
    t.timestamps(true, true)
  })

  await knex.schema.createTable('roles', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').nullable()
    t.string('name').notNullable()
    t.text('description')
    t.timestamps(true, true)
  })

  await knex.schema.createTable('role_permissions', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('role_id').references('id').inTable('roles').onDelete('CASCADE')
    t.uuid('permission_id').references('id').inTable('permissions').onDelete('CASCADE')
    t.timestamps(true, true)
    t.unique(['role_id', 'permission_id'])
  })

  await knex.schema.createTable('user_roles', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('user_id').references('id').inTable('users').onDelete('CASCADE')
    t.uuid('role_id').references('id').inTable('roles').onDelete('CASCADE')
    t.timestamps(true, true)
    t.unique(['user_id', 'role_id'])
  })

  await knex.schema.createTable('otp_codes', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.string('email').notNullable()
    t.string('code').notNullable()
    t.string('purpose').notNullable()
    t.timestamp('expires_at').notNullable()
    t.boolean('used').defaultTo(false)
    t.timestamp('created_at').defaultTo(knex.fn.now())
  })
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'otp_codes',
    'user_roles',
    'role_permissions',
    'roles',
    'permissions',
    'devices',
    'users',
    'companies'
  ]
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table)
  }
}
