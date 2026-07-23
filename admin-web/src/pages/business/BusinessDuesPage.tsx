import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { EyeOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Input, Space, Table, Tag, message } from 'antd'
import { listBusinessDues } from '../../api/admin'
import { useAuth } from '../../context/AuthContext'
import type { BusinessSaleRow } from '../../types'
import { formatDate, formatRs } from './format'

type Ctx = { companyId: string; companyName: string }

export default function BusinessDuesPage() {
  const { token } = useAuth()
  const { companyId } = useOutletContext<Ctx>()
  const { id } = useParams()
  const navigate = useNavigate()
  const [rows, setRows] = useState<BusinessSaleRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!token || !companyId) return
    setLoading(true)
    try {
      const result = await listBusinessDues(token, companyId, {
        page,
        pageSize: 25,
        search: search || undefined
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
  }, [token, companyId, page])

  return (
    <div>
      <div className="madix-page-header">
        <div>
          <h1>Outstanding dues</h1>
          <p>Sales with remaining due amount — open to reconcile finances or void.</p>
        </div>
      </div>

      <div className="madix-panel">
        <div className="madix-panel__head">
          <h2 className="madix-panel__title">{total} open dues</h2>
          <Space>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Customer name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={() => {
                setPage(1)
                load()
              }}
              style={{ width: 240 }}
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
              render: (v) => <Tag color="error">{formatRs(v)}</Tag>
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
