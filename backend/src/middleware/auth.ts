import type { Request, Response, NextFunction } from 'express'
import { verifyToken, type JwtPayload } from '../utils/jwt'

export type AuthRequest = Request & { auth?: JwtPayload }

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  try {
    req.auth = verifyToken(header.slice(7))
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
