import { categoryAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { SetupCrudPage } from './SetupCrud'

export const Categories = () => {
  const { companyId } = useSession()
  return (
    <SetupCrudPage
      title="Categories"
      subtitle="Product category types for your catalog."
      companyId={companyId}
      api={categoryAPI}
      searchPlaceholder="Search category…"
    />
  )
}

export default Categories
