import { api } from './client'
import type {
  AuditLog,
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

export function unbindDevice(token: string, companyId: string, deviceId: string) {
  return api(`/admin/companies/${companyId}/devices/${deviceId}`, { method: 'DELETE', token })
}

export function unbindAllDevices(token: string, companyId: string) {
  return api(`/admin/companies/${companyId}/unbind-all-devices`, { method: 'POST', token })
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
