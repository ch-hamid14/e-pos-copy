import { api } from './client'
import type {
  AuditLog,
  BusinessAnalytics,
  BusinessCustomerRow,
  BusinessFilterOptions,
  BusinessListResult,
  BusinessPurchaseRow,
  BusinessSaleRow,
  Company,
  CompanyDetail,
  CompanyOps,
  CompanyRole,
  CompanyUser,
  DataBrowseResult,
  MigrateAllResult,
  Overview,
  Permission,
  SnapshotInfo,
  SyncConflict,
  SyncQueueItem
} from '../types'

export function getOverview(token: string) {
  return api<Overview>('/admin/overview', { token })
}

export function listAuditLogs(token: string, params?: { companyId?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.companyId) q.set('companyId', params.companyId)
  if (params?.limit) q.set('limit', String(params.limit))
  const suffix = q.toString() ? `?${q}` : ''
  return api<AuditLog[]>(`/admin/audit${suffix}`, { token })
}

export function listCompanies(token: string) {
  return api<Company[]>('/admin/companies', { token })
}

export function createCompany(token: string, data: Record<string, unknown>) {
  return api('/admin/companies', { method: 'POST', token, body: JSON.stringify(data) })
}

export function getCompany(token: string, id: string) {
  return api<CompanyDetail>(`/admin/companies/${id}`, { token })
}

export function updateCompany(token: string, id: string, data: Record<string, unknown>) {
  return api<Company>(`/admin/companies/${id}`, { method: 'PATCH', token, body: JSON.stringify(data) })
}

export function updateCompanySettings(token: string, id: string, data: Record<string, unknown>) {
  return api<Company>(`/admin/companies/${id}/settings`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(data)
  })
}

export function createBranch(token: string, companyId: string, data: { name: string; location?: string }) {
  return api(`/admin/companies/${companyId}/branches`, {
    method: 'POST',
    token,
    body: JSON.stringify(data)
  })
}

export function createUser(token: string, companyId: string, data: Record<string, unknown>) {
  return api<CompanyUser>(`/admin/companies/${companyId}/users`, {
    method: 'POST',
    token,
    body: JSON.stringify(data)
  })
}

export function updateUser(token: string, userId: string, data: Record<string, unknown>) {
  return api<CompanyUser>(`/admin/users/${userId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(data)
  })
}

export function createRole(token: string, companyId: string, data: Record<string, unknown>) {
  return api<CompanyRole>(`/admin/companies/${companyId}/roles`, {
    method: 'POST',
    token,
    body: JSON.stringify(data)
  })
}

export function updateRole(token: string, roleId: string, data: Record<string, unknown>) {
  return api<CompanyRole>(`/admin/roles/${roleId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(data)
  })
}

export function listPermissions(token: string) {
  return api<Permission[]>('/admin/permissions', { token })
}

export function getCompanyOps(token: string, id: string) {
  return api<CompanyOps>(`/admin/companies/${id}/ops`, { token })
}

export function migrateCompany(token: string, id: string) {
  return api(`/admin/companies/${id}/migrate`, { method: 'POST', token })
}

export function migrateAllCompanies(token: string) {
  return api<MigrateAllResult>('/admin/companies/migrate-all', { method: 'POST', token })
}

export function reseedPermissions(token: string, id: string) {
  return api(`/admin/companies/${id}/reseed-permissions`, { method: 'POST', token })
}

export function bootstrapSync(token: string, id: string) {
  return api(`/admin/companies/${id}/bootstrap-sync`, { method: 'POST', token })
}

export function rebuildSyncFromLive(token: string, companyId: string) {
  return api<{ companyId: string; enqueued: Record<string, number> }>(
    `/admin/companies/${companyId}/rebuild-sync-from-live`,
    { method: 'POST', token }
  )
}

export function unbindDevice(token: string, companyId: string, deviceId: string) {
  return api(`/admin/companies/${companyId}/devices/${deviceId}`, { method: 'DELETE', token })
}

export function unbindAllDevices(token: string, companyId: string) {
  return api(`/admin/companies/${companyId}/unbind-all-devices`, { method: 'POST', token })
}

