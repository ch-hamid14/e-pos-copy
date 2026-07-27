import { DatePicker, Form, InputNumber, Modal, Select, message } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'card', label: 'Card' },
  { value: 'mixed', label: 'Mixed' }
]

export type EditPaymentValues = {
  amount: number
  method: string
  paymentDate: string
}

type Props = {
  open: boolean
  title?: string
  /** Max paid after this edit (net − other payments). */
  maxAmount: number
  initial: {
    amount: number
    method?: string
    paymentDate?: string
  }
  onCancel: () => void
  onSave: (values: EditPaymentValues) => Promise<void>
}

export function EditPaymentModal({
  open,
  title = 'Edit payment',
  maxAmount,
  initial,
  onCancel,
  onSave
}: Props) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  return (
    <Modal
      title={title}
      open={open}
      okText="Save"
      confirmLoading={submitting}
      destroyOnClose
      onCancel={onCancel}
      afterOpenChange={(visible) => {
        if (visible) {
          form.setFieldsValue({
            amount: Number(initial.amount || 0),
            method: initial.method || 'cash',
            paymentDate: initial.paymentDate ? dayjs(initial.paymentDate) : dayjs()
          })
        }
      }}
      onOk={async () => {
        const values = await form.validateFields()
        const amount = Number(values.amount || 0)
        if (amount > maxAmount) {
          message.error(`Amount cannot exceed ${maxAmount}`)
          return
        }
        setSubmitting(true)
        try {
          await onSave({
            amount,
            method: values.method,
            paymentDate: values.paymentDate.format('YYYY-MM-DD')
          })
        } finally {
          setSubmitting(false)
        }
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="amount"
          label="Amount"
          rules={[{ required: true, message: 'Enter amount' }]}
          extra={maxAmount > 0 ? `Max ${maxAmount.toLocaleString()} (set 0 to remove)` : 'Set 0 to remove'}
        >
          <InputNumber min={0} max={maxAmount > 0 ? maxAmount : undefined} className="!w-full" />
        </Form.Item>
        <Form.Item name="method" label="Method" rules={[{ required: true }]}>
          <Select options={METHOD_OPTIONS} />
        </Form.Item>
        <Form.Item name="paymentDate" label="Payment date" rules={[{ required: true }]}>
          <DatePicker className="!w-full" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
