import { getDb } from '../../db'
import { generateId } from '../../../common/utils/uuid'

function toDate(val: unknown): Date {
  return val ? new Date(val as string) : new Date()
}

async function upsertRow(table: string, id: string, data: Record<string, unknown>): Promise<void> {
  const db = getDb()
  const existing = await db(table).where({ id }).first()
  if (existing) {
    await db(table).where({ id }).update({ ...data, updated_at: new Date() })
  } else {
    await db(table).insert({ id, ...data })
  }
}

export async function cacheBootstrapData(data: any): Promise<void> {
  const db = getDb()

  if (data.company) {
    await upsertRow('company_profile', data.company.id, {
      name: data.company.name,
      email: data.company.email || '',
      phone: data.company.phone || '',
      status: data.company.status || 'active',
      created_at: toDate(data.company.created_at),
      updated_at: toDate(data.company.updated_at)
    })
  }

  for (const branch of data.branches || []) {
    await upsertRow('branches', branch.id, {
      company_id: branch.company_id,
      name: branch.name,
      location: branch.location || '',
      is_active: branch.is_active ?? true,
      created_at: toDate(branch.created_at),
      updated_at: toDate(branch.updated_at)
    })
  }

  for (const perm of data.permissions || []) {
    const existing = await db('permissions').where({ key: perm.key }).first()
    if (existing) {
      await db('permissions').where({ id: existing.id }).update({
        label: perm.label,
        updated_at: toDate(perm.updated_at)
      })
    } else {
      await db('permissions').insert({
        id: perm.id,
        key: perm.key,
        label: perm.label,
        created_at: toDate(perm.created_at),
        updated_at: toDate(perm.updated_at)
      })
    }
  }

  for (const role of data.roles || []) {
    if (!role.company_id) continue
    await upsertRow('roles', role.id, {
      company_id: role.company_id,
      name: role.name,
      description: role.description || '',
      created_at: toDate(role.created_at),
      updated_at: toDate(role.updated_at)
    })
  }

  for (const rp of data.rolePermissions || []) {
    const exists = await db('role_permissions')
      .where({ role_id: rp.role_id, permission_id: rp.permission_id })
      .first()
    if (!exists) {
      await db('role_permissions').insert({
        id: rp.id || generateId(),
        role_id: rp.role_id,
        permission_id: rp.permission_id,
        created_at: toDate(rp.created_at),
        updated_at: toDate(rp.updated_at)
      })
    }
  }

  for (const u of data.users || []) {
    if (!u.company_id) continue
    await upsertRow('user_profiles', u.id, {
      company_id: u.company_id,
      branch_id: u.branch_id,
      email: u.email,
      first_name: u.first_name,
      last_name: u.last_name,
      role: u.role,
      is_active: true,
      email_verified: u.email_verified ?? false,
      created_at: toDate(u.created_at),
      updated_at: toDate(u.updated_at)
    })
  }

  for (const ur of data.userRoles || []) {
    const exists = await db('user_roles').where({ user_id: ur.user_id, role_id: ur.role_id }).first()
    if (!exists) {
      await db('user_roles').insert({
        id: ur.id || generateId(),
        user_id: ur.user_id,
        role_id: ur.role_id,
        created_at: toDate(ur.created_at),
        updated_at: toDate(ur.updated_at)
      })
    }
  }
}
