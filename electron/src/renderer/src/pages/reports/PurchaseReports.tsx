import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Col, DatePicker, Input, Row, Select, Statistic, Table } from 'antd'
import type { TableProps } from 'antd'
import dayjs from 'dayjs'
import { reportAPI, supplierAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, PageHeader } from '../shared/page-ui'

const { RangePicker } = DatePicker

export const PurchaseReports = () => {
  const { companyId, branchId } = useSession()
  const [loading, setLoading] = useState(false)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<string>()
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [totalValueSort, setTotalValueSort] = useState<'asc' | 'desc'>()
  const [report, setReport] = useState<any>({ purchases: [], summary: {} })

  useEffect(() => {
    if (!companyId) return
    supplierAPI.list(companyId).then(setSuppliers)
  }, [companyId])

  const load = () => {
    if (!companyId || !branchId) return
    setLoading(true)
    reportAPI
      .purchases(companyId, branchId, {
        from: dateRange?.[0]?.format('YYYY-MM-DD'),
        to: dateRange?.[1]?.format('YYYY-MM-DD'),
        supplierId,
        search: search || undefined,
        sortField: totalValueSort ? 'totalValue' : undefined,
        sortOrder: totalValueSort
      })
      .then(setReport)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [companyId, branchId, supplierId, search, dateRange, totalValueSort])

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.name })),
    [suppliers]
  )

  const handleTableChange: TableProps<any>['onChange'] = (_pagination, _filters, sorter) => {
    const active = Array.isArray(sorter) ? sorter[0] : sorter
    if (active?.field === 'totalValue' && active.order) {
      setTotalValueSort(active.order === 'ascend' ? 'asc' : 'desc')
    } else {
      setTotalValueSort(undefined)
    }
  }

  const summary = report.summary || {}

  return (
    <div>
      <PageHeader title="Purchase Reports" subtitle="Purchase volume and cost analysis." />

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Purchases" value={summary.count ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Units Received" value={summary.unitCount ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Total Cost" value={summary.totalValue ?? 0} prefix="Rs" precision={0} />
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
            placeholder="Supplier"
            style={{ width: 220 }}
            options={supplierOptions}
            value={supplierId}
            onChange={setSupplierId}
          />
          <Button
            onClick={() => {
              setSupplierId(undefined)
              setSearch('')
              setDateRange(null)
              setTotalValueSort(undefined)
            }}
          >
            Reset
          </Button>
        </div>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={report.purchases || []}
          onChange={handleTableChange}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} purchases` }}
          columns={[
            {
              title: 'Date',
              dataIndex: 'purchaseDate',
              render: (v) => dayjs(v).format('DD MMM YYYY')
            },
            { title: 'Supplier', render: (_: unknown, r: any) => r.supplier?.name || '—' },
            { title: 'Units', dataIndex: 'itemCount', align: 'center' as const },
            {
              title: 'Total Cost',
              dataIndex: 'totalValue',
              sorter: true,
              sortOrder: totalValueSort ? (totalValueSort === 'asc' ? 'ascend' : 'descend') : null,
              align: 'right' as const,
              render: formatRs
            },
            { title: 'Notes', dataIndex: 'notes', render: (v) => v || '—' }
          ]}
        />
      </Card>
    </div>
  )
}

export default PurchaseReports
