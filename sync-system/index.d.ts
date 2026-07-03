export type SyncConfig = {
  schema?: string
  tables?: string[]
  order?: string[]
  idColumn?: string
  pushLimit?: number
  pullLimit?: number
  nodeId?: string
}

export type Change = {
  id: string
  sno: number
  table: string
  event: 'insert' | 'update' | 'delete'
  entity_id: string
  payload: Record<string, unknown>
  hlc: string
  origin_client_id: string
}

export type SyncTransport = {
  handshake: (req: { clientId?: string }) => Promise<{ clientId: string; serverHlc: string }>
  push: (req: { clientId: string; changes: Change[] }) => Promise<{
    acked: string[]
    conflicts: Array<{
      id: string
      table: string
      entity_id: string
      winner: string
      current: Record<string, unknown>
    }>
  }>
  pull: (req: { clientId: string; since: number; limit?: number }) => Promise<{
    changes: Change[]
    nextSince: number
  }>
}

export type SyncClient = {
  setup: () => Promise<{ clientId: string }>
  bootstrap: () => Promise<Record<string, number>>
  push: () => Promise<{ pushed: number; conflicts: unknown[] }>
  pull: () => Promise<{ applied: number }>
  sync: () => Promise<{ pushed: { pushed: number; conflicts: unknown[] }; pulled: { applied: number } }>
  getState: () => Promise<Record<string, unknown> | undefined>
}

export type SyncAuthority = {
  setup: () => Promise<unknown>
  bootstrap: () => Promise<Record<string, number>>
  handleHandshake: (req: { clientId?: string }) => Promise<{ clientId: string; serverHlc: string }>
  handlePush: (req: { clientId: string; changes: Change[] }) => Promise<{
    acked: string[]
    conflicts: unknown[]
  }>
  handlePull: (req: { clientId: string; since?: number; limit?: number }) => Promise<{
    changes: Change[]
    nextSince: number
  }>
}

export function createClient(opts: {
  db: unknown
  transport: SyncTransport
  config?: SyncConfig
}): SyncClient

export function createAuthority(opts: { db: unknown; config?: SyncConfig }): SyncAuthority

export function fetchTransport(
  baseUrl: string,
  opts?: {
    fetch?: typeof fetch
    headers?: Record<string, string> | (() => Promise<Record<string, string>>)
  }
): SyncTransport
