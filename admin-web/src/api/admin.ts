import { api } from './client'
import type { Company, CompanyDetail, CompanyRole, CompanyUser, Overview, Permission } from '../types'

export function getOverview(token: string) {
  return api<Overview>('/admin/overview', { token })
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
