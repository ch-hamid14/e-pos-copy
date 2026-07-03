import { useEffect, useState } from 'react'
import { Card, Col, Row, Statistic, Typography } from 'antd'
import { dashboardAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs } from '../shared/page-ui'

const { Title, Paragraph } = Typography

export const Dashboard = () => {
  const { companyId, branchId, deviceId, user, branchName } = useSession()
  const [metrics, setMetrics] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!companyId || !deviceId) return
    setLoading(true)
    dashboardAPI.metrics(companyId, branchId, deviceId)
      .then((m) => setMetrics(m as Record<string, number>))
      .finally(() => setLoading(false))
  }, [companyId, branchId, deviceId])

  return (
    <div>
      <Title level={3} className="!mb-1">Welcome, {user?.firstName || 'User'}</Title>
      <Paragraph type="secondary" className="!mb-4">
        {branchName ? `${branchName} overview` : 'Branch overview'} — charts ship in Phase F.
      </Paragraph>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm" loading={loading}>
            <Statistic title="Today's Sales" value={metrics.todaySales || 0} prefix="Rs" precision={0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm" loading={loading}>
            <Statistic title="Today's Purchases" value={metrics.todayPurchaseTotal || 0} prefix="Rs" precision={0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm" loading={loading}>
            <Statistic title="Outstanding" value={metrics.outstandingBalance || 0} prefix="Rs" precision={0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm" loading={loading}>
            <Statistic title="In Stock" value={metrics.inStockCount || 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm" loading={loading}>
            <Statistic title="Month Expenses" value={metrics.expenses || 0} prefix="Rs" precision={0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm" loading={loading}>
            <Statistic title="P&L (Today)" value={metrics.profitLoss || 0} formatter={(v) => formatRs(v)} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
