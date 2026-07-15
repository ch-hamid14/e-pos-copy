import { App_Routes, Roles } from '@/common'
import { lazy } from 'react'

export const LazyPages = {
  AuthLayout: lazy(() => import('@/renderer/layouts').then((m) => ({ default: m.AuthLayout }))),
  AppLayout: lazy(() => import('@/renderer/layouts').then((m) => ({ default: m.AppLayout }))),
  Login: lazy(() => import('@/renderer/pages/login').then((m) => ({ default: m.Login }))),
  Logout: lazy(() => import('@/renderer/pages/logout').then((m) => ({ default: m.Logout }))),
  NotFound: lazy(() => import('@/renderer/pages/not-found').then((m) => ({ default: m.NotFound }))),
  Dashboard: lazy(() => import('@/renderer/pages/dashboard').then((m) => ({ default: m.Dashboard }))),
  Colors: lazy(() => import('@/renderer/pages/setup/Colors').then((m) => ({ default: m.Colors }))),
  Suppliers: lazy(() => import('@/renderer/pages/setup/Suppliers').then((m) => ({ default: m.Suppliers }))),
  Categories: lazy(() => import('@/renderer/pages/setup/Categories').then((m) => ({ default: m.Categories }))),
  Products: lazy(() => import('@/renderer/pages/setup/Products').then((m) => ({ default: m.Products }))),
  Parts: lazy(() => import('@/renderer/pages/setup/Parts').then((m) => ({ default: m.Parts }))),
  Customers: lazy(() => import('@/renderer/pages/customers/Customers').then((m) => ({ default: m.Customers }))),
  AddPurchase: lazy(() => import('@/renderer/pages/inventory/AddPurchase').then((m) => ({ default: m.AddPurchase }))),
  PurchaseList: lazy(() => import('@/renderer/pages/inventory/PurchaseList').then((m) => ({ default: m.PurchaseList }))),
  PurchaseDetail: lazy(() =>
    import('@/renderer/pages/inventory/PurchaseDetail').then((m) => ({ default: m.PurchaseDetail }))
  ),
  PurchaseEdit: lazy(() => import('@/renderer/pages/inventory/AddPurchase').then((m) => ({ default: m.AddPurchase }))),
  AddPartPurchase: lazy(() =>
    import('@/renderer/pages/inventory/AddPartPurchase').then((m) => ({ default: m.AddPartPurchase }))
  ),
  PartPurchaseList: lazy(() =>
    import('@/renderer/pages/inventory/PartPurchaseList').then((m) => ({ default: m.PartPurchaseList }))
  ),
  PartPurchaseDetail: lazy(() =>
    import('@/renderer/pages/inventory/PartPurchaseDetail').then((m) => ({ default: m.PartPurchaseDetail }))
  ),
  PartPurchaseEdit: lazy(() =>
    import('@/renderer/pages/inventory/AddPartPurchase').then((m) => ({ default: m.AddPartPurchase }))
  ),
  Stock: lazy(() => import('@/renderer/pages/inventory/Stock').then((m) => ({ default: m.Stock }))),
  StockDetail: lazy(() => import('@/renderer/pages/inventory/StockDetail').then((m) => ({ default: m.StockDetail }))),
  PartStock: lazy(() => import('@/renderer/pages/inventory/PartStock').then((m) => ({ default: m.PartStock }))),
  PartStockDetail: lazy(() =>
    import('@/renderer/pages/inventory/PartStockDetail').then((m) => ({ default: m.PartStockDetail }))
  ),
  Transfer: lazy(() => import('@/renderer/pages/inventory/Transfer').then((m) => ({ default: m.Transfer }))),
  Adjustment: lazy(() => import('@/renderer/pages/inventory/Adjustment').then((m) => ({ default: m.Adjustment }))),
  NewSale: lazy(() => import('@/renderer/pages/sales/NewSale').then((m) => ({ default: m.NewSale }))),
  SalesList: lazy(() => import('@/renderer/pages/sales/SalesList').then((m) => ({ default: m.SalesList }))),
  SaleDetail: lazy(() => import('@/renderer/pages/sales/SaleDetail').then((m) => ({ default: m.SaleDetail }))),
  DueSales: lazy(() => import('@/renderer/pages/sales/DueSales').then((m) => ({ default: m.DueSales }))),
  Expenses: lazy(() => import('@/renderer/pages/finance/Expenses').then((m) => ({ default: m.Expenses }))),
  ExpenseCategories: lazy(() =>
    import('@/renderer/pages/finance/ExpenseCategories').then((m) => ({ default: m.ExpenseCategories }))
  ),
  SaleReports: lazy(() => import('@/renderer/pages/reports/SaleReports').then((m) => ({ default: m.SaleReports }))),
  PurchaseReports: lazy(() => import('@/renderer/pages/reports/PurchaseReports').then((m) => ({ default: m.PurchaseReports }))),
  CustomerReports: lazy(() => import('@/renderer/pages/reports/CustomerReports').then((m) => ({ default: m.CustomerReports }))),
  CustomerReportDetail: lazy(() =>
    import('@/renderer/pages/reports/CustomerReportDetail').then((m) => ({ default: m.CustomerReportDetail }))
  )
}

