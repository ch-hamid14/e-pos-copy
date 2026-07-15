import type { Knex } from 'knex'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { parseConnectionUrl } from '@madix/database'
import { companyDbName, getCompanyDb, provisionCompanyDatabase, companyDbPool, teardownCompanyDatabase } from '../../db'
import { bootstrapCompanySync } from '../sync/bootstrap'
import { listActiveOtps } from '../../utils/otp'

function normalizeCompanyEmail(email?: string): string | null {
  const trimmed = email?.trim()
  return trimmed ? trimmed.toLowerCase() : null
}

function normalizeCompanyPhone(phone?: string): string | null {
  const trimmed = phone?.trim()
  return trimmed || null
}

function formatCompanyDbError(err: unknown): Error {
  if (err && typeof err === 'object' && 'code' in err) {
    const pgErr = err as { code: string; constraint?: string }
    if (pgErr.code === '23505') {
      if (pgErr.constraint === 'companies_email_unique') {
        return new Error('Company email already in use')
      }
      if (pgErr.constraint === 'companies_phone_unique') {
        return new Error('Company phone already in use')
      }
    }
  }
  return err instanceof Error ? err : new Error(String(err))
}

async function rollbackFailedCompanyCreation(
  controlDb: Knex,
  adminUrl: string,
  companyId: string,
  dbCreated: boolean
): Promise<void> {
  await companyDbPool.evict(companyId).catch(() => {})
  await controlDb('users').where({ company_id: companyId }).delete()
  await controlDb('companies').where({ id: companyId }).delete()
  if (dbCreated) {
    await teardownCompanyDatabase(adminUrl, companyId).catch(() => {})
  }
}

export async function getOverview(controlDb: Knex) {
  const [{ count: companiesCount }] = await controlDb('companies').count('* as count')
  const [{ count: usersCount }] = await controlDb('users')
    .whereNotNull('company_id')
    .where({ is_active: true })
    .count('* as count')

  const companies = await controlDb('companies')
    .select('companies.*')
    .select(
      controlDb.raw('(SELECT COUNT(*) FROM users WHERE users.company_id = companies.id AND users.is_active = true) as user_count')
    )
    .orderBy('created_at', 'desc')

  const branchesCount = companies.reduce((sum, c) => sum + Number(c.branch_count || 0), 0)
  const activeCompaniesCount = companies.filter((c) => c.status === 'active').length
  const inactiveCompaniesCount = companies.filter((c) => c.status === 'inactive').length
  const maintenanceCount = companies.filter((c) => c.maintenance_mode).length
  const expiredPlanCount = companies.filter(
    (c) => c.plan_expires_at && new Date(c.plan_expires_at) < new Date()
  ).length

  let migrationLagCount = 0
  let conflictTenantCount = 0
  const scout = companies.filter((c) => c.status === 'active' || c.status === 'inactive').slice(0, 40)
  await Promise.all(
    scout.map(async (c) => {
      try {
        const companyDb = await getCompanyDb(c.id as string, { forOps: true })
        const { getCompanyMigrationStatus } = await import('@madix/database')
        const mig = await getCompanyMigrationStatus(companyDb)
        if (!mig.upToDate) migrationLagCount++
        if (await companyDb.schema.hasTable('sync_conflict')) {
          const n = Number(
            (await companyDb('sync_conflict').count('* as count').first())?.count ?? 0
          )
          if (n > 0) conflictTenantCount++
        }
      } catch {
        // ignore unreachable tenants in overview
      }
    })
  )

  return {
    companiesCount: Number(companiesCount),
    activeCompaniesCount,
    inactiveCompaniesCount,
    usersCount: Number(usersCount),
    branchesCount,
    fleet: {
      maintenanceCount,
      expiredPlanCount,
      migrationLagCount,
      conflictTenantCount,
      scouted: scout.length
    },
    companies: companies.map(mapCompany)
  }
}

export async function listCompanies(controlDb: Knex) {
  const rows = await controlDb('companies')
    .select('companies.*')
    .select(
      controlDb.raw('(SELECT COUNT(*) FROM users WHERE users.company_id = companies.id AND users.is_active = true) as user_count')
    )
    .orderBy('created_at', 'desc')
  return rows.map(mapCompany)
}

