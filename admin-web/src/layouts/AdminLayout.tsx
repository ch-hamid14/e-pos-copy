import { Button, Layout, Menu, Typography } from 'antd'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const { Header, Sider, Content } = Layout

const menuItems = [
  { key: '/', label: <Link to="/">Dashboard</Link> },
  { key: '/companies', label: <Link to="/companies">Companies</Link> }
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={0} theme="dark">
        <div style={{ padding: '16px', color: '#fff', fontWeight: 700 }}>Madix Platform</div>
        <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={menuItems} />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 24px',
            borderBottom: '1px solid #f0f0f0'
          }}
        >
          <Typography.Text type="secondary">Super Admin Console</Typography.Text>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span>{user?.firstName} {user?.lastName}</span>
            <Button
              onClick={() => {
                logout()
                navigate('/login')
              }}
            >
              Logout
            </Button>
          </div>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
