import { Router } from 'express'
import type { Knex } from 'knex'
import { requireAuth } from '../../middleware/auth'
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
import { getCompanyDb } from '../../db'

export function adminRouter(db: Knex): Router {
  const router = Router()
  router.use(requireAuth, requireSuperAdmin)

  router.get('/overview', async (_req, res) => {
    try {
      res.json(await getOverview(db))
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

  router.post('/companies', async (req, res) => {
    try {
      res.status(201).json(await createCompany(db, req.body))
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/migrate-all', async (_req, res) => {
    try {
      res.json(await migrateAllCompanies(db))
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

  router.post('/companies/:id/migrate', async (req, res) => {
    try {
      res.json(await migrateCompany(db, req.params.id))
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/reseed-permissions', async (req, res) => {
    try {
      res.json(await reseedCompanyPermissions(db, req.params.id))
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/companies/:id/bootstrap-sync', async (req, res) => {
    try {
      res.json(await bootstrapSyncForCompany(db, req.params.id))
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.delete('/companies/:id/devices/:deviceId', async (req, res) => {
    try {
      res.json(await unbindCompanyDevice(db, req.params.id, req.params.deviceId))
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.delete('/companies/:id', async (req, res) => {
    try {
      const confirmName = String(req.body?.confirmName || '')
      res.json(await deleteCompany(db, req.params.id, confirmName))
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.patch('/companies/:id', async (req, res) => {
    try {
      const company = await updateCompany(db, req.params.id, req.body)
      if (!company) return res.status(404).json({ error: 'Company not found' })
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
