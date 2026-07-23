import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AdminLayout from './layouts/AdminLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CompaniesPage from './pages/CompaniesPage'
import CompanyDetailPage from './pages/CompanyDetailPage'
import AuditPage from './pages/AuditPage'
import BusinessConsoleLayout from './pages/business/BusinessConsoleLayout'
import BusinessDashboardPage from './pages/business/BusinessDashboardPage'
import BusinessSalesPage from './pages/business/BusinessSalesPage'
import BusinessSaleDetailPage from './pages/business/BusinessSaleDetailPage'
import BusinessDuesPage from './pages/business/BusinessDuesPage'
import BusinessPurchasesPage from './pages/business/BusinessPurchasesPage'
import BusinessPurchaseDetailPage from './pages/business/BusinessPurchaseDetailPage'
import BusinessCustomersPage from './pages/business/BusinessCustomersPage'
import BusinessCustomerDetailPage from './pages/business/BusinessCustomerDetailPage'

function Protected({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth()
  if (!token || !user) return <Navigate to="/login" replace />
  if (user.role !== 'super_admin') return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <Protected>
            <AdminLayout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="companies/:id" element={<CompanyDetailPage />} />
        <Route path="audit" element={<AuditPage />} />
      </Route>
      <Route
        path="companies/:id/business"
        element={
          <Protected>
            <BusinessConsoleLayout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<BusinessDashboardPage />} />
        <Route path="sales" element={<BusinessSalesPage />} />
        <Route path="sales/:saleId" element={<BusinessSaleDetailPage />} />
        <Route path="dues" element={<BusinessDuesPage />} />
        <Route path="purchases" element={<BusinessPurchasesPage />} />
        <Route
          path="purchases/:purchaseId"
          element={<BusinessPurchaseDetailPage kind="product" />}
        />
        <Route
          path="part-purchases/:purchaseId"
          element={<BusinessPurchaseDetailPage kind="part" />}
        />
        <Route path="customers" element={<BusinessCustomersPage />} />
        <Route path="customers/:customerId" element={<BusinessCustomerDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
