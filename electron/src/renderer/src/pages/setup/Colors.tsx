import { colorAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { SetupCrudPage } from './SetupCrud'

export const Colors = () => {
  const { companyId } = useSession()
  return (
    <SetupCrudPage
      title="Colors"
      subtitle="Bike color options used when receiving stock."
      companyId={companyId}
      api={colorAPI}
      searchPlaceholder="Search color…"
    />
  )
}

export default Colors
