import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import { App_Routes } from '@/common'
import { customerAPI, inventoryAPI, partStockAPI, saleAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, PageHeader } from '../shared/page-ui'

const { Text } = Typography

type SaleLineType = 'product' | 'part'

type SaleLine = {
  key: string
  id?: string
  lineType: SaleLineType
  productItemId?: string
  partId?: string
  serialNumber?: string
  productName: string
  categoryName: string
  colorName?: string
  quantity: number
  salePrice: number
  taxPercent: number
  whtPercent: number
  warrantyActive: boolean
  warrantyExpiryDate?: string
  availableUnits?: number
  locked?: boolean
}

function roundAmount(n: number): number {
  return Math.round(Number(n) || 0)
}

function calcLineTotal(line: Pick<SaleLine, 'salePrice' | 'taxPercent' | 'whtPercent' | 'quantity'>) {
  const extended = line.salePrice * line.quantity
  const tax = (extended * line.taxPercent) / 100
  const wht = (extended * line.whtPercent) / 100
  return roundAmount(extended + tax + wht)
}

function calcDueAmount(grossTotal: number, paid: number, discount: number) {
  if (grossTotal <= 0) return 0
  return Math.max(0, roundAmount(grossTotal - paid - discount))
}

export const NewSale = () => {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { companyId, branchId, audit } = useSession()
  const [customers, setCustomers] = useState<any[]>([])
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [partStocks, setPartStocks] = useState<any[]>([])
  const [lines, setLines] = useState<SaleLine[]>([])
  const [lineType, setLineType] = useState<SaleLineType>('product')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(isEdit)
  const [paidAmount, setPaidAmount] = useState(0)
  const [recordedPaid, setRecordedPaid] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [dueAmount, setDueAmount] = useState(0)
  const [headerForm] = Form.useForm()
  const [lineForm] = Form.useForm()

  const effectivePaid = isEdit ? recordedPaid : paidAmount

  const warrantyActive = Form.useWatch('warrantyActive', lineForm)
  const selectedPartId = Form.useWatch('partId', lineForm)

  const loadCustomers = () => {
    if (!companyId) return Promise.resolve()
    return customerAPI.list(companyId).then(setCustomers)
  }

  const loadPartStocks = () => {
    if (!companyId || !branchId) return Promise.resolve()
    return partStockAPI
      .list(companyId, branchId, { page: 1, pageSize: 200 })
      .then((res: any) =>
        setPartStocks(
          (res.items || []).filter((i: any) => isEdit || Number(i.quantityOnHand) > 0)
        )
      )
  }

  useEffect(() => {
    if (!companyId) return
    loadCustomers()
    loadPartStocks()
    if (!isEdit) {
      headerForm.setFieldsValue({
        saleDate: dayjs(),
        paidAmount: 0,
        discount: 0,
        balance: 0,
        paymentMethod: 'cash'
      })
      lineForm.setFieldsValue({
        taxPercent: 0,
        whtPercent: 0,
        warrantyActive: false,
        quantity: 1,
        salePrice: 0
      })
      setPaidAmount(0)
      setDiscountAmount(0)
      setDueAmount(0)
    }
  }, [companyId, branchId, headerForm, lineForm, isEdit])

  useEffect(() => {
    if (!isEdit || !id) return
    setLoadingDetail(true)
    saleAPI
      .get(id)
      .then((detail: any) => {
        if (!detail?.sale) {
          message.error('Sale not found')
          navigate(App_Routes.SALES_LIST)
          return
        }
        if (!detail.editable && !detail.sale.editable) {
          message.warning('This sale can no longer be edited')
          navigate(App_Routes.SALE_DETAIL.replace(':id', id))
          return
        }

        const sale = detail.sale
        const payments = detail.payments || []
        const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)
        const discount = Number(sale.discount || 0)

        setRecordedPaid(totalPaid)
        setPaidAmount(totalPaid)
        setDiscountAmount(discount)
        setDueAmount(Number(sale.dueAmount || 0))

        headerForm.setFieldsValue({
          customerId: sale.customerId,
          saleDate: dayjs(sale.saleDate),
          discount,
          paidAmount: totalPaid,
          balance: Number(sale.dueAmount || 0),
          dueReminderDate: sale.dueReminderDate ? dayjs(sale.dueReminderDate) : undefined,
          notes: sale.notes || ''
        })

        setLines(
          (detail.lines || []).map((line: any) => {
            const lineTypeValue: SaleLineType = line.lineType === 'part' ? 'part' : 'product'
            return {
              key: line.id,
              id: line.id,
              lineType: lineTypeValue,
              productItemId: line.productItemId || undefined,
              partId: line.partId || undefined,
              serialNumber: line.serialNumber || undefined,
              productName: line.productName || '—',
              categoryName: line.categoryName || '—',
              colorName: line.colorName || undefined,
              quantity: Number(line.quantity || 1),
              salePrice: Number(line.salePrice || 0),
              taxPercent: Number(line.taxPercent || 0),
              whtPercent: Number(line.whtPercent || 0),
              warrantyActive: Boolean(line.warrantyActive),
              warrantyExpiryDate: line.warrantyExpiryDate
                ? dayjs(line.warrantyExpiryDate).format('YYYY-MM-DD')
                : undefined
            }
          })
        )
      })
      .catch((err: any) => {
        message.error(err.message || 'Failed to load sale')
        navigate(App_Routes.SALES_LIST)
      })
      .finally(() => setLoadingDetail(false))
  }, [id, isEdit, navigate, headerForm])

  const customerOptions = customers.map((c) => {
    const outstanding = Number(c.balance ?? 0)
    return {
      value: c.id,
      label: `${c.name}${c.phone ? ` · ${c.phone}` : ''}${outstanding > 0 ? ` · Due ${formatRs(outstanding)}` : ''}`
    }
  })

  const partOptions = useMemo(
    () =>
      partStocks.map((s) => ({
        value: s.partId,
        label: `${s.part?.name || 'Part'} · ${s.quantityOnHand} available${
          s.category?.name ? ` · ${s.category.name}` : ''
        }`
      })),
    [partStocks]
  )

  const selectedPartStock = useMemo(
    () => partStocks.find((s) => s.partId === selectedPartId),
    [partStocks, selectedPartId]
  )

  const partQtyMax = useMemo(() => {
    if (!selectedPartId) return undefined
    const stock = partStocks.find((s) => s.partId === selectedPartId)
    if (!stock) return undefined
    const available = Number(stock.quantityOnHand || 0)
    const onSale = lines
      .filter((l) => l.lineType === 'part' && l.partId === selectedPartId && l.key !== editingKey)
      .reduce((sum, l) => sum + l.quantity, 0)
    return available + (isEdit ? onSale : 0)
  }, [selectedPartId, partStocks, lines, editingKey, isEdit])

  const searchSerial = async (query: string) => {
    if (!query?.trim() || !companyId || !branchId) {
      setSearchResults([])
      return
    }
    const res = await inventoryAPI.search(companyId, branchId, query.trim())
    setSearchResults(res as any[])
  }

  const selectedItemId = Form.useWatch('productItemId', lineForm)
  const selectedItem = useMemo(
    () => searchResults.find((r) => r.id === selectedItemId),
    [searchResults, selectedItemId]
  )

  useEffect(() => {
    if (selectedItem && !editingKey) {
      lineForm.setFieldsValue({
        salePrice: Number(selectedItem.sellingPrice || selectedItem.purchasePrice || 0),
        warrantyActive: Boolean(selectedItem.warrantyActive),
        warrantyExpiryDate: selectedItem.warrantyExpiryDate
          ? dayjs(selectedItem.warrantyExpiryDate)
          : undefined,
        quantity: 1
      })
    }
  }, [selectedItem, lineForm, editingKey])

  useEffect(() => {
    if (selectedPartStock && !editingKey) {
      lineForm.setFieldsValue({
        salePrice: Number(
          selectedPartStock.sellingPrice ||
            selectedPartStock.part?.defaultSalePrice ||
            0
        ),
        quantity: 1,
        warrantyActive: false,
        warrantyExpiryDate: undefined
      })
    }
  }, [selectedPartStock, lineForm, editingKey])

  const resetLineForm = () => {
    lineForm.resetFields()
    lineForm.setFieldsValue({
      taxPercent: 0,
      whtPercent: 0,
      warrantyActive: false,
      quantity: 1,
      salePrice: 0
    })
    setSearchResults([])
  }

  const handleTabChange = (key: string) => {
    setLineType(key as SaleLineType)
    setEditingKey(null)
    resetLineForm()
  }

  const productItemFromForm = (productItemId: string) => {
    const fromSearch = searchResults.find((r) => r.id === productItemId)
    if (fromSearch) return fromSearch
    const fromLine = lines.find((l) => l.lineType === 'product' && l.productItemId === productItemId)
    if (!fromLine) return null
    return {
      id: fromLine.productItemId,
      serialNumber: fromLine.serialNumber,
      product: { name: fromLine.productName },
      category: { name: fromLine.categoryName },
      color: fromLine.colorName ? { name: fromLine.colorName } : undefined
    }
  }

  const addProductLine = async () => {
    const values = await lineForm.validateFields(['productItemId', 'salePrice', 'taxPercent', 'whtPercent', 'warrantyActive', 'warrantyExpiryDate'])
    const item = productItemFromForm(values.productItemId)
    if (!item) {
      message.error('Select a valid unit')
      return
    }
    if (
      lines.some(
        (l) =>
          l.lineType === 'product' &&
          l.productItemId === item.id &&
          (!editingKey || l.key !== editingKey)
      )
    ) {
      message.error('Unit already added to this sale')
      return
    }
    if (values.warrantyActive && !values.warrantyExpiryDate) {
      message.error('Warranty expiry is required when warranty is active')
      return
    }

    const nextLine: SaleLine = {
      key: editingKey || `product-${item.id}`,
      lineType: 'product',
      productItemId: item.id,
      serialNumber: item.serialNumber,
      productName: item.product?.name || '—',
      categoryName: item.category?.name || '—',
      colorName: item.color?.name,
      quantity: 1,
      salePrice: Number(values.salePrice || 0),
      taxPercent: Number(values.taxPercent || 0),
      whtPercent: Number(values.whtPercent || 0),
      warrantyActive: Boolean(values.warrantyActive),
      warrantyExpiryDate: values.warrantyActive
        ? values.warrantyExpiryDate.format('YYYY-MM-DD')
        : undefined
    }

    if (editingKey) {
      const existing = lines.find((l) => l.key === editingKey)
      if (!existing || existing.locked || existing.lineType !== 'product') {
        message.error('This line cannot be edited')
        return
      }
      setLines((prev) =>
        prev.map((l) =>
          l.key === editingKey ? { ...nextLine, id: existing.id, key: existing.key } : l
        )
      )
      setEditingKey(null)
      message.success('Line updated')
    } else {
      setLines((prev) => [...prev, nextLine])
    }

    resetLineForm()
  }

  const partQtyOnSale = (partId: string, excludeKey?: string | null) =>
    lines
      .filter((l) => l.lineType === 'part' && l.partId === partId && l.key !== excludeKey)
      .reduce((sum, l) => sum + l.quantity, 0)

  const addPartLine = async () => {
    const values = await lineForm.validateFields(['partId', 'quantity', 'salePrice', 'taxPercent', 'whtPercent'])
    const stock = partStocks.find((s) => s.partId === values.partId)
    if (!stock) {
      message.error('Select a valid part')
      return
    }
    const quantity = Math.floor(Number(values.quantity))
    if (!Number.isFinite(quantity) || quantity <= 0) {
      message.error('Quantity must be a positive whole number')
      return
    }
    const available = Number(stock.quantityOnHand || 0)
    const alreadyOnSale = partQtyOnSale(stock.partId, editingKey)
    const effectiveAvailable = available + (isEdit ? alreadyOnSale : 0)
    if (quantity > effectiveAvailable) {
      message.error(`Only ${effectiveAvailable} unit(s) available for this part`)
      return
    }

    const nextLine: SaleLine = {
      key: editingKey || `part-${stock.partId}-${Date.now()}`,
      lineType: 'part',
      partId: stock.partId,
      productName: stock.part?.name || '—',
      categoryName: stock.category?.name || '—',
      quantity,
      salePrice: Number(values.salePrice || 0),
      taxPercent: Number(values.taxPercent || 0),
      whtPercent: Number(values.whtPercent || 0),
      warrantyActive: false,
      availableUnits: available
    }

    if (editingKey) {
      const existing = lines.find((l) => l.key === editingKey)
      if (!existing || existing.locked || existing.lineType !== 'part') {
        message.error('This line cannot be edited')
        return
      }
      setLines((prev) =>
        prev.map((l) => (l.key === editingKey ? { ...nextLine, id: existing.id, key: existing.key } : l))
      )
      setEditingKey(null)
      message.success('Line updated')
      resetLineForm()
      return
    }

    const existingIdx = lines.findIndex((l) => l.lineType === 'part' && l.partId === stock.partId)
    if (existingIdx >= 0) {
      const requestedTotal = partQtyOnSale(stock.partId) + quantity
      if (requestedTotal > effectiveAvailable) {
        message.error(`Only ${effectiveAvailable} unit(s) available for this part`)
        return
      }
      setLines((prev) =>
        prev.map((l, i) =>
          i === existingIdx
            ? {
                ...l,
                quantity: l.quantity + quantity,
                salePrice: Number(values.salePrice || 0),
                taxPercent: Number(values.taxPercent || 0),
                whtPercent: Number(values.whtPercent || 0)
              }
            : l
        )
      )
    } else {
      setLines((prev) => [...prev, nextLine])
    }
    resetLineForm()
  }

  const startEditLine = async (line: SaleLine) => {
    if (line.locked) {
      message.warning('This line cannot be edited')
      return
    }

    setEditingKey(line.key)
    setLineType(line.lineType)

    if (line.lineType === 'product') {
      if (line.productItemId) {
        try {
          const detail: any = await inventoryAPI.detail(line.productItemId)
          if (detail?.item) setSearchResults([detail.item])
        } catch {
          setSearchResults([
            {
              id: line.productItemId,
              serialNumber: line.serialNumber,
              product: { name: line.productName },
              category: { name: line.categoryName },
              color: line.colorName ? { name: line.colorName } : undefined
            }
          ])
        }
      }
      lineForm.setFieldsValue({
        productItemId: line.productItemId,
        serialSearch: line.productItemId,
        salePrice: line.salePrice,
        taxPercent: line.taxPercent,
        whtPercent: line.whtPercent,
        warrantyActive: line.warrantyActive,
        warrantyExpiryDate: line.warrantyExpiryDate ? dayjs(line.warrantyExpiryDate) : undefined
      })
      return
    }

    lineForm.setFieldsValue({
      partId: line.partId,
      quantity: line.quantity,
      salePrice: line.salePrice,
      taxPercent: line.taxPercent,
      whtPercent: line.whtPercent,
      warrantyActive: false,
      warrantyExpiryDate: undefined
    })
  }

  const cancelEditLine = () => {
    setEditingKey(null)
    resetLineForm()
  }

  const addLine = async () => {
    try {
      if (lineType === 'product') await addProductLine()
      else await addPartLine()
    } catch {
      // validation shown by form
    }
  }

  const removeLine = (key: string) => {
    const line = lines.find((l) => l.key === key)
    if (line?.locked) return
    setLines((prev) => prev.filter((l) => l.key !== key))
    if (editingKey === key) cancelEditLine()
  }

  const subtotal = roundAmount(lines.reduce((s, l) => s + l.salePrice * l.quantity, 0))
  const totalTax = roundAmount(
    lines.reduce((s, l) => s + (l.salePrice * l.quantity * l.taxPercent) / 100, 0)
  )
  const totalWht = roundAmount(
    lines.reduce((s, l) => s + (l.salePrice * l.quantity * l.whtPercent) / 100, 0)
  )
  const grossTotal = roundAmount(subtotal + totalTax + totalWht)
  const maxDiscount = Math.max(0, roundAmount(grossTotal - effectivePaid))

  useEffect(() => {
    const due = calcDueAmount(grossTotal, effectivePaid, discountAmount)
    if (due !== dueAmount) {
      setDueAmount(due)
      headerForm.setFieldValue('balance', due)
    }
  }, [grossTotal, effectivePaid, discountAmount, dueAmount, headerForm])

  const handlePaymentValuesChange = (
    changed: Record<string, unknown>,
    all: { paidAmount?: number; discount?: number }
  ) => {
    if (grossTotal <= 0) return

    const paid = isEdit
      ? recordedPaid
      : Math.max(0, Math.min(Number(all.paidAmount ?? paidAmount), grossTotal))
    let discount = Math.max(0, Number(all.discount ?? discountAmount))

    if ('paidAmount' in changed || 'discount' in changed) {
      if (paid + discount > grossTotal) {
        if ('discount' in changed || isEdit) {
          discount = roundAmount(grossTotal - paid)
          if ('discount' in changed) {
            message.warning('Discount cannot exceed sale total minus recorded payments')
          }
        } else {
          discount = roundAmount(Math.max(0, grossTotal - paid))
        }
      }

      const due = calcDueAmount(grossTotal, paid, discount)
      const patch: Record<string, unknown> = { discount, balance: due }
      if (!isEdit) patch.paidAmount = paid
      headerForm.setFieldsValue(patch)
      if (!isEdit) setPaidAmount(paid)
      setDiscountAmount(discount)
      setDueAmount(due)
      if (due === 0) {
        headerForm.setFieldValue('dueReminderDate', undefined)
      }
    }
  }

  const handleSubmit = async () => {
    if (!lines.length) {
      message.error('Add at least one line')
      return
    }
    const header = await headerForm.validateFields()
    const paid = isEdit ? recordedPaid : Number(header.paidAmount || 0)
    const discount = Number(header.discount || 0)
    const due = calcDueAmount(grossTotal, paid, discount)
    if (roundAmount(paid + discount) > grossTotal) {
      message.error(
        isEdit
          ? 'Discount cannot exceed sale total minus recorded payments'
          : 'Paid amount + discount cannot exceed sale total'
      )
      return
    }
    if (due > 0 && !header.dueReminderDate) {
      message.error('Select a due reminder date')
      return
    }
    setLoading(true)
    try {
      const payload = {
        customerId: header.customerId,
        saleDate: header.saleDate.format('YYYY-MM-DD'),
        discount,
        notes: header.notes?.trim() || undefined,
        dueReminderDate: due > 0 ? header.dueReminderDate.format('YYYY-MM-DD') : undefined,
        lines: lines.map((l) =>
          l.lineType === 'product'
            ? {
                lineType: 'product',
                productItemId: l.productItemId,
                quantity: 1,
                salePrice: l.salePrice,
                taxPercent: l.taxPercent,
                whtPercent: l.whtPercent,
                warrantyActive: l.warrantyActive,
                warrantyExpiryDate: l.warrantyExpiryDate
              }
            : {
                lineType: 'part',
                partId: l.partId,
                quantity: l.quantity,
                salePrice: l.salePrice,
                taxPercent: l.taxPercent,
                whtPercent: l.whtPercent
              }
        )
      }

      const res: any = isEdit
        ? await saleAPI.update(id!, companyId, branchId, audit(), payload)
        : await saleAPI.create(companyId, branchId, audit(), {
            ...payload,
            paidAmount: paid,
            paymentMethod: header.paymentMethod
          })

      const savedDue = res?.dueAmount ?? due
      if (isEdit) {
        message.success(
          savedDue > 0
            ? `Sale updated — ${formatRs(savedDue)} due from customer`
            : `Sale updated — ${lines.length} line(s)`
        )
        navigate(App_Routes.SALE_DETAIL.replace(':id', id!))
        return
      }

      message.success(
        savedDue > 0
          ? `Sale saved — ${formatRs(savedDue)} due from customer`
          : `Sale saved — ${lines.length} line(s)`
      )
      setLines([])
      setEditingKey(null)
      headerForm.resetFields()
      resetLineForm()
      setPaidAmount(0)
      setDiscountAmount(0)
      setDueAmount(0)
      headerForm.setFieldsValue({
        saleDate: dayjs(),
        paidAmount: 0,
        discount: 0,
        balance: 0,
        paymentMethod: 'cash'
      })
      loadCustomers()
      loadPartStocks()
    } catch (err: any) {
      message.error(err.message || (isEdit ? 'Update failed' : 'Sale failed'))
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
          onClick={() => navigate(App_Routes.SALE_DETAIL.replace(':id', id!))}
        >
          Back to Sale Detail
        </Button>
      )}

      <PageHeader
        title={isEdit ? 'Edit Sale' : 'New Sale'}
        subtitle={
          isEdit
            ? 'Update sale lines, pricing, and customer details. Recorded payments cannot be changed here.'
            : 'Sell products and spare parts to a customer.'
        }
      />

      <Card bordered={false} className="shadow-sm mb-4">
        <Form form={headerForm} layout="vertical">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Select customer' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Select customer"
                options={customerOptions}
                onOpenChange={(open) => {
                  if (open) loadCustomers()
                }}
              />
            </Form.Item>
            <Form.Item name="saleDate" label="Sale Date" rules={[{ required: true }]}>
              <DatePicker className="w-full" style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Card>

      <Card
        title={editingKey ? (lineType === 'part' ? 'Edit part line' : 'Edit product line') : 'Add line'}
        bordered={false}
        className="shadow-sm mb-4"
      >
        <Tabs
          activeKey={lineType}
          onChange={handleTabChange}
          items={[
            { key: 'product', label: 'Product' },
            { key: 'part', label: 'Part' }
          ]}
        />
        <Form form={lineForm} layout="vertical" initialValues={{ taxPercent: 0, whtPercent: 0, warrantyActive: false, quantity: 1 }}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {lineType === 'product' ? (
              <>
                <Form.Item name="serialSearch" label="Chassis Number">
                  <Select
                    showSearch
                    filterOption={false}
                    placeholder="Search chassis number"
                    onSearch={searchSerial}
                    notFoundContent="Type to search in-stock units"
                    options={searchResults.map((r) => ({
                      value: r.id,
                      label: `${r.serialNumber} · ${r.product?.name || ''}`
                    }))}
                    onChange={(id) => lineForm.setFieldValue('productItemId', id)}
                  />
                </Form.Item>
                <Form.Item name="productItemId" hidden rules={[{ required: true, message: 'Select a unit' }]}>
                  <Input />
                </Form.Item>
                <Form.Item label="Product">
                  <Input value={selectedItem?.product?.name || '—'} disabled />
                </Form.Item>
                <Form.Item label="Category">
                  <Input value={selectedItem?.category?.name || '—'} disabled />
                </Form.Item>
                <Form.Item name="salePrice" label="Sale Price" rules={[{ required: true }]}>
                  <InputNumber className="w-full" min={0} style={{ width: '100%' }} disabled />
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
                    placeholder="Select part in stock"
                    options={partOptions}
                    onOpenChange={(open) => {
                      if (open) loadPartStocks()
                    }}
                  />
                </Form.Item>
                <Form.Item label="Available">
                  <Input
                    value={selectedPartStock ? String(selectedPartStock.quantityOnHand) : '—'}
                    disabled
                  />
                </Form.Item>
                <Form.Item label="Category">
                  <Input value={selectedPartStock?.category?.name || '—'} disabled />
                </Form.Item>
                <Form.Item
                  name="quantity"
                  label="Units"
                  rules={[{ required: true, message: 'Enter units' }]}
                >
                  <InputNumber
                    className="w-full"
                    min={1}
                    max={partQtyMax}
                    step={1}
                    precision={0}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                <Form.Item name="salePrice" label="Sale Price" rules={[{ required: true }]}>
                  <InputNumber className="w-full" min={0} style={{ width: '100%' }} disabled />
                </Form.Item>
              </>
            )}
            <Form.Item name="taxPercent" label="Tax %">
              <InputNumber className="w-full" min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="whtPercent" label="WHT %">
              <InputNumber className="w-full" min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
            {lineType === 'product' && (
              <>
                <Form.Item name="warrantyActive" label="Warranty Active" valuePropName="checked">
                  <Switch />
                </Form.Item>
                {warrantyActive && (
                  <Form.Item name="warrantyExpiryDate" label="Warranty Expiry" rules={[{ required: true }]}>
                    <DatePicker className="w-full" style={{ width: '100%' }} />
                  </Form.Item>
                )}
              </>
            )}
          </div>
          <Space>
            <Button type="dashed" icon={editingKey ? <EditOutlined /> : <PlusOutlined />} onClick={addLine}>
              {editingKey ? 'Update line' : 'Add to sale'}
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
            {
              title: 'Type',
              dataIndex: 'lineType',
              width: 90,
              render: (v: SaleLineType) => (
                <Tag color={v === 'part' ? 'blue' : 'default'}>{v === 'part' ? 'Part' : 'Product'}</Tag>
              )
            },
            {
              title: 'Chassis / Ref',
              render: (_: unknown, r: SaleLine) =>
                r.lineType === 'product' ? <Text strong>{r.serialNumber}</Text> : '—'
            },
            { title: 'Name', dataIndex: 'productName' },
            { title: 'Category', dataIndex: 'categoryName' },
            {
              title: 'Qty',
              dataIndex: 'quantity',
              align: 'right' as const
            },
            {
              title: 'Sale Price',
              dataIndex: 'salePrice',
              align: 'right' as const,
              render: formatRs
            },
            { title: 'Tax %', dataIndex: 'taxPercent' },
            { title: 'WHT %', dataIndex: 'whtPercent' },
            {
              title: 'Line Total',
              align: 'right' as const,
              render: (_: unknown, r: SaleLine) => formatRs(calcLineTotal(r))
            },
            {
              title: 'Warranty',
              render: (_: unknown, r: SaleLine) =>
                r.lineType === 'product'
                  ? r.warrantyActive
                    ? `Yes · ${r.warrantyExpiryDate}`
                    : 'No'
                  : '—'
            },
            {
              title: '',
              width: 88,
              render: (_: unknown, r: SaleLine) =>
                r.locked ? (
                  <Space size={0}>
                    <Tooltip title="This line cannot be edited">
                      <Button type="text" icon={<EditOutlined />} disabled />
                    </Tooltip>
                    <Tooltip title="This line cannot be removed">
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
        <Form
          form={headerForm}
          layout="vertical"
          className="mt-4 pt-4 border-t border-slate-100"
          onValuesChange={handlePaymentValuesChange}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {isEdit ? (
              <Form.Item label="Recorded Payments">
                <InputNumber className="w-full" value={recordedPaid} disabled style={{ width: '100%' }} />
              </Form.Item>
            ) : (
              <Form.Item
                name="paidAmount"
                label="Amount Paid Now"
                rules={[
                  {
                    validator: (_, value) => {
                      const paid = Number(value || 0)
                      const discount = Number(headerForm.getFieldValue('discount') || 0)
                      if (grossTotal > 0 && paid + discount > grossTotal) {
                        return Promise.reject(new Error('Paid + discount cannot exceed sale total'))
                      }
                      return Promise.resolve()
                    }
                  }
                ]}
              >
                <InputNumber className="w-full" min={0} max={grossTotal > 0 ? grossTotal : undefined} style={{ width: '100%' }} />
              </Form.Item>
            )}
            <Form.Item
              name="discount"
              label="Discount"
              rules={[
                {
                  validator: (_, value) => {
                    const discount = Number(value || 0)
                    const paid = isEdit
                      ? recordedPaid
                      : Number(headerForm.getFieldValue('paidAmount') || 0)
                    if (grossTotal > 0 && paid + discount > grossTotal) {
                      return Promise.reject(
                        new Error(
                          isEdit
                            ? 'Discount cannot exceed sale total minus recorded payments'
                            : 'Discount cannot exceed sale total minus amount paid'
                        )
                      )
                    }
                    return Promise.resolve()
                  }
                }
              ]}
            >
              <InputNumber className="w-full" min={0} max={maxDiscount || undefined} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="balance" label="Balance (Due)">
              <InputNumber className="w-full" disabled style={{ width: '100%' }} />
            </Form.Item>
            {dueAmount > 0 && (
              <Form.Item
                name="dueReminderDate"
                label="Due Reminder Date"
                rules={[{ required: true, message: 'Select a reminder date for the due amount' }]}
              >
                <DatePicker className="w-full" style={{ width: '100%' }} />
              </Form.Item>
            )}
            {!isEdit && (
              <Form.Item name="paymentMethod" label="Payment Method">
                <Select
                  options={[
                    { value: 'cash', label: 'Cash' },
                    { value: 'bank', label: 'Bank' },
                    { value: 'card', label: 'Card' }
                  ]}
                />
              </Form.Item>
            )}
            <Form.Item name="notes" label="Notes" className="md:col-span-2 lg:col-span-4">
              <Input placeholder="Optional notes" />
            </Form.Item>
          </div>
        </Form>
        <div className="mt-6 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 overflow-hidden shadow-sm">
          <div className="flex flex-wrap justify-between items-stretch gap-6 p-5">
            <div className="min-w-[280px] flex-1">
              <Text type="secondary" className="text-xs uppercase tracking-wider font-semibold">
                Sale Summary
              </Text>
              <div className="mt-4 space-y-2.5 text-sm max-w-md">
                <div className="flex justify-between gap-6 text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-medium text-slate-800">{formatRs(subtotal)}</span>
                </div>
                <div className="flex justify-between gap-6 text-slate-600">
                  <span>Tax</span>
                  <span className="font-medium text-emerald-700">+ {formatRs(totalTax)}</span>
                </div>
                <div className="flex justify-between gap-6 text-slate-600">
                  <span>WHT</span>
                  <span className="font-medium text-emerald-700">+ {formatRs(totalWht)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between gap-6 text-slate-600">
                    <span>Discount</span>
                    <span className="font-medium text-amber-700">− {formatRs(discountAmount)}</span>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200/80 space-y-3">
                <div className="flex justify-between gap-6 items-baseline">
                  <Text strong className="text-base text-slate-800">
                    Sale Total
                  </Text>
                  <Text strong className="text-xl text-slate-900">
                    {formatRs(grossTotal)}
                  </Text>
                </div>
                {grossTotal > 0 && dueAmount > 0 && (
                  <div className="flex justify-between gap-6 items-center rounded-lg bg-red-50 border border-red-100 px-4 py-3">
                    <Text strong className="text-red-700">
                      Amount Due
                    </Text>
                    <Text strong className="text-lg text-red-600">
                      {formatRs(dueAmount)}
                    </Text>
                  </div>
                )}
                {grossTotal > 0 && dueAmount === 0 && effectivePaid > 0 && (
                  <div className="flex justify-between gap-6 items-center rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
                    <Text strong className="text-emerald-700">
                      Fully Paid
                    </Text>
                    <Text strong className="text-emerald-600">
                      {formatRs(effectivePaid)}
                    </Text>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col justify-end gap-3 sm:min-w-[200px]">
              <Button
                onClick={() => {
                  setLines([])
                  cancelEditLine()
                }}
                disabled={!lines.length}
                block
              >
                Clear
              </Button>
              <Button
                type="primary"
                size="large"
                loading={loading}
                onClick={handleSubmit}
                disabled={!lines.length}
                block
              >
                {isEdit ? 'Save Changes' : 'Complete Sale'}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default NewSale
