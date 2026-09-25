import { Router } from 'express'
import { listar } from '../controllers/historicoController.js'
import { exigirAdministrador } from '../middlewares/auth.js'

export const historicoRouter = Router()

historicoRouter.get('/', exigirAdministrador, listar)
