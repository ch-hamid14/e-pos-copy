import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { EyeOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Input, Select, Space, Table, Tag, message } from 'antd'
import { listBusinessPurchases } from '../../api/admin'
import { useAuth } from '../../context/AuthContext'
import type { BusinessPurchaseRow } from '../../types'
import { formatDate, formatRs } from './format'

type Ctx = { companyId: string; companyName: string }

export default function BusinessPurchasesPage() {
  const { token } = useAuth()
  const { companyId } = useOutletContext<Ctx>()
  const { id } = useParams()
  const navigate = useNavigate()
  const [rows, setRows] = useState<BusinessPurchaseRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')
  const [visibility, setVisibility] = useState<'active' | 'include' | 'only'>('active')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!token || !companyId) return
    setLoading(true)
    try {
      const result = await listBusinessPurchases(token, companyId, {
        page,
        pageSize: 25,
        search: search || undefined,
        kind,
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
  }, [token, companyId, page, kind, visibility])

  return (
    <div>
      <div className="madix-page-header">
        <div>
          <h1>Purchases</h1>
          <p>Product and part purchases — open to inspect stock impact or void.</p>
        </div>
      </div>

      <div className="madix-panel">
        <div className="madix-panel__head">
          <h2 className="madix-panel__title">{total} purchases</h2>
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
            <Select
              value={kind}
              onChange={(v) => {
                setPage(1)
                setKind(v)
              }}
              style={{ width: 140 }}
              options={[
                { value: 'all', label: 'All kinds' },
                { value: 'product', label: 'Products' },
                { value: 'part', label: 'Parts' }
              ]}
            />
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Supplier, serial, part"
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
        <Table<BusinessPurchaseRow>
          rowKey="key"
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
              title: 'Kind',
              dataIndex: 'kind',
              width: 100,
              render: (v) =>
                v === 'part' ? <Tag color="blue">Part</Tag> : <Tag>Product</Tag>
            },
            {
              title: 'Date',
              dataIndex: 'purchaseDate',
              width: 120,
              render: formatDate
            },
            {
              title: 'Supplier',
              render: (_, r) => r.supplier?.name || '—'
            },
            {
              title: 'Branch',
              dataIndex: 'branchName',
              render: (v) => v || '—'
            },
            {
              title: 'Lines',
              dataIndex: 'itemCount',
              width: 80
            },
            {
              title: 'Value',
              dataIndex: 'totalValue',
              align: 'right',
              render: formatRs
            },
            {
              title: 'Status',
              width: 100,
              render: (_, r) =>
                r.voided || r.deletedAt ? <Tag>Voided</Tag> : r.editable ? (
                  <Tag color="success">Active</Tag>
                ) : (
                  <Tag color="warning">Locked</Tag>
                )
            },
            {
              title: 'Voidable',
              width: 100,
              render: (_, r) =>
                r.voided || r.deletedAt
                  ? '—'
                  : r.editable
                    ? <Tag color="success">Yes</Tag>
                    : <Tag>Blocked</Tag>
            },
            {
              title: '',
              width: 90,
              render: (_, r) => (
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() =>
                    navigate(
                      r.kind === 'part'
                        ? `/companies/${id}/business/part-purchases/${r.id}`
                        : `/companies/${id}/business/purchases/${r.id}`
                    )
                  }
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
