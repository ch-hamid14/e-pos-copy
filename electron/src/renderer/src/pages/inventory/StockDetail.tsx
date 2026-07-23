import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Descriptions, Table, Tag, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { inventoryAPI } from '@/renderer/services'
import { App_Routes } from '@/common'
import { formatRs } from '../shared/page-ui'
import { STATUS_COLORS } from './inventory-ui'

const { Title } = Typography

export const StockDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<any>(null)

  useEffect(() => {
    if (id) inventoryAPI.detail(id).then(setDetail)
  }, [id])

  if (!detail?.item) return null
  const item = detail.item

  return (
    <div>
      <Button type="link" icon={<ArrowLeftOutlined />} className="!px-0 mb-2" onClick={() => navigate(App_Routes.STOCK)}>
        Back to Stock
      </Button>
      <Title level={3} className="!mb-4">{item.serialNumber}</Title>

      <Card bordered={false} className="shadow-sm mb-4">
        <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
          <Descriptions.Item label="Product">{item.product?.name}</Descriptions.Item>
          <Descriptions.Item label="Category">{item.category?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Color">{item.color?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Status">
            <Tag color={STATUS_COLORS[item.status]}>{item.status?.replace(/_/g, ' ')}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Purchase Price">{formatRs(item.purchasePrice)}</Descriptions.Item>
          <Descriptions.Item label="Selling Price">{formatRs(item.sellingPrice)}</Descriptions.Item>
          <Descriptions.Item label="Purchased">
            {item.purchasedAt ? dayjs(item.purchasedAt).format('DD MMM YYYY') : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Warranty">
            {item.warrantyActive
              ? `${item.warrantyYears != null ? `${item.warrantyYears} yr · ` : ''}until ${dayjs(item.warrantyExpiryDate).format('DD MMM YYYY')}`
              : 'Inactive'}
          </Descriptions.Item>
          <Descriptions.Item label="Supplier">{item.purchase?.supplier?.name || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Movement History" bordered={false} className="shadow-sm">
        <Table
          rowKey="id"
          size="small"
          dataSource={detail.movements || []}
          pagination={false}
          columns={[
            {
              title: 'Date',
              dataIndex: 'createdAt',
              render: (v) => dayjs(v).format('DD MMM YYYY HH:mm')
            },
            { title: 'Type', dataIndex: 'movementType' },
            { title: 'Notes', dataIndex: 'notes', render: (v) => v || '—' }
          ]}
        />
      </Card>
    </div>
  )
}

export default StockDetail
