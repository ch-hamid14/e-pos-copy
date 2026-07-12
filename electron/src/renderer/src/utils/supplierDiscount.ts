export type SupplierDiscountType = 'pkr' | 'percent'

export const SUPPLIER_DISCOUNT_TYPE_OPTIONS = [
  { value: 'pkr' as const, label: 'PKR' },
  { value: 'percent' as const, label: '%' }
]

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function applySupplierDiscount(
  listPrice: number,
  discount: number,
  type: SupplierDiscountType = 'pkr'
): number {
  const value = Number(discount || 0)
  if (value <= 0) return round2(listPrice)

  if (type === 'percent') {
    return round2(listPrice * (1 - value / 100))
  }

  return round2(Math.max(0, listPrice - value))
}

export function formatSupplierDiscount(
  discount: number,
  type: SupplierDiscountType = 'pkr'
): string {
  const value = Number(discount || 0)
  if (value <= 0) return '—'
  return type === 'percent' ? `${value}%` : `Rs ${value.toLocaleString()}`
}
