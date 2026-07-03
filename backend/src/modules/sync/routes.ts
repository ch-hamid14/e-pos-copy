import { Router, type Response } from 'express'
import type { Knex } from 'knex'
import type { Change } from '@madix/sync'
import { requireAuth, type AuthRequest } from '../../middleware/auth'
import { getCompanyDb } from '../../db'
import { getSyncAuthority } from './authority'
import { bootstrapCompanySync } from './bootstrap'

export function syncRouter(controlDb: Knex): Router {
  const router = Router()
  router.use(requireAuth)

  router.post('/handshake', async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.auth?.companyId
      if (!companyId) {
        return res.status(403).json({ error: 'Sync requires a company context' })
      }

      const companyDb = await getCompanyDb(companyId)
      const authority = getSyncAuthority(companyId, companyDb)
      const clientId = req.body?.clientId as string | undefined
      if (!clientId) {
        return res.status(400).json({ error: 'clientId is required' })
      }
      const result = await authority.handleHandshake({ clientId })
      res.json(result)
    } catch (err) {
      console.error('sync handshake error:', err)
      res.status(500).json({ error: err instanceof Error ? err.message : 'Handshake failed' })
    }
  })

  router.post('/push', async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.auth?.companyId
      if (!companyId) {
        return res.status(403).json({ error: 'Sync requires a company context' })
      }

      const { clientId, changes } = req.body as { clientId?: string; changes?: Change[] }
      if (!clientId) {
        return res.status(400).json({ error: 'clientId is required' })
      }

      const companyDb = await getCompanyDb(companyId)
      const authority = getSyncAuthority(companyId, companyDb)
      const result = await authority.handlePush({ clientId, changes: changes || [] })

      if (changes?.length && req.auth?.deviceId) {
        await controlDb('devices')
          .where({ client_device_id: req.auth.deviceId })
          .update({ last_sync_at: new Date(), updated_at: new Date() })
      }

      res.json(result)
    } catch (err) {
      console.error('sync push error:', err)
      res.status(500).json({ error: err instanceof Error ? err.message : 'Push failed' })
    }
  })

  router.post('/pull', async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.auth?.companyId
      if (!companyId) {
        return res.status(403).json({ error: 'Sync requires a company context' })
      }

      const { clientId, since, limit } = req.body as {
        clientId?: string
        since?: number
        limit?: number
      }
      if (!clientId) {
        return res.status(400).json({ error: 'clientId is required' })
      }

      const companyDb = await getCompanyDb(companyId)
      const authority = getSyncAuthority(companyId, companyDb)
      const result = await authority.handlePull({
        clientId,
        since: since ?? 0,
        limit
      })

      // const queueDepth = await companyDb('sync_queue')
      //   .whereIn('table', ['sales', 'purchases', 'sale_lines'])
      //   .count('* as count')
      //   .first()
      // const salesInQueue = await companyDb('sync_queue')
      //   .where({ table: 'sales' })
      //   .count('* as count')
      //   .first()
      // const purchasesInQueue = await companyDb('sync_queue')
      //   .where({ table: 'purchases' })
      //   .count('* as count')
      //   .first()

      // console.log('[sync:api:pull] server queue snapshot', {
      //   clientId,
      //   since: since ?? 0,
      //   returned: result.changes?.length ?? 0,
      //   salesInQueue: Number(salesInQueue?.count ?? 0),
      //   purchasesInQueue: Number(purchasesInQueue?.count ?? 0),
      //   salesPurchasesInQueue: Number(queueDepth?.count ?? 0)
      // })

      res.json(result)
    } catch (err) {
      console.error('sync pull error:', err)
      res.status(500).json({ error: err instanceof Error ? err.message : 'Pull failed' })
    }
  })

  router.post('/bootstrap', async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.auth?.companyId
      if (!companyId) {
        return res.status(403).json({ error: 'Sync requires a company context' })
      }

      const companyDb = await getCompanyDb(companyId)
      const result = await bootstrapCompanySync(companyId, companyDb)
      res.json({ bootstrapped: result })
    } catch (err) {
      console.error('sync bootstrap error:', err)
      res.status(500).json({ error: err instanceof Error ? err.message : 'Bootstrap failed' })
    }
  })

  router.get('/health', async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.auth?.companyId
      if (!companyId) {
        return res.status(403).json({ error: 'Sync requires a company context' })
      }

      const companyDb = await getCompanyDb(companyId)
      const authority = getSyncAuthority(companyId, companyDb)
      await authority.setup()

      const queueDepth = await companyDb('sync_queue').count('* as count').first()
      const conflictCount = await companyDb('sync_conflict').count('* as count').first()
      const device = req.auth?.deviceId
        ? await controlDb('devices').where({ client_device_id: req.auth.deviceId }).first()
        : null

      res.json({
        queueDepth: Number(queueDepth?.count ?? 0),
        conflictCount: Number(conflictCount?.count ?? 0),
        lastSyncAt: device?.last_sync_at ?? null
      })
    } catch (err) {
      console.error('sync health error:', err)
      res.status(500).json({ error: err instanceof Error ? err.message : 'Health check failed' })
    }
  })

  return router
}
