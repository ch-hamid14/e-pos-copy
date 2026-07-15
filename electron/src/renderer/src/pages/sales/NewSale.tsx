import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { customerAPI, inventoryAPI, partStockAPI, saleAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, PageHeader } from '../shared/page-ui'

const { Text } = Typography

type SaleLineType = 'product' | 'part'

type SaleLine = {
  key: string
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
  const { companyId, branchId, audit } = useSession()
  const [customers, setCustomers] = useState<any[]>([])
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [partStocks, setPartStocks] = useState<any[]>([])
  const [lines, setLines] = useState<SaleLine[]>([])
  const [lineType, setLineType] = useState<SaleLineType>('product')
  const [loading, setLoading] = useState(false)
  const [paidAmount, setPaidAmount] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [dueAmount, setDueAmount] = useState(0)
  const [headerForm] = Form.useForm()
  const [lineForm] = Form.useForm()

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
      .then((res: any) => setPartStocks((res.items || []).filter((i: any) => Number(i.quantityOnHand) > 0)))
  }

  useEffect(() => {
    if (!companyId) return
    loadCustomers()
    loadPartStocks()
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
  }, [companyId, branchId, headerForm, lineForm])

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
    if (selectedItem) {
      lineForm.setFieldsValue({
        salePrice: Number(selectedItem.sellingPrice || selectedItem.purchasePrice || 0),
        warrantyActive: Boolean(selectedItem.warrantyActive),
        warrantyExpiryDate: selectedItem.warrantyExpiryDate
          ? dayjs(selectedItem.warrantyExpiryDate)
          : undefined,
        quantity: 1
      })
    }
  }, [selectedItem, lineForm])

  useEffect(() => {
    if (selectedPartStock) {
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
  }, [selectedPartStock, lineForm])

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

  const addProductLine = async () => {
    const values = await lineForm.validateFields(['productItemId', 'salePrice', 'taxPercent', 'whtPercent', 'warrantyActive', 'warrantyExpiryDate'])
    const item = searchResults.find((r) => r.id === values.productItemId)
    if (!item) {
      message.error('Select a valid unit')
      return
    }
    if (lines.some((l) => l.lineType === 'product' && l.productItemId === item.id)) {
      message.error('Unit already added to this sale')
      return
    }
    if (values.warrantyActive && !values.warrantyExpiryDate) {
      message.error('Warranty expiry is required when warranty is active')
      return
    }

    setLines((prev) => [
      ...prev,
      {
        key: `product-${item.id}`,
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
    ])
    resetLineForm()
  }

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
    const already = lines
      .filter((l) => l.lineType === 'part' && l.partId === stock.partId)
      .reduce((sum, l) => sum + l.quantity, 0)
    if (already + quantity > available) {
      message.error(`Only ${available} unit(s) available for this part`)
      return
    }

    const existingIdx = lines.findIndex((l) => l.lineType === 'part' && l.partId === stock.partId)
    if (existingIdx >= 0) {
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
      setLines((prev) => [
        ...prev,
        {
          key: `part-${stock.partId}-${Date.now()}`,
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
      ])
    }
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

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key))

  const subtotal = roundAmount(lines.reduce((s, l) => s + l.salePrice * l.quantity, 0))
  const totalTax = roundAmount(
    lines.reduce((s, l) => s + (l.salePrice * l.quantity * l.taxPercent) / 100, 0)
  )
  const totalWht = roundAmount(
    lines.reduce((s, l) => s + (l.salePrice * l.quantity * l.whtPercent) / 100, 0)
  )
  const grossTotal = roundAmount(subtotal + totalTax + totalWht)
  const maxDiscount = Math.max(0, roundAmount(grossTotal - paidAmount))

  useEffect(() => {
    const due = calcDueAmount(grossTotal, paidAmount, discountAmount)
    if (due !== dueAmount) {
      setDueAmount(due)
      headerForm.setFieldValue('balance', due)
    }
  }, [grossTotal, paidAmount, discountAmount, dueAmount, headerForm])

  const handlePaymentValuesChange = (
    changed: Record<string, unknown>,
    all: { paidAmount?: number; discount?: number }
  ) => {
    if (grossTotal <= 0) return

    const paid = Math.max(0, Math.min(Number(all.paidAmount ?? paidAmount), grossTotal))
    let discount = Math.max(0, Number(all.discount ?? discountAmount))

    if ('paidAmount' in changed || 'discount' in changed) {
      if (paid + discount > grossTotal) {
        if ('discount' in changed) {
          discount = roundAmount(grossTotal - paid)
          message.warning('Discount cannot exceed sale total minus amount paid')
        } else {
          discount = roundAmount(Math.max(0, grossTotal - paid))
        }
      }

      const due = calcDueAmount(grossTotal, paid, discount)
      headerForm.setFieldsValue({ paidAmount: paid, discount, balance: due })
      setPaidAmount(paid)
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
    const paid = Number(header.paidAmount || 0)
    const discount = Number(header.discount || 0)
    const due = calcDueAmount(grossTotal, paid, discount)
    if (roundAmount(paid + discount) > grossTotal) {
      message.error('Paid amount + discount cannot exceed sale total')
      return
    }
    if (due > 0 && !header.dueReminderDate) {
      message.error('Select a due reminder date')
      return
    }
    setLoading(true)
    try {
      const res: any = await saleAPI.create(companyId, branchId, audit(), {
        customerId: header.customerId,
        saleDate: header.saleDate.format('YYYY-MM-DD'),
        discount,
        paidAmount: paid,
        paymentMethod: header.paymentMethod,
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
      })
      const savedDue = res?.dueAmount ?? due
      message.success(
        savedDue > 0
          ? `Sale saved — ${formatRs(savedDue)} due from customer`
          : `Sale saved — ${lines.length} line(s)`
      )
      setLines([])
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
      message.error(err.message || 'Sale failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader title="New Sale" subtitle="Sell products and spare parts to a customer." />

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

      <Card title="Add line" bordered={false} className="shadow-sm mb-4">
        <Tabs
          activeKey={lineType}
          onChange={(key) => {
            setLineType(key as SaleLineType)
            resetLineForm()
          }}
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
                    max={selectedPartStock ? Number(selectedPartStock.quantityOnHand) : undefined}
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
          <Button type="dashed" icon={<PlusOutlined />} onClick={addLine}>
            Add to sale
          </Button>
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
              width: 48,
              render: (_: unknown, r: SaleLine) => (
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeLine(r.key)} />
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
            <Form.Item
              name="discount"
              label="Discount"
              rules={[
                {
                  validator: (_, value) => {
                    const discount = Number(value || 0)
                    const paid = Number(headerForm.getFieldValue('paidAmount') || 0)
                    if (grossTotal > 0 && paid + discount > grossTotal) {
                      return Promise.reject(
                        new Error('Discount cannot exceed sale total minus amount paid')
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
            <Form.Item name="paymentMethod" label="Payment Method">
              <Select
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'bank', label: 'Bank' },
                  { value: 'card', label: 'Card' }
                ]}
              />
            </Form.Item>
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
                {grossTotal > 0 && dueAmount === 0 && paidAmount > 0 && (
                  <div className="flex justify-between gap-6 items-center rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
                    <Text strong className="text-emerald-700">
                      Fully Paid
                    </Text>
                    <Text strong className="text-emerald-600">
                      {formatRs(paidAmount)}
                    </Text>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col justify-end gap-3 sm:min-w-[200px]">
              <Button onClick={() => setLines([])} disabled={!lines.length} block>
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
                Complete Sale
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default NewSale
