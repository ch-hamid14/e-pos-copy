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
  plan?: string
  planExpiresAt?: string | null
  maintenanceMode?: boolean
  minAppVersion?: string | null
  maxBranches?: number | null
  maxUsers?: number | null
  maxDevices?: number | null
  featureFlags?: Record<string, boolean>
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

export type OtpPurpose = 'email_verify' | 'device_reset'

export type ActiveOtp = {
  id: string
  email: string
  code: string
  purpose: OtpPurpose
  expiresAt: string
  createdAt: string
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
  otps?: ActiveOtp[]
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
  fleet?: {
    maintenanceCount: number
    expiredPlanCount: number
    migrationLagCount: number
    conflictTenantCount: number
    scouted: number
  }
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

export type SyncConflict = {
  id: string
  sno: number
  table: string
  entityId: string
  message: string | null
  error?: unknown
  winner: string
  loserPayload?: Record<string, unknown> | null
  current?: Record<string, unknown> | null
  createdAt: string
}

export type SyncQueueItem = {
  id: string
  sno: number
  table: string
  event: string
  entityId: string
  hlc: string
  originClientId: string
  createdAt: string
  payload?: unknown
}

export type DataBrowseResult = {
  table: string
  columns: Array<{ name: string; type: string; nullable: boolean; readonly: boolean }>
  page: number
  pageSize: number
  total: number
  rows: Record<string, unknown>[]
}

export type AuditLog = {
  id: string
  actorUserId: string | null
  actorEmail: string | null
  companyId: string | null
  action: string
  resource: string | null
  detail: unknown
  createdAt: string
}

export type SnapshotInfo = {
  filename: string
  folder?: string
  size: number
  createdAt: string
  kind?: 'manual' | 'scheduled'
}

export type BusinessListResult<T> = {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

export type BusinessSaleRow = {
  id: string
  billNo?: number
  saleDate: string
  netTotal: number
  paidAmount: number
  dueAmount: number
  status: string
  deletedAt?: string | null
  notes?: string | null
  customer?: { name?: string } | null
  branchName?: string | null
  lineCount?: number
}

export type BusinessPurchaseRow = {
  key: string
  kind: 'product' | 'part'
  id: string
  purchaseDate: string
  supplier?: { name?: string } | null
  branchName?: string | null
  itemCount: number
  totalValue: number
  editable: boolean
  soldCount?: number
  deletedAt?: string | null
  voided?: boolean
}

export type BusinessAnalytics = {
  period: { from: string; to: string }
  kpis: Record<string, number>
  profitLoss: {
    revenue: number
    cogs: number
    grossProfit: number
    grossMarginPercent: number
    expenses: number
    netProfit: number
    netMarginPercent: number
  }
  insights: Record<string, number>
  trend: { date: string; sales: number; purchases: number; expenses: number; profit: number }[]
  topProducts: { name: string; units: number; revenue: number }[]
  expensesByCategory: { category: string; amount: number }[]
}

export type BusinessFilterOptions = {
  branches: { id: string; name: string }[]
  suppliers: { id: string; name: string }[]
  products: { id: string; name: string }[]
  parts: { id: string; name: string }[]
}

export type BusinessCustomerRow = {
  id: string
  name: string
  phone?: string | null
  cnic?: string | null
  address?: string | null
  balance: number
  deletedAt?: string | null
}