export async function createCompany(
  controlDb: Knex,
  data: {
    name: string
    email?: string
    phone?: string
    branchName?: string
    branchLocation?: string
    ownerEmail?: string
    ownerPassword?: string
    ownerFirstName?: string
    ownerLastName?: string
  }
) {
  const companyId = randomUUID()
  const branchId = randomUUID()
  const now = new Date()
  const dbName = companyDbName(companyId)
  const adminUrl = process.env.CONTROL_DATABASE_URL || ''
  const pgConfig = parseConnectionUrl(adminUrl)
  const email = normalizeCompanyEmail(data.email)
  const phone = normalizeCompanyPhone(data.phone)
  let dbCreated = false

  try {
    await controlDb.transaction(async (trx) => {
      await trx('companies').insert({
        id: companyId,
        name: data.name,
        email,
        phone,
        status: 'provisioning',
        db_name: dbName,
        db_host: pgConfig.host,
        db_port: pgConfig.port,
        branch_count: 0,
        created_at: now,
        updated_at: now
      })
    })

    await provisionCompanyDatabase(controlDb, adminUrl, companyId, {
      name: data.name,
      email: email ?? undefined,
      phone: phone ?? undefined
    })
    dbCreated = true

    const companyDb = await getCompanyDb(companyId)
    console.log('Company DB created for company: ', companyId)
    const ownerRoleId = randomUUID()
    let ownerUserId: string | null = null
    let ownerHashedPassword: string | null = null

    if (data.ownerEmail && data.ownerPassword) {
      ownerUserId = randomUUID()
      ownerHashedPassword = await bcrypt.hash(data.ownerPassword, 10)
    }

    await companyDb.transaction(async (trx) => {
      console.log('Company DB transaction started for company: ', companyId)
      await trx('branches').insert({
        id: branchId,
        company_id: companyId,
        name: data.branchName || 'Main Branch',
        location: data.branchLocation || '',
        is_active: true,
        created_at: now,
        updated_at: now
      })

      await trx('roles').insert({
        id: ownerRoleId,
        company_id: companyId,
        name: 'Company Owner',
        description: 'Full company access',
        created_at: now,
        updated_at: now
      })

      const permissions = await trx('permissions').select('id')
      for (const perm of permissions) {
        await trx('role_permissions').insert({
          id: randomUUID(),
          role_id: ownerRoleId,
          permission_id: perm.id,
          created_at: now,
          updated_at: now
        })
      }

      if (ownerUserId && data.ownerEmail) {
        await trx('user_profiles').insert({
          id: ownerUserId,
          company_id: companyId,
          branch_id: branchId,
          email: data.ownerEmail.toLowerCase(),
          first_name: data.ownerFirstName || 'Company',
          last_name: data.ownerLastName || 'Owner',
          role: 'company_owner',
          is_active: true,
          email_verified: false,
          created_at: now,
          updated_at: now
        })

        await trx('user_roles').insert({
          id: randomUUID(),
          user_id: ownerUserId,
          role_id: ownerRoleId,
          created_at: now,
          updated_at: now
        })
      }
    })

    let ownerUser = null
    await controlDb.transaction(async (trx) => {
      console.log('Control DB transaction started for company: ', companyId)
      if (ownerUserId && ownerHashedPassword && data.ownerEmail) {
        await trx('users').insert({
          id: ownerUserId,
          company_id: companyId,
          branch_id: branchId,
          email: data.ownerEmail.toLowerCase(),
          password: ownerHashedPassword,
          first_name: data.ownerFirstName || 'Company',
          last_name: data.ownerLastName || 'Owner',
          role: 'company_owner',
          is_active: true,
          email_verified: false,
          created_at: now,
          updated_at: now
        })
      }

      await trx('companies').where({ id: companyId }).update({
        status: 'active',
        branch_count: 1,
        updated_at: new Date()
      })
    })

    if (ownerUserId) {
      ownerUser = await getUserById(controlDb, companyDb, ownerUserId)
    }

    try {
      await bootstrapCompanySync(companyId, companyDb)
    } catch (err) {
      console.error('Sync bootstrap failed for new company:', companyId, err)
    }

    return {
      company: mapCompany(await controlDb('companies').where({ id: companyId }).first()),
      branch: mapBranch(await companyDb('branches').where({ id: branchId }).first()),
      owner: ownerUser
    }
  } catch (err) {
    console.error(err)
    await rollbackFailedCompanyCreation(controlDb, adminUrl, companyId, dbCreated)
    throw formatCompanyDbError(err)
  }
}

