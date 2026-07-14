import { Channels } from '@/common'
import { ipcCall } from './ipc'
import type { SessionAudit } from './session-audit'
import { auditBody, auditQuery } from './session-audit'

function masterDataAPI(channel: Channels) {
  return {
    list: (companyId: string, search?: string) =>
      ipcCall(`GET:${channel}`, { query: { companyId, search } }),
    create: (
      companyId: string,
      audit: SessionAudit,
      data: { name: string; phone?: string; address?: string; discount?: number; discountType?: string }
    ) => ipcCall(`POST:${channel}`, { body: auditBody(audit, { companyId, data }) }),
    update: (
      id: string,
      companyId: string,
      audit: SessionAudit,
      data: { name?: string; phone?: string; address?: string; discount?: number; discountType?: string }
    ) =>
      ipcCall(`PUT:${channel}`, { params: { id }, body: auditBody(audit, { companyId, ...data }) }),
    remove: (id: string, companyId: string, audit: SessionAudit) =>
      ipcCall(`DELETE:${channel}`, { params: { id }, body: auditBody(audit, { companyId }) })
  }
}

export const colorAPI = masterDataAPI(Channels.COLORS)
export const supplierAPI = masterDataAPI(Channels.SUPPLIERS)
export const categoryAPI = masterDataAPI(Channels.CATEGORIES)

export const productAPI = {
  list: (companyId: string, search?: string, categoryId?: string) =>
    ipcCall(`GET:${Channels.PRODUCTS}`, { query: { companyId, search, categoryId } }),
  create: (companyId: string, audit: SessionAudit, data: Record<string, unknown>) =>
    ipcCall(`POST:${Channels.PRODUCTS}`, { body: auditBody(audit, { companyId, data }) }),
  update: (id: string, companyId: string, audit: SessionAudit, data: Record<string, unknown>) =>
    ipcCall(`PUT:${Channels.PRODUCTS}`, { params: { id }, body: auditBody(audit, { companyId, data }) }),
  remove: (id: string, companyId: string, audit: SessionAudit) =>
    ipcCall(`DELETE:${Channels.PRODUCTS}`, { params: { id }, body: auditBody(audit, { companyId }) })
}

export const branchAPI = {
  list: (companyId: string) => ipcCall(`GET:${Channels.BRANCHES}`, { query: { companyId } })
}

export const purchaseAPI = {
  list: (
    companyId: string,
    branchId: string,
    filters?: {
      supplierId?: string
      search?: string
      fromDate?: string
      toDate?: string
      sortField?: string
      sortOrder?: 'asc' | 'desc'
    }
  ) => ipcCall(`GET:${Channels.PURCHASES}`, { query: { companyId, branchId, ...filters } }),
  create: (
    companyId: string,
    branchId: string,
    audit: SessionAudit,
    payload: Record<string, unknown>
  ) => ipcCall(`POST:${Channels.PURCHASES}`, { body: auditBody(audit, { companyId, branchId, payload }) }),
  update: (
    id: string,
    companyId: string,
    branchId: string,
    audit: SessionAudit,
    payload: Record<string, unknown>
  ) =>
    ipcCall(`PUT:${Channels.PURCHASES}`, {
      params: { id },
      body: auditBody(audit, { companyId, branchId, payload })
    }),
  get: (id: string) => ipcCall(`GET:${Channels.PURCHASES}:detail`, { params: { id } })
}

export const inventoryAPI = {
  list: (companyId: string, branchId: string, filters?: Record<string, unknown>) =>
    ipcCall(`GET:${Channels.PRODUCT_ITEMS}`, { query: { companyId, branchId, ...filters } }),
  search: (companyId: string, branchId: string, query: string) =>
    ipcCall(`GET:${Channels.INVENTORY}:search`, { query: { companyId, branchId, query } }),
  detail: (id: string) => ipcCall(`GET:${Channels.INVENTORY}:detail`, { params: { id } }),
  transfer: (companyId: string, audit: SessionAudit, payload: Record<string, unknown>) =>
    ipcCall(`POST:${Channels.TRANSFERS}`, { body: auditBody(audit, { companyId, payload }) }),
  adjust: (companyId: string, audit: SessionAudit, payload: Record<string, unknown>) =>
    ipcCall(`POST:${Channels.INVENTORY}:adjust`, { body: auditBody(audit, { companyId, payload }) })
}

export const saleAPI = {
  list: (
    companyId: string,
    branchId: string,
    filters?: {
      customerId?: string
      fromDate?: string
      toDate?: string
      billNo?: string
      search?: string
      sortField?: 'netTotal' | 'paidAmount' | 'dueAmount'
      sortOrder?: 'asc' | 'desc'
    }
  ) => ipcCall(`GET:${Channels.SALES}`, { query: { companyId, branchId, ...filters } }),
  due: (companyId: string, branchId: string) =>
    ipcCall(`GET:${Channels.SALES}:due`, { query: { companyId, branchId } }),
  get: (id: string) => ipcCall(`GET:${Channels.SALES}:detail`, { params: { id } }),
  create: (
    companyId: string,
    branchId: string,
    audit: SessionAudit,
    payload: Record<string, unknown>
  ) => ipcCall(`POST:${Channels.SALES}`, { body: auditBody(audit, { companyId, branchId, payload }) }),
  recordPayment: (companyId: string, audit: SessionAudit, payload: Record<string, unknown>) =>
    ipcCall(`POST:${Channels.SALES}:payment`, { body: auditBody(audit, { companyId, payload }) })
}

