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
  usersCount: number
  branchesCount: number
  companies: Company[]
}
