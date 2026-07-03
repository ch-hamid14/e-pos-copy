import type { Response, NextFunction } from 'express'
import type { AuthRequest } from './auth'

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'super_admin') {
    res.status(403).json({ error: 'Super admin access required' })
    return
  }
  next()
}
