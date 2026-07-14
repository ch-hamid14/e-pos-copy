import { Router } from 'express'
import type { Knex } from 'knex'
import { requireAuth, type AuthRequest } from '../../middleware/auth'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin'
import {
  getOverview,
  listCompanies,
  createCompany,
  getCompanyDetail,
  updateCompany,
  createBranch,
  createCompanyUser,
  updateCompanyUser,
  createCompanyRole,
  updateCompanyRoleInDb,
  listPermissions
} from './service'
import {
  getCompanyOps,
  migrateCompany,
  migrateAllCompanies,
  reseedCompanyPermissions,
  bootstrapSyncForCompany,
  unbindCompanyDevice,
  deleteCompany
} from './ops'
import { writeAudit, listAuditLogs } from './audit'
import {
  listDataTables,
  browseTable,
  getTableRow,
  updateTableRow,
  softDeleteRow,
  restoreRow,
  hardDeleteRow
} from './data'
import {
  listConflicts,
  getConflictDetail,
  dismissConflict,
  dismissConflicts,
  applyConflictLoser,
  applyConflictLosers,
  listSyncQueue,
  deleteSyncQueueItem,
  clearSyncQueue
} from './syncOps'
import {
  updateCompanyPlatformSettings,
  unbindAllDevices,
  resetUserPassword,
  impersonateCompanyUser,
  createCompanySnapshot,
  listCompanySnapshots,
  restoreCompanySnapshot,
  cloneCompany
} from './platform'
import { getCompanyDb } from '../../db'