type IAppRoutes = {
  path: string
  component: React.LazyExoticComponent<() => JSX.Element | null>
  roles: `${Roles}`[]
}

export const AppRoutes: IAppRoutes[] = [
  { path: App_Routes.DASHBOARD, component: LazyPages.Dashboard, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN, Roles.STAFF, Roles.SUPER_ADMIN] },
  { path: App_Routes.SETUP_COLORS, component: LazyPages.Colors, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.SETUP_SUPPLIERS, component: LazyPages.Suppliers, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.SETUP_CATEGORIES, component: LazyPages.Categories, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.SETUP_PRODUCTS, component: LazyPages.Products, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.SETUP_PARTS, component: LazyPages.Parts, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.CUSTOMERS, component: LazyPages.Customers, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN, Roles.STAFF] },
  { path: App_Routes.ADD_PURCHASE, component: LazyPages.AddPurchase, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.PURCHASE_LIST, component: LazyPages.PurchaseList, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.PURCHASE_EDIT, component: LazyPages.PurchaseEdit, roles: [Roles.COMPANY_OWNER] },
  { path: App_Routes.PURCHASE_DETAIL, component: LazyPages.PurchaseDetail, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.ADD_PART_PURCHASE, component: LazyPages.AddPartPurchase, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.PART_PURCHASE_LIST, component: LazyPages.PartPurchaseList, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.PART_PURCHASE_EDIT, component: LazyPages.PartPurchaseEdit, roles: [Roles.COMPANY_OWNER] },
  { path: App_Routes.PART_PURCHASE_DETAIL, component: LazyPages.PartPurchaseDetail, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.STOCK, component: LazyPages.Stock, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.STOCK_DETAIL, component: LazyPages.StockDetail, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.PART_STOCK, component: LazyPages.PartStock, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.PART_STOCK_DETAIL, component: LazyPages.PartStockDetail, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.TRANSFERS, component: LazyPages.Transfer, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.ADJUSTMENTS, component: LazyPages.Adjustment, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.NEW_SALE, component: LazyPages.NewSale, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN, Roles.STAFF] },
  { path: App_Routes.SALES_LIST, component: LazyPages.SalesList, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN, Roles.STAFF] },
  { path: App_Routes.SALE_DETAIL, component: LazyPages.SaleDetail, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN, Roles.STAFF] },
  { path: App_Routes.DUE_SALES, component: LazyPages.DueSales, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN, Roles.STAFF] },
  { path: App_Routes.EXPENSES, component: LazyPages.Expenses, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  {
    path: App_Routes.EXPENSE_CATEGORIES,
    component: LazyPages.ExpenseCategories,
    roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN]
  },
  { path: App_Routes.SALES_REPORTS, component: LazyPages.SaleReports, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.PURCHASE_REPORTS, component: LazyPages.PurchaseReports, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  { path: App_Routes.CUSTOMER_REPORTS, component: LazyPages.CustomerReports, roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
  {
    path: App_Routes.CUSTOMER_REPORT_DETAIL,
    component: LazyPages.CustomerReportDetail,
    roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN]
  }
]
