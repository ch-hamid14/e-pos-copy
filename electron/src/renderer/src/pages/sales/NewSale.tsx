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
import { CustomerQuickModal } from '@/renderer/components/quick/CustomerQuickModal'
import { SelectQuickFooter } from '@/renderer/components/quick/SelectQuickFooter'
import {
  focusFormFieldError,
  scrollToElementId,
  validateAndScroll
} from '@/renderer/utils/formScroll'

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
  taxInclusive: boolean
  whtPercent: number
  warrantyActive: boolean
  warrantyYears?: number
  warrantyExpiryDate?: string
  availableUnits?: number
  locked?: boolean
  /** Preserved DB amounts (edit load) so rounding does not drift until the line is re-entered. */
  fixedAmounts?: { base: number; tax: number; wht: number; total: number }
}

function roundAmount(n: number): number {
  return Math.round(Number(n) || 0)
}

function calcLineAmounts(
  line: Pick<
    SaleLine,
    'salePrice' | 'taxPercent' | 'taxInclusive' | 'whtPercent' | 'quantity' | 'fixedAmounts'
  >
) {
  if (line.fixedAmounts) {
    return {
      base: line.fixedAmounts.base,
      tax: line.fixedAmounts.tax,
      wht: line.fixedAmounts.wht,
      total: line.fixedAmounts.total
    }
  }

  const entered = roundAmount(line.salePrice * line.quantity)
  const taxPercent = Number(line.taxPercent || 0)
  const whtPercent = Number(line.whtPercent || 0)
  // Inclusive: entered price already contains sales tax and Tax u/s 236 G/H.
  const inclusive = Boolean(line.taxInclusive) && (taxPercent > 0 || whtPercent > 0)
  const factor = 1 + taxPercent / 100 + whtPercent / 100

  if (inclusive) {
    const base = roundAmount(entered / factor)
    let tax: number
    let wht: number
    // Keep total = entered; put leftover paisa into the last tax component.
    if (taxPercent > 0 && whtPercent > 0) {
      tax = roundAmount((base * taxPercent) / 100)
      wht = roundAmount(entered - base - tax)
    } else if (whtPercent > 0) {
      tax = 0
      wht = roundAmount(entered - base)
    } else {
      tax = roundAmount(entered - base)
      wht = 0
    }
    return { base, tax, wht, total: entered }
  }

  const base = entered
  const tax = roundAmount((base * taxPercent) / 100)
  const wht = roundAmount((base * whtPercent) / 100)
  return { base, tax, wht, total: roundAmount(base + tax + wht) }
}

function calcLineTotal(
  line: Pick<
    SaleLine,
    'salePrice' | 'taxPercent' | 'taxInclusive' | 'whtPercent' | 'quantity' | 'fixedAmounts'
  >
) {
  return calcLineAmounts(line).total
}

/** Pricing fields for create/update API — keep frozen edit totals via inclusive resubmit. */
function lineApiPricing(l: SaleLine) {
  if (l.fixedAmounts) {
    return {
      salePrice: roundAmount(l.fixedAmounts.total / Math.max(1, l.quantity)),
      taxInclusive: true,
      taxPercent: l.taxPercent,
      whtPercent: l.whtPercent
    }
  }
  return {
    salePrice: l.salePrice,
    taxInclusive: l.taxInclusive,
    taxPercent: l.taxPercent,
    whtPercent: l.whtPercent
  }
}

function calcDueAmount(grossTotal: number, paid: number, discount: number) {
  if (grossTotal <= 0) return 0
  return Math.max(0, roundAmount(grossTotal - paid - discount))
}

function formatFifoLayers(layers: { unitCost: number; quantity: number }[]): string {
  if (!layers.length) return '—'
  return layers.map((l) => `${l.quantity} @ ${formatRs(l.unitCost)}`).join(' · ')
}