export function adminRouter(db: Knex): Router {
  const router = Router()
  router.use(requireAuth, requireSuperAdmin)

  const actor = (req: AuthRequest) => ({
    userId: req.auth!.userId,
    email: req.auth!.email
  })

  router.get('/overview', async (_req, res) => {
    try {
      res.json(await getOverview(db))
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/audit', async (req, res) => {
    try {
      res.json(
        await listAuditLogs(db, {
          companyId: req.query.companyId as string | undefined,
          limit: req.query.limit ? Number(req.query.limit) : 100
        })
      )
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/companies', async (_req, res) => {
    try {
      res.json(await listCompanies(db))
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/companies', async (req: AuthRequest, res) => {
    try {
      const result = await createCompany(db, req.body)
      await writeAudit(db, req, {
        action: 'company.create',
        resource: 'company',
        companyId: String(result.company.id),
        detail: { name: result.company.name }
      })
      res.status(201).json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/migrate-all', async (req: AuthRequest, res) => {
    try {
      const result = await migrateAllCompanies(db)
      await writeAudit(db, req, { action: 'company.migrate_all', resource: 'companies', detail: result })
      res.json(result)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/companies/:id', async (req, res) => {
    try {
      const detail = await getCompanyDetail(db, req.params.id)
      if (!detail) return res.status(404).json({ error: 'Company not found' })
      res.json(detail)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/companies/:id/ops', async (req, res) => {
    try {
      res.json(await getCompanyOps(db, req.params.id))
    } catch (err: any) {
      const status = err.message === 'Company not found' ? 404 : 500
      res.status(status).json({ error: err.message })
    }
  })

  router.patch('/companies/:id/settings', async (req: AuthRequest, res) => {
    try {
      const company = await updateCompanyPlatformSettings(db, req.params.id, req.body)
      await writeAudit(db, req, {
        action: 'company.settings',
        resource: 'company',
        companyId: req.params.id,
        detail: req.body
      })
      res.json(company)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/migrate', async (req: AuthRequest, res) => {
    try {
      const result = await migrateCompany(db, req.params.id)
      await writeAudit(db, req, {
        action: 'company.migrate',
        resource: 'company',
        companyId: req.params.id,
        detail: { applied: result.applied }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/reseed-permissions', async (req: AuthRequest, res) => {
    try {
      const result = await reseedCompanyPermissions(db, req.params.id)
      await writeAudit(db, req, {
        action: 'company.reseed_permissions',
        resource: 'company',
        companyId: req.params.id,
        detail: result
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/bootstrap-sync', async (req: AuthRequest, res) => {
    try {
      const result = await bootstrapSyncForCompany(db, req.params.id)
      await writeAudit(db, req, {
        action: 'company.bootstrap_sync',
        resource: 'company',
        companyId: req.params.id,
        detail: result
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/unbind-all-devices', async (req: AuthRequest, res) => {
    try {
      const result = await unbindAllDevices(db, req.params.id)
      await writeAudit(db, req, {
        action: 'company.unbind_all_devices',
        resource: 'devices',
        companyId: req.params.id
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/impersonate', async (req: AuthRequest, res) => {
    try {
      const { userId } = req.body as { userId?: string }
      if (!userId) return res.status(400).json({ error: 'userId is required' })
      const result = await impersonateCompanyUser(db, req.params.id, userId, actor(req))
      await writeAudit(db, req, {
        action: 'company.impersonate',
        resource: 'user',
        companyId: req.params.id,
        detail: { userId }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/users/:userId/reset-password', async (req: AuthRequest, res) => {
    try {
      const result = await resetUserPassword(
        db,
        req.params.id,
        req.params.userId,
        String(req.body?.password || '')
      )
      await writeAudit(db, req, {
        action: 'user.reset_password',
        resource: 'user',
        companyId: req.params.id,
        detail: { userId: req.params.userId }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/clone', async (req: AuthRequest, res) => {
    try {
      const company = await cloneCompany(db, req.params.id, req.body?.name)
      await writeAudit(db, req, {
        action: 'company.clone',
        resource: 'company',
        companyId: company.id as string,
        detail: { sourceId: req.params.id, name: company.name }
      })
      res.status(201).json(company)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.get('/companies/:id/snapshots', async (req, res) => {
    try {
      res.json(await listCompanySnapshots(db, req.params.id))
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/snapshots', async (req: AuthRequest, res) => {
    try {
      const snap = await createCompanySnapshot(db, req.params.id)
      await writeAudit(db, req, {
        action: 'company.snapshot',
        resource: 'database',
        companyId: req.params.id,
        detail: snap
      })
      res.status(201).json(snap)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/snapshots/restore', async (req: AuthRequest, res) => {
    try {
      const filename = String(req.body?.filename || '')
      const result = await restoreCompanySnapshot(db, req.params.id, filename)
      await writeAudit(db, req, {
        action: 'company.restore',
        resource: 'database',
        companyId: req.params.id,
        detail: { filename }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  // Sync / conflicts
  router.get('/companies/:id/conflicts', async (req, res) => {
    try {
      res.json(
        await listConflicts(req.params.id, {
          page: Number(req.query.page) || 1,
          pageSize: Number(req.query.pageSize) || 25
        })
      )
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.get('/companies/:id/conflicts/:conflictId', async (req, res) => {
    try {
      res.json(await getConflictDetail(req.params.id, req.params.conflictId))
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/conflicts/:conflictId/dismiss', async (req: AuthRequest, res) => {
    try {
      const result = await dismissConflict(req.params.id, req.params.conflictId)
      await writeAudit(db, req, {
        action: 'sync.conflict_dismiss',
        resource: 'sync_conflict',
        companyId: req.params.id,
        detail: { conflictId: req.params.conflictId }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/conflicts/:conflictId/apply-loser', async (req: AuthRequest, res) => {
    try {
      const result = await applyConflictLoser(req.params.id, req.params.conflictId)
      await writeAudit(db, req, {
        action: 'sync.conflict_apply_loser',
        resource: 'sync_conflict',
        companyId: req.params.id,
        detail: { conflictId: req.params.conflictId }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/conflicts/bulk-dismiss', async (req: AuthRequest, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : undefined
      const result = await dismissConflicts(req.params.id, ids)
      await writeAudit(db, req, {
        action: 'sync.conflict_bulk_dismiss',
        resource: 'sync_conflict',
        companyId: req.params.id,
        detail: { ids: ids ?? 'all', ...result }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/conflicts/bulk-apply-loser', async (req: AuthRequest, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : []
      if (!ids.length) return res.status(400).json({ error: 'ids array is required' })
      const result = await applyConflictLosers(req.params.id, ids)
      await writeAudit(db, req, {
        action: 'sync.conflict_bulk_apply_loser',
        resource: 'sync_conflict',
        companyId: req.params.id,
        detail: result
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.get('/companies/:id/sync-queue', async (req, res) => {
    try {
      res.json(
        await listSyncQueue(req.params.id, {
          page: Number(req.query.page) || 1,
          pageSize: Number(req.query.pageSize) || 25
        })
      )
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.delete('/companies/:id/sync-queue/:itemId', async (req: AuthRequest, res) => {
    try {
      const result = await deleteSyncQueueItem(req.params.id, req.params.itemId)
      await writeAudit(db, req, {
        action: 'sync.queue_delete_item',
        resource: 'sync_queue',
        companyId: req.params.id,
        detail: { itemId: req.params.itemId }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.delete('/companies/:id/sync-queue', async (req: AuthRequest, res) => {
    try {
      const result = await clearSyncQueue(req.params.id)
      await writeAudit(db, req, {
        action: 'sync.queue_clear',
        resource: 'sync_queue',
        companyId: req.params.id,
        detail: result
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  // Data viewer
  router.get('/data-tables', (_req, res) => {
    res.json(listDataTables())
  })

  router.get('/companies/:id/data/:table', async (req, res) => {
    try {
      res.json(
        await browseTable(req.params.id, req.params.table, {
          page: Number(req.query.page) || 1,
          pageSize: Number(req.query.pageSize) || 25,
          search: (req.query.search as string) || undefined,
          includeDeleted: req.query.includeDeleted === '1'
        })
      )
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.get('/companies/:id/data/:table/:rowId', async (req, res) => {
    try {
      res.json(await getTableRow(req.params.id, req.params.table, req.params.rowId))
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.patch('/companies/:id/data/:table/:rowId', async (req: AuthRequest, res) => {
    try {
      const result = await updateTableRow(req.params.id, req.params.table, req.params.rowId, req.body)
      await writeAudit(db, req, {
        action: 'data.update',
        resource: req.params.table,
        companyId: req.params.id,
        detail: { rowId: req.params.rowId, keys: Object.keys(req.body || {}) }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/data/:table/:rowId/soft-delete', async (req: AuthRequest, res) => {
    try {
      const result = await softDeleteRow(req.params.id, req.params.table, req.params.rowId)
      await writeAudit(db, req, {
        action: 'data.soft_delete',
        resource: req.params.table,
        companyId: req.params.id,
        detail: { rowId: req.params.rowId }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/data/:table/:rowId/restore', async (req: AuthRequest, res) => {
    try {
      const result = await restoreRow(req.params.id, req.params.table, req.params.rowId)
      await writeAudit(db, req, {
        action: 'data.restore',
        resource: req.params.table,
        companyId: req.params.id,
        detail: { rowId: req.params.rowId }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.delete('/companies/:id/data/:table/:rowId', async (req: AuthRequest, res) => {
    try {
      const result = await hardDeleteRow(req.params.id, req.params.table, req.params.rowId)
      await writeAudit(db, req, {
        action: 'data.hard_delete',
        resource: req.params.table,
        companyId: req.params.id,
        detail: { rowId: req.params.rowId }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.delete('/companies/:id/devices/:deviceId', async (req: AuthRequest, res) => {
    try {
      const result = await unbindCompanyDevice(db, req.params.id, req.params.deviceId)
      await writeAudit(db, req, {
        action: 'device.unbind',
        resource: 'device',
        companyId: req.params.id,
        detail: { deviceId: req.params.deviceId }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.delete('/companies/:id', async (req: AuthRequest, res) => {
    try {
      const confirmName = String(req.body?.confirmName || '')
      const result = await deleteCompany(db, req.params.id, confirmName)
      await writeAudit(db, req, {
        action: 'company.delete',
        resource: 'company',
        companyId: req.params.id,
        detail: { confirmName }
      })
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.patch('/companies/:id', async (req: AuthRequest, res) => {
    try {
      const company = await updateCompany(db, req.params.id, req.body)
      if (!company) return res.status(404).json({ error: 'Company not found' })
      await writeAudit(db, req, {
        action: 'company.update',
        resource: 'company',
        companyId: req.params.id,
        detail: req.body
      })
      res.json(company)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/branches', async (req, res) => {
    try {
      res.status(201).json(await createBranch(db, req.params.id, req.body))
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/users', async (req, res) => {
    try {
      res.status(201).json(await createCompanyUser(db, req.params.id, req.body))
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.patch('/users/:userId', async (req, res) => {
    try {
      const user = await updateCompanyUser(db, req.params.userId, req.body)
      if (!user) return res.status(404).json({ error: 'User not found' })
      res.json(user)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/roles', async (req, res) => {
    try {
      res.status(201).json(await createCompanyRole(db, req.params.id, req.body))
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.patch('/roles/:roleId', async (req, res) => {
    try {
      const { companyId } = req.body as { companyId?: string }
      if (!companyId) return res.status(400).json({ error: 'companyId is required' })
      const companyDb = await getCompanyDb(companyId, { forOps: true })
      const role = await updateCompanyRoleInDb(companyDb, req.params.roleId, req.body)
      if (!role) return res.status(404).json({ error: 'Role not found' })
      res.json(role)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.get('/permissions', async (_req, res) => {
    try {
      res.json(await listPermissions(db))
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
