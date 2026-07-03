import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  Descriptions,
  Row,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { App_Routes } from '@/common'
import { reportAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, formatStatus, PageHeader } from '../shared/page-ui'

const { Text } = Typography

const LEDGER_TYPE_LABELS: Record<string, string> = {
  opening_balance: 'Opening Balance',
  sale_debit: 'Sale',
  payment_credit: 'Payment',
  adjustment: 'Adjustment'
}

const LEDGER_TYPE_COLORS: Record<string, string> = {
  opening_balance: 'blue',
  sale_debit: 'orange',
  payment_credit: 'green',
  adjustment: 'purple'
}

export const CustomerReportDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { companyId } = useSession()
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)

  useEffect(() => {
    if (!companyId || !id) return
    setLoading(true)
    reportAPI
      .customerDetail(companyId, id)
      .then(setDetail)
      .finally(() => setLoading(false))
  }, [companyId, id])

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spin size="large" />
      </div>
    )
  }

  if (!detail?.customer) {
    return (
      <div>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          className="!px-0 mb-4"
          onClick={() => navigate(App_Routes.CUSTOMER_REPORTS)}
        >
          Back to Customer Reports
        </Button>
        <Text type="secondary">Customer not found.</Text>
      </div>
    )
  }

  const customer = detail.customer

  return (
    <div>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        className="!px-0 mb-2"
        onClick={() => navigate(App_Routes.CUSTOMER_REPORTS)}
      >
        Back to Customer Reports
      </Button>

      <PageHeader
        title={customer.name}
        subtitle="Purchase history, products bought, and account ledger."
      />

      <Card bordered={false} className="shadow-sm mb-4">
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="Phone">{customer.phone || '—'}</Descriptions.Item>
          <Descriptions.Item label="CNIC">{customer.cnic || '—'}</Descriptions.Item>
          <Descriptions.Item label="Address">{customer.address || '—'}</Descriptions.Item>
          <Descriptions.Item label="Outstanding">
            {Number(customer.balance) > 0 ? (
              <Text type="danger" strong>{formatRs(customer.balance)}</Text>
            ) : (
              formatRs(0)
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={12} sm={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Sales" value={detail.summary?.saleCount ?? 0} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Total Purchased"
              value={detail.summary?.totalNet ?? 0}
              prefix="Rs"
              precision={0}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Total Paid" value={detail.summary?.totalPaid ?? 0} prefix="Rs" precision={0} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Total Due"
              value={detail.summary?.totalDue ?? 0}
              prefix="Rs"
              precision={0}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="shadow-sm">
        <Tabs
          items={[
            {
              key: 'sales',
              label: `Purchase History (${detail.sales?.length ?? 0})`,
              children: (
                <Table
                  rowKey="id"
                  dataSource={detail.sales || []}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  expandable={{
                    expandedRowRender: (sale: any) => (
                      <Table
                        rowKey="id"
                        size="small"
                        pagination={false}
                        dataSource={sale.lines || []}
                        columns={[
                          { title: 'Serial', dataIndex: 'serialNumber' },
                          { title: 'Product', dataIndex: 'productName' },
                          { title: 'Category', dataIndex: 'categoryName', render: (v) => v || '—' },
                          { title: 'Color', dataIndex: 'colorName', render: (v) => v || '—' },
                          {
                            title: 'Price',
                            dataIndex: 'salePrice',
                            align: 'right' as const,
                            render: formatRs
                          },
                          {
                            title: 'Line Total',
                            dataIndex: 'lineTotal',
                            align: 'right' as const,
                            render: formatRs
                          }
                        ]}
                      />
                    )
                  }}
                  columns={[
                    {
                      title: 'Date',
                      dataIndex: 'saleDate',
                      render: (v) => dayjs(v).format('DD MMM YYYY')
                    },
                    { title: 'Units', render: (_: unknown, r: any) => r.lines?.length ?? 0 },
                    { title: 'Net', dataIndex: 'netTotal', align: 'right' as const, render: formatRs },
                    { title: 'Discount', dataIndex: 'discount', align: 'right' as const, render: formatRs },
                    { title: 'Paid', dataIndex: 'paidAmount', align: 'right' as const, render: formatRs },
                    {
                      title: 'Due',
                      dataIndex: 'dueAmount',
                      align: 'right' as const,
                      render: (v) =>
                        Number(v) > 0 ? <Text type="danger">{formatRs(v)}</Text> : formatRs(0)
                    }
                  ]}
                />
              )
            },
            {
              key: 'ledger',
              label: `Ledger (${detail.ledger?.length ?? 0})`,
              children: (
                <Table
                  rowKey="id"
                  dataSource={detail.ledger || []}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  columns={[
                    {
                      title: 'Date',
                      dataIndex: 'createdAt',
                      render: (v) => dayjs(v).format('DD MMM YYYY HH:mm')
                    },
                    {
                      title: 'Type',
                      dataIndex: 'type',
                      render: (t) => (
                        <Tag color={LEDGER_TYPE_COLORS[t] || 'default'}>
                          {LEDGER_TYPE_LABELS[t] || formatStatus(t)}
                        </Tag>
                      )
                    },
                    {
                      title: 'Amount',
                      dataIndex: 'amount',
                      align: 'right' as const,
                      render: (v, r: any) => {
                        const isCredit = r.type === 'payment_credit'
                        return (
                          <Text type={isCredit ? 'success' : undefined}>
                            {isCredit ? '−' : '+'}{formatRs(v)}
                          </Text>
                        )
                      }
                    },
                    {
                      title: 'Balance',
                      dataIndex: 'runningBalance',
                      align: 'right' as const,
                      render: (v) => <Text strong>{formatRs(v)}</Text>
                    }
                  ]}
                />
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default CustomerReportDetail
