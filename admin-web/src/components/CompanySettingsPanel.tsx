import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  message
} from 'antd'
import {
  cloneCompany,
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  unbindAllDevices,
  updateCompanySettings
} from '../api/admin'
import type { Company, SnapshotInfo } from '../types'

const FLAG_KEYS = ['inventory', 'expenses', 'multiBranch', 'customers', 'purchases'] as const

type Props = {
  company: Company
  token: string
  onChanged: () => void
}

export default function CompanySettingsPanel({ company, token, onChanged }: Props) {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const loadSnaps = () => {
    listSnapshots(token, company.id).then(setSnapshots).catch(() => setSnapshots([]))
  }

  useEffect(() => {
    form.setFieldsValue({
      plan: company.plan || 'standard',
      planExpiresAt: company.planExpiresAt
        ? String(company.planExpiresAt).slice(0, 16)
        : undefined,
      maintenanceMode: Boolean(company.maintenanceMode),
      minAppVersion: company.minAppVersion || undefined,
      maxBranches: company.maxBranches ?? undefined,
      maxUsers: company.maxUsers ?? undefined,
      maxDevices: company.maxDevices ?? undefined,
      ...Object.fromEntries(
        FLAG_KEYS.map((k) => [`flag_${k}`, company.featureFlags?.[k] ?? true])
      )
    })
    loadSnaps()
  }, [company, token])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="madix-ops-card">
        <h3>Plan & access</h3>
        <p className="madix-ops-card__desc">
          Subscription, maintenance mode, version gate, and usage limits.
        </p>
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            setBusy('settings')
            try {
              const featureFlags = Object.fromEntries(
                FLAG_KEYS.map((k) => [k, Boolean(values[`flag_${k}`])])
              )
              await updateCompanySettings(token, company.id, {
                plan: values.plan,
                planExpiresAt: values.planExpiresAt || null,
                maintenanceMode: values.maintenanceMode,
                minAppVersion: values.minAppVersion || null,
                maxBranches: values.maxBranches ?? null,
                maxUsers: values.maxUsers ?? null,
                maxDevices: values.maxDevices ?? null,
                featureFlags
              })
              message.success('Settings saved')
              onChanged()
            } catch (err: any) {
              message.error(err.message)
            } finally {
              setBusy(null)
            }
          }}
        >
          <div className="madix-form-grid">
            <Form.Item name="plan" label="Plan">
              <Select
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'pro', label: 'Pro' },
                  { value: 'enterprise', label: 'Enterprise' }
                ]}
              />
            </Form.Item>
            <Form.Item name="planExpiresAt" label="Plan expires (local)">
              <Input type="datetime-local" />
            </Form.Item>
            <Form.Item name="minAppVersion" label="Min app version">
              <Input placeholder="e.g. 1.2.0" />
            </Form.Item>
            <Form.Item name="maintenanceMode" label="Maintenance mode" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="maxBranches" label="Max branches">
              <InputNumber min={1} style={{ width: '100%' }} placeholder="Unlimited" />
            </Form.Item>
            <Form.Item name="maxUsers" label="Max users">
              <InputNumber min={1} style={{ width: '100%' }} placeholder="Unlimited" />
            </Form.Item>
            <Form.Item name="maxDevices" label="Max devices">
              <InputNumber min={1} style={{ width: '100%' }} placeholder="Unlimited" />
            </Form.Item>
          </div>

          <div className="madix-form-section">
            <p className="madix-form-section__title">Feature flags</p>
          </div>
          <div className="madix-form-grid">
            {FLAG_KEYS.map((k) => (
              <Form.Item key={k} name={`flag_${k}`} label={k} valuePropName="checked">
                <Switch />
              </Form.Item>
            ))}
          </div>

          <div className="madix-modal-actions">
            <Button type="primary" htmlType="submit" loading={busy === 'settings'}>
              Save settings
            </Button>
          </div>
        </Form>
      </div>

      <div className="madix-ops-grid">
        <div className="madix-ops-card">
          <h3>Support actions</h3>
          <p className="madix-ops-card__desc">Force re-auth and clone this tenant for QA.</p>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button
              danger
              block
              loading={busy === 'unbind'}
              onClick={() =>
                Modal.confirm({
                  title: 'Unbind all devices?',
                  content: 'All POS devices must sign in again.',
                  okType: 'danger',
                  onOk: async () => {
                    setBusy('unbind')
                    try {
                      await unbindAllDevices(token, company.id)
                      message.success('All devices unbound')
                      onChanged()
                    } catch (err: any) {
                      message.error(err.message)
                    } finally {
                      setBusy(null)
                    }
                  }
                })
              }
            >
              Unbind all devices
            </Button>
            <Button
              block
              loading={busy === 'clone'}
              onClick={() => {
                let name = `Clone of ${company.name}`
                Modal.confirm({
                  title: 'Clone company database?',
                  content: (
                    <Input
                      defaultValue={name}
                      onChange={(e) => {
                        name = e.target.value
                      }}
                      style={{ marginTop: 12 }}
                    />
                  ),
                  onOk: async () => {
                    setBusy('clone')
                    try {
                      const cloned = await cloneCompany(token, company.id, name)
                      message.success('Company cloned')
                      navigate(`/companies/${cloned.id}`)
                    } catch (err: any) {
                      message.error(err.message)
                    } finally {
                      setBusy(null)
                    }
                  }
                })
              }}
            >
              Clone company
            </Button>
          </Space>
        </div>

        <div className="madix-ops-card">
          <h3>Snapshots</h3>
          <p className="madix-ops-card__desc">
            Requires pg_dump/psql on the backend host. Creates a SQL dump of the company DB.
          </p>
          <Button
            type="primary"
            loading={busy === 'snap'}
            style={{ marginBottom: 12 }}
            onClick={async () => {
              setBusy('snap')
              try {
                await createSnapshot(token, company.id)
                message.success('Snapshot created')
                loadSnaps()
              } catch (err: any) {
                message.error(err.message)
              } finally {
                setBusy(null)
              }
            }}
          >
            Create snapshot
          </Button>
          <Table
            size="small"
            rowKey="filename"
            pagination={false}
            dataSource={snapshots}
            locale={{ emptyText: 'No snapshots yet' }}
            columns={[
              { title: 'File', dataIndex: 'filename', ellipsis: true },
              {
                title: 'Size',
                dataIndex: 'size',
                width: 90,
                render: (n) => `${Math.round(n / 1024)} KB`
              },
              {
                title: '',
                width: 100,
                render: (_, row) => (
                  <Button
                    size="small"
                    danger
                    onClick={() =>
                      Modal.confirm({
                        title: 'Restore this snapshot?',
                        content: 'Replaces the live company database.',
                        okType: 'danger',
                        onOk: async () => {
                          await restoreSnapshot(token, company.id, row.filename)
                          message.success('Restored')
                          onChanged()
                        }
                      })
                    }
                  >
                    Restore
                  </Button>
                )
              }
            ]}
          />
        </div>
      </div>
    </div>
  )
}
