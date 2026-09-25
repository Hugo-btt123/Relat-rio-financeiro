import { Router } from 'express'
import { authRouter } from './auth.js'
import { clientesRouter } from './clientes.js'
import { propriedadesRouter } from './propriedades.js'
import { debitosRouter } from './debitos.js'
import { notinhasRouter } from './notinhas.js'
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
