import { createClient, fetchTransport } from '@madix/sync'
import { SYNC_TABLES } from '@madix/database'
import type { SyncClient } from '@madix/sync'
import { API_BASE_URL } from '../../../common/constants/config'
import { getDb, isDatabaseReady } from '../../db'
import { getSyncNodeId } from '../device'
import { checkServerOnline } from '../http'

const SYNC_INTERVAL_MS = 15_000

const SYNC_CONFIG = {
  tables: [...SYNC_TABLES],
  pushLimit: 1000,
  pullLimit: 500
}

export type SyncStatus = {
  running: boolean
  online: boolean
  lastSyncAt: string | null
  lastError: string | null
  lastPushed: number
  lastPulled: number
  pendingPush: number
}

class SyncService {
  private client: SyncClient | null = null
  private token: string | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private syncing = false
  private starting: Promise<void> | null = null
  private status: SyncStatus = {
    running: false,
    online: false,
    lastSyncAt: null,
    lastError: null,
    lastPushed: 0,
    lastPulled: 0,
    pendingPush: 0
  }

  configure(token: string): void {
    this.token = token
    this.client = createClient({
      db: getDb(),
      transport: fetchTransport(`${API_BASE_URL}/sync`, {
        headers: async () => ({
          Authorization: `Bearer ${this.token}`
        })
      }),
      config: {
        ...SYNC_CONFIG,
        nodeId: getSyncNodeId()
      }
    })
  }

  async setup(): Promise<void> {
    if (!this.client) return
    await this.client.setup()
    await this.refreshPendingCount()
  }

  /** Enqueue pre-existing local rows (idempotent). Use when the POS had offline data before sync. */
  async bootstrap(): Promise<Record<string, number>> {
    if (!this.client) return {}
    return this.client.bootstrap()
  }

  start(): void {
    if (this.intervalId) return
    this.status.running = true
    void this.runSync()
    this.intervalId = setInterval(() => void this.runSync(), SYNC_INTERVAL_MS)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.client = null
    this.token = null
    this.status.running = false
  }

  /** Start or resume sync once per token; concurrent callers share the same in-flight start. */
  async startAfterAuth(token: string): Promise<void> {
    if (!isDatabaseReady()) {
      console.warn('Skipping sync start: local database migrations are not ready')
      return
    }

    while (this.starting) {
      await this.starting
      if (this.intervalId && this.token === token) return
    }

    if (this.intervalId && this.token === token) return

    if (this.intervalId) this.stop()

    const startPromise = this.doStart(token)
    this.starting = startPromise
    try {
      await startPromise
    } finally {
      if (this.starting === startPromise) this.starting = null
    }
  }

  private async doStart(token: string): Promise<void> {
    this.configure(token)
    await this.setup()
    if (this.token !== token) return
    this.start()
    if (this.token !== token) return
    await this.syncNow()
  }

  async syncNow(): Promise<SyncStatus> {
    await this.runSync()
    return this.getStatus()
  }

  getStatus(): SyncStatus {
    return { ...this.status }
  }

  isRunning(): boolean {
    return Boolean(this.intervalId)
  }

  private async refreshPendingCount(): Promise<void> {
    try {
      const state = await this.client?.getState()
      const since = Number(state?.last_pushed_sno) || 0
      const row = await getDb()('sync_queue').where('sno', '>', since).count('* as count').first()
      this.status.pendingPush = Number(row?.count ?? 0)
    } catch {
      this.status.pendingPush = 0
    }
  }

  private async runSync(): Promise<void> {
    if (!this.client || !this.token || this.syncing) return

    const online = await checkServerOnline()
    this.status.online = online
    if (!online) return

    this.syncing = true
    try {
      const result = await this.client.sync()
      this.status.lastPushed = result.pushed.pushed
      this.status.lastPulled = result.pulled.applied
      this.status.lastSyncAt = new Date().toISOString()
      this.status.lastError = null
      await this.refreshPendingCount()

      // const db = getDb()
      // const syncState = await this.client.getState()
      // const [sales, purchases, saleLines, queueSales, queuePurchases] = await Promise.all([
      //   db('sales').count('* as count').first(),
      //   db('purchases').count('* as count').first(),
      //   db('sale_lines').count('* as count').first(),
      //   db('sync_queue').where({ table: 'sales' }).count('* as count').first(),
      //   db('sync_queue').where({ table: 'purchases' }).count('* as count').first()
      // ])

      // console.log('[sync:electron] cycle complete', {
      //   pushed: result.pushed,
      //   pulled: result.pulled,
      //   syncState: {
      //     last_pushed_sno: syncState?.last_pushed_sno,
      //     last_pulled_sno: syncState?.last_pulled_sno,
      //     client_id: syncState?.client_id
      //   },
      //   localCounts: {
      //     sales: Number(sales?.count ?? 0),
      //     purchases: Number(purchases?.count ?? 0),
      //     sale_lines: Number(saleLines?.count ?? 0)
      //   },
      //   localSyncQueue: {
      //     sales: Number(queueSales?.count ?? 0),
      //     purchases: Number(queuePurchases?.count ?? 0)
      //   }
      // })
    } catch (err) {
      this.status.lastError = err instanceof Error ? err.message : 'Sync failed'
      console.error('[sync:electron] cycle error:', err)
    } finally {
      this.syncing = false
    }
  }
}

export const syncService = new SyncService()

export async function startSyncAfterAuth(token: string): Promise<void> {
  await syncService.startAfterAuth(token)
}

export async function stopSync(): Promise<void> {
  syncService.stop()
}
