import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeftOutlined,
  DashboardOutlined,
  LogoutOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  TeamOutlined,
  WalletOutlined
} from '@ant-design/icons'
import { Avatar, Button, Layout, Menu, Spin, Typography, message } from 'antd'
import { getCompany } from '../../api/admin'
import { useAuth } from '../../context/AuthContext'
import type { Company } from '../../types'

const { Header, Sider, Content } = Layout

export default function BusinessConsoleLayout() {
  const { id } = useParams<{ id: string }>()
  const { token, user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token || !id) return
    setLoading(true)
    getCompany(token, id)
      .then((d) => setCompany(d.company))
      .catch((err: Error) => message.error(err.message))
      .finally(() => setLoading(false))
  }, [token, id])

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!company || !id) {
    return (
      <div style={{ padding: 40 }}>
        <Typography.Text type="danger">Company not found.</Typography.Text>
        <div style={{ marginTop: 12 }}>
          <Link to="/companies">Back to companies</Link>
        </div>
      </div>
    )
  }

  const base = `/companies/${id}/business`

  return (
    <Layout style={{ minHeight: '100vh' }} className="madix-business-shell">
      <Sider width={220} theme="dark" className="madix-sider">
        <div className="madix-sider-brand">
          <div className="madix-sider-brand__mark">B</div>
          <div className="madix-sider-brand__name">Business Ops</div>
          <div className="madix-sider-brand__sub">{company.name}</div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[
            location.pathname.includes('/dues')
              ? 'dues'
              : location.pathname.includes('/purchases') ||
                  location.pathname.includes('/part-purchases')
                ? 'purchases'
                : location.pathname.includes('/customers')
                  ? 'customers'
                  : location.pathname.includes('/sales')
                    ? 'sales'
                    : 'dashboard'
          ]}
          style={{ borderInlineEnd: 0, padding: '8px 8px 16px' }}
          items={[
            {
              key: 'dashboard',
              icon: <DashboardOutlined />,
              label: <NavLink to={`${base}/dashboard`}>Dashboard</NavLink>
            },
            {
              key: 'sales',
              icon: <ShoppingCartOutlined />,
              label: <NavLink to={`${base}/sales`}>Sales</NavLink>
            },
            {
              key: 'dues',
              icon: <WalletOutlined />,
              label: <NavLink to={`${base}/dues`}>Dues</NavLink>
            },
            {
              key: 'purchases',
              icon: <ShoppingOutlined />,
              label: <NavLink to={`${base}/purchases`}>Purchases</NavLink>
            },
            {
              key: 'customers',
              icon: <TeamOutlined />,
              label: <NavLink to={`${base}/customers`}>Customers</NavLink>
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
            height: 64
          }}
        >
          <Button
            type="link"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/companies/${id}`)}
            style={{ paddingLeft: 0 }}
          >
            Company settings
          </Button>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Avatar style={{ background: '#0f8f7a' }} size="small">
              {(user?.firstName?.[0] || 'A').toUpperCase()}
            </Avatar>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {user?.firstName} {user?.lastName}
              </div>
              <div style={{ fontSize: 12, color: '#5b6b7c' }}>Super admin · reconcile</div>
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
          <div className="madix-page madix-business-page">
            <Outlet context={{ companyId: id, companyName: company.name }} />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
