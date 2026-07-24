import { useEffect, useMemo, useState } from 'react'
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
  Typography,
  message
} from 'antd'
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { App_Routes } from '@/common'
import { reportAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { useLedgerPrint } from '@/renderer/hooks/useLedgerPrint'
import { formatRs, formatStatus, PageHeader } from '../shared/page-ui'

const { Text } = Typography

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
  const { printLedger, downloadLedger } = useLedgerPrint()

  useEffect(() => {
    if (!companyId || !id) return
    setLoading(true)
    reportAPI
      .supplierDetail(companyId, id, branchId || undefined)
      .then(setDetail)
      .finally(() => setLoading(false))
  }, [companyId, branchId, id])

  const ledgerParty = useMemo(() => {
    if (!detail?.supplier) return null
    return {
      partyType: 'supplier' as const,
      partyName: detail.supplier.name,
      partyPhone: detail.supplier.phone,
      partyAddress: detail.supplier.address,
      balance: Number(detail.supplier.balance || 0),
      ledger: detail.ledger || []
    }
  }, [detail])

  const printCompany = useMemo(
    () =>
      detail?.printCompany || {
        name: branchName || 'Company',
        phone: '',
        address: ''
      },
    [detail, branchName]
  )

  if (loading) {
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
        title={supplier.name}
        subtitle="Purchase history and payable ledger."
        extra={
          <Button
            icon={<PrinterOutlined />}
            onClick={async () => {
              if (!ledgerParty) return
              try {
                await printLedger(ledgerParty, printCompany)
              } catch (err: any) {
                message.error(err.message || 'Print failed')
              }
            }}
          >
            Print Ledger
          </Button>
        }
      />

      <Card bordered={false} className="shadow-sm mb-4">
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="Phone">{supplier.phone || '—'}</Descriptions.Item>
          <Descriptions.Item label="Address">{supplier.address || '—'}</Descriptions.Item>
          <Descriptions.Item label="Payable">
            {Number(supplier.balance) > 0 ? (
              <Text type="danger" strong>
                {formatRs(supplier.balance)}
              </Text>
            ) : (
              formatRs(0)
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={12} sm={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Purchases" value={detail.summary?.purchaseCount ?? 0} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Total Purchased" value={detail.summary?.totalNet ?? 0} prefix="Rs" precision={0} />
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
                <>
                  <div className="mb-3 flex justify-end">
                    <Button
                      size="small"
                      onClick={async () => {
                        if (!ledgerParty) return
                        try {
                          const result = await downloadLedger(ledgerParty, printCompany)
                          if (result.saved) message.success('Ledger PDF saved to Downloads')
                        } catch (err: any) {
                          message.error(err.message || 'Download failed')
                        }
                      }}
                    >
                      Download PDF
                    </Button>
                  </div>
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
                </>
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default SupplierReportDetail
