import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  message
} from 'antd'
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  PrinterOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { App_Routes } from '@/common'
import { reportAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { useLedgerPrint } from '@/renderer/hooks/useLedgerPrint'
import { formatCompact, formatCompactRs, formatRs, formatStatus, PageHeader } from '../shared/page-ui'
import {
  ReportPeriodFilter,
  periodLabel,
  periodQuery,
  type ReportDateRange
} from './ReportPeriodFilter'

const { Text, Title } = Typography

const LEDGER_TYPE_LABELS: Record<string, string> = {
  opening_balance: 'Opening Balance',
  sale_debit: 'Sale',
  payment_credit: 'Payment',
  adjustment: 'Adjustment'
}

const LEDGER_REFERENCE_LABELS: Record<string, string> = {
  payment_edit: 'Payment adjustment',
  sale_edit: 'Sale adjustment',
  sale_void: 'Void reversal',
  sale_reconcile: 'Reconciliation'
}

function ledgerEntryLabel(entry: { type?: string; referenceType?: string }): string {
  const ref = entry.referenceType ? LEDGER_REFERENCE_LABELS[entry.referenceType] : undefined
  if (ref) return ref
  const t = entry.type || ''
  return LEDGER_TYPE_LABELS[t] || formatStatus(t)
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
  const { companyId, branchId, branchName } = useSession()
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)
  const [dateRange, setDateRange] = useState<ReportDateRange>(null)
  const { printLedger, downloadLedger } = useLedgerPrint()

  useEffect(() => {
    if (!companyId || !id) return
    setLoading(true)
    const filters = periodQuery(dateRange)
    reportAPI
      .customerDetail(companyId, id, branchId || undefined, filters)
      .then(setDetail)
      .finally(() => setLoading(false))
  }, [companyId, branchId, id, dateRange])

  const filters = periodQuery(dateRange)

  const ledgerParty = useMemo(() => {
    if (!detail?.customer) return null
    return {
      partyType: 'customer' as const,
      partyName: detail.customer.name,
      partyPhone: detail.customer.phone,
      partyAddress: detail.customer.address,
      balance: Number(detail.closingBalance ?? detail.customer.balance ?? 0),
      openingBalance: Number(detail.openingBalance ?? 0),
      ledger: detail.ledger || [],
      fromDate: filters.from,
      toDate: filters.to
    }
  }, [detail, filters.from, filters.to])

  const printCompany = useMemo(
    () =>
      detail?.printCompany || {
        name: branchName || 'Company',
        phone: '',
        address: ''
      },
    [detail, branchName]
  )

  if (loading && !detail) {
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
  const summary = detail.summary || {}
  const outstanding = Number(customer.balance || 0)
  const collectionRate = Number(summary.collectionRate || 0)

  const runPrint = async () => {
    if (!ledgerParty) return
    try {
      await printLedger(ledgerParty, printCompany)
    } catch (err: any) {
      message.error(err.message || 'Print failed')
    }
  }

  const runDownload = async () => {
    if (!ledgerParty) return
    try {
      const result = await downloadLedger(ledgerParty, printCompany)
      if (result.saved) message.success('Ledger PDF saved to Downloads')
    } catch (err: any) {
      message.error(err.message || 'Download failed')
    }
  }

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
        title="Customer Report"
        subtitle="Sales, collections, and account ledger for this customer."
        extra={
          <Space wrap>
            <Button icon={<DownloadOutlined />} onClick={runDownload}>
              Download PDF
            </Button>
            <Button type="primary" icon={<PrinterOutlined />} onClick={runPrint}>
              Print Ledger
            </Button>
          </Space>
        }
      />

      <Card bordered={false} className="shadow-sm mb-4" styles={{ body: { paddingBottom: 16 } }}>
        <ReportPeriodFilter value={dateRange} onChange={setDateRange} />
      </Card>

      <Card
        bordered={false}
        className="shadow-sm mb-4"
        styles={{
          body: {
            background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)'
          }
        }}
      >
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={10}>
            <Text type="secondary">Customer</Text>
            <Title level={3} style={{ margin: '4px 0 8px' }}>
              {customer.name}
            </Title>
            <Space direction="vertical" size={2}>
              <Text type="secondary">Phone · {customer.phone || '—'}</Text>
              <Text type="secondary">CNIC · {customer.cnic || '—'}</Text>
              <Text type="secondary">Address · {customer.address || '—'}</Text>
            </Space>
          </Col>
          <Col xs={12} md={7}>
            <Statistic
              title="Current receivable"
              value={outstanding}
              formatter={() => (
                <span title={formatRs(outstanding)}>{formatCompactRs(outstanding)}</span>
              )}
              valueStyle={{ color: outstanding > 0 ? '#cf1322' : '#389e0d' }}
            />
            <Text type="secondary" className="text-xs">
              Live balance (all time)
            </Text>
          </Col>
          <Col xs={12} md={7}>
            <Statistic
              title="Period closing"
              value={Number(detail.closingBalance ?? 0)}
              formatter={() => (
                <span title={formatRs(detail.closingBalance)}>
                  {formatCompactRs(detail.closingBalance)}
                </span>
              )}
            />
            <Text type="secondary" className="text-xs" title={formatRs(detail.openingBalance)}>
              Opening {formatCompactRs(detail.openingBalance)} · {periodLabel(dateRange)}
            </Text>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm h-full">
            <Statistic
              title="Sales"
              value={summary.saleCount ?? 0}
              formatter={() => formatCompact(summary.saleCount ?? 0)}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm h-full">
            <Statistic
              title="Units"
              value={summary.unitsSold ?? 0}
              formatter={() => formatCompact(summary.unitsSold ?? 0)}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm h-full">
            <Statistic
              title="Purchased"
              value={summary.totalNet ?? 0}
              formatter={() => (
                <span title={formatRs(summary.totalNet)}>{formatCompactRs(summary.totalNet)}</span>
              )}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm h-full">
            <Statistic
              title="Collected"
              value={summary.totalPaid ?? 0}
              formatter={() => (
                <span title={formatRs(summary.totalPaid)}>{formatCompactRs(summary.totalPaid)}</span>
              )}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm h-full">
            <Statistic
              title="Sale due"
              value={summary.totalDue ?? 0}
              formatter={() => (
                <span title={formatRs(summary.totalDue)}>{formatCompactRs(summary.totalDue)}</span>
              )}
              valueStyle={{ color: Number(summary.totalDue) > 0 ? '#cf1322' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm h-full">
            <Statistic
              title="Avg sale"
              value={summary.avgSale ?? 0}
              formatter={() => (
                <span title={formatRs(summary.avgSale)}>{formatCompactRs(summary.avgSale)}</span>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} md={8}>
          <Card bordered={false} className="shadow-sm h-full" title="Collection rate">
            <Progress
              percent={Math.min(100, Math.round(collectionRate))}
              strokeColor={collectionRate >= 80 ? '#389e0d' : collectionRate >= 50 ? '#fa8c16' : '#cf1322'}
              format={(p) => `${p}%`}
            />
            <Text type="secondary">
              Paid vs billed in {periodLabel(dateRange).toLowerCase()}
            </Text>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card bordered={false} className="shadow-sm h-full" title="Ledger movement">
            <Space direction="vertical" size={8} className="w-full">
              <div className="flex justify-between">
                <Text type="secondary">Debits (sales)</Text>
                <Text strong title={formatRs(summary.periodDebits)}>
                  {formatCompactRs(summary.periodDebits)}
                </Text>
              </div>
              <div className="flex justify-between">
                <Text type="secondary">Credits (payments)</Text>
                <Text type="success" strong title={formatRs(summary.periodCredits)}>
                  {formatCompactRs(summary.periodCredits)}
                </Text>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2">
                <Text type="secondary">Net change</Text>
                <Text
                  strong
                  title={formatRs(
                    Number(summary.periodDebits || 0) - Number(summary.periodCredits || 0)
                  )}
                >
                  {formatCompactRs(
                    Number(summary.periodDebits || 0) - Number(summary.periodCredits || 0)
                  )}
                </Text>
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card bordered={false} className="shadow-sm h-full" title="Activity">
            <Space direction="vertical" size={8} className="w-full">
              <div className="flex justify-between">
                <Text type="secondary">Last sale</Text>
                <Text>
                  {summary.lastSaleDate
                    ? dayjs(summary.lastSaleDate).format('DD MMM YYYY')
                    : '—'}
                </Text>
              </div>
              <div className="flex justify-between">
                <Text type="secondary">Top product</Text>
                <Text ellipsis style={{ maxWidth: 160 }}>
                  {summary.topProduct
                    ? `${summary.topProduct} (${summary.topProductUnits})`
                    : '—'}
                </Text>
              </div>
              <div className="flex justify-between">
                <Text type="secondary">Ledger rows</Text>
                <Text>{detail.ledger?.length ?? 0}</Text>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="shadow-sm" loading={loading}>
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
                          { title: 'Chassis Number', dataIndex: 'serialNumber' },
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
                      render: (_t, r: any) => (
                        <Tag color={LEDGER_TYPE_COLORS[r.type] || 'default'}>
                          {ledgerEntryLabel(r)}
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
                            {isCredit ? '−' : '+'}
                            {formatRs(v)}
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
