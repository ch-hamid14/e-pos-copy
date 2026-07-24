import { ipcMain } from 'electron'
import { Channels } from '../../common'
import { catchIpcHandler } from './handler'
import {
  authController,
  colorController,
  supplierController,
  categoryController,
  taxController,
  productController,
  partController,
  partPurchaseController,
  partStockController,
  purchaseController,
  inventoryController,
  customerController,
  saleController,
  expenseController,
  dashboardController,
  reportController,
  branchController,
  printController,
  syncController
} from '../controllers'

ipcMain.handle(`POST:${Channels.AUTH}`, catchIpcHandler(authController.login))
ipcMain.handle(`POST:${Channels.AUTH}:continue`, catchIpcHandler(authController.continueSession))
ipcMain.handle(`POST:${Channels.AUTH}:refresh`, catchIpcHandler(authController.refreshSession))
ipcMain.handle(`GET:${Channels.AUTH}:online`, catchIpcHandler(authController.checkOnline))
ipcMain.handle(`POST:${Channels.AUTH}:ensure-online`, catchIpcHandler(authController.ensureOnline))
ipcMain.handle(`GET:${Channels.AUTH}:reauth-grace`, catchIpcHandler(authController.reauthGrace))
ipcMain.handle(`POST:${Channels.AUTH}:otp`, catchIpcHandler(authController.sendOtp))
ipcMain.handle(`POST:${Channels.AUTH}:logout`, catchIpcHandler(authController.logout))
  ipcMain.handle(`POST:${Channels.AUTH}:factory-reset`, catchIpcHandler(authController.factoryReset))

ipcMain.handle(`GET:${Channels.COLORS}`, catchIpcHandler(colorController.list))
ipcMain.handle(`POST:${Channels.COLORS}`, catchIpcHandler(colorController.create))
ipcMain.handle(`PUT:${Channels.COLORS}`, catchIpcHandler(colorController.update))
ipcMain.handle(`DELETE:${Channels.COLORS}`, catchIpcHandler(colorController.remove))

ipcMain.handle(`GET:${Channels.SUPPLIERS}`, catchIpcHandler(supplierController.list))
ipcMain.handle(`POST:${Channels.SUPPLIERS}`, catchIpcHandler(supplierController.create))
ipcMain.handle(`PUT:${Channels.SUPPLIERS}`, catchIpcHandler(supplierController.update))
ipcMain.handle(`DELETE:${Channels.SUPPLIERS}`, catchIpcHandler(supplierController.remove))

ipcMain.handle(`GET:${Channels.CATEGORIES}`, catchIpcHandler(categoryController.list))
ipcMain.handle(`POST:${Channels.CATEGORIES}`, catchIpcHandler(categoryController.create))
ipcMain.handle(`PUT:${Channels.CATEGORIES}`, catchIpcHandler(categoryController.update))
ipcMain.handle(`DELETE:${Channels.CATEGORIES}`, catchIpcHandler(categoryController.remove))

ipcMain.handle(`GET:${Channels.TAXES}`, catchIpcHandler(taxController.list))
ipcMain.handle(`POST:${Channels.TAXES}`, catchIpcHandler(taxController.create))
ipcMain.handle(`PUT:${Channels.TAXES}`, catchIpcHandler(taxController.update))
ipcMain.handle(`DELETE:${Channels.TAXES}`, catchIpcHandler(taxController.remove))

ipcMain.handle(`GET:${Channels.PRODUCTS}`, catchIpcHandler(productController.list))
ipcMain.handle(`POST:${Channels.PRODUCTS}`, catchIpcHandler(productController.create))
ipcMain.handle(`PUT:${Channels.PRODUCTS}`, catchIpcHandler(productController.update))
ipcMain.handle(`DELETE:${Channels.PRODUCTS}`, catchIpcHandler(productController.remove))

ipcMain.handle(`GET:${Channels.PARTS}`, catchIpcHandler(partController.list))
ipcMain.handle(`POST:${Channels.PARTS}`, catchIpcHandler(partController.create))
ipcMain.handle(`PUT:${Channels.PARTS}`, catchIpcHandler(partController.update))
ipcMain.handle(`DELETE:${Channels.PARTS}`, catchIpcHandler(partController.remove))

ipcMain.handle(`GET:${Channels.PURCHASES}`, catchIpcHandler(purchaseController.list))
ipcMain.handle(`POST:${Channels.PURCHASES}`, catchIpcHandler(purchaseController.create))
ipcMain.handle(`PUT:${Channels.PURCHASES}`, catchIpcHandler(purchaseController.update))
ipcMain.handle(`GET:${Channels.PURCHASES}:detail`, catchIpcHandler(purchaseController.get))
ipcMain.handle(`GET:${Channels.PURCHASES}:due`, catchIpcHandler(purchaseController.listDue))
ipcMain.handle(`POST:${Channels.PURCHASES}:payment`, catchIpcHandler(purchaseController.recordPayment))

