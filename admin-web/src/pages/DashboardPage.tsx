import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Col, Row, Statistic, Table, Tag, Typography } from 'antd'
import { getOverview } from '../api/admin'
import { useAuth } from '../context/AuthContext'
import type { Company, Overview } from '../types'

export default function DashboardPage() {
  const { token } = useAuth()
  const [data, setData] = useState<Overview | null>(null)

  useEffect(() => {
    if (!token) return
    getOverview(token).then(setData).catch(() => undefined)
  }, [token])

  return (
    <div>
      <Typography.Title level={2}>Platform Dashboard</Typography.Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card><Statistic title="Companies" value={data?.companiesCount ?? 0} /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card><Statistic title="Active Users" value={data?.usersCount ?? 0} /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card><Statistic title="Branches" value={data?.branchesCount ?? 0} /></Card>
        </Col>
      </Row>
      <Card title="Recent Companies" extra={<Link to="/companies">View all</Link>}>
        <Table<Company>
          rowKey="id"
          dataSource={data?.companies ?? []}
          pagination={false}
          columns={[
            { title: 'Name', dataIndex: 'name', render: (name, row) => <Link to={`/companies/${row.id}`}>{name}</Link> },
            { title: 'Email', dataIndex: 'email' },
            { title: 'Branches', dataIndex: 'branchCount' },
            { title: 'Users', dataIndex: 'userCount' },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (s) => <Tag color={s === 'active' ? 'green' : 'red'}>{s}</Tag>
            }
          ]}
        />
      </Card>
    </div>
  )
}
