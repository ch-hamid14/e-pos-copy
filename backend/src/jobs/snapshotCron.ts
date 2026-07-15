import type { Knex } from 'knex'
import { runScheduledCompanySnapshots } from '../modules/admin/platform'

/** Runs once per calendar day at SNAPSHOT_CRON_HOUR (local server time, default 02:00). */
export function startSnapshotCron(controlDb: Knex) {
  const hour = Number(process.env.SNAPSHOT_CRON_HOUR ?? 2)
  let lastRunDay: string | null = null

  const tick = async () => {
    const now = new Date()
    const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    if (now.getHours() !== hour) return
    if (lastRunDay === dayKey) return
    lastRunDay = dayKey
    console.log(`[snapshot-cron] Starting scheduled snapshots for ${dayKey}`)
    try {
      const result = await runScheduledCompanySnapshots(controlDb)
      console.log(
        `[snapshot-cron] Done: ${result.succeeded}/${result.total} succeeded, ${result.failed} failed`
      )
    } catch (err) {
      console.error('[snapshot-cron] Failed:', err)
      lastRunDay = null
    }
  }

  // Check every 15 minutes
  const intervalMs = 15 * 60 * 1000
  void tick()
  return setInterval(() => {
    void tick()
  }, intervalMs)
}
