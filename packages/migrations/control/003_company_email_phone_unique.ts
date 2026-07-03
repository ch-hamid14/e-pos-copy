import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex('companies').where('email', '').update({ email: null })
  await knex('companies').where('phone', '').update({ phone: null })

  await knex.raw(`
    CREATE UNIQUE INDEX companies_email_unique
    ON companies (LOWER(email))
    WHERE email IS NOT NULL
  `)

  await knex.raw(`
    CREATE UNIQUE INDEX companies_phone_unique
    ON companies (phone)
    WHERE phone IS NOT NULL
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS companies_email_unique')
  await knex.raw('DROP INDEX IF EXISTS companies_phone_unique')
}
