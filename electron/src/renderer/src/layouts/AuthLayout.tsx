import { Outlet } from 'react-router-dom'
import logo from '@/renderer/assets/logo-full.png'
import './auth-layout.scss'

const AuthLayout = () => (
  <div className="auth-layout">
    <div className="auth-card">
      <div className="auth-logo-container">
        <img className="auth-logo" src={logo} alt="VOLT POS" />
      </div>
      <Outlet />
    </div>
  </div>
)

export default AuthLayout
