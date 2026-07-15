import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Descriptions, Spin, Table, Tag, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { App_Routes } from '@/common'
import { partStockAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, PageHeader } from '../shared/page-ui'

const { Text } = Typography

export const PartStockDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { companyId, branchId } = useSession()
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)

  useEffect(() => {
    if (!id || !companyId || !branchId) return
    setLoading(true)
    partStockAPI
      .detail(companyId, branchId, id)
      .then(setDetail)
      .catch((err: any) => {
        console.error(err)
        setDetail(null)
      })
      .finally(() => setLoading(false))
  }, [id, companyId, branchId])

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spin size="large" />
      </div>
    )
  }

  if (!detail?.part) {
    return (
      <div>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          className="!px-0 mb-4"
          onClick={() => navigate(App_Routes.STOCK)}
        >
          Back to Stock
        </Button>
        <Text type="secondary">Part stock not found.</Text>
      </div>
    )
  }

  const part = detail.part
  const stock = detail.stock || {}

  return (
    <div>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        className="!px-0 mb-2"
        onClick={() => navigate(App_Routes.STOCK)}
      >
        Back to Stock
      </Button>

      <PageHeader title={part.name} subtitle="Available units and stock movement history." />

      <Card bordered={false} className="shadow-sm mb-4">
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Category">{part.category?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Description">{part.description || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card bordered={false} className="shadow-sm mb-4">
        <Descriptions column={{ xs: 1, sm: 3 }} size="small">
          <Descriptions.Item label="Available units">
            <Text strong>{Number(stock.quantityOnHand || 0)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Retail price">
            {formatRs(Number(stock.sellingPrice || 0))}
          </Descriptions.Item>
          <Descriptions.Item label="Avg cost">
            {formatRs(Number(stock.averageCost || 0))}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card bordered={false} className="shadow-sm" title="Movements">
        <Table
          rowKey="id"
          dataSource={detail.movements || []}
          pagination={{ pageSize: 20, showTotal: (t) => `${t} movements` }}
          locale={{ emptyText: 'No movements yet' }}
          columns={[
            {
              title: 'Date',
              dataIndex: 'createdAt',
              render: (v) => dayjs(v).format('DD MMM YYYY HH:mm')
            },
            {
              title: 'Type',
              dataIndex: 'movementType',
              render: (v) => <Tag>{String(v || '').replace(/_/g, ' ')}</Tag>
            },
            {
              title: 'Change',
              dataIndex: 'deltaQty',
              align: 'right' as const,
              render: (v) => {
                const n = Number(v || 0)
                return (
                  <Text type={n < 0 ? 'danger' : 'success'}>
                    {n > 0 ? `+${n}` : n}
                  </Text>
                )
              }
            },
            {
              title: 'After',
              dataIndex: 'quantityAfter',
              align: 'right' as const
            },
            {
              title: 'Reference',
              render: (_: unknown, r: any) =>
                r.referenceType
                  ? `${r.referenceType}${r.referenceId ? ` · ${String(r.referenceId).slice(0, 8)}` : ''}`
                  : '—'
            },
            {
              title: 'Notes',
              dataIndex: 'notes',
              render: (v) => v || '—'
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default PartStockDetail
