import { categoryService } from '../../services'
import { createMasterDataController } from '../setup/master-data.controller'

const base = createMasterDataController(categoryService)

export const categoryController = {
  list: base.list,
  create: base.create,
  update: base.update,
  remove: base.remove
}