export async function getCompanyDetail(controlDb: Knex, companyId: string) {
  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) return null

  const companyDb = await getCompanyDb(companyId, { forOps: true })
  const branches = await companyDb('branches').where({ company_id: companyId }).whereNull('deleted_at').orderBy('name')
  const users = await controlDb('users')
    .where({ company_id: companyId })
    .select('id', 'company_id', 'branch_id', 'email', 'first_name', 'last_name', 'role', 'email_verified', 'is_active', 'created_at', 'updated_at')
    .orderBy('is_active', 'desc')
    .orderBy('created_at', 'desc')
  const roles = await companyDb('roles').where({ company_id: companyId }).whereNull('deleted_at').orderBy('name')
  const permissions = await companyDb('permissions').orderBy('key')

  const usersWithRoles = await Promise.all(
    users.map(async (u) => {
      const userRoles = await companyDb('user_roles as ur')
        .join('roles as r', 'ur.role_id', 'r.id')
        .where('ur.user_id', u.id)
        .select('r.id', 'r.name')
      const otps = await listActiveOtps(controlDb, String(u.email))
      return { ...mapUser(u), roles: userRoles, otps }
    })
  )

  const rolesWithPerms = await Promise.all(
    roles.map(async (r) => getRoleWithPermissions(companyDb, r.id as string))
  )

  return {
    company: mapCompany(company),
    branches: branches.map(mapBranch),
    users: usersWithRoles,
    roles: rolesWithPerms.filter(Boolean),
    permissions: permissions.map(mapPermission)
  }
}

export async function updateCompany(
  controlDb: Knex,
  companyId: string,
  data: { name?: string; email?: string; phone?: string; status?: string }
) {
  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) return null

  const email = data.email !== undefined ? normalizeCompanyEmail(data.email) : undefined
  const phone = data.phone !== undefined ? normalizeCompanyPhone(data.phone) : undefined

  try {
    await controlDb.transaction(async (trx) => {
      await trx('companies')
        .where({ id: companyId })
        .update({
          ...(data.name !== undefined && { name: data.name }),
          ...(email !== undefined && { email }),
          ...(phone !== undefined && { phone }),
          ...(data.status !== undefined && { status: data.status }),
          updated_at: new Date()
        })

      if (data.name !== undefined || email !== undefined || phone !== undefined || data.status !== undefined) {
        const companyDb = await getCompanyDb(companyId, { forOps: true })
        await companyDb('company_profile')
          .where({ id: companyId })
          .update({
            ...(data.name !== undefined && { name: data.name }),
            ...(email !== undefined && { email }),
            ...(phone !== undefined && { phone }),
            ...(data.status !== undefined && { status: data.status }),
            updated_at: new Date()
          })
      }
    })
  } catch (err) {
    throw formatCompanyDbError(err)
  }

  return mapCompany(await controlDb('companies').where({ id: companyId }).first())
}

export async function createBranch(
  controlDb: Knex,
  companyId: string,
  data: { name: string; location?: string }
) {
  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) throw new Error('Company not found')
  if (company.max_branches != null && Number(company.branch_count) >= Number(company.max_branches)) {
    throw new Error(`Branch limit reached (${company.max_branches})`)
  }

  const companyDb = await getCompanyDb(companyId, { forOps: true })
  const id = randomUUID()
  const now = new Date()
  await companyDb('branches').insert({
    id,
    company_id: companyId,
    name: data.name,
    location: data.location || '',
    is_active: true,
    created_at: now,
    updated_at: now
  })

  await controlDb('companies')
    .where({ id: companyId })
    .increment('branch_count', 1)
    .update({ updated_at: now })

  return mapBranch(await companyDb('branches').where({ id }).first())
}

