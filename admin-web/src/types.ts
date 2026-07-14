export type AuthUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  companyId: string | null
  branchId: string | null
  role: string
  permissions: string[]
  emailVerified: boolean
}

export type Company = {
  id: string
  name: string
  email: string
  phone: string
  status: string
  dbName?: string
  dbHost?: string
  dbPort?: number
  branchCount: number
  userCount: number
  createdAt: string
  updatedAt: string
}

export type Branch = {
  id: string
  companyId: string
  name: string
  location: string
  isActive: boolean
}

export type CompanyUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  branchId: string | null
  emailVerified: boolean
  isActive: boolean
  roles: { id: string; name: string }[]
}

export type CompanyRole = {
  id: string
  name: string
  description: string
  permissionKeys: string[]
}

export type Permission = {
  id: string
  key: string
  label: string
}

export type CompanyDetail = {
  company: Company
  branches: Branch[]
  users: CompanyUser[]
  roles: CompanyRole[]
  permissions: Permission[]
}

export type Overview = {
  companiesCount: number
  activeCompaniesCount: number
  inactiveCompaniesCount: number
  usersCount: number
  branchesCount: number
  companies: Company[]
}

export type CompanyMigrationStatus = {
  completed: string[]
  pending: string[]
  current: string | null
  upToDate: boolean
}

export type CompanyDevice = {
  id: string
  deviceCode: string
  clientDeviceId: string | null
  name: string | null
  lastSyncAt: string | null
  userId: string | null
  userEmail: string | null
  branchId: string | null
  createdAt: string
}

export type CompanyOps = {
  company: Company
  database: {
    dbName: string
    dbHost: string | null
    dbPort: number | null
  }
  migrations: CompanyMigrationStatus
  permissions: {
    control: number
    company: number
    inSync: boolean
  }
  sync: {
    queueDepth: number
    conflictCount: number
    tablesReady: boolean
  }
  devices: CompanyDevice[]
}

export type MigrateAllResult = {
  total: number
  succeeded: number
  failed: number
  results: Array<{
    companyId: string
    name: string
    status: string
    ok: boolean
    applied: string[]
    error?: string
  }>
}
