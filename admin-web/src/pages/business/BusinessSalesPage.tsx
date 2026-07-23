import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { EyeOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Input, Select, Space, Table, Tag, message } from 'antd'
import { listBusinessSales } from '../../api/admin'
import { useAuth } from '../../context/AuthContext'
import type { BusinessSaleRow } from '../../types'
import { formatDate, formatRs } from './format'

type Ctx = { companyId: string; companyName: string }

export default function BusinessSalesPage() {
  const { token } = useAuth()
  const { companyId } = useOutletContext<Ctx>()
  const { id } = useParams()
  const navigate = useNavigate()
  const [rows, setRows] = useState<BusinessSaleRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState<'active' | 'include' | 'only'>('active')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!token || !companyId) return
    setLoading(true)
    try {
      const result = await listBusinessSales(token, companyId, {
        page,
        pageSize: 25,
        search: search || undefined,
        visibility
      })
      setRows(result.rows)
      setTotal(result.total)
    } catch (err: any) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token, companyId, page, visibility])

  return (
    <div>
      <div className="madix-page-header">
        <div>
          <h1>Sales</h1>
          <p>Browse invoices like POS — open a sale to reconcile or void.</p>
        </div>
      </div>

      <div className="madix-panel">
        <div className="madix-panel__head">
          <h2 className="madix-panel__title">{total} sales</h2>
          <Space wrap>
            <Select
              value={visibility}
              onChange={(v) => {
                setPage(1)
                setVisibility(v)
              }}
              style={{ width: 170 }}
              options={[
                { value: 'active', label: 'Hide voided' },
                { value: 'include', label: 'Include voided' },
                { value: 'only', label: 'Only voided' }
              ]}
            />
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Customer, chassis, product"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={() => {
                setPage(1)
                load()
              }}
              style={{ width: 260 }}
            />
            <Button
              onClick={() => {
                setPage(1)
                load()
              }}
            >
              Search
            </Button>
          </Space>
        </div>
        <Table<BusinessSaleRow>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{
            current: page,
            pageSize: 25,
            total,
            onChange: setPage,
            showSizeChanger: false
          }}
          columns={[
            {
              title: 'Bill',
              dataIndex: 'billNo',
              width: 80,
              render: (v) => (v ? `#${v}` : '—')
            },
            {
              title: 'Date',
              dataIndex: 'saleDate',
              width: 120,
              render: formatDate
            },
            {
              title: 'Customer',
              render: (_, r) => r.customer?.name || '—'
            },
            {
              title: 'Branch',
              dataIndex: 'branchName',
              render: (v) => v || '—'
            },
            {
              title: 'Net',
              dataIndex: 'netTotal',
              align: 'right',
              render: formatRs
            },
            {
              title: 'Paid',
              dataIndex: 'paidAmount',
              align: 'right',
              render: formatRs
            },
            {
              title: 'Due',
              dataIndex: 'dueAmount',
              align: 'right',
              render: (v) =>
                Number(v) > 0 ? <Tag color="error">{formatRs(v)}</Tag> : formatRs(0)
            },
            {
              title: 'Status',
              width: 110,
              render: (_, r) => {
                if (r.deletedAt || r.status === 'cancelled') return <Tag>Voided</Tag>
                if (Number(r.dueAmount) > 0) return <Tag color="warning">Due</Tag>
                return <Tag color="success">Paid</Tag>
              }
            },
            {
              title: '',
              width: 90,
              render: (_, r) => (
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => navigate(`/companies/${id}/business/sales/${r.id}`)}
                >
                  Open
                </Button>
              )
            }
          ]}
        />
      </div>
    </div>
  )
}
