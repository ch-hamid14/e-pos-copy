import { supplierService } from '../../services'
import { createMasterDataController } from '../setup/master-data.controller'

export const supplierController = createMasterDataController(supplierService)
