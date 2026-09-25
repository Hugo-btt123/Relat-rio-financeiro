import { Router } from 'express'
import { listarPixPendentes } from '../controllers/debitoController.js'
import { exigirAdministrador } from '../middlewares/auth.js'

export const pixPendentesRouter = Router()

pixPendentesRouter.get('/', exigirAdministrador, listarPixPendentes)