export async function createCompanyUser(
  controlDb: Knex,
  companyId: string,
  data: {
    email: string
    password: string
    firstName: string
    lastName: string
    role: string
    branchId?: string
    roleIds?: string[]
  }
) {
  const existing = await controlDb('users').where({ email: data.email.toLowerCase() }).first()
  if (existing) throw new Error('Email already in use')

  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) throw new Error('Company not found')
  if (company.max_users != null) {
    const [{ count }] = await controlDb('users')
      .where({ company_id: companyId, is_active: true })
      .count('* as count')
    if (Number(count) >= Number(company.max_users)) {
      throw new Error(`User limit reached (${company.max_users})`)
    }
  }

  const companyDb = await getCompanyDb(companyId, { forOps: true })
  const userId = randomUUID()
  const now = new Date()
  const hashed = await bcrypt.hash(data.password, 10)

  await controlDb('users').insert({
    id: userId,
    company_id: companyId,
    branch_id: data.branchId || null,
    email: data.email.toLowerCase(),
    password: hashed,
    first_name: data.firstName,
    last_name: data.lastName,
    role: data.role,
    is_active: true,
    email_verified: false,
    created_at: now,
    updated_at: now
  })

  await companyDb('user_profiles').insert({
    id: userId,
    company_id: companyId,
    branch_id: data.branchId || null,
    email: data.email.toLowerCase(),
    first_name: data.firstName,
    last_name: data.lastName,
    role: data.role,
    is_active: true,
    email_verified: false,
    created_at: now,
    updated_at: now
  })

  for (const roleId of data.roleIds || []) {
    await companyDb('user_roles').insert({
      id: randomUUID(),
      user_id: userId,
      role_id: roleId,
      created_at: now,
      updated_at: now
    })
  }

  return getUserById(controlDb, companyDb, userId)
}

export async function updateCompanyUser(
  controlDb: Knex,
  userId: string,
  data: {
    firstName?: string
    lastName?: string
    role?: string
    branchId?: string | null
    isActive?: boolean
    roleIds?: string[]
    password?: string
  }
) {
  const user = await controlDb('users').where({ id: userId }).first()
  if (!user) return null

  const companyDb = user.company_id
    ? await getCompanyDb(user.company_id as string, { forOps: true })
    : null
  const updates: Record<string, unknown> = { updated_at: new Date() }
  if (data.firstName !== undefined) updates.first_name = data.firstName
  if (data.lastName !== undefined) updates.last_name = data.lastName
  if (data.role !== undefined) updates.role = data.role
  if (data.branchId !== undefined) updates.branch_id = data.branchId
  if (data.isActive !== undefined) updates.is_active = data.isActive
  if (data.password) updates.password = await bcrypt.hash(data.password, 10)

  await controlDb('users').where({ id: userId }).update(updates)

  if (companyDb) {
    const profileUpdates: Record<string, unknown> = { updated_at: new Date() }
    if (data.firstName !== undefined) profileUpdates.first_name = data.firstName
    if (data.lastName !== undefined) profileUpdates.last_name = data.lastName
    if (data.role !== undefined) profileUpdates.role = data.role
    if (data.branchId !== undefined) profileUpdates.branch_id = data.branchId
    if (data.isActive !== undefined) profileUpdates.is_active = data.isActive
    await companyDb('user_profiles').where({ id: userId }).update(profileUpdates)

    if (data.roleIds) {
      await companyDb('user_roles').where({ user_id: userId }).del()
      const now = new Date()
      for (const roleId of data.roleIds) {
        await companyDb('user_roles').insert({
          id: randomUUID(),
          user_id: userId,
          role_id: roleId,
          created_at: now,
          updated_at: now
        })
      }
    }
  }

  return companyDb ? getUserById(controlDb, companyDb, userId) : mapUser(await controlDb('users').where({ id: userId }).first())
}

