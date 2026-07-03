import type { Knex } from 'knex'

const uuid = (knex: Knex) => knex.raw('gen_random_uuid()')

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('company_profile', (t) => {
    t.uuid('id').primary()
    t.string('name').notNullable()
    t.string('email')
    t.string('phone')
    t.string('status').defaultTo('active')
    t.timestamps(true, true)
    t.timestamp('deleted_at')
  })

  await knex.schema.createTable('branches', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.string('name').notNullable()
    t.string('location')
    t.boolean('is_active').defaultTo(true)
    t.timestamps(true, true)
    t.timestamp('deleted_at')
  })

  await knex.schema.createTable('permissions', (t) => {
    t.uuid('id').primary()
    t.string('key').notNullable().unique()
    t.string('label').notNullable()
    t.timestamps(true, true)
  })

  await knex.schema.createTable('roles', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('company_id').notNullable()
    t.string('name').notNullable()
    t.text('description')
    t.timestamps(true, true)
    t.timestamp('deleted_at')
  })

  await knex.schema.createTable('role_permissions', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('role_id').references('id').inTable('roles').onDelete('CASCADE')
    t.uuid('permission_id').references('id').inTable('permissions').onDelete('CASCADE')
    t.timestamps(true, true)
    t.unique(['role_id', 'permission_id'])
  })

  await knex.schema.createTable('user_profiles', (t) => {
    t.uuid('id').primary()
    t.uuid('company_id').notNullable()
    t.uuid('branch_id')
    t.string('email').notNullable()
    t.string('first_name').notNullable()
    t.string('last_name').notNullable()
    t.string('role').defaultTo('staff')
    t.boolean('is_active').defaultTo(true)
    t.boolean('email_verified').defaultTo(false)
    t.timestamps(true, true)
    t.timestamp('deleted_at')
  })

  await knex.schema.createTable('user_roles', (t) => {
    t.uuid('id').primary().defaultTo(uuid(knex))
    t.uuid('user_id').references('id').inTable('user_profiles').onDelete('CASCADE')
    t.uuid('role_id').references('id').inTable('roles').onDelete('CASCADE')
    t.timestamps(true, true)
    t.unique(['user_id', 'role_id'])
  })
}

export async function down(knex: Knex): Promise<void> {
  const tables = ['user_roles', 'user_profiles', 'role_permissions', 'roles', 'permissions', 'branches', 'company_profile']
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table)
  }
}
