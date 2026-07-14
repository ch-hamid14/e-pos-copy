import type { Knex } from 'knex'
import { randomUUID } from 'crypto'
import type { AuthRequest } from '../../middleware/auth'

export async function writeAudit(
  controlDb: Knex,
  req: AuthRequest | null,
  input: {
    action: string
    resource?: string
    companyId?: string | null
    detail?: Record<string, unknown>
  }
): Promise<void> {
  await controlDb('admin_audit_log').insert({
    id: randomUUID(),
    actor_user_id: req?.auth?.userId ?? null,
    actor_email: req?.auth?.email ?? null,
    company_id: input.companyId ?? null,
    action: input.action,
    resource: input.resource ?? null,
    detail: input.detail ? JSON.stringify(input.detail) : null,
    created_at: new Date()
  })
}

export async function listAuditLogs(
  controlDb: Knex,
  opts: { companyId?: string; limit?: number } = {}
) {
  const limit = Math.min(opts.limit ?? 100, 500)
  let q = controlDb('admin_audit_log').orderBy('created_at', 'desc').limit(limit)
  if (opts.companyId) q = q.where({ company_id: opts.companyId })
  const rows = await q
  return rows.map((r) => ({
    id: r.id,
    actorUserId: r.actor_user_id,
    actorEmail: r.actor_email,
    companyId: r.company_id,
    action: r.action,
    resource: r.resource,
    detail: typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail,
    createdAt: r.created_at
  }))
}
