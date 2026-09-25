import { Router } from 'express'
import { authRouter } from './auth.js'
import { clientesRouter } from './clientes.js'
import { propriedadesRouter } from './propriedades.js'
import { debitosRouter } from './debitos.js'
import { notinhasRouter } from './notinhas.js'
import { pixPendentesRouter } from './pixPendentes.js'
import { dashboardRouter } from './dashboard.js'
import { historicoRouter } from './historico.js'
import { buscaRouter } from './busca.js'
import { backupRouter } from './backup.js'
import { exigirLogin } from '../middlewares/auth.js'

export const router = Router()

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

router.use('/auth', authRouter)

router.use(exigirLogin)

router.use('/clientes', clientesRouter)
router.use('/propriedades', propriedadesRouter)
router.use('/debitos', debitosRouter)
router.use('/notinhas', notinhasRouter)
router.use('/pix-pendentes', pixPendentesRouter)
router.use('/dashboard', dashboardRouter)
router.use('/historico', historicoRouter)
router.use('/busca', buscaRouter)
router.use('/backup', backupRouter)
