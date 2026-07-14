import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AdminLayout from './layouts/AdminLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CompaniesPage from './pages/CompaniesPage'
import CompanyDetailPage from './pages/CompanyDetailPage'
import AuditPage from './pages/AuditPage'

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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
