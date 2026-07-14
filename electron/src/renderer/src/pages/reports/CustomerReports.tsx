import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Col, DatePicker, Input, Row, Statistic, Table, Typography } from 'antd'
import type { TableProps } from 'antd'
import dayjs from 'dayjs'
import { App_Routes } from '@/common'
import { reportAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, PageHeader } from '../shared/page-ui'

const { Text } = Typography
const { RangePicker } = DatePicker

export const CustomerReports = () => {
  const navigate = useNavigate()
  const { companyId } = useSession()
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<any>({ customers: [], summary: {} })
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [balanceSort, setBalanceSort] = useState<'asc' | 'desc'>()

  const load = () => {
    if (!companyId) return
    setLoading(true)
    reportAPI
      .customers(companyId, {
        search: search || undefined,
        from: dateRange?.[0]?.format('YYYY-MM-DD'),
        to: dateRange?.[1]?.format('YYYY-MM-DD'),
        sortField: balanceSort ? 'balance' : undefined,
        sortOrder: balanceSort
      })
      .then(setReport)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [companyId, search, dateRange, balanceSort])

  const summary = report.summary || {}

  const handleTableChange: TableProps<any>['onChange'] = (_pagination, _filters, sorter) => {
    const active = Array.isArray(sorter) ? sorter[0] : sorter
    if (active?.field === 'balance' && active.order) {
      setBalanceSort(active.order === 'ascend' ? 'asc' : 'desc')
    } else {
      setBalanceSort(undefined)
    }
  }

  return (
    <div>
      <PageHeader
        title="Customer Reports"
        subtitle="Browse customers and view purchase history and ledger."
      />

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Total Customers" value={summary.totalCustomers ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="With Outstanding"
              value={summary.customersWithDue ?? 0}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Total Outstanding"
              value={summary.totalOutstanding ?? 0}
              prefix="Rs"
              precision={0}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="shadow-sm">
        <div className="mb-4 flex flex-wrap gap-3">
          <RangePicker
            value={dateRange}
            onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          />
          <Input.Search
            placeholder="Search name, phone, chassis or motor…"
            allowClear
            onSearch={setSearch}
            style={{ width: 300 }}
          />
          <Button
            onClick={() => {
              setSearch('')
              setDateRange(null)
              setBalanceSort(undefined)
            }}
          >
            Reset
          </Button>
        </div>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={report.customers || []}
          onChange={handleTableChange}
          onRow={(r) => ({
            onClick: () => navigate(App_Routes.CUSTOMER_REPORT_DETAIL.replace(':id', r.id)),
            style: { cursor: 'pointer' }
          })}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} customers` }}
          columns={[
            { title: 'Customer', dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
            { title: 'Phone', dataIndex: 'phone', render: (v) => v || '—' },
            { title: 'Address', dataIndex: 'address', render: (v) => v || '—', ellipsis: true },
            {
              title: 'Outstanding',
              dataIndex: 'balance',
              sorter: true,
              sortOrder: balanceSort ? (balanceSort === 'asc' ? 'ascend' : 'descend') : null,
              align: 'right' as const,
              render: (v) => {
                const bal = Number(v ?? 0)
                return bal > 0 ? (
                  <Text type="danger" strong>{formatRs(v)}</Text>
                ) : (
                  formatRs(0)
                )
              }
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default CustomerReports
