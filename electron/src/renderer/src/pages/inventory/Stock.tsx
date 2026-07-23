import { useEffect, useMemo, useState } from 'react'
import { Button, Card, DatePicker, Input, Select, Table, Tabs, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { App_Routes } from '@/common'
import {
  categoryAPI,
  colorAPI,
  inventoryAPI,
  partAPI,
  partStockAPI,
  productAPI,
  supplierAPI
} from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, PageHeader } from '../shared/page-ui'
import { STATUS_COLORS, STATUS_OPTIONS } from './inventory-ui'

const { Text } = Typography
const { RangePicker } = DatePicker

type StockTab = 'product' | 'part'

export const Stock = () => {
  const { companyId, branchId } = useSession()
  const navigate = useNavigate()
  const [tab, setTab] = useState<StockTab>('product')

  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>()
  const [productId, setProductId] = useState<string>()
  const [partId, setPartId] = useState<string>()
  const [categoryId, setCategoryId] = useState<string>()
  const [colorId, setColorId] = useState<string>()
  const [supplierId, setSupplierId] = useState<string>()
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)

  const [products, setProducts] = useState<any[]>([])
  const [parts, setParts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [colors, setColors] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])

  useEffect(() => {
    if (!companyId) return
    productAPI.list(companyId).then(setProducts)
    partAPI.list(companyId).then(setParts)
    categoryAPI.list(companyId).then(setCategories)
    colorAPI.list(companyId).then(setColors)
    supplierAPI.list(companyId).then(setSuppliers)
  }, [companyId])

  const resetFilters = () => {
    setSearch('')
    setStatus(undefined)
    setProductId(undefined)
    setPartId(undefined)
    setCategoryId(undefined)
    setColorId(undefined)
    setSupplierId(undefined)
    setDateRange(null)
    setPage(1)
  }

  const handleTabChange = (key: string) => {
    setTab(key as StockTab)
    resetFilters()
    setItems([])
    setTotal(0)
  }

  const load = () => {
    if (!companyId || !branchId) return
    setLoading(true)

    const common = {
      search: search || undefined,
      categoryId,
      supplierId,
      fromDate: dateRange?.[0]?.format('YYYY-MM-DD'),
      toDate: dateRange?.[1]?.format('YYYY-MM-DD'),
      page,
      pageSize
    }

    const request =
      tab === 'product'
        ? inventoryAPI.list(companyId, branchId, {
            ...common,
            status,
            productId,
            colorId
          })
        : partStockAPI.list(companyId, branchId, {
            ...common,
            partId
          })

    request
      .then((res: any) => {
        setItems(res.items || [])
        setTotal(res.total || 0)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [
    companyId,
    branchId,
    tab,
    status,
    search,
    productId,
    partId,
    categoryId,
    colorId,
    supplierId,
    dateRange,
    page,
    pageSize
  ])

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: p.name })),
    [products]
  )
  const partOptions = useMemo(() => parts.map((p) => ({ value: p.id, label: p.name })), [parts])
  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  )
  const colorOptions = useMemo(() => colors.map((c) => ({ value: c.id, label: c.name })), [colors])
  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.name })),
    [suppliers]
  )

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle="Product units and spare-part quantities at this branch."
      />

      <Card bordered={false} className="shadow-sm mb-4">
        <Tabs
          activeKey={tab}
          onChange={handleTabChange}
          items={[
            { key: 'product', label: 'Product' },
            { key: 'part', label: 'Part' }
          ]}
        />

        <div className="flex flex-wrap gap-3">
          <Input.Search
            placeholder={tab === 'product' ? 'Search chassis number…' : 'Search part…'}
            allowClear
            onSearch={(v) => {
              setPage(1)
              setSearch(v)
            }}
            style={{ width: 220 }}
          />
          {tab === 'product' ? (
            <>
              <Select
                allowClear
                placeholder="Status"
                style={{ width: 140 }}
                options={STATUS_OPTIONS}
                value={status}
                onChange={(v) => {
                  setPage(1)
                  setStatus(v)
                }}
              />
              <Select
                allowClear
                placeholder="Product"
                style={{ width: 180 }}
                options={productOptions}
                value={productId}
                onChange={(v) => {
                  setPage(1)
                  setProductId(v)
                }}
              />
              <Select
                allowClear
                placeholder="Color"
                style={{ width: 140 }}
                options={colorOptions}
                value={colorId}
                onChange={(v) => {
                  setPage(1)
                  setColorId(v)
                }}
              />
            </>
          ) : (
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
          )}
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
          <Button onClick={resetFilters}>Reset</Button>
        </div>
      </Card>

      <Card bordered={false} className="shadow-sm">
        {tab === 'product' ? (
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
              {
                title: 'Chassis Number',
                dataIndex: 'serialNumber',
                render: (v) => <Text strong>{v}</Text>
              },
              { title: 'Product', render: (_, r) => r.product?.name || '—' },
              { title: 'Category', render: (_, r) => r.category?.name || '—' },
              { title: 'Color', render: (_, r) => r.color?.name || '—' },
              { title: 'Supplier', render: (_, r) => r.purchase?.supplier?.name || '—' },
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
              {
                title: 'Purchase Price',
                dataIndex: 'purchasePrice',
                align: 'right' as const,
                render: formatRs
              },
              {
                title: 'Warranty',
                render: (_, r) =>
                  r.warrantyActive
                    ? `${r.warrantyYears != null ? `${r.warrantyYears} yr · ` : ''}${
                        r.warrantyExpiryDate ? dayjs(r.warrantyExpiryDate).format('DD MMM YYYY') : '—'
                      }`
                    : 'No'
              }
            ]}
          />
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            dataSource={items}
            onRow={(r) => ({
              onClick: () =>
                navigate(
                  App_Routes.PART_STOCK_DETAIL.replace(':id', r.partId || r.part?.id)
                ),
              style: { cursor: 'pointer' }
            })}
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
              }
            ]}
          />
        )}
      </Card>
    </div>
  )
}

export default Stock
