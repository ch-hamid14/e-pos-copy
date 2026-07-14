import {
  ApartmentOutlined,
  DashboardOutlined,
  LogoutOutlined
} from '@ant-design/icons'
import { Avatar, Button, Layout, Menu, Typography } from 'antd'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const { Header, Sider, Content } = Layout

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const selected =
    location.pathname.startsWith('/companies') ? '/companies' : '/'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        className="madix-sider"
        breakpoint="lg"
        collapsedWidth={0}
        width={232}
        theme="dark"
      >
        <div className="madix-sider-brand">
          <div className="madix-sider-brand__mark">M</div>
          <div className="madix-sider-brand__name">Madix Control</div>
          <div className="madix-sider-brand__sub">Super Admin</div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          style={{ borderInlineEnd: 0, padding: '8px 8px 16px' }}
          items={[
            {
              key: '/',
              icon: <DashboardOutlined />,
              label: <Link to="/">Overview</Link>
            },
            {
              key: '/companies',
              icon: <ApartmentOutlined />,
              label: <Link to="/companies">Companies</Link>
            }
          ]}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 24px',
            borderBottom: '1px solid #d5dde6',
            height: 64,
            lineHeight: '64px'
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Platform control plane
          </Typography.Text>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Avatar
              style={{ background: '#0f8f7a', verticalAlign: 'middle' }}
              size="small"
            >
              {(user?.firstName?.[0] || 'A').toUpperCase()}
            </Avatar>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {user?.firstName} {user?.lastName}
              </div>
              <div style={{ fontSize: 12, color: '#5b6b7c' }}>{user?.email}</div>
            </div>
            <Button
              icon={<LogoutOutlined />}
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
          <div className="madix-page">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