export const customerAPI = {
  list: (
    companyId: string,
    search?: string,
    sortField?: string,
    sortOrder?: 'asc' | 'desc',
    dueFilter?: 'due' | 'not_due'
  ) =>
    ipcCall(`GET:${Channels.CUSTOMERS}`, { query: { companyId, search, sortField, sortOrder, dueFilter } }),
  create: (
    companyId: string,
    audit: SessionAudit,
    data: { name: string; phone?: string; cnic?: string; address?: string; openingBalance?: number }
  ) => ipcCall(`POST:${Channels.CUSTOMERS}`, { body: auditBody(audit, { companyId, data }) }),
  update: (
    id: string,
    companyId: string,
    audit: SessionAudit,
    data: { name?: string; phone?: string; cnic?: string; address?: string }
  ) =>
    ipcCall(`PUT:${Channels.CUSTOMERS}`, { params: { id }, body: auditBody(audit, { companyId, data }) }),
  remove: (id: string, companyId: string, audit: SessionAudit) =>
    ipcCall(`DELETE:${Channels.CUSTOMERS}`, { params: { id }, body: auditBody(audit, { companyId }) }),
  ledger: (customerId: string) =>
    ipcCall(`GET:${Channels.CUSTOMERS}:ledger`, { params: { id: customerId } })
}

export const expenseAPI = {
  list: (companyId: string, branchId: string, audit: SessionAudit, from?: string, to?: string) =>
    ipcCall(`GET:${Channels.EXPENSES}`, { query: { companyId, branchId, from, to, ...auditQuery(audit) } }),
  create: (
    companyId: string,
    branchId: string,
    audit: SessionAudit,
    payload: Record<string, unknown>
  ) => ipcCall(`POST:${Channels.EXPENSES}`, { body: auditBody(audit, { companyId, branchId, payload }) }),
  remove: (id: string, companyId: string, audit: SessionAudit) =>
    ipcCall(`DELETE:${Channels.EXPENSES}`, { params: { id }, body: auditBody(audit, { companyId }) }),
  categories: (companyId: string) =>
    ipcCall(`GET:${Channels.EXPENSES}:categories`, { query: { companyId } }),
  createCategory: (companyId: string, audit: SessionAudit, name: string) =>
    ipcCall(`POST:${Channels.EXPENSES}:categories`, { body: auditBody(audit, { companyId, name }) }),
  updateCategory: (id: string, companyId: string, name: string) =>
    ipcCall(`PUT:${Channels.EXPENSES}:categories`, { params: { id }, body: { companyId, name } }),
  removeCategory: (id: string, companyId: string, audit: SessionAudit) =>
    ipcCall(`DELETE:${Channels.EXPENSES}:categories`, { params: { id }, body: auditBody(audit, { companyId }) })
}

export const dashboardAPI = {
  analytics: (
    companyId: string,
    branchId: string,
    filters?: { from?: string; to?: string; supplierId?: string; productId?: string }
  ) =>
    ipcCall(`GET:${Channels.DASHBOARD}`, { query: { companyId, branchId, ...filters } })
}

export const reportAPI = {
  sales: (
    companyId: string,
    branchId: string,
    filters?: {
      from?: string
      to?: string
      customerId?: string
      search?: string
      sortField?: string
      sortOrder?: string
    }
  ) =>
    ipcCall(`GET:${Channels.REPORTS}:sales`, {
      query: { companyId, branchId, ...filters }
    }),
  purchases: (
    companyId: string,
    branchId: string,
    filters?: {
      from?: string
      to?: string
      supplierId?: string
      search?: string
      sortField?: string
      sortOrder?: string
    }
  ) =>
    ipcCall(`GET:${Channels.REPORTS}:purchases`, {
      query: { companyId, branchId, ...filters }
    }),
  customers: (
    companyId: string,
    filters?: {
      from?: string
      to?: string
      search?: string
      sortField?: string
      sortOrder?: string
    }
  ) =>
    ipcCall(`GET:${Channels.REPORTS}:customers`, {
      query: { companyId, ...filters }
    }),
  customerDetail: (companyId: string, customerId: string) =>
    ipcCall(`GET:${Channels.REPORTS}:customers:detail`, { params: { id: customerId }, query: { companyId } })
}

export const printAPI = {
  downloadSaleInvoice: (fileName: string, html: string) =>
    ipcCall<{ saved: boolean; filePath?: string }>(`POST:${Channels.PRINT}:sale-invoice`, {
      body: { fileName, html }
    }),
  downloadThermalReceipt: (fileName: string, html: string) =>
    ipcCall<{ saved: boolean; filePath?: string }>(`POST:${Channels.PRINT}:thermal-receipt`, {
      body: { fileName, html }
    })
}
