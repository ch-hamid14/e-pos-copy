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
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message
} from 'antd'
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate, useParams } from 'react-router-dom'
import { App_Routes } from '@/common'
import {
  colorAPI,
  productAPI,
  purchaseAPI,
  supplierAPI
} from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import {
  applySupplierDiscount,
  formatSupplierDiscount,
  round2,
  SUPPLIER_DISCOUNT_TYPE_OPTIONS,
  type SupplierDiscountType
} from '@/renderer/utils/supplierDiscount'
import { formatRs, PageHeader } from '../shared/page-ui'
import { STATUS_COLORS } from './inventory-ui'

const { Text } = Typography

type PurchaseLine = {
  key: string
  id?: string
  motorNumber?: string
  serialNumber: string
  productId: string
  productName: string
  categoryName: string
  colorId?: string
  colorName?: string
  listPrice: number
  purchasePrice: number
  warrantyActive: boolean
  warrantyExpiryDate?: string
  /** Sold / reserved / etc. — shown but not editable */
  locked?: boolean
  status?: string
}

function computeNetPrice(
  listPrice: number,
  supplierDiscount: number,
  supplierDiscountType: SupplierDiscountType,
  specialDiscount: number,
  specialDiscountType: SupplierDiscountType
): number {
  const afterSupplier = applySupplierDiscount(listPrice, supplierDiscount, supplierDiscountType)
  return applySupplierDiscount(afterSupplier, specialDiscount, specialDiscountType)
}

