import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeftOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  Modal,
  Row,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  message
} from 'antd'
import {
  getBusinessPartPurchase,
  getBusinessPurchase,
  voidBusinessPartPurchase,
  voidBusinessPurchase
} from '../../api/admin'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatRs } from './format'

type Ctx = { companyId: string; companyName: string }

export default function BusinessPurchaseDetailPage({ kind }: { kind: 'product' | 'part' }) {
  const { token } = useAuth()
  const { companyId } = useOutletContext<Ctx>()
  const { id, purchaseId } = useParams<{ id: string; purchaseId: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [reason, setReason] = useState('')

  const load = async () => {
    if (!token || !companyId || !purchaseId) return
    setLoading(true)
    try {
      setDetail(
        kind === 'part'
          ? await getBusinessPartPurchase(token, companyId, purchaseId)
          : await getBusinessPurchase(token, companyId, purchaseId)
      )
    } catch (err: any) {
      message.error(err.message)
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token, companyId, purchaseId, kind])

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
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
          style={{ paddingLeft: 0 }}
          onClick={() => navigate(`/companies/${id}/business/purchases`)}
        >
          Back to purchases
        </Button>
        <Typography.Text type="secondary">Purchase not found.</Typography.Text>
      </div>
    )
  }

  const purchase = detail.purchase as Record<string, any>
  const impact = detail.impact
  const isVoided = Boolean(purchase.deletedAt)

  return (
    <div>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        style={{ paddingLeft: 0, marginBottom: 8 }}
        onClick={() => navigate(`/companies/${id}/business/purchases`)}
      >
        Back to purchases
      </Button>

      <div className="madix-page-header">
        <div>
          <h1>
            {kind === 'part' ? 'Part purchase' : 'Product purchase'}
          </h1>
          <p>
            {formatDate(purchase.purchaseDate)}
            {purchase.branchName ? ` · ${purchase.branchName}` : ''}
            {purchase.supplier?.name ? ` · ${purchase.supplier.name}` : ''}
          </p>
        </div>
        <Button
          danger
          disabled={isVoided || !impact.canVoid}
          onClick={() => {
            setReason('')
            setVoidOpen(true)
          }}
        >
          Void purchase
        </Button>
      </div>

      {isVoided ? (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Purchase is voided" />
      ) : !impact.canVoid ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Void blocked"
          description={impact.blockers.join(' · ')}
        />
      ) : null}

      <Card bordered={false} className="madix-detail-card" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="Supplier">{purchase.supplier?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Branch">{purchase.branchName || '—'}</Descriptions.Item>
          <Descriptions.Item label="Kind">
            {kind === 'part' ? <Tag color="blue">Part</Tag> : <Tag>Product</Tag>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {kind === 'product' ? (
        <>
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Card bordered={false} className="madix-detail-card">
                <Statistic title="Units" value={impact.totalUnits} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card bordered={false} className="madix-detail-card">
                <Statistic title="In stock" value={impact.inStockCount} />
              </Card>
            </Col>
          </Row>
          <Card title="Units" bordered={false} className="madix-detail-card">
            <Table
              rowKey="id"
              dataSource={detail.items}
              pagination={false}
              columns={[
                { title: 'Chassis', dataIndex: 'serialNumber' },
                { title: 'Motor', dataIndex: 'motorNumber', render: (v) => v || '—' },
                {
                  title: 'Product',
                  render: (_, r: any) => r.product?.name || '—'
                },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  render: (v) => <Tag>{v}</Tag>
                },
                {
                  title: 'Cost',
                  dataIndex: 'purchasePrice',
                  align: 'right',
                  render: formatRs
                }
              ]}
            />
          </Card>
        </>
      ) : (
        <Card title="Lines" bordered={false} className="madix-detail-card">
          <Table
            rowKey="id"
            dataSource={detail.lines}
            pagination={false}
            columns={[
              { title: 'Part', dataIndex: 'partName' },
              { title: 'SKU', dataIndex: 'partSku', render: (v) => v || '—' },
              { title: 'Qty', dataIndex: 'quantity', align: 'right' },
              { title: 'Remaining', dataIndex: 'quantityRemaining', align: 'right' },
              {
                title: 'Unit cost',
                dataIndex: 'unitCost',
                align: 'right',
                render: formatRs
              }
            ]}
          />
        </Card>
      )}

      <Modal
        title="Void purchase"
        open={voidOpen}
        okText="Void purchase"
        okButtonProps={{
          danger: true,
          disabled: reason.trim().length < 3,
          loading: busy
        }}
        onCancel={() => setVoidOpen(false)}
        onOk={async () => {
          if (!token || !purchaseId) return
          setBusy(true)
          try {
            if (kind === 'part') {
              await voidBusinessPartPurchase(token, companyId, purchaseId, {
                reason: reason.trim()
              })
            } else {
              await voidBusinessPurchase(token, companyId, purchaseId, {
                reason: reason.trim()
              })
            }
            message.success('Purchase voided')
            setVoidOpen(false)
            navigate(`/companies/${id}/business/purchases`)
          } catch (err: any) {
            message.error(err.message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={
            kind === 'product'
              ? 'Soft-deletes in-stock units and the purchase. Blocked if any unit was sold.'
              : 'Removes part stock and soft-deletes lines. Blocked if any qty was sold from these lots.'
          }
        />
        <Typography.Paragraph>Reason (required)</Typography.Paragraph>
        <Input.TextArea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Duplicate purchase / wrong supplier"
        />
      </Modal>
    </div>
  )
}
