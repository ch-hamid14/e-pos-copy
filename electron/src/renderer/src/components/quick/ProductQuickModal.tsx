import { ProductFormModal, type ProductRecord } from '../forms/ProductFormModal'

export type ProductQuickRecord = ProductRecord

type Props = {
  open: boolean
  onCancel: () => void
  onSaved: (product: ProductRecord) => void
}

/** Purchase quick-add: create-only with category quick-add enabled. */
export function ProductQuickModal({ open, onCancel, onSaved }: Props) {
  return (
    <ProductFormModal
      open={open}
      onCancel={onCancel}
      onSaved={onSaved}
      allowQuickCategoryAdd
    />
  )
}