export const AddPurchase = () => {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { companyId, branchId, audit } = useSession()
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [colors, setColors] = useState<any[]>([])
  const [lines, setLines] = useState<PurchaseLine[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(isEdit)
  const [headerForm] = Form.useForm()
  const [lineForm] = Form.useForm()

  const warrantyActive = Form.useWatch('warrantyActive', lineForm)

  useEffect(() => {
    if (!companyId) return
    supplierAPI.list(companyId).then(setSuppliers)
    productAPI.list(companyId).then(setProducts)
    colorAPI.list(companyId).then(setColors)
    if (!isEdit) {
      headerForm.setFieldsValue({
        purchaseDate: dayjs(),
        specialDiscount: 0,
        specialDiscountType: 'pkr'
      })
    }
  }, [companyId, headerForm, isEdit])

  useEffect(() => {
    if (!isEdit || !id) return
    setLoadingDetail(true)
    purchaseAPI
      .get(id)
      .then((detail: any) => {
        if (!detail?.purchase) {
          message.error('Purchase not found')
          navigate(App_Routes.PURCHASE_LIST)
          return
        }
        if (!detail.editable && !detail.purchase.editable) {
          message.warning('No in-stock units left to edit on this purchase')
          navigate(App_Routes.PURCHASE_DETAIL.replace(':id', id))
          return
        }

        const purchase = detail.purchase
        headerForm.setFieldsValue({
          supplierId: purchase.supplierId,
          purchaseDate: dayjs(purchase.purchaseDate),
          notes: purchase.notes || '',
          specialDiscount: Number(purchase.specialDiscount || 0),
          specialDiscountType: purchase.specialDiscountType === 'percent' ? 'percent' : 'pkr'
        })

        setLines(
          (detail.items || []).map((item: any) => ({
            key: item.id,
            id: item.id,
            serialNumber: item.serialNumber,
            motorNumber: item.motorNumber || undefined,
            productId: item.productId,
            productName: item.product?.name || '—',
            categoryName: item.category?.name || '—',
            colorId: item.colorId || undefined,
            colorName: item.color?.name,
            listPrice: Number(item.sellingPrice ?? item.purchasePrice ?? 0),
            purchasePrice: Number(item.purchasePrice ?? 0),
            warrantyActive: Boolean(item.warrantyActive),
            warrantyExpiryDate: item.warrantyExpiryDate
              ? dayjs(item.warrantyExpiryDate).format('YYYY-MM-DD')
              : undefined,
            status: item.status,
            locked: item.status !== 'in_stock'
          }))
        )
      })
      .catch((err: any) => {
        message.error(err.message || 'Failed to load purchase')
        navigate(App_Routes.PURCHASE_LIST)
      })
      .finally(() => setLoadingDetail(false))
  }, [id, isEdit, navigate, headerForm])

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const colorMap = useMemo(() => new Map(colors.map((c) => [c.id, c])), [colors])
  const supplierMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers])

  const selectedSupplierId = Form.useWatch('supplierId', headerForm)
  const selectedSupplier = selectedSupplierId ? supplierMap.get(selectedSupplierId) : undefined
  const supplierDiscount = Number(selectedSupplier?.discount || 0)
  const supplierDiscountType: SupplierDiscountType =
    selectedSupplier?.discountType === 'percent' ? 'percent' : 'pkr'
  const hasSupplierDiscount = supplierDiscount > 0

  const specialDiscount = Number(Form.useWatch('specialDiscount', headerForm) || 0)
  const specialDiscountType: SupplierDiscountType =
    Form.useWatch('specialDiscountType', headerForm) === 'percent' ? 'percent' : 'pkr'
  const hasSpecialDiscount = specialDiscount > 0
  const hasDiscount = hasSupplierDiscount || hasSpecialDiscount

  const enteredListPrice = Number(Form.useWatch('purchasePrice', lineForm) || 0)
  const previewNetPrice = computeNetPrice(
    enteredListPrice,
    supplierDiscount,
    supplierDiscountType,
    specialDiscount,
    specialDiscountType
  )

  const recalcLines = (
    supplier?: { discount?: number; discountType?: string },
    special?: { discount?: number; discountType?: SupplierDiscountType }
  ) => {
    const sDiscount = Number(supplier?.discount || 0)
    const sType: SupplierDiscountType = supplier?.discountType === 'percent' ? 'percent' : 'pkr'
    const spDiscount = Number(special?.discount ?? specialDiscount)
    const spType: SupplierDiscountType = special?.discountType ?? specialDiscountType
    setLines((prev) =>
      prev.map((line) =>
        line.locked
          ? line
          : {
              ...line,
              purchasePrice: computeNetPrice(line.listPrice, sDiscount, sType, spDiscount, spType)
            }
      )
    )
  }

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.name}${p.category?.name ? ` · ${p.category.name}` : ''}`
  }))
  const colorOptions = colors.map((c) => ({ value: c.id, label: c.name }))
  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }))

  const selectedProductId = Form.useWatch('productId', lineForm)
  const categoryPreview = selectedProductId
    ? productMap.get(selectedProductId)?.category?.name || '—'
    : '—'

  const handleSupplierChange = (supplierId: string) => {
    recalcLines(supplierMap.get(supplierId), {
      discount: specialDiscount,
      discountType: specialDiscountType
    })
  }

  const handleSpecialDiscountChange = (
    next?: Partial<{ discount: number; discountType: SupplierDiscountType }>
  ) => {
    recalcLines(selectedSupplier, {
      discount: next?.discount ?? specialDiscount,
      discountType: next?.discountType ?? specialDiscountType
    })
  }

  const addLine = async () => {
    try {
      const values = await lineForm.validateFields()
      const product = productMap.get(values.productId)
      if (!product) {
        message.error('Select a valid product')
        return
      }
      const serial = values.serialNumber.trim()
      if (
        lines.some(
          (l) => l.serialNumber === serial && (!editingKey || l.key !== editingKey)
        )
      ) {
        message.error('Chassis number already added to this purchase')
        return
      }
      if (values.warrantyActive && !values.warrantyExpiryDate) {
        message.error('Warranty expiry is required when warranty is active')
        return
      }

      const color = values.colorId ? colorMap.get(values.colorId) : undefined
      const listPrice = Number(values.purchasePrice || 0)
      const nextLine: PurchaseLine = {
        key: editingKey || `${serial}-${Date.now()}`,
        serialNumber: serial,
        motorNumber: values.motorNumber?.trim() || undefined,
        productId: values.productId,
        productName: product.name,
        categoryName: product.category?.name || '—',
        colorId: values.colorId,
        colorName: color?.name,
        listPrice,
        purchasePrice: computeNetPrice(
          listPrice,
          supplierDiscount,
          supplierDiscountType,
          specialDiscount,
          specialDiscountType
        ),
        warrantyActive: Boolean(values.warrantyActive),
        warrantyExpiryDate: values.warrantyActive
          ? values.warrantyExpiryDate.format('YYYY-MM-DD')
          : undefined
      }

      if (editingKey) {
        const existing = lines.find((l) => l.key === editingKey)
        if (!existing || existing.locked) {
          message.error('This unit cannot be edited')
          return
        }
        setLines((prev) =>
          prev.map((l) =>
            l.key === editingKey
              ? {
                  ...nextLine,
                  id: existing.id,
                  locked: existing.locked,
                  status: existing.status || 'in_stock'
                }
              : l
          )
        )
        setEditingKey(null)
        message.success('Unit updated in list')
      } else {
        setLines((prev) => [...prev, nextLine])
      }

      lineForm.resetFields()
      lineForm.setFieldsValue({ warrantyActive: false, motorNumber: '', serialNumber: '' })
    } catch {
      // validation shown by form
    }
  }

  const startEditLine = (line: PurchaseLine) => {
    if (line.locked) {
      message.warning('Sold or not in stock units cannot be edited')
      return
    }
    setEditingKey(line.key)
    lineForm.setFieldsValue({
      serialNumber: line.serialNumber,
      motorNumber: line.motorNumber || '',
      productId: line.productId,
      colorId: line.colorId,
      purchasePrice: line.listPrice,
      warrantyActive: line.warrantyActive,
      warrantyExpiryDate: line.warrantyExpiryDate ? dayjs(line.warrantyExpiryDate) : undefined
    })
  }

  const cancelEditLine = () => {
    setEditingKey(null)
    lineForm.resetFields()
    lineForm.setFieldsValue({ warrantyActive: false, motorNumber: '', serialNumber: '' })
  }

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key || l.locked))
    if (editingKey === key) cancelEditLine()
  }

  const lockedCount = lines.filter((l) => l.locked).length
  const editableCount = lines.length - lockedCount

  const grossTotal = lines.reduce((sum, l) => sum + l.listPrice, 0)
  const netTotal = lines.reduce((sum, l) => sum + l.purchasePrice, 0)
  const discountAmount = round2(grossTotal - netTotal)

  const buildPayload = (header: any) => ({
    supplierId: header.supplierId,
    purchaseDate: header.purchaseDate.format('YYYY-MM-DD'),
    notes: header.notes,
    specialDiscount: Number(header.specialDiscount || 0),
    specialDiscountType: header.specialDiscountType === 'percent' ? 'percent' : 'pkr',
    lines: lines.map((l) => ({
      ...(l.id ? { id: l.id } : {}),
      serialNumber: l.serialNumber,
      motorNumber: l.motorNumber,
      productId: l.productId,
      colorId: l.colorId,
      purchasePrice: l.purchasePrice,
      sellingPrice: l.listPrice,
      warrantyActive: l.warrantyActive,
      warrantyExpiryDate: l.warrantyExpiryDate
    }))
  })

  const handleSubmit = async () => {
    if (!lines.length) {
      message.error('Add at least one unit')
      return
    }
    const header = await headerForm.validateFields()
    setLoading(true)
    try {
      if (isEdit && id) {
        await purchaseAPI.update(id, companyId, branchId, audit(), buildPayload(header))
        message.success(`Purchase updated — ${lines.length} unit(s)`)
        navigate(App_Routes.PURCHASE_DETAIL.replace(':id', id))
        return
      }

      await purchaseAPI.create(companyId, branchId, audit(), buildPayload(header))
      message.success(`Purchase saved — ${lines.length} unit(s) added to stock`)
      setLines([])
      headerForm.resetFields()
      headerForm.setFieldsValue({
        purchaseDate: dayjs(),
        specialDiscount: 0,
        specialDiscountType: 'pkr'
      })
    } catch (err: any) {
      message.error(err.message || (isEdit ? 'Update failed' : 'Purchase failed'))
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
      {isEdit && (
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          className="!px-0 mb-2"
          onClick={() => navigate(App_Routes.PURCHASE_DETAIL.replace(':id', id!))}
        >
          Back to Purchase Detail
        </Button>
      )}

      <PageHeader
        title={isEdit ? 'Edit Purchase' : 'Add Purchase'}
        subtitle={
          isEdit
            ? lockedCount
              ? `${lockedCount} unit(s) are locked (sold or not in stock). You can still edit the ${editableCount} in-stock unit(s).`
              : 'Update in-stock units on this purchase.'
            : 'Receive serialized units into stock at this branch.'
        }
      />

      <Card bordered={false} className="shadow-sm mb-4">
        <Form
          form={headerForm}
          layout="vertical"
          initialValues={{ specialDiscount: 0, specialDiscountType: 'pkr' }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Form.Item name="supplierId" label="Supplier" rules={[{ required: true, message: 'Select supplier' }]}>
              <Select placeholder="Select supplier" options={supplierOptions} onChange={handleSupplierChange} />
            </Form.Item>
            <Form.Item name="purchaseDate" label="Purchase Date" rules={[{ required: true }]}>
              <DatePicker className="w-full" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Supplier Discount">
              <Input
                value={
                  selectedSupplierId
                    ? formatSupplierDiscount(supplierDiscount, supplierDiscountType)
                    : '—'
                }
                disabled
              />
            </Form.Item>
            <Form.Item name="specialDiscountType" label="Special Discount Type">
              <Select
                options={[...SUPPLIER_DISCOUNT_TYPE_OPTIONS]}
                onChange={(value: SupplierDiscountType) =>
                  handleSpecialDiscountChange({ discountType: value })
                }
              />
            </Form.Item>
            <Form.Item
              name="specialDiscount"
              label={specialDiscountType === 'percent' ? 'Special Discount %' : 'Special Discount (PKR)'}
              rules={[
                { type: 'number', min: 0, message: 'Discount cannot be negative' },
                ...(specialDiscountType === 'percent'
                  ? [{ type: 'number' as const, max: 100, message: 'Discount must be between 0 and 100' }]
                  : [])
              ]}
            >
              <InputNumber
                className="w-full"
                min={0}
                max={specialDiscountType === 'percent' ? 100 : undefined}
                style={{ width: '100%' }}
                onChange={(value) =>
                  handleSpecialDiscountChange({ discount: Number(value || 0) })
                }
              />
            </Form.Item>
            <Form.Item name="notes" label="Notes" className="md:col-span-3">
              <Input placeholder="Optional notes" />
            </Form.Item>
          </div>
        </Form>
      </Card>

      <Card
        title={editingKey ? 'Edit unit' : 'Add unit'}
        bordered={false}
        className="shadow-sm mb-4"
      >
        <Form form={lineForm} layout="vertical" initialValues={{ warrantyActive: false }}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <Form.Item name="serialNumber" label="Chassis Number" rules={[{ required: true, whitespace: true }]}>
              <Input placeholder="Chassis number" />
            </Form.Item>
            <Form.Item name="motorNumber" label="Motor Number">
              <Input placeholder="Optional" />
            </Form.Item>
            <Form.Item name="productId" label="Product" rules={[{ required: true, message: 'Select product' }]}>
              <Select showSearch optionFilterProp="label" placeholder="Select product" options={productOptions} />
            </Form.Item>
            <Form.Item label="Category">
              <Input value={categoryPreview} disabled />
            </Form.Item>
            <Form.Item name="colorId" label="Color">
              <Select allowClear placeholder="Select color" options={colorOptions} />
            </Form.Item>
            <Form.Item name="purchasePrice" label="Retail price" rules={[{ required: true }]}>
              <InputNumber className="w-full" min={0} style={{ width: '100%' }} />
            </Form.Item>
            {hasDiscount && (
              <Form.Item label="Net Price">
                <Input value={formatRs(previewNetPrice)} disabled />
              </Form.Item>
            )}
            <Form.Item name="warrantyActive" label="Warranty Active" valuePropName="checked">
              <Switch />
            </Form.Item>
            {warrantyActive && (
              <Form.Item name="warrantyExpiryDate" label="Warranty Expiry" rules={[{ required: true }]}>
                <DatePicker className="w-full" style={{ width: '100%' }} />
              </Form.Item>
            )}
          </div>
          <Space>
            <Button
              type="dashed"
              icon={editingKey ? <EditOutlined /> : <PlusOutlined />}
              onClick={addLine}
            >
              {editingKey ? 'Update unit' : 'Add to purchase'}
            </Button>
            {editingKey && <Button onClick={cancelEditLine}>Cancel edit</Button>}
          </Space>
        </Form>
      </Card>

      <Card bordered={false} className="shadow-sm mb-4">
        <Table
          rowKey="key"
          dataSource={lines}
          pagination={false}
          locale={{ emptyText: 'No units added yet' }}
          columns={[
            { title: 'Chassis Number', dataIndex: 'serialNumber', render: (v) => <Text strong>{v}</Text> },
            { title: 'Motor No.', dataIndex: 'motorNumber', render: (v) => v || '—' },
            { title: 'Product', dataIndex: 'productName' },
            { title: 'Category', dataIndex: 'categoryName' },
            { title: 'Color', dataIndex: 'colorName', render: (v) => v || '—' },
            ...(hasDiscount
              ? [
                  {
                    title: 'Retail Price',
                    dataIndex: 'listPrice',
                    align: 'right' as const,
                    render: formatRs
                  },
                  {
                    title: 'Net Price',
                    dataIndex: 'purchasePrice',
                    align: 'right' as const,
                    render: formatRs
                  }
                ]
              : [
                  {
                    title: 'Purchase Price',
                    dataIndex: 'purchasePrice',
                    align: 'right' as const,
                    render: formatRs
                  }
                ]),
            {
              title: 'Warranty',
              render: (_: unknown, r: PurchaseLine) =>
                r.warrantyActive ? `Yes · ${r.warrantyExpiryDate}` : 'No'
            },
            ...(isEdit
              ? [
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    render: (v: string | undefined, r: PurchaseLine) =>
                      r.locked ? (
                        <Tag color={STATUS_COLORS[v || ''] || 'default'}>
                          {(v || 'locked').replace(/_/g, ' ')}
                        </Tag>
                      ) : (
                        <Tag color="green">in stock</Tag>
                      )
                  }
                ]
              : []),
            {
              title: '',
              width: 88,
              render: (_: unknown, r: PurchaseLine) =>
                r.locked ? (
                  <Space size={0}>
                    <Tooltip title="Sold or not in stock — cannot edit">
                      <Button type="text" icon={<EditOutlined />} disabled />
                    </Tooltip>
                    <Tooltip title="Sold or not in stock — cannot remove">
                      <Button type="text" danger icon={<DeleteOutlined />} disabled />
                    </Tooltip>
                  </Space>
                ) : (
                  <Space size={0}>
                    <Button type="text" icon={<EditOutlined />} onClick={() => startEditLine(r)} />
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeLine(r.key)} />
                  </Space>
                )
            }
          ]}
        />
        <div className="flex flex-wrap justify-between items-center gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="space-y-1">
            <Text strong>
              {lines.length} unit(s)
              {isEdit && lockedCount > 0 && (
                <Text type="secondary"> · {lockedCount} locked</Text>
              )}
              {hasDiscount ? (
                <>
                  {' '}
                  · Gross {formatRs(grossTotal)}
                  {hasSupplierDiscount && (
                    <>
                      {' '}
                      · Supplier ({formatSupplierDiscount(supplierDiscount, supplierDiscountType)})
                    </>
                  )}
                  {hasSpecialDiscount && (
                    <>
                      {' '}
                      · Special ({formatSupplierDiscount(specialDiscount, specialDiscountType)})
                    </>
                  )}
                  {' '}
                  − {formatRs(discountAmount)} · Net {formatRs(netTotal)}
                </>
              ) : (
                <> · Total {formatRs(netTotal)}</>
              )}
            </Text>
          </div>
          <Space>
            {!isEdit && (
              <Button onClick={() => setLines([])} disabled={!lines.length}>Clear</Button>
            )}
            {isEdit && (
              <Button onClick={() => navigate(App_Routes.PURCHASE_DETAIL.replace(':id', id!))}>
                Cancel
              </Button>
            )}
            <Button type="primary" loading={loading} onClick={handleSubmit} disabled={!lines.length}>
              {isEdit ? 'Update Purchase' : 'Save Purchase'}
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  )
}

export default AddPurchase
