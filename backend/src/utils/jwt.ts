import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'

dotenv.config()

const JWT_SECRET = process.env.JWT_SECRET || "";
const JWT_EXPIRES_IN = '24h'

export type JwtPayload = {
  userId: string
  email: string
  companyId: string | null
  branchId: string | null
  role: string
  permissions: string[]
  deviceId: string
  tokenExpiresAt?: string
  offlineAllowedUntil?: string
  impersonatorId?: string
  impersonatorEmail?: string
}

export function signToken(payload: JwtPayload, expiresIn: jwt.SignOptions['expiresIn'] = JWT_EXPIRES_IN): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}

export function verifyTokenAllowExpired(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as JwtPayload
}

export { JWT_SECRET, JWT_EXPIRES_IN }
