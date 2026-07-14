import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Col, Descriptions, Row, Spin, Statistic, Table, Tag, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { App_Routes } from '@/common'
import { purchaseAPI } from '@/renderer/services'
import { formatSupplierDiscount } from '@/renderer/utils/supplierDiscount'
import { formatRs, PageHeader } from '../shared/page-ui'
import { STATUS_COLORS } from './inventory-ui'

const { Text } = Typography

export const PurchaseDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
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
          <Descriptions.Item label="Special Discount">
            {formatSupplierDiscount(
              Number(purchase.specialDiscount || 0),
              purchase.specialDiscountType === 'percent' ? 'percent' : 'pkr'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Notes" span={2}>{purchase.notes || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} sm={12}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Units Received" value={detail.items?.length ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Total Value" value={totalValue} prefix="Rs" precision={0} />
          </Card>
        </Col>
      </Row>

      <Card title="Received Units" bordered={false} className="shadow-sm">
        <Table
          rowKey="id"
          dataSource={detail.items || []}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          columns={[
            { title: 'Motor No.', dataIndex: 'motorNumber', render: (v) => v || '—' },
            { title: 'Serial', dataIndex: 'serialNumber' },
            { title: 'Product', render: (_: unknown, r: any) => r.product?.name || '—' },
            { title: 'Category', render: (_: unknown, r: any) => r.category?.name || '—' },
            { title: 'Color', render: (_: unknown, r: any) => r.color?.name || '—' },
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
                r.warrantyActive ? dayjs(r.warrantyExpiryDate).format('DD MMM YYYY') : 'No'
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default PurchaseDetail
