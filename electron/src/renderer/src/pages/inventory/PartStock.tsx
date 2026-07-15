import { useEffect, useMemo, useState } from 'react'
import { Button, Card, DatePicker, Input, Select, Table, Typography } from 'antd'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { App_Routes } from '@/common'
import { categoryAPI, partAPI, partStockAPI, supplierAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, PageHeader } from '../shared/page-ui'

const { Text } = Typography
const { RangePicker } = DatePicker

export const PartStock = () => {
  const { companyId, branchId } = useSession()
  const navigate = useNavigate()
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [partId, setPartId] = useState<string>()
  const [categoryId, setCategoryId] = useState<string>()
  const [supplierId, setSupplierId] = useState<string>()
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [parts, setParts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])

  useEffect(() => {
    if (!companyId) return
    partAPI.list(companyId).then(setParts)
    categoryAPI.list(companyId).then(setCategories)
    supplierAPI.list(companyId).then(setSuppliers)
  }, [companyId])

  const load = () => {
    if (!companyId || !branchId) return
    setLoading(true)
    partStockAPI
      .list(companyId, branchId, {
        search: search || undefined,
        partId,
        categoryId,
        supplierId,
        fromDate: dateRange?.[0]?.format('YYYY-MM-DD'),
        toDate: dateRange?.[1]?.format('YYYY-MM-DD'),
        page,
        pageSize
      })
      .then((res: any) => {
        setItems(res.items || [])
        setTotal(res.total || 0)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [companyId, branchId, search, partId, categoryId, supplierId, dateRange, page, pageSize])

  const partOptions = useMemo(() => parts.map((p) => ({ value: p.id, label: p.name })), [parts])
  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  )
  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.name })),
    [suppliers]
  )

  return (
    <div>
      <PageHeader
        title="Parts Stock"
        subtitle="Available units of each spare part at this branch."
      />

      <Card bordered={false} className="shadow-sm mb-4">
        <div className="flex flex-wrap gap-3">
          <Input.Search
            placeholder="Search part…"
            allowClear
            onSearch={(v) => {
              setPage(1)
              setSearch(v)
            }}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            placeholder="Part"
            style={{ width: 180 }}
            options={partOptions}
            value={partId}
            onChange={(v) => {
              setPage(1)
              setPartId(v)
            }}
          />
          <Select
            allowClear
            placeholder="Category"
            style={{ width: 160 }}
            options={categoryOptions}
            value={categoryId}
            onChange={(v) => {
              setPage(1)
              setCategoryId(v)
            }}
          />
          <Select
            allowClear
            placeholder="Supplier"
            style={{ width: 180 }}
            options={supplierOptions}
            value={supplierId}
            onChange={(v) => {
              setPage(1)
              setSupplierId(v)
            }}
          />
          <RangePicker
            value={dateRange}
            onChange={(v) => {
              setPage(1)
              setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)
            }}
          />
          <Button
            onClick={() => {
              setSearch('')
              setPartId(undefined)
              setCategoryId(undefined)
              setSupplierId(undefined)
              setDateRange(null)
              setPage(1)
            }}
          >
            Reset
          </Button>
        </div>
      </Card>

      <Card bordered={false} className="shadow-sm">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `${t} parts`,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            }
          }}
          columns={[
            {
              title: 'Part',
              dataIndex: 'part',
              render: (p) => <Text strong>{p?.name || '—'}</Text>
            },
            {
              title: 'Category',
              dataIndex: 'category',
              render: (c) => c?.name || '—'
            },
            {
              title: 'Available units',
              dataIndex: 'quantityOnHand',
              align: 'right' as const,
              render: (v) => <Text strong>{Number(v || 0)}</Text>
            },
            {
              title: 'Retail price',
              dataIndex: 'sellingPrice',
              align: 'right' as const,
              render: (v) => formatRs(Number(v || 0))
            },
            {
              title: 'Avg cost',
              dataIndex: 'averageCost',
              align: 'right' as const,
              render: (v) => formatRs(Number(v || 0))
            },
            {
              title: '',
              width: 100,
              render: (_, r) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() =>
                    navigate(App_Routes.PART_STOCK_DETAIL.replace(':id', r.partId || r.part?.id))
                  }
                >
                  History
                </Button>
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default PartStock
