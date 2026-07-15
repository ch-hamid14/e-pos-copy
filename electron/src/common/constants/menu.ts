import React from 'react'
import { MdOutlineDashboard } from 'react-icons/md'
import {
  FaCartShopping,
  FaWarehouse,
  FaWrench
} from 'react-icons/fa6'
import { GiReceiveMoney } from 'react-icons/gi'
import { IoStatsChart, IoPeopleOutline } from 'react-icons/io5'
import { Roles, Permissions } from './roles'
import { App_Routes } from './routes'
import { IMenu } from '../types'

const iconProps = { size: 18 }

export const Menus: IMenu[] = [
  {
    key: App_Routes.DASHBOARD,
    label: 'Dashboard',
    roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN, Roles.STAFF, Roles.SUPER_ADMIN],
    icon: React.createElement(MdOutlineDashboard, iconProps)
  },
  {
    key: 'setup',
    label: 'Setup',
    roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN],
    permissions: [Permissions.INVENTORY],
    icon: React.createElement(FaWrench, iconProps),
    children: [
      { key: App_Routes.SETUP_COLORS, label: 'Colors', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
      { key: App_Routes.SETUP_SUPPLIERS, label: 'Suppliers', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
      { key: App_Routes.SETUP_CATEGORIES, label: 'Categories', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
      { key: App_Routes.SETUP_PRODUCTS, label: 'Products', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
      { key: App_Routes.SETUP_PARTS, label: 'Parts', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] }
    ]
  },
  {
    key: 'inventory',
    label: 'Inventory',
    roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN],
    permissions: [Permissions.INVENTORY],
    icon: React.createElement(FaWarehouse, iconProps),
    children: [
      { key: App_Routes.ADD_PURCHASE, label: 'Add Purchase', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
      { key: App_Routes.PURCHASE_LIST, label: 'Purchase List', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
      { key: App_Routes.STOCK, label: 'Stock', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
      // { key: App_Routes.TRANSFERS, label: 'Transfer', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
      // { key: App_Routes.ADJUSTMENTS, label: 'Adjustment', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] }
    ]
  },
  {
    key: App_Routes.CUSTOMERS,
    label: 'Customers',
    roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN, Roles.STAFF],
    permissions: [Permissions.CUSTOMERS],
    icon: React.createElement(IoPeopleOutline, iconProps)
  },
  {
    key: 'sales',
    label: 'Sale',
    roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN, Roles.STAFF],
    permissions: [Permissions.SALES],
    icon: React.createElement(FaCartShopping, iconProps),
    children: [
      { key: App_Routes.NEW_SALE, label: 'New Sale', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN, Roles.STAFF] },
      { key: App_Routes.SALES_LIST, label: 'Sales List', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN, Roles.STAFF] },
      { key: App_Routes.DUE_SALES, label: 'Due Sales', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN, Roles.STAFF] }
    ]
  },
  {
    key: 'finance',
    label: 'Finance',
    roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN],
    permissions: [Permissions.FINANCE],
    icon: React.createElement(GiReceiveMoney, iconProps),
    children: [
      { key: App_Routes.EXPENSE_CATEGORIES, label: 'Expense Categories', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
      { key: App_Routes.EXPENSES, label: 'Expense Management', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] }
    ]
  },
  {
    key: 'reports',
    label: 'Reports',
    roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN],
    permissions: [Permissions.REPORTS],
    icon: React.createElement(IoStatsChart, iconProps),
    children: [
      // { key: App_Routes.SALES_REPORTS, label: 'Sale Reports', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
      // { key: App_Routes.PURCHASE_REPORTS, label: 'Purchase Reports', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] },
      { key: App_Routes.CUSTOMER_REPORTS, label: 'Customer Reports', roles: [Roles.COMPANY_OWNER, Roles.BRANCH_ADMIN] }
    ]
  }
]
