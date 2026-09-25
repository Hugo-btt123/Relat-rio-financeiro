import { Router } from 'express'
import { obterMetricas } from '../controllers/dashboardController.js'
import { exigirAdministrador } from '../middlewares/auth.js'

export const dashboardRouter = Router()

dashboardRouter.get('/', exigirAdministrador, obterMetricas)
