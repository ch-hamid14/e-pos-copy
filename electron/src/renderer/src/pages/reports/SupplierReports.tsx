import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Col, Input, Row, Statistic, Table, Typography } from 'antd'
import type { TableProps } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import { App_Routes } from '@/common'
import { reportAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, PageHeader } from '../shared/page-ui'

const { Text } = Typography

export const SupplierReports = () => {
  const navigate = useNavigate()
  const { companyId } = useSession()
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<any>({ suppliers: [], summary: {} })
  const [search, setSearch] = useState('')
  const [balanceSort, setBalanceSort] = useState<'asc' | 'desc'>()

  const load = () => {
    if (!companyId) return
    setLoading(true)
    reportAPI
      .suppliers(companyId, {
        search: search || undefined,
        sortField: balanceSort ? 'balance' : undefined,
        sortOrder: balanceSort
      })
      .then(setReport)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [companyId, search, balanceSort])

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
        title="Supplier Reports"
        subtitle="Browse suppliers and view purchase history and payable ledger."
      />

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Total Suppliers" value={summary.totalSuppliers ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="With Outstanding"
              value={summary.suppliersWithDue ?? 0}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Total Payable"
              value={summary.totalOutstanding ?? 0}
              prefix="Rs"
              precision={0}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="shadow-sm">
        <div className="mb-4">
          <Input.Search
            placeholder="Search supplier…"
            allowClear
            onSearch={setSearch}
            style={{ width: 280 }}
          />
        </div>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={report.suppliers || []}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          onChange={handleTableChange}
          onRow={(record) => ({
            onClick: () => navigate(App_Routes.SUPPLIER_REPORT_DETAIL.replace(':id', record.id)),
            style: { cursor: 'pointer' }
          })}
          columns={[
            { title: 'Name', dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
            { title: 'Phone', dataIndex: 'phone', render: (v) => v || '—' },
            {
              title: 'Balance (We Owe)',
              dataIndex: 'balance',
              sorter: true,
              sortOrder:
                balanceSort === 'asc' ? 'ascend' : balanceSort === 'desc' ? 'descend' : undefined,
              align: 'right' as const,
              render: (v) =>
                Number(v) > 0 ? (
                  <Text type="danger" strong>
                    {formatRs(v)}
                  </Text>
                ) : (
                  formatRs(0)
                )
            },
            {
              title: '',
              width: 110,
              render: (_, r) => (
                <Button
                  type="link"
                  size="small"
                  icon={<FileTextOutlined />}
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(App_Routes.SUPPLIER_REPORT_DETAIL.replace(':id', r.id))
                  }}
                >
                  Report
                </Button>
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default SupplierReports
