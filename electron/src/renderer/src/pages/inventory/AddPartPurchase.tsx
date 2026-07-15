import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Table,
  Typography,
  message
} from 'antd'
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate, useParams } from 'react-router-dom'
import { App_Routes } from '@/common'
import { partAPI, partPurchaseAPI, supplierAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, PageHeader } from '../shared/page-ui'

const { Text } = Typography

type PartPurchaseLine = {
  key: string
  id?: string
  partId: string
  partName: string
  categoryName: string
  quantity: number
  unitCost: number
}

export const AddPartPurchase = () => {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { companyId, branchId, audit } = useSession()
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [parts, setParts] = useState<any[]>([])
  const [lines, setLines] = useState<PartPurchaseLine[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(isEdit)
  const [headerForm] = Form.useForm()
  const [lineForm] = Form.useForm()

  useEffect(() => {
    if (!companyId) return
    supplierAPI.list(companyId).then(setSuppliers)
    partAPI.list(companyId).then(setParts)
    if (!isEdit) {
      headerForm.setFieldsValue({ purchaseDate: dayjs() })
      lineForm.setFieldsValue({ quantity: 1, unitCost: 0 })
    }
  }, [companyId, headerForm, lineForm, isEdit])

  useEffect(() => {
    if (!isEdit || !id) return
    setLoadingDetail(true)
    partPurchaseAPI
      .get(id)
      .then((detail: any) => {
        if (!detail?.purchase) {
          message.error('Parts purchase not found')
          navigate(App_Routes.PART_PURCHASE_LIST)
          return
        }

        const purchase = detail.purchase
        headerForm.setFieldsValue({
          supplierId: purchase.supplierId,
          purchaseDate: dayjs(purchase.purchaseDate),
          notes: purchase.notes || ''
        })

        setLines(
          (detail.lines || []).map((line: any) => ({
            key: line.id,
            id: line.id,
            partId: line.partId,
            partName: line.part?.name || '—',
            categoryName: line.category?.name || '—',
            quantity: Number(line.quantity || 0),
            unitCost: Number(line.unitCost || 0)
          }))
        )
      })
      .catch((err: any) => {
        message.error(err.message || 'Failed to load parts purchase')
        navigate(App_Routes.PART_PURCHASE_LIST)
      })
      .finally(() => setLoadingDetail(false))
  }, [id, isEdit, navigate, headerForm])

  const partMap = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts])
  const partOptions = parts.map((p) => ({
    value: p.id,
    label: `${p.name}${p.category?.name ? ` · ${p.category.name}` : ''}`
  }))
  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }))

  const selectedPartId = Form.useWatch('partId', lineForm)
  const categoryPreview = selectedPartId ? partMap.get(selectedPartId)?.category?.name || '—' : '—'

  const resetLineForm = () => {
    lineForm.resetFields()
    lineForm.setFieldsValue({ quantity: 1, unitCost: 0 })
    setEditingKey(null)
  }

  const addLine = async () => {
    try {
      const values = await lineForm.validateFields()
      const part = partMap.get(values.partId)
      if (!part) {
        message.error('Select a valid part')
        return
      }
      const quantity = Math.floor(Number(values.quantity))
      if (!Number.isFinite(quantity) || quantity <= 0) {
        message.error('Quantity must be a positive whole number')
        return
      }

      const nextLine: PartPurchaseLine = {
        key: editingKey || `${values.partId}-${Date.now()}`,
        id: editingKey ? lines.find((l) => l.key === editingKey)?.id : undefined,
        partId: values.partId,
        partName: part.name,
        categoryName: part.category?.name || '—',
        quantity,
        unitCost: Number(values.unitCost || 0)
      }

      setLines((prev) =>
        editingKey ? prev.map((l) => (l.key === editingKey ? nextLine : l)) : [...prev, nextLine]
      )
      resetLineForm()
    } catch {
      /* validation errors shown by form */
    }
  }

  const startEditLine = (line: PartPurchaseLine) => {
    setEditingKey(line.key)
    lineForm.setFieldsValue({
      partId: line.partId,
      quantity: line.quantity,
      unitCost: line.unitCost
    })
  }

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key))
    if (editingKey === key) resetLineForm()
  }

  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0)
  const totalValue = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0)

  const handleSubmit = async () => {
    try {
      const header = await headerForm.validateFields()
      if (!lines.length) {
        message.error('Add at least one part line')
        return
      }
      setLoading(true)
      const payload = {
        supplierId: header.supplierId,
        purchaseDate: header.purchaseDate.format('YYYY-MM-DD'),
        notes: header.notes || '',
        lines: lines.map((l) => ({
          id: l.id,
          partId: l.partId,
          quantity: l.quantity,
          unitCost: l.unitCost
        }))
      }

      if (isEdit && id) {
        await partPurchaseAPI.update(id, companyId, branchId, audit(), payload)
        message.success('Parts purchase updated')
        navigate(App_Routes.PART_PURCHASE_DETAIL.replace(':id', id))
      } else {
        const result: any = await partPurchaseAPI.create(companyId, branchId, audit(), payload)
        message.success('Parts purchase created')
        const newId = result?.purchase?.id
        navigate(
          newId
            ? App_Routes.PART_PURCHASE_DETAIL.replace(':id', newId)
            : App_Routes.PART_PURCHASE_LIST
        )
      }
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err.message || 'Save failed')
    } finally {
      setLoading(false)
    }
  }

  if (loadingDetail) {
    return (
      <div className="flex justify-center py-24">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        className="!px-0 mb-2"
        onClick={() => navigate(App_Routes.PART_PURCHASE_LIST)}
      >
        Back to Parts Purchase List
      </Button>

      <PageHeader
        title={isEdit ? 'Edit Parts Purchase' : 'Add Parts Purchase'}
        subtitle="Receive spare parts by quantity — stock is tracked as available units."
      />

      <Card bordered={false} className="shadow-sm mb-4">
        <Form form={headerForm} layout="vertical">
          <div className="grid gap-4 md:grid-cols-3">
            <Form.Item
              name="supplierId"
              label="Supplier"
              rules={[{ required: true, message: 'Select a supplier' }]}
            >
              <Select options={supplierOptions} placeholder="Select supplier" showSearch optionFilterProp="label" />
            </Form.Item>
            <Form.Item
              name="purchaseDate"
              label="Purchase date"
              rules={[{ required: true, message: 'Pick a date' }]}
            >
              <DatePicker className="w-full" format="DD MMM YYYY" />
            </Form.Item>
            <Form.Item name="notes" label="Notes">
              <Input placeholder="Optional notes" />
            </Form.Item>
          </div>
        </Form>
      </Card>

      <Card bordered={false} className="shadow-sm mb-4" title="Add line">
        <Form form={lineForm} layout="vertical">
          <div className="grid gap-4 md:grid-cols-4">
            <Form.Item
              name="partId"
              label="Part"
              rules={[{ required: true, message: 'Select a part' }]}
              className="md:col-span-2"
            >
              <Select options={partOptions} placeholder="Select part" showSearch optionFilterProp="label" />
            </Form.Item>
            <Form.Item label="Category">
              <Input value={categoryPreview} disabled />
            </Form.Item>
            <Form.Item
              name="quantity"
              label="Units"
              rules={[{ required: true, message: 'Enter units' }]}
            >
              <InputNumber min={1} step={1} precision={0} className="w-full" />
            </Form.Item>
            <Form.Item name="unitCost" label="Unit cost" rules={[{ required: true, message: 'Enter cost' }]}>
              <InputNumber min={0} className="w-full" />
            </Form.Item>
          </div>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={addLine}>
              {editingKey ? 'Update line' : 'Add line'}
            </Button>
            {editingKey && <Button onClick={resetLineForm}>Cancel edit</Button>}
          </Space>
        </Form>
      </Card>

      <Card bordered={false} className="shadow-sm mb-4">
        <Table
          rowKey="key"
          dataSource={lines}
          pagination={false}
          locale={{ emptyText: 'No parts added yet' }}
          columns={[
            { title: 'Part', dataIndex: 'partName', render: (v) => <Text strong>{v}</Text> },
            { title: 'Category', dataIndex: 'categoryName' },
            { title: 'Units', dataIndex: 'quantity', align: 'right' as const },
            {
              title: 'Unit cost',
              dataIndex: 'unitCost',
              align: 'right' as const,
              render: formatRs
            },
            {
              title: 'Line total',
              align: 'right' as const,
              render: (_, r) => formatRs(r.quantity * r.unitCost)
            },
            {
              title: '',
              width: 100,
              render: (_, r) => (
                <Space size={0}>
                  <Button type="text" icon={<EditOutlined />} onClick={() => startEditLine(r)} />
                  <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeLine(r.key)} />
                </Space>
              )
            }
          ]}
          summary={() =>
            lines.length ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>
                  <Text strong>Totals</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <Text strong>{totalUnits}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} />
                <Table.Summary.Cell index={4} align="right">
                  <Text strong>{formatRs(totalValue)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} />
              </Table.Summary.Row>
            ) : null
          }
        />
      </Card>

      <Button type="primary" size="large" loading={loading} onClick={handleSubmit}>
        {isEdit ? 'Save changes' : 'Create purchase'}
      </Button>
    </div>
  )
}

export default AddPartPurchase