ipcMain.handle(`GET:${Channels.PART_PURCHASES}`, catchIpcHandler(partPurchaseController.list))
ipcMain.handle(`POST:${Channels.PART_PURCHASES}`, catchIpcHandler(partPurchaseController.create))
ipcMain.handle(`PUT:${Channels.PART_PURCHASES}`, catchIpcHandler(partPurchaseController.update))
ipcMain.handle(`GET:${Channels.PART_PURCHASES}:detail`, catchIpcHandler(partPurchaseController.get))
ipcMain.handle(`GET:${Channels.PART_PURCHASES}:due`, catchIpcHandler(partPurchaseController.listDue))
ipcMain.handle(
  `POST:${Channels.PART_PURCHASES}:payment`,
  catchIpcHandler(partPurchaseController.recordPayment)
)

ipcMain.handle(`GET:${Channels.PRODUCT_ITEMS}`, catchIpcHandler(inventoryController.list))
ipcMain.handle(`GET:${Channels.INVENTORY}:search`, catchIpcHandler(inventoryController.search))
ipcMain.handle(`GET:${Channels.INVENTORY}:detail`, catchIpcHandler(inventoryController.detail))
ipcMain.handle(`POST:${Channels.INVENTORY}:adjust`, catchIpcHandler(inventoryController.adjust))
ipcMain.handle(`POST:${Channels.TRANSFERS}`, catchIpcHandler(inventoryController.transfer))

ipcMain.handle(`GET:${Channels.PART_STOCKS}`, catchIpcHandler(partStockController.list))
ipcMain.handle(`GET:${Channels.PART_STOCKS}:detail`, catchIpcHandler(partStockController.detail))
ipcMain.handle(`GET:${Channels.PART_STOCKS}:fifo`, catchIpcHandler(partStockController.fifoPreview))

ipcMain.handle(`POST:${Channels.SALES}`, catchIpcHandler(saleController.create))
ipcMain.handle(`PUT:${Channels.SALES}`, catchIpcHandler(saleController.update))
ipcMain.handle(`POST:${Channels.SALES}:payment`, catchIpcHandler(saleController.recordPayment))
ipcMain.handle(`GET:${Channels.SALES}`, catchIpcHandler(saleController.list))
ipcMain.handle(`GET:${Channels.SALES}:detail`, catchIpcHandler(saleController.get))
ipcMain.handle(`GET:${Channels.SALES}:due`, catchIpcHandler(saleController.listDue))

ipcMain.handle(`GET:${Channels.CUSTOMERS}`, catchIpcHandler(customerController.list))
ipcMain.handle(`POST:${Channels.CUSTOMERS}`, catchIpcHandler(customerController.create))
ipcMain.handle(`PUT:${Channels.CUSTOMERS}`, catchIpcHandler(customerController.update))
ipcMain.handle(`DELETE:${Channels.CUSTOMERS}`, catchIpcHandler(customerController.remove))
ipcMain.handle(`GET:${Channels.CUSTOMERS}:ledger`, catchIpcHandler(customerController.ledger))

ipcMain.handle(`GET:${Channels.EXPENSES}`, catchIpcHandler(expenseController.list))
ipcMain.handle(`POST:${Channels.EXPENSES}`, catchIpcHandler(expenseController.create))
ipcMain.handle(`DELETE:${Channels.EXPENSES}`, catchIpcHandler(expenseController.remove))
ipcMain.handle(`GET:${Channels.EXPENSES}:categories`, catchIpcHandler(expenseController.categories))
ipcMain.handle(`POST:${Channels.EXPENSES}:categories`, catchIpcHandler(expenseController.createCategory))
ipcMain.handle(`PUT:${Channels.EXPENSES}:categories`, catchIpcHandler(expenseController.updateCategory))
ipcMain.handle(`DELETE:${Channels.EXPENSES}:categories`, catchIpcHandler(expenseController.removeCategory))

ipcMain.handle(`GET:${Channels.DASHBOARD}`, catchIpcHandler(dashboardController.metrics))
ipcMain.handle(`GET:${Channels.BRANCHES}`, catchIpcHandler(branchController.list))
ipcMain.handle(`GET:${Channels.REPORTS}:sales`, catchIpcHandler(reportController.sales))
ipcMain.handle(`GET:${Channels.REPORTS}:purchases`, catchIpcHandler(reportController.purchases))
ipcMain.handle(`GET:${Channels.REPORTS}:customers`, catchIpcHandler(reportController.customers))
ipcMain.handle(`GET:${Channels.REPORTS}:customers:detail`, catchIpcHandler(reportController.customerDetail))
ipcMain.handle(`GET:${Channels.REPORTS}:suppliers`, catchIpcHandler(reportController.suppliers))
ipcMain.handle(`GET:${Channels.REPORTS}:suppliers:detail`, catchIpcHandler(reportController.supplierDetail))
ipcMain.handle(`POST:${Channels.PRINT}:sale-invoice`, catchIpcHandler(printController.downloadSaleInvoice))
ipcMain.handle(`POST:${Channels.PRINT}:thermal-receipt`, catchIpcHandler(printController.downloadThermalReceipt))
ipcMain.handle(`POST:${Channels.PRINT}:ledger`, catchIpcHandler(printController.downloadLedgerStatement))

ipcMain.handle(`GET:${Channels.SYNC}:status`, catchIpcHandler(syncController.status))
ipcMain.handle(`POST:${Channels.SYNC}`, catchIpcHandler(syncController.syncNow))
