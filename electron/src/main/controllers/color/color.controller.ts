import { colorService } from '../../services'
import { createMasterDataController } from '../setup/master-data.controller'

export const colorController = createMasterDataController(colorService)