export function forcePosRemoteCleanup(token: string, companyId: string) {
  return api<{
    ok: boolean
    companyId: string
    devicesUnbound: boolean
    syncRebuilt: boolean
    enqueued: Record<string, number>
    previousEpoch: number
    dataEpoch: number
  }>(`/admin/companies/${companyId}/force-pos-cleanup`, { method: 'POST', token })
}

export function deleteCompany(token: string, id: string, confirmName: string) {
  return api(`/admin/companies/${id}`, {
    method: 'DELETE',
    token,
    body: JSON.stringify({ confirmName })
  })
}

export function flushCompany(token: string, id: string, confirmName: string) {
  return api<{
    ok: boolean
    companyId: string
    snapshot: SnapshotInfo & { tableCount?: number; rowCount?: number }
    restored: Record<string, number>
    branchCount: number
    enqueued: Record<string, number>
    devicesUnbound: boolean
  }>(`/admin/companies/${id}/flush`, {
    method: 'POST',
    token,
    body: JSON.stringify({ confirmName })
  })
}

export function cloneCompany(token: string, id: string, name?: string) {
  return api<Company>(`/admin/companies/${id}/clone`, {
    method: 'POST',
    token,
    body: JSON.stringify({ name })
  })
}

export function resetUserPassword(token: string, companyId: string, userId: string, password: string) {
  return api(`/admin/companies/${companyId}/users/${userId}/reset-password`, {
    method: 'POST',
    token,
    body: JSON.stringify({ password })
  })
}

export function listSnapshots(token: string, companyId: string) {
  return api<SnapshotInfo[]>(`/admin/companies/${companyId}/snapshots`, { token })
}

export function createSnapshot(token: string, companyId: string) {
  return api<SnapshotInfo>(`/admin/companies/${companyId}/snapshots`, { method: 'POST', token })
}

export function restoreSnapshot(token: string, companyId: string, filename: string) {
  return api(`/admin/companies/${companyId}/snapshots/restore`, {
    method: 'POST',
    token,
    body: JSON.stringify({ filename })
  })
}

export function listConflicts(
  token: string,
  companyId: string,
  params?: { page?: number; pageSize?: number }
) {
  const q = new URLSearchParams()
  if (params?.page) q.set('page', String(params.page))
  if (params?.pageSize) q.set('pageSize', String(params.pageSize))
  const suffix = q.toString() ? `?${q}` : ''
  return api<{
    conflicts: SyncConflict[]
    total: number
    page: number
    pageSize: number
  }>(`/admin/companies/${companyId}/conflicts${suffix}`, { token })
}

export function getConflictDetail(token: string, companyId: string, conflictId: string) {
  return api<SyncConflict>(`/admin/companies/${companyId}/conflicts/${conflictId}`, { token })
}

export function dismissConflict(token: string, companyId: string, conflictId: string) {
  return api(`/admin/companies/${companyId}/conflicts/${conflictId}/dismiss`, {
    method: 'POST',
    token
  })
}

export function dismissConflicts(token: string, companyId: string, ids?: string[]) {
  return api<{ dismissed: number }>(`/admin/companies/${companyId}/conflicts/bulk-dismiss`, {
    method: 'POST',
    token,
    body: JSON.stringify(ids ? { ids } : {})
  })
}

export function applyConflictLoser(token: string, companyId: string, conflictId: string) {
  return api(`/admin/companies/${companyId}/conflicts/${conflictId}/apply-loser`, {
    method: 'POST',
    token
  })
}

export function applyConflictLosers(token: string, companyId: string, ids: string[]) {
  return api<{ applied: number; failed: Array<{ id: string; error: string }> }>(
    `/admin/companies/${companyId}/conflicts/bulk-apply-loser`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({ ids })
    }
  )
}

export function listSyncQueue(
  token: string,
  companyId: string,
  params?: { page?: number; pageSize?: number }
) {
  const q = new URLSearchParams()
  if (params?.page) q.set('page', String(params.page))
  if (params?.pageSize) q.set('pageSize', String(params.pageSize))
  const suffix = q.toString() ? `?${q}` : ''
  return api<{
    items: SyncQueueItem[]
    total: number
    page: number
    pageSize: number
  }>(`/admin/companies/${companyId}/sync-queue${suffix}`, { token })
}

