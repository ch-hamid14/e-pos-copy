import { useEffect, useState } from 'react'
import { Button, Card, Input, Popconfirm, Space, Statistic, Table, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { SessionAudit } from '@/renderer/services/session-audit'
import { PageHeader } from '../shared/page-ui'
import { useSession } from '@/renderer/hooks/useSession'
import { NameEntityFormModal } from '@/renderer/components/forms/NameEntityFormModal'

const { Text } = Typography

type SetupAPI = {
  list: (companyId: string, search?: string) => Promise<any[]>
  create: (companyId: string, audit: SessionAudit, data: { name: string }) => Promise<unknown>
  update: (id: string, companyId: string, audit: SessionAudit, data: { name: string }) => Promise<unknown>
  remove: (id: string, companyId: string, audit: SessionAudit) => Promise<unknown>
}

type SetupCrudProps = {
  title: string
  subtitle: string
  companyId: string
  audit: SessionAudit
  api: SetupAPI
  searchPlaceholder?: string
}

export const SetupCrud = ({
  title,
  subtitle,
  companyId,
  audit,
  api,
  searchPlaceholder = 'Search by name…'
}: SetupCrudProps) => {
  const [data, setData] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [search, setSearch] = useState('')

  const singular = title.endsWith('ies')
    ? title.slice(0, -3) + 'y'
    : title.endsWith('s')
      ? title.slice(0, -1)
      : title

  const load = () => api.list(companyId, search || undefined).then(setData)

  useEffect(() => {
    if (companyId) load()
  }, [companyId, search])

  const openCreate = () => {
    setEditing(null)
    setOpen(true)
  }

  const openEdit = (record: any) => {
    setEditing(record)
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await api.remove(id, companyId, audit)
      message.success(`${singular} deleted`)
      load()
    } catch (err: any) {
      message.error(err.message || 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add {singular}
          </Button>
        }
      />

      <Card bordered={false} className="shadow-sm mb-4">
        <Space className="w-full justify-between" wrap>
          <Input.Search
            placeholder={searchPlaceholder}
            allowClear
            onSearch={setSearch}
            style={{ maxWidth: 320 }}
          />
          <Statistic title="Total" value={data.length} />
        </Space>
      </Card>

      <Card bordered={false} className="shadow-sm">
        <Table
          rowKey="id"
          dataSource={data}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Name', dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
            {
              title: 'Actions',
              width: 180,
              render: (_, record) => (
                <Space>
                  <Button size="small" onClick={() => openEdit(record)}>
                    Edit
                  </Button>
                  <Popconfirm
                    title={`Delete this ${singular.toLowerCase()}?`}
                    onConfirm={() => handleDelete(record.id)}
                  >
                    <Button size="small" danger>
                      Delete
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>

      <NameEntityFormModal
        entityLabel={singular}
        open={open}
        editing={editing}
        onCancel={() => {
          setOpen(false)
          setEditing(null)
        }}
        onCreate={(name) => api.create(companyId, audit, { name })}
        onUpdate={(id, name) => api.update(id, companyId, audit, { name })}
        onSaved={() => {
          setOpen(false)
          setEditing(null)
          load()
        }}
      />
    </div>
  )
}

export function SetupCrudPage(props: Omit<SetupCrudProps, 'audit'>) {
  const { audit, deviceId } = useSession()
  if (!deviceId) return <Text type="danger">Device not registered.</Text>
  return <SetupCrud {...props} audit={audit()} />
}
