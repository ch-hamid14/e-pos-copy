import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Col, DatePicker, Input, Row, Select, Statistic, Table, Typography } from 'antd'
import type { TableProps } from 'antd'
import dayjs from 'dayjs'
import { customerAPI, reportAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, PageHeader } from '../shared/page-ui'

const { Text } = Typography
const { RangePicker } = DatePicker

type SaleReportSortField = 'netTotal' | 'discount' | 'paidAmount' | 'dueAmount'

export const SaleReports = () => {
  const { companyId, branchId } = useSession()
  const [loading, setLoading] = useState(false)
  const [customers, setCustomers] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<string>()
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [sortField, setSortField] = useState<SaleReportSortField>()
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>()
  const [report, setReport] = useState<any>({ sales: [], summary: {} })

  useEffect(() => {
    if (!companyId) return
    customerAPI.list(companyId).then(setCustomers)
  }, [companyId])

  const load = () => {
    if (!companyId || !branchId) return
    setLoading(true)
    reportAPI
      .sales(companyId, branchId, {
        from: dateRange?.[0]?.format('YYYY-MM-DD'),
        to: dateRange?.[1]?.format('YYYY-MM-DD'),
        customerId,
        search: search || undefined,
        sortField,
        sortOrder
      })
      .then(setReport)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [companyId, branchId, customerId, search, dateRange, sortField, sortOrder])

  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.name })),
    [customers]
  )

  const columnSortOrder = (field: SaleReportSortField) =>
    sortField === field ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null

  const handleTableChange: TableProps<any>['onChange'] = (_pagination, _filters, sorter) => {
    const active = Array.isArray(sorter) ? sorter[0] : sorter
    if (
      active?.order &&
      (active.field === 'netTotal' ||
        active.field === 'discount' ||
        active.field === 'paidAmount' ||
        active.field === 'dueAmount')
    ) {
      setSortField(active.field as SaleReportSortField)
      setSortOrder(active.order === 'ascend' ? 'asc' : 'desc')
    } else {
      setSortField(undefined)
      setSortOrder(undefined)
    }
  }

  const summary = report.summary || {}

  return (
    <div>
      <PageHeader title="Sale Reports" subtitle="Sales performance and collections." />

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Sales" value={summary.count ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Net Total" value={summary.netTotal ?? 0} prefix="Rs" precision={0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Collected" value={summary.paidAmount ?? 0} prefix="Rs" precision={0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Outstanding"
              value={summary.dueAmount ?? 0}
              prefix="Rs"
              precision={0}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="shadow-sm">
        <div className="mb-4 flex flex-wrap gap-3">
          <Input.Search
            placeholder="Serial or motor number"
            allowClear
            onSearch={setSearch}
            style={{ width: 240 }}
          />
          <RangePicker
            value={dateRange}
            onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Customer"
            style={{ width: 220 }}
            options={customerOptions}
            value={customerId}
            onChange={setCustomerId}
          />
          <Button
            onClick={() => {
              setCustomerId(undefined)
              setSearch('')
              setDateRange(null)
              setSortField(undefined)
              setSortOrder(undefined)
            }}
          >
            Reset
          </Button>
        </div>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={report.sales || []}
          onChange={handleTableChange}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} sales` }}
          columns={[
            {
              title: 'Date',
              dataIndex: 'saleDate',
              render: (v) => dayjs(v).format('DD MMM YYYY')
            },
            { title: 'Customer', render: (_: unknown, r: any) => r.customer?.name || '—' },
            {
              title: 'Net Total',
              dataIndex: 'netTotal',
              sorter: true,
              sortOrder: columnSortOrder('netTotal'),
              align: 'right' as const,
              render: formatRs
            },
            {
              title: 'Discount',
              dataIndex: 'discount',
              sorter: true,
              sortOrder: columnSortOrder('discount'),
              align: 'right' as const,
              render: formatRs
            },
            {
              title: 'Paid',
              dataIndex: 'paidAmount',
              sorter: true,
              sortOrder: columnSortOrder('paidAmount'),
              align: 'right' as const,
              render: formatRs
            },
            {
              title: 'Due',
              dataIndex: 'dueAmount',
              sorter: true,
              sortOrder: columnSortOrder('dueAmount'),
              align: 'right' as const,
              render: (v) => (
                Number(v) > 0 ? <Text type="danger">{formatRs(v)}</Text> : formatRs(0)
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default SaleReports