export function deleteSyncQueueItem(token: string, companyId: string, itemId: string) {
  return api(`/admin/companies/${companyId}/sync-queue/${itemId}`, { method: 'DELETE', token })
}

export function clearSyncQueue(token: string, companyId: string) {
  return api(`/admin/companies/${companyId}/sync-queue`, { method: 'DELETE', token })
}

export function listDataTables(token: string) {
  return api<string[]>('/admin/data-tables', { token })
}

export function browseData(
  token: string,
  companyId: string,
  table: string,
  params?: { page?: number; pageSize?: number; search?: string; includeDeleted?: boolean }
) {
  const q = new URLSearchParams()
  if (params?.page) q.set('page', String(params.page))
  if (params?.pageSize) q.set('pageSize', String(params.pageSize))
  if (params?.search) q.set('search', params.search)
  if (params?.includeDeleted) q.set('includeDeleted', '1')
  const suffix = q.toString() ? `?${q}` : ''
  return api<DataBrowseResult>(`/admin/companies/${companyId}/data/${table}${suffix}`, { token })
}

export function updateDataRow(
  token: string,
  companyId: string,
  table: string,
  rowId: string,
  patch: Record<string, unknown>
) {
  return api(`/admin/companies/${companyId}/data/${table}/${rowId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(patch)
  })
}

export type SaleReconcileResult = {
  saleId: string
  lineCount: number
  paymentCount: number
  netTotal: number
  paidAmount: number
  dueAmount: number
  excessCredit: number
  adjustments: Array<{
    customerId: string
    type: 'sale_debit' | 'payment_credit'
    amount: number
  }>
}

export function reconcileSaleFinances(token: string, companyId: string, saleId: string) {
  return api<SaleReconcileResult>(`/admin/companies/${companyId}/sales/${saleId}/reconcile`, {
    method: 'POST',
    token
  })
}

export function softDeleteDataRow(token: string, companyId: string, table: string, rowId: string) {
  return api(`/admin/companies/${companyId}/data/${table}/${rowId}/soft-delete`, {
    method: 'POST',
    token
  })
}

export function restoreDataRow(token: string, companyId: string, table: string, rowId: string) {
  return api(`/admin/companies/${companyId}/data/${table}/${rowId}/restore`, {
    method: 'POST',
    token
  })
}

export function hardDeleteDataRow(token: string, companyId: string, table: string, rowId: string) {
  return api(`/admin/companies/${companyId}/data/${table}/${rowId}`, {
    method: 'DELETE',
    token
  })
}

export function getBusinessDashboard(
  token: string,
  companyId: string,
  params?: {
    from?: string
    to?: string
    branchId?: string
    supplierId?: string
    productId?: string
    partId?: string
  }
) {
  const q = new URLSearchParams()
  if (params?.from) q.set('from', params.from)
  if (params?.to) q.set('to', params.to)
  if (params?.branchId) q.set('branchId', params.branchId)
  if (params?.supplierId) q.set('supplierId', params.supplierId)
  if (params?.productId) q.set('productId', params.productId)
  if (params?.partId) q.set('partId', params.partId)
  const suffix = q.toString() ? `?${q}` : ''
  return api<BusinessAnalytics>(`/admin/companies/${companyId}/business/dashboard${suffix}`, {
    token
  })
}

export function getBusinessFilterOptions(token: string, companyId: string) {
  return api<BusinessFilterOptions>(`/admin/companies/${companyId}/business/filters`, { token })
}

export function listBusinessSales(
  token: string,
  companyId: string,
  params?: {
    page?: number
    pageSize?: number
    search?: string
    fromDate?: string
    toDate?: string
    visibility?: 'active' | 'include' | 'only'
  }
) {
  const q = new URLSearchParams()
  if (params?.page) q.set('page', String(params.page))
  if (params?.pageSize) q.set('pageSize', String(params.pageSize))
  if (params?.search) q.set('search', params.search)
  if (params?.fromDate) q.set('fromDate', params.fromDate)
  if (params?.toDate) q.set('toDate', params.toDate)
  if (params?.visibility) q.set('visibility', params.visibility)
  const suffix = q.toString() ? `?${q}` : ''
  return api<BusinessListResult<BusinessSaleRow>>(
    `/admin/companies/${companyId}/business/sales${suffix}`,
    { token }
  )
}

export function listBusinessDues(
  token: string,
  companyId: string,
  params?: { page?: number; pageSize?: number; search?: string }
) {
  const q = new URLSearchParams()
  if (params?.page) q.set('page', String(params.page))
  if (params?.pageSize) q.set('pageSize', String(params.pageSize))
  if (params?.search) q.set('search', params.search)
  const suffix = q.toString() ? `?${q}` : ''
  return api<BusinessListResult<BusinessSaleRow>>(
    `/admin/companies/${companyId}/business/dues${suffix}`,
    { token }
  )
}

export function getBusinessSale(token: string, companyId: string, saleId: string) {
  return api<{
    sale: Record<string, unknown>
    lines: Record<string, unknown>[]
    payments: Record<string, unknown>[]
    ledger: Record<string, unknown>[]
    impact: {
      canVoid: boolean
      blockers: string[]
      productUnits: unknown[]
      partLines: unknown[]
      paymentTotal: number
      netTotal: number
      dueAmount: number
      note: string
    }
  }>(`/admin/companies/${companyId}/business/sales/${saleId}`, { token })
}

export function voidBusinessSale(
  token: string,
  companyId: string,
  saleId: string,
  body: { reason: string; purge?: boolean }
) {
  return api(`/admin/companies/${companyId}/business/sales/${saleId}/void`, {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  })
}

export function repairBusinessSaleLedger(token: string, companyId: string, saleId: string) {
  return api<{
    saleId: string
    repaired: boolean
    adjustments: Array<{ customerId: string; type: string; amount: number }>
    message: string
  }>(`/admin/companies/${companyId}/business/sales/${saleId}/repair-ledger`, {
    method: 'POST',
    token
  })
}

export function updateBusinessSalePayment(
  token: string,
  companyId: string,
  paymentId: string,
  body: { amount: number; method?: string; paymentDate?: string }
) {
  return api<{
    paymentId: string
    saleId: string
    paidAmount: number
    dueAmount: number
    removed: boolean
  }>(`/admin/companies/${companyId}/business/sales/payments/${paymentId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(body)
  })
}

