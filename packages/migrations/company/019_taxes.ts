import type { Knex } from 'knex'

const uuid = (knex: Knex) => knex.raw('gen_random_uuid()')

const USER_FK = (t: Knex.CreateTableBuilder, col: string) =>
  t.uuid(col).references('id').inTable('user_profiles').onDelete('SET NULL')

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('taxes'))) {
    await knex.schema.createTable('taxes', (t) => {
      t.uuid('id').primary().defaultTo(uuid(knex))
      t.uuid('company_id').notNullable()
      t.string('name').notNullable()
      t.string('code') // sale_tax | tax_236_gh | null for custom
      t.decimal('default_percent', 8, 4).notNullable().defaultTo(0)
      t.boolean('inclusive_default').notNullable().defaultTo(false)
      t.boolean('is_system').notNullable().defaultTo(false)
      t.integer('sort_order').notNullable().defaultTo(100)
      t.timestamps(true, true)
      t.timestamp('deleted_at')
      USER_FK(t, 'created_by')
      USER_FK(t, 'updated_by')
      USER_FK(t, 'deleted_by')
    })

    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS taxes_company_code_unique
      ON taxes (company_id, code)
      WHERE code IS NOT NULL AND deleted_at IS NULL
    `)
  }

  if (!(await knex.schema.hasColumn('sale_lines', 'tax_inclusive'))) {
    await knex.schema.alterTable('sale_lines', (t) => {
      t.boolean('tax_inclusive').notNullable().defaultTo(false)
    })
  }

  if (!(await knex.schema.hasTable('sale_line_taxes'))) {
    await knex.schema.createTable('sale_line_taxes', (t) => {
      t.uuid('id').primary().defaultTo(uuid(knex))
      t.uuid('company_id').notNullable()
      t.uuid('sale_id').references('id').inTable('sales').onDelete('CASCADE')
      t.uuid('sale_line_id').references('id').inTable('sale_lines').onDelete('CASCADE')
      t.uuid('tax_id').references('id').inTable('taxes').onDelete('SET NULL')
      t.string('name').notNullable()
      t.decimal('percent', 8, 4).notNullable().defaultTo(0)
      t.decimal('amount', 15, 2).notNullable().defaultTo(0)
      t.boolean('inclusive').notNullable().defaultTo(false)
      t.timestamps(true, true)
      t.timestamp('deleted_at')
      USER_FK(t, 'created_by')
      USER_FK(t, 'updated_by')
      USER_FK(t, 'deleted_by')
      t.index(['sale_line_id'])
      t.index(['sale_id'])
    })
  }

  // Seed system taxes for each company in this DB
  const profiles = await knex('company_profile').whereNull('deleted_at').select('id')
  for (const profile of profiles) {
    const companyId = profile.id as string
    const existing = await knex('taxes')
      .where({ company_id: companyId })
      .whereIn('code', ['sale_tax', 'tax_236_gh'])
      .whereNull('deleted_at')
    const codes = new Set(existing.map((r: { code: string }) => r.code))

    if (!codes.has('sale_tax')) {
      await knex('taxes').insert({
        id: knex.raw('gen_random_uuid()'),
        company_id: companyId,
        name: 'Sale Tax',
        code: 'sale_tax',
        default_percent: 0,
        inclusive_default: true,
        is_system: true,
        sort_order: 10,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
    }
    if (!codes.has('tax_236_gh')) {
      await knex('taxes').insert({
        id: knex.raw('gen_random_uuid()'),
        company_id: companyId,
        name: 'Tax u/s 236 G/H',
        code: 'tax_236_gh',
        default_percent: 0,
        inclusive_default: true,
        is_system: true,
        sort_order: 20,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('sale_line_taxes')) {
    await knex.schema.dropTable('sale_line_taxes')
  }
  if (await knex.schema.hasColumn('sale_lines', 'tax_inclusive')) {
    await knex.schema.alterTable('sale_lines', (t) => {
      t.dropColumn('tax_inclusive')
    })
  }
  if (await knex.schema.hasTable('taxes')) {
    await knex.raw('DROP INDEX IF EXISTS taxes_company_code_unique')
    await knex.schema.dropTable('taxes')
  }
}
