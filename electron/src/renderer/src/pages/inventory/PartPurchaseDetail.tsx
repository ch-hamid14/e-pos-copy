import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Col, Descriptions, Row, Spin, Statistic, Table, Typography } from 'antd'
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { App_Routes, Roles } from '@/common'
import { partPurchaseAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, PageHeader } from '../shared/page-ui'

const { Text } = Typography

export const PartPurchaseDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const canEditPurchases = user?.role === Roles.COMPANY_OWNER
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    partPurchaseAPI
      .get(id)
      .then(setDetail)
      .finally(() => setLoading(false))
  }, [id])

  const totalUnits = useMemo(
    () => (detail?.lines || []).reduce((sum: number, line: any) => sum + Number(line.quantity || 0), 0),
    [detail?.lines]
  )
  const totalValue = useMemo(
    () =>
      (detail?.lines || []).reduce(
        (sum: number, line: any) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
        0
      ),
    [detail?.lines]
  )

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spin size="large" />
      </div>
    )
  }

  if (!detail?.purchase) {
    return (
      <div>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          className="!px-0 mb-4"
          onClick={() => navigate(App_Routes.PURCHASE_LIST)}
        >
          Back to Purchase List
        </Button>
        <Text type="secondary">Parts purchase not found.</Text>
      </div>
    )
  }

  const purchase = detail.purchase

  return (
    <div>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        className="!px-0 mb-2"
        onClick={() => navigate(App_Routes.PURCHASE_LIST)}
      >
        Back to Purchase List
      </Button>

      <PageHeader
        title="Parts Purchase Detail"
        subtitle={dayjs(purchase.purchaseDate).format('DD MMM YYYY')}
        extra={
          canEditPurchases ? (
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => navigate(App_Routes.PART_PURCHASE_EDIT.replace(':id', purchase.id))}
            >
              Edit
            </Button>
          ) : (
            <Text type="secondary">Only company owners can edit purchases</Text>
          )
        }
      />

      <Card bordered={false} className="shadow-sm mb-4">
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Supplier">{purchase.supplier?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Date">
            {dayjs(purchase.purchaseDate).format('DD MMM YYYY')}
          </Descriptions.Item>
          <Descriptions.Item label="Notes" span={2}>
            {purchase.notes || '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={16} className="mb-4">
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Lines" value={(detail.lines || []).length} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Units" value={totalUnits} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Net Total"
              value={Number(purchase.netTotal ?? totalValue)}
              formatter={(v) => formatRs(Number(v))}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Due"
              value={Number(purchase.dueAmount || 0)}
              formatter={(v) => formatRs(Number(v))}
              valueStyle={{ color: Number(purchase.dueAmount) > 0 ? '#cf1322' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="shadow-sm">
        <Table
          rowKey="id"
          dataSource={detail.lines || []}
          pagination={false}
          columns={[
            {
              title: 'Part',
              dataIndex: 'part',
              render: (p: any, row: any) => p?.name || row.partId
            },
            {
              title: 'Category',
              dataIndex: 'category',
              render: (c: any) => c?.name || '—'
            },
            { title: 'Units', dataIndex: 'quantity', align: 'right' as const },
            {
              title: 'Retail',
              dataIndex: 'unitSalePrice',
              align: 'right' as const,
              render: (v: number, r: any) => formatRs(Number(v ?? r.unitCost ?? 0))
            },
            {
              title: 'Net cost',
              dataIndex: 'unitCost',
              align: 'right' as const,
              render: formatRs
            },
            {
              title: 'Line total (cost)',
              align: 'right' as const,
              render: (_: unknown, r: any) =>
                formatRs(Number(r.quantity || 0) * Number(r.unitCost || 0))
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default PartPurchaseDetail
