import type { IUser } from '@/common'

export type SessionAudit = {
  userId: string
  deviceId: string
  role: string
  branchId: string
}

export function sessionAudit(
  user: IUser | null | undefined,
  deviceId: string | null | undefined,
  branchId: string
): SessionAudit {
  if (!user?.id || !deviceId) {
    throw new Error('You must be logged in to perform this action')
  }
  return {
    userId: user.id,
    deviceId,
    role: user.role,
    branchId
  }
}

export function auditQuery(audit: SessionAudit): Record<string, string> {
  return {
    userId: audit.userId,
    deviceId: audit.deviceId,
    role: audit.role,
    branchId: audit.branchId
  }
}

export function auditBody<T extends Record<string, unknown>>(
  audit: SessionAudit,
  body: T
): T & SessionAudit {
  return { ...body, ...audit }
}
