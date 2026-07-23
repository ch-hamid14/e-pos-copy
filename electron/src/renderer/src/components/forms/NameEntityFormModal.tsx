import { useEffect, useState } from 'react'
import { Button, Form, Input, Modal, message } from 'antd'

export type NameEntityRecord = {
  id: string
  name?: string
}

type Props = {
  entityLabel: string
  open: boolean
  editing?: NameEntityRecord | null
  onCancel: () => void
  onSaved: (row: NameEntityRecord) => void
  onCreate: (name: string) => Promise<unknown>
  onUpdate?: (id: string, name: string) => Promise<unknown>
}

function asRow(row: any, fallbackName?: string): NameEntityRecord {
  return {
    id: String(row.id),
    name: row.name ?? fallbackName
  }
}

/** Shared name-only modal (Colors, Categories, other SetupCrud entities). */
export function NameEntityFormModal({
  entityLabel,
  open,
  editing,
  onCancel,
  onSaved,
  onCreate,
  onUpdate
}: Props) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const isEdit = Boolean(editing?.id)

  useEffect(() => {
    if (!open) return
    if (editing?.id) {
      form.setFieldsValue({ name: editing.name })
    } else {
      form.resetFields()
    }
  }, [open, editing, form])

  const handleSubmit = async (values: { name: string }) => {
    setLoading(true)
    try {
      if (isEdit && editing) {
        if (!onUpdate) throw new Error(`${entityLabel} update is not supported`)
        const updated = await onUpdate(editing.id, values.name)
        message.success(`${entityLabel} updated`)
        onSaved(asRow(updated || { id: editing.id, name: values.name }, values.name))
      } else {
        const created = await onCreate(values.name)
        message.success(`${entityLabel} created`)
        onSaved(asRow(created, values.name))
      }
      form.resetFields()
    } catch (err: any) {
      message.error(err.message || 'Operation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${entityLabel}` : `Add ${entityLabel}`}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
      width={400}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }]}>
          <Input placeholder={`${entityLabel} name`} autoFocus />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          {isEdit ? 'Save' : 'Create'}
        </Button>
      </Form>
    </Modal>
  )
}
