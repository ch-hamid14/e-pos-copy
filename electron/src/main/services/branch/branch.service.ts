import { getDb } from '../../db'
import { asJsonList } from '../shared/json.helpers'

class BranchService {
  async list(companyId: string): Promise<unknown[]> {
    const rows = await getDb()('branches')
      .where({ company_id: companyId, is_active: true })
      .whereNull('deleted_at')
      .orderBy('name', 'asc')
    return asJsonList(rows)
  }
}

export const branchService = new BranchService()