export function updateBusinessPurchasePayment(
  token: string,
  companyId: string,
  paymentId: string,
  kind: 'product' | 'part',
  body: { amount: number; method?: string; paymentDate?: string }
) {
  const path =
    kind === 'part'
      ? `/admin/companies/${companyId}/business/part-purchases/payments/${paymentId}`
      : `/admin/companies/${companyId}/business/purchases/payments/${paymentId}`
  return api<{
    paymentId: string
    purchaseId: string
    kind: string
    paidAmount: number
    dueAmount: number
    removed: boolean
  }>(path, {
    method: 'PUT',
    token,
    body: JSON.stringify(body)
  })
}

export function repairAllVoidedSaleLedgers(token: string, companyId: string) {
  return api<{
    scanned: number
    repaired: number
    results: Array<{ saleId: string; adjustments: unknown[] }>
  }>(`/admin/companies/${companyId}/business/repair-voided-ledgers`, {
    method: 'POST',
    token
  })
}

export function backfillPurchaseApLedgers(token: string, companyId: string) {
  return api<{
    scanned: number
    repaired: number
    skipped: number
    results: Array<{
      purchaseId: string
      kind: string
      repaired: boolean
      message: string
      posted: Array<{ type: string; amount: number }>
    }>
  }>(`/admin/companies/${companyId}/business/repair-purchase-ledgers`, {
    method: 'POST',
    token
  })
}

export function repairBusinessPurchaseLedger(
  token: string,
  companyId: string,
  purchaseId: string,
  kind: 'product' | 'part'
) {
  const path =
    kind === 'part'
      ? `/admin/companies/${companyId}/business/part-purchases/${purchaseId}/repair-ledger`
      : `/admin/companies/${companyId}/business/purchases/${purchaseId}/repair-ledger`
  return api<{
    purchaseId: string
    kind: string
    repaired: boolean
    skipped: boolean
    message: string
    posted: Array<{ type: string; amount: number }>
  }>(path, {
    method: 'POST',
    token
  })
}

