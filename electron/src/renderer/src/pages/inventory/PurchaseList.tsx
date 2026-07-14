import { useEffect, useMemo, useState } from 'react'
import { Button, Card, DatePicker, Input, Select, Space, Table, Tooltip } from 'antd'
import type { TableProps } from 'antd'
import { EditOutlined, EyeOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { App_Routes } from '@/common'
import { purchaseAPI, supplierAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, formatAuditUser, PageHeader } from '../shared/page-ui'

const { RangePicker } = DatePicker

export const PurchaseList = () => {
  const navigate = useNavigate()
  const { companyId, branchId } = useSession()
  const [data, setData] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [supplierId, setSupplierId] = useState<string>()
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [totalValueSort, setTotalValueSort] = useState<'asc' | 'desc'>()

  useEffect(() => {
    if (!companyId) return
    supplierAPI.list(companyId).then(setSuppliers)
  }, [companyId])

  const load = () => {
    setLoading(true)
    purchaseAPI
      .list(companyId, branchId, {
        supplierId,
        search: search || undefined,
        fromDate: dateRange?.[0]?.format('YYYY-MM-DD'),
        toDate: dateRange?.[1]?.format('YYYY-MM-DD'),
        sortField: totalValueSort ? 'totalValue' : undefined,
        sortOrder: totalValueSort
      })
      .then(setData)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (companyId && branchId) load()
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

  return (
    <div>
      <PageHeader title="Purchase List" subtitle="History of stock purchases at this branch." />

      <Card bordered={false} className="shadow-sm mb-4">
        <div className="flex flex-wrap gap-3">
          <RangePicker
            value={dateRange}
            onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          />
          <Select
            allowClear
            placeholder="Supplier"
            style={{ width: 200 }}
            options={supplierOptions}
            value={supplierId}
            onChange={setSupplierId}
          />
          <Input.Search
            placeholder="Search chassis or motor number…"
            allowClear
            onSearch={setSearch}
            style={{ width: 260 }}
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
      </Card>

      <Card bordered={false} className="shadow-sm">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          onChange={handleTableChange}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} purchases` }}
          columns={[
            {
              title: 'Date',
              dataIndex: 'purchaseDate',
              render: (v) => dayjs(v).format('DD MMM YYYY')
            },
            {
              title: 'Supplier',
              dataIndex: 'supplier',
              render: (s) => s?.name || '—'
            },
            {
              title: 'Updated by',
              render: (_, r) => formatAuditUser(r.updatedByUser || r.createdByUser)
            },
            {
              title: 'Units',
              dataIndex: 'itemCount',
              align: 'right' as const
            },
            {
              title: 'Total Value',
              dataIndex: 'totalValue',
              sorter: true,
              sortOrder:
                totalValueSort === 'asc'
                  ? 'ascend'
                  : totalValueSort === 'desc'
                    ? 'descend'
                    : null,
              align: 'right' as const,
              render: formatRs
            },
            {
              title: '',
              width: 88,
              render: (_, r) => (
                <Space size={0}>
                  <Button
                    type="text"
                    icon={<EyeOutlined />}
                    onClick={() => navigate(App_Routes.PURCHASE_DETAIL.replace(':id', r.id))}
                  />
                  {r.editable ? (
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => navigate(App_Routes.PURCHASE_EDIT.replace(':id', r.id))}
                    />
                  ) : (
                    <Tooltip title="No in-stock units left to edit">
                      <Button type="text" icon={<EditOutlined />} disabled />
                    </Tooltip>
                  )}
                </Space>
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default PurchaseList
