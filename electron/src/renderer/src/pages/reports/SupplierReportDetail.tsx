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
  purchase_debit: 'Purchase',
  supplier_payment_credit: 'Payment',
  adjustment: 'Adjustment'
}

const LEDGER_TYPE_COLORS: Record<string, string> = {
  purchase_debit: 'orange',
  supplier_payment_credit: 'green',
  adjustment: 'purple'
}

export const SupplierReportDetail = () => {
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
      .supplierDetail(companyId, id, branchId || undefined, filters)
      .then(setDetail)
      .finally(() => setLoading(false))
  }, [companyId, branchId, id, dateRange])

  const filters = periodQuery(dateRange)

  const ledgerParty = useMemo(() => {
    if (!detail?.supplier) return null
    return {
      partyType: 'supplier' as const,
      partyName: detail.supplier.name,
      partyPhone: detail.supplier.phone,
      partyAddress: detail.supplier.address,
      balance: Number(detail.closingBalance ?? detail.supplier.balance ?? 0),
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

  if (!detail?.supplier) {
    return (
      <div>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          className="!px-0 mb-4"
          onClick={() => navigate(App_Routes.SUPPLIER_REPORTS)}
        >
          Back to Supplier Reports
        </Button>
        <Text type="secondary">Supplier not found.</Text>
      </div>
    )
  }

  const supplier = detail.supplier
  const summary = detail.summary || {}
  const payable = Number(supplier.balance || 0)
  const paymentRate = Number(summary.paymentRate || 0)

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
        onClick={() => navigate(App_Routes.SUPPLIER_REPORTS)}
      >
        Back to Supplier Reports
      </Button>

      <PageHeader
        title="Supplier Report"
        subtitle="Purchases, payments, and payable ledger for this supplier."
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
            background: 'linear-gradient(135deg, #f8fafc 0%, #ecfdf5 100%)'
          }
        }}
      >
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={10}>
            <Text type="secondary">Supplier</Text>
            <Title level={3} style={{ margin: '4px 0 8px' }}>
              {supplier.name}
            </Title>
            <Space direction="vertical" size={2}>
              <Text type="secondary">Phone · {supplier.phone || '—'}</Text>
              <Text type="secondary">Address · {supplier.address || '—'}</Text>
            </Space>
          </Col>
          <Col xs={12} md={7}>
            <Statistic
              title="Current payable"
              value={payable}
              formatter={() => (
                <span title={formatRs(payable)}>{formatCompactRs(payable)}</span>
              )}
              valueStyle={{ color: payable > 0 ? '#cf1322' : '#389e0d' }}
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
              title="Purchases"
              value={summary.purchaseCount ?? 0}
              formatter={() => formatCompact(summary.purchaseCount ?? 0)}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm h-full">
            <Statistic
              title="Products"
              value={summary.productPurchaseCount ?? 0}
              formatter={() => formatCompact(summary.productPurchaseCount ?? 0)}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} className="shadow-sm h-full">
            <Statistic
              title="Parts"
              value={summary.partPurchaseCount ?? 0}
              formatter={() => formatCompact(summary.partPurchaseCount ?? 0)}
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
              title="Paid"
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
              title="Avg purchase"
              value={summary.avgPurchase ?? 0}
              formatter={() => (
                <span title={formatRs(summary.avgPurchase)}>
                  {formatCompactRs(summary.avgPurchase)}
                </span>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} md={8}>
          <Card bordered={false} className="shadow-sm h-full" title="Payment coverage">
            <Progress
              percent={Math.min(100, Math.round(paymentRate))}
              strokeColor={paymentRate >= 80 ? '#389e0d' : paymentRate >= 50 ? '#fa8c16' : '#cf1322'}
              format={(p) => `${p}%`}
            />
            <Text type="secondary">
              Paid vs purchased in {periodLabel(dateRange).toLowerCase()}
            </Text>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card bordered={false} className="shadow-sm h-full" title="Ledger movement">
            <Space direction="vertical" size={8} className="w-full">
              <div className="flex justify-between">
                <Text type="secondary">Debits (purchases)</Text>
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
                <Text type="secondary">Last purchase</Text>
                <Text>
                  {summary.lastPurchaseDate
                    ? dayjs(summary.lastPurchaseDate).format('DD MMM YYYY')
                    : '—'}
                </Text>
              </div>
              <div className="flex justify-between">
                <Text type="secondary">Purchase due</Text>
                <Text
                  type={Number(summary.totalDue) > 0 ? 'danger' : undefined}
                  strong
                  title={formatRs(summary.totalDue)}
                >
                  {formatCompactRs(summary.totalDue)}
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
              key: 'purchases',
              label: `Purchases (${detail.purchases?.length ?? 0})`,
              children: (
                <Table
                  rowKey="id"
                  dataSource={detail.purchases || []}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  columns={[
                    {
                      title: 'Date',
                      dataIndex: 'purchaseDate',
                      render: (v) => dayjs(v).format('DD MMM YYYY')
                    },
                    {
                      title: 'Type',
                      dataIndex: 'kind',
                      render: (v) => (
                        <Tag color={v === 'part' ? 'purple' : 'blue'}>
                          {v === 'part' ? 'Parts' : 'Product'}
                        </Tag>
                      )
                    },
                    { title: 'Net', dataIndex: 'netTotal', align: 'right' as const, render: formatRs },
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
                        const isCredit = r.type === 'supplier_payment_credit'
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

export default SupplierReportDetail
