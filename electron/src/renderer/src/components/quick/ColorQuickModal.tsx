import { useEffect, useState } from 'react'
import { Button, Form, Input, Modal, message } from 'antd'
import { colorAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'

export type ColorQuickRecord = {
  id: string
  name?: string
}

type Props = {
  open: boolean
  onCancel: () => void
  onSaved: (color: ColorQuickRecord) => void
}

function asColor(row: any): ColorQuickRecord {
  return { id: String(row.id), name: row.name }
}

export function ColorQuickModal({ open, onCancel, onSaved }: Props) {
  const { companyId, audit } = useSession()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    form.resetFields()
  }, [open, form])

  const handleSubmit = async (values: { name: string }) => {
    if (!companyId) return
    setLoading(true)
    try {
      const created = await colorAPI.create(companyId, audit(), { name: values.name })
      message.success('Color created')
      onSaved(asColor(created))
      form.resetFields()
    } catch (err: any) {
      message.error(err.message || 'Failed to create color')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Add Color"
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
      width={400}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }]}>
          <Input placeholder="Color name" autoFocus />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          Create
        </Button>
      </Form>
    </Modal>
  )
}
