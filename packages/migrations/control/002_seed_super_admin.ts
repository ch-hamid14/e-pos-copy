import type { Knex } from 'knex'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

const PERMISSIONS = [
  'sales',
  'inventory',
  'reports',
  'customers',
  'finance',
  'administration',
  'system'
]

export async function up(knex: Knex): Promise<void> {
  const existing = await knex('users').where({ email: 'superadmin@madix.com' }).first()
  if (existing) return

  const now = new Date()
  for (const key of PERMISSIONS) {
    const exists = await knex('permissions').where({ key }).first()
    if (!exists) {
      await knex('permissions').insert({
        id: randomUUID(),
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        created_at: now,
        updated_at: now
      })
    }
  }

  const allPermissions = await knex('permissions').select('id', 'key')
  const superAdminRoleId = randomUUID()

  await knex('roles').insert({
    id: superAdminRoleId,
    company_id: null,
    name: 'Super Admin',
    description: 'Platform super administrator',
    created_at: now,
    updated_at: now
  })

  for (const perm of allPermissions) {
    await knex('role_permissions').insert({
      id: randomUUID(),
      role_id: superAdminRoleId,
      permission_id: perm.id,
      created_at: now,
      updated_at: now
    })
  }

  const userId = randomUUID()
  const hashedPassword = await bcrypt.hash('Madix#4321', 10)

  await knex('users').insert({
    id: userId,
    company_id: null,
    branch_id: null,
    email: 'superadmin@madix.com',
    password: hashedPassword,
    first_name: 'Super',
    last_name: 'Admin',
    role: 'super_admin',
    is_active: true,
    email_verified: true,
    created_at: now,
    updated_at: now
  })

  await knex('user_roles').insert({
    id: randomUUID(),
    user_id: userId,
    role_id: superAdminRoleId,
    created_at: now,
    updated_at: now
  })
}

export async function down(knex: Knex): Promise<void> {
  const user = await knex('users').where({ email: 'superadmin@madix.com' }).first()
  if (user) {
    await knex('user_roles').where({ user_id: user.id }).del()
    await knex('users').where({ id: user.id }).del()
  }
  await knex('roles').where({ name: 'Super Admin' }).whereNull('company_id').del()
}
