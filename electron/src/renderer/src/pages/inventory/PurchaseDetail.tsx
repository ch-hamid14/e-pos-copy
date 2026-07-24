import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Col, Descriptions, Row, Spin, Statistic, Table, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { App_Routes, Roles } from '@/common'
import { purchaseAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatSupplierDiscount } from '@/renderer/utils/supplierDiscount'
import { formatRs, PageHeader } from '../shared/page-ui'
import { STATUS_COLORS } from './inventory-ui'

const { Text } = Typography

export const PurchaseDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const canEditPurchases = user?.role === Roles.COMPANY_OWNER
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    purchaseAPI
      .get(id)
      .then(setDetail)
      .finally(() => setLoading(false))
  }, [id])

  const totalValue = useMemo(
    () => (detail?.items || []).reduce((sum: number, item: any) => sum + Number(item.purchasePrice ?? 0), 0),
    [detail?.items]
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
        <Text type="secondary">Purchase not found.</Text>
      </div>
    )
  }

  const purchase = detail.purchase
  const editable = Boolean(detail.editable ?? purchase.editable)
  const canEdit = editable && canEditPurchases

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
        title="Purchase Detail"
        subtitle={dayjs(purchase.purchaseDate).format('DD MMM YYYY')}
        extra={
          canEdit ? (
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => navigate(App_Routes.PURCHASE_EDIT.replace(':id', purchase.id))}
            >
              Edit
            </Button>
          ) : (
            <Text type="secondary">
              {!canEditPurchases
                ? 'Only company owners can edit purchases'
                : 'Edit unavailable — no in-stock units remaining'}
            </Text>
          )
        }
      />

      <Card bordered={false} className="shadow-sm mb-4">
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Supplier">{purchase.supplier?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Date">{dayjs(purchase.purchaseDate).format('DD MMM YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Supplier Discount">
            {formatSupplierDiscount(
              Number(purchase.supplier?.discount || 0),
              purchase.supplier?.discountType === 'percent' ? 'percent' : 'pkr'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Notes" span={2}>{purchase.notes || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Units Received" value={detail.items?.length ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Net Total"
              value={Number(purchase.netTotal ?? totalValue)}
              prefix="Rs"
              precision={0}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Due"
              value={Number(purchase.dueAmount || 0)}
              prefix="Rs"
              precision={0}
              valueStyle={{ color: Number(purchase.dueAmount) > 0 ? '#cf1322' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="shadow-sm mb-4">
        <Descriptions column={{ xs: 1, sm: 3 }} size="small">
          <Descriptions.Item label="Paid">{formatRs(purchase.paidAmount)}</Descriptions.Item>
          <Descriptions.Item label="Due">
            {Number(purchase.dueAmount) > 0 ? (
              <Text type="danger" strong>
                {formatRs(purchase.dueAmount)}
              </Text>
            ) : (
              formatRs(0)
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Payments">{detail.payments?.length ?? 0}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Received Units" bordered={false} className="shadow-sm">
        <Table
          rowKey="id"
          dataSource={detail.items || []}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          columns={[
            { title: 'Motor No.', dataIndex: 'motorNumber', render: (v) => v || '—' },
            { title: 'Chassis Number', dataIndex: 'serialNumber' },
            { title: 'Product', render: (_: unknown, r: any) => r.product?.name || '—' },
            { title: 'Category', render: (_: unknown, r: any) => r.category?.name || '—' },
            { title: 'Color', render: (_: unknown, r: any) => r.color?.name || '—' },
            {
              title: 'Special Disc.',
              key: 'specialDiscount',
              render: (_: unknown, r: any) =>
                formatSupplierDiscount(
                  Number(r.specialDiscount || 0),
                  r.specialDiscountType === 'percent' ? 'percent' : 'pkr'
                )
            },
            { title: 'Purchase Price', dataIndex: 'purchasePrice', align: 'right' as const, render: formatRs },
            { title: 'Selling Price', dataIndex: 'sellingPrice', align: 'right' as const, render: formatRs },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (v) => <Tag color={STATUS_COLORS[v]}>{v?.replace(/_/g, ' ')}</Tag>
            },
            {
              title: 'Warranty',
              render: (_: unknown, r: any) =>
                r.warrantyActive
                  ? `${r.warrantyYears != null ? `${r.warrantyYears} yr · ` : ''}${
                      r.warrantyExpiryDate ? dayjs(r.warrantyExpiryDate).format('DD MMM YYYY') : '—'
                    }`
                  : 'No'
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default PurchaseDetail
