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
  Tabs,
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
  partAPI,
  partPurchaseAPI,
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

type LineType = 'product' | 'part'

type CartLine = {
  key: string
  lineType: LineType
  id?: string
  // product
  motorNumber?: string
  serialNumber?: string
  productId?: string
  colorId?: string
  colorName?: string
  warrantyActive?: boolean
  warrantyExpiryDate?: string
  locked?: boolean
  status?: string
  // part
  partId?: string
  quantity?: number
  // shared
  productName: string
  categoryName: string
  listPrice: number
  purchasePrice: number
  specialDiscount: number
  specialDiscountType: SupplierDiscountType
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

function lineQty(line: CartLine): number {
  if (line.lineType === 'part') return Math.max(1, Number(line.quantity || 1))
  return 1
}

export const AddPurchase = () => {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { companyId, branchId, audit } = useSession()
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [parts, setParts] = useState<any[]>([])
  const [colors, setColors] = useState<any[]>([])
  const [lines, setLines] = useState<CartLine[]>([])
  const [lineType, setLineType] = useState<LineType>('product')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(isEdit)
  const [headerForm] = Form.useForm()
  const [lineForm] = Form.useForm()

  const warrantyActive = Form.useWatch('warrantyActive', lineForm)
  const lineSpecialDiscount = Number(Form.useWatch('specialDiscount', lineForm) || 0)
  const lineSpecialDiscountType: SupplierDiscountType =
    Form.useWatch('specialDiscountType', lineForm) === 'percent' ? 'percent' : 'pkr'

  const activeLineType: LineType = isEdit ? 'product' : lineType

  useEffect(() => {
    if (!companyId) return
    supplierAPI.list(companyId).then(setSuppliers)
    productAPI.list(companyId).then(setProducts)
    colorAPI.list(companyId).then(setColors)
    if (!isEdit) {
      partAPI.list(companyId).then(setParts)
      headerForm.setFieldsValue({ purchaseDate: dayjs() })
      lineForm.setFieldsValue({
        specialDiscount: 0,
        specialDiscountType: 'pkr',
        quantity: 1,
        warrantyActive: false
      })
    }
  }, [companyId, headerForm, lineForm, isEdit])

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
          notes: purchase.notes || ''
        })

        setLines(
          (detail.items || []).map((item: any) => ({
            key: item.id,
            lineType: 'product' as const,
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
            specialDiscount: Number(item.specialDiscount || 0),
            specialDiscountType: item.specialDiscountType === 'percent' ? 'percent' : 'pkr',
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
  const partMap = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts])
  const colorMap = useMemo(() => new Map(colors.map((c) => [c.id, c])), [colors])
  const supplierMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers])

  const selectedSupplierId = Form.useWatch('supplierId', headerForm)
  const selectedSupplier = selectedSupplierId ? supplierMap.get(selectedSupplierId) : undefined
  const supplierDiscount = Number(selectedSupplier?.discount || 0)
  const supplierDiscountType: SupplierDiscountType =
    selectedSupplier?.discountType === 'percent' ? 'percent' : 'pkr'
  const hasSupplierDiscount = supplierDiscount > 0
  const hasSpecialDiscount = lines.some((l) => l.specialDiscount > 0)
  const hasDiscount = hasSupplierDiscount || hasSpecialDiscount
  const showNetPreview = hasSupplierDiscount || lineSpecialDiscount > 0

  const enteredListPrice = Number(Form.useWatch('purchasePrice', lineForm) || 0)
  const previewNetPrice = computeNetPrice(
    enteredListPrice,
    supplierDiscount,
    supplierDiscountType,
    lineSpecialDiscount,
    lineSpecialDiscountType
  )

  const recalcLines = (supplier?: { discount?: number; discountType?: string }) => {
    const sDiscount = Number(supplier?.discount || 0)
    const sType: SupplierDiscountType = supplier?.discountType === 'percent' ? 'percent' : 'pkr'
    setLines((prev) =>
      prev.map((line) =>
        line.locked
          ? line
          : {
              ...line,
              purchasePrice: computeNetPrice(
                line.listPrice,
                sDiscount,
                sType,
                line.specialDiscount,
                line.specialDiscountType
              )
            }
      )
    )
  }

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.name}${p.category?.name ? ` · ${p.category.name}` : ''}`
  }))
  const partOptions = parts.map((p) => ({
    value: p.id,
    label: `${p.name}${p.category?.name ? ` · ${p.category.name}` : ''}`
  }))
  const colorOptions = colors.map((c) => ({ value: c.id, label: c.name }))
  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }))

  const selectedProductId = Form.useWatch('productId', lineForm)
  const selectedPartId = Form.useWatch('partId', lineForm)
  const categoryPreview =
    activeLineType === 'product'
      ? selectedProductId
        ? productMap.get(selectedProductId)?.category?.name || '—'
        : '—'
      : selectedPartId
        ? partMap.get(selectedPartId)?.category?.name || '—'
        : '—'

  const handleSupplierChange = (supplierId: string) => {
    recalcLines(supplierMap.get(supplierId))
  }

  const resetLineForm = () => {
    lineForm.resetFields()
    lineForm.setFieldsValue({
      warrantyActive: false,
      motorNumber: '',
      serialNumber: '',
      quantity: 1,
      specialDiscount: 0,
      specialDiscountType: 'pkr'
    })
  }

  const handleTabChange = (key: string) => {
    setLineType(key as LineType)
    setEditingKey(null)
    resetLineForm()
  }

  const addProductLine = async () => {
    const values = await lineForm.validateFields()
    const product = productMap.get(values.productId)
    if (!product) {
      message.error('Select a valid product')
      return
    }
    const serial = String(values.serialNumber || '').trim()
    if (
      lines.some(
        (l) =>
          l.lineType === 'product' &&
          l.serialNumber === serial &&
          (!editingKey || l.key !== editingKey)
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
    const specialDiscount = Number(values.specialDiscount || 0)
    const specialDiscountType: SupplierDiscountType =
      values.specialDiscountType === 'percent' ? 'percent' : 'pkr'
    const nextLine: CartLine = {
      key: editingKey || `${serial}-${Date.now()}`,
      lineType: 'product',
      serialNumber: serial,
      motorNumber: values.motorNumber?.trim() || undefined,
      productId: values.productId,
      productName: product.name,
      categoryName: product.category?.name || '—',
      colorId: values.colorId,
      colorName: color?.name,
      listPrice,
      specialDiscount,
      specialDiscountType,
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
      if (!existing || existing.locked || existing.lineType !== 'product') {
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

    resetLineForm()
  }

  const addPartLine = async () => {
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

    const listPrice = Number(values.purchasePrice || 0)
    const specialDiscount = Number(values.specialDiscount || 0)
    const specialDiscountType: SupplierDiscountType =
      values.specialDiscountType === 'percent' ? 'percent' : 'pkr'

    const nextLine: CartLine = {
      key: editingKey || `part-${values.partId}-${Date.now()}`,
      lineType: 'part',
      partId: values.partId,
      productName: part.name,
      categoryName: part.category?.name || '—',
      quantity,
      listPrice,
      specialDiscount,
      specialDiscountType,
      purchasePrice: computeNetPrice(
        listPrice,
        supplierDiscount,
        supplierDiscountType,
        specialDiscount,
        specialDiscountType
      )
    }

    if (editingKey) {
      const existing = lines.find((l) => l.key === editingKey)
      if (!existing || existing.lineType !== 'part') {
        message.error('This line cannot be edited')
        return
      }
      setLines((prev) =>
        prev.map((l) => (l.key === editingKey ? { ...nextLine, id: existing.id } : l))
      )
      setEditingKey(null)
      message.success('Part line updated')
    } else {
      setLines((prev) => [...prev, nextLine])
    }

    resetLineForm()
  }

  const addLine = async () => {
    try {
      if (activeLineType === 'product') await addProductLine()
      else await addPartLine()
    } catch {
      // validation shown by form
    }
  }

  const startEditLine = (line: CartLine) => {
    if (line.locked) {
      message.warning('Sold or not in stock units cannot be edited')
      return
    }
    if (isEdit && line.lineType !== 'product') return

    setEditingKey(line.key)
    if (!isEdit) setLineType(line.lineType)

    if (line.lineType === 'product') {
      lineForm.setFieldsValue({
        serialNumber: line.serialNumber,
        motorNumber: line.motorNumber || '',
        productId: line.productId,
        colorId: line.colorId,
        purchasePrice: line.listPrice,
        specialDiscount: line.specialDiscount,
        specialDiscountType: line.specialDiscountType,
        warrantyActive: line.warrantyActive,
        warrantyExpiryDate: line.warrantyExpiryDate ? dayjs(line.warrantyExpiryDate) : undefined
      })
    } else {
      lineForm.setFieldsValue({
        partId: line.partId,
        quantity: line.quantity ?? 1,
        purchasePrice: line.listPrice,
        specialDiscount: line.specialDiscount,
        specialDiscountType: line.specialDiscountType
      })
    }
  }

  const cancelEditLine = () => {
    setEditingKey(null)
    resetLineForm()
  }

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key || l.locked))
    if (editingKey === key) cancelEditLine()
  }

  const lockedCount = lines.filter((l) => l.locked).length
  const editableCount = lines.length - lockedCount
  const productLines = lines.filter((l) => l.lineType === 'product')
  const partLines = lines.filter((l) => l.lineType === 'part')

  const grossTotal = round2(lines.reduce((sum, l) => sum + l.listPrice * lineQty(l), 0))
  const netTotal = round2(lines.reduce((sum, l) => sum + l.purchasePrice * lineQty(l), 0))
  const discountAmount = round2(grossTotal - netTotal)

  const buildProductPayload = (header: any) => ({
    supplierId: header.supplierId,
    purchaseDate: header.purchaseDate.format('YYYY-MM-DD'),
    notes: header.notes,
    specialDiscount: 0,
    specialDiscountType: 'pkr' as const,
    lines: productLines.map((l) => ({
      ...(l.id ? { id: l.id } : {}),
      serialNumber: l.serialNumber,
      motorNumber: l.motorNumber,
      productId: l.productId,
      colorId: l.colorId,
      purchasePrice: l.purchasePrice,
      sellingPrice: l.listPrice,
      specialDiscount: l.specialDiscount,
      specialDiscountType: l.specialDiscountType,
      warrantyActive: l.warrantyActive,
      warrantyExpiryDate: l.warrantyExpiryDate
    }))
  })

  const buildPartPayload = (header: any) => ({
    supplierId: header.supplierId,
    purchaseDate: header.purchaseDate.format('YYYY-MM-DD'),
    notes: header.notes || '',
    lines: partLines.map((l) => ({
      unitCost: l.purchasePrice,
      unitSalePrice: l.listPrice,
      quantity: lineQty(l),
      partId: l.partId,
      specialDiscount: l.specialDiscount,
      specialDiscountType: l.specialDiscountType
    }))
  })

  const handleSubmit = async () => {
    if (!lines.length) {
      message.error('Add at least one line')
      return
    }
    const header = await headerForm.validateFields()
    setLoading(true)
    try {
      if (isEdit && id) {
        await purchaseAPI.update(id, companyId, branchId, audit(), buildProductPayload(header))
        message.success(`Purchase updated — ${lines.length} unit(s)`)
        navigate(App_Routes.PURCHASE_DETAIL.replace(':id', id))
        return
      }

      const created: string[] = []
      if (productLines.length) {
        await purchaseAPI.create(companyId, branchId, audit(), buildProductPayload(header))
        created.push(`${productLines.length} product unit(s)`)
      }
      if (partLines.length) {
        await partPurchaseAPI.create(companyId, branchId, audit(), buildPartPayload(header))
        created.push(`${partLines.length} part line(s)`)
      }

      message.success(`Purchase saved — ${created.join(' · ')}`)
      setLines([])
      setEditingKey(null)
      setLineType('product')
      headerForm.resetFields()
      headerForm.setFieldsValue({ purchaseDate: dayjs() })
      resetLineForm()
      navigate(App_Routes.PURCHASE_LIST)
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
            : 'Receive products and spare parts into stock at this branch.'
        }
      />

      <Card bordered={false} className="shadow-sm mb-4">
        <Form form={headerForm} layout="vertical">
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
            <Form.Item name="notes" label="Notes" className="md:col-span-3">
              <Input placeholder="Optional notes" />
            </Form.Item>
          </div>
        </Form>
      </Card>

      <Card
        title={editingKey ? (activeLineType === 'part' ? 'Edit part line' : 'Edit unit') : 'Add line'}
        bordered={false}
        className="shadow-sm mb-4"
      >
        {!isEdit && (
          <Tabs
            activeKey={lineType}
            onChange={handleTabChange}
            items={[
              { key: 'product', label: 'Product' },
              { key: 'part', label: 'Part' }
            ]}
          />
        )}
        <Form
          form={lineForm}
          layout="vertical"
          initialValues={{
            warrantyActive: false,
            specialDiscount: 0,
            specialDiscountType: 'pkr',
            quantity: 1
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {activeLineType === 'product' ? (
              <>
                <Form.Item
                  name="serialNumber"
                  label="Chassis Number"
                  rules={[{ required: true, whitespace: true }]}
                >
                  <Input placeholder="Chassis number" />
                </Form.Item>
                <Form.Item name="motorNumber" label="Motor Number">
                  <Input placeholder="Optional" />
                </Form.Item>
                <Form.Item
                  name="productId"
                  label="Product"
                  rules={[{ required: true, message: 'Select product' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select product"
                    options={productOptions}
                  />
                </Form.Item>
                <Form.Item label="Category">
                  <Input value={categoryPreview} disabled />
                </Form.Item>
                <Form.Item name="colorId" label="Color">
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select color"
                    options={colorOptions}
                  />
                </Form.Item>
              </>
            ) : (
              <>
                <Form.Item
                  name="partId"
                  label="Part"
                  rules={[{ required: true, message: 'Select a part' }]}
                  className="md:col-span-2"
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select part"
                    options={partOptions}
                  />
                </Form.Item>
                <Form.Item label="Category">
                  <Input value={categoryPreview} disabled />
                </Form.Item>
                <Form.Item
                  name="quantity"
                  label="Units"
                  rules={[{ required: true, message: 'Enter units' }]}
                >
                  <InputNumber
                    className="w-full"
                    min={1}
                    step={1}
                    precision={0}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </>
            )}
            <Form.Item name="purchasePrice" label="Retail price" rules={[{ required: true }]}>
              <InputNumber className="w-full" min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="specialDiscountType" label="Special Discount Type">
              <Select options={[...SUPPLIER_DISCOUNT_TYPE_OPTIONS]} />
            </Form.Item>
            <Form.Item
              name="specialDiscount"
              label={
                lineSpecialDiscountType === 'percent' ? 'Special Discount %' : 'Special Discount (PKR)'
              }
              rules={[
                { type: 'number', min: 0, message: 'Discount cannot be negative' },
                ...(lineSpecialDiscountType === 'percent'
                  ? [{ type: 'number' as const, max: 100, message: 'Discount must be between 0 and 100' }]
                  : [])
              ]}
            >
              <InputNumber
                className="w-full"
                min={0}
                max={lineSpecialDiscountType === 'percent' ? 100 : undefined}
                style={{ width: '100%' }}
              />
            </Form.Item>
            {showNetPreview && (
              <Form.Item label={activeLineType === 'part' ? 'Net cost / unit' : 'Net Price'}>
                <Input value={formatRs(previewNetPrice)} disabled />
              </Form.Item>
            )}
            {activeLineType === 'product' && (
              <>
                <Form.Item name="warrantyActive" label="Warranty Active" valuePropName="checked">
                  <Switch />
                </Form.Item>
                {warrantyActive && (
                  <Form.Item
                    name="warrantyExpiryDate"
                    label="Warranty Expiry"
                    rules={[{ required: true }]}
                  >
                    <DatePicker className="w-full" style={{ width: '100%' }} />
                  </Form.Item>
                )}
              </>
            )}
          </div>
          <Space>
            <Button
              type="dashed"
              icon={editingKey ? <EditOutlined /> : <PlusOutlined />}
              onClick={addLine}
            >
              {editingKey
                ? activeLineType === 'part'
                  ? 'Update line'
                  : 'Update unit'
                : 'Add to purchase'}
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
          locale={{ emptyText: 'No lines added yet' }}
          columns={[
            ...(!isEdit
              ? [
                  {
                    title: 'Type',
                    dataIndex: 'lineType',
                    width: 90,
                    render: (v: LineType) => (
                      <Tag color={v === 'part' ? 'blue' : 'default'}>
                        {v === 'part' ? 'Part' : 'Product'}
                      </Tag>
                    )
                  }
                ]
              : []),
            {
              title: isEdit ? 'Chassis Number' : 'Chassis / Qty',
              render: (_: unknown, r: CartLine) =>
                r.lineType === 'product' ? (
                  <Text strong>{r.serialNumber}</Text>
                ) : (
                  <Text strong>{r.quantity ?? 1}</Text>
                )
            },
            ...(isEdit
              ? [{ title: 'Motor No.', dataIndex: 'motorNumber', render: (v: string | undefined) => v || '—' }]
              : []),
            {
              title: isEdit ? 'Product' : 'Name',
              dataIndex: 'productName'
            },
            { title: 'Category', dataIndex: 'categoryName' },
            {
              title: 'Color',
              dataIndex: 'colorName',
              render: (v: string | undefined, r: CartLine) =>
                r.lineType === 'product' ? v || '—' : '—'
            },
            ...(hasDiscount
              ? [
                  {
                    title: 'Retail Price',
                    dataIndex: 'listPrice',
                    align: 'right' as const,
                    render: formatRs
                  },
                  {
                    title: 'Special Disc.',
                    key: 'specialDiscount',
                    render: (_: unknown, r: CartLine) =>
                      formatSupplierDiscount(r.specialDiscount, r.specialDiscountType)
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
              render: (_: unknown, r: CartLine) =>
                r.lineType === 'product'
                  ? r.warrantyActive
                    ? `Yes · ${r.warrantyExpiryDate}`
                    : 'No'
                  : '—'
            },
            ...(isEdit
              ? [
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    render: (v: string | undefined, r: CartLine) =>
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
              render: (_: unknown, r: CartLine) =>
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
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeLine(r.key)}
                    />
                  </Space>
                )
            }
          ]}
        />
        <div className="flex flex-wrap justify-between items-center gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="space-y-1">
            <Text strong>
              {isEdit ? (
                <>
                  {lines.length} unit(s)
                  {lockedCount > 0 && <Text type="secondary"> · {lockedCount} locked</Text>}
                </>
              ) : (
                <>
                  {productLines.length} product · {partLines.length} part
                </>
              )}
              {hasDiscount && discountAmount > 0 ? (
                <>
                  {' '}
                  · Gross {formatRs(grossTotal)}
                  {hasSupplierDiscount && (
                    <>
                      {' '}
                      · Supplier ({formatSupplierDiscount(supplierDiscount, supplierDiscountType)})
                    </>
                  )}
                  {hasSpecialDiscount && <> · Special (per unit)</>} − {formatRs(discountAmount)} ·
                  Net {formatRs(netTotal)}
                </>
              ) : (
                <> · Total {formatRs(netTotal)}</>
              )}
            </Text>
          </div>
          <Space>
            {!isEdit && (
              <Button onClick={() => setLines([])} disabled={!lines.length}>
                Clear
              </Button>
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
