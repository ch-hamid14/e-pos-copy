import { Roles, Permissions } from '../constants'

export type IObject = {
  [key: string | number]: unknown
}

export type IServerResponse<T = unknown> = {
  data: T | null
  error: {
    message: string
    error: unknown
  } | null
}

export type IRequest = {
  params?: IObject
  query?: IObject
  body?: IObject
}

export type IMenu = {
  key: string
  label: string
  roles: `${Roles}`[]
  permissions?: `${Permissions}`[]
  icon?: React.ReactNode
  children?: IMenu[]
}

export type ICompany = {
  id: string
  name: string
  email: string
  phone: string
  status: string
  createdAt: string
}

export type IBranch = {
  id: string
  companyId: string
  name: string
  location: string
  isActive: boolean
}

export type IUser = {
  id: string
  companyId: string
  branchId: string | null
  email: string
  firstName: string
  lastName: string
  password?: string
  role: `${Roles}`
  permissions: string[]
  token?: string
  createdAt: string
  updatedAt: string
}

export type IColor = {
  id: string
  companyId: string
  name: string
  createdAt: string
  updatedAt: string
}

export type ISupplier = {
  id: string
  companyId: string
  name: string
  phone?: string
  address?: string
  createdAt: string
  updatedAt: string
}

export type ICategory = {
  id: string
  companyId: string
  name: string
  createdAt: string
  updatedAt: string
}

export type IProduct = {
  id: string
  companyId: string
  categoryId: string
  name: string
  description?: string
  defaultPurchasePrice: number
  defaultSalePrice: number
  createdAt: string
  updatedAt: string
}

export type IProductItem = {
  id: string
  companyId: string
  branchId: string
  currentBranchId: string
  purchaseId?: string
  productId: string
  categoryId: string
  colorId?: string
  motorNumber?: string
  serialNumber: string
  purchasePrice: number
  sellingPrice: number
  status: string
  warrantyActive: boolean
  warrantyExpiryDate?: string
  purchasedAt?: string
  soldAt?: string
  version: number
  createdAt: string
  updatedAt: string
}

export type ICustomer = {
  id: string
  companyId: string
  name: string
  phone?: string
  cnic?: string
  address?: string
  balance?: number
  createdAt: string
  updatedAt: string
}

export type ISale = {
  id: string
  companyId: string
  branchId: string
  customerId: string
  saleDate: string
  subtotal: number
  discount: number
  totalTax: number
  totalWht: number
  netTotal: number
  paidAmount: number
  dueAmount: number
  dueReminderDate?: string
  status: string
  createdAt: string
}

export type IDashboardMetrics = {
  todaySales: number
  todayPurchases: number
  todayPurchaseTotal: number
  outstandingBalance: number
  inventoryValue: number
  expenses: number
  profitLoss: number
  inStockCount: number
}