export const NewSale = () => {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { companyId, branchId, audit } = useSession()
  const [customers, setCustomers] = useState<any[]>([])
  const [customerQuickOpen, setCustomerQuickOpen] = useState(false)
  const [customerQuickEditing, setCustomerQuickEditing] = useState<any | null>(null)
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
  const partQuantity = Form.useWatch('quantity', lineForm)
  const selectedCustomerId = Form.useWatch('customerId', headerForm)
  const [partFifoPreview, setPartFifoPreview] = useState<{
    unitCost: number
    nextLotUnitCost: number
    nextLotSalePrice: number
    layers: { unitCost: number; quantity: number; purchaseDate: string }[]
  } | null>(null)

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
        taxInclusive: true,
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
            const quantity = Number(line.quantity || 1)
            const base = Number(line.salePrice || 0) * quantity
            const tax = Number(line.taxAmount || 0)
            const wht = Number(line.whtAmount || 0)
            const total = Number(line.lineTotal != null ? line.lineTotal : base + tax + wht)
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
              quantity,
              salePrice: Number(line.salePrice || 0),
              taxPercent: Number(line.taxPercent || 0),
              // Stored salePrice is the ex-tax base; keep exclusive in the form until re-edited.
              taxInclusive: false,
              whtPercent: Number(line.whtPercent || 0),
              warrantyActive: Boolean(line.warrantyActive),
              warrantyYears: line.warrantyYears != null ? Number(line.warrantyYears) : undefined,
              warrantyExpiryDate: line.warrantyExpiryDate
                ? dayjs(line.warrantyExpiryDate).format('YYYY-MM-DD')
                : undefined,
              fixedAmounts: {
                base: roundAmount(base),
                tax: roundAmount(tax),
                wht: roundAmount(wht),
                total: roundAmount(total)
              }
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

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  )

  const openAddCustomer = () => {
    setCustomerQuickEditing(null)
    setCustomerQuickOpen(true)
  }

  const openEditCustomer = () => {
    if (!selectedCustomer) return
    setCustomerQuickEditing(selectedCustomer)
    setCustomerQuickOpen(true)
  }

  const handleCustomerQuickSaved = async (customer: { id: string }) => {
    setCustomerQuickOpen(false)
    setCustomerQuickEditing(null)
    await loadCustomers()
    headerForm.setFieldValue('customerId', customer.id)
  }

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
        warrantyYears:
          selectedItem.warrantyYears != null
            ? Number(selectedItem.warrantyYears)
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
        warrantyYears: undefined
      })
    }
  }, [selectedPartStock, lineForm, editingKey])

  useEffect(() => {
    if (!companyId || !branchId || !selectedPartId || lineType !== 'part') {
      setPartFifoPreview(null)
      return
    }
    const qty = Math.max(1, Math.floor(Number(partQuantity || 1)))
    partStockAPI
      .fifoPreview(companyId, branchId, selectedPartId, qty)
      .then((preview: any) => setPartFifoPreview(preview))
      .catch(() => setPartFifoPreview(null))
  }, [companyId, branchId, selectedPartId, partQuantity, lineType])

  const resetLineForm = () => {
    lineForm.resetFields()
    lineForm.setFieldsValue({
      taxPercent: 0,
      taxInclusive: true,
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
    const values = await validateAndScroll(lineForm, [
      'productItemId',
      'salePrice',
      'taxPercent',
      'taxInclusive',
      'whtPercent',
      'warrantyActive',
      'warrantyYears'
    ])
    const item = productItemFromForm(values.productItemId)
    if (!item) {
      focusFormFieldError(lineForm, 'productItemId', 'Select a valid unit')
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
      focusFormFieldError(lineForm, 'productItemId', 'Unit already added to this sale')
      message.error('Unit already added to this sale')
      return
    }
    if (values.warrantyActive && !(Number(values.warrantyYears) >= 1)) {
      focusFormFieldError(
        lineForm,
        'warrantyYears',
        'Warranty years (at least 1) required when warranty is active'
      )
      message.error('Warranty years (at least 1) required when warranty is active')
      return
    }

    const saleDate = headerForm.getFieldValue('saleDate')
    const baseDate = saleDate ? dayjs(saleDate) : dayjs()
    const warrantyYears = values.warrantyActive ? Math.floor(Number(values.warrantyYears)) : undefined
    const warrantyExpiryDate =
      values.warrantyActive && warrantyYears
        ? baseDate.add(warrantyYears, 'year').format('YYYY-MM-DD')
        : undefined

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
      taxInclusive: Boolean(values.taxInclusive),
      whtPercent: Number(values.whtPercent || 0),
      warrantyActive: Boolean(values.warrantyActive),
      warrantyYears,
      warrantyExpiryDate
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
    const values = await validateAndScroll(lineForm, [
      'partId',
      'quantity',
      'salePrice',
      'taxPercent',
      'taxInclusive',
      'whtPercent'
    ])
    const stock = partStocks.find((s) => s.partId === values.partId)
    if (!stock) {
      focusFormFieldError(lineForm, 'partId', 'Select a valid part')
      message.error('Select a valid part')
      return
    }
    const quantity = Math.floor(Number(values.quantity))
    if (!Number.isFinite(quantity) || quantity <= 0) {
      focusFormFieldError(lineForm, 'quantity', 'Quantity must be a positive whole number')
      message.error('Quantity must be a positive whole number')
      return
    }
    const available = Number(stock.quantityOnHand || 0)
    const alreadyOnSale = partQtyOnSale(stock.partId, editingKey)
    const effectiveAvailable = available + (isEdit ? alreadyOnSale : 0)
    if (quantity > effectiveAvailable) {
      focusFormFieldError(
        lineForm,
        'quantity',
        `Only ${effectiveAvailable} unit(s) available for this part`
      )
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
      taxInclusive: Boolean(values.taxInclusive),
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
        focusFormFieldError(
          lineForm,
          'quantity',
          `Only ${effectiveAvailable} unit(s) available for this part`
        )
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
                taxInclusive: Boolean(values.taxInclusive),
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

    // Prefer the frozen customer-facing total so re-saving does not reintroduce rounding drift.
    const editSalePrice = line.fixedAmounts
      ? roundAmount(line.fixedAmounts.total / Math.max(1, line.quantity))
      : line.salePrice
    const editTaxInclusive = line.fixedAmounts ? true : line.taxInclusive

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
        salePrice: editSalePrice,
        taxPercent: line.taxPercent,
        taxInclusive: editTaxInclusive,
        whtPercent: line.whtPercent,
        warrantyActive: line.warrantyActive,
        warrantyYears: line.warrantyYears
      })
      return
    }

    lineForm.setFieldsValue({
      partId: line.partId,
      quantity: line.quantity,
      salePrice: editSalePrice,
      taxPercent: line.taxPercent,
      taxInclusive: editTaxInclusive,
      whtPercent: line.whtPercent,
      warrantyActive: false,
      warrantyYears: undefined
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

  const subtotal = lines.reduce((s, l) => s + calcLineAmounts(l).base, 0)
  const totalTax = lines.reduce((s, l) => s + calcLineAmounts(l).tax, 0)
  const totalWht = lines.reduce((s, l) => s + calcLineAmounts(l).wht, 0)
  const grossTotal = lines.reduce((s, l) => s + calcLineAmounts(l).total, 0)
  const anyTaxInclusive = lines.some(
    (l) =>
      Boolean(l.fixedAmounts) ||
      (l.taxInclusive && (Number(l.taxPercent) > 0 || Number(l.whtPercent) > 0))
  )
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
      scrollToElementId('sale-line-form')
      return
    }
    let header: any
    try {
      header = await validateAndScroll(headerForm)
    } catch {
      return
    }
    const paid = isEdit ? recordedPaid : Number(header.paidAmount || 0)
    const discount = Number(header.discount || 0)
    const due = calcDueAmount(grossTotal, paid, discount)
    if (roundAmount(paid + discount) > grossTotal) {
      const msg = isEdit
        ? 'Discount cannot exceed sale total minus recorded payments'
        : 'Paid amount + discount cannot exceed sale total'
      focusFormFieldError(headerForm, isEdit ? 'discount' : 'paidAmount', msg)
      message.error(msg)
      return
    }
    if (due > 0 && !header.dueReminderDate) {
      focusFormFieldError(headerForm, 'dueReminderDate', 'Select a due reminder date')
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
        lines: lines.map((l) => {
          const pricing = lineApiPricing(l)
          return l.lineType === 'product'
            ? {
                lineType: 'product',
                productItemId: l.productItemId,
                quantity: 1,
                ...pricing,
                warrantyActive: l.warrantyActive,
                warrantyYears: l.warrantyYears,
                warrantyExpiryDate: l.warrantyExpiryDate
              }
            : {
                lineType: 'part',
                partId: l.partId,
                quantity: l.quantity,
                ...pricing
              }
        })
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
        <Form form={headerForm} layout="vertical" scrollToFirstError>
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
                dropdownRender={(menu) => (
                  <SelectQuickFooter
                    menu={menu}
                    addLabel="Add customer"
                    onAdd={openAddCustomer}
                    editLabel="Edit customer"
                    canEdit={Boolean(selectedCustomerId)}
                    onEdit={openEditCustomer}
                  />
                )}
              />
            </Form.Item>
            <Form.Item name="saleDate" label="Sale Date" rules={[{ required: true }]}>
              <DatePicker className="w-full" style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Card>

      <Card
        id="sale-line-form"
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
        <Form
          form={lineForm}
          layout="vertical"
          scrollToFirstError
          initialValues={{ taxPercent: 0, taxInclusive: true, whtPercent: 0, warrantyActive: false, quantity: 1 }}
        >
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
                <Form.Item
                  name="salePrice"
                  label="Sale Price"
                  rules={[{ required: true }]}
                  tooltip="Defaults to retail; you can charge more (or any amount)."
                >
                  <InputNumber className="w-full" min={0} style={{ width: '100%' }} />
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
                  label="Purchase price"
                  tooltip="FIFO cost per purchase batch. Profit uses these costs, not the sale price you enter."
                >
                  <Input
                    value={partFifoPreview ? formatFifoLayers(partFifoPreview.layers) : '—'}
                    disabled
                  />
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
                <Form.Item
                  name="salePrice"
                  label="Sale price"
                  rules={[{ required: true }]}
                  tooltip="Editable — charge any price; old stock can be sold at today's rate or a custom amount."
                >
                  <InputNumber className="w-full" min={0} style={{ width: '100%' }} />
                </Form.Item>
              </>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Form.Item
              label="Sales Tax %"
              tooltip="On: sale price already includes sales tax (tax is extracted from it). Off: tax is added on top of the sale price."
            >
              <Form.Item name="taxPercent" noStyle>
                <InputNumber
                  className="w-full"
                  min={0}
                  max={100}
                  addonAfter="%"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Form.Item>
            <Form.Item
              name="whtPercent"
              label="Tax u/s 236 G/H %"
              tooltip="Withholding tax under section 236 G/H"
            >
              <InputNumber className="w-full" min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="taxInclusive"
              label="Tax Inclusive"
              valuePropName="checked"
              tooltip="Applies to Sales Tax and Tax u/s 236 G/H"
            >
              <Switch />
            </Form.Item>
            {lineType === 'product' && (
              <>
                <Form.Item name="warrantyActive" label="Warranty Active" valuePropName="checked">
                  <Switch />
                </Form.Item>
                {warrantyActive && (
                  <Form.Item
                    name="warrantyYears"
                    label="Warranty (years)"
                    rules={[
                      { required: true, message: 'Enter warranty years' },
                      { type: 'number', min: 1, message: 'Must be at least 1 year' }
                    ]}
                    extra="Expiry is calculated from the sale date"
                  >
                    <InputNumber
                      className="w-full"
                      min={1}
                      step={1}
                      precision={0}
                      style={{ width: '100%' }}
                    />
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
          scroll={{ x: 'max-content' }}
          className="[&_.ant-table-cell]:!whitespace-nowrap"
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
            {
              title: 'Tax %',
              dataIndex: 'taxPercent',
              render: (v: number, r: SaleLine) =>
                r.taxInclusive && v > 0 ? `${v} (incl.)` : v
            },
            {
              title: 'Tax u/s 236 G/H %',
              dataIndex: 'whtPercent',
              render: (v: number, r: SaleLine) =>
                r.taxInclusive && v > 0 ? `${v} (incl.)` : v
            },
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
                    ? `${r.warrantyYears || '—'} yr${r.warrantyExpiryDate ? ` · ${r.warrantyExpiryDate}` : ''}`
                    : 'No'
                  : '—'
            },
            {
              title: '',
              width: 88,
              fixed: 'right' as const,
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
          scrollToFirstError
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
                  <span>Tax{anyTaxInclusive ? ' (incl.)' : ''}</span>
                  <span className="font-medium text-emerald-700">+ {formatRs(totalTax)}</span>
                </div>
                <div className="flex justify-between gap-6 text-slate-600">
                  <span>Tax u/s 236 G/H{anyTaxInclusive ? ' (incl.)' : ''}</span>
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

      <CustomerQuickModal
        open={customerQuickOpen}
        editing={customerQuickEditing}
        onCancel={() => {
          setCustomerQuickOpen(false)
          setCustomerQuickEditing(null)
        }}
        onSaved={handleCustomerQuickSaved}
      />
    </div>
  )
}

export default NewSale