export function listBusinessPurchases(
  token: string,
  companyId: string,
  params?: {
    page?: number
    pageSize?: number
    search?: string
    kind?: string
    fromDate?: string
    toDate?: string
    visibility?: 'active' | 'include' | 'only'
  }
) {
  const q = new URLSearchParams()
  if (params?.page) q.set('page', String(params.page))
  if (params?.pageSize) q.set('pageSize', String(params.pageSize))
  if (params?.search) q.set('search', params.search)
  if (params?.kind) q.set('kind', params.kind)
  if (params?.fromDate) q.set('fromDate', params.fromDate)
  if (params?.toDate) q.set('toDate', params.toDate)
  if (params?.visibility) q.set('visibility', params.visibility)
  const suffix = q.toString() ? `?${q}` : ''
  return api<BusinessListResult<BusinessPurchaseRow>>(
    `/admin/companies/${companyId}/business/purchases${suffix}`,
    { token }
  )
}

export function getBusinessPurchase(token: string, companyId: string, purchaseId: string) {
  return api<{
    kind: 'product'
    purchase: Record<string, unknown>
    items: Record<string, unknown>[]
    impact: { canVoid: boolean; blockers: string[]; inStockCount: number; totalUnits: number }
  }>(`/admin/companies/${companyId}/business/purchases/${purchaseId}`, { token })
}

export function getBusinessPartPurchase(token: string, companyId: string, purchaseId: string) {
  return api<{
    kind: 'part'
    purchase: Record<string, unknown>
    lines: Record<string, unknown>[]
    impact: { canVoid: boolean; blockers: string[]; lineCount: number }
  }>(`/admin/companies/${companyId}/business/part-purchases/${purchaseId}`, { token })
}

export function voidBusinessPurchase(
  token: string,
  companyId: string,
  purchaseId: string,
  body: { reason: string }
) {
  return api(`/admin/companies/${companyId}/business/purchases/${purchaseId}/void`, {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  })
}

export function voidBusinessPartPurchase(
  token: string,
  companyId: string,
  purchaseId: string,
  body: { reason: string }
) {
  return api(`/admin/companies/${companyId}/business/part-purchases/${purchaseId}/void`, {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  })
}

export function listBusinessCustomers(
  token: string,
  companyId: string,
  params?: {
    page?: number
    pageSize?: number
    search?: string
    dueFilter?: string
    visibility?: 'active' | 'include' | 'only'
  }
) {
  const q = new URLSearchParams()
  if (params?.page) q.set('page', String(params.page))
  if (params?.pageSize) q.set('pageSize', String(params.pageSize))
  if (params?.search) q.set('search', params.search)
  if (params?.dueFilter) q.set('dueFilter', params.dueFilter)
  if (params?.visibility) q.set('visibility', params.visibility)
  const suffix = q.toString() ? `?${q}` : ''
  return api<BusinessListResult<BusinessCustomerRow>>(
    `/admin/companies/${companyId}/business/customers${suffix}`,
    { token }
  )
}

export function getBusinessCustomer(token: string, companyId: string, customerId: string) {
  return api<{
    customer: BusinessCustomerRow & Record<string, unknown>
    ledger: Record<string, unknown>[]
    recentSales: Record<string, unknown>[]
    openDues: { count: number; total: number }
  }>(`/admin/companies/${companyId}/business/customers/${customerId}`, { token })
}

export function updateBusinessCustomer(
  token: string,
  companyId: string,
  customerId: string,
  patch: { name?: string; phone?: string; cnic?: string; address?: string }
) {
  return api<BusinessCustomerRow>(`/admin/companies/${companyId}/business/customers/${customerId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(patch)
  })
}

export function softDeleteBusinessCustomer(token: string, companyId: string, customerId: string) {
  return api(`/admin/companies/${companyId}/business/customers/${customerId}/soft-delete`, {
    method: 'POST',
    token
  })
}

export function setBusinessCustomerOutstanding(
  token: string,
  companyId: string,
  customerId: string,
  body: { outstanding: number; reason: string }
) {
  return api<{
    customerId: string
    previous: number
    outstanding: number
    adjusted: boolean
    adjustment: { type: string; amount: number; referenceId?: string } | null
    reason: string
  }>(`/admin/companies/${companyId}/business/customers/${customerId}/set-outstanding`, {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  })
}
