import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('companies', (t) => {
    t.string('plan').defaultTo('standard')
    t.timestamp('plan_expires_at')
    t.boolean('maintenance_mode').defaultTo(false)
    t.string('min_app_version')
    t.integer('max_branches')
    t.integer('max_users')
    t.integer('max_devices')
    t.jsonb('feature_flags').defaultTo(knex.raw(`'{}'::jsonb`))
  })

  await knex.schema.createTable('admin_audit_log', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.uuid('actor_user_id')
    t.string('actor_email')
    t.uuid('company_id')
    t.string('action').notNullable()
    t.string('resource')
    t.jsonb('detail')
    t.timestamp('created_at').defaultTo(knex.fn.now())
  })

  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON admin_audit_log (created_at DESC)'
  )
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS admin_audit_log_company_id_idx ON admin_audit_log (company_id)'
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_audit_log')
  await knex.schema.alterTable('companies', (t) => {
    t.dropColumn('plan')
    t.dropColumn('plan_expires_at')
    t.dropColumn('maintenance_mode')
    t.dropColumn('min_app_version')
    t.dropColumn('max_branches')
    t.dropColumn('max_users')
    t.dropColumn('max_devices')
    t.dropColumn('feature_flags')
  })
}
