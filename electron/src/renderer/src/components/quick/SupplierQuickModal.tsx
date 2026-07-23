import { useEffect, useState } from 'react'
import { Button, Form, Input, InputNumber, Modal, Select, message } from 'antd'
import { supplierAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import {
  SUPPLIER_DISCOUNT_TYPE_OPTIONS,
  type SupplierDiscountType
} from '@/renderer/utils/supplierDiscount'

export type SupplierQuickRecord = {
  id: string
  name?: string
  phone?: string
  address?: string
  discount?: number
  discountType?: string
}

type Props = {
  open: boolean
  editing?: SupplierQuickRecord | null
  onCancel: () => void
  onSaved: (supplier: SupplierQuickRecord) => void
}

function asSupplier(row: any): SupplierQuickRecord {
  return {
    id: String(row.id),
    name: row.name,
    phone: row.phone,
    address: row.address,
    discount: Number(row.discount || 0),
    discountType: row.discountType === 'percent' ? 'percent' : 'pkr'
  }
}

export function SupplierQuickModal({ open, editing, onCancel, onSaved }: Props) {
  const { companyId, audit } = useSession()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const isEdit = Boolean(editing?.id)
  const discountType = Form.useWatch('discountType', form) as SupplierDiscountType | undefined

  useEffect(() => {
    if (!open) return
    if (editing?.id) {
      form.setFieldsValue({
        name: editing.name,
        phone: editing.phone,
        address: editing.address,
        discount: Number(editing.discount || 0),
        discountType: editing.discountType === 'percent' ? 'percent' : 'pkr'
      })
    } else {
      form.resetFields()
      form.setFieldsValue({ discount: 0, discountType: 'pkr' })
    }
  }, [open, editing, form])

  const handleSubmit = async (values: {
    name: string
    phone?: string
    address?: string
    discount?: number
    discountType?: SupplierDiscountType
  }) => {
    if (!companyId) return
    setLoading(true)
    try {
      if (isEdit && editing) {
        const updated = await supplierAPI.update(editing.id, companyId, audit(), values)
        message.success('Supplier updated')
        onSaved(asSupplier(updated || { ...editing, ...values }))
      } else {
        const created = await supplierAPI.create(companyId, audit(), values)
        message.success('Supplier created')
        onSaved(asSupplier(created))
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
      title={isEdit ? 'Edit Supplier' : 'Add Supplier'}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
      width={440}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ discount: 0, discountType: 'pkr' }}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }]}>
          <Input placeholder="Supplier name" autoFocus />
        </Form.Item>
        <Form.Item name="phone" label="Phone">
          <Input placeholder="Phone number" />
        </Form.Item>
        <div className="grid grid-cols-2 gap-3">
          <Form.Item name="discountType" label="Discount Type">
            <Select options={[...SUPPLIER_DISCOUNT_TYPE_OPTIONS]} />
          </Form.Item>
          <Form.Item
            name="discount"
            label={discountType === 'percent' ? 'Discount %' : 'Discount (PKR)'}
            rules={[
              { type: 'number', min: 0, message: 'Discount cannot be negative' },
              ...(discountType === 'percent'
                ? [{ type: 'number' as const, max: 100, message: 'Discount must be between 0 and 100' }]
                : [])
            ]}
          >
            <InputNumber
              className="w-full"
              min={0}
              max={discountType === 'percent' ? 100 : undefined}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </div>
        <Form.Item name="address" label="Address">
          <Input.TextArea rows={2} placeholder="Address" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          {isEdit ? 'Save' : 'Create'}
        </Button>
      </Form>
    </Modal>
  )
}
