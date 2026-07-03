import { Outlet } from 'react-router-dom'
import './auth-layout.scss'

const AuthLayout = () => (
  <div className="auth-layout">
    <div className="auth-card">
      <Outlet />
    </div>
  </div>
)

export default AuthLayout
