import { Router } from 'express'
import * as backupController from '../controllers/backupController.js'
import { exigirAdministrador } from '../middlewares/auth.js'

export const backupRouter = Router()

backupRouter.get('/exportar-detalhado', backupController.exportarDetalhado)
backupRouter.get('/exportar', backupController.exportarCompleto)
backupRouter.post('/restaurar', exigirAdministrador, backupController.restaurarCompleto)
