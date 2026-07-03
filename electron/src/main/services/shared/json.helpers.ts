import { rowToCamel, rowsToCamel } from '@madix/database'

export function asJson(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null
  return rowToCamel(row)
}

export function asJsonList(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rowsToCamel(rows)
}

/** Maps joined product_items row (product_name, category_name, color_name, supplier_name) to nested relations. */
export function asProductItemJson(row: Record<string, unknown>): Record<string, unknown> {
  const json = asJson(row)!
  const productName = row.product_name as string | undefined
  const categoryName = row.category_name as string | undefined
  const colorName = row.color_name as string | undefined
  const supplierName = row.supplier_name as string | undefined
  return {
    ...json,
    product: productName ? { name: productName } : null,
    category: categoryName ? { name: categoryName } : null,
    color: colorName ? { name: colorName } : null,
    purchase: supplierName ? { supplier: { name: supplierName } } : null
  }
}
