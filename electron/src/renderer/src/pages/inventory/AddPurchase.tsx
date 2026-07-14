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
  Switch,
  Table,
  Typography,
  message
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
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

const { Text } = Typography

type PurchaseLine = {
  key: string
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
  const { companyId, branchId, audit } = useSession()
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [colors, setColors] = useState<any[]>([])
  const [lines, setLines] = useState<PurchaseLine[]>([])
  const [loading, setLoading] = useState(false)
  const [headerForm] = Form.useForm()
  const [lineForm] = Form.useForm()

  const warrantyActive = Form.useWatch('warrantyActive', lineForm)

  useEffect(() => {
    if (!companyId) return
    supplierAPI.list(companyId).then(setSuppliers)
    productAPI.list(companyId).then(setProducts)
    colorAPI.list(companyId).then(setColors)
    headerForm.setFieldsValue({
      purchaseDate: dayjs(),
      specialDiscount: 0,
      specialDiscountType: 'pkr'
    })
  }, [companyId, headerForm])

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
      prev.map((line) => ({
        ...line,
        purchasePrice: computeNetPrice(line.listPrice, sDiscount, sType, spDiscount, spType)
      }))
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
      if (lines.some((l) => l.serialNumber === values.serialNumber.trim())) {
        message.error('Serial already added to this purchase')
        return
      }
      if (values.warrantyActive && !values.warrantyExpiryDate) {
        message.error('Warranty expiry is required when warranty is active')
        return
      }

      const color = values.colorId ? colorMap.get(values.colorId) : undefined
      const listPrice = Number(values.purchasePrice || 0)
      setLines((prev) => [
        ...prev,
        {
          key: `${values.serialNumber}-${Date.now()}`,
          serialNumber: values.serialNumber.trim(),
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
      ])
      lineForm.setFieldsValue({ motorNumber: '', serialNumber: '' })
    } catch {
      // validation shown by form
    }
  }

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key))

  const grossTotal = lines.reduce((sum, l) => sum + l.listPrice, 0)
  const netTotal = lines.reduce((sum, l) => sum + l.purchasePrice, 0)
  const discountAmount = round2(grossTotal - netTotal)

  const handleSubmit = async () => {
    if (!lines.length) {
      message.error('Add at least one unit')
      return
    }
    const header = await headerForm.validateFields()
    setLoading(true)
    try {
      await purchaseAPI.create(companyId, branchId, audit(), {
        supplierId: header.supplierId,
        purchaseDate: header.purchaseDate.format('YYYY-MM-DD'),
        notes: header.notes,
        specialDiscount: Number(header.specialDiscount || 0),
        specialDiscountType: header.specialDiscountType === 'percent' ? 'percent' : 'pkr',
        lines: lines.map((l) => ({
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
      message.success(`Purchase saved — ${lines.length} unit(s) added to stock`)
      setLines([])
      headerForm.resetFields()
      headerForm.setFieldsValue({
        purchaseDate: dayjs(),
        specialDiscount: 0,
        specialDiscountType: 'pkr'
      })
    } catch (err: any) {
      message.error(err.message || 'Purchase failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Add Purchase"
        subtitle="Receive serialized units into stock at this branch."
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

      <Card title="Add unit" bordered={false} className="shadow-sm mb-4">
        <Form form={lineForm} layout="vertical" initialValues={{ warrantyActive: false }}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <Form.Item name="serialNumber" label="Chassis Number" rules={[{ required: true, whitespace: true }]}>
              <Input placeholder="Serial number" />
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
          <Button type="dashed" icon={<PlusOutlined />} onClick={addLine}>
            Add to purchase
          </Button>
        </Form>
      </Card>

      <Card bordered={false} className="shadow-sm mb-4">
        <Table
          rowKey="key"
          dataSource={lines}
          pagination={false}
          locale={{ emptyText: 'No units added yet' }}
          columns={[
            { title: 'Serial', dataIndex: 'serialNumber', render: (v) => <Text strong>{v}</Text> },
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
              render: (_, r) =>
                r.warrantyActive ? `Yes · ${r.warrantyExpiryDate}` : 'No'
            },
            {
              title: '',
              width: 48,
              render: (_, r) => (
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeLine(r.key)} />
              )
            }
          ]}
        />
        <div className="flex flex-wrap justify-between items-center gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="space-y-1">
            <Text strong>
              {lines.length} unit(s)
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
            <Button onClick={() => setLines([])} disabled={!lines.length}>Clear</Button>
            <Button type="primary" loading={loading} onClick={handleSubmit} disabled={!lines.length}>
              Save Purchase
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  )
}

export default AddPurchase
