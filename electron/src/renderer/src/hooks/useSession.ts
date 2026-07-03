import { useSelector } from 'react-redux'
import { IRootState } from '../redux'
import { sessionAudit, type SessionAudit } from '../services/session-audit'

export function useSession() {
  const { user, deviceId, branchName, token } = useSelector((s: IRootState) => s.app)
  const companyId = user?.companyId || ''
  const branchId = user?.branchId || ''

  const audit = (): SessionAudit => sessionAudit(user, deviceId, branchId)

  return {
    user,
    deviceId,
    branchName,
    token,
    companyId,
    branchId,
    audit
  }
}
