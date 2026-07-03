import { IRequest } from '../../../common'
import { parseAuditFromBody, parseAuditFromQuery } from '../../services/shared/audit.helpers'

export { parseAuditFromBody, parseAuditFromQuery }

export function auditFromRequest(req: IRequest) {
  return parseAuditFromBody(req.body as Record<string, unknown>)
}

export function auditFromListQuery(req: IRequest) {
  return parseAuditFromQuery(req.query as Record<string, unknown>)
}
