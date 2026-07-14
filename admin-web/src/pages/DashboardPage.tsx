import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ApartmentOutlined,
  BankOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  StopOutlined,
  ArrowRightOutlined
} from '@ant-design/icons'
import { Button, Empty, Spin, Table, Typography } from 'antd'
import { getOverview } from '../api/admin'
import StatCard from '../components/StatCard'
import StatusTag from '../components/StatusTag'
import { useAuth } from '../context/AuthContext'
import type { Company, Overview } from '../types'

export default function DashboardPage() {
  const { token } = useAuth()
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    getOverview(token)
      .then(setData)
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [token])

  const recent = useMemo(() => (data?.companies ?? []).slice(0, 8), [data])
  const attention = useMemo(
    () =>
      (data?.companies ?? [])
        .filter(
          (c) =>
            c.status !== 'active' ||
            c.maintenanceMode ||
            (c.planExpiresAt && new Date(c.planExpiresAt) < new Date())
        )
        .slice(0, 5),
    [data]
  )

  if (loading && !data) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 280 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <div className="madix-page-header">
        <div>
          <h1>Overview</h1>
          <p>Live snapshot of tenants, users, and platform health.</p>
        </div>
        <Link to="/companies">
          <Button type="primary" icon={<ArrowRightOutlined />}>
            Manage companies
          </Button>
        </Link>
      </div>

      <div className="madix-stat-grid">
        <StatCard
          label="Companies"
          value={data?.companiesCount ?? 0}
          hint={`${data?.activeCompaniesCount ?? 0} active`}
          icon={<BankOutlined />}
        />
        <StatCard
          label="Active tenants"
          value={data?.activeCompaniesCount ?? 0}
          hint={`${data?.inactiveCompaniesCount ?? 0} inactive`}
          icon={<CheckCircleOutlined />}
        />
        <StatCard
          label="Active users"
          value={data?.usersCount ?? 0}
          hint="Across all companies"
          icon={<TeamOutlined />}
        />
        <StatCard
          label="Branches"
          value={data?.branchesCount ?? 0}
          hint="Total branch locations"
          icon={<ApartmentOutlined />}
        />
      </div>

      <div className="madix-stat-grid">
        <StatCard
          label="Migration lag"
          value={data?.fleet?.migrationLagCount ?? 0}
          hint={`Of ${data?.fleet?.scouted ?? 0} scouted tenants`}
        />
        <StatCard
          label="With conflicts"
          value={data?.fleet?.conflictTenantCount ?? 0}
          hint="Tenants with sync_conflict rows"
        />
        <StatCard
          label="Maintenance"
          value={data?.fleet?.maintenanceCount ?? 0}
          hint="POS login blocked"
        />
        <StatCard
          label="Expired plans"
          value={data?.fleet?.expiredPlanCount ?? 0}
          hint="Past plan_expires_at"
        />
      </div>

      <div className="madix-split">
        <div className="madix-panel">
          <div className="madix-panel__head">
            <h2 className="madix-panel__title">Recent companies</h2>
            <Link to="/companies">View all</Link>
          </div>
          <Table<Company>
            rowKey="id"
            dataSource={recent}
            pagination={false}
            size="middle"
            locale={{ emptyText: <Empty description="No companies yet" /> }}
            columns={[
              {
                title: 'Company',
                dataIndex: 'name',
                render: (name, row) => (
                  <div>
                    <Link to={`/companies/${row.id}`} style={{ fontWeight: 600 }}>
                      {name}
                    </Link>
                    <div style={{ fontSize: 12, color: '#5b6b7c' }}>{row.email || '—'}</div>
                  </div>
                )
              },
              { title: 'Branches', dataIndex: 'branchCount', width: 100 },
              { title: 'Users', dataIndex: 'userCount', width: 90 },
              {
                title: 'Status',
                dataIndex: 'status',
                width: 110,
                render: (s) => <StatusTag status={s} />
              }
            ]}
          />
        </div>

        <div className="madix-panel">
          <div className="madix-panel__head">
            <h2 className="madix-panel__title">Needs attention</h2>
          </div>
          <div className="madix-panel__body">
            {attention.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="All companies are active"
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {attention.map((c) => (
                  <Link
                    key={c.id}
                    to={`/companies/${c.id}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: '1px solid #d5dde6',
                      background: '#fafbfc',
                      color: 'inherit',
                      textDecoration: 'none'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {c.status === 'inactive' ? 'Suspended / inactive' : c.status}
                      </Typography.Text>
                    </div>
                    <StopOutlined style={{ color: '#5b6b7c' }} />
                  </Link>
                ))}
              </div>
            )}

            <div
              style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: '1px solid #d5dde6'
              }}
            >
              <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                Quick actions
              </Typography.Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Link to="/companies">Open company directory →</Link>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  Use Configure on any company for migrations, sync, devices, and teardown.
                </Typography.Text>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
