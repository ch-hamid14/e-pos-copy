import { useEffect, useMemo, useState } from 'react'
import { Button, Card, DatePicker, Input, Select, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { App_Routes } from '@/common'
import {
  categoryAPI,
  colorAPI,
  inventoryAPI,
  productAPI
} from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, PageHeader } from '../shared/page-ui'
import { STATUS_COLORS, STATUS_OPTIONS } from './inventory-ui'

const { Text } = Typography
const { RangePicker } = DatePicker

export const Stock = () => {
  const { companyId, branchId } = useSession()
  const navigate = useNavigate()
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string>()
  const [search, setSearch] = useState('')
  const [productId, setProductId] = useState<string>()
  const [categoryId, setCategoryId] = useState<string>()
  const [colorId, setColorId] = useState<string>()
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [colors, setColors] = useState<any[]>([])

  useEffect(() => {
    if (!companyId) return
    productAPI.list(companyId).then(setProducts)
    categoryAPI.list(companyId).then(setCategories)
    colorAPI.list(companyId).then(setColors)
  }, [companyId])

  const load = () => {
    if (!companyId || !branchId) return
    setLoading(true)
    inventoryAPI
      .list(companyId, branchId, {
        status,
        search: search || undefined,
        productId,
        categoryId,
        colorId,
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
  }, [companyId, branchId, status, search, productId, categoryId, colorId, dateRange, page, pageSize])

  const productOptions = useMemo(() => products.map((p) => ({ value: p.id, label: p.name })), [products])
  const categoryOptions = useMemo(() => categories.map((c) => ({ value: c.id, label: c.name })), [categories])
  const colorOptions = useMemo(() => colors.map((c) => ({ value: c.id, label: c.name })), [colors])

  return (
    <div>
      <PageHeader title="Stock" subtitle="All serialized units at this branch." />

      <Card bordered={false} className="shadow-sm mb-4">
        <div className="flex flex-wrap gap-3">
          <Input.Search
            placeholder="Search serial number…"
            allowClear
            onSearch={(v) => { setPage(1); setSearch(v) }}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            placeholder="Status"
            style={{ width: 140 }}
            options={STATUS_OPTIONS}
            value={status}
            onChange={(v) => { setPage(1); setStatus(v) }}
          />
          <Select
            allowClear
            placeholder="Product"
            style={{ width: 180 }}
            options={productOptions}
            value={productId}
            onChange={(v) => { setPage(1); setProductId(v) }}
          />
          <Select
            allowClear
            placeholder="Category"
            style={{ width: 160 }}
            options={categoryOptions}
            value={categoryId}
            onChange={(v) => { setPage(1); setCategoryId(v) }}
          />
          <Select
            allowClear
            placeholder="Color"
            style={{ width: 140 }}
            options={colorOptions}
            value={colorId}
            onChange={(v) => { setPage(1); setColorId(v) }}
          />
          <RangePicker
            value={dateRange}
            onChange={(v) => { setPage(1); setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null) }}
          />
          <Button onClick={() => {
            setStatus(undefined)
            setSearch('')
            setProductId(undefined)
            setCategoryId(undefined)
            setColorId(undefined)
            setDateRange(null)
            setPage(1)
          }}>
            Reset
          </Button>
        </div>
      </Card>

      <Card bordered={false} className="shadow-sm">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          onRow={(r) => ({
            onClick: () => navigate(App_Routes.STOCK_DETAIL.replace(':id', r.id)),
            style: { cursor: 'pointer' }
          })}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `${t} units`,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            }
          }}
          columns={[
            { title: 'Serial', dataIndex: 'serialNumber', render: (v) => <Text strong>{v}</Text> },
            { title: 'Product', render: (_, r) => r.product?.name || '—' },
            { title: 'Category', render: (_, r) => r.category?.name || '—' },
            { title: 'Color', render: (_, r) => r.color?.name || '—' },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (s) => <Tag color={STATUS_COLORS[s]}>{s?.replace(/_/g, ' ')}</Tag>
            },
            {
              title: 'Purchased',
              dataIndex: 'purchasedAt',
              render: (v) => (v ? dayjs(v).format('DD MMM YYYY') : '—')
            },
            { title: 'Purchase Price', dataIndex: 'purchasePrice', align: 'right' as const, render: formatRs },
            {
              title: 'Warranty Active',
              render: (_, r) => (r.warrantyActive ? dayjs(r.warrantyExpiryDate).format('DD MMM YYYY') : 'No')
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default Stock