export async function createCompanyRole(
  controlDb: Knex,
  companyId: string,
  data: { name: string; description?: string; permissionKeys: string[] }
) {
  const companyDb = await getCompanyDb(companyId)
  const roleId = randomUUID()
  const now = new Date()

  await companyDb('roles').insert({
    id: roleId,
    company_id: companyId,
    name: data.name,
    description: data.description || '',
    created_at: now,
    updated_at: now
  })

  const permissions = await companyDb('permissions').whereIn('key', data.permissionKeys)
  for (const perm of permissions) {
    await companyDb('role_permissions').insert({
      id: randomUUID(),
      role_id: roleId,
      permission_id: perm.id,
      created_at: now,
      updated_at: now
    })
  }

  return getRoleWithPermissions(companyDb, roleId)
}

export async function updateCompanyRole(
  _controlDb: Knex,
  _roleId: string,
  _data: { name?: string; description?: string; permissionKeys?: string[] }
) {
  throw new Error('Use updateCompanyRoleInDb with company database context')
}

export async function updateCompanyRoleInDb(
  companyDb: Knex,
  roleId: string,
  data: { name?: string; description?: string; permissionKeys?: string[] }
) {
  const role = await companyDb('roles').where({ id: roleId }).first()
  if (!role) return null

  const updates: Record<string, unknown> = { updated_at: new Date() }
  if (data.name !== undefined) updates.name = data.name
  if (data.description !== undefined) updates.description = data.description
  await companyDb('roles').where({ id: roleId }).update(updates)

  if (data.permissionKeys) {
    await companyDb('role_permissions').where({ role_id: roleId }).del()
    const now = new Date()
    const permissions = await companyDb('permissions').whereIn('key', data.permissionKeys)
    for (const perm of permissions) {
      await companyDb('role_permissions').insert({
        id: randomUUID(),
        role_id: roleId,
        permission_id: perm.id,
        created_at: now,
        updated_at: now
      })
    }
  }

  return getRoleWithPermissions(companyDb, roleId)
}

export async function listPermissions(controlDb: Knex) {
  return (await controlDb('permissions').orderBy('key')).map(mapPermission)
}

async function getUserById(controlDb: Knex, companyDb: Knex, userId: string) {
  const u = await controlDb('users').where({ id: userId }).first()
  if (!u) return null
  const userRoles = await companyDb('user_roles as ur')
    .join('roles as r', 'ur.role_id', 'r.id')
    .where('ur.user_id', userId)
    .select('r.id', 'r.name')
  return { ...mapUser(u), roles: userRoles }
}

async function getRoleWithPermissions(companyDb: Knex, roleId: string) {
  const role = await companyDb('roles').where({ id: roleId }).first()
  if (!role) return null
  const perms = await companyDb('role_permissions as rp')
    .join('permissions as p', 'rp.permission_id', 'p.id')
    .where('rp.role_id', roleId)
    .select('p.key')
  return { ...mapRole(role), permissionKeys: perms.map((p: { key: string }) => p.key) }
}

export function mapCompany(row: Record<string, unknown>) {
  const flagsRaw = row.feature_flags
  let featureFlags: Record<string, boolean> = {}
  if (flagsRaw && typeof flagsRaw === 'object') {
    featureFlags = flagsRaw as Record<string, boolean>
  } else if (typeof flagsRaw === 'string') {
    try {
      featureFlags = JSON.parse(flagsRaw)
    } catch {
      featureFlags = {}
    }
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    dbName: row.db_name,
    dbHost: row.db_host,
    dbPort: row.db_port,
    branchCount: Number(row.branch_count ?? 0),
    userCount: Number(row.user_count ?? 0),
    plan: row.plan ?? 'standard',
    planExpiresAt: row.plan_expires_at ?? null,
    maintenanceMode: Boolean(row.maintenance_mode),
    minAppVersion: row.min_app_version ?? null,
    maxBranches: row.max_branches ?? null,
    maxUsers: row.max_users ?? null,
    maxDevices: row.max_devices ?? null,
    featureFlags,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapBranch(row: Record<string, unknown>) {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    location: row.location,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    companyId: row.company_id,
    branchId: row.branch_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    emailVerified: row.email_verified,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapRole(row: Record<string, unknown>) {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapPermission(row: Record<string, unknown>) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
