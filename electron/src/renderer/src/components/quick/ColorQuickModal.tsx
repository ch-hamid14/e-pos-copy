import { colorAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { NameEntityFormModal, type NameEntityRecord } from '../forms/NameEntityFormModal'

export type ColorQuickRecord = NameEntityRecord

type Props = {
  open: boolean
  onCancel: () => void
  onSaved: (color: NameEntityRecord) => void
}

export function ColorQuickModal({ open, onCancel, onSaved }: Props) {
  const { companyId, audit } = useSession()
  if (!companyId) return null

  return (
    <NameEntityFormModal
      entityLabel="Color"
      open={open}
      onCancel={onCancel}
      onSaved={onSaved}
      onCreate={(name) => colorAPI.create(companyId, audit(), { name })}
    />
  )
}
